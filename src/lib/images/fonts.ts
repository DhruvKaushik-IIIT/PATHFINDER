// Server-only: make sharp's SVG text (librsvg + fontconfig) find a font on Vercel, where functions ship no
// system fonts — without this the labels on annotated photos come out blank. Writes a tiny fonts.conf to
// /tmp pointing at the bundled Inter TTFs (./fonts, traced into the bundle by next.config.ts) and sets
// FONTCONFIG_FILE before the first render. Locally (no VERCEL env) the system fonts are used as before.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

let done = false;

export function ensureFonts(): void {
  if (done || process.env.FONTCONFIG_FILE || !(process.env.VERCEL || process.env.PF_BUNDLED_FONTS)) return;
  done = true;
  try {
    const dir = path.join(process.cwd(), "fonts");
    if (!existsSync(path.join(dir, "Inter-Regular.ttf"))) return;
    const cache = "/tmp/pf-fontcache";
    mkdirSync(cache, { recursive: true });
    const conf = "/tmp/pf-fonts.conf";
    writeFileSync(
      conf,
      `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><dir>${dir}</dir><cachedir>${cache}</cachedir>` +
        `<alias><family>sans-serif</family><prefer><family>Inter</family></prefer></alias>` +
        `<alias><family>Helvetica</family><prefer><family>Inter</family></prefer></alias>` +
        `<alias><family>Arial</family><prefer><family>Inter</family></prefer></alias></fontconfig>`,
    );
    process.env.FONTCONFIG_FILE = conf;
  } catch (err) {
    console.warn(JSON.stringify({ level: "warn", event: "fonts_setup_failed", message: (err as Error).message }));
  }
}

ensureFonts();
