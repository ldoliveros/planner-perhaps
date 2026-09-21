"use client";

import { format } from "date-fns";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicationCompactCard } from "@/components/calendar/publication-compact-card";
import { formatFullDateFromDate, isSameDayAs, isToday } from "@/lib/date-utils";
import type { Publication } from "@/types";

interface MobileAgendaViewProps {
  /** "week": los 7 días, con los vacíos incluidos. "list": solo los días que tienen publicaciones. */
  mode: "week" | "list";
  days: Date[];
  publications: Publication[];
  onOpenPublication: (publication: Publication) => void;
  onEditPublication?: (publication: Publication) => void;
  onDuplicatePublication?: (publication: Publication) => void;
  clientId?: string;
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
  clientId,
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
        const label = formatFullDateFromDate(day);
        return (
          <section key={dateKey} aria-label={label}>
            <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-background px-4 py-1">
              <div className="flex min-h-9 items-center gap-2">
                <h2 className="text-sm font-semibold text-foreground">{label}</h2>
                {isToday(day) && (
                  <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                    Hoy
                  </span>
                )}
              </div>
              {onCreateForDay && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="-mr-2"
                  aria-label={`Nuevo contenido el ${label}`}
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
                    clientId={clientId}
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
