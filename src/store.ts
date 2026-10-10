import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Response } from "./responses.ts";

export const dbPath =
  Bun.env["SPEED_DB"] ?? join(Bun.env["XDG_DATA_HOME"] ?? join(homedir(), ".local/share"), "speed/speed.db");

export const open = () => {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath, { strict: true });
  db.run("pragma journal_mode = wal");
  db.run(`create table if not exists responses (
    at integer not null,
    tool text not null,
    source text not null,
    model text not null,
    effort text not null,
    tier text not null,
    output integer not null,
    reasoning integer,
    ttft_ms integer not null,
    gen_ms integer not null,
    request_id text unique
  )`);
  db.run("create index if not exists responses_at on responses (at)");
  return db;
};

export const saver = (db: Database) => {
  const insert = db.prepare(`insert or ignore into responses
    (at, tool, source, model, effort, tier, output, reasoning, ttft_ms, gen_ms, request_id)
    values ($at, $tool, $source, $model, $effort, $tier, $output, $reasoning, $ttftMs, $genMs, $requestId)`);
  return (r: Response) => insert.run(r);
};
