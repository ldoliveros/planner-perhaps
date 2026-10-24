import { PublicationSearchPage } from "@/components/search/publication-search-page";

/** Búsqueda global por título (staff). `?q=` término, `?page=` página. */
export default function AdminSearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <PublicationSearchPage basePath="/admin/search" searchParams={searchParams} />;
}
