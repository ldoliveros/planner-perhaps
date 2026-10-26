"use server";

import { runPublicationSearch, type PublicationSearchRun } from "@/lib/publication-search-server";

/**
 * Búsqueda global desde el modal del Planner (v1.6). Misma función que la página de resultados; corre con la sesión
 * del usuario, así que la RLS decide qué ve cada rol (sin sesión no devuelve nada). `withContext` agrega los espacios
 * visibles y los catálogos: el modal los pide una vez al abrirse.
 */
export async function searchPublicationsAction(input: {
  q: string;
  space: string | null;
  page: number;
  withContext?: boolean;
}): Promise<PublicationSearchRun> {
  return runPublicationSearch({
    q: typeof input.q === "string" ? input.q : "",
    space: typeof input.space === "string" ? input.space : null,
    page: typeof input.page === "number" ? input.page : 1,
    withContext: input.withContext === true,
  });
}
