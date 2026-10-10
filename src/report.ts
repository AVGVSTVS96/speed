import type { Database } from "bun:sqlite";

type Row = {
  tool: string;
  model: string;
  effort: string;
  tier: string;
  output: number;
  ttft_ms: number;
  gen_ms: number;
};

export type Line = {
  model: string;
  effort: string;
  tier: string;
  tps: number;
  median: number;
  ttftMs: number;
  responses: number;
  tokens: number;
};

const units = { m: 60_000, h: 3_600_000, d: 86_400_000 } as const;

export const since = (span: string) => {
  const match = /^(\d+)([mhd])$/.exec(span);
  if (!match) throw new Error(`--since takes a span like 30m, 12h or 7d, not "${span}"`);
  return Date.now() - Number(match[1]) * units[match[2] as keyof typeof units];
};

const median = (values: number[]) => {
  const sorted = values.toSorted((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

export const lines = (rows: Row[]): Line[] => {
  const groups = Map.groupBy(rows, (r) => `${r.model}\0${r.effort}\0${r.tier}`);
  return [...groups.values()]
    .map((group) => {
      const [first] = group as [Row];
      const tokens = group.reduce((sum, r) => sum + r.output, 0);
      const genMs = group.reduce((sum, r) => sum + r.gen_ms, 0);
      return {
        model: first.model,
        effort: first.effort,
        tier: first.tier,
        tps: (tokens / genMs) * 1000,
        median: median(group.map((r) => (r.output / r.gen_ms) * 1000)),
        ttftMs: median(group.map((r) => r.ttft_ms)),
        responses: group.length,
        tokens,
      };
    })
    .toSorted((a, b) => b.tps - a.tps);
};

export const query = (db: Database, from: number, source?: string) =>
  db
    .query<Row, { from: number; source: string | null }>(
      `select tool, model, effort, tier, output, ttft_ms, gen_ms from responses
       where at >= $from and ($source is null or source = $source)`,
    )
    .all({ from, source: source ?? null });

export const render = (rows: Line[]) => {
  const table = [
    ["model", "effort", "tier", "t/s", "median", "ttft", "responses", "tokens"],
    ...rows.map((l) => [
      l.model,
      l.effort,
      l.tier,
      Math.round(l.tps).toString(),
      Math.round(l.median).toString(),
      `${(l.ttftMs / 1000).toFixed(1)}s`,
      l.responses.toString(),
      l.tokens.toLocaleString("en-US"),
    ]),
  ];
  const widths = table[0]!.map((_, i) => Math.max(...table.map((row) => row[i]!.length)));
  return table
    .map((row) =>
      row.map((cell, i) => (i < 3 ? cell.padEnd(widths[i]!) : cell.padStart(widths[i]!))).join("  "),
    )
    .join("\n");
};
