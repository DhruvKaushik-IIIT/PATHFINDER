// GET /api/alerts → this device's alerts (newest first) + unread count · POST /api/alerts {read:"all"} → mark read.
import { NextResponse } from "next/server";
import { select, update, hasDb } from "@/lib/db/supabase.ts";
import { currentUserId } from "@/lib/me.ts";
import type { Alert } from "@/lib/watch/types.ts";

export const dynamic = "force-dynamic";

interface Row {
  id: string;
  kind: Alert["kind"];
  title: string;
  body: string | null;
  data: Alert["data"];
  read: boolean;
  created_at: string;
}

export async function GET() {
  if (!hasDb()) return NextResponse.json({ ok: true, data: { alerts: [], unread: 0 }, degraded: "database not configured" });
  try {
    const uid = await currentUserId();
    if (!uid) return NextResponse.json({ ok: true, data: { alerts: [], unread: 0 } });
    const rows = await select<Row>("alerts", `select=id,kind,title,body,data,read,created_at&user_id=eq.${uid}&order=created_at.desc&limit=30`);
    const alerts: Alert[] = rows.map((r) => ({ id: r.id, kind: r.kind, title: r.title, body: r.body, data: r.data, read: r.read, createdAt: r.created_at }));
    return NextResponse.json({ ok: true, data: { alerts, unread: alerts.filter((a) => !a.read).length } });
  } catch (err) {
    console.error("[alerts] list failed:", (err as Error).message);
    return NextResponse.json({ ok: true, data: { alerts: [], unread: 0 }, degraded: "alerts unavailable right now" });
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { read?: string } | null;
  if (body?.read !== "all") return NextResponse.json({ ok: false, error: '{"read":"all"} expected' }, { status: 400 });
  try {
    const uid = await currentUserId();
    if (uid) await update("alerts", `user_id=eq.${uid}&read=is.false`, { read: true });
    return NextResponse.json({ ok: true, data: null });
  } catch {
    return NextResponse.json({ ok: true, data: null, degraded: "couldn't mark alerts read" });
  }
}
