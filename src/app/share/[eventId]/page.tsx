import ShareScreen from "@/components/share/ShareScreen";

export const metadata = { title: "Share alert · Pathfinder" };

export default async function SharePage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <ShareScreen eventId={eventId} />;
}
