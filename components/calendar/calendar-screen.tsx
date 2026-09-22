"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { addMonths, addWeeks, format } from "date-fns";
import { CalendarDays, X } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { CalendarHeader, type CalendarView } from "@/components/calendar/calendar-header";
import {
  CalendarFiltersBar,
  EMPTY_FILTERS,
  MobileFilters,
  type CalendarFiltersState,
  type DateRangeValue,
} from "@/components/calendar/calendar-filters";
import { PublicationSearchBox } from "@/components/calendar/publication-search-box";
import { WeekView } from "@/components/calendar/week-view";
import { MonthView } from "@/components/calendar/month-view";
import { AgendaListView } from "@/components/calendar/agenda-list-view";
import { MobileAgendaView } from "@/components/calendar/mobile-agenda-view";
import { MobileMonthView } from "@/components/calendar/mobile-month-view";
import { PublicationDrawer } from "@/components/publication/publication-drawer";
import { PublicationForm } from "@/components/publication/publication-form";
import { LookupsProvider } from "@/components/providers/lookups-provider";
import { formatMonthYear, formatWeekRange, getMonthGridDays, getWeekDays, isSameMonthAs } from "@/lib/date-utils";
import { usePlannerShortcuts } from "@/lib/use-planner-shortcuts";
import { useMediaQuery } from "@/lib/use-media-query";
import { buildPlannerCsv, downloadCsv } from "@/lib/planner-csv";
import { getRelevantFilterOptions, pruneFilters, withSelectedOptions } from "@/lib/planner-filter-options";
import { replaceSearchParams } from "@/lib/history-search-params";
import { slugify } from "@/lib/slugify";
import { toast } from "@/lib/toast";
import { fetchPublicationsInRange } from "@/lib/actions/publications";
import type { Lookups } from "@/lib/supabase/queries";
import type { Calendar, Campaign, Client, ClientAccount, Publication } from "@/types";

/**
 * "Cliente" sintético para el header en Publicaciones (calendario global): CalendarHeader, WeekView y MonthView
 * ya reciben un `Client` (nombre, logo, color) para su identidad visual — reutilizarlos tal cual con este
 * objeto evita bifurcar esos componentes solo para el caso "no hay un único cliente". El gris es neutro a
 * propósito (spec: nada de un color por-cliente como sistema principal de identificación acá).
 */
const GLOBAL_BRAND: Client = {
  id: "__global__",
  name: "Todos los clientes",
  slug: "todos-los-clientes",
  logoUrl: null,
  color: "#64748b",
  active: true,
  driveFolderId: null,
  driveFolderUrl: null,
};

interface CalendarScreenProps {
  /** Planner de un cliente. Ausente solo en el contexto "global" (ver `global` abajo). */
  client?: Client;
  /** Calendarios visibles: los de ese cliente, o de TODOS los clientes en el contexto "global". */
  calendars: Calendar[];
  publications: Publication[];
  clientAccounts: ClientAccount[];
  campaigns: Campaign[];
  lookups: Lookups;
  readOnly?: boolean;
  /** Solo admin: habilita el selector compacto de cliente en el header (Planner de un cliente). */
  allClients?: { id: string; name: string }[];
  /**
   * Publicaciones (calendario global de la agencia): presente SOLO en ese contexto. `publications` llega
   * acotada a `initialRange` — no "todo el histórico de todos los clientes" (no escala) — y esta pantalla
   * pide más bajo demanda (ensureRange) al navegar a un período fuera de lo cargado o ampliar Desde/Hasta en
   * Lista. Cambiar de vista (Semana/Mes/Lista) dentro de lo ya cargado sigue siendo 100% local.
   */
  global?: {
    clients: Client[];
    initialRange: { from: string; to: string };
  };
}

