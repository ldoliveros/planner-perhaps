"use client";

import { useState } from "react";
import { ChevronDown, ListFilter, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useLookups } from "@/components/providers/lookups-provider";
import type { FilterOption, RelevantFilterOptions } from "@/lib/planner-filter-options";
import { CAL_HEADER_BG, CAL_LINE_BORDER } from "@/lib/calendar-surface";
import { cn } from "cn";

/** Desde/Hasta de Lista vive en el header (CalendarHeader), no acá — ver `HeaderDateRangeValue`. Se mantiene
 * este tipo exportado porque `CalendarScreen` lo sigue usando para el estado de ese rango. */
export interface DateRangeValue {
  from: string;
  to: string;
}

export interface CalendarFiltersState {
  platformIds: string[];
  accountIds: string[];
  contentTypeIds: string[];
  statusIds: string[];
  campaigns: string[];
}

export const EMPTY_FILTERS: CalendarFiltersState = {
  platformIds: [],
  accountIds: [],
  contentTypeIds: [],
  statusIds: [],
  campaigns: [],
};

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((v) => v !== id) : [...list, id];
}

// Calendarios archivados no se ofrecen como filtro operativo — salvo que ya vinieran seleccionados (ej. deep
// link desde Admin > Publicaciones a una publicación histórica), para no "perder" ese filtro silenciosamente.
function getSelectableCalendars<T extends { id: string; status: string }>(calendars: T[], calendarIds: string[]): T[] {
  return calendars.filter((c) => c.status !== "archived" || calendarIds.includes(c.id));
}

// Publicaciones (global): con Cliente activo, "Calendario" ofrece solo los de esos clientes — misma dependencia
// que ya tenía el buscador anterior de Publicaciones. Sin Cliente elegido (o fuera del contexto global,
// `clientIds` en `undefined`), no restringe nada.
function scopeCalendarsToClients<T extends { clientId: string }>(calendars: T[], clientIds?: string[]): T[] {
  if (!clientIds || clientIds.length === 0) return calendars;
  return calendars.filter((c) => clientIds.includes(c.clientId));
}

interface CalendarFiltersProps {
  value: CalendarFiltersState;
  onChange: (value: CalendarFiltersState) => void;
  /** Opciones relevantes por filtro (derivadas del contexto: calendarios + período). */
  options: RelevantFilterOptions;
  calendarIds: string[];
  onCalendarIdsChange: (ids: string[]) => void;
  /** Solo calendario global: filtro Espacio (en el código, "clientes"), exclusivo de ese contexto. */
  clientIds?: string[];
  onClientIdsChange?: (ids: string[]) => void;
}

/**
 * Filtros unificados (v1.6, desktop/tablet): un solo botón de ícono que abre un desplegable con Calendario, Estado,
 * Canal, Cuenta, Tipo y Campaña — mismas opciones, multiselección y estado que antes. Espacio no está acá: lo maneja
 * el selector de espacios del encabezado (sus chips siguen en la fila de chips). Punto discreto cuando hay filtros
 * activos. Se remonta con la vista y el período (key en CalendarScreen) para cerrarse si quedó abierto.
 */
