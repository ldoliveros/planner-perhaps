"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight, FolderOpen, Plus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { getContrastTextColor } from "@/lib/color-contrast";
import { cn } from "cn";
import type { Calendar, Client } from "@/types";

export type CalendarView = "week" | "month";

interface CalendarHeaderProps {
  client: Client;
  calendar: Calendar;
  periodLabel: string;
  view: CalendarView;
  onViewChange: (view: CalendarView) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onCreate: () => void;
}

export function CalendarHeader({
  client,
  calendar,
  periodLabel,
  view,
  onViewChange,
  onPrev,
  onNext,
  onToday,
  onCreate,
}: CalendarHeaderProps) {
  const initialTextColor = getContrastTextColor(client.color);

  return (
    <div className="border-b border-border bg-background">
      {/* Acento de color del cliente: identidad, sin teñir el resto de la UI */}
      <div className="h-[3px] w-full" style={{ backgroundColor: client.color }} />

      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div className="flex items-center gap-3">
          <div
            className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl text-base font-semibold"
            style={
              client.logoUrl
                ? undefined
                : { backgroundColor: client.color, color: initialTextColor }
            }
          >
            {client.logoUrl ? (
              <Image src={client.logoUrl} alt={client.name} fill sizes="44px" className="object-cover" />
            ) : (
              client.name.charAt(0)
            )}
          </div>
          <div className="leading-tight">
            <div className="text-xs font-medium" style={{ color: client.color }}>
              {client.name}
            </div>
            <h1 className="text-base font-semibold text-foreground">{calendar.name}</h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
            <Button variant="ghost" size="icon-sm" onClick={onPrev} aria-label="Período anterior">
              <ChevronLeft />
            </Button>
            <Button variant="ghost" size="sm" onClick={onToday}>
              Hoy
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={onNext} aria-label="Período siguiente">
              <ChevronRight />
            </Button>
          </div>

          <span className="min-w-[9rem] text-sm text-muted-foreground">{periodLabel}</span>

          <div className="flex items-center rounded-lg border border-border p-0.5 text-sm">
            <button
              type="button"
              onClick={() => onViewChange("week")}
              className={cn(
                "rounded-md px-2.5 py-1 font-medium transition-colors",
                view === "week" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Semana
            </button>
            <button
              type="button"
              onClick={() => onViewChange("month")}
              className={cn(
                "rounded-md px-2.5 py-1 font-medium transition-colors",
                view === "month" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Mes
            </button>
          </div>

          {calendar.driveFolderUrl && (
            <a
              href={calendar.driveFolderUrl}
              target="_blank"
              rel="noreferrer"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
            >
              <FolderOpen />
              Abrir en Drive
            </a>
          )}

          <Button size="sm" className="gap-1.5" onClick={onCreate}>
            <Plus />
            Nuevo contenido
          </Button>
        </div>
      </div>
    </div>
  );
}
