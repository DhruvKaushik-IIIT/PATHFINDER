import type { Metadata } from "next";
import LoginScreen from "@/components/official/LoginScreen";

export const metadata: Metadata = { title: "Official sign-in · Pathfinder" };

export default function Page() {
  return <LoginScreen />;
}
