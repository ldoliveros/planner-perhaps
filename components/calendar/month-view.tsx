"use client";

import type { ButtonHTMLAttributes } from "react";
import Image from "next/image";
import { DndContext, DragOverlay, useDraggable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { isWeekend } from "date-fns";
import { cn } from "cn";
import { DayDropZone, toDateKey, usePublicationDnd } from "@/components/calendar/publication-dnd";
import { PublicationQuickActions } from "@/components/calendar/publication-quick-actions";
import { PlatformIcon } from "@/components/icons/brand-icons";
import { StatusPill } from "@/components/shared/status-pill";
import { ClientBadge } from "@/components/shared/client-badge";
import { useLookups } from "@/components/providers/lookups-provider";
import { hexToRgba } from "@/lib/color-contrast";
import {
  formatDayNumber,
  formatWeekdayAndDay,
  formatTime,
  getMonthGridDays,
  isSameDayAs,
  isSameMonthAs,
  isToday,
} from "@/lib/date-utils";
import type { Publication } from "@/types";

const WEEKDAY_LABELS = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];
// Alto mínimo de un chip completo (pill de estado + íconos de canal, título de 2 líneas y hora/calendario): evita
// que un chip con menos contenido (sin hora, sin calendario) se vea más bajo que sus vecinos. No fija cuántos
// chips entran por día — eso lo decide el alto real de la fila, que reparte dinámicamente el alto disponible
// (ver el grid de más abajo); si no entran todos, el área de contenidos de ESE día scrollea.
const CHIP_MIN_HEIGHT = 64;

interface MonthChipProps {
  publication: Publication;
  onOpen: () => void;
  onEdit?: (publication: Publication) => void;
  onDuplicate?: (publication: Publication) => void;
  clientId?: string;
  /** Solo Publicaciones (contexto "global"): logo muy pequeño + nombre del cliente, de forma adaptativa. */
  showClient?: boolean;
  showCalendarLabel: boolean;
  /** Solo en desktop y solo para quien puede mover (Super Admin / Account Manager); ver DraggableMonthChip. */
  dragRef?: (node: HTMLElement | null) => void;
  dragProps?: ButtonHTMLAttributes<HTMLButtonElement>;
  dragState?: "dragging" | "saving";
}

function MonthChip({
  publication,
  onOpen,
  onEdit,
  onDuplicate,
  clientId,
  showClient,
  showCalendarLabel,
  dragRef,
  dragProps,
  dragState,
}: MonthChipProps) {
  const { getCalendar, getClient, getClientAccount, getPlatform, getStatus } = useLookups();
  const canManage = Boolean(onEdit && onDuplicate && clientId);
  const status = getStatus(publication.statusId);
  // En Publicaciones (global) el cliente reemplaza al calendario en esta línea — prioridad 1 es reconocer el
  // cliente (spec), y el chip no tiene alto para las dos cosas sin romper la densidad de Mes.
  const client = showClient ? getClient(publication.clientId) : undefined;
  const calendar = !showClient && showCalendarLabel ? getCalendar(publication.calendarId) : undefined;
  const primaryAsset = publication.assets.find((a) => a.isPrimary) ?? publication.assets[0];
  const uniquePlatformIds = Array.from(
    new Set(
      publication.destinations
        .map((d) => getClientAccount(d.clientAccountId)?.platformId)
        .filter((id): id is string => Boolean(id))
    )
  );

  return (
    <div
      style={{ minHeight: CHIP_MIN_HEIGHT }}
      className={cn(
        "group/chip relative flex w-full shrink-0 items-start gap-2 rounded-md px-1 py-1 transition-colors hover:bg-muted",
        dragState === "dragging" && "opacity-40",
        dragState === "saving" && "animate-pulse opacity-70"
      )}
    >
      <button
        ref={dragRef}
        type="button"
        onClick={onOpen}
        aria-label={publication.title}
        {...dragProps}
        className={cn(
          "absolute inset-0 z-[1] rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          dragProps && "cursor-grab active:cursor-grabbing"
        )}
      />
      <span className="relative size-12 shrink-0 overflow-hidden rounded-sm bg-muted">
        {primaryAsset?.thumbnailUrl && (
          <Image src={primaryAsset.thumbnailUrl} alt="" fill sizes="48px" className="object-cover" />
        )}
      </span>
      <div className="absolute right-0.5 top-0.5 z-10 opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/chip:opacity-100 [@media(hover:hover)]:group-focus-within/chip:opacity-100">
        <PublicationQuickActions
          publication={publication}
          clientId={clientId}
          onEdit={canManage ? () => onEdit!(publication) : undefined}
          onDuplicate={canManage ? () => onDuplicate!(publication) : undefined}
          className="size-5 bg-background/90 shadow-xs"
        />
      </div>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 leading-tight">
        {(status || uniquePlatformIds.length > 0) && (
          <span className="flex min-w-0 items-center justify-between gap-1">
            {status && <StatusPill status={status} size="xs" />}
            {uniquePlatformIds.length > 0 && (
              <span className="ml-auto flex shrink-0 items-center gap-0.5">
                {uniquePlatformIds.slice(0, 3).map((platformId) => {
                  const platform = getPlatform(platformId);
                  if (!platform) return null;
                  return (
                    <PlatformIcon
                      key={platformId}
                      platformKey={platform.key}
                      className="size-2.5 shrink-0"
                      style={{ color: platform.color }}
                    />
                  );
                })}
              </span>
            )}
          </span>
        )}
        <span className="line-clamp-2 text-[11px] font-medium text-foreground">{publication.title}</span>
        {(publication.publicationTime || calendar || client) && (
          <span className="flex min-w-0 items-center gap-1 text-[9.5px] text-muted-foreground">
            {publication.publicationTime && (
              <span className="shrink-0 tabular-nums">{formatTime(publication.publicationTime)}</span>
            )}
            {client && <ClientBadge client={client} size="xs" className="min-w-0" />}
            {calendar && <span className="truncate">{calendar.name}</span>}
          </span>
        )}
      </span>
    </div>
  );
}

