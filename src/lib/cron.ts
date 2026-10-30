// Server-only: auth for /api/cron/* — Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
// Without CRON_SECRET the cron routes only run in development (production refuses every call).
import { createHash, timingSafeEqual } from "node:crypto";

const digest = (s: string) => createHash("sha256").update(s).digest();

export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  // Constant-time compare (hashes make the lengths equal).
  const ok = timingSafeEqual(digest(req.headers.get("authorization") ?? ""), digest(`Bearer ${secret}`));
  if (!ok) console.warn(JSON.stringify({ level: "warn", event: "cron_unauthorized", path: new URL(req.url).pathname }));
  return ok;
}
