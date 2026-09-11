"use client";

import { cn } from "cn";
import { formatDayAbbr, formatDayNumber, isSameDayAs, isToday } from "@/lib/date-utils";
import { PublicationCard } from "@/components/calendar/publication-card";
import type { Publication } from "@/types";

interface WeekViewProps {
  weekDays: Date[];
  publications: Publication[];
  onOpenPublication: (publication: Publication) => void;
}

export function WeekView({ weekDays, publications, onOpenPublication }: WeekViewProps) {
  return (
    <div className="grid flex-1 grid-cols-7 divide-x divide-border">
      {weekDays.map((day) => {
        const dayPublications = publications
          .filter((p) => isSameDayAs(p.publicationDate, day))
          .sort((a, b) => (a.publicationTime ?? "").localeCompare(b.publicationTime ?? ""));
        const today = isToday(day);

        return (
          <div key={day.toISOString()} className={cn("flex min-h-0 flex-col", today && "bg-primary/[0.03]")}>
            <div className="flex flex-col items-center gap-1 border-b border-border py-2.5">
              <span className="text-[11px] font-medium tracking-wide text-muted-foreground">{formatDayAbbr(day)}</span>
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full text-sm font-semibold",
                  today ? "bg-primary text-primary-foreground" : "text-foreground"
                )}
              >
                {formatDayNumber(day)}
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-2 p-2">
              {dayPublications.map((publication) => (
                <PublicationCard
                  key={publication.id}
                  publication={publication}
                  onOpen={() => onOpenPublication(publication)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
