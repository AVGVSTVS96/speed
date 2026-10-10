import type { Event, Value } from "./otlp.ts";

export type Response = {
  at: number;
  tool: "claude" | "codex";
  source: string;
  model: string;
  effort: string;
  tier: string;
  output: number;
  reasoning: number | null;
  ttftMs: number;
  genMs: number;
  requestId: string | null;
};

const num = (v: Value) => (v === undefined || v === "" ? undefined : Number(v));
const str = (v: Value, fallback = "") => (v === undefined || v === "" ? fallback : String(v));

const claude = (e: Event): Response | undefined => {
  const output = num(e.attrs["output_tokens"]);
  const ttftMs = num(e.attrs["ttft_ms"]);
  const durationMs = num(e.attrs["duration_ms"]);
  if (!output || ttftMs === undefined || durationMs === undefined || durationMs <= ttftMs) return;
  return {
    at: e.at,
    tool: "claude",
    source: str(e.attrs["query_source"]),
    model: str(e.attrs["model"]),
    effort: str(e.attrs["effort"], "default"),
    tier: str(e.attrs["speed"], "normal"),
    output,
    reasoning: null,
    ttftMs,
    genMs: durationMs - ttftMs,
    requestId: str(e.attrs["request_id"]) || null,
  };
};

const codexRequests = new Set(["codex.websocket_request", "codex.api_request"]);

export const tracker = () => {
  const sentAt = new Map<string, number>();

  const codex = (e: Event): Response | undefined => {
    const conversation = e.attrs["conversation.id"];
    if (conversation === undefined) return;
    const key = `${conversation}\0${str(e.attrs["model"])}`;
    if (codexRequests.has(e.name)) {
      sentAt.set(key, e.at);
      return;
    }
    if (e.name !== "codex.sse_event" || e.attrs["event.kind"] !== "response.completed") return;
    const start = sentAt.get(key);
    sentAt.delete(key);
    const output = num(e.attrs["output_token_count"]);
    const ttftMs = num(e.attrs["ttft_ms"]);
    if (start === undefined || !output || ttftMs === undefined) return;
    const genMs = e.at - start - ttftMs;
    if (genMs <= 0) return;
    return {
      at: e.at,
      tool: "codex",
      source: str(e.attrs["originator"], e.service),
      model: str(e.attrs["model"]),
      effort: str(e.attrs["model_reasoning_effort"], "default"),
      tier: str(e.attrs["service_tier"], "default"),
      output,
      reasoning: num(e.attrs["reasoning_token_count"]) ?? null,
      ttftMs,
      genMs,
      requestId: null,
    };
  };

  return (e: Event) => {
    if (e.service !== "claude-code") return codex(e);
    return e.name === "api_request" ? claude(e) : undefined;
  };
};
