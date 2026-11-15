/** Pace fast local/API replies without adding another delay to slow responses. */
export function createConversationPacer() {
  const afterUserMs = 750;
  const betweenRepliesMs = 1100;
  let lastUser = -Infinity;
  let lastReply = -Infinity;
  let disposed = false;
  let tail: Promise<unknown> = Promise.resolve();
  let cancelWait: (() => void) | undefined;

  return {
    userSent() { lastUser = Date.now(); },
    enoShown() { lastReply = Date.now(); },
    reply<T>(publish: () => T): Promise<T | undefined> {
      const result = tail.then(async () => {
        if (disposed) return;
        const delay = Math.max(0, lastUser + afterUserMs - Date.now(), lastReply + betweenRepliesMs - Date.now());
        if (delay > 0) await new Promise<void>((resolve) => {
          const timer = setTimeout(() => { cancelWait = undefined; resolve(); }, delay);
          cancelWait = () => { clearTimeout(timer); cancelWait = undefined; resolve(); };
        });
        if (disposed) return;
        const value = publish();
        lastReply = Date.now();
        return value;
      });
      tail = result.catch(() => undefined);
      return result;
    },
    dispose() { disposed = true; cancelWait?.(); }
  };
}
