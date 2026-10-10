#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { lines, query, render, since } from "./report.ts";
import { serve } from "./serve.ts";
import { open } from "./store.ts";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    since: { type: "string", default: "7d" },
    source: { type: "string" },
    json: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

const usage = `speed: true output speed of every Claude Code and Codex model response

  speed [--since 7d] [--source <name>] [--json]   speed per model, effort and tier
  speed serve                                     collect OTLP logs on :4318`;

if (values.help) console.log(usage);
else if (positionals[0] === "serve") serve();
else if (positionals.length) {
  console.error(usage);
  process.exit(1);
} else {
  const report = lines(query(open(), since(values.since), values.source));
  console.log(
    values.json ? JSON.stringify(report, null, 2) : report.length ? render(report) : "no responses yet",
  );
}
