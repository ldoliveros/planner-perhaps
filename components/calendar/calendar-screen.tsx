"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { addDays, addMonths, addWeeks, format } from "date-fns";
import { CalendarDays, Loader2, X } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { CalendarHeader, type CalendarGridView, type CalendarView, type SpaceOption } from "@/components/calendar/calendar-header";
import { BoardView } from "@/components/calendar/board-view";
import { PublicationSearchDialog } from "@/components/search/publication-search-dialog";
import {
  ActiveFilterChips,
  FiltersMenu,
  SearchButton,
  EMPTY_FILTERS,
  MobileFilters,
  type CalendarFiltersState,
  type DateRangeValue,
} from "@/components/calendar/calendar-filters";
import { WeekView } from "@/components/calendar/week-view";
import { DayView } from "@/components/calendar/day-view";
import { MonthView } from "@/components/calendar/month-view";
import { AgendaListView } from "@/components/calendar/agenda-list-view";
import { MobileAgendaView } from "@/components/calendar/mobile-agenda-view";
import { MobileMonthView } from "@/components/calendar/mobile-month-view";
import { PublicationView, type PublicationViewTab } from "@/components/publication/publication-view";
import { PublicationPatchProvider } from "@/components/calendar/publication-patch-context";
import { PublicationClientPicker } from "@/components/calendar/publication-client-picker";
import { LookupsProvider } from "@/components/providers/lookups-provider";
import {
  formatFullDateFromDate,
  formatMonthYear,
  formatWeekRange,
  getMonthGridDays,
  getWeekDays,
  isSameMonthAs,
} from "@/lib/date-utils";
import { usePlannerShortcuts } from "@/lib/use-planner-shortcuts";
import { useMediaQuery } from "@/lib/use-media-query";
import { buildPlannerCsv, downloadCsv } from "@/lib/planner-csv";
import { getRelevantFilterOptions, pruneFilters, withSelectedOptions } from "@/lib/planner-filter-options";
import { replaceSearchParams } from "@/lib/history-search-params";
import {
  CAL_GRID_FRAME,
  CAL_WORKSPACE_BG,
  GLOBAL_CALENDAR_THEME,
  calendarThemeFromColor,
  calendarThemeStyle,
} from "@/lib/calendar-surface";
import { slugify } from "@/lib/slugify";
import { toast } from "@/lib/toast";
import {
  archivePublication,
  deletePublication,
  fetchArchivedPublications,
  fetchPublicationsInRange,
  restorePublication,
} from "@/lib/actions/publications";
import { PublicationArchiveProvider } from "@/components/calendar/publication-archive-context";
import { ArchivedPublicationsSheet } from "@/components/calendar/archived-publications-sheet";
import { fetchPublicationForView } from "@/lib/actions/editorial-flow";
import { usePublicationsLive } from "@/lib/use-publications-live";
import type { Lookups } from "@/lib/supabase/queries";
import type { Calendar, Campaign, Client, ClientAccount, ClientMember, Publication } from "@/types";

/**
 * "Cliente" sintético para el header en Publicaciones (calendario global): CalendarHeader, WeekView y MonthView
 * ya reciben un `Client` (nombre, logo, color) para su identidad visual — reutilizarlos tal cual con este
 * objeto evita bifurcar esos componentes solo para el caso "no hay un único cliente". El gris es neutro a
 * propósito (spec: nada de un color por-cliente como sistema principal de identificación acá).
 */
