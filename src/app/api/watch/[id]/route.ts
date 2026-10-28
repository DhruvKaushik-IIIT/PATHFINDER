// DELETE /api/watch/[id] → stop watching (only the device that owns the trip can).
import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUserId } from "@/lib/me.ts";
import { unwatchTrip } from "@/lib/watch/roadWatch.ts";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return NextResponse.json({ ok: false, error: "bad id" }, { status: 400 });
  try {
    const uid = await currentUserId();
    if (!uid || !(await unwatchTrip(uid, id.data))) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true, data: { id: id.data, active: false } });
  } catch (err) {
    console.error("[watch] delete failed:", (err as Error).message);
    return NextResponse.json({ ok: false, error: "please try again" }, { status: 503 });
  }
}
