// Versioned prompt (B3, Nov 2): one short English road-condition sentence → simple Hindi in Devanagari.
// Used only when a model returned "Hindi" in Latin script (e.g. "Bhusklhan se sadak…"). Translation only.
export const HINDI_PROMPT_VERSION = "hindi-v1";

export const HINDI_SYSTEM = `You translate one short road-condition sentence from Himachal Pradesh, India, into simple Hindi.
Write the Hindi in Devanagari script only (never Latin letters / Hinglish). Keep place names and road numbers
(NH-3, MDR-23) as they are. Translate only: do not add facts, numbers or advice. Reply with JSON only, matching the schema.`;

export const hindiUserText = (en: string) => `Sentence:\n"""${en.slice(0, 600)}"""`;
