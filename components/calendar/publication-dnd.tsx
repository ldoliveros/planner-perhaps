"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { MouseSensor, pointerWithin, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { format } from "date-fns";
import { cn } from "cn";
import { movePublicationToDate } from "@/lib/actions/publications";
import { toast } from "@/lib/toast";
import type { Publication } from "@/types";

/**
 * Drag & drop de publicaciones entre días, compartido por las vistas Semana y Mes (desktop).
 * La lógica vive acá una sola vez: estado del drag, guardado con `movePublicationToDate` (conserva la
 * hora), actualización optimista confirmada por la DB y reconciliación con el refresh del servidor.
 */

/** Píxeles de movimiento antes de que un press se considere drag (por debajo sigue siendo un click → drawer). */
const DRAG_ACTIVATION_DISTANCE = 8;

export const toDateKey = (day: Date) => format(day, "yyyy-MM-dd");

/**
 * @param publications publicaciones tal como llegan del servidor.
 * @param movedMessage texto del toast de éxito para el día destino (`yyyy-MM-dd`).
 */
export function usePublicationDnd(publications: Publication[], movedMessage: (targetKey: string) => string) {
  const router = useRouter();

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
    toast.success(movedMessage(targetKey));
    router.refresh();
  }

  return {
    displayedPublications,
    activePublication,
    saving,
    /** Props para el `<DndContext>` de la vista (agregar `id`). */
    contextProps: {
      sensors,
      collisionDetection: pointerWithin,
      onDragStart: handleDragStart,
      onDragEnd: handleDragEnd,
      onDragCancel: () => setActiveId(null),
    },
  };
}

interface DayDropZoneProps {
  dateKey: string;
  /** Día de origen de la publicación que se está arrastrando: soltar ahí es un no-op, no se resalta. */
  dragSourceKey: string | null;
  disabled: boolean;
  className: string;
  style?: CSSProperties;
  children: ReactNode;
}

/** Contenedor de un día (columna de Semana / celda de Mes) que resalta cuando se le puede soltar una publicación. */
export function DayDropZone({ dateKey, dragSourceKey, disabled, className, style, children }: DayDropZoneProps) {
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
