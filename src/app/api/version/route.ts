// GET /api/version → {v}: changes whenever road data changes (lib/events/version.ts). Never cached.
import { NextResponse } from "next/server";
import { hasDb } from "@/lib/db/supabase.ts";
import { dataVersion } from "@/lib/events/version.ts";

export const dynamic = "force-dynamic";

export async function GET() {
  const v = hasDb() ? await dataVersion().catch(() => null) : null;
  return NextResponse.json({ ok: true, data: { v } }, { headers: { "Cache-Control": "no-store" } });
}
