// One-off (Nov 1): give field updates that have a voice transcript but no "site note" yet the new
// fields — who said it (user + crew role) and the English/Hindi translation. ~1 Spark call per note.
// Run: node --env-file-if-exists=.env.local scripts/backfill-site-notes.ts
import { translateSiteNote } from "../src/lib/ai/router.ts";
import { SKILL_WORD, type Skill } from "../src/lib/crew/needs.ts";
import { select, update } from "../src/lib/db/supabase.ts";

const rows = await select<{ id: string; user_id: string | null; ai_check: Record<string, unknown> | null }>(
  "official_updates",
  "select=id,user_id,ai_check&order=created_at.desc&limit=50",
);
let n = 0;
for (const r of rows) {
  const a = r.ai_check ?? {};
  const transcript = typeof a.transcript === "string" ? a.transcript : null;
  if (!transcript || a.note) continue;
  const [u] = r.user_id ? await select<{ display_name: string | null; role: string }>("users", `select=display_name,role&id=eq.${r.user_id}&limit=1`) : [];
  const [w] = r.user_id ? await select<{ skill: Skill }>("workers", `select=skill&user_id=eq.${r.user_id}&limit=1`) : [];
  const by = u?.display_name ?? (typeof a.org === "string" ? a.org : "Road crew");
  const role = w ? SKILL_WORD[w.skill][0] : u?.role === "crew" ? "crew member" : "official";
  const t = (await translateSiteNote(transcript)).data;
  await update("official_updates", `id=eq.${r.id}`, {
    ai_check: { ...a, by: { name: by, role }, note: { text: transcript, en: t?.en ?? null, hi: t?.hi ?? null, lang: t?.lang ?? null, by, role } },
  });
  console.log(`✓ ${r.id.slice(0, 8)} · ${by} (${role}) · ${t ? `EN: ${t.en.slice(0, 90)}…` : "no translation"}`);
  n++;
}
console.log(`${n} note(s) backfilled`);
