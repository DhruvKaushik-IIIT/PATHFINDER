// Server-only: blur faces + number plates before a photo can be public (CLAUDE.md 6.2 rule 5).
// Boxes come from SAM ("face", "license plate"). If SAM couldn't run we can't know what's in
// the photo, so the public copy becomes a small, heavily blurred thumbnail (5.7 last resort).
import sharp from "sharp";
import type { SamBox } from "../ai/sam.ts";

const PAD = 0.25; // grow each box by 25% per side — SAM boxes are tight, hair/plate frames stick out

export async function blurRegions(jpeg: Buffer, boxes: SamBox[]): Promise<Buffer> {
  if (!boxes.length) return jpeg;
  const { width: W = 0, height: H = 0 } = await sharp(jpeg).metadata();
  const patches = await Promise.all(
    boxes.map(async (b) => {
      const pw = (b.right - b.left) * PAD;
      const ph = (b.bottom - b.top) * PAD;
      const left = Math.max(0, Math.floor(b.left - pw));
      const top = Math.max(0, Math.floor(b.top - ph));
      const width = Math.min(W - left, Math.ceil(b.right - b.left + 2 * pw));
      const height = Math.min(H - top, Math.ceil(b.bottom - b.top + 2 * ph));
      if (width < 2 || height < 2) return null;
      // Pixelate (down then up) and blur: unrecoverable, and reads clearly as "redacted".
      const small = await sharp(jpeg)
        .extract({ left, top, width, height })
        .resize(Math.max(1, Math.round(width / 12)), Math.max(1, Math.round(height / 12)))
        .toBuffer();
      const input = await sharp(small).resize(width, height, { kernel: "nearest" }).blur(4).toBuffer();
      return { input, left, top };
    }),
  );
  return sharp(jpeg)
    .composite(patches.filter((p) => p !== null))
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
}

/** Used when the privacy pass could not run: nothing identifiable survives at 160 px + blur 12. */
export function heavyBlurThumb(jpeg: Buffer): Promise<Buffer> {
  return sharp(jpeg).resize(160, 160, { fit: "inside" }).blur(12).jpeg({ quality: 70 }).toBuffer();
}
