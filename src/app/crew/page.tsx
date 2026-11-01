import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import CrewScreen from "@/components/crew/CrewScreen";
import { hasSession } from "@/lib/official/auth.ts";

export const metadata: Metadata = { title: "My job · Pathfinder" };
export const dynamic = "force-dynamic";

export default async function Page() {
  // Cheap cookie check; /api/crew/me does the real one (crew role, worker row).
  if (!(await hasSession())) redirect("/official/login");
  return (
    <Suspense fallback={<main className="fixed inset-0 bg-land" />}>
      <CrewScreen />
    </Suspense>
  );
}