export function CalendarScreen({
  client: clientProp,
  calendars,
  publications,
  clientAccounts,
  campaigns,
  lookups,
  readOnly = false,
  allClients,
  global,
}: CalendarScreenProps) {
  const isGlobal = Boolean(global);
  // GLOBAL_BRAND es un Client válido (nombre/logo/color) — el resto del archivo sigue usando `client.X` sin
  // bifurcar, tanto para el header como para el acento de fin de semana en Semana/Mes.
  const client = global ? GLOBAL_BRAND : clientProp!;
  // Solo Publicaciones puede crear/exportar sin cliente fijo — esas acciones necesitan uno. Editar/duplicar/
  // arrastrar sí están disponibles ahí (cada publicación ya tiene su propio cliente, resuelto más abajo).
  const canCreateOrExport = !readOnly && !isGlobal;
  const canManage = !readOnly;

  const clientAccountMap = useMemo(() => new Map(clientAccounts.map((a) => [a.id, a])), [clientAccounts]);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleSwitchClient(clientId: string) {
    router.push(`/admin/clients/${clientId}/planner`);
  }

  // Publicaciones (global) abre por defecto en Lista; el Planner de un cliente sigue abriendo en Semana. Un
  // `?view=` explícito (incl. `?view=week`) siempre gana — solo la AUSENCIA del param resuelve por contexto.
  // Puramente derivado del prop `global` + los searchParams ya disponibles en el primer render: no dispara
  // ningún efecto ni fetch adicional para fijar este default.
  const defaultView: CalendarView = isGlobal ? "list" : "week";
  const rawView = searchParams.get("view");
  const view: CalendarView =
    rawView === "month" || rawView === "list" || rawView === "week" ? rawView : defaultView;

  // Se monta UNA sola versión de la vista (desktop o mobile). `null` = todavía sin hidratar (SSR): se emiten
  // ambas y el CSS (hidden md:flex / md:hidden) muestra la que corresponde, sin parpadeo.
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const showDesktopViews = isDesktop !== false;
  const showMobileViews = isDesktop !== true;

  const calendarIds = useMemo(() => {
    const raw = searchParams.get("calendars");
    if (!raw) return [];
    const validIds = new Set(calendars.map((c) => c.id));
    return raw.split(",").filter((id) => validIds.has(id));
  }, [searchParams, calendars]);

  // Solo Publicaciones (global): filtro Cliente, exclusivo de ese contexto — mismo mecanismo que Calendarios.
  const clientIds = useMemo(() => {
    if (!global) return [];
    const raw = searchParams.get("clients");
    if (!raw) return [];
    const validIds = new Set(global.clients.map((c) => c.id));
    return raw.split(",").filter((id) => validIds.has(id));
  }, [searchParams, global]);

  // Solo Lista (los dos contextos): Desde/Hasta. No es la navegación de Semana/Mes (esa sigue siendo ← Hoy →).
  const dateFrom = searchParams.get("from") ?? "";
  const dateTo = searchParams.get("to") ?? "";

  // `view`, `calendars`, `clients` y `from`/`to` se reflejan en la URL con la History API nativa, no con
  // router.replace(). Los datos del período visible ya están cargados en el cliente (o Publicaciones los pide
  // en segundo plano — ver ensureRange más abajo) — cambiar de vista o de filtros es puramente local.
  // router.replace() dispara una navegación real de Next (re-ejecuta el Server Component de la página y vuelve
  // a pedir todo a Supabase) solo para cambiar qué se renderiza; history.replaceState() actualiza la URL sin
  // eso — Next sincroniza usePathname()/useSearchParams() con la History API nativa, así que los valores
  // derivados de searchParams se actualizan igual, solo que sin roundtrip al server.
  const setView = useCallback(
    (next: CalendarView) => replaceSearchParams(pathname, searchParams, { view: next === defaultView ? null : next }),
    [pathname, searchParams, defaultView]
  );

  const setCalendarIds = useCallback(
    (ids: string[]) => replaceSearchParams(pathname, searchParams, { calendars: ids.length > 0 ? ids.join(",") : null }),
    [pathname, searchParams]
  );

  const setClientIds = useCallback(
    (ids: string[]) => replaceSearchParams(pathname, searchParams, { clients: ids.length > 0 ? ids.join(",") : null }),
    [pathname, searchParams]
  );

  const setDateRange = useCallback(
    (value: DateRangeValue) =>
      replaceSearchParams(pathname, searchParams, { from: value.from || null, to: value.to || null }),
    [pathname, searchParams]
  );

  // Buscador compacto (título + copy): estado local, no viaja a la URL — no hace falta que sea deep-linkeable.
  const [search, setSearch] = useState("");

  // Solo Publicaciones (global): publicaciones cargadas hasta ahora + el rango que cubren. Arranca con lo que
  // trajo el Server Component (initialRange) y crece bajo demanda (ensureRange) — nunca "todo el histórico".
  const [globalPublications, setGlobalPublications] = useState(publications);
  const [loadedRange, setLoadedRange] = useState(global?.initialRange ?? null);
  // React 19: pasarle una función async a startTransition hace que `isLoadingRange` quede en `true` durante
  // todo el fetch (no solo la porción síncrona) — sin necesidad de un setState manual antes/después, que el
  // linter de efectos marca como anti-patrón al dispararse desde el useEffect de más abajo.
  const [isLoadingRange, startRangeTransition] = useTransition();
  const effectivePublications = global ? globalPublications : publications;

  const ensureRange = useCallback(
    (from: string, to: string) => {
      if (!global || !loadedRange) return;
      if (from >= loadedRange.from && to <= loadedRange.to) return; // ya cubierto, sin pedir nada
      const unionFrom = from < loadedRange.from ? from : loadedRange.from;
      const unionTo = to > loadedRange.to ? to : loadedRange.to;
      startRangeTransition(async () => {
        const { publications: fresh } = await fetchPublicationsInRange(unionFrom, unionTo);
        setGlobalPublications(fresh);
        setLoadedRange({ from: unionFrom, to: unionTo });
      });
    },
    [global, loadedRange]
  );

  // Deep-link (Compartir y /admin/publications): ?publication=<id> abre el drawer directo al montar (lectura
  // única — no reacciona a cambios posteriores del param). `publications` ya viene filtrada por RLS, así que un id
  // ajeno o inexistente simplemente no aparece: no se muestra nada y se avisa (ver el efecto de abajo).
  const [shared] = useState(() => {
    const id = searchParams.get("publication");
    return { id, publication: id ? (effectivePublications.find((p) => p.id === id) ?? null) : null };
  });
  const [anchorDate, setAnchorDate] = useState(() =>
    shared.publication ? new Date(`${shared.publication.publicationDate}T00:00:00`) : new Date()
  );
  const [filters, setFilters] = useState<CalendarFiltersState>(EMPTY_FILTERS);
  const [selectedPublication, setSelectedPublication] = useState<Publication | null>(shared.publication);
  const missingSharedPublication = useRef(Boolean(shared.id) && !shared.publication);
  // Deep-link desde /admin/publications: ?duplicate=<id> abre el form ya precargado como duplicado (misma
  // lectura única que ?publication=, al montar). `clientId` fija a qué cliente pertenece el formulario (en
  // Publicaciones global cada publicación puede ser de un cliente distinto; ver openEditForm/openDuplicateForm).
  const [formState, setFormState] = useState<{
    open: boolean;
    publication?: Publication;
    duplicateFrom?: Publication;
    defaultDate?: string;
    clientId: string;
  }>(() => {
    const targetId = searchParams.get("duplicate");
    const duplicateFrom = targetId ? (effectivePublications.find((p) => p.id === targetId) ?? undefined) : undefined;
    return { open: Boolean(duplicateFrom), duplicateFrom, clientId: duplicateFrom?.clientId ?? client.id };
  });
  const [formKey, setFormKey] = useState(0);

  // "Hoy": en Semana/Mes lleva el período visible a hoy (como siempre); en Lista, además, restablece Desde/Hasta
  // al rango por defecto alrededor de la fecha actual (el mes calendario que contiene hoy — mismo criterio que
  // usa Mes/el rango inicial de Publicaciones global), en vez de dejar el filtro de fechas donde haya quedado.
  const handleToday = useCallback(() => {
    setAnchorDate(new Date());
    if (view === "list") {
      const days = getMonthGridDays(new Date());
      setDateRange({ from: format(days[0], "yyyy-MM-dd"), to: format(days[days.length - 1], "yyyy-MM-dd") });
    }
  }, [view, setDateRange]);

  const weekDays = useMemo(() => getWeekDays(anchorDate), [anchorDate]);
  const periodLabel = view === "month" ? formatMonthYear(anchorDate) : formatWeekRange(weekDays);
  const agendaDays = useMemo(
    () => (view === "month" ? getMonthGridDays(anchorDate).filter((d) => isSameMonthAs(d, anchorDate)) : weekDays),
    [view, weekDays, anchorDate]
  );

  // Publicaciones (global): Semana/Mes piden el rango que van a necesitar apenas cambia el período visible o la
  // vista — si ya está cubierto por lo cargado, ensureRange no hace nada (ver arriba). Lista no entra acá: su
  // rango lo maneja el efecto de Desde/Hasta, de abajo, independiente del período de Semana/Mes.
  useEffect(() => {
    if (!global || view === "list") return;
    const days = view === "month" ? getMonthGridDays(anchorDate) : weekDays;
    ensureRange(format(days[0], "yyyy-MM-dd"), format(days[days.length - 1], "yyyy-MM-dd"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [global, view, anchorDate]);

  // Publicaciones (global) + Lista: si el usuario fija Desde Y Hasta más allá de lo cargado, se pide ese rango.
  // Con uno solo de los dos (o ninguno), Lista filtra sobre lo que ya está en el cliente, sin pedir nada.
  useEffect(() => {
    if (!global || view !== "list" || !dateFrom || !dateTo) return;
    ensureRange(dateFrom, dateTo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [global, view, dateFrom, dateTo]);

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

  // Publicaciones (global): filtro Cliente, antes que Calendario — así Cliente → Calendario/Cuenta conserva la
  // dependencia existente (las opciones de Calendario/Cuenta más abajo salen de este subconjunto).
  const clientScopedPublications = useMemo(() => {
    if (!global || clientIds.length === 0) return effectivePublications;
    return effectivePublications.filter((p) => clientIds.includes(p.clientId));
  }, [effectivePublications, global, clientIds]);

  const calendarScopedPublications = useMemo(() => {
    if (calendarIds.length === 0) return clientScopedPublications;
    return clientScopedPublications.filter((p) => calendarIds.includes(p.calendarId));
  }, [clientScopedPublications, calendarIds]);

  // Fechas del período visible (semana en Semana, mes real sin días grises en Mes): mismo criterio para las
  // opciones de filtro y para el CSV. Lista ya no usa esto — tiene su propio rango (Desde/Hasta o todo lo cargado).
  const periodDateKeys = useMemo(() => new Set(agendaDays.map((d) => format(d, "yyyy-MM-dd"))), [agendaDays]);

  const filterCatalog = useMemo(
    () => ({
      platforms: lookups.platforms,
      contentTypes: lookups.contentTypes,
      statuses: lookups.statuses,
      clientAccounts,
      campaigns,
    }),
    [lookups, clientAccounts, campaigns]
  );

  // Universo editorial de los filtros: publicaciones de los calendarios/clientes seleccionados, sin importar la
  // fecha ni los filtros de contenido. Solo un cambio de calendarios/clientes (o de datos) invalida una selección.
  const universeOptions = useMemo(
    () => getRelevantFilterOptions(calendarScopedPublications, filterCatalog),
    [calendarScopedPublications, filterCatalog]
  );
  // Opciones relevantes del período visible (semana en Semana/Lista, mes real en Mes), también sin aplicar los
  // filtros de contenido, para que un filtro no reduzca el catálogo de otro.
  const periodOptions = useMemo(
    () =>
      getRelevantFilterOptions(
        calendarScopedPublications.filter((p) => periodDateKeys.has(p.publicationDate)),
        filterCatalog
      ),
    [calendarScopedPublications, periodDateKeys, filterCatalog]
  );

  // Navegar fechas NO borra selecciones: solo se limpian las que ya no existen en el universo de calendarios.
  // `pruneFilters` devuelve la misma referencia si no hay nada que limpiar, así el ajuste de estado durante el
  // render converge en una sola pasada y no genera loops.
  const activeFilters = pruneFilters(filters, universeOptions);
  if (activeFilters !== filters) setFilters(activeFilters);

  // Catálogo mostrado: opciones del período + las ya seleccionadas (aunque en este período no tengan publicaciones).
  const filterOptions = useMemo(
    () => withSelectedOptions(periodOptions, universeOptions, activeFilters),
    [periodOptions, universeOptions, activeFilters]
  );

  const hasActiveFilters =
    activeFilters.platformIds.length > 0 ||
    activeFilters.accountIds.length > 0 ||
    activeFilters.contentTypeIds.length > 0 ||
    activeFilters.statusIds.length > 0 ||
    activeFilters.campaigns.length > 0;

  const filteredPublications = useMemo(() => {
    const query = search.trim().toLowerCase();
    return calendarScopedPublications.filter((p) => {
      if (query && !p.title.toLowerCase().includes(query) && !p.copy.toLowerCase().includes(query)) {
        return false;
      }
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
  }, [calendarScopedPublications, activeFilters, clientAccountMap, search]);

  // Lista: rango propio (Desde/Hasta), independiente del período de Semana/Mes. Sin Desde/Hasta, muestra todo
  // lo ya cargado/filtrado (en el Planner de un cliente eso es su historial completo; en Publicaciones, el
  // rango cargado hasta el momento).
  const listPublications = useMemo(() => {
    if (!dateFrom && !dateTo) return filteredPublications;
    return filteredPublications.filter((p) => {
      if (dateFrom && p.publicationDate < dateFrom) return false;
      if (dateTo && p.publicationDate > dateTo) return false;
      return true;
    });
  }, [filteredPublications, dateFrom, dateTo]);

  // Mobile Lista agrupa por día como el resto de MobileAgendaView — estos son los días con contenido en el
  // rango de Lista (no el período de Semana/Mes).
  const listDays = useMemo(() => {
    const keys = Array.from(new Set(listPublications.map((p) => p.publicationDate))).sort();
    return keys.map((key) => new Date(`${key}T00:00:00`));
  }, [listPublications]);

  // Exporta lo que el usuario está viendo: mismas publicaciones (calendarios + filtros) y mismo período
  // (agendaDays: semana en Semana/Lista, mes en Mes). No hay query ni lógica de filtros aparte. Solo el Planner
  // de un cliente lo ofrece (ver canCreateOrExport) — Publicaciones no lo tenía antes tampoco.
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
    setFormState({
      open: true,
      publication: undefined,
      defaultDate: day ? format(day, "yyyy-MM-dd") : undefined,
      clientId: client.id,
    });
  }

  function openEditForm(publication: Publication) {
    setSelectedPublication(null);
    setFormKey((k) => k + 1);
    setFormState({ open: true, publication, clientId: publication.clientId });
  }

  function openDuplicateForm(publication: Publication) {
    setSelectedPublication(null);
    setFormKey((k) => k + 1);
    setFormState({ open: true, duplicateFrom: publication, clientId: publication.clientId });
  }

  // Publicaciones (global): el formulario de editar/duplicar necesita los calendarios/cuentas/campañas del
  // cliente DUEÑO de esa publicación puntual, no de todos los clientes — se filtran del catálogo global acá.
  const formCalendars = isGlobal ? calendars.filter((c) => c.clientId === formState.clientId) : calendars;
  const formClientAccounts = isGlobal ? clientAccounts.filter((a) => a.clientId === formState.clientId) : clientAccounts;
  const formCampaigns = isGlobal ? campaigns.filter((c) => c.clientId === formState.clientId) : campaigns;

  // El parámetro solo vive mientras el drawer abierto por el link esté abierto: al cerrarlo (o al pasar a
  // editar/duplicar) se limpia de la URL para que recargar o copiar la barra no vuelva a abrirlo. Si el id no
  // existe o no es accesible, se avisa una sola vez y también se limpia. History API nativa (no router.replace):
  // cerrar el drawer no debe volver a pedir el planner entero, igual que el cambio de vista de arriba.
  useEffect(() => {
    if (selectedPublication || !searchParams.has("publication")) return;
    if (missingSharedPublication.current) {
      missingSharedPublication.current = false;
      // Un tick después: el Toaster (padre) se suscribe al manager en un efecto que corre después de los de sus
      // hijos, así que un toast emitido en el primer commit se perdería. Sin cleanup a propósito (StrictMode).
      setTimeout(
        () => toast.error("No pudimos abrir la publicación", "Puede que se haya eliminado o que no tengas acceso a ella."),
        0
      );
    }
    replaceSearchParams(pathname, searchParams, { publication: null });
  }, [selectedPublication, searchParams, pathname]);

  usePlannerShortcuts({
    overlayOpen: formState.open || selectedPublication !== null,
    onNewPublication: canCreateOrExport ? () => openCreateForm() : undefined,
    onPrevWeek: () => setAnchorDate((d) => (view === "month" ? addMonths(d, -1) : addWeeks(d, -1))),
    onNextWeek: () => setAnchorDate((d) => (view === "month" ? addMonths(d, 1) : addWeeks(d, 1))),
  });

  // Cada card resuelve su propio cliente: en el Planner de un cliente es siempre el mismo; en Publicaciones
  // (global) cada publicación puede ser de uno distinto. Misma función para Semana/Mes/Lista y mobile.
  const getClientId = global ? (p: Publication) => p.clientId : () => client.id;

  if (calendars.length === 0) {
    return (
      <LookupsProvider {...lookups} calendars={calendars} clientAccounts={clientAccounts} campaigns={campaigns} clients={global?.clients ?? [client]}>
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
                : isGlobal
                  ? "Todavía no hay calendarios."
                  : "Este cliente todavía no tiene calendarios. Creá el primero desde su ficha."}
            </p>
            {!readOnly && !isGlobal && (
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
    <LookupsProvider {...lookups} calendars={calendars} clientAccounts={clientAccounts} campaigns={campaigns} clients={global?.clients ?? [client]}>
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
          onToday={handleToday}
          onCreate={canCreateOrExport ? () => openCreateForm() : undefined}
          onExport={canCreateOrExport ? handleExportCsv : undefined}
          allClients={allClients}
          onSwitchClient={allClients ? handleSwitchClient : undefined}
          dateRange={view === "list" ? { from: dateFrom, to: dateTo } : undefined}
          onDateRangeChange={view === "list" ? setDateRange : undefined}
          mobileFilters={
            showMobileViews ? (
              <MobileFilters
                value={activeFilters}
                onChange={setFilters}
                options={filterOptions}
                calendarIds={calendarIds}
                onCalendarIdsChange={setCalendarIds}
                clientIds={global ? clientIds : undefined}
                onClientIdsChange={global ? setClientIds : undefined}
              />
            ) : undefined
          }
        />
        {/* Mobile únicamente: el buscador vive en su propia fila, siempre visible (no forzarlo dentro del sheet
            de Filtros). En desktop es el primer control de CalendarFiltersBar — ver más abajo. */}
        <div className="flex items-center gap-2 border-b border-border bg-background px-4 py-2 md:hidden">
          <PublicationSearchBox value={search} onChange={setSearch} />
          {isLoadingRange && <span className="text-xs text-muted-foreground">Cargando más publicaciones…</span>}
        </div>
        {/* Desktop: barra de filtros inline (con el buscador como primer control). Mobile: botón "Filtros" en la
            cabecera (sin fila propia). */}
        {showDesktopViews && (
          <CalendarFiltersBar
            value={activeFilters}
            onChange={setFilters}
            options={filterOptions}
            calendarIds={calendarIds}
            onCalendarIdsChange={setCalendarIds}
            clientIds={global ? clientIds : undefined}
            onClientIdsChange={global ? setClientIds : undefined}
            search={search}
            onSearchChange={setSearch}
            searchLoading={isLoadingRange}
          />
        )}
        {hasActiveFilters && filteredPublications.length === 0 && (
          <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-6 py-2 text-sm text-muted-foreground">
            No hay publicaciones que coincidan con los filtros actuales.
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" onClick={() => setFilters(EMPTY_FILTERS)}>
              <X />
              Limpiar filtros
            </Button>
          </div>
        )}
        {showDesktopViews && (
          // `min-h-0` solo en Mes: sin eso, un flex item se niega a encoger por debajo de la altura de su
          // contenido y termina desbordando `main` (scroll de página) — es lo que MonthView necesita para
          // ajustarse al alto disponible y manejar el sobrante con scroll interno por día. Semana y Lista se
          // dejan con su comportamiento actual (pueden crecer más que el viewport y scrollear la página).
          <div className={cn("hidden flex-1 flex-col md:flex", view === "month" && "min-h-0")}>
            {view === "week" ? (
              <WeekView
                weekDays={weekDays}
                publications={filteredPublications}
                onOpenPublication={setSelectedPublication}
                onEditPublication={canManage ? openEditForm : undefined}
                onDuplicatePublication={canManage ? openDuplicateForm : undefined}
                getClientId={getClientId}
                showClient={isGlobal}
                onCreateForDay={canCreateOrExport ? openCreateForm : undefined}
                clientColor={client.color}
                showCalendarLabel={showCalendarLabel}
              />
            ) : view === "month" ? (
              <MonthView
                anchorDate={anchorDate}
                publications={filteredPublications}
                onOpenPublication={setSelectedPublication}
                onEditPublication={canManage ? openEditForm : undefined}
                onDuplicatePublication={canManage ? openDuplicateForm : undefined}
                getClientId={getClientId}
                showClient={isGlobal}
                onCreateForDay={canCreateOrExport ? openCreateForm : undefined}
                clientColor={client.color}
                showCalendarLabel={showCalendarLabel}
              />
            ) : (
              <AgendaListView
                publications={listPublications}
                onOpenPublication={setSelectedPublication}
                onEditPublication={canManage ? openEditForm : undefined}
                onDuplicatePublication={canManage ? openDuplicateForm : undefined}
                getClientId={getClientId}
                showClient={isGlobal}
                showCalendarLabel={showCalendarLabel}
              />
            )}
          </div>
        )}
        {showMobileViews && (
          <div className="flex flex-1 flex-col md:hidden">
            {view === "month" ? (
              <MobileMonthView
                anchorDate={anchorDate}
                publications={filteredPublications}
                onOpenPublication={setSelectedPublication}
                onEditPublication={canManage ? openEditForm : undefined}
                onDuplicatePublication={canManage ? openDuplicateForm : undefined}
                getClientId={getClientId}
                showClient={isGlobal}
                onCreateForDay={canCreateOrExport ? openCreateForm : undefined}
                showCalendarLabel={showCalendarLabel}
              />
            ) : (
              <MobileAgendaView
                mode={view === "list" ? "list" : "week"}
                days={view === "list" ? listDays : agendaDays}
                publications={view === "list" ? listPublications : filteredPublications}
                onOpenPublication={setSelectedPublication}
                onEditPublication={canManage ? openEditForm : undefined}
                onDuplicatePublication={canManage ? openDuplicateForm : undefined}
                getClientId={getClientId}
                showClient={isGlobal}
                onCreateForDay={view === "list" || !canCreateOrExport ? undefined : openCreateForm}
                showCalendarLabel={showCalendarLabel}
              />
            )}
          </div>
        )}
        <PublicationDrawer
          publication={selectedPublication}
          onOpenChange={(open) => !open && setSelectedPublication(null)}
          onEdit={canManage ? openEditForm : undefined}
          onDuplicate={canManage ? openDuplicateForm : undefined}
        />
        {canManage && (
          <PublicationForm
            key={formKey}
            open={formState.open}
            onOpenChange={(open) => setFormState((prev) => ({ ...prev, open }))}
            clientId={formState.clientId}
            calendars={formCalendars}
            clientAccounts={formClientAccounts}
            campaigns={formCampaigns}
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
