"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Download, FolderOpen, Info, MoreHorizontal, Plus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getContrastTextColor, getReadableTextColor } from "@/lib/color-contrast";
import { cn } from "cn";
import type { Client } from "@/types";

export type CalendarView = "week" | "month" | "list";

const VIEW_OPTIONS: { value: CalendarView; label: string }[] = [
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
  { value: "list", label: "Lista" },
];

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
  /** Exportar CSV del contexto actual. Solo se pasa a quien puede editar (no Client User). */
  onExport?: () => void;
  allClients?: { id: string; name: string }[];
  onSwitchClient?: (clientId: string) => void;
  /** Solo < md: botón "Filtros" que va en la misma fila que el selector Semana/Mes/Lista. */
  mobileFilters?: ReactNode;
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
  onExport,
  allClients,
  onSwitchClient,
  mobileFilters,
}: CalendarHeaderProps) {
  const initialTextColor = getContrastTextColor(client.color);
  // Vista activa: fondo = color del cliente, texto con el mejor contraste (solo la opción activa).
  const activeViewStyle = { backgroundColor: client.color, color: getReadableTextColor(client.color) };

  return (
    <div className="border-b border-border bg-background">
      {/* Acento de color del cliente: identidad, sin teñir el resto de la UI */}
      <div className="h-[3px] w-full" style={{ backgroundColor: client.color }} />

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 max-md:gap-y-2 md:px-6 md:py-4">
        <div className="flex items-center gap-3 max-md:min-w-0 max-md:flex-1">
          <div
            className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl text-base font-semibold md:h-11 md:w-11"
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
          <div className="leading-tight max-md:min-w-0">
            {allClients && allClients.length > 1 && onSwitchClient ? (
              <Select
                value={client.id}
                onValueChange={(value) => onSwitchClient(value as string)}
                items={Object.fromEntries(allClients.map((c) => [c.id, c.name]))}
              >
                <SelectTrigger className="h-auto gap-1 border-none bg-transparent p-0 text-xs font-medium shadow-none data-[size=default]:pointer-coarse:h-8" style={{ color: client.color }}>
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
              <div className="text-xs font-medium max-md:truncate" style={{ color: client.color }}>
                {client.name}
              </div>
            )}
            <h1 className="flex items-center gap-1 text-base font-semibold text-foreground max-md:min-w-0">
              <span className="max-md:truncate">{calendarLabel}</span>
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

        {/* Solo < md: acciones principales junto al título, para no gastar una fila entera. */}
        {(onCreate || onExport || driveFolderUrl) && (
          <div className="flex items-center gap-1.5 md:hidden">
            {onCreate && (
              <Button size="icon" onClick={onCreate} aria-label="Nuevo contenido">
                <Plus />
              </Button>
            )}
            {(onExport || driveFolderUrl) && (
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="Más acciones" />}>
                  <MoreHorizontal />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {driveFolderUrl && (
                    <DropdownMenuItem render={<a href={driveFolderUrl} target="_blank" rel="noreferrer" />}>
                      <FolderOpen />
                      Abrir en Drive
                    </DropdownMenuItem>
                  )}
                  {onExport && (
                    <DropdownMenuItem onClick={onExport}>
                      <Download />
                      Exportar CSV
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 max-md:w-full">
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

          <span className="min-w-[9rem] text-sm text-muted-foreground max-md:min-w-0 max-md:flex-1 max-md:truncate">{periodLabel}</span>

          {/* En < md: selector de vista + botón "Filtros" comparten fila (no hay barra de filtros aparte). */}
          <div className="flex items-center gap-2 max-md:order-last max-md:w-full">
            <div className="flex items-center rounded-lg border border-border p-0.5 text-sm max-md:flex-1">
              {VIEW_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onViewChange(option.value)}
                  aria-pressed={view === option.value}
                  style={view === option.value ? activeViewStyle : undefined}
                  className={cn(
                    "rounded-md px-2.5 py-1 font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50 max-md:flex-1 max-md:py-2 pointer-coarse:py-2.5",
                    view === option.value ? "shadow-xs hover:brightness-95" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {mobileFilters && <div className="md:hidden">{mobileFilters}</div>}
          </div>

          {driveFolderUrl && (
            <a
              href={driveFolderUrl}
              target="_blank"
              rel="noreferrer"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5 max-md:hidden")}
            >
              <FolderOpen />
              Abrir en Drive
            </a>
          )}

          {onExport && (
            <Button variant="outline" size="sm" className="gap-1.5 max-md:hidden" onClick={onExport}>
              <Download />
              Exportar CSV
            </Button>
          )}

          {onCreate && (
            <Button size="sm" className="gap-1.5 max-md:hidden" onClick={onCreate}>
              <Plus />
              Nuevo contenido
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
