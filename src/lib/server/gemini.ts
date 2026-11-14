/**
 * Gemini REST client for Cloudflare Workers.
 *
 * Uses the public REST endpoints via `fetch` instead of `@google/genai` (whose
 * Node dependencies do not bundle cleanly into a Worker). Response `parts` are
 * preserved verbatim, including `thoughtSignature`, so function-calling
 * continuity survives across rounds.
 */
import type { RuntimeEnv } from './env';
import type { Content, ContentPart } from './session';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const TEMPERATURE = 0.35;
const MAX_OUTPUT_TOKENS = 2048;

/** Local shape matching the Gemini function declaration wire format. */
export interface GeminiFunctionDeclaration {
  name: string;
  description?: string;
  parametersJsonSchema?: unknown;
}

export interface FunctionCallRequest {
  name: string;
  args: Record<string, unknown>;
  id?: string;
}

export interface RoundResult {
  text: string;
  parts: ContentPart[];
  functionCalls: FunctionCallRequest[];
  usage?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

export interface StreamParams {
  contents: Content[];
  systemInstruction: string;
  declarations: GeminiFunctionDeclaration[];
  onText: (delta: string) => void;
}

export interface GenerateParams {
  contents: Content[];
  systemInstruction: string;
  declarations: GeminiFunctionDeclaration[];
}

interface GeminiChunk {
  candidates?: Array<{
    content?: { role?: string; parts?: unknown[] };
  }>;
  usageMetadata?: RoundResult['usage'];
}

export function isGeminiConfigured(runtime: RuntimeEnv): boolean {
  return runtime.GEMINI_API_KEY.trim().length > 0;
}

export function geminiModel(runtime: RuntimeEnv): string {
  return runtime.GEMINI_MODEL;
}

function requestBody(params: StreamParams | GenerateParams): Record<string, unknown> {
  return {
    contents: params.contents,
    systemInstruction: { role: 'user', parts: [{ text: params.systemInstruction }] },
    ...(params.declarations.length > 0 && {
      tools: [{ functionDeclarations: params.declarations }],
      toolConfig: { functionCallingConfig: { mode: 'AUTO' } }
    }),
    generationConfig: { temperature: TEMPERATURE, maxOutputTokens: MAX_OUTPUT_TOKENS }
  };
}

function normalizeCall(call: {
  name?: string;
  args?: Record<string, unknown>;
  id?: string;
}): FunctionCallRequest {
  return {
    name: call.name ?? '',
    args: call.args ?? {},
    ...(call.id ? { id: call.id } : {})
  };
}

function collectParts(chunk: GeminiChunk): ContentPart[] {
  const parts = chunk.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return [];
  return parts.map((part) => part as ContentPart);
}

function collectCalls(parts: readonly ContentPart[]): FunctionCallRequest[] {
  const calls: FunctionCallRequest[] = [];
  for (const part of parts) {
    const call = part.functionCall as
      | { name?: string; args?: Record<string, unknown>; id?: string }
      | undefined;
    if (call) calls.push(normalizeCall(call));
  }
  return calls;
}

const textual = (part: ContentPart): string =>
  typeof part.text === 'string' ? part.text : '';

function partText(parts: readonly ContentPart[]): string {
  return parts.map(textual).join('');
}

async function throwProviderError(response: Response, model: string): Promise<never> {
  let detail = response.statusText || 'request failed';
  try {
    const raw = await response.text();
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { error?: { message?: string } };
        if (parsed.error?.message) detail = parsed.error.message;
      } catch {
        detail = raw.slice(0, 300);
      }
    }
  } catch {
    // keep status text
  }
  // Never include the key: only the HTTP status and provider message.
  throw new Error(`Gemini request failed (${response.status} ${model}): ${detail}`);
}

function endpoint(runtime: RuntimeEnv, method: 'streamGenerateContent' | 'generateContent'): string {
  const model = encodeURIComponent(runtime.GEMINI_MODEL);
  const query = method === 'streamGenerateContent' ? '?alt=sse&key=' : '?key=';
  return `${BASE_URL}/${model}:${method}${query}${encodeURIComponent(runtime.GEMINI_API_KEY)}`;
}

/** POST the request and parse an SSE body, invoking `onText` per text delta. */
export async function streamGemini(runtime: RuntimeEnv, params: StreamParams): Promise<RoundResult> {
  const response = await fetch(endpoint(runtime, 'streamGenerateContent'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify(requestBody(params))
  });

  if (!response.ok) await throwProviderError(response, runtime.GEMINI_MODEL);
  if (!response.body) throw new Error('Gemini streaming response had no body');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let usage: RoundResult['usage'];
  const parts: ContentPart[] = [];
  const functionCalls: FunctionCallRequest[] = [];

  const handleFrame = (frame: string): void => {
    const data: string[] = [];
    for (const line of frame.split(/\r?\n/)) {
      const trimmed = line.trimStart();
      if (!trimmed.startsWith('data:')) continue;
      data.push(trimmed.slice(5).trimStart());
    }
    if (data.length === 0) return;
    const raw = data.join('\n').trim();
    if (!raw || raw === '[DONE]') return;

    let chunk: GeminiChunk;
    try {
      chunk = JSON.parse(raw) as GeminiChunk;
    } catch {
      return; // tolerate partial/unknown frames
    }

    const chunkParts = collectParts(chunk);
    if (chunkParts.length > 0) {
      parts.push(...chunkParts);
      const delta = partText(chunkParts);
      if (delta) {
        text += delta;
        params.onText(delta);
      }
      functionCalls.push(...collectCalls(chunkParts));
    }
    if (chunk.usageMetadata) usage = chunk.usageMetadata;
  };

  const drain = (flush: boolean): void => {
    for (;;) {
      const match = /\r\n\r\n|\n\n|\r\r/.exec(buffer);
      if (!match || match.index === undefined) break;
      const frame = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      handleFrame(frame);
    }
    if (flush && buffer.trim()) {
      handleFrame(buffer);
      buffer = '';
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    drain(false);
  }
  buffer += decoder.decode();
  drain(true);

  return { text, parts, functionCalls, usage };
}

/** POST a single non-streaming request. */
export async function generateGemini(
  runtime: RuntimeEnv,
  params: GenerateParams
): Promise<RoundResult> {
  const response = await fetch(endpoint(runtime, 'generateContent'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(requestBody(params))
  });

  if (!response.ok) await throwProviderError(response, runtime.GEMINI_MODEL);

  const payload = (await response.json()) as GeminiChunk;
  const parts = collectParts(payload);
  return {
    text: partText(parts),
    parts,
    functionCalls: collectCalls(parts),
    usage: payload.usageMetadata
  };
}

/** Structured conversation replies without exposing any financial tools. */
export async function generateStructuredGemini(runtime: RuntimeEnv, params: {
  systemInstruction: string;
  contents: Content[];
  schema: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<unknown> {
  const response = await fetch(endpoint(runtime, 'generateContent'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    signal: params.signal ?? AbortSignal.timeout(30_000),
    body: JSON.stringify({
      systemInstruction: { role: 'user', parts: [{ text: params.systemInstruction }] },
      contents: params.contents,
      generationConfig: { temperature: 0.65, maxOutputTokens: 2048, responseMimeType: 'application/json', responseJsonSchema: params.schema }
    })
  });
  if (!response.ok) await throwProviderError(response, runtime.GEMINI_MODEL);
  const payload = await response.json() as GeminiChunk;
  return JSON.parse(partText(collectParts(payload)));
}
