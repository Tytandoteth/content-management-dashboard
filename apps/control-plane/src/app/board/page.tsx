import { ContentBoard } from "@/components/ContentBoard";

export const dynamic = "force-dynamic";

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ brandSurface?: string }>;
}) {
  const sp = await searchParams;
  return <ContentBoard initialBrand={sp.brandSurface ?? ""} />;
}
