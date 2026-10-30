// POST /api/events/[id]/fit — "Can my vehicle cross?" (Phase 6C).
// multipart: vehicle (photo) [+ roofLoad=1] [+ vehicleId / category to confirm]  ·  or JSON { vehicleId | category, roofLoad? }
// → { stage: "confirm", identified } (pick / confirm the vehicle) or { stage: "report", report }.
// The vehicle photo is used for this check only (blurred first, never stored). AI trouble never errors (5.7).
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasDb } from "@/lib/db/supabase.ts";
import { checkVehicleFit } from "@/lib/fit/check.ts";
import { CATEGORY_IDS } from "@/lib/fit/vehicles.ts";
import { preparePhoto } from "@/lib/reports/processPhoto.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
const Sel = z.object({
  vehicleId: z.string().trim().max(64).optional(),
  category: z.enum(CATEGORY_IDS).optional(),
  roofLoad: z.union([z.boolean(), z.enum(["1", "0", "true", "false"])]).optional().transform((x) => x === true || x === "1" || x === "true"),
});
const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return bad("invalid event id");
  if (!hasDb()) return bad("database not configured", 503);

  let sel: z.infer<typeof Sel>;
  let photo: File | null = null;
  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    if (!form) return bad("expected multipart/form-data");
    const p = Sel.safeParse({ vehicleId: form.get("vehicleId") ?? undefined, category: form.get("category") ?? undefined, roofLoad: form.get("roofLoad") ?? undefined });
    if (!p.success) return bad("invalid vehicle");
    sel = p.data;
    const f = form.get("vehicle");
    if (f instanceof File) {
      if (!f.type.startsWith("image/")) return bad("vehicle must be an image");
      if (f.size > MAX_PHOTO_BYTES) return bad("photo is larger than 15 MB", 413);
      photo = f;
    }
  } else {
    const p = Sel.safeParse(await req.json().catch(() => ({})));
    if (!p.success) return bad("invalid vehicle");
    sel = p.data;
  }
  if (!photo && !sel.vehicleId && !sel.category) return bad("send a vehicle photo, a vehicleId or a category");

  try {
    const prepared = photo ? await preparePhoto(Buffer.from(await photo.arrayBuffer())).catch(() => null) : null;
    if (photo && !prepared) return bad("could not read the image");
    const res = await checkVehicleFit(id, { photo: prepared, vehicleId: sel.vehicleId, category: sel.category, roofLoad: sel.roofLoad });
    if (!res) return bad("event not found or already cleared", 404);
    const { degraded, ...data } = res;
    return NextResponse.json({ ok: true, data, ...(degraded.length && { degraded: degraded.join("; ") }) });
  } catch (err) {
    console.error("[fit] failed:", (err as Error).message);
    return NextResponse.json({ ok: false, error: "the check couldn't run right now, please try again" }, { status: 503 });
  }
}
