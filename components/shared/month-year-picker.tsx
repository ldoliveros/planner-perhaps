"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMonthLabel } from "@/lib/dashboard";
import { cn } from "cn";

const MONTH_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/**
 * Selector de mes y año (v1.6): los 12 meses del año en una grilla, navegación entre años y "Este mes". El mes
 * elegido va relleno y el actual, contorneado. Lo usan el Escritorio (filtro Mes) y la navegación del calendario
 * (Mes y Lista). Valores "YYYY-MM".
 */
export function MonthYearGrid({
  value,
  current,
  onSelect,
}: {
  value: string;
  current: string;
  onSelect: (month: string) => void;
}) {
  const [viewYear, setViewYear] = useState(() => Number(value.slice(0, 4)));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon-sm" aria-label="Año anterior" onClick={() => setViewYear((y) => y - 1)}>
          <ChevronLeft />
        </Button>
        <span className="text-sm font-semibold text-foreground tabular-nums">{viewYear}</span>
        <Button variant="ghost" size="icon-sm" aria-label="Año siguiente" onClick={() => setViewYear((y) => y + 1)}>
          <ChevronRight />
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {MONTH_SHORT.map((label, index) => {
          const month = `${viewYear}-${String(index + 1).padStart(2, "0")}`;
          const selected = month === value;
          const isCurrent = month === current;
          return (
            <button
              key={month}
              type="button"
              onClick={() => onSelect(month)}
              aria-pressed={selected}
              aria-label={formatMonthLabel(month)}
              className={cn(
                "rounded-md py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                selected ? "bg-primary font-semibold text-primary-foreground" : "text-foreground hover:bg-muted",
                !selected && isCurrent && "font-semibold text-primary ring-1 ring-primary/40"
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
      <Button variant="ghost" size="sm" className="w-full" disabled={value === current} onClick={() => onSelect(current)}>
        Este mes
      </Button>
    </div>
  );
}
