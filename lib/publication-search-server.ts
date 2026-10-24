import { SEARCH_PAGE_SIZE, normalizeSearchQuery, parseSearchPage, titleSearchPattern } from "@/lib/publication-search";
import {
  getLookups,
  listClients,
  listLookupsForPublications,
  searchPublicationsByTitle,
  type Lookups,
} from "@/lib/supabase/queries";
import type { Calendar, Client, ClientAccount, Publication } from "@/types";

export type SearchSpace = Pick<Client, "id" | "name" | "logoUrl" | "color">;

export interface PublicationSearchRun {
  query: string;
  page: number;
  pageSize: number;
  /** Espacio aplicado, ya validado contra `spaces`; null = "Todos los espacios". */
  spaceId: string | null;
  /** null = página fuera de rango. */
  total: number | null;
  error: string | null;
  publications: Publication[];
  /** Clientes, calendarios y cuentas de las publicaciones de esta página (para mostrarlas). */
  clients: Client[];
  calendars: Calendar[];
  clientAccounts: ClientAccount[];
  /** Solo con `withContext`: espacios visibles para el usuario y catálogos (estados, plataformas…). */
  spaces?: SearchSpace[];
  lookups?: Lookups;
}

/**
 * Búsqueda global por título (v1.6), única implementación para la página (/admin/search, /client/search) y el modal
 * del Planner. Valida término, página y espacio (contra los espacios que la RLS le deja ver al usuario: otro valor se
 * ignora = "Todos los espacios") y consulta con la sesión del usuario (`searchPublicationsByTitle`, bajo RLS).
 */
export async function runPublicationSearch(input: {
  q?: string | string[] | null;
  space?: string | string[] | null;
  page?: string | string[] | number | null;
  withContext?: boolean;
}): Promise<PublicationSearchRun> {
  const query = normalizeSearchQuery(input.q);
  const page = typeof input.page === "number" ? (Number.isInteger(input.page) && input.page > 1 ? input.page : 1) : parseSearchPage(input.page);

  const [spaces, lookups] = await Promise.all([listClients(), input.withContext ? getLookups() : Promise.resolve(undefined)]);
  const requested = typeof input.space === "string" ? input.space : null;
  const spaceId = requested && spaces.some((c) => c.id === requested) ? requested : null;

  const result = query
    ? await searchPublicationsByTitle(titleSearchPattern(query), page, SEARCH_PAGE_SIZE, spaceId)
    : { publications: [], total: 0, error: null };
  const related = await listLookupsForPublications(result.publications);

  return {
    query,
    page,
    pageSize: SEARCH_PAGE_SIZE,
    spaceId,
    total: result.total,
    error: result.error,
    publications: result.publications,
    ...related,
    ...(input.withContext
      ? { spaces: spaces.map(({ id, name, logoUrl, color }) => ({ id, name, logoUrl, color })), lookups }
      : {}),
  };
}
