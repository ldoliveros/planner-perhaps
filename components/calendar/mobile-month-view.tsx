"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicationCompactCard } from "@/components/calendar/publication-compact-card";
import { useLookups } from "@/components/providers/lookups-provider";
import { cn } from "cn";
import { formatFullDateFromDate, getMonthGridDays, isSameMonthAs, isToday } from "@/lib/date-utils";
import type { Publication } from "@/types";

const WEEKDAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MAX_DOTS = 3;

const toDateKey = (day: Date) => format(day, "yyyy-MM-dd");
const byTime = (a: Publication, b: Publication) => (a.publicationTime ?? "").localeCompare(b.publicationTime ?? "");

interface MobileMonthViewProps {
  anchorDate: Date;
  publications: Publication[];
  onOpenPublication: (publication: Publication) => void;
  onEditPublication?: (publication: Publication) => void;
  onDuplicatePublication?: (publication: Publication) => void;
  /** Ver WeekView.getClientId — misma generalización cliente/global. */
  getClientId?: (publication: Publication) => string | undefined;
  showClient?: boolean;
  /** Solo Super Admin / Account Manager: crea una publicación con el día seleccionado preseleccionado. */
  onCreateForDay?: (day: Date) => void;
  showCalendarLabel: boolean;
}

/**
 * Mes para < md: calendario compacto (puntos con el color del estado, sin cards dentro de las celdas) y,
 * debajo, las publicaciones del día seleccionado. Al entrar o cambiar de mes selecciona Hoy si pertenece al
 * mes visible; si no, el primer día del mes con publicaciones (o el 1).
 */
export function MobileMonthView({
  anchorDate,
  publications,
  onOpenPublication,
  onEditPublication,
  onDuplicatePublication,
  getClientId,
  showClient,
  onCreateForDay,
  showCalendarLabel,
}: MobileMonthViewProps) {
  const { getStatus } = useLookups();

  // La selección manual se descarta al cambiar de mes (se ajusta durante el render, patrón de React).
  const monthKey = format(anchorDate, "yyyy-MM");
  const [selection, setSelection] = useState<{ monthKey: string; picked: string | null }>({ monthKey, picked: null });
  if (selection.monthKey !== monthKey) setSelection({ monthKey, picked: null });

  const gridDays = useMemo(() => getMonthGridDays(anchorDate), [anchorDate]);
  const monthDays = useMemo(() => gridDays.filter((d) => isSameMonthAs(d, anchorDate)), [gridDays, anchorDate]);
  const byDate = useMemo(() => {
    const map = new Map<string, Publication[]>();
    for (const publication of publications) {
      const list = map.get(publication.publicationDate);
      if (list) list.push(publication);
      else map.set(publication.publicationDate, [publication]);
    }
    for (const list of map.values()) list.sort(byTime);
    return map;
  }, [publications]);

  const defaultDay = monthDays.find(isToday) ?? monthDays.find((d) => byDate.has(toDateKey(d))) ?? monthDays[0];
  const selectedDay =
    (selection.picked ? monthDays.find((d) => toDateKey(d) === selection.picked) : undefined) ?? defaultDay;
  const selectedKey = toDateKey(selectedDay);
  const selectedItems = byDate.get(selectedKey) ?? [];
  const selectedLabel = formatFullDateFromDate(selectedDay);

  return (
    <div className="flex flex-col pb-6">
      <div className="px-2 pt-2">
        <div className="grid grid-cols-7 pb-1">
          {WEEKDAY_LABELS.map((label) => (
            <span key={label} className="text-center text-[11px] font-medium text-muted-foreground">
              {label}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-0.5">
          {gridDays.map((day) => {
            const key = toDateKey(day);
            const inMonth = isSameMonthAs(day, anchorDate);
            const items = inMonth ? (byDate.get(key) ?? []) : [];
            const selected = inMonth && key === selectedKey;
            const today = isToday(day);
            const label = `${formatFullDateFromDate(day)}${
              items.length > 0 ? `, ${items.length} ${items.length === 1 ? "publicación" : "publicaciones"}` : ""
            }`;
            return (
              <button
                key={key}
                type="button"
                disabled={!inMonth}
                aria-label={label}
                aria-pressed={inMonth ? selected : undefined}
                aria-current={today ? "date" : undefined}
                onClick={() => setSelection({ monthKey, picked: key })}
                className={cn(
                  "mx-auto flex h-12 w-11 flex-col items-center justify-center gap-1 rounded-xl text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  !inMonth && "pointer-events-none text-muted-foreground/35",
                  inMonth && !selected && "text-foreground active:bg-muted",
                  today && !selected && "font-semibold text-primary ring-2 ring-primary/60 ring-inset",
                  selected && "bg-primary font-semibold text-primary-foreground"
                )}
              >
                <span className="leading-none">{format(day, "d")}</span>
                <span className="flex h-1.5 items-center gap-0.5">
                  {items.slice(0, MAX_DOTS).map((publication) => (
                    <span
                      key={publication.id}
                      aria-hidden
                      className="size-1.5 rounded-full ring-1 ring-background/80"
                      style={{ backgroundColor: getStatus(publication.statusId)?.color ?? "#94A3B8" }}
                    />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <section aria-label={selectedLabel} className="mt-2 border-t border-border">
        <div className="flex items-center justify-between gap-2 px-4 py-1">
          <h2 className="flex min-h-9 items-center text-sm font-semibold text-foreground">{selectedLabel}</h2>
          {onCreateForDay && (
            <Button
              variant="ghost"
              size="icon"
              className="-mr-2"
              aria-label={`Nuevo contenido el ${selectedLabel}`}
              onClick={() => onCreateForDay(selectedDay)}
            >
              <Plus />
            </Button>
          )}
        </div>
        <div className="flex flex-col gap-2 px-4 py-2">
          {selectedItems.length === 0 ? (
            <p className="py-1 text-xs text-muted-foreground">Sin publicaciones este día.</p>
          ) : (
            selectedItems.map((publication) => (
              <PublicationCompactCard
                key={publication.id}
                publication={publication}
                onOpen={() => onOpenPublication(publication)}
                onEdit={onEditPublication}
                onDuplicate={onDuplicatePublication}
                clientId={getClientId?.(publication)}
                showClient={showClient}
                showCalendarLabel={showCalendarLabel}
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
}
