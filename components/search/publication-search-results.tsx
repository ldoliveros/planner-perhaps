"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Search, SearchX } from "lucide-react";
import { AgendaListView } from "@/components/calendar/agenda-list-view";
import { MobileAgendaView } from "@/components/calendar/mobile-agenda-view";
import { PublicationSearchBox } from "@/components/calendar/publication-search-box";
import { LookupsProvider } from "@/components/providers/lookups-provider";
import { buttonVariants } from "@/components/ui/button";
import { SpaceSelector, type SpaceOption } from "@/components/calendar/calendar-header";
import { CAL_GRID_FRAME, GLOBAL_CALENDAR_THEME } from "@/lib/calendar-surface";
import { searchResultsHref } from "@/lib/publication-search";
import type { Lookups } from "@/lib/supabase/queries";
import { cn } from "cn";
import type { Calendar, Client, ClientAccount, Publication } from "@/types";

interface PublicationSearchResultsProps {
  basePath: "/admin/search" | "/client/search";
  query: string;
  /** Espacio elegido, ya validado en el servidor contra `spaces`; null = "Todos los espacios". */
  spaceId: string | null;
  /** Espacios visibles para el usuario (RLS). Con uno solo (p. ej. Client User), el selector no se muestra. */
  spaces: SpaceOption[];
  page: number;
  pageSize: number;
  /** null = página fuera de rango. */
  total: number | null;
  error: string | null;
  publications: Publication[];
  lookups: Lookups;
  clients: Client[];
  calendars: Calendar[];
  clientAccounts: ClientAccount[];
}

/**
 * Búsqueda global por título (v1.6). Campo principal + el selector de espacios del Planner (único filtro de alcance);
 * término, espacio y página viven en la URL (`q`, `space`, `page`). La búsqueda se ejecuta con Enter o con la lupa del campo (sin filtrar mientras se escribe).
 * Resultados con la vista Lista (desktop) y su versión mobile, con cliente y calendario. Abrir = el link universal
 * `/p/<id>`, que resuelve permisos y abre la publicación en el Planner que corresponde (Volver regresa acá).
 */
export function PublicationSearchResults({
  basePath,
  query,
  spaceId,
  spaces,
  page,
  pageSize,
  total,
  error,
  publications,
  lookups,
  clients,
  calendars,
  clientAccounts,
}: PublicationSearchResultsProps) {
  const router = useRouter();
  const [draft, setDraft] = useState(query);
  const totalPages = total ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const open = (publication: Publication) => router.push(`/p/${publication.id}`);
  const href = (options: { page?: number; space?: string | null; q?: string } = {}) =>
    searchResultsHref(basePath, options.q ?? query, { space: "space" in options ? options.space : spaceId, page: options.page });
  const space = spaceId ? spaces.find((c) => c.id === spaceId) : undefined;
  const clientName = space?.name;
  // Mobile agrupa por los días que se le pasan, en ese orden: los de esta página, del más reciente al más antiguo.
  const days = Array.from(new Set(publications.map((p) => p.publicationDate)))
    .sort()
    .reverse()
    .map((key) => new Date(`${key}T00:00:00`));

  const scope = clientName ? ` en ${clientName}` : "";
  let summary: string | null = null;
  if (query && error) summary = "No se pudo completar la búsqueda.";
  else if (query && total === null) summary = `Esta página no existe para «${query}»${scope}.`;
  else if (query && total === 0) summary = `Sin resultados para «${query}»${scope}.`;
  else if (query && total) summary = `${total} ${total === 1 ? "resultado" : "resultados"} para «${query}»${scope}`;

  return (
    <LookupsProvider {...lookups} clients={clients} calendars={calendars} clientAccounts={clientAccounts} campaigns={[]}>
      <div className="flex w-full flex-1 flex-col gap-4 px-4 py-6 md:px-6">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Buscar publicaciones</h1>

        {/* Buscador (máx. 500 px) y, a 12 px a su derecha, el selector de espacios del Planner con su ancho natural.
            En mobile, el buscador a todo el ancho y el selector debajo. */}
        <div className="flex flex-col items-start gap-3 md:flex-row md:items-center">
          <PublicationSearchBox
            value={draft}
            onChange={setDraft}
            onSubmit={(value) => router.push(href({ q: value }))}
            size="lg"
            placeholder="Buscar por título..."
            className="w-full max-w-none md:max-w-[500px]"
            autoFocus={!query}
          />
          {spaces.length > 1 && (
            <div className="flex max-w-full min-w-0 shrink-0">
              <SpaceSelector
                client={space ?? { id: "", name: "Todos los espacios", logoUrl: null, color: GLOBAL_CALENDAR_THEME.accent }}
                isGlobal={!space}
                spaces={spaces}
                // Mismo término, página 1.
                onSelectSpace={(id) => router.push(href({ space: id }))}
              />
            </div>
          )}
        </div>

        {summary && (
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {summary}
          </p>
        )}
        {query && error && <p className="text-sm text-destructive">{error}</p>}

        {!query && (
          <div className={cn(CAL_GRID_FRAME, "flex flex-col items-center gap-2 px-6 py-8 text-center")}>
            <Search className="size-6 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">
              Escribí parte del título y presioná Enter para buscar en todas las publicaciones.
            </p>
          </div>
        )}

        {query && !error && publications.length === 0 && (
          <div className={cn(CAL_GRID_FRAME, "flex flex-col items-center gap-2 px-6 py-12 text-center")}>
            <SearchX className="size-6 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">
              {total === null
                ? "No hay resultados en esta página."
                : clientName
                  ? `Ninguna publicación de ${clientName} tiene ese texto en el título. Probá con otra palabra o con todos los espacios.`
                  : "Ninguna publicación tiene ese texto en el título. Probá con otra palabra o parte del título."}
            </p>
            {total === null && (
              <Link href={href()} className="text-sm font-medium text-foreground underline underline-offset-4">
                Ir a la primera página
              </Link>
            )}
          </div>
        )}

        {publications.length > 0 && (
          <>
            <div className={cn(CAL_GRID_FRAME, "hidden md:flex")}>
              <AgendaListView
                publications={publications}
                onOpenPublication={open}
                showClient
                showCalendarLabel
                showCalendarName
                newestFirst
              />
            </div>
            <div className="-mx-4 md:hidden">
              <MobileAgendaView mode="list" days={days} publications={publications} onOpenPublication={open} showClient showCalendarLabel />
            </div>
          </>
        )}

        {query && total !== null && totalPages > 1 && (
          <nav aria-label="Páginas de resultados" className="flex items-center justify-between gap-2">
            {page > 1 ? (
              <Link href={href({ page: page - 1 })} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <ChevronLeft /> Anterior
              </Link>
            ) : (
              <span />
            )}
            <span className="text-sm text-muted-foreground tabular-nums">
              Página {page} de {totalPages}
            </span>
            {page < totalPages ? (
              <Link href={href({ page: page + 1 })} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Siguiente <ChevronRight />
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </div>
    </LookupsProvider>
  );
}
