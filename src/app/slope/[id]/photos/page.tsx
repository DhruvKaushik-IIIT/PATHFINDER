import SlopePhotosScreen from "@/components/slope/SlopePhotosScreen";

export const metadata = { title: "Slope photos · Pathfinder" };

export default async function SlopePhotosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SlopePhotosScreen id={id} />;
}
