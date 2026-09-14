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
import type { Calendar, Client, ClientAccount, Publication } from "@/types";

interface CalendarScreenProps {
  client: Client;
  calendars: Calendar[];
  publications: Publication[];
  clientAccounts: ClientAccount[];
  lookups: Lookups;
}

export function CalendarScreen({ client, calendars, publications, clientAccounts, lookups }: CalendarScreenProps) {
  const clientAccountMap = useMemo(() => new Map(clientAccounts.map((a) => [a.id, a])), [clientAccounts]);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const view: CalendarView = searchParams.get("view") === "month" ? "month" : "week";

  const calendarIds = useMemo(() => {
    const raw = searchParams.get("calendars");
    if (!raw) return [];
    const validIds = new Set(calendars.map((c) => c.id));
    return raw.split(",").filter((id) => validIds.has(id));
  }, [searchParams, calendars]);

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

  const setCalendarIds = useCallback(
    (ids: string[]) => {
      const params = new URLSearchParams(searchParams.toString());
      if (ids.length === 0) {
        params.delete("calendars");
      } else {
        params.set("calendars", ids.join(","));
      }
      const query = params.toString();
      router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [filters, setFilters] = useState<CalendarFiltersState>(EMPTY_FILTERS);
  const [selectedPublication, setSelectedPublication] = useState<Publication | null>(null);
  const [formState, setFormState] = useState<{ open: boolean; publication?: Publication; defaultDate?: string }>({
    open: false,
  });
  const [formKey, setFormKey] = useState(0);

  const weekDays = useMemo(() => getWeekDays(anchorDate), [anchorDate]);
  const periodLabel = view === "month" ? formatMonthYear(anchorDate) : formatWeekRange(weekDays);

  const visibleCalendars = calendarIds.length > 0 ? calendars.filter((c) => calendarIds.includes(c.id)) : calendars;
  const showCalendarLabel = visibleCalendars.length > 1;
  const calendarLabel =
    visibleCalendars.length === 1
      ? visibleCalendars[0].name
      : calendarIds.length === 0
        ? "Todos los calendarios"
        : `${visibleCalendars.length} calendarios`;
  const driveFolderUrl = visibleCalendars.length === 1 ? visibleCalendars[0].driveFolderUrl : client.driveFolderUrl;

  const calendarScopedPublications = useMemo(() => {
    if (calendarIds.length === 0) return publications;
    return publications.filter((p) => calendarIds.includes(p.calendarId));
  }, [publications, calendarIds]);

  const availableCampaigns = useMemo(
    () =>
      Array.from(new Set(calendarScopedPublications.map((p) => p.campaign).filter((c): c is string => Boolean(c)))).sort(),
    [calendarScopedPublications]
  );

  const filteredPublications = useMemo(() => {
    return calendarScopedPublications.filter((p) => {
      if (
        filters.platformIds.length > 0 &&
        !p.destinations.some((d) => {
          const account = clientAccountMap.get(d.clientAccountId);
          return account && filters.platformIds.includes(account.platformId);
        })
      ) {
        return false;
      }
      if (filters.accountIds.length > 0 && !p.destinations.some((d) => filters.accountIds.includes(d.clientAccountId))) {
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
  }, [calendarScopedPublications, filters, clientAccountMap]);

  // CASO 1: un solo calendario activo -> se precarga. CASO 2: varios o ninguno -> el form pide elegir.
  const defaultCalendarId = visibleCalendars.length === 1 ? visibleCalendars[0].id : undefined;

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
    <LookupsProvider {...lookups} calendars={calendars} clientAccounts={clientAccounts}>
      <div className="flex min-h-screen flex-col">
        <CalendarHeader
          client={client}
          calendarLabel={calendarLabel}
          driveFolderUrl={driveFolderUrl}
          periodLabel={periodLabel}
          view={view}
          onViewChange={setView}
          onPrev={() => setAnchorDate((d) => (view === "month" ? addMonths(d, -1) : addWeeks(d, -1)))}
          onNext={() => setAnchorDate((d) => (view === "month" ? addMonths(d, 1) : addWeeks(d, 1)))}
          onToday={() => setAnchorDate(new Date())}
          onCreate={() => openCreateForm()}
        />
        <CalendarFiltersBar
          value={filters}
          onChange={setFilters}
          availableCampaigns={availableCampaigns}
          calendarIds={calendarIds}
          onCalendarIdsChange={setCalendarIds}
        />
        {view === "week" ? (
          <WeekView
            weekDays={weekDays}
            publications={filteredPublications}
            onOpenPublication={setSelectedPublication}
            onCreateForDay={openCreateForm}
            clientColor={client.color}
            showCalendarLabel={showCalendarLabel}
          />
        ) : (
          <MonthView
            anchorDate={anchorDate}
            publications={filteredPublications}
            onOpenPublication={setSelectedPublication}
            onCreateForDay={openCreateForm}
            clientColor={client.color}
            showCalendarLabel={showCalendarLabel}
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
          clientId={client.id}
          calendars={calendars}
          clientAccounts={clientAccounts}
          defaultCalendarId={defaultCalendarId}
          publication={formState.publication}
          defaultDate={formState.defaultDate}
        />
      </div>
    </LookupsProvider>
  );
}
