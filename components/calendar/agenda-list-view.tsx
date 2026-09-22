"use client";

import { Fragment } from "react";
import Image from "next/image";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ImageIcon } from "lucide-react";
import { PublicationQuickActions } from "@/components/calendar/publication-quick-actions";
import { PlatformIcon } from "@/components/icons/brand-icons";
import { StatusPill } from "@/components/shared/status-pill";
import { ClientBadge } from "@/components/shared/client-badge";
import { useLookups } from "@/components/providers/lookups-provider";
import { formatDayAbbr, formatFullDateFromDate, formatTime, isToday } from "@/lib/date-utils";
import { cn } from "cn";
import type { Publication } from "@/types";

interface AgendaListViewProps {
  /** Ya filtradas (búsqueda, filtros, Desde/Hasta) — esta vista solo agrupa por fecha y ordena por hora. */
  publications: Publication[];
  onOpenPublication: (publication: Publication) => void;
  onEditPublication?: (publication: Publication) => void;
  onDuplicatePublication?: (publication: Publication) => void;
  /** Ver WeekView.getClientId — misma generalización cliente/global. */
  getClientId?: (publication: Publication) => string | undefined;
  /** Solo Publicaciones (contexto "global"): columna Cliente (logo + nombre). */
  showClient?: boolean;
  /** No usado por esta vista (Lista tiene su propia grilla fija: Fecha/Hora/Contenido/Cliente/Canal/Tipo/Estado) —
   * se sigue aceptando para no tener que tocar el call site en CalendarScreen, que lo pasa también a Semana/Mes. */
  showCalendarLabel: boolean;
}

const byTime = (a: Publication, b: Publication) => (a.publicationTime ?? "").localeCompare(b.publicationTime ?? "");

const CELL = "flex min-w-0 items-center px-4 py-2";

/**
 * Lista — agenda horizontal (referencia: Google Calendar Agenda), compartida por Planner de cliente y
 * Publicaciones (calendario global). Cada publicación es una fila con la misma alineación de columnas
 * (Fecha/Hora/Contenido/[Cliente]/Canal/Tipo/Estado/Acciones) vía CSS grid — sin encabezados de tabla, para que
 * se sienta como agenda y no como una grilla de datos. La fecha se muestra horizontal (día grande + mes/día de
 * semana abreviados, más chicos) solo en la primera publicación de cada día; el resto de las filas de ese
 * mismo día dejan esa celda vacía en vez de repetirla. No hay separador entre publicaciones de un mismo día
 * (para que se sientan agrupadas); el separador horizontal aparece solo al cerrar cada día.
 */
