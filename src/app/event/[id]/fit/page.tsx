import FitScreen from "@/components/fit/FitScreen";

export const metadata = { title: "Can my vehicle cross? · Pathfinder" };

export default async function FitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FitScreen id={id} />;
}
