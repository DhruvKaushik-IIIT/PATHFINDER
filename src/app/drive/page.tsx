import { Suspense } from "react";
import DriveScreen from "@/components/drive/DriveScreen";

export const metadata = { title: "Drive Watch · Pathfinder" };

export default function DrivePage() {
  // useSearchParams needs a Suspense boundary for static rendering.
  return (
    <Suspense fallback={<main className="fixed inset-0 bg-land" />}>
      <DriveScreen />
    </Suspense>
  );
}
