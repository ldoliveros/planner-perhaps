import { PublicationSearchPage } from "@/components/search/publication-search-page";

/** Búsqueda global por título (Client User): solo su cliente, por RLS. `?q=` término, `?page=` página. */
export default function ClientSearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <PublicationSearchPage basePath="/client/search" searchParams={searchParams} />;
}
