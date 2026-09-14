"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { addMonths, addWeeks, format } from "date-fns";
import { CalendarHeader, type CalendarView } from "@/components/calendar/calendar-header";
import { CalendarFiltersBar, EMPTY_FILTERS, type CalendarFiltersState } from "@/components/calendar/calendar-filters";
import { WeekView } from "@/components/calendar/week-view";
import { MonthView } from "@/components/calendar/month-view";
import { PublicationDrawer } from "@/components/publication/publication-drawer";
import { PublicationForm } from "@/components/publication/publication-form";
import { LookupsProvider } from "@/components/providers/lookups-provider";
import { formatMonthYear, formatWeekRange, getWeekDays } from "@/lib/date-utils";
import type { Lookups } from "@/lib/supabase/queries";
import type { Calendar, Client, Publication } from "@/types";

interface CalendarScreenProps {
  client: Client;
  calendar: Calendar;
  publications: Publication[];
  lookups: Lookups;
}

export function CalendarScreen({ client, calendar, publications, lookups }: CalendarScreenProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const view: CalendarView = searchParams.get("view") === "month" ? "month" : "week";

  const setView = useCallback(
    (next: CalendarView) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "week") {
        params.delete("view");
      } else {
        params.set("view", next);
      }
      const query = params.toString();
      router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const initialAnchor = useMemo(() => {
    const today = new Date();
    if (today.getFullYear() === calendar.year && today.getMonth() + 1 === calendar.month) {
      return today;
    }
    return new Date(calendar.year, calendar.month - 1, 1);
  }, [calendar.year, calendar.month]);

  const [anchorDate, setAnchorDate] = useState(initialAnchor);
  const [filters, setFilters] = useState<CalendarFiltersState>(EMPTY_FILTERS);
  const [selectedPublication, setSelectedPublication] = useState<Publication | null>(null);
  const [formState, setFormState] = useState<{ open: boolean; publication?: Publication; defaultDate?: string }>({
    open: false,
  });
  const [formKey, setFormKey] = useState(0);

  const weekDays = useMemo(() => getWeekDays(anchorDate), [anchorDate]);
  const periodLabel = view === "month" ? formatMonthYear(anchorDate) : formatWeekRange(weekDays);

  const availableCampaigns = useMemo(
    () => Array.from(new Set(publications.map((p) => p.campaign).filter((c): c is string => Boolean(c)))).sort(),
    [publications]
  );

  const filteredPublications = useMemo(() => {
    return publications.filter((p) => {
      if (filters.platformIds.length > 0 && !p.destinations.some((d) => filters.platformIds.includes(d.platformId))) {
        return false;
      }
      if (
        filters.accountTypeIds.length > 0 &&
        !p.destinations.some((d) => d.accountTypeId !== null && filters.accountTypeIds.includes(d.accountTypeId))
      ) {
        return false;
      }
      if (filters.contentTypeIds.length > 0 && !filters.contentTypeIds.includes(p.contentTypeId)) {
        return false;
      }
      if (filters.statusIds.length > 0 && !filters.statusIds.includes(p.statusId)) {
        return false;
      }
      if (filters.campaigns.length > 0 && !(p.campaign && filters.campaigns.includes(p.campaign))) {
        return false;
      }
      return true;
    });
  }, [publications, filters]);

  function openCreateForm(day?: Date) {
    setFormKey((k) => k + 1);
    setFormState({ open: true, publication: undefined, defaultDate: day ? format(day, "yyyy-MM-dd") : undefined });
  }

  function openEditForm(publication: Publication) {
    setSelectedPublication(null);
    setFormKey((k) => k + 1);
    setFormState({ open: true, publication });
  }

  return (
    <LookupsProvider {...lookups}>
      <div className="flex min-h-screen flex-col">
        <CalendarHeader
          client={client}
          calendar={calendar}
          periodLabel={periodLabel}
          view={view}
          onViewChange={setView}
          onPrev={() => setAnchorDate((d) => (view === "month" ? addMonths(d, -1) : addWeeks(d, -1)))}
          onNext={() => setAnchorDate((d) => (view === "month" ? addMonths(d, 1) : addWeeks(d, 1)))}
          onToday={() => setAnchorDate(new Date())}
          onCreate={() => openCreateForm()}
        />
        <CalendarFiltersBar value={filters} onChange={setFilters} availableCampaigns={availableCampaigns} />
        {view === "week" ? (
          <WeekView
            weekDays={weekDays}
            publications={filteredPublications}
            onOpenPublication={setSelectedPublication}
            onCreateForDay={openCreateForm}
          />
        ) : (
          <MonthView
            anchorDate={anchorDate}
            publications={filteredPublications}
            onOpenPublication={setSelectedPublication}
            onCreateForDay={openCreateForm}
          />
        )}
        <PublicationDrawer
          publication={selectedPublication}
          onOpenChange={(open) => !open && setSelectedPublication(null)}
          onEdit={openEditForm}
        />
        <PublicationForm
          key={formKey}
          open={formState.open}
          onOpenChange={(open) => setFormState((prev) => ({ ...prev, open }))}
          calendarId={calendar.id}
          publication={formState.publication}
          defaultDate={formState.defaultDate}
        />
      </div>
    </LookupsProvider>
  );
}
