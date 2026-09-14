"use client";

import { Plus } from "lucide-react";
import { isWeekend } from "date-fns";
import { cn } from "cn";
import { formatDayAbbr, formatDayNumber, isSameDayAs, isToday } from "@/lib/date-utils";
import { hexToRgba } from "@/lib/color-contrast";
import { PublicationCard } from "@/components/calendar/publication-card";
import type { Publication } from "@/types";

interface WeekViewProps {
  weekDays: Date[];
  publications: Publication[];
  onOpenPublication: (publication: Publication) => void;
  onCreateForDay: (day: Date) => void;
  clientColor: string;
  showCalendarLabel: boolean;
}

export function WeekView({
  weekDays,
  publications,
  onOpenPublication,
  onCreateForDay,
  clientColor,
  showCalendarLabel,
}: WeekViewProps) {
  return (
    <div className="grid flex-1 grid-cols-7 divide-x divide-border">
      {weekDays.map((day) => {
        const dayPublications = publications
          .filter((p) => isSameDayAs(p.publicationDate, day))
          .sort((a, b) => (a.publicationTime ?? "").localeCompare(b.publicationTime ?? ""));
        const today = isToday(day);
        const weekend = isWeekend(day);

        return (
          <div
            key={day.toISOString()}
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
              <button
                type="button"
                onClick={() => onCreateForDay(day)}
                className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:bg-muted hover:text-foreground group-hover/day:opacity-100"
                aria-label="Nuevo contenido este día"
                title="Nuevo contenido este día"
              >
                <Plus className="size-4" />
              </button>
            </div>
            <div className="flex flex-1 flex-col gap-2 p-2">
              {dayPublications.map((publication) => (
                <PublicationCard
                  key={publication.id}
                  publication={publication}
                  onOpen={() => onOpenPublication(publication)}
                  showCalendarLabel={showCalendarLabel}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
