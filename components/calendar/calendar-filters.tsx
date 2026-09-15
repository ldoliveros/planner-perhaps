"use client";

import { ChevronDown, ListFilter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLookups } from "@/components/providers/lookups-provider";

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

interface Option {
  id: string;
  label: string;
}

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
  options: Option[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" size="sm" className="gap-1.5" />}>
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
  availableCampaigns: string[];
  calendarIds: string[];
  onCalendarIdsChange: (ids: string[]) => void;
}

export function CalendarFiltersBar({
  value,
  onChange,
  availableCampaigns,
  calendarIds,
  onCalendarIdsChange,
}: CalendarFiltersProps) {
  const { platforms, contentTypes, statuses, calendars, clientAccounts } = useLookups();
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
        options={platforms.map((p) => ({ id: p.id, label: p.name }))}
        selected={value.platformIds}
        onChange={(platformIds) => onChange({ ...value, platformIds })}
      />
      {clientAccounts.length > 0 && (
        <FilterPopover
          label="Cuenta"
          options={clientAccounts.map((a) => ({ id: a.id, label: a.handle ? `${a.name} (${a.handle})` : a.name }))}
          selected={value.accountIds}
          onChange={(accountIds) => onChange({ ...value, accountIds })}
        />
      )}
      <FilterPopover
        label="Tipo"
        options={contentTypes.map((c) => ({ id: c.id, label: c.label }))}
        selected={value.contentTypeIds}
        onChange={(contentTypeIds) => onChange({ ...value, contentTypeIds })}
      />
      <FilterPopover
        label="Estado"
        options={statuses.map((s) => ({ id: s.id, label: s.label }))}
        selected={value.statusIds}
        onChange={(statusIds) => onChange({ ...value, statusIds })}
      />
      <FilterPopover
        label="Campaña"
        options={availableCampaigns.map((c) => ({ id: c, label: c }))}
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
