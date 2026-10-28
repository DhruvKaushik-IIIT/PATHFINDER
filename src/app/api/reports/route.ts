// POST /api/reports (multipart: photo, lat, lng, text?) → privacy pass + measurements → stored report.
// Phase 1 Part A: photo pipeline only. Claim, snapping and the event come in Part B.
// Contract (CLAUDE.md 5.7): never an error page for AI trouble → { ok: true, data, degraded? }.
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasDb, insert, publicUrl, select, upload } from "@/lib/db/supabase.ts";
import { preparePhoto, processPhoto } from "@/lib/reports/processPhoto.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 15 * 1024 * 1024;

// Pan bounds of the app (North India) — reports far outside are a bad GPS fix or a bad client.
const Input = z.object({
  lat: z.coerce.number().min(26).max(35),
  lng: z.coerce.number().min(72).max(82),
  text: z.string().trim().max(1000).optional(),
});

interface PhotoRow {
  id: string;
  report_id: string;
  public_url: string | null;
  measurements: unknown;
  faces_blurred: boolean;
}

const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return bad("expected multipart/form-data");
  }
  const parsed = Input.safeParse({
    lat: form.get("lat"),
    lng: form.get("lng"),
    text: form.get("text") ?? undefined,
  });
  if (!parsed.success) return bad(`invalid input: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
  const photo = form.get("photo");
  if (!(photo instanceof File) || !photo.type.startsWith("image/")) return bad("photo (image file) is required");
  if (photo.size > MAX_BYTES) return bad("photo is larger than 15 MB", 413);

  let prepared;
  try {
    prepared = await preparePhoto(Buffer.from(await photo.arrayBuffer()));
  } catch {
    return bad("could not read the image");
  }

  if (!hasDb()) {
    // No storage configured: still analyse, but nothing is saved.
    const p = await processPhoto(prepared);
    return NextResponse.json({
      ok: true,
      data: { reportId: null, measurements: p.measurements, facesBlurred: p.facesBlurred, sam: p.sam },
      degraded: ["database not configured — report not saved", ...p.degraded].join("; "),
    });
  }

  try {
    // Same photo again → reuse the stored analysis, never pay for AI twice (5.4).
    const [known] = await select<PhotoRow>(
      "photos",
      `sha256=eq.${prepared.sha256}&select=id,report_id,public_url,measurements,faces_blurred&limit=1`,
    );
    if (known) {
      return NextResponse.json({
        ok: true,
        data: {
          reportId: known.report_id, photoId: known.id, publicUrl: known.public_url,
          measurements: known.measurements, facesBlurred: known.faces_blurred, duplicate: true,
        },
      });
    }

    const p = await processPhoto(prepared);
    const { lat, lng, text } = parsed.data;
    const [report] = await insert<{ id: string }>("reports", {
      lat, lng, text: text || null, media_type: "photo", status: "pending",
    });
    const id = report!.id;
    const originalPath = await upload("photos-original", `${id}.jpg`, p.original, "image/jpeg");
    const publicPath = await upload("photos-public", `${id}${p.facesBlurred ? "" : "-thumb"}.jpg`, p.public, "image/jpeg");
    const [row] = await insert<{ id: string }>("photos", {
      report_id: id,
      sha256: p.sha256,
      original_url: `photos-original/${originalPath}`,
      public_url: publicUrl("photos-public", publicPath),
      width: p.width,
      height: p.height,
      sam_masks: p.sam,
      measurements: p.measurements,
      faces_blurred: p.facesBlurred,
      source: "traveller",
    });
    // TODO(phase-1 part B): voice → transcript, writeClaim(), snap to segment, verifyClaim() → event.

    return NextResponse.json({
      ok: true,
      data: {
        reportId: id,
        photoId: row!.id,
        publicUrl: publicUrl("photos-public", publicPath),
        measurements: p.measurements,
        facesBlurred: p.facesBlurred,
        blurredRegions: p.blurredRegions,
        sam: p.sam.map(({ concept, ok, boxes, areaPct }) => ({ concept, ok, found: boxes.length, areaPct })),
        samCostUsd: p.samCostUsd,
      },
      ...(p.degraded.length && { degraded: p.degraded.join("; ") }),
    });
  } catch (err) {
    // Database/storage trouble is a real server error (not an AI fallback case) — report it, don't crash.
    console.error("[reports] save failed:", (err as Error).message);
    return NextResponse.json({ ok: false, error: "could not save the report, please try again" }, { status: 503 });
  }
}
