"use client";

import { useMemo, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { DndContext, DragOverlay, MouseSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { format, isWeekend } from "date-fns";
import { cn } from "cn";
import { formatDayAbbr, formatDayNumber, formatWeekdayAndDay, isSameDayAs, isToday } from "@/lib/date-utils";
import { hexToRgba } from "@/lib/color-contrast";
import { movePublicationToDate } from "@/lib/actions/publications";
import { toast } from "@/lib/toast";
import { PublicationCard } from "@/components/calendar/publication-card";
import type { Publication } from "@/types";

/** Píxeles de movimiento antes de que un press se considere drag (por debajo sigue siendo un click → drawer). */
const DRAG_ACTIVATION_DISTANCE = 8;

const toDateKey = (day: Date) => format(day, "yyyy-MM-dd");

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

interface DayColumnProps {
  dateKey: string;
  /** Día de origen de la publicación que se está arrastrando: soltar ahí es un no-op, no se resalta. */
  dragSourceKey: string | null;
  disabled: boolean;
  className: string;
  style?: CSSProperties;
  children: ReactNode;
}

function DayColumn({ dateKey, dragSourceKey, disabled, className, style, children }: DayColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: dateKey, disabled });
  const highlighted = isOver && dragSourceKey !== null && dragSourceKey !== dateKey;

  return (
    <div
      ref={setNodeRef}
      className={cn(className, "transition-colors", highlighted && "bg-primary/[0.08] ring-2 ring-inset ring-primary/40")}
      style={style}
    >
      {children}
    </div>
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
  const router = useRouter();
  // Mismo criterio que el `•••` (Bloque C): solo quien puede editar recibe los callbacks.
  // El permiso real lo sigue aplicando RLS en movePublicationToDate.
  const canMove = Boolean(onEditPublication && onDuplicatePublication && clientId);

  const [activeId, setActiveId] = useState<string | null>(null);
  // Publicaciones esperando la confirmación del server action (única fase con "pulso").
  const [saving, setSaving] = useState<Record<string, true>>({});
  // Movimientos ya confirmados por la DB: la card se muestra en `target` sin esperar el re-render del
  // servidor. `stale` = fechas que todavía pueden llegar en props viejas mientras el refresh está en vuelo.
  const [movedTo, setMovedTo] = useState<Record<string, { target: string; stale: string[] }>>({});

  // Solo mouse: el touch queda fuera a propósito (v1.3), así el scroll táctil nunca compite con el drag.
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE } }));

  // Reconciliación con el servidor (se ajusta durante el render, patrón de React, no en un effect):
  // - props con fecha vieja (stale) -> se mantiene el override, así la card no vuelve al día anterior;
  // - props con la fecha destino, con otra fecha, o sin la publicación -> el override ya no hace falta.
  const [seenPublications, setSeenPublications] = useState(publications);
  if (seenPublications !== publications) {
    setSeenPublications(publications);
    const ids = Object.keys(movedTo);
    if (ids.length > 0) {
      const kept = ids.filter((id) => {
        const server = publications.find((p) => p.id === id);
        return server && movedTo[id].stale.includes(server.publicationDate);
      });
      if (kept.length !== ids.length) setMovedTo(Object.fromEntries(kept.map((id) => [id, movedTo[id]])));
    }
  }

  // Solo se copian las publicaciones movidas; el resto conserva su referencia.
  const displayedPublications = useMemo(
    () => publications.map((p) => (movedTo[p.id] ? { ...p, publicationDate: movedTo[p.id].target } : p)),
    [publications, movedTo]
  );

  const activePublication = activeId ? displayedPublications.find((p) => p.id === activeId) ?? null : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  async function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    if (!over) return;
    const publication = displayedPublications.find((p) => p.id === active.id);
    const targetKey = String(over.id);
    if (!publication || publication.publicationDate === targetKey) return;

    setSaving((prev) => ({ ...prev, [publication.id]: true }));
    let result: { error: string | null };
    try {
      result = await movePublicationToDate(publication.id, targetKey);
    } catch {
      result = { error: "No se pudo conectar con el servidor. Probá de nuevo." };
    }
    setSaving((prev) => {
      const next = { ...prev };
      delete next[publication.id];
      return next;
    });
    if (result.error) {
      toast.error("No se pudo mover la publicación", result.error);
      return;
    }
    // La DB confirmó: la card pasa al día destino ya mismo. El refresh reconcilia en segundo plano.
    setMovedTo((prev) => {
      const stale = new Set([...(prev[publication.id]?.stale ?? []), publication.publicationDate]);
      stale.delete(targetKey);
      return { ...prev, [publication.id]: { target: targetKey, stale: [...stale] } };
    });
    const targetDay = weekDays.find((d) => toDateKey(d) === targetKey);
    toast.success(targetDay ? `Publicación movida al ${formatWeekdayAndDay(targetDay)}` : "Publicación movida");
    router.refresh();
  }

  return (
    <DndContext
      id="week-view-dnd"
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="grid flex-1 grid-cols-7 divide-x divide-border">
        {weekDays.map((day) => {
          const dateKey = toDateKey(day);
          const dayPublications = displayedPublications
            .filter((p) => isSameDayAs(p.publicationDate, day))
            .sort((a, b) => (a.publicationTime ?? "").localeCompare(b.publicationTime ?? ""));
          const today = isToday(day);
          const weekend = isWeekend(day);

          return (
            <DayColumn
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
            </DayColumn>
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
