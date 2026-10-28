"use client";

// Draws the alert card into a PNG in the browser (phones have Devanagari fonts; the server may not).
import type { AlertCard } from "@/lib/share/types";

const HEAD: Record<AlertCard["status"], string> = { closed: "#B3261E", one_lane: "#C25E00", slow: "#C25E00", open: "#1E7B45", unknown: "#6E6E73" };
const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, "Noto Sans Devanagari", system-ui, sans-serif';

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, lh: number, maxLines = 3): number {
  const words = text.split(/\s+/);
  let line = "";
  let lines = 0;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > max && line) {
      ctx.fillText(lines === maxLines - 1 ? `${line}…` : line, x, y);
      y += lh;
      if (++lines >= maxLines) return y;
      line = w;
    } else line = test;
  }
  if (line) {
    ctx.fillText(line, x, y);
    y += lh;
  }
  return y;
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

export async function drawCard(card: AlertCard, updated: string): Promise<Blob> {
  const W = 1080;
  const pad = 56;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = 1240;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, c.height);
  ctx.fillStyle = HEAD[card.status];
  ctx.fillRect(0, 0, W, 112);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `700 38px ${FONT}`;
  ctx.fillText("PATHFINDER ROAD ALERT", pad, 72);
  try {
    ctx.drawImage(await loadImage(card.artUrl), 0, 112, W, 540);
  } catch {
    ctx.fillStyle = "#9AA3A9";
    ctx.fillRect(0, 112, W, 540);
  }
  let y = 652 + 84;
  ctx.fillStyle = "#1D1D1F";
  ctx.font = `700 54px ${FONT}`;
  y = wrap(ctx, card.title, pad, y, W - pad * 2, 64, 2) + 8;
  if (card.titleHi) {
    ctx.font = `600 40px ${FONT}`;
    y = wrap(ctx, card.titleHi, pad, y, W - pad * 2, 54, 3) + 6;
  }
  if (card.detail) {
    ctx.fillStyle = "#48484A";
    ctx.font = `400 38px ${FONT}`;
    y = wrap(ctx, card.detail, pad, y, W - pad * 2, 50, 2) + 6;
  }
  ctx.fillStyle = "#6E6E73";
  ctx.font = `400 32px ${FONT}`;
  const footY = Math.min(y + 20, c.height - 50);
  ctx.fillText(`Updated ${updated} · verify with official sources`, pad, footY);
  // Trim the unused space below the footer.
  const out = document.createElement("canvas");
  out.width = W;
  out.height = footY + 48;
  out.getContext("2d")!.drawImage(c, 0, 0);
  return new Promise((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error("canvas"))), "image/png"));
}
