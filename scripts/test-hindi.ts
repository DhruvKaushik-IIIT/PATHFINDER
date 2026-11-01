// B2 + B3 checks: trip titles (no network) and the Hindi repair (one live Meta call, ~$0.001).
// Usage: pnpm test:hindi   (AI_MODE=mock skips the live call)
import { tripTitle } from "../src/lib/watch/types.ts";
import { devanagariCount } from "../src/lib/ai/schemas.ts";
import { ensureHindi } from "../src/lib/ai/router.ts";

let failed = 0;
const check = (name: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${name}${extra ? `  — ${extra}` : ""}`);
  if (!ok) failed++;
};

check("'Your location' start → 'Your trip to Manali'", tripTitle("Your location", "Manali") === "Your trip to Manali");
check("named start → 'Your Mandi → Manali trip'", tripTitle("Mandi", "Manali") === "Your Mandi → Manali trip");
check("Latin 'Hindi' has no Devanagari", devanagariCount("Bhusklhan se sadak ki ek lane band hai") === 0);

const good = "भूस्खलन से सड़क की एक लेन बंद है।";
check("real Devanagari kept as is (no AI call)", (await ensureHindi("Landslide blocks one lane.", good)) === good);

if (process.env.AI_MODE !== "mock") {
  const t0 = Date.now();
  const fixed = await ensureHindi(
    "Landslide debris with rocks and fallen trees blocks one lane of the road, leaving one lane partially clear.",
    "Bhusklhan se sadak ki ek lane band hai, ped aur patthar gire hue hain, ek lane khuli hai.",
  );
  check("Latin script → repaired into Devanagari", devanagariCount(fixed) >= 5, `${Date.now() - t0} ms · ${fixed}`);
}

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
