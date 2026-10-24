import { PublicationSearchResults } from "@/components/search/publication-search-results";
import { runPublicationSearch } from "@/lib/publication-search-server";

/**
 * Página de búsqueda global (v1.6), compartida por /admin/search (staff) y /client/search (Client User): enlaces
 * directos, recargas y compatibilidad. La lupa del Planner abre el modal (PublicationSearchDialog), que usa la misma
 * búsqueda (`runPublicationSearch`). `?space=` (o el `?client=` anterior) se valida contra los espacios del usuario.
 */
export async function PublicationSearchPage({
  basePath,
  searchParams,
}: {
  basePath: "/admin/search" | "/client/search";
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const run = await runPublicationSearch({ q: params.q, space: params.space ?? params.client, page: params.page, withContext: true });

  return (
    <PublicationSearchResults
      key={`${run.query}|${run.spaceId ?? ""}|${run.page}`}
      basePath={basePath}
      query={run.query}
      spaceId={run.spaceId}
      spaces={run.spaces ?? []}
      page={run.page}
      pageSize={run.pageSize}
      total={run.total}
      error={run.error}
      publications={run.publications}
      lookups={run.lookups!}
      clients={run.clients}
      calendars={run.calendars}
      clientAccounts={run.clientAccounts}
    />
  );
}
