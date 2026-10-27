// Server-only: normalise a photo before storage or any AI call (CLAUDE.md 5.4, 6.2).
// Output is a JPEG with ALL metadata dropped (EXIF/GPS/XMP), auto-rotated, max 1280 px.
import sharp from "sharp";

export const MAX_SIDE = 1280;

export async function prepareImage(input: Buffer): Promise<{ jpeg: Buffer; width: number; height: number }> {
  // sharp drops metadata unless .withMetadata()/.keepMetadata() is called — never call them here.
  const { data, info } = await sharp(input)
    .rotate() // apply EXIF orientation before it is stripped
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return { jpeg: data, width: info.width, height: info.height };
}
