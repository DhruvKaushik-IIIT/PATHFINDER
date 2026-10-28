import type { Metadata } from "next";
import { redirect } from "next/navigation";
import CommandCentreScreen from "@/components/official/CommandCentreScreen";
import { hasSession } from "@/lib/official/auth.ts";

export const metadata: Metadata = { title: "Command Centre · Pathfinder" };
export const dynamic = "force-dynamic";

export default async function Page() {
  // Cheap cookie check only; the API validates the session (and sends the screen back here on 401).
  if (!(await hasSession())) redirect("/official/login");
  return <CommandCentreScreen />;
}
