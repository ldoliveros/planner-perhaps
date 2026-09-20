"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { addMonths, addWeeks, format } from "date-fns";
import { CalendarDays, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CalendarHeader, type CalendarView } from "@/components/calendar/calendar-header";
import { CalendarFiltersBar, EMPTY_FILTERS, type CalendarFiltersState } from "@/components/calendar/calendar-filters";
import { WeekView } from "@/components/calendar/week-view";
import { MonthView } from "@/components/calendar/month-view";
import { AgendaView } from "@/components/calendar/agenda-view";
import { PublicationDrawer } from "@/components/publication/publication-drawer";
import { PublicationForm } from "@/components/publication/publication-form";
import { LookupsProvider } from "@/components/providers/lookups-provider";
import { formatMonthYear, formatWeekRange, getMonthGridDays, getWeekDays, isSameMonthAs } from "@/lib/date-utils";
import { usePlannerShortcuts } from "@/lib/use-planner-shortcuts";
import { buildPlannerCsv, downloadCsv } from "@/lib/planner-csv";
import { getRelevantFilterOptions, pruneFilters } from "@/lib/planner-filter-options";
import { slugify } from "@/lib/slugify";
import { toast } from "@/lib/toast";
import type { Lookups } from "@/lib/supabase/queries";
import type { Calendar, Campaign, Client, ClientAccount, Publication } from "@/types";

interface CalendarScreenProps {
  client: Client;
  calendars: Calendar[];
  publications: Publication[];
  clientAccounts: ClientAccount[];
  campaigns: Campaign[];
  lookups: Lookups;
  readOnly?: boolean;
  /** Solo admin: habilita el selector compacto de cliente en el header. */
  allClients?: { id: string; name: string }[];
}

