// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
  namespace App {
    interface PageState {
      sentFirstAccountPrompt?: boolean;
    }

    interface Platform {
      env?: Record<string, string | undefined>;
      context?: {
        waitUntil(promise: Promise<unknown>): void;
      };
      caches?: CacheStorage & { default: Cache };
    }
  }
}

export {};
