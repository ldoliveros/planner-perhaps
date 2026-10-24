"use client";

import { useState, type ReactNode } from "react";
import {
  Archive,
  Calendar1,
  CalendarDays,
  CalendarRange,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  FolderOpen,
  Info,
  Layers,
  List,
  MoreHorizontal,
  Plus,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AvatarStack } from "@/components/shared/avatar-stack";
import { ClientLogo } from "@/components/shared/client-badge";
import { cn } from "cn";
import { PeriodPicker } from "@/components/calendar/period-picker";
import { ADMIN_ACTIONS_RESERVE_FULL_BLEED_SHARED } from "@/lib/admin-shell";
import { CAL_ACCENT_LINE, CAL_ACCENT_SOFT, CAL_HEADER_BG } from "@/lib/calendar-surface";
import type { Client, ClientMember } from "@/types";

export type CalendarView = "day" | "week" | "month" | "list" | "board";
/** Vistas del modo Calendario (Día / Semana / Mes). Lista y Tablero son modos propios. */
export type CalendarGridView = Exclude<CalendarView, "list" | "board">;

export interface HeaderDateRangeValue {
  from: string;
  to: string;
}

/** Vistas del modo Calendario (Lista es su propio modo, en el selector Calendario / Tablero / Lista). */
const CALENDAR_VIEW_OPTIONS: { value: CalendarGridView; label: string; icon: LucideIcon }[] = [
  { value: "day", label: "Día", icon: Calendar1 },
  { value: "week", label: "Semana", icon: CalendarRange },
  { value: "month", label: "Mes", icon: CalendarDays },
];

/**
 * Selector de vista del modo Calendario (Día / Semana / Mes): un desplegable con la vista activa. Apertura
 * controlada: se cierra al elegir (mouse o teclado) y al cambiar de período. Mismo `onViewChange` (?view=).
 */
