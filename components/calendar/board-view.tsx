"use client";

import { useMemo, useState, type ButtonHTMLAttributes } from "react";
import Image from "next/image";
import { DndContext, DragOverlay, MouseSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { cn } from "cn";
import { PublicationQuickActions } from "@/components/calendar/publication-quick-actions";
import { useStatusChangeFlow } from "@/components/calendar/use-status-change-flow";
import { PlatformIcon } from "@/components/icons/brand-icons";
import { ClientBadge } from "@/components/shared/client-badge";
import { StatusPill } from "@/components/shared/status-pill";
import { useLookups } from "@/components/providers/lookups-provider";
import { formatTime } from "@/lib/date-utils";
import type { Publication, Status } from "@/types";

/** Columnas del Tablero, en este orden y siempre visibles (los estados reales del proyecto). */
const BOARD_STATUS_KEYS = ["draft", "in_review", "approved", "published", "discarded"] as const;

/** Píxeles de movimiento antes de que un press se considere drag (por debajo sigue siendo un click → abre). */
const DRAG_ACTIVATION_DISTANCE = 8;

const MONTH_ABBR = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function formatShortDate(dateIso: string, time: string | null): string {
  const [, m, d] = dateIso.split("-");
  const date = `${Number(d)} ${MONTH_ABBR[Number(m) - 1] ?? ""}`;
  return time ? `${date} · ${formatTime(time)}` : date;
}

interface BoardViewProps {
  /** Ya filtradas (contexto, búsqueda, filtros, período del mes, sin archivadas). */
  publications: Publication[];
  onOpenPublication: (publication: Publication) => void;
  onEditPublication?: (publication: Publication) => void;
  onDuplicatePublication?: (publication: Publication) => void;
  onDeletePublication?: (publicationId: string) => void;
  getClientId?: (publication: Publication) => string | undefined;
  /** Calendario global: cada tarjeta muestra el cliente. */
  showClient?: boolean;
  showCalendarLabel: boolean;
}

/**
 * Tablero (v1.6): publicaciones del mes elegido agrupadas por estado editorial, en cinco columnas fijas (Borrador,
 * En revisión, Aprobado, Publicado, Descartado). Clic → la Vista de Publicación de siempre.
 *
 * Mover entre columnas = cambiar el estado con el MISMO flujo que el menú `•••` (useStatusChangeFlow): "Enviar a
 * revisión", UPDATE condicional contra cambios concurrentes y la RLS de siempre. Solo staff
 * (con acciones de gestión): para el Client User el tablero es de solo lectura (sin arrastre ni indicadores). La
 * tarjeta se muestra en la columna destino mientras se guarda; si falla o se cancela un diálogo, vuelve a su columna.
 * Reordenar dentro de una columna no hace nada. Solo mouse para arrastrar (el touch queda para el scroll horizontal);
 * la alternativa táctil y de teclado es "Cambiar estado" en el `•••` de cada tarjeta.
 */
export function BoardView({
  publications,
  onOpenPublication,
  onEditPublication,
  onDuplicatePublication,
  onDeletePublication,
  getClientId,
  showClient,
  showCalendarLabel,
}: BoardViewProps) {
  const { statuses } = useLookups();
  const statusFlow = useStatusChangeFlow();
  const canMove = Boolean(onEditPublication && onDuplicatePublication && getClientId);

  const columns = useMemo(
    () =>
      BOARD_STATUS_KEYS.map((key) => statuses.find((s) => s.key === key)).filter((s): s is Status => Boolean(s)),
    [statuses]
  );

  // Movimientos en curso / recién guardados: la tarjeta se muestra en el estado destino. Se descarta cuando la lista
  // (servidor o en vivo) ya trae ese estado, cuando la publicación desaparece, o al fallar/cancelar.
  const [moves, setMoves] = useState<Record<string, string>>({});
  const [seen, setSeen] = useState(publications);
  if (seen !== publications) {
    setSeen(publications);
    const ids = Object.keys(moves);
    if (ids.length > 0) {
      const kept = ids.filter((id) => {
        const current = publications.find((p) => p.id === id);
        return current && current.statusId !== moves[id];
      });
      if (kept.length !== ids.length) setMoves(Object.fromEntries(kept.map((id) => [id, moves[id]])));
    }
  }
  const statusOf = (p: Publication) => moves[p.id] ?? p.statusId;

  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState<Record<string, true>>({});
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE } }));
  const activePublication = activeId ? publications.find((p) => p.id === activeId) ?? null : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  async function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    if (!over) return;
    const publication = publications.find((p) => p.id === active.id);
    const targetStatusId = String(over.id);
    // Misma columna (o reordenar dentro de ella): no cambia nada.
    if (!publication || statusOf(publication) === targetStatusId || saving[publication.id]) return;

    setMoves((prev) => ({ ...prev, [publication.id]: targetStatusId }));
    setSaving((prev) => ({ ...prev, [publication.id]: true }));
    const saved = await statusFlow.request(publication, targetStatusId);
    setSaving((prev) => {
      const next = { ...prev };
      delete next[publication.id];
      return next;
    });
    if (!saved) {
      // Falló o se canceló: vuelve a su columna original.
      setMoves((prev) => {
        const next = { ...prev };
        delete next[publication.id];
        return next;
      });
    }
  }

  const byStatus = new Map<string, Publication[]>();
  for (const publication of publications) {
    const statusId = statusOf(publication);
    const list = byStatus.get(statusId) ?? [];
    list.push(publication);
    byStatus.set(statusId, list);
  }
  for (const list of byStatus.values()) {
    list.sort(
      (a, b) =>
        a.publicationDate.localeCompare(b.publicationDate) ||
        (a.publicationTime ?? "99:99").localeCompare(b.publicationTime ?? "99:99") ||
        a.title.localeCompare(b.title, "es")
    );
  }

  const activeSourceStatus = activePublication ? statusOf(activePublication) : null;

  const board = (
    // Cinco columnas en una fila; con poco ancho, scroll horizontal (columnas de al menos 240 px, nunca angostas).
    <div className="flex-1 overflow-x-auto overscroll-x-contain pb-2">
      <div className="grid min-w-max auto-cols-[minmax(240px,1fr)] grid-flow-col gap-3 md:min-w-0">
        {columns.map((status) => (
          <BoardColumn
            key={status.id}
            status={status}
            publications={byStatus.get(status.id) ?? []}
            droppable={canMove}
            highlight={activeSourceStatus !== null && activeSourceStatus !== status.id}
          >
            {(byStatus.get(status.id) ?? []).map((publication) => (
              <DraggableBoardCard
                key={publication.id}
                publication={publication}
                canMove={canMove}
                saving={Boolean(saving[publication.id])}
                onOpen={() => onOpenPublication(publication)}
                onEdit={onEditPublication}
                onDuplicate={onDuplicatePublication}
                onDeletePublication={onDeletePublication}
                clientId={getClientId?.(publication)}
                showClient={showClient}
                showCalendarLabel={showCalendarLabel}
              />
            ))}
          </BoardColumn>
        ))}
      </div>
    </div>
  );

  if (!canMove) return <div className="flex flex-1 flex-col">{board}</div>;

  return (
    <DndContext
      id="board-view-dnd"
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={(event) => void handleDragEnd(event)}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex flex-1 flex-col">{board}</div>
      <DragOverlay dropAnimation={null}>
        {activePublication && (
          <div className="w-[240px] rotate-1 cursor-grabbing">
            <BoardCard publication={activePublication} showClient={showClient} showCalendarLabel={showCalendarLabel} overlay />
          </div>
        )}
      </DragOverlay>
      {statusFlow.dialogs}
    </DndContext>
  );
}

