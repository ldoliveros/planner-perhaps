"use client";

import type { ButtonHTMLAttributes } from "react";
import { DndContext, DragOverlay, useDraggable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { isWeekend } from "date-fns";
import { cn } from "cn";
import { formatDayAbbr, formatDayNumber, formatWeekdayAndDay, isSameDayAs, isToday } from "@/lib/date-utils";
import { hexToRgba } from "@/lib/color-contrast";
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
  clientId?: string;
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
  clientId?: string;
  onCreateForDay?: (day: Date) => void;
  clientColor: string;
  showCalendarLabel: boolean;
}

export function WeekView({
  weekDays,
  publications,
  onOpenPublication,
  onEditPublication,
  onDuplicatePublication,
  clientId,
  onCreateForDay,
  clientColor,
  showCalendarLabel,
}: WeekViewProps) {
  // Mismo criterio que el `•••` (Bloque C): solo quien puede editar recibe los callbacks.
  // El permiso real lo sigue aplicando RLS en movePublicationToDate.
  const canMove = Boolean(onEditPublication && onDuplicatePublication && clientId);

  const { displayedPublications, activePublication, saving, contextProps } = usePublicationDnd(publications, (targetKey) => {
    const targetDay = weekDays.find((d) => toDateKey(d) === targetKey);
    return targetDay ? `Publicación movida al ${formatWeekdayAndDay(targetDay)}` : "Publicación movida";
  });

  return (
    <DndContext id="week-view-dnd" {...contextProps}>
      <div className="grid flex-1 grid-cols-7 divide-x divide-border">
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
              className={cn("group/day flex min-h-0 flex-col", today && "bg-primary/[0.03]")}
              style={!today && weekend ? { backgroundColor: hexToRgba(clientColor, 0.05) } : undefined}
            >
              <div className="relative flex flex-col items-center gap-1 border-b border-border py-2.5">
                <span className="text-[11px] font-medium tracking-wide text-muted-foreground">{formatDayAbbr(day)}</span>
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
                    className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:bg-muted hover:text-foreground group-hover/day:opacity-100"
                    aria-label="Nuevo contenido este día"
                    title="Nuevo contenido este día"
                  >
                    <Plus className="size-4" />
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
                    clientId={clientId}
                    showCalendarLabel={showCalendarLabel}
                  />
                ))}
              </div>
            </DayDropZone>
          );
        })}
      </div>

      <DragOverlay dropAnimation={null}>
        {activePublication && (
          <div aria-hidden className="pointer-events-none cursor-grabbing select-none rotate-1 opacity-95 shadow-lg">
            <PublicationCard publication={activePublication} onOpen={() => {}} showCalendarLabel={showCalendarLabel} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
