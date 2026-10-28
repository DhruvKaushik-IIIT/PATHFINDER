import { Suspense } from "react";
import RouteScreen from "@/components/route/RouteScreen";

export const metadata = { title: "Route · Pathfinder" };

export default function RoutePage() {
  // useSearchParams needs a Suspense boundary for static rendering.
  return (
    <Suspense fallback={<main className="fixed inset-0 bg-land" />}>
      <RouteScreen />
    </Suspense>
  );
}
