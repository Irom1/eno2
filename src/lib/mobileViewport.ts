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
  const height = Math.max(1, Math.round(visualHeight || innerHeight));
  const offsetTop = Math.max(0, Math.round(visualOffsetTop || 0));
  const keyboardOpen = innerHeight - height > 80;
  return { height, offsetTop, keyboardOpen };
}

/** Anchor a focused composer to the visual viewport, independent of Safari's
 * sticky positioning and automatic focus scrolling. Keep its document space so
 * the last message remains scrollable above it while the keyboard is open.
 */
export function keyboardComposer(node: HTMLElement, enabled = true) {
  const viewport = window.visualViewport;
  const spacer = document.createElement('div');
  spacer.setAttribute('aria-hidden', 'true');
  spacer.style.flexShrink = '0';
  node.before(spacer);
  let frame = 0;

  const apply = () => {
    const metrics = chatViewportMetrics(
      window.innerHeight,
      viewport?.height ?? window.innerHeight,
      viewport?.offsetTop ?? 0
    );
    const open = enabled && metrics.keyboardOpen && node.contains(document.activeElement);
    node.classList.toggle('keyboard-composer', open);
    node.style.setProperty('--keyboard-viewport-bottom', `${metrics.offsetTop + metrics.height}px`);
    // Reserve the keyboard-covered part too, so scrolling to the document's
    // end brings the final message above the composer, not behind the keyboard.
    const coveredHeight = Math.max(0, window.innerHeight - metrics.height - metrics.offsetTop);
    spacer.style.height = open ? `${node.getBoundingClientRect().height + coveredHeight}px` : '0px';
  };
  const schedule = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(apply);
  };
  const observer = new ResizeObserver(schedule);
  observer.observe(node);
  viewport?.addEventListener('resize', schedule);
  viewport?.addEventListener('scroll', schedule);
  window.addEventListener('resize', schedule);
  node.addEventListener('focusin', schedule);
  node.addEventListener('focusout', schedule);
  apply();

  return {
    update(value: boolean) { enabled = value; schedule(); },
    destroy() {
      cancelAnimationFrame(frame);
      observer.disconnect();
      viewport?.removeEventListener('resize', schedule);
      viewport?.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      node.removeEventListener('focusin', schedule);
      node.removeEventListener('focusout', schedule);
      spacer.remove();
      node.classList.remove('keyboard-composer');
      node.style.removeProperty('--keyboard-viewport-bottom');
    }
  };
}
