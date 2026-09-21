"use client";

import type { ButtonHTMLAttributes } from "react";
import Image from "next/image";
import { DndContext, DragOverlay, useDraggable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { isWeekend } from "date-fns";
import { cn } from "cn";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DayDropZone, toDateKey, usePublicationDnd } from "@/components/calendar/publication-dnd";
import { PublicationQuickActions } from "@/components/calendar/publication-quick-actions";
import { PlatformIcon } from "@/components/icons/brand-icons";
import { StatusPill } from "@/components/shared/status-pill";
import { useLookups } from "@/components/providers/lookups-provider";
import { hexToRgba } from "@/lib/color-contrast";
import {
  formatDayNumber,
  formatFullDateFromDate,
  formatWeekdayAndDay,
  formatTime,
  getMonthGridDays,
  isSameDayAs,
  isSameMonthAs,
  isToday,
} from "@/lib/date-utils";
import type { Publication } from "@/types";

const WEEKDAY_LABELS = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];
const MAX_VISIBLE_PER_DAY = 3;

interface MonthChipProps {
  publication: Publication;
  onOpen: () => void;
  onEdit?: (publication: Publication) => void;
  onDuplicate?: (publication: Publication) => void;
  clientId?: string;
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
  showCalendarLabel,
  dragRef,
  dragProps,
  dragState,
}: MonthChipProps) {
  const { getCalendar, getClientAccount, getPlatform, getStatus } = useLookups();
  const canManage = Boolean(onEdit && onDuplicate && clientId);
  const status = getStatus(publication.statusId);
  const calendar = showCalendarLabel ? getCalendar(publication.calendarId) : undefined;
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
      className={cn(
        "group/chip relative flex w-full items-start gap-2 rounded-md px-1 py-1 transition-colors hover:bg-muted",
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
      {canManage && (
        <div className="absolute right-0.5 top-0.5 z-10 opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/chip:opacity-100 [@media(hover:hover)]:group-focus-within/chip:opacity-100">
          <PublicationQuickActions
            publication={publication}
            clientId={clientId!}
            onEdit={() => onEdit!(publication)}
            onDuplicate={() => onDuplicate!(publication)}
            className="size-5 bg-background/90 shadow-xs"
          />
        </div>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 leading-tight">
        {status && <StatusPill status={status} size="xs" />}
        <span className="line-clamp-2 text-[11px] font-medium text-foreground">{publication.title}</span>
        {(publication.publicationTime || calendar) && (
          <span className="flex min-w-0 items-center gap-1 text-[9.5px] text-muted-foreground">
            {publication.publicationTime && (
              <span className="shrink-0 tabular-nums">{formatTime(publication.publicationTime)}</span>
            )}
            {calendar && <span className="truncate">{calendar.name}</span>}
          </span>
        )}
        {uniquePlatformIds.length > 0 && (
          <span className="flex items-center gap-0.5">
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
  clientId?: string;
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
  clientId,
  onCreateForDay,
  clientColor,
  showCalendarLabel,
  canMove,
  saving,
  dragSourceKey,
}: MonthDayCellProps) {
  const today = isToday(day);
  const weekend = isWeekend(day);
  const visible = publications.slice(0, MAX_VISIBLE_PER_DAY);
  const overflowCount = publications.length - visible.length;
  const bgClass = today ? "bg-primary/[0.03]" : !weekend && !inCurrentMonth ? "bg-muted/30" : "";

  return (
    <DayDropZone
      dateKey={toDateKey(day)}
      dragSourceKey={dragSourceKey}
      disabled={!canMove}
      className={cn("group/day flex min-h-[232px] flex-col gap-0.5 border-r border-b border-border p-1.5", bgClass)}
      style={!today && weekend ? { backgroundColor: hexToRgba(clientColor, 0.05) } : undefined}
    >
      <div className="flex items-center justify-between">
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

      <div className="flex flex-col gap-0.5">
        {visible.map((publication) => (
          <DraggableMonthChip
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

      {overflowCount > 0 && (
        <Popover>
          <PopoverTrigger
            render={
              <button
                type="button"
                className="mt-0.5 self-start rounded-md px-1 py-0.5 text-left text-[10.5px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              />
            }
          >
            +{overflowCount} más
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72">
            <div className="mb-1 px-1 text-xs font-medium text-muted-foreground">{formatFullDateFromDate(day)}</div>
            <div className="flex flex-col gap-0.5">
              {publications.map((publication) => (
                <MonthChip
                  key={publication.id}
                  publication={publication}
                  onOpen={() => onOpenPublication(publication)}
                  onEdit={onEditPublication}
                  onDuplicate={onDuplicatePublication}
                  clientId={clientId}
                  showCalendarLabel={showCalendarLabel}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </DayDropZone>
  );
}

interface MonthViewProps {
  anchorDate: Date;
  publications: Publication[];
  onOpenPublication: (publication: Publication) => void;
  onEditPublication?: (publication: Publication) => void;
  onDuplicatePublication?: (publication: Publication) => void;
  clientId?: string;
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
  clientId,
  onCreateForDay,
  clientColor,
  showCalendarLabel,
}: MonthViewProps) {
  const gridDays = getMonthGridDays(anchorDate);
  const weekCount = gridDays.length / 7;
  // Mismo criterio que Semana: solo quien puede editar recibe los callbacks; el permiso real lo aplica RLS.
  // Arrastrar solo mueve entre los días visibles de la grilla; para otro mes se usa "Cambiar fecha".
  const canMove = Boolean(onEditPublication && onDuplicatePublication && clientId);

  const { displayedPublications, activePublication, saving, contextProps } = usePublicationDnd(publications, (targetKey) => {
    const targetDay = gridDays.find((d) => toDateKey(d) === targetKey);
    return targetDay ? `Publicación movida al ${formatWeekdayAndDay(targetDay)}` : "Publicación movida";
  });

  return (
    <DndContext id="month-view-dnd" {...contextProps}>
      <div className="flex flex-1 flex-col">
        <div className="grid grid-cols-7 border-b border-border">
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              className="py-2 text-center text-[11px] font-medium tracking-wide text-muted-foreground"
            >
              {label}
            </div>
          ))}
        </div>
        <div
          className="grid flex-1 grid-cols-7 border-t border-l border-border"
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
                clientId={clientId}
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
            <MonthChip publication={activePublication} onOpen={() => {}} showCalendarLabel={showCalendarLabel} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
