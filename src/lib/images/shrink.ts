// Browser-only: phone photos are 3–8 MB; Vercel functions accept ~4.5 MB. Resize to ≤1600 px JPEG
// before upload (the server resizes to 1280 anyway).
export async function shrinkPhoto(file: File | Blob): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.9));
    return blob ?? file;
  } catch {
    return file; // e.g. HEIC on a browser that can't decode it: let the server try
  }
}
