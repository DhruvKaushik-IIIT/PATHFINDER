import type { Metadata } from "next";
import { redirect } from "next/navigation";
import FieldUpdateScreen from "@/components/official/FieldUpdateScreen";
import { hasSession } from "@/lib/official/auth.ts";

export const metadata: Metadata = { title: "Field update · Pathfinder" };
export const dynamic = "force-dynamic";

export default async function Page({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<{ from?: string; final?: string }> }) {
  if (!(await hasSession())) redirect("/official/login");
  const { eventId } = await params;
  const q = await searchParams;
  return <FieldUpdateScreen eventId={eventId} back={q.from === "crew" ? "/crew" : "/official"} final={q.final === "1"} />;
}
