/**
 * Gemini function-calling loop. One request, up to six tool rounds, SSE-style
 * events emitted as text and tools complete. Numbers always come from tools.
 */
import type { RuntimeEnv } from './env';
import { GUEST_CUSTOMER_ID } from '../chat/guest';
import type {
  FunctionCallRequest,
  GenerateParams,
  GeminiFunctionDeclaration,
  RoundResult,
  StreamParams
} from './gemini';
import { generateGemini, isGeminiConfigured, streamGemini } from './gemini';
import { buildAllowlist, assertToolArgsAllowed } from './guard';
import { callTool as realCallTool, type McpSession, type ToolCallResult } from './mcp';
import { mockAgent } from './mockAgent';
import { buildSystemInstruction } from './prompts';
import { trimContents, type Content, type ContentPart, type Session } from './session';
import { summarizeToolResult, toFunctionDeclarations, toolLabel } from './toolBridge';
import type { Emit, ProviderFailureReason } from './events';

const BREAKER_MS = 5 * 60_000;

const PROVIDER_NOTICES: Readonly<Record<ProviderFailureReason, string>> = Object.freeze({
  credits:
    'Gemini credits are depleted. Answers will use deterministic narration grounded in your live Nessie data. Add credits in AI Studio to switch back.',
  auth: 'Gemini rejected the API key. Using deterministic narration.',
  rate_limit: 'Gemini is rate-limited. Using deterministic narration for now.',
  unavailable: 'Gemini is unavailable right now. Using deterministic narration.'
});

export type { FunctionCallRequest, RoundResult, StreamParams, GenerateParams };

export interface AgentDeps {
  stream: (params: StreamParams) => Promise<RoundResult>;
  generateOnce: (params: GenerateParams) => Promise<RoundResult>;
  callTool: (name: string, args: Record<string, unknown>) => Promise<ToolCallResult>;
  getDeclarations: () => Promise<GeminiFunctionDeclaration[]>;
  isConfigured: () => boolean;
  now: () => number;
}

export interface RunAgentInput {
  session: Session;
  message: string;
  emit: Emit;
  runtime: RuntimeEnv;
  mcp: McpSession;
  deps?: Partial<AgentDeps>;
}

const MAX_ROUNDS = 6;
const WALL_CLOCK_MS = 45_000;

interface AgentGlobal {
  __nessieAgentDeps?: Partial<AgentDeps>;
  __geminiDownUntil?: number;
  __geminiDownReason?: ProviderFailureReason;
}

const globalForAgent = globalThis as typeof globalThis & AgentGlobal;

export function setAgentDeps(deps: Partial<AgentDeps> | null): void {
  globalForAgent.__nessieAgentDeps = deps ?? undefined;
}

/** Test/demo hook: clear the in-process Gemini circuit breaker. */
export function resetGeminiBreaker(): void {
  globalForAgent.__geminiDownUntil = 0;
  globalForAgent.__geminiDownReason = undefined;
}

export function isGeminiBreakerOpen(now: number = Date.now()): boolean {
  return (globalForAgent.__geminiDownUntil ?? 0) > now;
}

/** Classify a provider failure without ever exposing the raw payload. */
export function classifyProviderFailure(error: unknown): ProviderFailureReason {
  const message = error instanceof Error ? error.message : String(error);
  const text = message.toLowerCase();
  if (/402|prepayment|credits?/.test(text)) return 'credits';
  if (/401|api key not valid|invalid/.test(text)) return 'auth';
  if (/429|quota|rate/.test(text)) return 'rate_limit';
  return 'unavailable';
}

/** Redact credentials from a string before it reaches server logs. */
export function redactSecrets(error: unknown): string {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  return message
    .replace(/AQ\.[A-Za-z0-9._-]+/g, '[redacted]')
    .replace(/key=[^&\s]+/gi, 'key=[redacted]')
    .replace(/\b\d{12,19}\b/g, '[redacted]');
}