export function FiltersMenu({
  value,
  onChange,
  options,
  calendarIds,
  onCalendarIdsChange,
  clientIds,
}: CalendarFiltersProps) {
  const { calendars, clientAccounts } = useLookups();
  const selectableCalendars = getSelectableCalendars(scopeCalendarsToClients(calendars, clientIds), calendarIds);
  const count = countActiveFilters(value, calendarIds);

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="relative size-[26px]"
            aria-label={count > 0 ? `Filtros (${count} activos)` : "Filtros"}
          />
        }
      >
        <ListFilter />
        {count > 0 && <span aria-hidden className="absolute top-1 right-1 size-1.5 rounded-full bg-[var(--cal-accent)]" />}
      </PopoverTrigger>
      {/* Elegir varias opciones no cierra el desplegable: los checkboxes viven dentro del popover. */}
      <PopoverContent align="end" className="max-h-[min(30rem,70dvh)] w-[min(20rem,calc(100vw-2rem))] gap-1 overflow-y-auto p-1.5">
        {selectableCalendars.length > 1 && (
          <FilterSection
            variant="popover"
            label="Calendario"
            options={selectableCalendars.map((c) => ({ id: c.id, label: c.name }))}
            selected={calendarIds}
            onChange={onCalendarIdsChange}
          />
        )}
        <FilterSection
          variant="popover"
          label="Estado"
          options={options.statuses}
          selected={value.statusIds}
          onChange={(statusIds) => onChange({ ...value, statusIds })}
        />
        <FilterSection
          variant="popover"
          label="Canal"
          options={options.platforms}
          selected={value.platformIds}
          onChange={(platformIds) => onChange({ ...value, platformIds })}
        />
        {clientAccounts.length > 0 && (
          <FilterSection
            variant="popover"
            label="Cuenta"
            options={options.accounts}
            selected={value.accountIds}
            onChange={(accountIds) => onChange({ ...value, accountIds })}
          />
        )}
        <FilterSection
          variant="popover"
          label="Tipo"
          options={options.contentTypes}
          selected={value.contentTypeIds}
          onChange={(contentTypeIds) => onChange({ ...value, contentTypeIds })}
        />
        <FilterSection
          variant="popover"
          label="Campaña"
          options={options.campaigns}
          selected={value.campaigns}
          onChange={(campaigns) => onChange({ ...value, campaigns })}
        />
      </PopoverContent>
    </Popover>
  );
}

/**
 * Búsqueda (v1.6): solo la lupa, que abre el modal de búsqueda global por título (PublicationSearchDialog) sin cambiar
 * de ruta. Sin campo desplegable en el encabezado (no se superpone con otros controles) ni filtrado local.
 */
export function SearchButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="size-[26px]"
      aria-label="Buscar publicaciones"
      title="Buscar publicaciones"
      aria-haspopup="dialog"
      onClick={onClick}
    >
      <Search />
    </Button>
  );
}

interface ActiveFilterChipsProps {
  value: CalendarFiltersState;
  onChange: (value: CalendarFiltersState) => void;
  options: RelevantFilterOptions;
  calendarIds: string[];
  onCalendarIdsChange: (ids: string[]) => void;
  clientIds?: string[];
  onClientIdsChange?: (ids: string[]) => void;
}

/**
 * Chips de filtros activos (v1.6): un chip por valor elegido (principales y de "Más filtros"), con su categoría
 * para que se reconozca aunque el filtro esté oculto ("Canal: Instagram"). La X quita solo ese valor; "Limpiar
 * todo" deja todos los filtros sin restricción (no toca la vista, el período ni el buscador). Sin filtros
 * activos no se renderiza (no reserva espacio).
 */