export function CalendarScreen({
  client,
  calendars,
  publications,
  clientAccounts,
  campaigns,
  lookups,
  readOnly = false,
  allClients,
}: CalendarScreenProps) {
  const clientAccountMap = useMemo(() => new Map(clientAccounts.map((a) => [a.id, a])), [clientAccounts]);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleSwitchClient(clientId: string) {
    router.push(`/admin/clients/${clientId}/planner`);
  }

  const rawView = searchParams.get("view");
  const view: CalendarView = rawView === "month" ? "month" : rawView === "list" ? "list" : "week";

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
  // Deep-link desde /admin/publications: ?publication=<id> abre el drawer directo
  // al montar (lectura única — no reacciona a cambios posteriores del param).
  const [selectedPublication, setSelectedPublication] = useState<Publication | null>(() => {
    const targetId = searchParams.get("publication");
    return targetId ? (publications.find((p) => p.id === targetId) ?? null) : null;
  });
  // Deep-link desde /admin/publications: ?duplicate=<id> abre el form ya precargado
  // como duplicado (misma lectura única que ?publication=, al montar).
  const [formState, setFormState] = useState<{
    open: boolean;
    publication?: Publication;
    duplicateFrom?: Publication;
    defaultDate?: string;
  }>(() => {
    const targetId = searchParams.get("duplicate");
    const duplicateFrom = targetId ? (publications.find((p) => p.id === targetId) ?? undefined) : undefined;
    return { open: Boolean(duplicateFrom), duplicateFrom };
  });
  const [formKey, setFormKey] = useState(0);

  const weekDays = useMemo(() => getWeekDays(anchorDate), [anchorDate]);
  const periodLabel = view === "month" ? formatMonthYear(anchorDate) : formatWeekRange(weekDays);
  const agendaDays = useMemo(
    () => (view === "month" ? getMonthGridDays(anchorDate).filter((d) => isSameMonthAs(d, anchorDate)) : weekDays),
    [view, weekDays, anchorDate]
  );

  const visibleCalendars = calendarIds.length > 0 ? calendars.filter((c) => calendarIds.includes(c.id)) : calendars;
  const showCalendarLabel = visibleCalendars.length > 1;
  const calendarLabel =
    visibleCalendars.length === 1
      ? visibleCalendars[0].name
      : calendarIds.length === 0
        ? "Todos los calendarios"
        : `${visibleCalendars.length} calendarios`;
  const driveFolderUrl = visibleCalendars.length === 1 ? visibleCalendars[0].driveFolderUrl : client.driveFolderUrl;
  const calendarDescription = visibleCalendars.length === 1 ? visibleCalendars[0].description : null;

  const calendarScopedPublications = useMemo(() => {
    if (calendarIds.length === 0) return publications;
    return publications.filter((p) => calendarIds.includes(p.calendarId));
  }, [publications, calendarIds]);

  // Fechas del período visible (semana en Semana/Lista, mes real sin días grises en Mes): mismo criterio para
  // las opciones de filtro y para el CSV.
  const periodDateKeys = useMemo(() => new Set(agendaDays.map((d) => format(d, "yyyy-MM-dd"))), [agendaDays]);

  // Contexto base de los filtros: publicaciones de los calendarios seleccionados dentro del período visible,
  // SIN aplicar los filtros de contenido. Así las opciones de un filtro no dependen de lo elegido en los demás.
  const filterOptions = useMemo(
    () =>
      getRelevantFilterOptions(
        calendarScopedPublications.filter((p) => periodDateKeys.has(p.publicationDate)),
        {
          platforms: lookups.platforms,
          contentTypes: lookups.contentTypes,
          statuses: lookups.statuses,
          clientAccounts,
          campaigns,
        }
      ),
    [calendarScopedPublications, periodDateKeys, lookups, clientAccounts, campaigns]
  );

  // Si el contexto cambió (calendario / período) y una selección ya no existe entre las opciones, se limpia solo
  // esa selección. `pruneFilters` devuelve la misma referencia cuando no hay nada que limpiar, así el ajuste de
  // estado durante el render converge en una sola pasada y no genera loops.
  const activeFilters = pruneFilters(filters, filterOptions);
  if (activeFilters !== filters) setFilters(activeFilters);

  const hasActiveFilters =
    activeFilters.platformIds.length > 0 ||
    activeFilters.accountIds.length > 0 ||
    activeFilters.contentTypeIds.length > 0 ||
    activeFilters.statusIds.length > 0 ||
    activeFilters.campaigns.length > 0;

  const filteredPublications = useMemo(() => {
    return calendarScopedPublications.filter((p) => {
      if (
        activeFilters.platformIds.length > 0 &&
        !p.destinations.some((d) => {
          const account = clientAccountMap.get(d.clientAccountId);
          return account && activeFilters.platformIds.includes(account.platformId);
        })
      ) {
        return false;
      }
      if (activeFilters.accountIds.length > 0 && !p.destinations.some((d) => activeFilters.accountIds.includes(d.clientAccountId))) {
        return false;
      }
      if (activeFilters.contentTypeIds.length > 0 && !activeFilters.contentTypeIds.includes(p.contentTypeId)) {
        return false;
      }
      if (activeFilters.statusIds.length > 0 && !activeFilters.statusIds.includes(p.statusId)) {
        return false;
      }
      if (activeFilters.campaigns.length > 0 && !(p.campaignId && activeFilters.campaigns.includes(p.campaignId))) {
        return false;
      }
      return true;
    });
  }, [calendarScopedPublications, activeFilters, clientAccountMap]);

  // Exporta lo que el usuario está viendo: mismas publicaciones (calendarios + filtros) y mismo período
  // (agendaDays: semana en Semana/Lista, mes en Mes). No hay query ni lógica de filtros aparte.
  function handleExportCsv() {
    try {
      const toExport = filteredPublications.filter((p) => periodDateKeys.has(p.publicationDate));
      if (toExport.length === 0) {
        toast.info("No hay publicaciones para exportar", "Probá cambiando el período o los filtros.");
        return;
      }
      const csv = buildPlannerCsv(toExport, {
        calendars,
        clientAccounts,
        campaigns,
        contentTypes: lookups.contentTypes,
        statuses: lookups.statuses,
        platforms: lookups.platforms,
      });
      const from = format(agendaDays[0], "yyyy-MM-dd");
      const to = format(agendaDays[agendaDays.length - 1], "yyyy-MM-dd");
      downloadCsv(`planner-${slugify(client.slug || client.name)}-${from}-${to}.csv`, csv);
      toast.success("CSV exportado");
    } catch (error) {
      console.error("[export-csv]", error);
      toast.error("No se pudo exportar el CSV", "Ocurrió un problema al generar el archivo. Probá de nuevo.");
    }
  }

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

  function openDuplicateForm(publication: Publication) {
    setSelectedPublication(null);
    setFormKey((k) => k + 1);
    setFormState({ open: true, duplicateFrom: publication });
  }

  usePlannerShortcuts({
    overlayOpen: formState.open || selectedPublication !== null,
    onNewPublication: readOnly ? undefined : () => openCreateForm(),
    onPrevWeek: () => setAnchorDate((d) => (view === "month" ? addMonths(d, -1) : addWeeks(d, -1))),
    onNextWeek: () => setAnchorDate((d) => (view === "month" ? addMonths(d, 1) : addWeeks(d, 1))),
  });

  if (calendars.length === 0) {
    return (
      <LookupsProvider {...lookups} calendars={calendars} clientAccounts={clientAccounts} campaigns={campaigns}>
        <div className="flex h-full flex-col">
          <CalendarHeader
            client={client}
            calendarLabel="Sin calendarios"
            driveFolderUrl={client.driveFolderUrl}
            periodLabel=""
            view={view}
            onViewChange={setView}
            onPrev={() => {}}
            onNext={() => {}}
            onToday={() => {}}
            allClients={allClients}
            onSwitchClient={allClients ? handleSwitchClient : undefined}
          />
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <CalendarDays className="size-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {readOnly
                ? "Todavía no hay calendarios configurados para tu cuenta. Contactá a tu equipo de gestión."
                : "Este cliente todavía no tiene calendarios. Creá el primero desde su ficha."}
            </p>
            {!readOnly && (
              <Button size="sm" className="gap-1.5" nativeButton={false} render={<Link href={`/admin/clients/${client.id}`} />}>
                Ir a la ficha del cliente
              </Button>
            )}
          </div>
        </div>
      </LookupsProvider>
    );
  }

  return (
    <LookupsProvider {...lookups} calendars={calendars} clientAccounts={clientAccounts} campaigns={campaigns}>
      <div className="flex h-full flex-col">
        <CalendarHeader
          client={client}
          calendarLabel={calendarLabel}
          calendarDescription={calendarDescription}
          driveFolderUrl={driveFolderUrl}
          periodLabel={periodLabel}
          view={view}
          onViewChange={setView}
          onPrev={() => setAnchorDate((d) => (view === "month" ? addMonths(d, -1) : addWeeks(d, -1)))}
          onNext={() => setAnchorDate((d) => (view === "month" ? addMonths(d, 1) : addWeeks(d, 1)))}
          onToday={() => setAnchorDate(new Date())}
          onCreate={readOnly ? undefined : () => openCreateForm()}
          onExport={readOnly ? undefined : handleExportCsv}
          allClients={allClients}
          onSwitchClient={allClients ? handleSwitchClient : undefined}
        />
        <CalendarFiltersBar
          value={activeFilters}
          onChange={setFilters}
          options={filterOptions}
          calendarIds={calendarIds}
          onCalendarIdsChange={setCalendarIds}
        />
        {hasActiveFilters && filteredPublications.length === 0 && (
          <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-6 py-2 text-sm text-muted-foreground">
            No hay publicaciones que coincidan con los filtros actuales.
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" onClick={() => setFilters(EMPTY_FILTERS)}>
              <X />
              Limpiar filtros
            </Button>
          </div>
        )}
        {view === "list" ? (
          <div className="flex flex-1 flex-col">
            <AgendaView
              days={agendaDays}
              publications={filteredPublications}
              onOpenPublication={setSelectedPublication}
              onEditPublication={readOnly ? undefined : openEditForm}
              onDuplicatePublication={readOnly ? undefined : openDuplicateForm}
              clientId={client.id}
              showCalendarLabel={showCalendarLabel}
            />
          </div>
        ) : (
          <>
            {/* Desktop/tablet: grilla semanal o mensual. Mobile: agenda tipo lista (la grilla de 7 columnas no es legible en pantallas angostas). */}
            <div className="hidden flex-1 flex-col md:flex">
              {view === "week" ? (
                <WeekView
                  weekDays={weekDays}
                  publications={filteredPublications}
                  onOpenPublication={setSelectedPublication}
                  onEditPublication={readOnly ? undefined : openEditForm}
                  onDuplicatePublication={readOnly ? undefined : openDuplicateForm}
                  clientId={client.id}
                  onCreateForDay={readOnly ? undefined : openCreateForm}
                  clientColor={client.color}
                  showCalendarLabel={showCalendarLabel}
                />
              ) : (
                <MonthView
                  anchorDate={anchorDate}
                  publications={filteredPublications}
                  onOpenPublication={setSelectedPublication}
                  onEditPublication={readOnly ? undefined : openEditForm}
                  onDuplicatePublication={readOnly ? undefined : openDuplicateForm}
                  clientId={client.id}
                  onCreateForDay={readOnly ? undefined : openCreateForm}
                  clientColor={client.color}
                  showCalendarLabel={showCalendarLabel}
                />
              )}
            </div>
            <div className="flex flex-1 flex-col md:hidden">
              <AgendaView
                days={agendaDays}
                publications={filteredPublications}
                onOpenPublication={setSelectedPublication}
                onEditPublication={readOnly ? undefined : openEditForm}
                onDuplicatePublication={readOnly ? undefined : openDuplicateForm}
                clientId={client.id}
                showCalendarLabel={showCalendarLabel}
              />
            </div>
          </>
        )}
        <PublicationDrawer
          publication={selectedPublication}
          onOpenChange={(open) => !open && setSelectedPublication(null)}
          onEdit={readOnly ? undefined : openEditForm}
          onDuplicate={readOnly ? undefined : openDuplicateForm}
        />
        {!readOnly && (
          <PublicationForm
            key={formKey}
            open={formState.open}
            onOpenChange={(open) => setFormState((prev) => ({ ...prev, open }))}
            clientId={client.id}
            calendars={calendars}
            clientAccounts={clientAccounts}
            campaigns={campaigns}
            defaultCalendarId={defaultCalendarId}
            publication={formState.publication}
            duplicateFrom={formState.duplicateFrom}
            defaultDate={formState.defaultDate}
          />
        )}
      </div>
    </LookupsProvider>
  );
}