interface DraggableMonthChipProps extends Omit<MonthChipProps, "dragRef" | "dragProps" | "dragState"> {
  canMove: boolean;
  saving: boolean;
}

/** Chip arrastrable de la vista Mes (mismo esquema que DraggableCard en Semana). */
function DraggableMonthChip({ publication, canMove, saving, ...chipProps }: DraggableMonthChipProps) {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: publication.id, disabled: !canMove || saving });

  return (
    <MonthChip
      publication={publication}
      {...chipProps}
      dragRef={canMove ? setNodeRef : undefined}
      dragProps={canMove && !saving ? ((listeners as ButtonHTMLAttributes<HTMLButtonElement> | undefined) ?? {}) : undefined}
      dragState={saving ? "saving" : isDragging ? "dragging" : undefined}
    />
  );
}

interface MonthDayCellProps {
  day: Date;
  publications: Publication[];
  inCurrentMonth: boolean;
  onOpenPublication: (publication: Publication) => void;
  onEditPublication?: (publication: Publication) => void;
  onDuplicatePublication?: (publication: Publication) => void;
  getClientId?: (publication: Publication) => string | undefined;
  showClient?: boolean;
  onCreateForDay?: (day: Date) => void;
  clientColor: string;
  showCalendarLabel: boolean;
  canMove: boolean;
  saving: Record<string, true>;
  dragSourceKey: string | null;
}

function MonthDayCell({
  day,
  publications,
  inCurrentMonth,
  onOpenPublication,
  onEditPublication,
  onDuplicatePublication,
  getClientId,
  showClient,
  onCreateForDay,
  clientColor,
  showCalendarLabel,
  canMove,
  saving,
  dragSourceKey,
}: MonthDayCellProps) {
  const today = isToday(day);
  const weekend = isWeekend(day);
  const bgClass = today ? "bg-primary/[0.03]" : !weekend && !inCurrentMonth ? "bg-muted/30" : "";

  return (
    <DayDropZone
      dateKey={toDateKey(day)}
      dragSourceKey={dragSourceKey}
      disabled={!canMove}
      // `min-h-0`: la celda es una fila de la grilla (alto fijo, repartido dinámicamente entre las semanas del
      // mes — ver el `grid` de MonthView) y no un contenido que empuja su fila a crecer. Sin esto, el número de
      // día y el "+" seguirían fijos por su propio contenido, pero el área de chips (flex-1 de abajo) no tendría
      // límite real para activar su scroll interno.
      className={cn("group/day flex min-h-0 flex-col gap-0.5 border-r border-b border-border p-1.5", bgClass)}
      style={!today && weekend ? { backgroundColor: hexToRgba(clientColor, 0.05) } : undefined}
    >
      <div className="flex shrink-0 items-center justify-between">
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-medium",
            today
              ? "bg-primary text-primary-foreground"
              : inCurrentMonth
                ? "text-foreground"
                : "text-muted-foreground/40"
          )}
        >
          {formatDayNumber(day)}
        </span>
        {onCreateForDay && (
          <button
            type="button"
            onClick={() => onCreateForDay(day)}
            className="flex size-5 items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:bg-muted hover:text-foreground group-hover/day:opacity-100"
            aria-label="Nuevo contenido este día"
            title="Nuevo contenido este día"
          >
            <Plus className="size-3.5" />
          </button>
        )}
      </div>

      {/* Ocupa todo el alto que sobra en la celda (cuántos chips entran depende de ese alto, no de un número
          fijo); si no entran todos, scrollea solo esta área — el número de día de arriba queda fijo. */}
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-width:thin]">
        {publications.map((publication) => (
          <DraggableMonthChip
            key={publication.id}
            publication={publication}
            canMove={canMove}
            saving={publication.id in saving}
            onOpen={() => onOpenPublication(publication)}
            onEdit={onEditPublication}
            onDuplicate={onDuplicatePublication}
            clientId={getClientId?.(publication)}
            showClient={showClient}
            showCalendarLabel={showCalendarLabel}
          />
        ))}
      </div>
    </DayDropZone>
  );
}

