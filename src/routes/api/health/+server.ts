import { json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { resolveEnv } from '$lib/server/env';
import { callTool, withMcp } from '$lib/server/mcp';
import { geminiModel, isGeminiConfigured } from '$lib/server/gemini';

export const prerender = false;

export async function GET({ platform }: RequestEvent): Promise<Response> {
  const runtime = resolveEnv(platform);
  const result = {
    ok: false,
    llm: runtime.LLM,
    gemini: {
      configured: isGeminiConfigured(runtime),
      model: geminiModel(runtime)
    },
    nessie: {
      ok: false,
      customerCount: 0,
      warning: undefined as string | undefined,
      error: undefined as string | undefined
    },
    mcp: {
      ok: false,
      toolCount: 0,
      error: undefined as string | undefined
    },
    timestamp: new Date().toISOString()
  };

  try {
    await withMcp(runtime, async (mcp) => {
      result.mcp.ok = true;
      result.mcp.toolCount = mcp.tools.length;

      try {
        const customers = await callTool(mcp, 'nessie_list_customers', {});
        const data = customers.data as { count?: number } | null;
        const count = typeof data?.count === 'number' ? data.count : 0;
        result.nessie.ok = customers.ok && count > 0;
        result.nessie.customerCount = count;
        if (customers.ok && count === 0) {
          result.nessie.warning = 'Key valid but sandbox empty';
        }
        if (!customers.ok) {
          result.nessie.error = 'nessie_list_customers failed';
        }
      } catch (error) {
        result.nessie.error = error instanceof Error ? error.message : String(error);
      }
    });
  } catch (error) {
    result.mcp.error = error instanceof Error ? error.message : String(error);
  }

  result.ok = result.mcp.ok && result.nessie.ok;
  return json(result, { status: result.ok ? 200 : 503 });
}
