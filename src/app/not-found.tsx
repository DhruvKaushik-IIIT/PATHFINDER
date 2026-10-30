import Link from "next/link";
import StatusCard from "@/components/glass/StatusCard";

export const metadata = { title: "Not found · Pathfinder" };

export default function NotFound() {
  return (
    <StatusCard title="Nothing here" body="This road report, slope or page doesn't exist — it may have been cleared or the link is old.">
      <Link href="/" className="flex h-[52px] items-center justify-center rounded-[14px] bg-accent text-[17px] font-semibold text-white no-underline">
        Back to the map
      </Link>
    </StatusCard>
  );
}
