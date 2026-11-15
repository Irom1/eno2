import { tick } from 'svelte';

/** One instance per conversation; only newly submitted messages claim an origin. */
export function createSentMessageMotion() {
  let origin: DOMRect | undefined;

  function capture() {
    origin = undefined;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches
      || document.documentElement.classList.contains('opening-setup')) return;
    origin = document.querySelector('.message-composer')?.getBoundingClientRect();
  }

  function bubble(node: HTMLElement, sent: boolean) {
    const start = sent ? origin : undefined;
    if (!start) return;
    origin = undefined;
    let frame = 0;
    let disposed = false;
    let overlay: HTMLDivElement | undefined;
    const opacity = node.style.opacity;
    node.style.opacity = '0';

    function cleanup() {
      cancelAnimationFrame(frame);
      overlay?.remove();
      node.style.opacity = opacity;
    }

    void tick().then(() => {
      if (disposed || !node.isConnected) { cleanup(); return; }
      // Settle the transcript before lifting the text out of the fixed composer.
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
      const style = getComputedStyle(node);
      overlay = document.createElement('div');
      overlay.setAttribute('aria-hidden', 'true');
      overlay.textContent = node.querySelector('p')?.textContent ?? node.textContent;
      Object.assign(overlay.style, {
        position: 'fixed', zIndex: '1000', pointerEvents: 'none', boxSizing: 'border-box',
        overflow: 'hidden', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap',
        margin: '0', font: style.font, letterSpacing: style.letterSpacing,
        color: style.color, background: style.background, border: style.border,
        padding: style.padding, boxShadow: style.boxShadow
      });
      document.body.append(overlay);
      const corners = [style.borderTopLeftRadius, style.borderTopRightRadius,
        style.borderBottomRightRadius, style.borderBottomLeftRadius].map(parseFloat);
      const began = performance.now();
      function draw(now: number) {
        if (disposed || !node.isConnected || !overlay) { cleanup(); return; }
        const progress = Math.min(1, (now - began) / 560);
        const eased = 1 - Math.pow(1 - progress, 4);
        // Re-read the destination so streamed replies and scrolling cannot leave
        // the floating message behind its actual bubble.
        const end = node.getBoundingClientRect();
        const mix = (a: number, b: number) => a + (b - a) * eased;
        Object.assign(overlay.style, {
          left: `${mix(start!.left, end.left)}px`, top: `${mix(start!.top, end.top)}px`,
          width: `${mix(start!.width, end.width)}px`, height: `${mix(start!.height, end.height)}px`,
          borderRadius: corners.map((radius) => `${mix(start!.height / 2, radius)}px`).join(' ')
        });
        if (progress < 1) frame = requestAnimationFrame(draw);
        else cleanup();
      }
      draw(began);
    });

    return { destroy() { disposed = true; cleanup(); } };
  }

  return { capture, bubble };
}
