import { NextResponse } from "next/server";
import { aiMode, downReason, providerHealth } from "@/lib/ai/router.ts";

export const dynamic = "force-dynamic";

// Reads in-memory provider state only — never makes an AI call, so it costs nothing.
export function GET() {
  return NextResponse.json({
    meta: providerHealth("meta"),
    baseten: providerHealth("baseten"),
    mode: aiMode(),
    ...(process.env.NODE_ENV !== "production" && {
      reasons: { meta: downReason("meta") ?? null, baseten: downReason("baseten") ?? null },
    }),
  });
}