export function AgendaListView({
  publications,
  onOpenPublication,
  onEditPublication,
  onDuplicatePublication,
  getClientId,
  showClient,
}: AgendaListViewProps) {
  const { getClient, getClientAccount, getContentType, getPlatform, getStatus } = useLookups();

  const groups = new Map<string, Publication[]>();
  for (const publication of publications) {
    const list = groups.get(publication.publicationDate);
    if (list) list.push(publication);
    else groups.set(publication.publicationDate, [publication]);
  }
  const sortedDates = Array.from(groups.keys()).sort();

  if (sortedDates.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-12 text-center text-sm text-muted-foreground">
        No hay publicaciones en este período.
      </div>
    );
  }

  const gridTemplateColumns = showClient
    ? "7.5rem 3.5rem minmax(0,1fr) 11rem 5rem 6rem 7rem 2.75rem"
    : "7.5rem 3.5rem minmax(0,1fr) 5rem 6rem 7rem 2.75rem";

  return (
    <div className="flex-1 overflow-auto">
      <div className="grid" style={{ gridTemplateColumns }}>
        {sortedDates.map((dateKey) => {
          const day = new Date(`${dateKey}T00:00:00`);
          const items = groups.get(dateKey)!.sort(byTime);
          const today = isToday(day);

          return (
            <Fragment key={dateKey}>
              {items.map((publication, index) => {
                const isFirstOfDay = index === 0;
                const isLastOfDay = index === items.length - 1;
                const primaryAsset = publication.assets.find((a) => a.isPrimary) ?? publication.assets[0];
                const contentType = getContentType(publication.contentTypeId);
                const status = getStatus(publication.statusId);
                const client = showClient ? getClient(publication.clientId) : undefined;
                const uniquePlatformIds = Array.from(
                  new Set(
                    publication.destinations
                      .map((d) => getClientAccount(d.clientAccountId)?.platformId)
                      .filter((id): id is string => Boolean(id))
                  )
                );
                const rowBorder = isLastOfDay && "border-b border-border";
                const rowTint = today && "bg-primary/[0.03]";

                return (
                  <Fragment key={publication.id}>
                    {/* Fecha: horizontal (día grande + mes/día de semana chicos), solo en la primera publicación
                        del día — las siguientes dejan esta celda vacía en vez de repetirla. */}
                    <div className={cn(CELL, "flex-nowrap gap-1.5 whitespace-nowrap", rowBorder, rowTint)} aria-hidden>
                      {isFirstOfDay && (
                        <>
                          <span className={cn("shrink-0 text-lg font-bold leading-none", today ? "text-primary" : "text-foreground")}>
                            {format(day, "d")}
                          </span>
                          <span className="shrink-0 whitespace-nowrap text-[10px] font-semibold uppercase leading-tight text-muted-foreground">
                            {format(day, "LLL", { locale: es }).replace(".", "")}, {formatDayAbbr(day)}
                          </span>
                        </>
                      )}
                    </div>

                    <div className={cn(CELL, "text-sm tabular-nums text-muted-foreground", rowBorder, rowTint)}>
                      {publication.publicationTime && formatTime(publication.publicationTime)}
                    </div>

                    {/* Contenido: miniatura + título, alineados horizontalmente — único control real (<button>)
                        de la fila, para que quede accesible por teclado. */}
                    <button
                      type="button"
                      onClick={() => onOpenPublication(publication)}
                      aria-label={`${publication.title} — ${formatFullDateFromDate(day)}`}
                      className={cn(
                        "flex min-w-0 items-center gap-3 px-4 py-2 text-left hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none",
                        rowBorder,
                        rowTint
                      )}
                    >
                      <span className="relative size-10 shrink-0 overflow-hidden rounded-md bg-muted">
                        {primaryAsset?.thumbnailUrl ? (
                          <Image src={primaryAsset.thumbnailUrl} alt="" fill sizes="40px" className="object-cover" />
                        ) : (
                          <span className="flex size-full items-center justify-center text-muted-foreground/40">
                            <ImageIcon className="size-4" />
                          </span>
                        )}
                      </span>
                      <span className="min-w-0 truncate text-sm font-medium text-foreground">{publication.title}</span>
                    </button>

                    {showClient && (
                      <div className={cn(CELL, "cursor-pointer hover:bg-muted/40", rowBorder, rowTint)} onClick={() => onOpenPublication(publication)}>
                        {client && <ClientBadge client={client} size="md" className="min-w-0" />}
                      </div>
                    )}

                    <div className={cn(CELL, "cursor-pointer gap-1 hover:bg-muted/40", rowBorder, rowTint)} onClick={() => onOpenPublication(publication)}>
                      {uniquePlatformIds.map((platformId) => {
                        const platform = getPlatform(platformId);
                        if (!platform) return null;
                        return (
                          <PlatformIcon key={platformId} platformKey={platform.key} className="size-3.5" style={{ color: platform.color }} />
                        );
                      })}
                    </div>

                    <div
                      className={cn(CELL, "cursor-pointer text-sm text-muted-foreground hover:bg-muted/40", rowBorder, rowTint)}
                      onClick={() => onOpenPublication(publication)}
                    >
                      {contentType && <span className="truncate">{contentType.label}</span>}
                    </div>

                    <div className={cn(CELL, "cursor-pointer hover:bg-muted/40", rowBorder, rowTint)} onClick={() => onOpenPublication(publication)}>
                      {status && <StatusPill status={status} size="sm" />}
                    </div>

                    <div className={cn("flex items-center justify-center px-2 py-2", rowBorder, rowTint)}>
                      <PublicationQuickActions
                        publication={publication}
                        clientId={getClientId?.(publication)}
                        onEdit={onEditPublication && getClientId ? () => onEditPublication(publication) : undefined}
                        onDuplicate={onDuplicatePublication && getClientId ? () => onDuplicatePublication(publication) : undefined}
                        className="size-7"
                      />
                    </div>
                  </Fragment>
                );
              })}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
