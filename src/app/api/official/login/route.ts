// POST /api/official/login {deptId, password} → sets the httpOnly session cookies. Invite-only:
// there is no sign-up route; accounts come from scripts/create-official.ts.
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasDb } from "@/lib/db/supabase.ts";
import { signIn, signOut } from "@/lib/official/auth.ts";
import { HP_DISTRICTS, sameDistrict } from "@/lib/official/hpDistricts.ts";
import { checkLimit, limitedResponse } from "@/lib/guard/rateLimit.ts";

export const dynamic = "force-dynamic";

const Body = z.object({
  deptId: z.string().trim().min(2).max(64),
  password: z.string().min(1).max(200),
  /** Which door the person used: the district office, or an on-site crew member. */
  as: z.enum(["office", "crew"]).optional(),
  /** Office only: the district picked on the sign-in screen. */
  district: z.string().trim().max(40).optional(),
});

export async function POST(req: Request) {
  const limited = checkLimit(req, "login");
  if (limited) return limitedResponse(limited);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ ok: false, error: "Enter your Department ID and password." }, { status: 400 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "Sign-in isn't configured on this server." }, { status: 503 });
  try {
    const r = await signIn(body.data.deptId, body.data.password);
    if (!r.ok) return NextResponse.json({ ok: false, error: r.reason }, { status: 401 });
    // The account must match the door used (office vs crew) and, for offices, the district picked.
    const { as, district } = body.data;
    const isCrew = r.official.role === "crew";
    let wrong: string | null = null;
    if (as === "office" && isCrew) wrong = "This is a crew account. Go back and choose \"On-site crew member\".";
    else if (as === "crew" && !isCrew) wrong = "This is an office account. Go back and choose \"PWD / district office\".";
    else if (as === "office" && district && r.official.role !== "admin") {
      const own = HP_DISTRICTS.find((d) => sameDistrict(d.key, r.official.district.name))?.name ?? r.official.district.name;
      if (!sameDistrict(district, r.official.district.name)) wrong = `This account is for ${r.official.org} (${own} district). Go back and choose ${own}.`;
    }
    if (wrong) {
      await signOut();
      return NextResponse.json({ ok: false, error: wrong }, { status: 403 });
    }
    return NextResponse.json({ ok: true, data: { name: r.official.name, org: r.official.org, district: r.official.district.name, role: r.official.role } });
  } catch (err) {
    console.error("[official] sign-in failed:", (err as Error).message);
    return NextResponse.json({ ok: false, error: "Sign-in is unavailable right now. Try again in a minute." }, { status: 503 });
  }
}
