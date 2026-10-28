import { Suspense } from "react";
import NearbyScreen from "@/components/nearby/NearbyScreen";

export const metadata = { title: "Nearby · Pathfinder" };

export default function NearbyPage() {
  return (
    <Suspense fallback={<main className="fixed inset-0 bg-land" />}>
      <NearbyScreen />
    </Suspense>
  );
}
