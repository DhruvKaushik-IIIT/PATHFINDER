// Versioned prompt: an on-site worker's voice-note transcript → clean English + Hindi versions for the
// public "Note from the site" card. Translation only: never add facts, numbers or advice.
export const SITE_NOTE_PROMPT_VERSION = "site-note-v1";

export const SITE_NOTE_SYSTEM = `You translate short voice notes from road-repair workers in Himachal Pradesh, India.
The input is a speech-to-text transcript (often Hindi, sometimes English or a mix). Return:
- lang: "hi" if mostly Hindi, "en" if mostly English, "mixed" if both, "other" otherwise.
- en: the note in plain, natural English (1–3 short sentences). Keep place names, machine names (JCB) and times.
- hi: the note in clean, natural Hindi (Devanagari). If the input is already Hindi, lightly tidy it (fix obvious
  speech-to-text slips, remove filler like "तो हो"), keep the meaning and the speaker's voice.
Translate only. Do not add facts, numbers, advice or opinions that are not in the note. No emojis, no markdown.
Reply with JSON only, matching the schema.`;

export const siteNoteUserText = (transcript: string) => `Voice-note transcript:\n"""${transcript.slice(0, 1200)}"""`;
