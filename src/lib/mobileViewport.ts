export interface ChatViewportMetrics {
  height: number;
  offsetTop: number;
  keyboardOpen: boolean;
}

/**
 * Normalize the browser viewport readings used by the mobile chat layout.
 *
 * `visualHeight` is the visual viewport height (which shrinks when the
 * on-screen keyboard is shown) and `visualOffsetTop` is how far the visual
 * viewport is scrolled from the layout viewport. Both fall back to sane
 * desktop values when the browser does not expose `visualViewport`.
 */
export function chatViewportMetrics(
  innerHeight: number,
  visualHeight: number,
  visualOffsetTop: number
): ChatViewportMetrics {
  const height = Math.max(320, Math.round(visualHeight || innerHeight));
  const offsetTop = Math.max(0, Math.round(visualOffsetTop || 0));
  const keyboardOpen = innerHeight - height > 80;
  return { height, offsetTop, keyboardOpen };
}
