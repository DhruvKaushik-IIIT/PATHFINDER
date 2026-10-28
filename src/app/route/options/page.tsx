import { Suspense } from "react";
import OptionsScreen from "@/components/route/OptionsScreen";

export const metadata = { title: "When to leave · Pathfinder" };

export default function OptionsPage() {
  return (
    <Suspense fallback={<main className="fixed inset-0 bg-land" />}>
      <OptionsScreen />
    </Suspense>
  );
}
