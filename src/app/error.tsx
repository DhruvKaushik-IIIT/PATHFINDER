"use client";

// Any uncaught page error → a calm Glass card instead of a blank screen (5.7: never crash to the user).
import Link from "next/link";
import { useEffect } from "react";
import StatusCard from "@/components/glass/StatusCard";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(JSON.stringify({ level: "error", event: "page_error", message: error.message, digest: error.digest }));
  }, [error]);
  return (
    <StatusCard title="Something went wrong" body="This screen hit a problem. Road data is safe — try again, or go back to the map.">
      <button type="button" onClick={reset} className="flex h-[52px] items-center justify-center rounded-[14px] bg-accent text-[17px] font-semibold text-white">
        Try again
      </button>
      <Link href="/" className="flex min-h-[48px] items-center justify-center rounded-[14px] bg-accent-tint text-[16px] font-semibold text-accent-tint-ink no-underline">
        Back to the map
      </Link>
    </StatusCard>
  );
}
