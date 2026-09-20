"use client";

import { ChevronDown, ListFilter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  // Calendarios archivados no se ofrecen como filtro operativo — salvo que ya
  // vinieran seleccionados (ej. deep link desde Admin > Publicaciones a una
  // publicación histórica), para no "perder" ese filtro silenciosamente.
  const selectableCalendars = calendars.filter((c) => c.status !== "archived" || calendarIds.includes(c.id));
  const hasActiveFilters =
    value.platformIds.length > 0 ||
    value.accountIds.length > 0 ||
    value.contentTypeIds.length > 0 ||
    value.statusIds.length > 0 ||
    value.campaigns.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-background px-6 py-3">
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
