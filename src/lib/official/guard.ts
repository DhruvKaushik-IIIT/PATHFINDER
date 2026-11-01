// Server-only: shared session check for /api/official/* route handlers.
import { NextResponse } from "next/server";
import { hasDb } from "../db/supabase.ts";
import { currentOfficial, type Official } from "./auth.ts";

/** The signed-in official, or the error response to return (401 signed out, 503 no database/auth). */
export async function requireOfficial(): Promise<Official | NextResponse> {
  if (!hasDb()) return NextResponse.json({ ok: false, error: "database not configured" }, { status: 503 });
  try {
    const official = await currentOfficial();
    return official ?? NextResponse.json({ ok: false, error: "signed out" }, { status: 401 });
  } catch (err) {
    console.error("[official] session check failed:", (err as Error).message);
    return NextResponse.json({ ok: false, error: "Sign-in service unavailable" }, { status: 503 });
  }
}

/** Office-only routes (dispatch, queue, advisories, slope inspections): crew accounts get 403. */
export async function requireOffice(): Promise<Official | NextResponse> {
  const who = await requireOfficial();
  if (who instanceof NextResponse) return who;
  if (who.role === "crew") return NextResponse.json({ ok: false, error: "Crew accounts see their own job only." }, { status: 403 });
  return who;
}

/** Crew-only routes (/api/crew/*): the signed-in crew member with their worker row. */
export async function requireCrew(): Promise<(Official & { worker: NonNullable<Official["worker"]> }) | NextResponse> {
  const who = await requireOfficial();
  if (who instanceof NextResponse) return who;
  if (who.role !== "crew" || !who.worker) return NextResponse.json({ ok: false, error: "Crew accounts only." }, { status: 403 });
  return who as Official & { worker: NonNullable<Official["worker"]> };
}
