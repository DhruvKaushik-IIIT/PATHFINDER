// Versioned prompt: Muse Image illustration for a shareable alert card (frame 11). The illustration has
// NO text — the exact English + Hindi lines are set by code next to it (an image model can misspell
// Devanagari, and this goes to the public). Never built from an evidence photo (CLAUDE.md 6.2 rule 4).
export const ALERT_ART_PROMPT_VERSION = "alert-art-v1";

const SCENE: Record<string, string> = {
  landslide: "a pile of brown rocks and earth from a landslide spilling across part of the road",
  snow: "the road covered in white snow with snowbanks on both sides",
  ice: "the road glazed with shiny ice and a little snow at the edges",
  flood_water: "muddy water flowing across the road from a stream",
  road_damage: "the outer edge of the road broken away, a gap falling toward the valley",
  pothole: "several potholes in the road surface",
  traffic: "a long line of small cars and buses queued on the road",
  accident: "a warning triangle and a stopped vehicle on the road",
  closure_notice: "a red and white barrier closing the road",
  clear: "the road open and clear",
  other: "orange traffic cones on the road",
};
const STATE: Record<string, string> = {
  closed: "No vehicles can pass; a red and white barrier stands in front of it.",
  one_lane: "One narrow lane is still open beside it.",
  slow: "Traffic moves slowly past it.",
  open: "The road is open.",
  unknown: "",
};

export function alertArtPrompt(type: string, status: string): string {
  return [
    "Flat vector illustration for a road-alert card, wide 2:1 landscape, simple shapes, no outlines, muted colours.",
    "A two-lane mountain highway in the Himalayan foothills of Himachal Pradesh, India, seen from the driver's seat,",
    "curving toward green and grey hills under a pale grey sky.",
    `On the road ahead: ${SCENE[type] ?? SCENE.other}. ${STATE[status] ?? ""}`,
    "Calm and informative, not dramatic. No people, no faces, no number plates, no logos.",
    "Absolutely no text, letters, numbers, signs with writing or watermarks anywhere in the image.",
  ].join(" ");
}