export function ActiveFilterChips({
  value,
  onChange,
  options,
  calendarIds,
  onCalendarIdsChange,
  clientIds,
  onClientIdsChange,
}: ActiveFilterChipsProps) {
  const { calendars, clients } = useLookups();
  const nameOf = (list: { id: string; label: string }[], id: string) => list.find((o) => o.id === id)?.label ?? "Sin nombre";
  const chips: { key: string; category: string; label: string; remove: () => void }[] = [
    ...(clientIds ?? []).map((id) => ({
      key: `client:${id}`,
      category: "Espacio",
      label: clients.find((c) => c.id === id)?.name ?? "Sin nombre",
      remove: () => onClientIdsChange?.((clientIds ?? []).filter((v) => v !== id)),
    })),
    ...calendarIds.map((id) => ({
      key: `calendar:${id}`,
      category: "Calendario",
      label: calendars.find((c) => c.id === id)?.name ?? "Sin nombre",
      remove: () => onCalendarIdsChange(calendarIds.filter((v) => v !== id)),
    })),
    ...value.statusIds.map((id) => ({
      key: `status:${id}`,
      category: "Estado",
      label: nameOf(options.statuses, id),
      remove: () => onChange({ ...value, statusIds: value.statusIds.filter((v) => v !== id) }),
    })),
    ...value.platformIds.map((id) => ({
      key: `platform:${id}`,
      category: "Canal",
      label: nameOf(options.platforms, id),
      remove: () => onChange({ ...value, platformIds: value.platformIds.filter((v) => v !== id) }),
    })),
    ...value.accountIds.map((id) => ({
      key: `account:${id}`,
      category: "Cuenta",
      label: nameOf(options.accounts, id),
      remove: () => onChange({ ...value, accountIds: value.accountIds.filter((v) => v !== id) }),
    })),
    ...value.contentTypeIds.map((id) => ({
      key: `type:${id}`,
      category: "Tipo",
      label: nameOf(options.contentTypes, id),
      remove: () => onChange({ ...value, contentTypeIds: value.contentTypeIds.filter((v) => v !== id) }),
    })),
    ...value.campaigns.map((id) => ({
      key: `campaign:${id}`,
      category: "Campaña",
      label: nameOf(options.campaigns, id),
      remove: () => onChange({ ...value, campaigns: value.campaigns.filter((v) => v !== id) }),
    })),
  ];
  if (chips.length === 0) return null;

  function clearAll() {
    onChange(EMPTY_FILTERS);
    if (calendarIds.length > 0) onCalendarIdsChange([]);
    if (onClientIdsChange && clientIds && clientIds.length > 0) onClientIdsChange([]);
  }

  return (
    <div
      className={cn("flex flex-wrap items-center gap-1.5 border-b px-6 py-2 max-md:px-4", CAL_HEADER_BG, CAL_LINE_BORDER)}
      aria-label="Filtros activos"
    >
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-muted/50 py-0.5 pr-0.5 pl-2.5 text-xs text-foreground"
        >
          <span className="text-muted-foreground">{chip.category}:</span>
          <span className="min-w-0 truncate font-medium">{chip.label}</span>
          <button
            type="button"
            onClick={chip.remove}
            aria-label={`Quitar filtro ${chip.category}: ${chip.label}`}
            className="flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none pointer-coarse:size-7"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={clearAll}>
        Limpiar todo
      </Button>
    </div>
  );
}

/** Cantidad de filtros activos (categorías con al menos una opción elegida). Calendarios/Cliente cuentan solo si hay restricción. */
function countActiveFilters(value: CalendarFiltersState, calendarIds: string[], clientIds: string[] = []): number {
  return [
    value.platformIds,
    value.accountIds,
    value.contentTypeIds,
    value.statusIds,
    value.campaigns,
    calendarIds,
    clientIds,
  ].filter((list) => list.length > 0).length;
}

/**
 * Sección multiselección plegable. "sheet" (default): filas a todo el ancho con separadores, para el sheet mobile.
 * "popover" (v1.6, Más filtros): sin líneas — grupos con esquinas redondeadas y un fondo neutro suave al abrirse.
 */
function FilterSection({
  label,
  options,
  selected,
  onChange,
  variant = "sheet",
}: {
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  variant?: "sheet" | "popover";
}) {
  const popover = variant === "popover";
  if (options.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-between gap-2 text-sm text-muted-foreground",
          popover ? "min-h-9 rounded-lg px-2.5" : "min-h-12 border-b border-border px-4"
        )}
      >
        <span>{label}</span>
        <span className="text-xs">Sin opciones</span>
      </div>
    );
  }
  const rowClass = popover
    ? "flex min-h-8 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-sm hover:bg-background"
    : "flex min-h-11 cursor-pointer items-center gap-3 px-4 text-sm active:bg-muted";
  return (
    <details className={cn("group", popover ? "rounded-lg open:bg-muted/50" : "border-b border-border")}>
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden",
          popover ? "min-h-9 rounded-lg px-2.5 hover:bg-muted/60 group-open:hover:bg-transparent" : "min-h-12 px-4"
        )}
      >
        <span>{label}</span>
        <span className="flex items-center gap-2">
          {selected.length > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground">
              {selected.length}
            </span>
          )}
          <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className={cn("flex flex-col", popover ? "px-1 pb-1.5" : "pb-2")}>
        {options.map((option) => (
          <label key={option.id} className={rowClass}>
            <Checkbox checked={selected.includes(option.id)} onCheckedChange={() => onChange(toggle(selected, option.id))} />
            {option.label}
          </label>
        ))}
      </div>
    </details>
  );
}

