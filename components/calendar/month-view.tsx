"use client";

import Image from "next/image";
import { Plus } from "lucide-react";
import { isWeekend } from "date-fns";
import { cn } from "cn";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PlatformIcon } from "@/components/icons/brand-icons";
import { useLookups } from "@/components/providers/lookups-provider";
import { hexToRgba } from "@/lib/color-contrast";
import {
  formatDayNumber,
  formatFullDateFromDate,
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
}

function MonthChip({ publication, onOpen }: MonthChipProps) {
  const { getPlatform, getStatus } = useLookups();
  const status = getStatus(publication.statusId);
  const primaryAsset = publication.assets.find((a) => a.isPrimary) ?? publication.assets[0];
  const uniquePlatformIds = Array.from(new Set(publication.destinations.map((d) => d.platformId)));

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-muted"
    >
      <span className="relative size-4 shrink-0 overflow-hidden rounded-sm bg-muted">
        {primaryAsset?.thumbnailUrl && (
          <Image src={primaryAsset.thumbnailUrl} alt="" fill sizes="16px" className="object-cover" />
        )}
      </span>
      {publication.publicationTime && (
        <span className="shrink-0 text-[9.5px] tabular-nums text-muted-foreground">
          {publication.publicationTime}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">{publication.title}</span>
      <span className="flex shrink-0 items-center gap-0.5">
        {uniquePlatformIds.slice(0, 2).map((platformId) => {
          const platform = getPlatform(platformId);
          if (!platform) return null;
          return (
            <PlatformIcon
              key={platformId}
              platformKey={platform.key}
              className="size-2.5"
              style={{ color: platform.color }}
            />
          );
        })}
        {status && (
          <Tooltip>
            <TooltipTrigger
              render={<span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: status.color }} />}
            />
            <TooltipContent>{status.label}</TooltipContent>
          </Tooltip>
        )}
      </span>
    </button>
  );
}

interface MonthDayCellProps {
  day: Date;
  publications: Publication[];
  inCurrentMonth: boolean;
  onOpenPublication: (publication: Publication) => void;
  onCreateForDay: (day: Date) => void;
  clientColor: string;
}

function MonthDayCell({
  day,
  publications,
  inCurrentMonth,
  onOpenPublication,
  onCreateForDay,
  clientColor,
}: MonthDayCellProps) {
  const today = isToday(day);
  const weekend = isWeekend(day);
  const visible = publications.slice(0, MAX_VISIBLE_PER_DAY);
  const overflowCount = publications.length - visible.length;
  const bgClass = today ? "bg-primary/[0.03]" : !weekend && !inCurrentMonth ? "bg-muted/30" : "";

  return (
    <div
      className={cn(
        "group/day flex min-h-[112px] flex-col gap-0.5 border-r border-b border-border p-1.5",
        bgClass
      )}
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
        <button
          type="button"
          onClick={() => onCreateForDay(day)}
          className="flex size-5 items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:bg-muted hover:text-foreground group-hover/day:opacity-100"
          aria-label="Nuevo contenido este día"
          title="Nuevo contenido este día"
        >
          <Plus className="size-3.5" />
        </button>
      </div>

      <div className="flex flex-col gap-0.5">
        {visible.map((publication) => (
          <MonthChip key={publication.id} publication={publication} onOpen={() => onOpenPublication(publication)} />
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
          <PopoverContent align="start" className="w-64">
            <div className="mb-1 px-1 text-xs font-medium text-muted-foreground">{formatFullDateFromDate(day)}</div>
            <div className="flex flex-col gap-0.5">
              {publications.map((publication) => (
                <MonthChip
                  key={publication.id}
                  publication={publication}
                  onOpen={() => onOpenPublication(publication)}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

interface MonthViewProps {
  anchorDate: Date;
  publications: Publication[];
  onOpenPublication: (publication: Publication) => void;
  onCreateForDay: (day: Date) => void;
  clientColor: string;
}

export function MonthView({
  anchorDate,
  publications,
  onOpenPublication,
  onCreateForDay,
  clientColor,
}: MonthViewProps) {
  const gridDays = getMonthGridDays(anchorDate);
  const weekCount = gridDays.length / 7;

  return (
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
          const dayPublications = publications
            .filter((p) => isSameDayAs(p.publicationDate, day))
            .sort((a, b) => (a.publicationTime ?? "").localeCompare(b.publicationTime ?? ""));

          return (
            <MonthDayCell
              key={day.toISOString()}
              day={day}
              publications={dayPublications}
              inCurrentMonth={isSameMonthAs(day, anchorDate)}
              onOpenPublication={onOpenPublication}
              onCreateForDay={onCreateForDay}
              clientColor={clientColor}
            />
          );
        })}
      </div>
    </div>
  );
}
