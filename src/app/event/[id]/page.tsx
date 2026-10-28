import EventScreen from "@/components/event/EventScreen";

export const metadata = { title: "Disruption · Pathfinder" };

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventScreen id={id} />;
}