const GLOBAL_BRAND: Client = {
  id: "__global__",
  name: "Todos los calendarios / clientes",
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
  /** Solo admin (Planner de un cliente): espacios a los que se puede cambiar desde el selector del encabezado. */
  allClients?: SpaceOption[];
  /** Solo Planner de cliente (nunca se pasa desde Publicaciones global): integrantes con acceso a
   * este cliente, para el AvatarStack del header. */
  members?: ClientMember[];
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

/**
 * v1.6 — Lista navega por meses (como Mes): ← Hoy → + selector de mes. El rango personalizado Desde/Hasta queda
 * implementado pero oculto mientras se prueba la experiencia simplificada; poner `true` lo reactiva tal cual
 * (controles en el encabezado, filtro de Lista por Desde/Hasta y su carga de datos). Con `false`, un `from`
 * entrante (enlaces del Escritorio, que siempre mandan un mes completo) fija el mes de Lista y se reemplaza por
 * `?date=` en la URL.
 */
const LIST_CUSTOM_RANGE_ENABLED = false;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Fecha local de un "YYYY-MM-DD" válido del query string; null si no es una fecha válida. */
function dateFromParam(value: string | null): Date | null {
  if (!value || !ISO_DATE.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** ?tab= del deep-link (v1.6): solo "comments" cambia la pestaña inicial; cualquier otro valor abre la primera. */
function tabFromParam(value: string | null): PublicationViewTab {
  return value === "comments" ? "comments" : "main";
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
  members,
  global,
}: CalendarScreenProps) {
  const isGlobal = Boolean(global);
  // GLOBAL_BRAND es un Client válido (nombre/logo/color) — el resto del archivo sigue usando `client.X` sin
  // bifurcar, tanto para el header como para el acento de fin de semana en Semana/Mes.
  const client = global ? GLOBAL_BRAND : clientProp!;
  const canManage = !readOnly;
  // Crear ahora también está disponible en Publicaciones global para staff (ver el modo
  // create de PublicationView, con un selector de cliente previo — Publicaciones no tiene uno fijo).
  // Exportar CSV: staff, en el Planner de un cliente y (v1.6) también en el calendario global ("Ver todos"), en el
  // menú ••• del encabezado. Misma función de exportación en los dos contextos.
  const canCreatePublication = canManage;
  const canExport = canManage;

  const clientAccountMap = useMemo(() => new Map(clientAccounts.map((a) => [a.id, a])), [clientAccounts]);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();


  // v1.6: el calendario global abre por defecto en Mes (modo Calendario); el Planner de un cliente, en Semana. Un
  // `?view=` explícito (incl. `?view=list`, p. ej. los enlaces del Escritorio) siempre gana — solo la AUSENCIA del
  // param resuelve por contexto.
  // Puramente derivado del prop `global` + los searchParams ya disponibles en el primer render: no dispara
  // ningún efecto ni fetch adicional para fijar este default.
  const defaultView: CalendarView = isGlobal ? "month" : "week";
  const defaultCalendarView: CalendarGridView = isGlobal ? "month" : "week";
  const rawView = searchParams.get("view");
  const view: CalendarView =
    rawView === "day" || rawView === "month" || rawView === "list" || rawView === "week" || rawView === "board"
      ? rawView
      : defaultView;

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

  // Desde/Hasta (rango personalizado de Lista): solo se usan con LIST_CUSTOM_RANGE_ENABLED. Con Lista por meses, un
  // `from` entrante solo fija el mes inicial (ver anchorDate).
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

  // Solo Publicaciones (global): publicaciones cargadas hasta ahora + el rango que cubren. Arranca con lo que
  // trajo el Server Component (initialRange) y crece bajo demanda (ensureRange) — nunca "todo el histórico".
  const [globalPublications, setGlobalPublications] = useState(publications);
  const [loadedRange, setLoadedRange] = useState(global?.initialRange ?? null);
  // React 19: pasarle una función async a startTransition hace que `isLoadingRange` quede en `true` durante
  // todo el fetch (no solo la porción síncrona) — sin necesidad de un setState manual antes/después, que el
  // linter de efectos marca como anti-patrón al dispararse desde el useEffect de más abajo.
  const [isLoadingRange, startRangeTransition] = useTransition();
  // Planner de un cliente (v1.6): copia local de lo que trae el Server Component, para aplicar los cambios en vivo
  // de otras sesiones (usePublicationsLive). Cuando el servidor manda una lista nueva (router.refresh tras un guardado
  // propio), vuelve a mandar: ajuste durante el render, sin efecto.
  const [plannerPublications, setPlannerPublications] = useState(publications);
  const [lastPublicationsProp, setLastPublicationsProp] = useState(publications);
  if (!global && publications !== lastPublicationsProp) {
    setLastPublicationsProp(publications);
    setPlannerPublications(publications);
  }
  const effectivePublications = global ? globalPublications : plannerPublications;

  // Publicaciones (global): PublicationView informa Crear/Duplicar/Editar/Eliminar apenas savePublication
  // resuelve — parchea globalPublications directo (upsert/remove por id), sin esperar a que
  // router.refresh() vuelva a renderizar el Server Component (ese refresh solo trae `publications` para el
  // rango fijo "mes actual" de la página, nunca el rango que el usuario haya navegado/expandido acá).
  const upsertGlobalPublication = useCallback((publication: Publication) => {
    setGlobalPublications((prev) => {
      const index = prev.findIndex((p) => p.id === publication.id);
      if (index === -1) return [...prev, publication];
      const next = [...prev];
      next[index] = publication;
      return next;
    });
  }, []);
  const removeGlobalPublication = useCallback((publicationId: string) => {
    setGlobalPublications((prev) => prev.filter((p) => p.id !== publicationId));
  }, []);
  // En vivo (v1.6): misma operación para el calendario global y el Planner de un cliente.
  const setLivePublications = global ? setGlobalPublications : setPlannerPublications;
  const upsertLivePublication = useCallback(
    (publication: Publication) =>
      setLivePublications((prev) => {
        const index = prev.findIndex((p) => p.id === publication.id);
        if (index === -1) return [...prev, publication];
        const next = [...prev];
        next[index] = publication;
        return next;
      }),
    [setLivePublications]
  );
  const removeLivePublication = useCallback(
    (publicationId: string) =>
      setLivePublications((prev) => (prev.some((p) => p.id === publicationId) ? prev.filter((p) => p.id !== publicationId) : prev)),
    [setLivePublications]
  );
  // Cambiar estado / Cambiar fecha / drag & drop: parche parcial por id, vía PublicationPatchProvider (ver abajo).
  const patchGlobalPublication = useCallback((publicationId: string, patch: Partial<Publication>) => {
    setGlobalPublications((prev) => prev.map((p) => (p.id === publicationId ? { ...p, ...patch } : p)));
  }, []);

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

  // Deep-link (Compartir, vía /p/<id>): ?publication=<id> abre la Vista de Publicación directo al montar (lectura
  // única — no reacciona a cambios posteriores del param). `publications` ya viene filtrada por RLS, así que un id
  // ajeno o inexistente simplemente no aparece: no se muestra nada y se avisa (ver el efecto de abajo).
  // ?duplicate=<id> (link legacy): misma lectura única, abre la Vista en modo duplicar. Solo staff — para
  // Client User se ignora (el efecto de abajo lo limpia sin avisar) — y si llega junto a ?publication=, gana
  // ?publication=.
  const [shared] = useState(() => {
    const id = searchParams.get("publication");
    const duplicateId = !id && canManage ? searchParams.get("duplicate") : null;
    return {
      id,
      publication: id ? (effectivePublications.find((p) => p.id === id) ?? null) : null,
      // v1.6: ?tab=comments (abrir desde una notificación) abre la Vista en Comentarios.
      tab: tabFromParam(searchParams.get("tab")),
      duplicateId,
      duplicateFrom: duplicateId ? (effectivePublications.find((p) => p.id === duplicateId) ?? null) : null,
    };
  });
  // Fecha de referencia del período visible. Prioridad: publicación del deep-link → ?date= (v1.6, persiste la
  // navegación) → mes de ?from= en Lista (enlaces del Escritorio) → hoy. El efecto de sincronización de abajo la
  // refleja en ?date=.
  const [anchorDate, setAnchorDate] = useState(() => {
    if (shared.publication) return new Date(`${shared.publication.publicationDate}T00:00:00`);
    const fromDate = dateFromParam(searchParams.get("date"));
    if (fromDate) return fromDate;
    const listFrom = !LIST_CUSTOM_RANGE_ENABLED && view === "list" ? dateFromParam(searchParams.get("from")) : null;
    return listFrom ?? new Date();
  });
  // v1.6: ?status=<key>[,<key>…] (enlaces del dashboard de Inicio) arranca con esos estados en el filtro Estado de
  // siempre (varios = el KPI "Publicaciones", que excluye las descartadas). Lectura única al montar; el efecto de abajo
  // lo saca de la URL (el filtro no se refleja en la URL). Claves desconocidas se ignoran.
  const [filters, setFilters] = useState<CalendarFiltersState>(() => {
    const keys = (searchParams.get("status") ?? "").split(",").filter(Boolean);
    const statusIds = lookups.statuses.filter((s) => keys.includes(s.key)).map((s) => s.id);
    return statusIds.length > 0 ? { ...EMPTY_FILTERS, statusIds } : EMPTY_FILTERS;
  });
  const missingSharedPublication = useRef(
    (Boolean(shared.id) && !shared.publication) || (Boolean(shared.duplicateId) && !shared.duplicateFrom)
  );
  // Vista de Publicación integrada: staff (Editar/Duplicar/Crear), tanto en Publicaciones global como en el
  // Planner de un cliente. Client User (readOnly) también la abre al hacer click, pero en modo solo lectura
  // (ver handleOpenPublication), igual que el deep-link ?publication= (staff editable, Client User read-only).
  // Editar: { publication }. Duplicar: { duplicateFrom }. Crear: ninguno de los dos — PublicationView
  // deriva su modo de cuál de las dos props llega.
  // Eliminaciones hechas desde ESTA sesión (Vista de Publicación): su evento en vivo no debe avisar "otro usuario".
  const selfDeletedIds = useRef<Set<string>>(new Set());
  const [viewState, setViewState] = useState<{
    publication?: Publication;
    duplicateFrom?: Publication;
    clientId: string;
    defaultDate?: string;
    /** Pestaña inicial de la Vista (desde el calendario: la primera). */
    tab?: PublicationViewTab;
  } | null>(() => {
    if (shared.publication) return { publication: shared.publication, clientId: shared.publication.clientId, tab: shared.tab };
    if (shared.duplicateFrom) return { duplicateFrom: shared.duplicateFrom, clientId: shared.duplicateFrom.clientId };
    return null;
  });
  // Se incrementa en cada apertura (mismo rol que key={publication.id} antes): fuerza remontar
  // PublicationView para que su estado "original" de dirty-check arranque limpio en cada target nuevo,
  // incluida Crear, que no tiene un id propio del cual derivar una key.
  const [viewKey, setViewKey] = useState(0);
  function openPublicationView(publication: Publication, tab: PublicationViewTab) {
    setViewKey((k) => k + 1);
    setViewState({ publication, clientId: publication.clientId, tab });
  }
  function handleOpenPublication(publication: Publication) {
    openPublicationView(publication, "main");
  }

  // v1.6 — ?publication=<id> que llega con el Planner YA montado (abrir una notificación o un link /p/<id>
  // estando en este mismo Planner): `shared` solo se lee al montar, así que sin esto no se abriría nada. Se
  // ajusta durante el render (patrón de React). Si ya hay una Vista de Publicación abierta no se reemplaza (podría
  // tener cambios sin guardar); el efecto de abajo limpia el parámetro igual.
  const publicationParam = searchParams.get("publication");
  const [lastPublicationParam, setLastPublicationParam] = useState<string | null>(publicationParam);
  if (publicationParam !== lastPublicationParam) {
    setLastPublicationParam(publicationParam);
    const target = publicationParam ? effectivePublications.find((p) => p.id === publicationParam) : undefined;
    if (target && viewState === null) {
      setAnchorDate(new Date(`${target.publicationDate}T00:00:00`));
      openPublicationView(target, tabFromParam(searchParams.get("tab")));
    }
  }
  // Publicaciones (global): "Nueva publicación" no tiene un cliente fijo de antemano (a diferencia de
  // Editar/Duplicar, que lo resuelven de la publicación de origen) — este selector previo lo resuelve
  // antes de abrir PublicationView en modo create (ver openCreateForm/handleClientPicked abajo).
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  // v1.6: búsqueda global en un modal (lupa del encabezado); hereda el espacio que se está viendo.
  const [searchOpen, setSearchOpen] = useState(false);
  const [pendingCreateDate, setPendingCreateDate] = useState<string | undefined>(undefined);
  function handleClientPicked(pickedClientId: string) {
    setClientPickerOpen(false);
    setViewKey((k) => k + 1);
    setViewState({ clientId: pickedClientId, defaultDate: pendingCreateDate });
    setPendingCreateDate(undefined);
  }

  // "Hoy": en Semana/Mes lleva el período visible a hoy (como siempre); en Lista, además, restablece Desde/Hasta
  // al rango por defecto alrededor de la fecha actual (el mes calendario que contiene hoy — mismo criterio que
  // usa Mes/el rango inicial de Publicaciones global), en vez de dejar el filtro de fechas donde haya quedado.
  const handleToday = useCallback(() => {
    setAnchorDate(new Date());
    if (LIST_CUSTOM_RANGE_ENABLED && view === "list") {
      const days = getMonthGridDays(new Date());
      setDateRange({ from: format(days[0], "yyyy-MM-dd"), to: format(days[days.length - 1], "yyyy-MM-dd") });
    }
  }, [view, setDateRange]);

  // ← / → y los atajos de teclado avanzan un período de la vista: un día, una semana o un mes (Mes y Lista).
  const stepPeriod = useCallback(
    (delta: number) =>
      setAnchorDate((d) => (view === "day" ? addDays(d, delta) : view === "week" ? addWeeks(d, delta) : addMonths(d, delta))),
    [view]
  );

  const weekDays = useMemo(() => getWeekDays(anchorDate), [anchorDate]);
  const periodLabel =
    view === "day" ? formatFullDateFromDate(anchorDate) : view === "week" ? formatWeekRange(weekDays) : formatMonthYear(anchorDate);
  // Días del período visible: el día (Día), la semana (Semana) o el mes real sin días grises (Mes y Lista).
  const agendaDays = useMemo(
    () =>
      view === "day"
        ? [anchorDate]
        : view === "week"
          ? weekDays
          : getMonthGridDays(anchorDate).filter((d) => isSameMonthAs(d, anchorDate)),
    [view, weekDays, anchorDate]
  );

  // Publicaciones (global): cada vista pide el rango que va a necesitar apenas cambia el período visible o la vista
  // (Día, Semana, la grilla de Mes o el mes de Lista) — si ya está cubierto por lo cargado, ensureRange no hace nada
  // (ver arriba). Lista con rango personalizado (LIST_CUSTOM_RANGE_ENABLED) lo maneja el efecto de Desde/Hasta.
  useEffect(() => {
    if (!global || (LIST_CUSTOM_RANGE_ENABLED && view === "list")) return;
    const days = view === "month" ? getMonthGridDays(anchorDate) : agendaDays;
    ensureRange(format(days[0], "yyyy-MM-dd"), format(days[days.length - 1], "yyyy-MM-dd"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [global, view, anchorDate]);

  // Publicaciones (global) + Lista: si el usuario fija Desde Y Hasta más allá de lo cargado, se pide ese rango.
  // Con uno solo de los dos (o ninguno), Lista filtra sobre lo que ya está en el cliente, sin pedir nada.
  useEffect(() => {
    if (!LIST_CUSTOM_RANGE_ENABLED || !global || view !== "list" || !dateFrom || !dateTo) return;
    ensureRange(dateFrom, dateTo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [global, view, dateFrom, dateTo]);

  const visibleCalendars = calendarIds.length > 0 ? calendars.filter((c) => calendarIds.includes(c.id)) : calendars;
  const showCalendarLabel = visibleCalendars.length > 1;
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

  // Fechas del período visible (día, semana o mes real sin días grises en Mes y Lista): mismo criterio para las
  // opciones de filtro, para Lista y para el CSV.
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

  // Lista: el mes visible. Con LIST_CUSTOM_RANGE_ENABLED, su rango propio Desde/Hasta (sin rango, todo lo
  // cargado/filtrado: en el Planner de un cliente su historial completo; en Publicaciones, lo cargado).
  const listPublications = useMemo(() => {
    // v1.6: Lista = el mes visible (mismos días que Mes). Rango personalizado solo con LIST_CUSTOM_RANGE_ENABLED.
    if (!LIST_CUSTOM_RANGE_ENABLED) return filteredPublications.filter((p) => periodDateKeys.has(p.publicationDate));
    if (!dateFrom && !dateTo) return filteredPublications;
    return filteredPublications.filter((p) => {
      if (dateFrom && p.publicationDate < dateFrom) return false;
      if (dateTo && p.publicationDate > dateTo) return false;
      return true;
    });
  }, [filteredPublications, dateFrom, dateTo, periodDateKeys]);

  // Tablero (v1.6): siempre el mes visible (mismos días que Mes), con los mismos filtros; sin rango personalizado.
  const boardPublications = useMemo(
    () => filteredPublications.filter((p) => periodDateKeys.has(p.publicationDate)),
    [filteredPublications, periodDateKeys]
  );

  // Mobile Lista agrupa por día como el resto de MobileAgendaView — estos son los días con contenido en el
  // rango de Lista (no el período de Semana/Mes).
  const listDays = useMemo(() => {
    const keys = Array.from(new Set(listPublications.map((p) => p.publicationDate))).sort();
    return keys.map((key) => new Date(`${key}T00:00:00`));
  }, [listPublications]);

  // Exporta lo que el usuario está viendo: mismas publicaciones (calendarios + filtros) y mismo período
  // (agendaDays: el día, la semana o el mes). No hay query ni lógica de filtros aparte. Solo staff (ver canExport).
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

  function openCreateForm(day?: Date) {
    const defaultDateStr = day ? format(day, "yyyy-MM-dd") : undefined;
    // Planner de un cliente: el cliente ya está fijo, sin selector previo.
    if (!isGlobal) {
      setViewKey((k) => k + 1);
      setViewState({ clientId: client.id, defaultDate: defaultDateStr });
      return;
    }
    // Publicaciones (global): sin cliente fijo — con exactamente 1 cliente accesible no hace falta
    // preguntar; si hay más, se resuelve con el selector (ver handleClientPicked).
    const accessibleClients = global?.clients ?? [];
    if (accessibleClients.length === 1) {
      setViewKey((k) => k + 1);
      setViewState({ clientId: accessibleClients[0].id, defaultDate: defaultDateStr });
      return;
    }
    setPendingCreateDate(defaultDateStr);
    setClientPickerOpen(true);
  }

  function openEditForm(publication: Publication) {
    setViewKey((k) => k + 1);
    setViewState({ publication, clientId: publication.clientId });
  }

  function openDuplicateForm(publication: Publication) {
    setViewKey((k) => k + 1);
    setViewState({ duplicateFrom: publication, clientId: publication.clientId });
  }

  // Publicaciones (global): la Vista de Publicación necesita los calendarios/cuentas/campañas del cliente
  // DUEÑO de esa publicación puntual, no de todos los clientes — se filtran del catálogo global acá (en el
  // Planner de un cliente todo ya es de ese cliente, así que el filtro es inocuo):
  // el cliente sale de `publication`/`duplicateFrom` en Editar/Duplicar, o del clientId ya resuelto por el
  // selector previo en Crear — en los 3 casos `viewState.clientId` ya llega determinado.
  const viewCalendars = calendars.filter((c) => c.clientId === viewState?.clientId);
  const viewClientAccounts = clientAccounts.filter((a) => a.clientId === viewState?.clientId);
  const viewCampaigns = campaigns.filter((c) => c.clientId === viewState?.clientId);
  // CASO 1: un solo calendario activo del cliente elegido -> se precarga. CASO 2: varios o ninguno -> la
  // vista pide elegir.
  const viewActiveCalendars = viewCalendars.filter((c) => c.status !== "archived");
  const viewDefaultCalendarId = viewActiveCalendars.length === 1 ? viewActiveCalendars[0].id : undefined;

  // El parámetro se consume al montar: si abrió la Vista de Publicación, se limpia de la URL enseguida para que
  // recargar o copiar la barra no vuelva a abrirla. Si el id no existe o no es accesible, se avisa una sola vez y
  // también se limpia. History API nativa (no router.replace): no debe volver a pedir el planner entero, igual
  // que el cambio de vista de arriba. ?duplicate= sigue el mismo camino; para Client User se limpia sin avisar
  // (nunca se intentó abrir, ver `shared`).
  useEffect(() => {
    if (!searchParams.has("publication") && !searchParams.has("duplicate")) return;
    const requestedId = searchParams.get("publication");
    const missingLater = Boolean(requestedId && !effectivePublications.some((p) => p.id === requestedId));
    if (missingSharedPublication.current || missingLater) {
      missingSharedPublication.current = false;
      // Un tick después: el Toaster (padre) se suscribe al manager en un efecto que corre después de los de sus
      // hijos, así que un toast emitido en el primer commit se perdería. Sin cleanup a propósito (StrictMode).
      setTimeout(
        () => toast.error("No pudimos abrir la publicación", "Puede que se haya eliminado o que no tengas acceso a ella."),
        0
      );
    }
    // Link que llega con OTRA publicación abierta (no se reemplaza para no perder cambios sin guardar): se avisa.
    // Desde la campanita/toast no pasa por acá: lo resuelve la propia vista (ver OpenPublicationHandle).
    else if (requestedId && viewState?.publication && viewState.publication.id !== requestedId) {
      setTimeout(() => toast.info("Hay una publicación abierta", "Cerrala para ver la que pediste."), 0);
    }
    replaceSearchParams(pathname, searchParams, { publication: null, duplicate: null, tab: null });
    // viewState se lee solo para elegir el aviso; no debe re-disparar el efecto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, pathname, effectivePublications]);

  useEffect(() => {
    if (searchParams.has("status")) replaceSearchParams(pathname, searchParams, { status: null });
  }, [searchParams, pathname]);

  // v1.6: ?date= refleja la fecha de referencia (sin el param = hoy), así la navegación sobrevive a recargas y
  // enlaces. Con Lista por meses, un from/to entrante ya se usó para fijar el mes y se quita de la URL. Último
  // efecto que toca la URL: parte de la URL vigente (no del snapshot de searchParams) para no pisar lo que otros
  // efectos del mismo commit ya escribieron.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const anchorKey = format(anchorDate, "yyyy-MM-dd");
    const wantedDate = anchorKey === format(new Date(), "yyyy-MM-dd") ? null : anchorKey;
    const updates: Record<string, string | null> = {};
    if (params.get("date") !== wantedDate) updates.date = wantedDate;
    if (!LIST_CUSTOM_RANGE_ENABLED && (params.has("from") || params.has("to"))) {
      updates.from = null;
      updates.to = null;
    }
    if (Object.keys(updates).length > 0) replaceSearchParams(pathname, params, updates);
  }, [anchorDate, pathname, searchParams]);

  // v1.6 — Selector de espacio: la RUTA es la única fuente de verdad del contexto ("Todos los espacios" =
  // /admin/publications; un cliente = su Planner). Cambiar de espacio navega conservando la vista y la fecha;
  // los filtros (Calendario, Estado, etc.) son propios de cada contexto y no viajan. Solo staff: el portal Client
  // User no recibe opciones. Global → solo clientes activos; Planner → los que arma su página (activos + el actual).
  const spaceOptions: SpaceOption[] | undefined = readOnly
    ? undefined
    : global
      ? global.clients.filter((c) => c.active)
      : allClients;
  const navigateToSpace = (clientId: string | null) => {
    const params = new URLSearchParams();
    params.set("view", view);
    const anchorKey = format(anchorDate, "yyyy-MM-dd");
    if (anchorKey !== format(new Date(), "yyyy-MM-dd")) params.set("date", anchorKey);
    const base = clientId ? `/admin/clients/${clientId}/planner` : "/admin/publications";
    router.push(`${base}?${params.toString()}`);
  };

  // ---- Archivados (v1.6, solo staff) ----
  // Lista de archivadas del contexto (un cliente o, en "Ver todos", los que gestiona el usuario). Se carga al montar
  // para mostrar "Publicaciones archivadas (N)"; `archiveAvailable` es false si la migración no está aplicada (la
  // acción no se ofrece). Archivar / restaurar / eliminar desde esta sesión actualizan las dos listas al instante;
  // lo de otras sesiones llega por los avisos en vivo (abajo).
  const [archivedList, setArchivedList] = useState<Publication[] | null>(null);
  const [archiveAvailable, setArchiveAvailable] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const selfArchivedIds = useRef<Set<string>>(new Set());
  // Publicación abierta en la Vista de Publicación (para cerrarla si se archiva/elimina).
  const openPublicationIdRef = useRef<string | null>(null);
  useEffect(() => {
    openPublicationIdRef.current = viewState?.publication?.id ?? null;
  });
  useEffect(() => {
    if (!canManage) return;
    let cancelled = false;
    fetchArchivedPublications(global ? null : client.id)
      .then((result) => {
        if (cancelled) return;
        setArchiveAvailable(result.available);
        setArchivedList(result.publications);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // Una vez por contexto (cliente o global).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, global ? "global" : client.id]);

  const upsertArchived = useCallback(
    (publication: Publication) =>
      setArchivedList((prev) => [publication, ...(prev ?? []).filter((p) => p.id !== publication.id)]),
    []
  );
  const removeArchived = useCallback(
    (publicationId: string) => setArchivedList((prev) => (prev ? prev.filter((p) => p.id !== publicationId) : prev)),
    []
  );

  const restoreArchived = useCallback(
    async (publication: Publication) => {
      const result = await restorePublication(publication.id);
      if (result.error) {
        toast.error("No se pudo restaurar", result.error);
        return;
      }
      removeArchived(publication.id);
      upsertLivePublication(result.publication ?? { ...publication, archivedAt: null });
      toast.success("Publicación restaurada");
    },
    [removeArchived, upsertLivePublication]
  );

  /** Archivar (tarjeta o editor): sin confirmación, con "Deshacer". No toca el estado editorial ni ningún dato. */
  const archiveFromPlanner = useCallback(
    async (publication: Publication): Promise<boolean> => {
      selfArchivedIds.current.add(publication.id);
      let result: { error: string | null };
      try {
        result = await archivePublication(publication.id);
      } catch {
        result = { error: "No se pudo conectar con el servidor. Probá de nuevo." };
      }
      if (result.error) {
        selfArchivedIds.current.delete(publication.id);
        toast.error("No se pudo archivar", result.error);
        return false;
      }
      window.setTimeout(() => selfArchivedIds.current.delete(publication.id), 30_000);
      removeLivePublication(publication.id);
      upsertArchived({ ...publication, archivedAt: new Date().toISOString() });
      if (openPublicationIdRef.current === publication.id) setViewState(null);
      toast.successWithAction("Publicación archivada", {
        label: "Deshacer",
        onClick: () => void restoreArchived(publication),
      });
      return true;
    },
    [removeLivePublication, upsertArchived, restoreArchived]
  );

  const deleteArchivedPermanently = useCallback(
    async (publication: Publication): Promise<boolean> => {
      selfDeletedIds.current.add(publication.id);
      window.setTimeout(() => selfDeletedIds.current.delete(publication.id), 30_000);
      const result = await deletePublication(publication.id, publication.clientId);
      if (result.error) {
        toast.error("No se pudo eliminar", result.error);
        return false;
      }
      removeArchived(publication.id);
      toast.success("Publicación eliminada definitivamente");
      if (result.storageError) toast.error("Algunos archivos no se pudieron eliminar", result.storageError);
      return true;
    },
    [removeArchived]
  );

  // ---- Publicaciones en vivo (v1.6) ----
  // Avisos por cliente (usePublicationsLive): otra sesión crea, edita, mueve, archiva, restaura o elimina → se relee la
  // publicación (bajo RLS) y se actualizan la lista del Planner y la de archivadas. Si la que está abierta acá se
  // eliminó, se archivó o dejó de estar disponible por acción de OTRA sesión, se cierra la vista con un aviso. Una
  // edición ajena NO reemplaza la publicación abierta: eso lo resuelve el control de versión al guardar.
  const closeIfOpen = (publicationId: string, message: string) => {
    if (openPublicationIdRef.current !== publicationId) return;
    setViewState(null);
    toast.info(message);
  };
  usePublicationsLive({
    clientId: global ? null : client.id,
    onChanged: (publicationId) => {
      fetchPublicationForView(publicationId)
        .then((fresh) => {
          const outOfScope = fresh && !global && fresh.clientId !== client.id;
          if (!fresh || outOfScope) {
            // Ya no visible (p. ej. el Client User, cuando la archivan): se quita.
            removeLivePublication(publicationId);
            removeArchived(publicationId);
            if (!fresh) closeIfOpen(publicationId, "Esta publicación ya no está disponible");
            return;
          }
          if (fresh.archivedAt) {
            removeLivePublication(publicationId);
            if (canManage) upsertArchived(fresh);
            if (!selfArchivedIds.current.has(publicationId)) closeIfOpen(publicationId, "Esta publicación fue archivada por otro usuario");
            return;
          }
          removeArchived(publicationId);
          upsertLivePublication(fresh);
        })
        .catch(() => undefined);
    },
    onDeleted: (publicationId) => {
      removeLivePublication(publicationId);
      removeArchived(publicationId);
      if (selfDeletedIds.current.delete(publicationId)) return;
      closeIfOpen(publicationId, "Esta publicación fue eliminada por otro usuario");
    },
  });

  usePlannerShortcuts({
    overlayOpen: viewState !== null || clientPickerOpen,
    onNewPublication: canCreatePublication ? () => openCreateForm() : undefined,
    onPrevWeek: () => stepPeriod(-1),
    onNextWeek: () => stepPeriod(1),
  });

  // Cada card resuelve su propio cliente: en el Planner de un cliente es siempre el mismo; en Publicaciones
  // (global) cada publicación puede ser de uno distinto. Misma función para Semana/Mes/Lista y mobile.
  const getClientId = global ? (p: Publication) => p.clientId : () => client.id;

  // v1.6: paleta de fondos del calendario. Publicaciones global → celestes suaves; Planner de un cliente (y su
  // portal) → derivada del color principal del cliente (ver lib/calendar-surface.ts).
  const calendarTheme = calendarThemeStyle(isGlobal ? GLOBAL_CALENDAR_THEME : calendarThemeFromColor(client.color));
  // Cambiar de vista o de período cierra los desplegables de filtros que hayan quedado abiertos (se remontan).
  const filtersCloseKey = `${view}|${format(anchorDate, "yyyy-MM-dd")}`;

  if (calendars.length === 0) {
    return (
      <LookupsProvider {...lookups} calendars={calendars} clientAccounts={clientAccounts} campaigns={campaigns} clients={global?.clients ?? [client]}>
        <div className={cn("flex h-full flex-col", CAL_WORKSPACE_BG)} style={calendarTheme}>
          <CalendarHeader
            client={client}
            isGlobal={isGlobal}
            driveFolderUrl={client.driveFolderUrl}
            periodLabel=""
            anchorDate={anchorDate}
            onDateSelect={setAnchorDate}
            view={view}
            onViewChange={setView}
            defaultCalendarView={defaultCalendarView}
            onPrev={() => {}}
            onNext={() => {}}
            onToday={() => {}}
            spaces={spaceOptions}
            onSelectSpace={spaceOptions ? navigateToSpace : undefined}
            members={!isGlobal ? members : undefined}
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
    <LookupsProvider {...lookups} calendars={calendars} clientAccounts={clientAccounts} campaigns={campaigns} clients={global?.clients ?? [client]}><PublicationPatchProvider value={isGlobal ? patchGlobalPublication : null}><PublicationArchiveProvider value={canManage && archiveAvailable ? archiveFromPlanner : null}>
      <div className={cn("flex h-full flex-col", CAL_WORKSPACE_BG)} style={calendarTheme}>
        <CalendarHeader
          client={client}
          isGlobal={isGlobal}
          calendarDescription={isGlobal ? null : calendarDescription}
          driveFolderUrl={driveFolderUrl}
          periodLabel={periodLabel}
          anchorDate={anchorDate}
          onDateSelect={setAnchorDate}
          view={view}
          onViewChange={setView}
          defaultCalendarView={defaultCalendarView}
          onPrev={() => stepPeriod(-1)}
          onNext={() => stepPeriod(1)}
          onToday={handleToday}
          onCreate={canCreatePublication ? () => openCreateForm() : undefined}
          onExport={canExport ? handleExportCsv : undefined}
          onOpenArchived={canManage && archiveAvailable ? () => setArchivedOpen(true) : undefined}
          archivedCount={archivedList?.length ?? 0}
          spaces={spaceOptions}
          onSelectSpace={spaceOptions ? navigateToSpace : undefined}
          members={!isGlobal ? members : undefined}
          dateRange={LIST_CUSTOM_RANGE_ENABLED && view === "list" ? { from: dateFrom, to: dateTo } : undefined}
          onDateRangeChange={LIST_CUSTOM_RANGE_ENABLED && view === "list" ? setDateRange : undefined}
          toolbarEnd={
            <>
              {isLoadingRange && (
                <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Cargando más publicaciones" />
              )}
              {/* Filtros unificados: desplegable en desktop/tablet; en mobile, el sheet de siempre (solo ícono). Se
                  remontan con la vista y el período para cerrarse si quedaron abiertos. */}
              {showDesktopViews && (
                <div className="max-md:hidden">
                  <FiltersMenu
                    key={`filters|${filtersCloseKey}`}
                    value={activeFilters}
                    onChange={setFilters}
                    options={filterOptions}
                    calendarIds={calendarIds}
                    onCalendarIdsChange={setCalendarIds}
                    clientIds={global ? clientIds : undefined}
                  />
                </div>
              )}
              {showMobileViews && (
                <div className="md:hidden">
                  <MobileFilters
                    iconOnly
                    value={activeFilters}
                    onChange={setFilters}
                    options={filterOptions}
                    calendarIds={calendarIds}
                    onCalendarIdsChange={setCalendarIds}
                    clientIds={global ? clientIds : undefined}
                  />
                </div>
              )}
              <SearchButton onClick={() => setSearchOpen(true)} />
            </>
          }
        />
        {/* v1.6: chips de filtros activos (desktop y mobile); sin filtros no se renderiza. */}
        <ActiveFilterChips
          value={activeFilters}
          onChange={setFilters}
          options={filterOptions}
          calendarIds={calendarIds}
          onCalendarIdsChange={setCalendarIds}
          clientIds={global ? clientIds : undefined}
          onClientIdsChange={global ? setClientIds : undefined}
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
        {showDesktopViews && (
          // `min-h-0` solo en Mes: sin eso, un flex item se niega a encoger por debajo de la altura de su
          // contenido y termina desbordando `main` (scroll de página) — es lo que MonthView necesita para
          // ajustarse al alto disponible y manejar el sobrante con scroll interno por día. Semana y Lista se
          // dejan con su comportamiento actual (pueden crecer más que el viewport y scrollear la página).
          // v1.6: sin franja de color alrededor; márgenes alineados con el encabezado. El contorno redondeado lo
          // lleva cada vista (grilla de Mes/Semana, tablero de Día); Lista lo recibe acá.
          <div className={cn("hidden flex-1 flex-col md:flex md:px-6 md:pt-1 md:pb-4", view === "month" && "min-h-0")}>
            <div className={cn("flex flex-1 flex-col", view === "list" && CAL_GRID_FRAME, view === "month" && "min-h-0")}>
            {view === "day" ? (
              // v1.6: Día = tablero de publicaciones (grilla responsive), no una sola columna de Semana.
              <DayView
                day={anchorDate}
                publications={filteredPublications}
                onOpenPublication={handleOpenPublication}
                onEditPublication={canManage ? openEditForm : undefined}
                onDuplicatePublication={canManage ? openDuplicateForm : undefined}
                onDeletePublication={isGlobal ? removeGlobalPublication : undefined}
                getClientId={getClientId}
                showClient={isGlobal}
                onCreateForDay={canCreatePublication ? openCreateForm : undefined}
                showCalendarLabel={showCalendarLabel}
              />
            ) : view === "week" ? (
              <WeekView
                weekDays={agendaDays}
                publications={filteredPublications}
                onOpenPublication={handleOpenPublication}
                onEditPublication={canManage ? openEditForm : undefined}
                onDuplicatePublication={canManage ? openDuplicateForm : undefined}
                onDeletePublication={isGlobal ? removeGlobalPublication : undefined}
                getClientId={getClientId}
                showClient={isGlobal}
                onCreateForDay={canCreatePublication ? openCreateForm : undefined}
                showCalendarLabel={showCalendarLabel}
              />
            ) : view === "month" ? (
              <MonthView
                anchorDate={anchorDate}
                publications={filteredPublications}
                onOpenPublication={handleOpenPublication}
                onEditPublication={canManage ? openEditForm : undefined}
                onDuplicatePublication={canManage ? openDuplicateForm : undefined}
                onDeletePublication={isGlobal ? removeGlobalPublication : undefined}
                getClientId={getClientId}
                showClient={isGlobal}
                onCreateForDay={canCreatePublication ? openCreateForm : undefined}
                showCalendarLabel={showCalendarLabel}
              />
            ) : view === "board" ? (
              <BoardView
                publications={boardPublications}
                onOpenPublication={handleOpenPublication}
                onEditPublication={canManage ? openEditForm : undefined}
                onDuplicatePublication={canManage ? openDuplicateForm : undefined}
                onDeletePublication={isGlobal ? removeGlobalPublication : undefined}
                getClientId={getClientId}
                showClient={isGlobal}
                showCalendarLabel={showCalendarLabel}
              />
            ) : (
              <AgendaListView
                publications={listPublications}
                onOpenPublication={handleOpenPublication}
                onEditPublication={canManage ? openEditForm : undefined}
                onDuplicatePublication={canManage ? openDuplicateForm : undefined}
                onDeletePublication={isGlobal ? removeGlobalPublication : undefined}
                getClientId={getClientId}
                showClient={isGlobal}
                showCalendarLabel={showCalendarLabel}
              />
            )}
            </div>
          </div>
        )}
        {showMobileViews && (
          <div className="flex flex-1 flex-col bg-background md:hidden">
            {view === "board" ? (
              <div className="flex flex-1 flex-col px-3 pt-2 pb-4">
                <BoardView
                  publications={boardPublications}
                  onOpenPublication={handleOpenPublication}
                  onEditPublication={canManage ? openEditForm : undefined}
                  onDuplicatePublication={canManage ? openDuplicateForm : undefined}
                  onDeletePublication={isGlobal ? removeGlobalPublication : undefined}
                  getClientId={getClientId}
                  showClient={isGlobal}
                  showCalendarLabel={showCalendarLabel}
                />
              </div>
            ) : view === "month" ? (
              <MobileMonthView
                anchorDate={anchorDate}
                publications={filteredPublications}
                onOpenPublication={handleOpenPublication}
                onEditPublication={canManage ? openEditForm : undefined}
                onDuplicatePublication={canManage ? openDuplicateForm : undefined}
                onDeletePublication={isGlobal ? removeGlobalPublication : undefined}
                getClientId={getClientId}
                showClient={isGlobal}
                onCreateForDay={canCreatePublication ? openCreateForm : undefined}
                showCalendarLabel={showCalendarLabel}
              />
            ) : (
              <MobileAgendaView
                mode={view === "list" ? "list" : "week"}
                days={view === "list" ? listDays : agendaDays}
                publications={view === "list" ? listPublications : filteredPublications}
                onOpenPublication={handleOpenPublication}
                onEditPublication={canManage ? openEditForm : undefined}
                onDuplicatePublication={canManage ? openDuplicateForm : undefined}
                onDeletePublication={isGlobal ? removeGlobalPublication : undefined}
                getClientId={getClientId}
                showClient={isGlobal}
                onCreateForDay={view === "list" || !canCreatePublication ? undefined : openCreateForm}
                showCalendarLabel={showCalendarLabel}
              />
            )}
          </div>
        )}
        <PublicationSearchDialog
          open={searchOpen}
          onOpenChange={setSearchOpen}
          initialSpaceId={isGlobal || readOnly ? null : client.id}
        />
        {viewState && (
          <PublicationView
            key={viewKey}
            onArchive={canManage && archiveAvailable ? archiveFromPlanner : undefined}
            onDeleteStart={(publicationId) => {
              // Vence sola: si el borrado falla, un borrado ajeno posterior vuelve a avisar.
              selfDeletedIds.current.add(publicationId);
              window.setTimeout(() => selfDeletedIds.current.delete(publicationId), 30_000);
            }}
            clientId={viewState.clientId}
            publication={viewState.publication}
            duplicateFrom={viewState.duplicateFrom}
            defaultCalendarId={viewDefaultCalendarId}
            defaultDate={viewState.defaultDate}
            onOpenChange={(open) => !open && setViewState(null)}
            calendars={viewCalendars}
            clientAccounts={viewClientAccounts}
            campaigns={viewCampaigns}
            onSaved={isGlobal ? upsertGlobalPublication : undefined}
            onDeleted={isGlobal ? removeGlobalPublication : undefined}
            readOnly={readOnly}
            initialTab={viewState.tab}
            onPublicationReloaded={(fresh, tab) => {
              // Remonta la vista con la versión vigente (misma vía que abrir una publicación), en la misma pestaña.
              openPublicationView(fresh, tab);
              if (isGlobal) upsertGlobalPublication(fresh);
            }}
          />
        )}
        {canManage && archiveAvailable && (
          <ArchivedPublicationsSheet
            open={archivedOpen}
            onOpenChange={setArchivedOpen}
            publications={archivedList}
            showClient={isGlobal}
            onRestore={restoreArchived}
            onDeletePermanently={deleteArchivedPermanently}
          />
        )}
        {global && (
          <PublicationClientPicker
            open={clientPickerOpen}
            onOpenChange={setClientPickerOpen}
            clients={global.clients}
            onSelect={handleClientPicked}
          />
        )}
      </div>
    </PublicationArchiveProvider></PublicationPatchProvider></LookupsProvider>
  );
}
