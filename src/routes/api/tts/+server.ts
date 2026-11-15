import type { RequestEvent } from './$types';
import { resolveEnv } from '$lib/server/env';

export const prerender = false;

const MAX_TEXT_LENGTH = 2500;
const DEFAULT_VOICE_ID = 'pNInz6obpgDQGcFmaJgB';
const DEFAULT_MODEL = 'eleven_turbo_v2_5';

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });
}

/**
 * Server-side proxy for ElevenLabs text-to-speech.
 *
 * Keeps `ELEVENLABS_API_KEY` out of the client, the DOM, and every error
 * response. Returns audio bytes on success so the browser can decode and play
 * them through the Web Audio API.
 */
export async function POST({ request, platform }: RequestEvent): Promise<Response> {
  let text: string;
  try {
    const body = (await request.json()) as { text?: unknown } | null;
    if (!body || typeof body.text !== 'string') return jsonError('Invalid request', 400);
    text = body.text.trim();
  } catch {
    return jsonError('Invalid request', 400);
  }
  if (!text) return jsonError('Text is required', 400);
  if (text.length > MAX_TEXT_LENGTH) return jsonError('Text is too long', 413);

  const runtime = resolveEnv(platform);
  if (!runtime.ELEVENLABS_API_KEY) {
    return jsonError('Voice is not configured', 503);
  }

  const voiceId = runtime.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
  const model = runtime.ELEVENLABS_MODEL || DEFAULT_MODEL;
  const target = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: 'POST',
      headers: {
        'xi-api-key': runtime.ELEVENLABS_API_KEY,
        'content-type': 'application/json',
        accept: 'audio/mpeg'
      },
      body: JSON.stringify({ text, model_id: model }),
      signal: request.signal
    });
  } catch (error) {
    if (request.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
      return new Response(null, { status: 499 });
    }
    return jsonError('Voice is unavailable right now', 502);
  }

  if (upstream.status === 429) {
    return jsonError('Voice is busy right now', 429);
  }
  if (!upstream.ok || !upstream.body) {
    // Never echo the upstream body: it can contain provider details.
    return jsonError('Voice is unavailable right now', 502);
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'audio/mpeg',
      'cache-control': 'no-store'
    }
  });
}
