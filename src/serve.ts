import { events, type LogsPayload } from "./otlp.ts";
import { tracker } from "./responses.ts";
import { open, saver } from "./store.ts";

const local = (ip: string) => {
  const v4 = ip.replace(/^::ffff:/, "");
  if (v4 === "::1" || v4.startsWith("127.")) return true;
  const [a = 0, b = 0] = v4.split(".").map(Number);
  return a === 100 && b >= 64 && b < 128;
};

export const serve = (port = Number(Bun.env["SPEED_PORT"] ?? 4318)) => {
  const save = saver(open());
  const track = tracker();
  const server = Bun.serve({
    hostname: "0.0.0.0",
    port,
    async fetch(req, self) {
      if (!local(self.requestIP(req)?.address ?? "")) return new Response(null, { status: 403 });
      if (req.method !== "POST") return new Response(null, { status: 405 });
      if (!req.headers.get("content-type")?.includes("json")) return new Response(null, { status: 415 });
      if (new URL(req.url).pathname === "/v1/logs") {
        for (const event of events((await req.json()) as LogsPayload)) {
          const response = track(event);
          if (response) save(response);
        }
      }
      return Response.json({});
    },
  });
  console.log(`speed: collecting on :${server.port}`);
};