/**
 * Filtros para < md: un único botón "Filtros (n)" que abre un bottom sheet con las mismas secciones y las mismas
 * opciones relevantes que la barra de escritorio (recibe el mismo `options`; no recalcula nada). "Limpiar" deja
 * todo sin restricciones (incluye Calendarios → todos); "Listo" cierra.
 */
export function MobileFilters({
  value,
  onChange,
  options,
  calendarIds,
  onCalendarIdsChange,
  clientIds,
  iconOnly = false,
}: CalendarFiltersProps & { iconOnly?: boolean }) {
  const { calendars, clientAccounts } = useLookups();
  const [open, setOpen] = useState(false);
  const selectableCalendars = getSelectableCalendars(scopeCalendarsToClients(calendars, clientIds), calendarIds);
  // Espacio no está en este panel (lo maneja el selector del encabezado): ni cuenta ni se limpia acá.
  const count = countActiveFilters(value, calendarIds);

  function clearAll() {
    onChange(EMPTY_FILTERS);
    if (calendarIds.length > 0) onCalendarIdsChange([]);
  }

  return (
    <>
      {iconOnly ? (
        <Button
          variant="ghost"
          size="icon-sm"
          className="relative size-[26px]"
          onClick={() => setOpen(true)}
          aria-label={count > 0 ? `Filtros (${count} activos)` : "Filtros"}
        >
          <ListFilter />
          {count > 0 && <span aria-hidden className="absolute top-1 right-1 size-1.5 rounded-full bg-[var(--cal-accent,currentColor)]" />}
        </Button>
      ) : (
        <Button variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
          <ListFilter />
          Filtros
          {count > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {count}
            </span>
          )}
        </Button>
      )}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" mobile="bottom" className="gap-0 p-0 max-md:max-h-[85dvh]">
          <SheetHeader className="border-b border-border p-4 pr-16">
            <SheetTitle>Filtros{count > 0 ? ` · ${count}` : ""}</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {selectableCalendars.length > 1 && (
              <FilterSection
                label="Calendarios"
                options={selectableCalendars.map((c) => ({ id: c.id, label: c.name }))}
                selected={calendarIds}
                onChange={onCalendarIdsChange}
              />
            )}
            <FilterSection
              label="Estado"
              options={options.statuses}
              selected={value.statusIds}
              onChange={(statusIds) => onChange({ ...value, statusIds })}
            />
            <FilterSection
              label="Canal"
              options={options.platforms}
              selected={value.platformIds}
              onChange={(platformIds) => onChange({ ...value, platformIds })}
            />
            {clientAccounts.length > 0 && (
              <FilterSection
                label="Cuenta"
                options={options.accounts}
                selected={value.accountIds}
                onChange={(accountIds) => onChange({ ...value, accountIds })}
              />
            )}
            <FilterSection
              label="Tipo"
              options={options.contentTypes}
              selected={value.contentTypeIds}
              onChange={(contentTypeIds) => onChange({ ...value, contentTypeIds })}
            />
            <FilterSection
              label="Campaña"
              options={options.campaigns}
              selected={value.campaigns}
              onChange={(campaigns) => onChange({ ...value, campaigns })}
            />
          </div>
          <div className="flex gap-2 border-t border-border p-3">
            <Button variant="outline" className="flex-1" disabled={count === 0} onClick={clearAll}>
              Limpiar
            </Button>
            <Button className="flex-1" onClick={() => setOpen(false)}>
              Listo
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