function defaultDeps(runtime: RuntimeEnv, mcp: McpSession): AgentDeps {
  return {
    stream: (params) => streamGemini(runtime, params),
    generateOnce: (params) => generateGemini(runtime, params),
    callTool: (name, args) => realCallTool(mcp, name, args),
    getDeclarations: async () => toFunctionDeclarations(mcp.tools),
    isConfigured: () => isGeminiConfigured(runtime),
    now: () => Date.now()
  };
}

function resolveDeps(
  overrides: Partial<AgentDeps> | undefined,
  runtime: RuntimeEnv,
  mcp: McpSession
): AgentDeps {
  return {
    ...defaultDeps(runtime, mcp),
    ...globalForAgent.__nessieAgentDeps,
    ...overrides
  };
}

export function isThoughtSignatureError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /thought\s*signature|thoughtsignature/i.test(message);
}

/** Deterministic JSON for cache keys, independent of object key order. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** Redact keys and long digit runs before a hint reaches the client. */
export function safeReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/key=[^&\s]+/gi, 'key=[redacted]')
    .replace(/\b\d{12,19}\b/g, '[redacted]')
    .replace(/\bAQ\.[A-Za-z0-9._-]+/g, '[redacted]')
    .slice(0, 220);
}

/** Public entry point: mock provider or live Gemini. */
export async function runAgent(input: RunAgentInput): Promise<void> {
  if (input.runtime.LLM === 'mock') {
    const resolved = resolveDeps(input.deps, input.runtime, input.mcp);
    await mockAgent({
      session: input.session,
      message: input.message,
      emit: input.emit,
      deps: {
        callTool: resolved.callTool,
        now: () => new Date(resolved.now())
      }
    });
    return;
  }
  await runGeminiAgent(input);
}

interface FallbackInput {
  session: Session;
  message: string;
  emit: Emit;
  deps: AgentDeps;
  reason: ProviderFailureReason;
}

/**
 * Emit one human-friendly notice per session, trip the circuit breaker, then
 * answer with the deterministic agent so the user still gets grounded data.
 */
async function fallbackToMock({ session, message, emit, deps, reason }: FallbackInput): Promise<void> {
  globalForAgent.__geminiDownUntil = Date.now() + BREAKER_MS;
  globalForAgent.__geminiDownReason = reason;

  const flagged = session as Session & { noticeShown?: boolean };
  if (!flagged.noticeShown) {
    emit({
      type: 'notice',
      provider: 'gemini',
      reason,
      message: PROVIDER_NOTICES[reason]
    });
    flagged.noticeShown = true;
  }

  await mockAgent({
    session,
    message,
    emit,
    deps: {
      callTool: deps.callTool,
      now: () => new Date(deps.now())
    }
  });
}

