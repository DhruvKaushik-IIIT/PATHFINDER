import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AdvisoryScreen from "@/components/official/AdvisoryScreen";
import { hasSession } from "@/lib/official/auth.ts";

export const metadata: Metadata = { title: "Public advisory · Pathfinder" };
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ eventId: string }> }) {
  if (!(await hasSession())) redirect("/official/login");
  const { eventId } = await params;
  return <AdvisoryScreen eventId={eventId} />;
}
