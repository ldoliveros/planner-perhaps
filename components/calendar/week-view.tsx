"use client";

import type { ButtonHTMLAttributes } from "react";
import { DndContext, DragOverlay, useDraggable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { isWeekend } from "date-fns";
import { cn } from "cn";
import { formatDayAbbr, formatDayNumber, formatWeekdayAndDay, isSameDayAs, isToday } from "@/lib/date-utils";
import {
  CAL_DAY_ADD_BUTTON,
  CAL_DAY_BG,
  CAL_DAY_NAMES,
  CAL_GRID_FRAME,
  CAL_LINE_BORDER,
  CAL_LINE_DIVIDE,
  CAL_WEEKEND_BG,
} from "@/lib/calendar-surface";
import { PublicationCard } from "@/components/calendar/publication-card";
import { DayDropZone, toDateKey, usePublicationDnd } from "@/components/calendar/publication-dnd";
import type { Publication } from "@/types";

interface DraggableCardProps {
  publication: Publication;
  canMove: boolean;
  saving: boolean;
  onOpen: () => void;
  onEdit?: (publication: Publication) => void;
  onDuplicate?: (publication: Publication) => void;
  onDeletePublication?: (publicationId: string) => void;
  clientId?: string;
  showClient?: boolean;
  showCalendarLabel: boolean;
}

function DraggableCard({ publication, canMove, saving, ...cardProps }: DraggableCardProps) {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: publication.id, disabled: !canMove || saving });

  return (
    <PublicationCard
      publication={publication}
      {...cardProps}
      dragRef={canMove ? setNodeRef : undefined}
      dragProps={canMove && !saving ? ((listeners as ButtonHTMLAttributes<HTMLButtonElement> | undefined) ?? {}) : undefined}
      dragState={saving ? "saving" : isDragging ? "dragging" : undefined}
    />
  );
}

interface WeekViewProps {
  weekDays: Date[];
  publications: Publication[];
  onOpenPublication: (publication: Publication) => void;
  onEditPublication?: (publication: Publication) => void;
  onDuplicatePublication?: (publication: Publication) => void;
  onDeletePublication?: (publicationId: string) => void;
  /**
   * Cliente dueño de cada card. En el Planner de un cliente es siempre el mismo (`() => client.id`); en
   * Publicaciones (calendario global) cada publicación resuelve al suyo (`(p) => p.clientId`) — así se
   * reutiliza esta misma vista en los dos contextos sin bifurcarla.
   */
  getClientId?: (publication: Publication) => string | undefined;
  /** Solo Publicaciones (contexto "global"): logo + nombre del cliente debajo del título. */
  showClient?: boolean;
  onCreateForDay?: (day: Date) => void;
  showCalendarLabel: boolean;
}

export function WeekView({
  weekDays,
  publications,
  onOpenPublication,
  onEditPublication,
  onDuplicatePublication,
  onDeletePublication,
  getClientId,
  showClient,
  onCreateForDay,
  showCalendarLabel,
}: WeekViewProps) {
  // Mismo criterio que el `•••` (Bloque C): solo quien puede editar recibe los callbacks.
  // El permiso real lo sigue aplicando RLS en movePublicationToDate.
  const canMove = Boolean(onEditPublication && onDuplicatePublication && getClientId);

  const { displayedPublications, activePublication, saving, contextProps } = usePublicationDnd(publications, (targetKey) => {
    const targetDay = weekDays.find((d) => toDateKey(d) === targetKey);
    return targetDay ? `Publicación movida al ${formatWeekdayAndDay(targetDay)}` : "Publicación movida";
  });

  return (
    <DndContext id="week-view-dnd" {...contextProps}>
      {/* Admite un solo día (una columna), pero desde v1.6 la vista Día usa su propio tablero (DayView). */}
      <div className="flex flex-1 flex-col">
      {/* Franja de nombres de los días: una fila propia y continua (sin los divisores de las columnas). */}
      <div className={cn("grid shrink-0", CAL_DAY_NAMES, weekDays.length === 1 ? "grid-cols-1" : "grid-cols-7")}>
        {weekDays.map((day) => (
          <span key={toDateKey(day)} className="py-2 text-center text-[11px] font-medium tracking-wide">
            {formatDayAbbr(day)}
          </span>
        ))}
      </div>
      <div className={cn("grid flex-1 divide-x", CAL_LINE_DIVIDE, CAL_GRID_FRAME, weekDays.length === 1 ? "grid-cols-1" : "grid-cols-7")}>
        {weekDays.map((day) => {
          const dateKey = toDateKey(day);
          const dayPublications = displayedPublications
            .filter((p) => isSameDayAs(p.publicationDate, day))
            .sort((a, b) => (a.publicationTime ?? "").localeCompare(b.publicationTime ?? ""));
          const today = isToday(day);
          const weekend = isWeekend(day);

          return (
            <DayDropZone
              key={dateKey}
              dateKey={dateKey}
              dragSourceKey={activePublication?.publicationDate ?? null}
              disabled={!canMove}
              // Fondo del día (paleta del calendario: derivada del color del cliente, o celeste en Publicaciones):
              // hábil casi blanco, sábado y domingo el mismo tinte de fin de semana. Hoy conserva el fondo de su día;
              // su indicador es el círculo del número.
              className={cn("group/day flex min-h-0 flex-col", weekend ? CAL_WEEKEND_BG : CAL_DAY_BG)}
            >
              <div className={cn("relative flex flex-col items-center border-b py-2.5", CAL_LINE_BORDER)}>
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full text-sm font-semibold",
                    today ? "bg-primary text-primary-foreground" : "text-foreground"
                  )}
                >
                  {formatDayNumber(day)}
                </span>
                {onCreateForDay && (
                  <button
                    type="button"
                    onClick={() => onCreateForDay(day)}
                    className={cn("absolute top-1.5 right-1.5", CAL_DAY_ADD_BUTTON)}
                    aria-label="Nuevo contenido este día"
                    title="Nuevo contenido este día"
                  >
                    <Plus className="size-4" strokeWidth={2.5} />
                  </button>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-2 p-2">
                {dayPublications.map((publication) => (
                  <DraggableCard
                    key={publication.id}
                    publication={publication}
                    canMove={canMove}
                    saving={publication.id in saving}
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
            </DayDropZone>
          );
        })}
      </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activePublication && (
          <div aria-hidden className="pointer-events-none cursor-grabbing select-none rotate-1 opacity-95 shadow-lg">
            <PublicationCard publication={activePublication} onOpen={() => {}} showClient={showClient} showCalendarLabel={showCalendarLabel} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
