// POST /api/official/updates (multipart: eventId, photo, status, pctCleared, fullyOpenBy?, machines?, voice?)
// → Field update: photo (required) + SAM progress check + event status/ETA/timeline. Then Road Watch
// re-checks trips through that spot (after the response, event-driven — CLAUDE.md 5.4).
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { FieldError, postFieldUpdate } from "@/lib/official/fieldUpdate.ts";
import { requireOfficial } from "@/lib/official/guard.ts";
import { roadWatchAfterChange } from "@/lib/watch/roadWatch.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
const MAX_VOICE_BYTES = 10 * 1024 * 1024;

const Fields = z.object({
  eventId: z.string().uuid(),
  status: z.enum(["clearing", "one_lane", "open"]),
  pctCleared: z.coerce.number().int().min(0).max(100),
  fullyOpenBy: z.string().regex(/^\d{1,2}:\d{2}$/).nullable(),
  machines: z.string().max(200),
});

export async function POST(req: Request) {
  const official = await requireOfficial();
  if (official instanceof NextResponse) return official;
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok: false, error: "multipart form expected" }, { status: 400 });
  const photo = form.get("photo");
  const voice = form.get("voice");
  if (!(photo instanceof File) || !photo.type.startsWith("image/")) return NextResponse.json({ ok: false, error: "A progress photo is required." }, { status: 400 });
  if (photo.size > MAX_PHOTO_BYTES) return NextResponse.json({ ok: false, error: "Photo is larger than 15 MB." }, { status: 413 });
  if (voice !== null && !(voice instanceof File && /wav/.test(voice.type) && voice.size <= MAX_VOICE_BYTES)) {
    return NextResponse.json({ ok: false, error: "Voice note must be a WAV under 10 MB." }, { status: 400 });
  }
  const f = Fields.safeParse({
    eventId: form.get("eventId"),
    status: form.get("status"),
    pctCleared: form.get("pctCleared"),
    fullyOpenBy: form.get("fullyOpenBy") || null,
    machines: form.get("machines") ?? "",
  });
  if (!f.success) return NextResponse.json({ ok: false, error: "Check the status, % cleared and time." }, { status: 400 });
  try {
    const data = await postFieldUpdate(official, {
      ...f.data,
      photo: Buffer.from(await photo.arrayBuffer()),
      voiceWav: voice instanceof File ? Buffer.from(await voice.arrayBuffer()) : null,
    });
    after(() => roadWatchAfterChange([data.point]));
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    if (err instanceof FieldError) return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    console.error("[official] field update failed:", (err as Error).message);
    return NextResponse.json({ ok: false, error: "Couldn't post the update — try again" }, { status: 503 });
  }
}
