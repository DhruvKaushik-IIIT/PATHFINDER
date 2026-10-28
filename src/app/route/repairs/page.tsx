import { Suspense } from "react";
import RepairsScreen from "@/components/repairs/RepairsScreen";

export const metadata = { title: "Repairs on your route · Pathfinder" };

export default function RepairsPage() {
  return (
    <Suspense fallback={<main className="fixed inset-0 bg-land" />}>
      <RepairsScreen />
    </Suspense>
  );
}
