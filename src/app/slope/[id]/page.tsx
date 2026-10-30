import SlopeScreen from "@/components/slope/SlopeScreen";

export const metadata = { title: "Slope · Pathfinder" };

export default async function SlopePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ replay?: string }> }) {
  const { id } = await params;
  const { replay } = await searchParams;
  return <SlopeScreen id={id} replay={replay === "1"} />;
}
