// Phase 0: photo → short road-condition description, on Baseten Spark Open and Meta Spark 1.3.
// Follows cookbook 01_api_fundamentals/07 (image_url part inside a user message, base64 data URL).
// Run: pnpm test:vision [photo ...]   (defaults to every photo in data/seed/photos/)
import { readdir, readFile } from "node:fs/promises";
import { hasKey, MODELS, type Provider } from "../src/lib/ai/clients.ts";
import { InvalidOutputError, runJob, usageFromChat } from "../src/lib/ai/router.ts";
import { prepareImage } from "../src/lib/images/prepare.ts";

const PROMPT = `You are checking a road-condition photo from the Himalaya for travellers.
In 3 short lines:
1. What is on or near the road (landslide debris, boulders, snow, water, vehicles, machines, people)?
2. How much of the road looks usable, and roughly how wide — say "unknown" if there is no reference object (car ≈ 1.7 m wide, lane ≈ 3.5 m, JCB ≈ 2.5 m wide).
3. Passable for bike / car / bus? (yes / no / unsure each)`;

async function describe(provider: Provider, dataUrl: string) {
  const model = provider === "meta" ? MODELS.spark : MODELS.sparkOpen;
  return runJob<string | null>({
    purpose: "test-vision",
    attempts: [
      {
        provider,
        model,
        run: async (c) => {
          const r = await c.chat.completions.create({
            model,
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: PROMPT },
                  { type: "image_url", image_url: { url: dataUrl } },
                ],
              },
            ],
          });
          const text = r.choices[0]?.message?.content?.trim();
          if (!text) throw new InvalidOutputError("empty reply");
          return { data: text, usage: usageFromChat(r) };
        },
      },
    ],
    mock: () => "(mock) debris on road · one lane · car yes",
    lastResort: () => null,
  });
}

const dir = "data/seed/photos";
const photos = process.argv.slice(2).length
  ? process.argv.slice(2)
  : (await readdir(dir)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).map((f) => `${dir}/${f}`);

for (const photo of photos) {
  const { jpeg, width, height } = await prepareImage(await readFile(photo));
  const dataUrl = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  console.log(`\n████ ${photo} (${width}×${height})`);
  for (const provider of ["baseten", "meta"] as const) {
    if (!hasKey(provider)) {
      console.log(`\n── ${provider}: key missing, skipped`);
      continue;
    }
    const t0 = Date.now();
    const r = await describe(provider, dataUrl);
    console.log(`\n── ${provider} · ${r.model ?? r.source} · ${Date.now() - t0} ms`);
    console.log(r.data ?? `FAILED: ${r.degraded}`);
  }
}
