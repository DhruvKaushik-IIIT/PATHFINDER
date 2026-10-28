// Server-only: auth for /api/cron/* — Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
// Without CRON_SECRET the cron routes only run in development.
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}`;
}
