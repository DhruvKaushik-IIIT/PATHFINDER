// POST /api/official/logout → ends the session (Supabase logout + clear cookies).
import { NextResponse } from "next/server";
import { signOut } from "@/lib/official/auth.ts";

export const dynamic = "force-dynamic";

export async function POST() {
  await signOut().catch(() => {});
  return NextResponse.json({ ok: true, data: null });
}
