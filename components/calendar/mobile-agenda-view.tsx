"use client";

import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicationCompactCard } from "@/components/calendar/publication-compact-card";
import { formatDayAbbr, formatFullDateFromDate, isSameDayAs, isToday } from "@/lib/date-utils";
import type { Publication } from "@/types";

interface MobileAgendaViewProps {
  /** "week": los 7 días, con los vacíos incluidos. "list": solo los días que tienen publicaciones. */
  mode: "week" | "list";
  days: Date[];
  publications: Publication[];
  onOpenPublication: (publication: Publication) => void;
  onEditPublication?: (publication: Publication) => void;
  onDuplicatePublication?: (publication: Publication) => void;
  /** Ver WeekView.getClientId — misma generalización cliente/global. */
  getClientId?: (publication: Publication) => string | undefined;
  /** Solo Publicaciones (contexto "global"): logo + nombre del cliente en cada card. */
  showClient?: boolean;
  /** Solo Super Admin / Account Manager: crea una publicación con esa fecha preseleccionada. */
  onCreateForDay?: (day: Date) => void;
  showCalendarLabel: boolean;
}

const byTime = (a: Publication, b: Publication) => (a.publicationTime ?? "").localeCompare(b.publicationTime ?? "");

/** Semana y Lista para < md: días apilados verticalmente con cards compactas (sin tablas ni scroll horizontal). */
export function MobileAgendaView({
  mode,
  days,
  publications,
  onOpenPublication,
  onEditPublication,
  onDuplicatePublication,
  getClientId,
  showClient,
  onCreateForDay,
  showCalendarLabel,
}: MobileAgendaViewProps) {
  const groups = days
    .map((day) => ({ day, items: publications.filter((p) => isSameDayAs(p.publicationDate, day)).sort(byTime) }))
    .filter((group) => mode === "week" || group.items.length > 0);

  if (groups.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-12 text-center text-sm text-muted-foreground">
        No hay publicaciones en este período.
      </div>
    );
  }

  return (
    <div className="flex flex-col pb-6">
      {groups.map(({ day, items }) => {
        const dateKey = format(day, "yyyy-MM-dd");
        const fullLabel = formatFullDateFromDate(day);
        return (
          <section key={dateKey} aria-label={fullLabel}>
            {/* Lista: fecha en formato compacto (número + mes/día abreviados), sin repetirla por publicación —
                mismo espíritu que la columna de fecha de Lista en desktop, adaptado a una sola fila mobile.
                Semana conserva su encabezado actual (no forma parte de este rediseño). */}
            <div className="sticky top-0 z-10 flex items-center gap-2.5 border-b border-border bg-background px-4 py-1.5">
              {mode === "list" ? (
                <div className="flex min-h-9 items-center gap-2">
                  <span className="text-lg font-bold leading-none text-foreground">{format(day, "d")}</span>
                  <span className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground">
                    {format(day, "LLL", { locale: es }).replace(".", "")}
                    <br />
                    {formatDayAbbr(day)}
                  </span>
                </div>
              ) : (
                <div className="flex min-h-9 items-center gap-2">
                  <h2 className="text-sm font-semibold text-foreground">{fullLabel}</h2>
                </div>
              )}
              {isToday(day) && (
                <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                  Hoy
                </span>
              )}
              {onCreateForDay && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="-mr-2 ml-auto"
                  aria-label={`Nuevo contenido el ${fullLabel}`}
                  onClick={() => onCreateForDay(day)}
                >
                  <Plus />
                </Button>
              )}
            </div>
            <div className="flex flex-col gap-2 px-4 py-2">
              {items.length === 0 ? (
                <p className="py-1 text-xs text-muted-foreground">Sin publicaciones</p>
              ) : (
                items.map((publication) => (
                  <PublicationCompactCard
                    key={publication.id}
                    publication={publication}
                    onOpen={() => onOpenPublication(publication)}
                    onEdit={onEditPublication}
                    onDuplicate={onDuplicatePublication}
                    clientId={getClientId?.(publication)}
                    showClient={showClient}
                    showCalendarLabel={showCalendarLabel}
                  />
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
