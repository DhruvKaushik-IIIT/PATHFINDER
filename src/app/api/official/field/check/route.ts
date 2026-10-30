// POST /api/official/field/check (multipart: eventId, photo) → SAM measurements of the progress photo +
// the event's baseline photo, for the live "AI check" on the Field update screen. ~$0.02 (SAM), cached
// by photo hash so posting the same photo doesn't run SAM again.
import { NextResponse } from "next/server";
import { checkFieldPhoto, FieldError } from "@/lib/official/fieldUpdate.ts";
import { requireOfficial } from "@/lib/official/guard.ts";
import { checkLimit, limitedResponse } from "@/lib/guard/rateLimit.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

export async function POST(req: Request) {
  const limited = checkLimit(req, "official");
  if (limited) return limitedResponse(limited);
  const official = await requireOfficial();
  if (official instanceof NextResponse) return official;
  const form = await req.formData().catch(() => null);
  const photo = form?.get("photo");
  const eventId = String(form?.get("eventId") ?? "");
  if (!(photo instanceof File) || !photo.type.startsWith("image/")) return NextResponse.json({ ok: false, error: "A photo is required." }, { status: 400 });
  if (photo.size > MAX_PHOTO_BYTES) return NextResponse.json({ ok: false, error: "Photo is larger than 15 MB." }, { status: 413 });
  try {
    return NextResponse.json({ ok: true, data: await checkFieldPhoto(official, eventId, Buffer.from(await photo.arrayBuffer())) });
  } catch (err) {
    if (err instanceof FieldError) return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    console.error("[official] field check failed:", (err as Error).message);
    return NextResponse.json({ ok: true, data: { now: null, before: null, facesBlurred: false }, degraded: "AI check unavailable right now" });
  }
}
