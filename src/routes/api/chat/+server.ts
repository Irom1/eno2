import { json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { runAgent, safeReason } from '$lib/server/agent';
import type { AgentEvent } from '$lib/server/events';
import { resolveEnv } from '$lib/server/env';
import { createMcp, type McpSession } from '$lib/server/mcp';
import { getSession } from '$lib/server/session';
import { SESSION_COOKIE } from '$lib/server/sessionCookie';

export const prerender = false;

export async function POST({ request, cookies, platform }: RequestEvent): Promise<Response> {
  const session = getSession(cookies.get(SESSION_COOKIE));
  if (!session) return json({ error: 'No active session' }, { status: 401 });

  let body: { message?: unknown };
  try {
    body = (await request.json()) as { message?: unknown };
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) return json({ error: 'message is required' }, { status: 400 });
  if (message.length > 2000) {
    return json({ error: 'message must be 2000 characters or fewer' }, { status: 400 });
  }

  const runtime = resolveEnv(platform);
  let created: McpSession;
  try {
    // One in-process MCP session per chat request; closed in `finally` below.
    created = await createMcp(runtime);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Failed to start MCP' },
      { status: 502 }
    );
  }
  const mcp = created;

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let aborted = false;
      const onAbort = () => {
        aborted = true;
      };
      request.signal.addEventListener('abort', onAbort);

      const send = (event: AgentEvent) => {
        if (aborted || closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
          );
        } catch {
          aborted = true;
        }
      };

      try {
        await runAgent({ session, message, emit: send, runtime, mcp });
      } catch (error) {
        send({ type: 'error', message: "I couldn't finish that request.", hint: safeReason(error) });
      } finally {
        request.signal.removeEventListener('abort', onAbort);
        await mcp.close().catch(() => undefined);
        if (!aborted) {
          closed = true;
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      }
    },
    async cancel() {
      closed = true;
      await mcp.close().catch(() => undefined);
    }
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no'
    }
  });
}
