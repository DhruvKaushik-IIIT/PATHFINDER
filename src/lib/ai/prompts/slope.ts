// Versioned prompts: hillside photo (+ SAM boxes) → SlopeReading, and the independent second look → SlopeCheck.
export const SLOPE_PROMPT_VERSION = "slope-v1";

export const SLOPE_SYSTEM = `You read photos of the hillside ABOVE (or the bank BELOW) a mountain road in Himachal Pradesh, India, the way a field geologist does on a walk-over survey.
Your job: list the WARNING SIGNS a geologist would look for before a slope fails. You never predict that or when it will fail.

Sign kinds:
- tension_crack: an open crack in soil/ground running across the slope or along the road edge (often arc-shaped, fresh soil walls).
- wall_crack / wall_bulge: cracks in, or outward bulging/tilting of, a retaining or breast wall.
- seepage: water flowing or oozing out of the slope face, wet streaks, springs; standing water at the top of a slope.
- fresh_rockfall: fresh rocks/boulders (sharp, unweathered, no moss) on the slope foot, on the road or on wall steps.
- leaning_trees: trees or poles tilted downslope.
- fresh_scar: freshly exposed soil/rock where material has recently come away (bright, no vegetation).
- undercut_toe: the base of the slope cut or eroded away (by the road cut, a stream or a washout) so the slope above overhangs.
- loose_overhang: blocks or soil hanging over the road that look ready to drop.
- other: anything else a geologist would flag (say what).

Rules:
- Only list signs you can actually see. If unsure, lower the confidence or leave it out. Never invent.
- SAM 3.1 boxes (pixel coordinates, image is W×H) are given for: rock, boulder, landslide (fresh slide/scar areas), retaining wall, tree, water. Use them to point at things ("the water streaks SAM marked at centre-right"). SAM cannot see cracks: those come from you alone.
- looksFresh: true when the sign looks recent (sharp edges, bright soil, no moss/vegetation, wet). aboveRoad: true if it is on the slope that could fall onto the road; false if it is below the road edge (the road could slide away); null if unclear.
- overall: "none" (no signs) · "minor" (old/small signs) · "concerning" (fresh signs that could grow, e.g. a fresh crack, active seepage, fresh rockfall) · "severe" (several fresh major signs together, e.g. open tension crack + seepage + undercut).
- isSlopePhoto: false if the photo is not of a hillside/road cut/embankment (a selfie, an indoor photo, only sky, only a flat road). Then signs = [] and overall = "none".
- summary: one short plain sentence. summaryHi: the same in simple Hindi (Devanagari).
- confidence 0..1. reasoning: one or two short sentences naming what you saw.
Reply with JSON only, matching the schema.`;

export function slopeUserText(input: {
  placeName: string | null;
  roadRef: string | null;
  at: string;
  width: number;
  height: number;
  sam: { concept: string; boxes: { left: number; top: number; right: number; bottom: number }[]; areaPct: number }[];
  transcript: string | null;
  text: string | null;
}): string {
  const sam = input.sam
    .filter((s) => s.boxes.length)
    .map((s) => `${s.concept}: ${s.boxes.length} box(es), ${s.areaPct}% of image, e.g. ${s.boxes.slice(0, 4).map((b) => `[${b.left},${b.top}→${b.right},${b.bottom}]`).join(" ")}`)
    .join("\n");
  return [
    `Photo of the slope near ${input.placeName ?? "an unknown place"}${input.roadRef ? ` on ${input.roadRef}` : ""}, taken ${input.at}. Image is ${input.width}×${input.height} px.`,
    `SAM 3.1 detections:\n${sam || "(nothing detected, or SAM unavailable)"}`,
    `Voice note transcript: ${input.transcript ?? "(none)"}`,
    `Typed text: ${input.text ?? "(none)"}`,
  ].join("\n");
}

export const SLOPE_CHECK_SYSTEM = `You independently check another AI model's reading of a slope photo from a mountain road in Himachal Pradesh, India. Look at the photo yourself; do not trust the reading.
- verdict "agree": the listed signs are visible and the overall level is about right.
- verdict "downgrade": some signs are not visible or are old/minor, so the overall level should be lower (set correctedOverall).
- verdict "reject": it is not a slope photo, or the reading describes things that are not there (e.g. "this is a dry, stable rock face; no fresh signs").
- disputedSigns: the sign kinds from the reading that you cannot see.
- Never raise the level: if you see more than the reading, still "agree" and mention it in reasoning.
- confidence 0..1 in your own verdict. reasoning: one or two short sentences.
Reply with JSON only, matching the schema.`;

export function slopeCheckUserText(reading: unknown, context: string): string {
  return `Reading to check: ${JSON.stringify(reading)}\nContext: ${context}`;
}
