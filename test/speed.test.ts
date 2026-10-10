import { expect, test } from "bun:test";
import { events, type LogsPayload } from "../src/otlp.ts";
import { lines } from "../src/report.ts";
import { tracker } from "../src/responses.ts";

const log = (service: string, ms: number, attrs: Record<string, string | number>): LogsPayload => ({
  resourceLogs: [
    {
      resource: { attributes: [{ key: "service.name", value: { stringValue: service } }] },
      scopeLogs: [
        {
          logRecords: [
            {
              timeUnixNano: "0",
              observedTimeUnixNano: (BigInt(ms) * 1_000_000n).toString(),
              attributes: Object.entries(attrs).map(([key, v]) => ({
                key,
                value: typeof v === "number" ? { intValue: String(v) } : { stringValue: v },
              })),
            },
          ],
        },
      ],
    },
  ],
});

const replay = (...payloads: LogsPayload[]) => {
  const track = tracker();
  return payloads.flatMap(events).flatMap((e) => track(e) ?? []);
};

test("claude: generation time is duration minus time to first token", () => {
  const [r] = replay(
    log("claude-code", 1_000, {
      "event.name": "api_request",
      model: "claude-haiku-5-5",
      output_tokens: 5378,
      duration_ms: 21759,
      ttft_ms: 594,
      effort: "high",
      speed: "normal",
      query_source: "sdk",
      request_id: "req_1",
    }),
  );
  expect(r).toMatchObject({
    tool: "claude",
    model: "claude-haiku-5-5",
    effort: "high",
    ttftMs: 594,
    genMs: 21165,
  });
  expect(Math.round((r!.output / r!.genMs) * 1000)).toBe(254);
});

test("codex: window runs from first output item to response.completed", () => {
  const conversation = { "conversation.id": "c1", model: "gpt-6.1-sol", originator: "codex_exec" };
  const rows = replay(
    log("codex_exec", 8_141, { "event.name": "codex.websocket_request", ...conversation }),
    log("codex_exec", 8_495, {
      "event.name": "codex.sse_event",
      "event.kind": "response.completed",
      output_token_count: "0",
      ...conversation,
    }),
    log("codex_exec", 8_691, { "event.name": "codex.websocket_request", ...conversation }),
    log("codex_exec", 19_535, {
      "event.name": "codex.sse_event",
      "event.kind": "response.completed",
      output_token_count: "409",
      reasoning_token_count: "34",
      ttft_ms: "1841",
      model_reasoning_effort: "low",
      service_tier: "priority",
      ...conversation,
    }),
  );
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    tool: "codex",
    source: "codex_exec",
    effort: "low",
    tier: "priority",
    reasoning: 34,
  });
  expect(rows[0]!.genMs).toBe(19_535 - 8_691 - 1841);
});

test("codex: concurrent models in one conversation keep their own start", () => {
  const rows = replay(
    log("codex_exec", 100, { "event.name": "codex.websocket_request", "conversation.id": "c", model: "a" }),
    log("codex_exec", 200, { "event.name": "codex.websocket_request", "conversation.id": "c", model: "b" }),
    log("codex_exec", 1_200, {
      "event.name": "codex.sse_event",
      "event.kind": "response.completed",
      "conversation.id": "c",
      model: "a",
      output_token_count: "100",
      ttft_ms: "100",
    }),
  );
  expect(rows[0]!.genMs).toBe(1_000);
});

const row = (output: number, gen_ms: number) => ({
  tool: "claude",
  model: "m",
  effort: "high",
  tier: "normal",
  output,
  ttft_ms: 500,
  gen_ms,
});

test("report weighs speed by tokens, so tiny responses can't skew it", () => {
  const [line] = lines([row(10, 1_000), row(1_000, 5_000)]);
  expect(Math.round(line!.tps)).toBe(Math.round((1_010 / 6_000) * 1000));
  expect(line!.responses).toBe(2);
});
