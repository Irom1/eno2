import type { RequestEvent } from './$types';
import { resolveEnv } from '$lib/server/env';
import { mapboxStaticUrl, validCoordinates } from '$lib/server/mapbox';

export const prerender = false;

const IMAGE_HEADERS = {
  'content-type': 'image/png',
  'cache-control': 'public, max-age=86400'
};

function numberParam(value: string | null): number | null {
  if (value === null || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Server-side proxy for the Mapbox Static Images API.
 *
 * Keeps `MAPBOX_API_KEY` out of the client, DOM, and error responses. When the
 * key is absent or the coordinates are invalid the endpoint returns a small
 * error so the ATM card can show its fallback.
 */
export async function GET({ url, platform }: RequestEvent): Promise<Response> {
  const runtime = resolveEnv(platform);
  if (!runtime.MAPBOX_API_KEY) {
    return new Response('Map previews are not configured', { status: 404 });
  }

  const lat = numberParam(url.searchParams.get('lat'));
  const lng = numberParam(url.searchParams.get('lng'));
  const rawZoom = url.searchParams.get('zoom');
  const zoom = rawZoom === null ? 15 : numberParam(rawZoom);

  if (
    lat === null ||
    lng === null ||
    zoom === null ||
    !validCoordinates(lat, lng) ||
    zoom < 1 ||
    zoom > 20
  ) {
    return new Response('Invalid map coordinates', { status: 400 });
  }

  const theme = url.searchParams.get('theme') === 'light' ? 'light' : 'dark';
  const target = mapboxStaticUrl(runtime.MAPBOX_API_KEY, lat, lng, zoom, theme);
  if (!target) {
    return new Response('Invalid map coordinates', { status: 400 });
  }

  // Mapbox tokens with URL restrictions only allow requests whose Referer is
  // on the token's allowlist; send it explicitly instead of relying on the
  // caller-supplied (often absent) header.
  const referer = runtime.MAPBOX_REFERER || 'http://localhost:5184/';

  try {
    const upstream = await fetch(target, { headers: { Referer: referer } });
    if (!upstream.ok || !upstream.body) {
      return new Response('Map preview unavailable', { status: 502 });
    }
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? IMAGE_HEADERS['content-type'],
        'cache-control': IMAGE_HEADERS['cache-control']
      }
    });
  } catch {
    return new Response('Map preview unavailable', { status: 502 });
  }
}
