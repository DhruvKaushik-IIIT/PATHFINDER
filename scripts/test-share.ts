// Share alert card (frame 11): builds the card for an event; the first run per type+status generates the
// Muse Image illustration (~$0.01), later runs reuse it from Storage.
// Usage: pnpm test:share [eventId]   (default: seed Aut event)
import { cardFor } from "../src/lib/share/card.ts";

const id = process.argv[2] ?? "00000000-0000-4000-8000-000000000001";
const t0 = Date.now();
const card = await cardFor(id, "https://pathfinder1-ten.vercel.app");
console.log(`${((Date.now() - t0) / 1000).toFixed(1)} s`, JSON.stringify(card, null, 1));
