import { ContentLibrary } from "@/components/ContentLibrary";

export const dynamic = "force-dynamic";

export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string; brandSurface?: string }>;
}) {
  const sp = await searchParams;
  return (
    <ContentLibrary
      initialStatus={sp.status ?? ""}
      initialType={sp.type ?? ""}
      initialBrand={sp.brandSurface ?? ""}
    />
  );
}
