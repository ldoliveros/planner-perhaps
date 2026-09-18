"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight, FolderOpen, Info, Plus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getContrastTextColor } from "@/lib/color-contrast";
import { cn } from "cn";
import type { Client } from "@/types";

export type CalendarView = "week" | "month" | "list";

interface CalendarHeaderProps {
  client: Client;
  calendarLabel: string;
  /** Descripcion del calendario actual — solo cuando hay exactamente uno seleccionado. */
  calendarDescription?: string | null;
  driveFolderUrl: string | null;
  periodLabel: string;
  view: CalendarView;
  onViewChange: (view: CalendarView) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onCreate?: () => void;
  allClients?: { id: string; name: string }[];
  onSwitchClient?: (clientId: string) => void;
}

export function CalendarHeader({
  client,
  calendarLabel,
  calendarDescription,
  driveFolderUrl,
  periodLabel,
  view,
  onViewChange,
  onPrev,
  onNext,
  onToday,
  onCreate,
  allClients,
  onSwitchClient,
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
            {allClients && allClients.length > 1 && onSwitchClient ? (
              <Select
                value={client.id}
                onValueChange={(value) => onSwitchClient(value as string)}
                items={Object.fromEntries(allClients.map((c) => [c.id, c.name]))}
              >
                <SelectTrigger className="h-auto gap-1 border-none bg-transparent p-0 text-xs font-medium shadow-none" style={{ color: client.color }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allClients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="text-xs font-medium" style={{ color: client.color }}>
                {client.name}
              </div>
            )}
            <h1 className="flex items-center gap-1 text-base font-semibold text-foreground">
              {calendarLabel}
              {calendarDescription && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        aria-label={`Descripción del calendario: ${calendarDescription}`}
                        className="flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                      />
                    }
                  >
                    <Info className="size-3.5" />
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-64 whitespace-pre-wrap">
                    {calendarDescription}
                  </TooltipContent>
                </Tooltip>
              )}
            </h1>
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
            <button
              type="button"
              onClick={() => onViewChange("list")}
              className={cn(
                "rounded-md px-2.5 py-1 font-medium transition-colors",
                view === "list" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Lista
            </button>
          </div>

          {driveFolderUrl && (
            <a
              href={driveFolderUrl}
              target="_blank"
              rel="noreferrer"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
            >
              <FolderOpen />
              Abrir en Drive
            </a>
          )}

          {onCreate && (
            <Button size="sm" className="gap-1.5" onClick={onCreate}>
              <Plus />
              Nuevo contenido
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
