import PhotosScreen from "@/components/event/PhotosScreen";

export const metadata = { title: "Photos · Pathfinder" };

export default async function PhotosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PhotosScreen id={id} />;
}