function BoardColumn({
  status,
  publications,
  droppable,
  highlight,
  children,
}: {
  status: Status;
  publications: Publication[];
  droppable: boolean;
  /** Se está arrastrando una tarjeta de OTRA columna: esta puede recibirla. */
  highlight: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status.id, disabled: !droppable });
  const active = droppable && highlight && isOver;
  return (
    <section
      ref={setNodeRef}
      aria-label={`${status.label}: ${publications.length} ${publications.length === 1 ? "publicación" : "publicaciones"}`}
      // Fondo pastel del color del estado (el mismo de su pill); más intenso cuando puede recibir la tarjeta arrastrada.
      className="flex min-h-[12rem] flex-col gap-2 rounded-xl border p-2 transition-colors"
      style={{
        backgroundColor: `color-mix(in srgb, ${status.color} ${active ? 14 : 7}%, white)`,
        borderColor: `color-mix(in srgb, ${status.color} ${active ? 45 : 18}%, white)`,
      }}
    >
      <header className="flex items-center justify-between gap-2 px-1 pt-0.5">
        <StatusPill status={status} className="min-w-0" />
        <span className="rounded-full bg-white px-1.5 text-xs leading-5 font-medium text-muted-foreground tabular-nums ring-1 ring-[#ECEEF1]">
          {publications.length}
        </span>
      </header>
      <div className="flex flex-col gap-2">
        {publications.length === 0 ? (
          <p
            className="rounded-lg border border-dashed px-2 py-6 text-center text-xs text-muted-foreground"
            style={{ borderColor: `color-mix(in srgb, ${status.color} 30%, white)` }}
          >
            Sin publicaciones
          </p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

function DraggableBoardCard({
  publication,
  canMove,
  saving,
  ...rest
}: {
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
}) {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: publication.id, disabled: !canMove || saving });
  return (
    <BoardCard
      publication={publication}
      {...rest}
      dragRef={canMove ? setNodeRef : undefined}
      dragProps={canMove && !saving ? ((listeners as ButtonHTMLAttributes<HTMLButtonElement> | undefined) ?? {}) : undefined}
      dragState={saving ? "saving" : isDragging ? "dragging" : undefined}
    />
  );
}

/** Tarjeta compacta del Tablero: miniatura, cliente (global), título, plataformas, tipo y fecha. */
function BoardCard({
  publication,
  onOpen,
  onEdit,
  onDuplicate,
  onDeletePublication,
  clientId,
  showClient,
  showCalendarLabel,
  dragRef,
  dragProps,
  dragState,
  overlay = false,
}: {
  publication: Publication;
  onOpen?: () => void;
  onEdit?: (publication: Publication) => void;
  onDuplicate?: (publication: Publication) => void;
  onDeletePublication?: (publicationId: string) => void;
  clientId?: string;
  showClient?: boolean;
  showCalendarLabel: boolean;
  dragRef?: (node: HTMLElement | null) => void;
  dragProps?: ButtonHTMLAttributes<HTMLButtonElement>;
  dragState?: "dragging" | "saving";
  /** Copia que sigue al puntero mientras se arrastra (sin acciones). */
  overlay?: boolean;
}) {
  const { getCalendar, getClient, getClientAccount, getContentType, getPlatform } = useLookups();
  const contentType = getContentType(publication.contentTypeId);
  const calendar = showCalendarLabel ? getCalendar(publication.calendarId) : undefined;
  const client = showClient ? getClient(publication.clientId) : undefined;
  const hero = publication.assets.find((a) => a.isPrimary) ?? publication.assets[0] ?? null;
  const platformIds = Array.from(
    new Set(
      publication.destinations
        .map((d) => getClientAccount(d.clientAccountId)?.platformId)
        .filter((id): id is string => Boolean(id))
    )
  );
  const canManage = Boolean(onEdit && onDuplicate && clientId);

  return (
    <div
      className={cn(
        "group/card relative flex w-full flex-col overflow-hidden rounded-lg border border-[#E5E7EB] bg-white text-left shadow-xs transition hover:border-foreground/15 hover:shadow-md",
        dragState === "dragging" && "opacity-40",
        dragState === "saving" && "animate-pulse opacity-70",
        overlay && "shadow-lg"
      )}
    >
      {!overlay && (
        <button
          ref={dragRef}
          type="button"
          onClick={onOpen}
          aria-label={`Abrir ${publication.title}`}
          {...dragProps}
          className={cn(
            "absolute inset-0 z-[1] rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            dragProps && "cursor-grab active:cursor-grabbing"
          )}
        />
      )}
      {hero?.thumbnailUrl && (
        <div className="relative h-24 w-full shrink-0 overflow-hidden bg-muted">
          <Image src={hero.thumbnailUrl} alt="" fill sizes="260px" className="object-cover" />
        </div>
      )}
      <div className="flex flex-col gap-1.5 p-2.5">
        <div className="flex items-start justify-between gap-1.5">
          <div className="flex min-w-0 flex-col gap-1">
            {client && <ClientBadge client={client} size="sm" />}
            <p className="line-clamp-2 text-[13px] leading-snug font-medium text-foreground">{publication.title}</p>
          </div>
          {!overlay && (
            <div className="relative z-[2] -mt-0.5 -mr-1 shrink-0">
              <PublicationQuickActions
                publication={publication}
                clientId={clientId}
                onEdit={canManage ? () => onEdit!(publication) : undefined}
                onDuplicate={canManage ? () => onDuplicate!(publication) : undefined}
                onDeleted={onDeletePublication}
                className="size-6"
              />
            </div>
          )}
        </div>
        {calendar && (
          <span className="w-fit rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{calendar.name}</span>
        )}
        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="flex min-w-0 items-center gap-1.5">
            {platformIds.map((platformId) => {
              const platform = getPlatform(platformId);
              if (!platform) return null;
              return (
                <span key={platformId} title={platform.name}>
                  <PlatformIcon platformKey={platform.key} className="size-3.5" style={{ color: platform.color }} />
                </span>
              );
            })}
            {contentType && <span className="truncate">{contentType.label}</span>}
          </span>
          <span className="shrink-0 tabular-nums">{formatShortDate(publication.publicationDate, publication.publicationTime)}</span>
        </div>
      </div>
    </div>
  );
}