function ViewSelect({
  view,
  onViewChange,
  closeKey,
}: {
  view: CalendarView;
  onViewChange: (view: CalendarView) => void;
  /** Cambia con el período visible: si el menú quedó abierto, se cierra (ajuste de estado, sin remontar). */
  closeKey: string;
}) {
  const active = CALENDAR_VIEW_OPTIONS.find((o) => o.value === view) ?? CALENDAR_VIEW_OPTIONS[1];
  const ActiveIcon = active.icon;
  const [open, setOpen] = useState(false);
  const [lastCloseKey, setLastCloseKey] = useState(closeKey);
  if (closeKey !== lastCloseKey) {
    setLastCloseKey(closeKey);
    setOpen(false);
  }
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm" className="h-[26px] min-w-[5.25rem] justify-between gap-1 px-2 text-[13px]" aria-label={`Vista: ${active.label}. Cambiar vista`} />
        }
      >
        <span className="flex items-center gap-1.5">
          <ActiveIcon className="size-3.5 text-muted-foreground" />
          {active.label}
        </span>
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-40">
        <DropdownMenuRadioGroup
          value={view}
          onValueChange={(value) => {
            setOpen(false);
            onViewChange(value as CalendarView);
          }}
        >
          {CALENDAR_VIEW_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <DropdownMenuRadioItem key={option.value} value={option.value}>
                <Icon className="size-4 text-muted-foreground" />
                {option.label}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Selector Calendario / Lista / Tablero (solo íconos, con tooltip). Calendario vuelve a la última vista de calendario usada (Día, Semana o
 * Mes); Tablero (v1.6) es la vista Kanban por estado editorial; Lista es la vista Lista de siempre. Tablero y Lista
 * trabajan sobre el mes elegido (mismo selector de período que Mes).
 */
function ModeSwitch({
  view,
  onViewChange,
  defaultCalendarView,
}: {
  view: CalendarView;
  onViewChange: (view: CalendarView) => void;
  defaultCalendarView: CalendarGridView;
}) {
  const isList = view === "list";
  const isBoard = view === "board";
  const isCalendar = !isList && !isBoard;
  const [lastCalendarView, setLastCalendarView] = useState<CalendarGridView>(
    view === "list" || view === "board" ? defaultCalendarView : view
  );
  if (view !== "list" && view !== "board" && view !== lastCalendarView) setLastCalendarView(view);

  const modes = [
    { label: "Calendario", icon: CalendarDays, active: isCalendar, select: () => onViewChange(lastCalendarView) },
    { label: "Lista", icon: List, active: isList, select: () => onViewChange("list") },
    { label: "Tablero", icon: Columns3, active: isBoard, select: () => onViewChange("board") },
  ];
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-border bg-white p-0.5" role="group" aria-label="Modo de visualización">
      {modes.map(({ label, icon: Icon, active, select }) => (
        <Tooltip key={label}>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={label}
                aria-pressed={active}
                onClick={() => !active && select()}
                className={cn(
                  "flex size-9 items-center justify-center rounded-md transition-colors",
                  // Vista activa: color principal del contexto (cliente, o el predeterminado en vistas globales).
                  active ? CAL_ACCENT_SOFT : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              />
            }
          >
            <Icon className="size-4" />
          </TooltipTrigger>
          <TooltipContent side="bottom">{label}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

/**
 * Navegación temporal del encabezado (‹ › · período · Hoy · Día/Semana/Mes). Exportada para el Escritorio, que usa
 * exactamente los mismos controles; en Lista no muestra Día/Semana/Mes.
 */
export function PeriodNav({
  view,
  anchorDate,
  periodLabel,
  onDateSelect,
  onViewChange,
  onPrev,
  onNext,
  onToday,
}: {
  view: CalendarView;
  anchorDate: Date;
  periodLabel: string;
  onDateSelect: (date: Date) => void;
  onViewChange: (view: CalendarView) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-0.5">
      <Button variant="ghost" size="icon-sm" className="size-[26px]" onClick={onPrev} aria-label="Período anterior">
        <ChevronLeft />
      </Button>
      <Button variant="ghost" size="icon-sm" className="size-[26px]" onClick={onNext} aria-label="Período siguiente">
        <ChevronRight />
      </Button>
      {/* key: cambiar de vista cierra el selector si quedó abierto. */}
      <PeriodPicker key={view} view={view} anchorDate={anchorDate} label={periodLabel} onSelect={onDateSelect} />
      <Button variant="outline" size="sm" className="h-[26px] px-2 text-[13px]" onClick={onToday}>
        Hoy
      </Button>
      {view !== "list" && view !== "board" && (
        <ViewSelect view={view} onViewChange={onViewChange} closeKey={anchorDate.toDateString()} />
      )}
    </div>
  );
}

/** Un espacio (cliente) del selector del encabezado. */
export type SpaceOption = Pick<Client, "id" | "name" | "logoUrl" | "color">;

const SPACE_TRIGGER =
  "flex min-w-0 items-center gap-2 rounded-full bg-muted/60 py-0.5 pr-3 pl-0.5 text-left transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none";
const SPACE_TEXT = "min-w-0 truncate text-lg leading-7 font-semibold text-foreground";

/** Marca de "Todos los espacios": `large` en el selector del encabezado (32 px, como el logo de un cliente). */
function AllSpacesMark({ large = false }: { large?: boolean }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full text-foreground",
        large ? "size-8 bg-white shadow-xs" : "size-6 bg-muted"
      )}
    >
      <Layers className={large ? "size-4" : "size-3.5"} />
    </span>
  );
}

/**
 * Selector de espacio del encabezado (v1.6). La RUTA es la única fuente de verdad del contexto: "Todos los espacios"
 * es el calendario global (/admin/publications) y cada cliente es su Planner. Elegir una opción navega (no escribe
 * ningún filtro), así "Ver todos" nunca arrastra un filtro Espacio oculto. Mismo componente en los dos contextos.
 * Sin `onSelectSpace` (portal Client User) solo muestra el logo/inicial y el nombre.
 */
export function SpaceSelector({
  client,
  isGlobal,
  spaces,
  onSelectSpace,
}: {
  client: SpaceOption;
  isGlobal: boolean;
  spaces?: SpaceOption[];
  onSelectSpace?: (clientId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);

  if (spaces && onSelectSpace) {
    const label = isGlobal ? "Todos los espacios" : client.name;
    const options: { id: string | null; space?: SpaceOption }[] = [
      { id: null },
      ...spaces.map((space) => ({ id: space.id, space })),
    ];
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={<button type="button" className={SPACE_TRIGGER} aria-label={`Espacio: ${label}. Cambiar de espacio`} />}>
          {isGlobal ? <AllSpacesMark large /> : <ClientLogo client={client} className="size-8" sizes={32} />}
          <span className={SPACE_TEXT}>{label}</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(18rem,calc(100vw-2rem))] gap-0 p-1">
          <ul className="flex max-h-[min(20rem,60dvh)] flex-col overflow-y-auto" aria-label="Espacios">
            {options.map(({ id, space }) => {
              const active = id === null ? isGlobal : !isGlobal && id === client.id;
              return (
                <li key={id ?? "all"}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      if (!active) onSelectSpace(id);
                    }}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
                      active && "bg-muted/70 font-medium"
                    )}
                  >
                    {space ? <ClientLogo client={space} className="size-6" sizes={24} /> : <AllSpacesMark />}
                    <span className="min-w-0 flex-1 truncate">{space ? space.name : "Todos los espacios"}</span>
                    {active && <Check className="size-4 shrink-0 text-[var(--cal-accent-ink)]" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-2 py-0.5">
      <ClientLogo client={client} className="size-8" sizes={32} />
      <span className={SPACE_TEXT}>{client.name}</span>
    </div>
  );
}

interface CalendarHeaderProps {
  client: Client;
  /** Calendario global (`/admin/publications`): selector de espacios en lugar del cliente fijo. */
  isGlobal: boolean;
  /** Descripción del calendario actual — solo cuando hay exactamente uno seleccionado. */
  calendarDescription?: string | null;
  driveFolderUrl: string | null;
  /** Período visible ("lunes 12 de octubre", "6 – 12 de octubre", "Octubre 2026"): abre el selector de fecha. */
  periodLabel: string;
  /** Fecha de referencia del período visible (v1.6): el selector de fecha la usa como valor actual. */
  anchorDate: Date;
  /** Salto directo desde el selector de fecha (día, semana o mes según la vista). */
  onDateSelect: (date: Date) => void;
  view: CalendarView;
  onViewChange: (view: CalendarView) => void;
  /** Vista con la que "Calendario" abre si se viene de Lista sin haber usado antes Día / Semana / Mes. */
  defaultCalendarView: CalendarGridView;
  onPrev: () => void;
  onNext: () => void;
  /** En Lista con rango personalizado, además de llevar `anchorDate` a hoy, restablece `dateRange`. */
  onToday: () => void;
  onCreate?: () => void;
  /** Exportar CSV del contexto actual. Solo se pasa a quien puede editar (no Client User). */
  onExport?: () => void;
  /** v1.6: abre el panel "Publicaciones archivadas" (solo staff y con el archivado disponible en la base). */
  onOpenArchived?: () => void;
  archivedCount?: number;
  /** Espacios (clientes) a los que se puede cambiar desde el selector — solo staff; el portal Client User no lo pasa. */
  spaces?: SpaceOption[];
  /** Navega al espacio elegido: `null` = "Todos los espacios" (calendario global), si no el Planner del cliente. */
  onSelectSpace?: (clientId: string | null) => void;
  /** Solo Planner de cliente: integrantes con acceso a este cliente (avatares + tooltip). */
  members?: ClientMember[];
  /**
   * Solo Lista con rango personalizado (hoy desactivado, ver LIST_CUSTOM_RANGE_ENABLED en CalendarScreen):
   * Desde/Hasta reemplaza a ‹ › + selector + Hoy. Sin este prop, Lista navega por meses como Mes.
   */
  dateRange?: HeaderDateRangeValue;
  onDateRangeChange?: (value: HeaderDateRangeValue) => void;
  /** Extremo derecho de la segunda fila: filtros (ícono) y búsqueda (lupa). Los arma CalendarScreen. */
  toolbarEnd?: ReactNode;
}

/**
 * Encabezado del calendario (v1.6), compartido por el calendario global, el Planner de cada cliente y el portal
 * Client User. Fila 1: título "Planner" + selector de espacio · Calendario / Tablero / Lista, "+", (campanita y
 * avatar del layout). Fila 2: ‹ › período · Hoy · Día/Semana/Mes · filtros y búsqueda. La línea superior y los
 * acentos usan la paleta del contexto (celeste en el global, color del cliente en su Planner).
 */
export function CalendarHeader({
  client,
  isGlobal,
  calendarDescription,
  driveFolderUrl,
  periodLabel,
  anchorDate,
  onDateSelect,
  view,
  onViewChange,
  defaultCalendarView,
  onPrev,
  onNext,
  onToday,
  onCreate,
  onExport,
  onOpenArchived,
  archivedCount = 0,
  spaces,
  onSelectSpace,
  members,
  dateRange,
  onDateRangeChange,
  toolbarEnd,
}: CalendarHeaderProps) {
  return (
    <div className={CAL_HEADER_BG}>
      {/* Línea superior: color principal del contexto (cliente, o celeste en el calendario global). */}
      <div className={cn("h-[3px] w-full", CAL_ACCENT_LINE)} />

      {/* Fila 1. En /admin reserva a la derecha el lugar de la campanita + avatar del layout (lib/admin-shell.ts). */}
      <div
        className={cn(
          "flex flex-wrap items-start justify-between gap-x-2 gap-y-1 px-4 pt-2 md:px-6",
          ADMIN_ACTIONS_RESERVE_FULL_BLEED_SHARED
        )}
      >
        <div className="flex min-w-0 flex-col items-start gap-1 max-md:flex-1">
          <h1 className="flex items-center gap-1 text-[15px] leading-5 font-semibold text-foreground">
            Planner
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
          <div className="flex max-w-full min-w-0 -translate-x-0.5 items-center">
            <SpaceSelector
              client={client}
              isGlobal={isGlobal}
              spaces={spaces}
              onSelectSpace={onSelectSpace}
            />
          </div>
        </div>

        {/* Grupo derecho: comparte el eje vertical con la campanita y el avatar del layout de /admin
            (AdminHeaderActions en modo compacto, top 15 px). "+" y avatar: 32 px y circulares; el resto, 28 px. */}
        <div className="flex shrink-0 items-center gap-1.5 md:mt-1">
          {members && members.length > 0 && (
            <div className="hidden lg:flex">
              <AvatarStack members={members} clientColor={client.color} />
            </div>
          )}
          <div className="max-md:hidden">
            <ModeSwitch view={view} onViewChange={onViewChange} defaultCalendarView={defaultCalendarView} />
          </div>
          {/* Drive / Exportar CSV (solo Planner de cliente): en un menú compacto, como ya era en mobile. */}
          {(onExport || driveFolderUrl || onOpenArchived) && (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="icon-sm" aria-label="Más acciones" />}>
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
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
                {onOpenArchived && (
                  <DropdownMenuItem onClick={onOpenArchived}>
                    <Archive />
                    Publicaciones archivadas ({archivedCount})
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {onCreate && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    onClick={onCreate}
                    aria-label="Nuevo contenido"
                    className={cn(
                      "flex size-8 items-center justify-center rounded-full transition-[filter] hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none pointer-coarse:size-11",
                      CAL_ACCENT_SOFT
                    )}
                  />
                }
              >
                <Plus className="size-[18px]" />
              </TooltipTrigger>
              <TooltipContent side="bottom">Nuevo contenido</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Fila 2: navegación temporal a la izquierda; filtros y búsqueda a la derecha. */}
      <div className="flex flex-wrap items-center justify-between gap-1 px-4 pt-2 pb-1.5 md:px-6">
        {view === "list" && dateRange ? (
          // Lista con rango personalizado (desactivado): Desde/Hasta + Hoy, sin flechas ni selector de período.
          <div className="flex flex-wrap items-center gap-1.5">
            <Label className="text-xs text-muted-foreground">Desde</Label>
            <Input
              type="date"
              aria-label="Desde"
              value={dateRange?.from ?? ""}
              onChange={(e) => onDateRangeChange?.({ from: e.target.value, to: dateRange?.to ?? "" })}
              className="h-8 w-[8.5rem] pointer-coarse:h-9"
            />
            <span className="text-muted-foreground" aria-hidden>
              ·
            </span>
            <Label className="text-xs text-muted-foreground">Hasta</Label>
            <Input
              type="date"
              aria-label="Hasta"
              value={dateRange?.to ?? ""}
              onChange={(e) => onDateRangeChange?.({ from: dateRange?.from ?? "", to: e.target.value })}
              className="h-8 w-[8.5rem] pointer-coarse:h-9"
            />
            <span className="text-muted-foreground" aria-hidden>
              ·
            </span>
            <Button variant="ghost" size="sm" onClick={onToday}>
              Hoy
            </Button>
          </div>
        ) : (
          <PeriodNav
            view={view}
            anchorDate={anchorDate}
            periodLabel={periodLabel}
            onDateSelect={onDateSelect}
            onViewChange={onViewChange}
            onPrev={onPrev}
            onNext={onNext}
            onToday={onToday}
          />
        )}

        <div className="flex items-center gap-1">
          {/* Mobile: el selector Calendario / Tablero / Lista va en esta fila (en desktop está arriba). */}
          <div className="md:hidden">
            <ModeSwitch view={view} onViewChange={onViewChange} defaultCalendarView={defaultCalendarView} />
          </div>
          {toolbarEnd}
        </div>
      </div>
    </div>
  );
}
