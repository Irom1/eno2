/**
 * In-process MCP for Cloudflare Workers.
 *
 * Workers cannot spawn child processes, so the (read-only) Nessie MCP server is
 * constructed per request and connected to an in-memory client transport. No
 * stdio, no node:fs, no process.cwd().
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RuntimeEnv } from './env';
import { NessieClient } from './nessie/client';
import { registerAllTools } from './nessie/tools/index';

export type McpTool = Awaited<ReturnType<Client['listTools']>>['tools'][number];

export interface ToolCallResult {
  ok: boolean;
  data: unknown;
  text: string;
}

export class McpToolError extends Error {
  readonly toolName: string;

  constructor(toolName: string, message: string) {
    super(message);
    this.name = 'McpToolError';
    this.toolName = toolName;
  }
}

export interface McpSession {
  client: Client;
  tools: McpTool[];
  close(): Promise<void>;
}

const TOOL_TIMEOUT_MS = 15_000;

export async function createMcp(runtime: RuntimeEnv): Promise<McpSession> {
  const server = new McpServer({ name: 'nessie-mcp', version: '0.1.0' });
  const nessie = new NessieClient({
    apiKey: runtime.NESSIE_API_KEY,
    baseUrl: runtime.NESSIE_BASE_URL
  });
  registerAllTools(server, nessie);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client({ name: 'eno2-web', version: '0.1.0' }, { capabilities: {} });
  await client.connect(clientTransport);
  const { tools } = await client.listTools();

  return {
    client,
    tools,
    close: async () => {
      await client.close();
      await server.close();
    }
  };
}

export async function withMcp<T>(
  runtime: RuntimeEnv,
  fn: (mcp: McpSession) => Promise<T>
): Promise<T> {
  const mcp = await createMcp(runtime);
  try {
    return await fn(mcp);
  } finally {
    await mcp.close().catch(() => undefined);
  }
}

function extractText(content: unknown): string {
  if (!Array.isArray(content)) return '';
  for (const item of content) {
    if (item && typeof item === 'object' && (item as { type?: string }).type === 'text') {
      const text = (item as { text?: unknown }).text;
      if (typeof text === 'string') return text;
    }
  }
  return '';
}

export async function callTool(
  mcp: McpSession,
  name: string,
  args: Record<string, unknown> = {},
  timeoutMs: number = TOOL_TIMEOUT_MS
): Promise<ToolCallResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([
      mcp.client.callTool({ name, arguments: args }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new McpToolError(name, `timed out after ${timeoutMs}ms`)),
          timeoutMs
        );
      })
    ]);

    const text = extractText(response.content);
    let data: unknown = text;
    if (text) {
      try {
        data = JSON.parse(text) as unknown;
      } catch {
        data = text;
      }
    } else {
      data = {};
    }

    return { ok: !response.isError, data, text };
  } catch (error) {
    if (error instanceof McpToolError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new McpToolError(name, message.slice(0, 300));
  } finally {
    if (timer) clearTimeout(timer);
  }
}