interface MonthViewProps {
  anchorDate: Date;
  publications: Publication[];
  onOpenPublication: (publication: Publication) => void;
  onEditPublication?: (publication: Publication) => void;
  onDuplicatePublication?: (publication: Publication) => void;
  /** Ver WeekViewProps.getClientId — misma generalización, mismo criterio en las dos vistas. */
  getClientId?: (publication: Publication) => string | undefined;
  showClient?: boolean;
  onCreateForDay?: (day: Date) => void;
  clientColor: string;
  showCalendarLabel: boolean;
}

export function MonthView({
  anchorDate,
  publications,
  onOpenPublication,
  onEditPublication,
  onDuplicatePublication,
  getClientId,
  showClient,
  onCreateForDay,
  clientColor,
  showCalendarLabel,
}: MonthViewProps) {
  const gridDays = getMonthGridDays(anchorDate);
  const weekCount = gridDays.length / 7;
  // Mismo criterio que Semana: solo quien puede editar recibe los callbacks; el permiso real lo aplica RLS.
  // Arrastrar solo mueve entre los días visibles de la grilla; para otro mes se usa "Cambiar fecha".
  const canMove = Boolean(onEditPublication && onDuplicatePublication && getClientId);

  const { displayedPublications, activePublication, saving, contextProps } = usePublicationDnd(publications, (targetKey) => {
    const targetDay = gridDays.find((d) => toDateKey(d) === targetKey);
    return targetDay ? `Publicación movida al ${formatWeekdayAndDay(targetDay)}` : "Publicación movida";
  });

  return (
    <DndContext id="month-view-dnd" {...contextProps}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="grid shrink-0 grid-cols-7 border-b border-border">
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              className="py-2 text-center text-[11px] font-medium tracking-wide text-muted-foreground"
            >
              {label}
            </div>
          ))}
        </div>
        {/* `minmax(0, 1fr)`, no `minmax(auto, 1fr)`: con "auto" cada fila crece hasta la altura de su contenido
            (lo que traía el espacio vacío para meses con pocas publicaciones y el desborde de página para meses
            con muchas). Con "0" las 5 o 6 semanas se reparten en partes iguales el alto real del contenedor
            (dado por `min-h-0 flex-1` de arriba, acotado a su vez por el layout del Planner), sea cual sea el
            contenido — y cada celda decide cuántos chips entran ahí y scrollea el resto (ver MonthDayCell). */}
        <div
          className="grid min-h-0 flex-1 grid-cols-7 border-t border-l border-border"
          style={{ gridTemplateRows: `repeat(${weekCount}, minmax(0, 1fr))` }}
        >
          {gridDays.map((day) => {
            const dayPublications = displayedPublications
              .filter((p) => isSameDayAs(p.publicationDate, day))
              .sort((a, b) => (a.publicationTime ?? "").localeCompare(b.publicationTime ?? ""));

            return (
              <MonthDayCell
                key={day.toISOString()}
                day={day}
                publications={dayPublications}
                inCurrentMonth={isSameMonthAs(day, anchorDate)}
                onOpenPublication={onOpenPublication}
                onEditPublication={onEditPublication}
                onDuplicatePublication={onDuplicatePublication}
                getClientId={getClientId}
                showClient={showClient}
                onCreateForDay={onCreateForDay}
                clientColor={clientColor}
                showCalendarLabel={showCalendarLabel}
                canMove={canMove}
                saving={saving}
                dragSourceKey={activePublication?.publicationDate ?? null}
              />
            );
          })}
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activePublication && (
          <div aria-hidden className="pointer-events-none cursor-grabbing select-none rotate-1 rounded-md bg-card opacity-95 shadow-lg">
            <MonthChip publication={activePublication} onOpen={() => {}} showClient={showClient} showCalendarLabel={showCalendarLabel} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
