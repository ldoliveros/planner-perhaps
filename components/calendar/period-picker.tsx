"use client";

import { useState } from "react";
import { addMonths, format, isSameDay, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MonthYearGrid } from "@/components/shared/month-year-picker";
import { formatMonthYear, getMonthGridDays, isToday } from "@/lib/date-utils";
import { cn } from "cn";
import type { CalendarView } from "@/components/calendar/calendar-header";

const WEEKDAY_INITIALS = ["L", "M", "X", "J", "V", "S", "D"];

interface PeriodPickerProps {
  view: CalendarView;
  anchorDate: Date;
  /** Texto del período visible (p. ej. "6 – 12 de octubre"): es el disparador del desplegable. */
  label: string;
  onSelect: (date: Date) => void;
}

/**
 * Selector de fecha del encabezado del calendario (v1.6, estilo Google Calendar):
 * - Día: elegir una fecha. Semana: elegir una semana completa (lunes a domingo).
 * - Mes y Lista: elegir mes y año (selector compartido con el Escritorio).
 * Las flechas y "Hoy" siguen al lado; esto solo agrega el salto directo.
 */
export function PeriodPicker({ view, anchorDate, label, onSelect }: PeriodPickerProps) {
  const [open, setOpen] = useState(false);

  function choose(date: Date) {
    setOpen(false);
    onSelect(date);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="flex h-[26px] min-w-[8.5rem] items-center gap-1 rounded-md px-2 text-left text-[13px] font-medium text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none max-md:min-w-0 max-md:flex-1 pointer-coarse:h-11"
            aria-label={`${label}. Elegir ${view === "day" ? "fecha" : view === "week" ? "semana" : "mes"}`}
          />
        }
      >
        <span className="min-w-0 truncate">{label}</span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(18rem,calc(100vw-2rem))] p-3">
        {view === "day" || view === "week" ? (
          <MiniCalendar mode={view} anchorDate={anchorDate} onSelect={choose} />
        ) : (
          <MonthYearGrid
            value={format(anchorDate, "yyyy-MM")}
            current={format(new Date(), "yyyy-MM")}
            onSelect={(month) => choose(new Date(`${month}-01T00:00:00`))}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Calendario mensual compacto: en "day" se elige un día; en "week", la fila entera (semana lunes–domingo). */
function MiniCalendar({ mode, anchorDate, onSelect }: { mode: "day" | "week"; anchorDate: Date; onSelect: (date: Date) => void }) {
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(anchorDate));
  const days = getMonthGridDays(visibleMonth);
  const weeks = Array.from({ length: days.length / 7 }, (_, i) => days.slice(i * 7, i * 7 + 7));
  const selectedWeekStart = startOfWeek(anchorDate, { weekStartsOn: 1 });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon-sm" aria-label="Mes anterior" onClick={() => setVisibleMonth((m) => addMonths(m, -1))}>
          <ChevronLeft />
        </Button>
        <span className="text-sm font-semibold text-foreground">{formatMonthYear(visibleMonth)}</span>
        <Button variant="ghost" size="icon-sm" aria-label="Mes siguiente" onClick={() => setVisibleMonth((m) => addMonths(m, 1))}>
          <ChevronRight />
        </Button>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] font-medium text-muted-foreground" aria-hidden>
        {WEEKDAY_INITIALS.map((d, i) => (
          <span key={i} className="py-1">
            {d}
          </span>
        ))}
      </div>
      <div className="flex flex-col gap-0.5">
        {weeks.map((week) => {
          const weekSelected = mode === "week" && isSameDay(week[0], selectedWeekStart);
          return (
            <div
              key={week[0].toISOString()}
              className={cn(
                "grid grid-cols-7 rounded-md",
                mode === "week" && "hover:bg-muted",
                weekSelected && "bg-primary/10 hover:bg-primary/15"
              )}
            >
              {week.map((day) => {
                const inMonth = isSameMonth(day, visibleMonth);
                const daySelected = mode === "day" && isSameDay(day, anchorDate);
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => onSelect(mode === "week" ? week[0] : day)}
                    aria-pressed={mode === "day" ? daySelected : weekSelected}
                    aria-label={format(day, "yyyy-MM-dd")}
                    className={cn(
                      "flex h-8 items-center justify-center rounded-md text-sm tabular-nums transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                      inMonth ? "text-foreground" : "text-muted-foreground/50",
                      mode === "day" && !daySelected && "hover:bg-muted",
                      daySelected && "bg-primary font-semibold text-primary-foreground",
                      weekSelected && "font-medium",
                      isToday(day) && !daySelected && "font-semibold text-primary"
                    )}
                  >
                    {format(day, "d")}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
