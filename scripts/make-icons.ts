// Phase 6E: PWA icons, favicon, iOS splash screens and the OG image, drawn from the Welcome frame's app icon
// (blue rounded square, white lucide "mountain"). Re-run after a design change: node scripts/make-icons.ts
import { writeFile } from "node:fs/promises";
import sharp from "sharp";

const ACCENT = "#0071E3";
const LAND = "#E7EDE3";
// lucide "mountain" (24×24 viewBox): m8 3 4 8 5-5 5 15H2L8 3z
const MOUNTAIN = (x: number, y: number, size: number, stroke = "#FFFFFF") =>
  `<g transform="translate(${x} ${y}) scale(${size / 24})" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></g>`;

/** App icon: rounded square (or full-bleed for maskable / Apple, which round it themselves). */
function iconSvg(size: number, { fullBleed = false, glyph = 0.5 } = {}): string {
  const r = fullBleed ? 0 : size * 0.225;
  const g = size * glyph;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" fill="${ACCENT}"/>${MOUNTAIN((size - g) / 2, (size - g) / 2 + size * 0.01, g)}</svg>`;
}

const png = (svg: string) => sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();

/** .ico holding one PNG (all modern browsers accept PNG-in-ICO). */
function ico(p: Buffer, size: number): Buffer {
  const h = Buffer.alloc(22);
  h.writeUInt16LE(0, 0); h.writeUInt16LE(1, 2); h.writeUInt16LE(1, 4);
  h.writeUInt8(size >= 256 ? 0 : size, 6); h.writeUInt8(size >= 256 ? 0 : size, 7);
  h.writeUInt8(0, 8); h.writeUInt8(0, 9); h.writeUInt16LE(1, 10); h.writeUInt16LE(32, 12);
  h.writeUInt32LE(p.length, 14); h.writeUInt32LE(22, 18);
  return Buffer.concat([h, p]);
}

await writeFile("public/icons/icon-192.png", await png(iconSvg(192)));
await writeFile("public/icons/icon-512.png", await png(iconSvg(512)));
// Maskable: full bleed, glyph inside the 80% safe zone.
await writeFile("public/icons/maskable-512.png", await png(iconSvg(512, { fullBleed: true, glyph: 0.42 })));
await writeFile("src/app/apple-icon.png", await png(iconSvg(180, { fullBleed: true, glyph: 0.46 })));
await writeFile("src/app/icon.png", await png(iconSvg(512)));
await writeFile("src/app/favicon.ico", ico(await png(iconSvg(48)), 48));

// iOS launch screens (portrait iPhones): land colour + the icon + name.
for (const [w, h] of [[1170, 2532], [1179, 2556], [1290, 2796], [1125, 2436], [828, 1792], [750, 1334]] as const) {
  const s = Math.round(w * 0.22);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${LAND}"/>
    <g transform="translate(${(w - s) / 2} ${h * 0.4 - s / 2})">${iconSvg(s).replace(/<\/?svg[^>]*>/g, "")}</g>
    <text x="${w / 2}" y="${h * 0.4 + s * 0.85}" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="${Math.round(w * 0.075)}" font-weight="700" fill="#1D1D1F">Pathfinder</text></svg>`;
  await writeFile(`public/splash/iphone-${w}x${h}.png`, await png(svg));
}

// Open Graph / Twitter card 1200×630: map-coloured ground, a route line, glass card with the pitch.
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <rect width="1200" height="630" fill="${LAND}"/>
  <path d="M-20 520 C 180 470, 260 560, 420 470 S 640 300, 760 330 S 980 180, 1240 120" fill="none" stroke="#C7CFC2" stroke-width="30" stroke-linecap="round"/>
  <path d="M-20 520 C 180 470, 260 560, 420 470 S 640 300, 760 330 S 980 180, 1240 120" fill="none" stroke="#FFFFFF" stroke-width="22" stroke-linecap="round"/>
  <path d="M-20 520 C 180 470, 260 560, 420 470 S 640 300, 760 330 S 980 180, 1240 120" fill="none" stroke="${ACCENT}" stroke-width="12" stroke-linecap="round"/>
  <path d="M 860 210 C 940 200, 1000 260, 1060 240" fill="none" stroke="#7B5CD6" stroke-opacity="0.85" stroke-width="16" stroke-dasharray="14 10" stroke-linecap="round"/>
  <circle cx="760" cy="330" r="17" fill="#C25E00" stroke="#FFFFFF" stroke-width="6"/>
  <circle cx="420" cy="470" r="17" fill="#B3261E" stroke="#FFFFFF" stroke-width="6"/>
  <rect x="64" y="64" width="660" height="330" rx="34" fill="#FAFAFC" fill-opacity="0.92" stroke="#FFFFFF" stroke-width="2"/>
  <g transform="translate(100 100)">${iconSvg(96).replace(/<\/?svg[^>]*>/g, "")}</g>
  <text x="222" y="168" font-family="Inter, Helvetica, Arial, sans-serif" font-size="58" font-weight="800" fill="#1D1D1F">Pathfinder</text>
  <text x="100" y="262" font-family="Inter, Helvetica, Arial, sans-serif" font-size="31" font-weight="600" fill="#1D1D1F">Live, AI-verified road conditions</text>
  <text x="100" y="302" font-family="Inter, Helvetica, Arial, sans-serif" font-size="31" font-weight="600" fill="#1D1D1F">for Himachal Pradesh</text>
  <text x="100" y="352" font-family="Inter, Helvetica, Arial, sans-serif" font-size="24" fill="#48484A">Decides the safe route · Google Maps drives it</text>
  <rect x="64" y="540" width="560" height="54" rx="27" fill="#FAFAFC" fill-opacity="0.92"/>
  <text x="92" y="575" font-family="Inter, Helvetica, Arial, sans-serif" font-size="22" font-weight="600" fill="#0058B0">Built with Meta Muse models · SAM 3.1</text>
</svg>`;
await writeFile("src/app/opengraph-image.png", await sharp(Buffer.from(og)).png({ compressionLevel: 9 }).toBuffer());
await writeFile("src/app/twitter-image.png", await sharp(Buffer.from(og)).png({ compressionLevel: 9 }).toBuffer());
console.log("icons, favicon, splash screens and OG image written");
