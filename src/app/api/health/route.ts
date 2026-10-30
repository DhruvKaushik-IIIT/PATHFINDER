import { NextResponse } from "next/server";
import { budgetStatus } from "@/lib/ai/budget.ts";
import { aiMode, downReason, providerHealth } from "@/lib/ai/router.ts";

export const dynamic = "force-dynamic";

// Reads in-memory provider state + today's logged spend — never makes an AI call, so it costs nothing.
export async function GET() {
  const budget = await budgetStatus().catch(() => null);
  return NextResponse.json({
    meta: providerHealth("meta"),
    baseten: providerHealth("baseten"),
    mode: aiMode(),
    budget: budget ? { over: budget.over, ...(process.env.NODE_ENV !== "production" && { spentTodayUsd: budget.spentUsd, capUsd: budget.capUsd }) } : null,
    ...(process.env.NODE_ENV !== "production" && {
      reasons: { meta: downReason("meta") ?? null, baseten: downReason("baseten") ?? null },
    }),
  });
}
