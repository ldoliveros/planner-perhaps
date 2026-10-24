"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, Search, SearchX, X } from "lucide-react";
import { SpaceSelector } from "@/components/calendar/calendar-header";
import { PublicationSearchBox } from "@/components/calendar/publication-search-box";
import { LookupsProvider } from "@/components/providers/lookups-provider";
import { SearchResultList } from "@/components/search/search-result-list";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { searchPublicationsAction } from "@/lib/actions/publication-search";
import { GLOBAL_CALENDAR_THEME } from "@/lib/calendar-surface";
import type { PublicationSearchRun, SearchSpace } from "@/lib/publication-search-server";
import type { Publication } from "@/types";

interface PublicationSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Espacio que se está viendo en el Planner al abrir (null = "Todos los espacios"). */
  initialSpaceId: string | null;
}

interface Context {
  spaces: SearchSpace[];
  lookups: NonNullable<PublicationSearchRun["lookups"]>;
}

/**
 * Búsqueda global en un modal (v1.6), abierto con la lupa del encabezado del Planner sin cambiar de ruta. Misma
 * búsqueda que /admin/search y /client/search (`searchPublicationsAction` → `runPublicationSearch`, bajo RLS): por
 * título, sin fechas, sin acentos ni mayúsculas, sin archivadas, 25 por página. Se ejecuta con Enter o la lupa del
 * campo (nunca mientras se escribe). Espacio: hereda el del Planner y se cambia con el mismo selector. Elegir un
 * resultado cierra el modal y abre `/p/<id>` (permisos y destino de siempre).
 */
export function PublicationSearchDialog({ open, onOpenChange, initialSpaceId }: PublicationSearchDialogProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const [context, setContext] = useState<Context | null>(null);
  const [run, setRun] = useState<PublicationSearchRun | null>(null);
  const [spaceId, setSpaceId] = useState<string | null>(initialSpaceId);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const requestSeq = useRef(0);
  const bodyRef = useRef<HTMLDivElement>(null);

  // El espacio del Planner puede cambiar mientras el modal está cerrado (otro Planner, "Todos los espacios").
  const [lastInitialSpace, setLastInitialSpace] = useState(initialSpaceId);
  if (initialSpaceId !== lastInitialSpace) {
    setLastInitialSpace(initialSpaceId);
    setSpaceId(initialSpaceId);
    setRun(null);
  }

  async function search(next: { q: string; space: string | null; page: number }) {
    const seq = ++requestSeq.current;
    setLoading(true);
    setFailed(false);
    try {
      const result = await searchPublicationsAction({ ...next, withContext: context === null });
      if (seq !== requestSeq.current) return; // Llegó una respuesta más nueva.
      if (result.spaces && result.lookups) setContext({ spaces: result.spaces, lookups: result.lookups });
      setSpaceId(result.spaceId);
      setRun(result.query ? result : null);
      bodyRef.current?.scrollTo({ top: 0 });
    } catch {
      if (seq === requestSeq.current) setFailed(true);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }

  // Primera apertura: espacios visibles y catálogos (sin término no busca nada). El estado se escribe en el callback.
  useEffect(() => {
    if (!open || context !== null) return;
    let cancelled = false;
    searchPublicationsAction({ q: "", space: null, page: 1, withContext: true })
      .then((result) => {
        if (!cancelled && result.spaces && result.lookups) setContext({ spaces: result.spaces, lookups: result.lookups });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, context]);

  function openPublication(publication: Publication) {
    onOpenChange(false);
    router.push(`/p/${publication.id}`);
  }

  const spaces = context?.spaces ?? [];
  const space = spaceId ? spaces.find((s) => s.id === spaceId) : undefined;
  const query = run?.query ?? "";
  const total = run?.total ?? null;
  const pageSize = run?.pageSize ?? 25;
  const page = run?.page ?? 1;
  const totalPages = total ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const scope = space ? ` en ${space.name}` : "";

  let body: React.ReactNode;
  if (failed || run?.error) {
    body = <p className="px-2 py-6 text-center text-sm text-destructive">No se pudo completar la búsqueda. Probá de nuevo.</p>;
  } else if (!run) {
    body = (
      <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
        <Search className="size-6 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">Escribí parte del título y presioná Enter para buscar en todas las publicaciones.</p>
      </div>
    );
  } else if (run.publications.length === 0) {
    body = (
      <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
        <SearchX className="size-6 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">
          {total === null
            ? "No hay resultados en esta página."
            : space
              ? `Ninguna publicación de ${space.name} tiene ese texto en el título. Probá con otra palabra o con todos los espacios.`
              : "Ninguna publicación tiene ese texto en el título. Probá con otra palabra o parte del título."}
        </p>
      </div>
    );
  } else {
    body = (
      <LookupsProvider
        {...context!.lookups}
        clients={run.clients}
        calendars={run.calendars}
        clientAccounts={run.clientAccounts}
        campaigns={[]}
      >
        <SearchResultList publications={run.publications} onOpen={openPublication} />
      </LookupsProvider>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        initialFocus={inputRef}
        className="flex max-h-[80dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[800px] max-sm:top-0 max-sm:left-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none"
      >
        <div className="flex flex-col gap-3 border-b border-border px-4 pt-4 pb-3">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="text-base font-semibold">Buscar publicaciones</DialogTitle>
            <DialogClose render={<Button variant="ghost" size="icon-sm" aria-label="Cerrar" />}>
              <X />
            </DialogClose>
          </div>
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <PublicationSearchBox
              inputRef={inputRef}
              value={draft}
              onChange={setDraft}
              onSubmit={(value) => void search({ q: value, space: spaceId, page: 1 })}
              size="lg"
              placeholder="Buscar por título..."
              className="w-full max-w-none sm:flex-1"
            />
            {spaces.length > 1 && (
              <div className="flex max-w-full min-w-0 shrink-0">
                <SpaceSelector
                  client={space ?? { id: "", name: "Todos los espacios", logoUrl: null, color: GLOBAL_CALENDAR_THEME.accent }}
                  isGlobal={!space}
                  spaces={spaces}
                  onSelectSpace={(id) => {
                    setSpaceId(id);
                    // Mismo término, página 1 (sin término solo cambia la selección).
                    if (query) void search({ q: query, space: id, page: 1 });
                  }}
                />
              </div>
            )}
          </div>
        </div>

        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2" aria-busy={loading}>
          {body}
        </div>

        {(loading || (run && total !== null && total > 0)) && (
          <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2 text-xs text-muted-foreground">
            <span aria-live="polite" className="flex min-w-0 items-center gap-1.5 truncate">
              {loading && <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />}
              {loading
                ? "Buscando..."
                : `${total} ${total === 1 ? "resultado" : "resultados"} para «${query}»${scope}`}
            </span>
            {!loading && totalPages > 1 && (
              <span className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Página anterior"
                  disabled={page <= 1}
                  onClick={() => void search({ q: query, space: spaceId, page: page - 1 })}
                >
                  <ChevronLeft />
                </Button>
                <span className="tabular-nums">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Página siguiente"
                  disabled={page >= totalPages}
                  onClick={() => void search({ q: query, space: spaceId, page: page + 1 })}
                >
                  <ChevronRight />
                </Button>
              </span>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
