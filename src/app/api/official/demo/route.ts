// POST /api/official/demo → "Try as PWD Mandi (demo)" for judges: signs into the public demo account.
// Read-mostly: the demo account can only change demo events/sites, its advisories reach demo devices + the
// judge's own phone, and `pnpm seed` resets everything it touched. Real official accounts stay invite-only.
import { NextResponse } from "next/server";
import { hasDb } from "@/lib/db/supabase.ts";
import { checkLimit, limitedResponse } from "@/lib/guard/rateLimit.ts";
import { signIn } from "@/lib/official/auth.ts";
import { DEMO_OFFICIAL } from "@/lib/official/dept.ts";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const limited = checkLimit(req, "login");
  if (limited) return limitedResponse(limited);
  if (!hasDb()) return NextResponse.json({ ok: false, error: "Sign-in isn't configured on this server." }, { status: 503 });
  try {
    const r = await signIn(DEMO_OFFICIAL.dept, DEMO_OFFICIAL.password);
    if (!r.ok) return NextResponse.json({ ok: false, error: "The demo account isn't set up on this server yet." }, { status: 503 });
    if (!r.official.isDemo) return NextResponse.json({ ok: false, error: "Demo sign-in is unavailable." }, { status: 503 });
    return NextResponse.json({ ok: true, data: { name: r.official.name, org: r.official.org, district: r.official.district.name } });
  } catch (err) {
    console.error(JSON.stringify({ level: "error", event: "demo_login_failed", message: (err as Error).message }));
    return NextResponse.json({ ok: false, error: "Sign-in is unavailable right now. Try again in a minute." }, { status: 503 });
  }
}
