# speed

The real output speed of every model response you run through Claude Code and Codex, in tokens per second.

```
$ speed
model              effort  tier      t/s  median   ttft  responses  tokens
claude-haiku-5-5   high    normal    186     188   0.6s          2   9,854
claude-sonnet-5-5  high    normal    130     121   1.0s          2   7,206
claude-opus-5-5    high    normal     95      92   0.8s          2   9,215
gpt-6.1-sol        high    priority   82      82  11.3s          2   6,241
gpt-6-astra        high    priority   74      75   6.3s          2   5,996
gpt-6.1-sol        low     priority   44      44   2.4s          3   2,524
```

No wrapper, no proxy, no stopwatch. Both tools already report every model response through OpenTelemetry, with exact token counts and stream timing. `speed` collects those reports and does the division.

```
Claude Code ──┐  OTLP logs (JSON)
Codex       ──┤  one event per model response
              ▼
        speed serve  (:4318)  →  speed.db  →  speed
```

## What it measures

```
request sent ──── ttft ────┬──────── generation ────────┬
                           first token                  last token
t/s = output tokens ÷ generation time
```

- **Output tokens** include thinking and reasoning tokens. The APIs count them exactly even when the thinking text is hidden or summarized, and the model spends real time generating them.
- **Generation time** starts at the first streamed token and ends at the last, so time to first token (queueing, prompt processing) is reported separately as `ttft` and never drags the speed down.
- **Per response, not per turn.** Tool calls run between model responses, so a slow `npm install` never counts against the model.
- **`t/s` is weighted by tokens** (total tokens ÷ total generation time), so a 20-token tool call can't skew a row. `median` is the per-response median.

Where the numbers come from:

|             | event                                  | tokens               | generation time                        |
| ----------- | -------------------------------------- | -------------------- | -------------------------------------- |
| Claude Code | `api_request`                          | `output_tokens`      | `duration_ms − ttft_ms`                |
| Codex       | `codex.sse_event` `response.completed` | `output_token_count` | completed − (request sent + `ttft_ms`) |

`tier` is Claude Code's `speed` (normal or fast) or Codex's `service_tier` (default, priority, flex).

## Setup

Needs [Bun](https://bun.sh).

```sh
git clone https://github.com/AVGVSTVS96/speed && cd speed
bun install
ln -s "$PWD/src/cli.ts" ~/.local/bin/speed
speed serve
```

`speed.service` runs it as a systemd user service (`ln -s "$PWD/speed.service" ~/.config/systemd/user/ && systemctl --user enable --now speed`).

Point Claude Code at it in `~/.claude/settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
    "OTEL_LOGS_EXPORTER": "otlp",
    "OTEL_EXPORTER_OTLP_PROTOCOL": "http/json",
    "OTEL_EXPORTER_OTLP_LOGS_ENDPOINT": "http://localhost:4318/v1/logs"
  }
}
```

And Codex in `~/.codex/config.toml`, above the first table:

```toml
[otel]
exporter = { otlp-http = { endpoint = "http://localhost:4318/v1/logs", protocol = "json" } }
```

New sessions pick it up. Anything that embeds them reports too: the Claude Agent SDK, and apps like T3 Code that run `codex app-server`, once that process restarts.

`speed serve` accepts reports from this machine and from your Tailscale network, so one collector can cover all your machines: point their endpoints at its tailnet name.

## Use

```sh
speed                    # last 7 days
speed --since 12h
speed --source codex_exec
speed --json
```

`source` is who made the request: Claude Code's `query_source` (`repl_main_thread`, `sdk`, …) or Codex's `originator` (`codex_exec`, or the app embedding it).

Data lives in `~/.local/share/speed/speed.db` (`SPEED_DB` to move it). `speed` keeps one row per model response, with counts and timings only, and drops every other event it receives.

## License

MIT
