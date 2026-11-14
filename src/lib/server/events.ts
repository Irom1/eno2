/** Shared SSE event contract between the agent loop and the chat route. */

export type ProviderFailureReason = "credits" | "auth" | "rate_limit" | "unavailable";

export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "tool_start"; name: string; label: string }
  | { type: "tool_result"; name: string; ok: boolean; ms: number; summary: string }
  | { type: "insight"; kind: string; payload: unknown }
  | { type: "usage"; promptTokens: number; outputTokens: number; rounds: number }
  | { type: "done"; sessionId: string }
  | { type: "notice"; provider: "gemini"; reason: ProviderFailureReason; message: string }
  | { type: "error"; message: string; hint?: string };

export type Emit = (event: AgentEvent) => void;
