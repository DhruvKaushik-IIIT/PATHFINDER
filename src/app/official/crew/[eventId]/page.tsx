import type { Metadata } from "next";
import { redirect } from "next/navigation";
import CrewBuilderScreen from "@/components/official/CrewBuilderScreen";
import { hasSession } from "@/lib/official/auth.ts";

export const metadata: Metadata = { title: "Build a crew · Pathfinder" };
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ eventId: string }> }) {
  if (!(await hasSession())) redirect("/official/login");
  const { eventId } = await params;
  return <CrewBuilderScreen eventId={eventId} />;
}