export async function runGeminiAgent({
  session,
  message,
  emit,
  runtime,
  mcp,
  deps: overrides
}: RunAgentInput): Promise<void> {
  const deps = resolveDeps(overrides, runtime, mcp);

  if (isGeminiBreakerOpen()) {
    await fallbackToMock({
      session,
      message,
      emit,
      deps,
      reason: globalForAgent.__geminiDownReason ?? 'unavailable'
    });
    return;
  }

  const startedAt = deps.now();
  const isGuest = session.customer.id === GUEST_CUSTOMER_ID;
  const contents: Content[] = [...session.contents, { role: 'user', parts: [{ text: message }] }];
  const allowlist = buildAllowlist(session.customer.id, session.accounts);
  const systemInstruction = buildSystemInstruction(
    session.customer,
    session.accounts,
    new Date(startedAt).toISOString().slice(0, 10)
  );

  let rounds = 0;
  let lastUsage: RoundResult['usage'];
  let declarations: GeminiFunctionDeclaration[] = [];
  let providerError: unknown = null;
  const toolCache = new Map<string, ToolCallResult>();

  try {
    if (!deps.isConfigured()) {
      throw new Error('GEMINI_API_KEY is not set. Run with LLM=mock or add the key to the environment.');
    }
    if (!isGuest) declarations = await deps.getDeclarations();
  } catch (error) {
    emit({ type: 'error', message: "I couldn't finish that request.", hint: safeReason(error) });
    return;
  }

  try {
    while (rounds < MAX_ROUNDS && deps.now() - startedAt < WALL_CLOCK_MS) {
      rounds += 1;
      let round!: RoundResult;

      try {
        round = await deps.stream({
          contents,
          systemInstruction,
          declarations,
          onText: (delta) => emit({ type: 'text', delta })
        });
      } catch (error) {
        if (!isThoughtSignatureError(error)) {
          providerError = error;
          break;
        }
        try {
          round = await deps.generateOnce({ contents, systemInstruction, declarations });
          if (round.text) emit({ type: 'text', delta: round.text });
        } catch (retryError) {
          providerError = retryError;
          break;
        }
      }

      lastUsage = round.usage;

      if (round.parts.length > 0) {
        contents.push({ role: 'model', parts: round.parts });
      }

      if (isGuest || round.functionCalls.length === 0) break;

      const responseParts: ContentPart[] = [];
      for (const call of round.functionCalls) {
        if (!call.name) continue;
        emit({ type: 'tool_start', name: call.name, label: toolLabel(call.name) });

        const guard = assertToolArgsAllowed(call.args, allowlist);
        const callStarted = deps.now();

        if (!guard.ok) {
          emit({
            type: 'tool_result',
            name: call.name,
            ok: false,
            ms: 0,
            summary: guard.reason
          });
          responseParts.push({
            functionResponse: {
              name: call.name,
              response: { error: guard.reason },
              ...(call.id ? { id: call.id } : {})
            }
          });
          continue;
        }

        const cacheKey = `${call.name}:${stableStringify(call.args)}`;
        const cached = toolCache.get(cacheKey);
        if (cached) {
          emit({
            type: 'tool_result',
            name: call.name,
            ok: cached.ok,
            ms: 0,
            summary: `${summarizeToolResult(call.name, cached.data)} (reused)`
          });
          responseParts.push({
            functionResponse: {
              name: call.name,
              response: cached.ok ? { result: cached.data } : { error: cached.text.slice(0, 300) },
              ...(call.id ? { id: call.id } : {})
            }
          });
          continue;
        }

        try {
          const result = await deps.callTool(call.name, call.args);
          toolCache.set(cacheKey, result);
          const ms = deps.now() - callStarted;
          emit({
            type: 'tool_result',
            name: call.name,
            ok: result.ok,
            ms,
            summary: result.ok ? summarizeToolResult(call.name, result.data) : 'Tool reported an error'
          });
          if (result.ok) {
            const accountId =
              typeof call.args?.accountId === 'string' && call.args.accountId.trim().length > 0
                ? call.args.accountId
                : '';
            emit({
              type: 'insight',
              kind: call.name,
              payload: result.data,
              ...(accountId ? { accountId } : {})
            });
          }
          responseParts.push({
            functionResponse: {
              name: call.name,
              response: result.ok ? { result: result.data } : { error: result.text.slice(0, 300) },
              ...(call.id ? { id: call.id } : {})
            }
          });
        } catch (error) {
          const ms = deps.now() - callStarted;
          const reason = safeReason(error);
          emit({ type: 'tool_result', name: call.name, ok: false, ms, summary: reason });
          responseParts.push({
            functionResponse: {
              name: call.name,
              response: { error: reason },
              ...(call.id ? { id: call.id } : {})
            }
          });
        }
      }

      if (responseParts.length > 0) {
        contents.push({ role: 'user', parts: responseParts });
      }
    }

    if (providerError) {
      const reason = classifyProviderFailure(providerError);
      console.error(
        `[agent] Gemini provider failure (${reason}); falling back to deterministic narration:\n${redactSecrets(providerError)}`
      );
      await fallbackToMock({ session, message, emit, deps, reason });
      return;
    }

    session.contents = trimContents(contents);
    session.updatedAt = deps.now();

    emit({
      type: 'usage',
      promptTokens: lastUsage?.promptTokenCount ?? 0,
      outputTokens: lastUsage?.candidatesTokenCount ?? 0,
      rounds
    });
    emit({ type: 'done', sessionId: session.id });
  } catch (error) {
    console.error('[agent] failed:', error instanceof Error ? error.stack : String(error));
    emit({
      type: 'error',
      message: "I couldn't finish that request.",
      hint: safeReason(error)
    });
  }
}
