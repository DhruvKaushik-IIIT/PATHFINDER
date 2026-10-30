// POST /api/official/login {deptId, password} → sets the httpOnly session cookies. Invite-only:
// there is no sign-up route; accounts come from scripts/create-official.ts.
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasDb } from "@/lib/db/supabase.ts";
import { signIn } from "@/lib/official/auth.ts";
import { checkLimit, limitedResponse } from "@/lib/guard/rateLimit.ts";

export const dynamic = "force-dynamic";

const Body = z.object({ deptId: z.string().trim().min(2).max(64), password: z.string().min(1).max(200) });

export async function POST(req: Request) {
  const limited = checkLimit(req, "login");
  if (limited) return limitedResponse(limited);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ ok: false, error: "Enter your Department ID and password." }, { status: 400 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "Sign-in isn't configured on this server." }, { status: 503 });
  try {
    const r = await signIn(body.data.deptId, body.data.password);
    if (!r.ok) return NextResponse.json({ ok: false, error: r.reason }, { status: 401 });
    return NextResponse.json({ ok: true, data: { name: r.official.name, org: r.official.org, district: r.official.district.name } });
  } catch (err) {
    console.error("[official] sign-in failed:", (err as Error).message);
    return NextResponse.json({ ok: false, error: "Sign-in is unavailable right now. Try again in a minute." }, { status: 503 });
  }
}
