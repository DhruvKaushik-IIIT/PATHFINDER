// Browser-only: when was a library photo taken? EXIF DateTimeOriginal (read before the canvas resize
// strips it), else the file's last-modified time. EXIF has no time zone: phones write local time, so
// it is read as IST. Camera shots from /report are "now" and don't need this.
const EXIF_DATE = /(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/g;

export async function takenAt(file: File): Promise<string | null> {
  try {
    const head = new Uint8Array(await file.slice(0, 128 * 1024).arrayBuffer());
    const text = Array.from(head, (b) => String.fromCharCode(b)).join("");
    // DateTimeOriginal is usually the 2nd date (after DateTime); take the earliest plausible one.
    const dates = [...text.matchAll(EXIF_DATE)]
      .map((m) => Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+05:30`))
      .filter((t) => Number.isFinite(t) && t > Date.UTC(2005, 0, 1));
    if (dates.length) return new Date(Math.min(...dates)).toISOString();
  } catch {
    /* unreadable → fall back */
  }
  return file.lastModified ? new Date(file.lastModified).toISOString() : null;
}
