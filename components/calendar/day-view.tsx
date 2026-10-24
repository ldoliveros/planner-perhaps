"use client";

import { isWeekend } from "date-fns";
import { Plus } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { PublicationCard } from "@/components/calendar/publication-card";
import { formatFullDateFromDate, isSameDayAs, isToday } from "@/lib/date-utils";
import { CAL_DAY_BG, CAL_DAY_NAMES, CAL_GRID_FRAME, CAL_WEEKEND_BG } from "@/lib/calendar-surface";
import type { Publication } from "@/types";

interface DayViewProps {
  day: Date;
  /** Ya filtradas (búsqueda + filtros); acá solo se toman las del día. */
  publications: Publication[];
  onOpenPublication: (publication: Publication) => void;
  onEditPublication?: (publication: Publication) => void;
  onDuplicatePublication?: (publication: Publication) => void;
  onDeletePublication?: (publicationId: string) => void;
  /** Ver WeekView.getClientId — misma generalización cliente/global. */
  getClientId?: (publication: Publication) => string | undefined;
  showClient?: boolean;
  onCreateForDay?: (day: Date) => void;
  showCalendarLabel: boolean;
}

/**
 * Vista Día (v1.6, desktop/tablet): tablero de publicaciones del día en una grilla responsive (2 columnas en
 * tablet, 3 en desktop) en lugar de una sola columna a todo el ancho. Reutiliza PublicationCard tal cual (preview,
 * estado, cuenta, calendario, plataformas, acciones y apertura del modal). Sin arrastrar-y-soltar: en Día el único
 * destino posible es el mismo día (antes, con una sola columna, soltar ahí no movía nada); para pasar a otra fecha
 * sigue estando "Cambiar fecha" en las acciones de la card. Mobile usa su propia vista (MobileAgendaView).
 */
export function DayView({
  day,
  publications,
  onOpenPublication,
  onEditPublication,
  onDuplicatePublication,
  onDeletePublication,
  getClientId,
  showClient,
  onCreateForDay,
  showCalendarLabel,
}: DayViewProps) {
  const dayPublications = publications
    .filter((p) => isSameDayAs(p.publicationDate, day))
    .sort((a, b) => (a.publicationTime ?? "").localeCompare(b.publicationTime ?? ""));
  const count = dayPublications.length;

  return (
    <div className="flex flex-1 flex-col">
      {/* Encabezado del día: mismo tratamiento que los nombres de los días en Semana y Mes (blanco, texto discreto). */}
      <div className={cn("flex shrink-0 items-center justify-between gap-3 px-1 py-2", CAL_DAY_NAMES)}>
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-sm font-semibold text-foreground">{formatFullDateFromDate(day)}</span>
          {isToday(day) && <span className="text-[11px] font-medium tracking-wide uppercase opacity-80">Hoy</span>}
          <span className="shrink-0 text-xs opacity-80">
            · {count === 1 ? "1 publicación" : `${count} publicaciones`}
          </span>
        </div>
        {onCreateForDay && (
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 gap-1 text-current hover:bg-black/5"
            onClick={() => onCreateForDay(day)}
            aria-label="Nuevo contenido este día"
          >
            <Plus />
            Nuevo
          </Button>
        )}
      </div>

      <div className={cn("flex flex-1 flex-col", CAL_GRID_FRAME, isWeekend(day) ? CAL_WEEKEND_BG : CAL_DAY_BG)}>
      {count === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">No hay publicaciones este día.</p>
          {onCreateForDay && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onCreateForDay(day)}>
              <Plus />
              Nuevo contenido
            </Button>
          )}
        </div>
      ) : (
        // Columnas iguales y tarjetas alineadas arriba: con menos publicaciones que columnas no se estiran a lo ancho,
        // y cada una crece en alto según su contenido (scroll natural de la página).
        <div className="grid grid-cols-2 items-start gap-4 p-4 lg:grid-cols-3">
          {dayPublications.map((publication) => (
            <PublicationCard
              key={publication.id}
              publication={publication}
              onOpen={() => onOpenPublication(publication)}
              onEdit={onEditPublication}
              onDuplicate={onDuplicatePublication}
              onDeletePublication={onDeletePublication}
              clientId={getClientId?.(publication)}
              showClient={showClient}
              showCalendarLabel={showCalendarLabel}
            />
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
