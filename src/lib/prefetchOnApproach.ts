/**
 * Run a callback once when the node is within 300px of the viewport.
 *
 * Used to warm deep-link payloads before a tap lands (touch taps fire no
 * hover), while avoiding work for cards far down the conversation. When
 * IntersectionObserver is unavailable the callback runs immediately.
 */
export function prefetchOnApproach(node: HTMLElement, run: () => void) {
  let callback = run;
  let warmed = false;
  let observer: IntersectionObserver | undefined;

  function warm(): void {
    if (warmed) return;
    warmed = true;
    observer?.disconnect();
    observer = undefined;
    callback();
  }

  if (typeof IntersectionObserver === 'undefined') {
    warm();
  } else {
    observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) warm();
      },
      { rootMargin: '300px' }
    );
    observer.observe(node);
  }

  return {
    update(next: () => void): void {
      callback = next;
    },
    destroy(): void {
      observer?.disconnect();
      observer = undefined;
    }
  };
}
