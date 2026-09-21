"use client";

import { useState } from "react";
import { ChevronDown, ListFilter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useLookups } from "@/components/providers/lookups-provider";
import type { FilterOption, RelevantFilterOptions } from "@/lib/planner-filter-options";

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

function FilterPopover({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger
        disabled={options.length === 0}
        render={<Button variant="outline" size="sm" className="gap-1.5" />}
      >
        {label}
        {selected.length > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
            {selected.length}
          </span>
        )}
        <ChevronDown className="text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56">
        <div className="flex flex-col gap-1">
          {options.length > 1 && (
            <>
              <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-sm font-medium hover:bg-muted">
                <Checkbox
                  checked={selected.length === options.length}
                  indeterminate={selected.length > 0 && selected.length < options.length}
                  onCheckedChange={() =>
                    onChange(selected.length === options.length ? [] : options.map((o) => o.id))
                  }
                />
                Seleccionar todos
              </label>
              <div className="my-1 h-px bg-border" />
            </>
          )}
          {options.map((option) => {
            const checked = selected.includes(option.id);
            return (
              <label
                key={option.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-sm hover:bg-muted"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => onChange(toggle(selected, option.id))}
                />
                {option.label}
              </label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface CalendarFiltersProps {
  value: CalendarFiltersState;
  onChange: (value: CalendarFiltersState) => void;
  /** Opciones relevantes por filtro (derivadas del contexto: calendarios + período). */
  options: RelevantFilterOptions;
  calendarIds: string[];
  onCalendarIdsChange: (ids: string[]) => void;
}

export function CalendarFiltersBar({
  value,
  onChange,
  options,
  calendarIds,
  onCalendarIdsChange,
}: CalendarFiltersProps) {
  const { calendars, clientAccounts } = useLookups();
  const selectableCalendars = getSelectableCalendars(calendars, calendarIds);
  const hasActiveFilters =
    value.platformIds.length > 0 ||
    value.accountIds.length > 0 ||
    value.contentTypeIds.length > 0 ||
    value.statusIds.length > 0 ||
    value.campaigns.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-background px-6 py-3 max-md:hidden">
      <ListFilter className="mr-1 size-4 text-muted-foreground" />

      {selectableCalendars.length > 1 && (
        <FilterPopover
          label="Calendario"
          options={selectableCalendars.map((c) => ({ id: c.id, label: c.name }))}
          selected={calendarIds}
          onChange={onCalendarIdsChange}
        />
      )}
      <FilterPopover
        label="Canal"
        options={options.platforms}
        selected={value.platformIds}
        onChange={(platformIds) => onChange({ ...value, platformIds })}
      />
      {clientAccounts.length > 0 && (
        <FilterPopover
          label="Cuenta"
          options={options.accounts}
          selected={value.accountIds}
          onChange={(accountIds) => onChange({ ...value, accountIds })}
        />
      )}
      <FilterPopover
        label="Tipo"
        options={options.contentTypes}
        selected={value.contentTypeIds}
        onChange={(contentTypeIds) => onChange({ ...value, contentTypeIds })}
      />
      <FilterPopover
        label="Estado"
        options={options.statuses}
        selected={value.statusIds}
        onChange={(statusIds) => onChange({ ...value, statusIds })}
      />
      <FilterPopover
        label="Campaña"
        options={options.campaigns}
        selected={value.campaigns}
        onChange={(campaigns) => onChange({ ...value, campaigns })}
      />

      {hasActiveFilters && (
        <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" onClick={() => onChange(EMPTY_FILTERS)}>
          <X />
          Limpiar filtros
        </Button>
      )}
    </div>
  );
}

/** Cantidad de filtros activos (categorías con al menos una opción elegida). Calendarios cuenta solo si hay restricción. */
function countActiveFilters(value: CalendarFiltersState, calendarIds: string[]): number {
  return [value.platformIds, value.accountIds, value.contentTypeIds, value.statusIds, value.campaigns, calendarIds].filter(
    (list) => list.length > 0
  ).length;
}

function FilterSection({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  if (options.length === 0) {
    return (
      <div className="flex min-h-12 items-center justify-between gap-2 border-b border-border px-4 text-sm text-muted-foreground">
        <span>{label}</span>
        <span className="text-xs">Sin opciones</span>
      </div>
    );
  }
  const rowClass = "flex min-h-11 cursor-pointer items-center gap-3 px-4 text-sm active:bg-muted";
  return (
    <details className="group border-b border-border">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
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
      <div className="flex flex-col pb-2">
        {options.length > 1 && (
          <>
            <label className={`${rowClass} font-medium`}>
              <Checkbox
                checked={selected.length === options.length}
                indeterminate={selected.length > 0 && selected.length < options.length}
                onCheckedChange={() => onChange(selected.length === options.length ? [] : options.map((o) => o.id))}
              />
              Seleccionar todos
            </label>
            <div className="mx-4 my-1 h-px bg-border" />
          </>
        )}
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
export function MobileFilters({ value, onChange, options, calendarIds, onCalendarIdsChange }: CalendarFiltersProps) {
  const { calendars, clientAccounts } = useLookups();
  const [open, setOpen] = useState(false);
  const selectableCalendars = getSelectableCalendars(calendars, calendarIds);
  const count = countActiveFilters(value, calendarIds);

  function clearAll() {
    onChange(EMPTY_FILTERS);
    if (calendarIds.length > 0) onCalendarIdsChange([]);
  }

  return (
    <>
      <Button variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
        <ListFilter />
        Filtros
        {count > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
            {count}
          </span>
        )}
      </Button>
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
              label="Estado"
              options={options.statuses}
              selected={value.statusIds}
              onChange={(statusIds) => onChange({ ...value, statusIds })}
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
