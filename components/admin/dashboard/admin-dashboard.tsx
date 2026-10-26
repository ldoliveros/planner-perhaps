"use client";

import { useTransition, type CSSProperties, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { addDays, addMonths, addWeeks } from "date-fns";
import {
  ArrowRight,
  BellOff,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  ImageIcon,
  Loader2,
  RefreshCcw,
  Send,
  type LucideIcon,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { PeriodNav, SpaceSelector, type CalendarView, type SpaceOption } from "@/components/calendar/calendar-header";
import { StatusPill } from "@/components/shared/status-pill";
import { PlatformIcon } from "@/components/icons/brand-icons";
import { NotificationItem } from "@/components/notifications/notification-item";
import { useNotifications } from "@/components/notifications/notifications-provider";
import { ADMIN_ACTIONS_RESERVE } from "@/lib/admin-shell";
import { ADMIN_CARD, ADMIN_SURFACE } from "@/lib/admin-surface";
import { GLOBAL_CALENDAR_THEME, calendarThemeStyle } from "@/lib/calendar-surface";
import { getReadableTextColor } from "@/lib/color-contrast";
import { replaceSearchParams } from "@/lib/history-search-params";
import { formatFullDateFromDate, formatMonthYear, formatWeekRange, getWeekDays } from "@/lib/date-utils";
import {
  dashboardPeriodHref,
  dateFromIso,
  isoFromDate,
  periodNoun as periodNounFor,
  type DashboardView,
  type PlatformCount,
  type StatusBucket,
} from "@/lib/dashboard";
import { cn } from "cn";
import type { Status } from "@/types";

export interface DashboardUpcomingRow {
  id: string;
  title: string;
  date: string;
  time: string | null;
  clientName: string;
  thumbnailUrl: string | null;
  platform: { key: string; name: string; color: string } | null;
  extraPlatforms: number;
  status: Status | null;
}

export interface DashboardData {
  /** Período de las estadísticas (mismos controles que el Planner). */
  view: DashboardView;
  /** Fecha de referencia del período, "YYYY-MM-DD". */
  date: string;
  today: string;
  spaceId: string | null;
  spaces: SpaceOption[];
  clientNames: Record<string, string>;
  /** Publicaciones activas del período (sin descartadas). */
  total: number;
  /** Todas las del período, incluidas las descartadas (checkbox "Mostrar publicaciones descartadas"). */
  totalWithDiscarded: number;
  /** Descartadas del período: fuera del total activo, visibles en la distribución. */
  discarded: number;
  inReview: number;
  approved: number;
  published: number;
  statusColors: { in_review: string | null; approved: string | null; published: string | null };
  /** Distribución sin descartadas (porcentajes sobre las activas). */
  distribution: StatusBucket[];
  /** Distribución con descartadas. */
  distributionWithDiscarded: StatusBucket[];
  /** Claves de estado que cuenta el KPI "Publicaciones" (todas menos descartada): filtro de su enlace. */
  activeStatusKeys: string[];
  /** Publicaciones activas del período por plataforma (una multicanal suma en cada red). */
  platforms: PlatformCount[];
  /** Por red social, incluidas las descartadas. */
  platformsWithDiscarded: PlatformCount[];
  /** Próximas publicaciones desde hoy: no dependen del período elegido. */
  upcoming: DashboardUpcomingRow[];
}

const MONTH_ABBR = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
const NEUTRAL = "#64748b";

const CARD = ADMIN_CARD;

/** URL del Escritorio: espacio + período (Mes y hoy son los valores por defecto y se omiten). */
function dashboardHref(
  spaceId: string | null,
  view: DashboardView,
  date: string,
  today: string,
  includeDiscarded: boolean
): string {
  const params = new URLSearchParams();
  // Checkbox "Mostrar publicaciones descartadas": viaja en la URL, así se conserva al cambiar período, vista o espacio.
  if (includeDiscarded) params.set("descartadas", "1");
  if (spaceId) params.set("space", spaceId);
  if (view !== "month") params.set("view", view);
  if (date !== today) params.set("date", date);
  const query = params.toString();
  return query ? `/admin?${query}` : "/admin";
}

/** Texto del período, igual que en el Planner. */
function periodLabelFor(view: DashboardView, anchor: Date): string {
  if (view === "day") return formatFullDateFromDate(anchor);
  if (view === "week") return formatWeekRange(getWeekDays(anchor));
  return formatMonthYear(anchor);
}

/**
 * Inicio (v1.6). Encabezado con los mismos controles del Planner (selector de espacio, ‹ › período · Hoy ·
 * Día/Semana/Mes), sincronizados con la URL; al cambiarlos se mantiene la vista anterior atenuada (transición) hasta
 * que llegan los datos nuevos. Dos columnas independientes en desktop: estadísticas del período a la izquierda y
 * Próximas publicaciones + Notificaciones (que no dependen del período) a la derecha. Las notificaciones salen del
 * NotificationsProvider global (mismo estado que la campanita).
 */
export function AdminDashboard({ data }: { data: DashboardData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { view, date, today, spaceId } = data;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Por defecto las descartadas quedan fuera de todas las estadísticas; el checkbox las incluye (sin volver a consultar).
  const includeDiscarded = searchParams.get("descartadas") === "1";
  const total = includeDiscarded ? data.totalWithDiscarded : data.total;
  const distribution = includeDiscarded ? data.distributionWithDiscarded : data.distribution;
  const platforms = includeDiscarded ? data.platformsWithDiscarded : data.platforms;
  const setIncludeDiscarded = (next: boolean) =>
    replaceSearchParams(pathname, searchParams, { descartadas: next ? "1" : null });
  const anchor = dateFromIso(date);
  const space = spaceId ? data.spaces.find((s) => s.id === spaceId) : undefined;

  function go(nextSpace: string | null, nextView: DashboardView, nextDate: string) {
    startTransition(() =>
      router.push(dashboardHref(nextSpace, nextView, nextDate, today, includeDiscarded), { scroll: false })
    );
  }
  const goDate = (next: Date) => go(spaceId, view, isoFromDate(next));
  const step = (delta: number) =>
    goDate(view === "day" ? addDays(anchor, delta) : view === "week" ? addWeeks(anchor, delta) : addMonths(anchor, delta));

  const listHref = (statusKey?: string) => dashboardPeriodHref({ view, date, clientId: spaceId, statusKey });
  const calendarHref = spaceId ? `/admin/clients/${spaceId}/planner` : "/admin/publications";
  const periodNoun = periodNounFor(view, date, today);

  return (
    <div className={cn("flex min-h-full flex-col gap-4 p-4 md:p-6", ADMIN_SURFACE)}>
      {/* Encabezado: título; debajo, el selector de espacio y la navegación del período del Planner (mismos
          componentes). La campanita + avatar del layout quedan arriba a la derecha (ADMIN_ACTIONS_RESERVE). */}
      <div className="flex flex-col gap-2" style={calendarThemeStyle(GLOBAL_CALENDAR_THEME)}>
        <div className={cn("flex min-h-9 items-center gap-2 md:-mt-1.5", ADMIN_ACTIONS_RESERVE)}>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">Escritorio</h1>
          {pending && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
              <Loader2 className="size-3.5 animate-spin" />
              Actualizando...
            </span>
          )}
        </div>
        <div className="flex max-w-full min-w-0 items-center">
          <SpaceSelector
            client={space ?? { id: "", name: "Todos los espacios", logoUrl: null, color: GLOBAL_CALENDAR_THEME.accent }}
            isGlobal={!space}
            spaces={data.spaces}
            onSelectSpace={(id) => go(id, view, date)}
          />
        </div>
        <PeriodNav
          view={view}
          anchorDate={anchor}
          periodLabel={periodLabelFor(view, anchor)}
          onDateSelect={goDate}
          onViewChange={(next: CalendarView) => {
            if (next !== "list" && next !== "board" && next !== view) go(spaceId, next, date);
          }}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          onToday={() => go(spaceId, view, today)}
        />
      </div>

      {/* Desktop: dos columnas independientes (≈52/48); cada una apila sus bloques sin igualar alturas. Una columna
          debajo de xl, en el orden: indicadores, distribución, redes, próximas y notificaciones. */}
      <div
        className={cn(
          "grid grid-cols-1 items-start gap-5 transition-opacity xl:grid-cols-[minmax(0,52fr)_minmax(0,48fr)] xl:gap-6",
          pending && "pointer-events-none opacity-60"
        )}
        aria-busy={pending}
      >
        <div className="flex min-w-0 flex-col gap-5">
          {/* Indicadores (2×2; una columna si no entra) */}
          <div className="grid auto-rows-fr grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:gap-4">
            {/* El enlace aplica el mismo criterio que el número: sin descartadas (todos los demás estados) o, con el
                checkbox, todas (sin filtro de estado). */}
            <StatCard
              href={listHref(includeDiscarded ? undefined : data.activeStatusKeys.join(","))}
              icon={FileText}
              color={NEUTRAL}
              value={total}
              label="Publicaciones"
              hint={`Planificadas ${periodNoun}`}
            />
            <StatCard href={listHref("in_review")} icon={Clock} color={data.statusColors.in_review ?? NEUTRAL} value={data.inReview} label="En revisión" hint="Esperando respuesta" />
            <StatCard href={listHref("approved")} icon={CheckCircle2} color={data.statusColors.approved ?? NEUTRAL} value={data.approved} label="Aprobadas" hint="Listas para publicar" />
            <StatCard href={listHref("published")} icon={Send} color={data.statusColors.published ?? NEUTRAL} value={data.published} label="Publicadas" hint="Completadas" />
          </div>

          {/* Distribución por estado */}
          <section className={cn(CARD, "flex flex-col gap-4 p-5")} aria-labelledby="dashboard-distribution">
            <h2 id="dashboard-distribution" className="text-base font-semibold text-foreground">
              Distribución por estado
            </h2>
            {distribution.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay publicaciones {periodNoun}.</p>
            ) : (
              <DistributionBar buckets={distribution} hrefFor={(key) => listHref(key)} />
            )}
          </section>

          {/* Debajo de la distribución: incluir o no las descartadas en TODAS las estadísticas del Escritorio. */}
          <label className="-mt-2 flex w-fit cursor-pointer items-center gap-2 pl-1 text-sm text-muted-foreground select-none hover:text-foreground">
            <input
              type="checkbox"
              checked={includeDiscarded}
              onChange={(e) => setIncludeDiscarded(e.target.checked)}
              className="size-4 cursor-pointer accent-foreground"
            />
            Mostrar publicaciones descartadas
            {data.discarded > 0 && <span className="tabular-nums">({data.discarded})</span>}
          </label>

          <PlatformBreakdown platforms={platforms} periodNoun={periodNoun} />
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <UpcomingPublications rows={data.upcoming} calendarHref={calendarHref} listHref={listHref()} />
          <UnreadNotifications spaceId={spaceId} clientNames={data.clientNames} />
        </div>
      </div>
    </div>
  );
}

/**
 * Publicaciones por red social (período elegido, sin descartadas): barras horizontales proporcionales a la red con
 * más publicaciones, con el ícono y el color de cada plataforma. Una publicación multicanal suma en cada red, así que
 * el total de las barras puede superar al de "Publicaciones".
 */
function PlatformBreakdown({ platforms, periodNoun }: { platforms: PlatformCount[]; periodNoun: string }) {
  const max = Math.max(1, ...platforms.map((p) => p.count));
  return (
    <section className={cn(CARD, "flex flex-col gap-4 p-5")} aria-labelledby="dashboard-platforms">
      <h2 id="dashboard-platforms" className="text-base font-semibold text-foreground">
        Publicaciones por red social
      </h2>
      {platforms.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay publicaciones {periodNoun}.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {platforms.map((platform) => (
            <li
              key={platform.key}
              className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_2.5rem] items-center gap-3"
              aria-label={`${platform.name}: ${platform.count} ${platform.count === 1 ? "publicación" : "publicaciones"}`}
            >
              <span className="flex min-w-0 items-center gap-2 text-sm text-foreground">
                <PlatformIcon platformKey={platform.key} className="size-4 shrink-0" style={{ color: platform.color }} />
                <span className="truncate">{platform.name}</span>
              </span>
              <span aria-hidden className="h-2 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${(platform.count / max) * 100}%`, backgroundColor: platform.color }}
                />
              </span>
              <span className="text-right text-sm font-semibold text-foreground tabular-nums">{platform.count}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StatCard({
  href,
  icon: Icon,
  color,
  value,
  label,
  hint,
}: {
  href: string;
  icon: LucideIcon;
  color: string;
  value: number;
  label: string;
  hint: string;
}) {
  const content = (
    <>
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-lg sm:size-12 sm:rounded-xl"
        style={{ backgroundColor: `${color}1f`, color }}
      >
        <Icon className="size-[18px] sm:size-6" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-xl leading-tight font-semibold text-foreground tabular-nums sm:text-2xl">{value}</span>
        <span className="truncate text-[13px] font-medium text-foreground sm:text-sm">{label}</span>
        <span className="line-clamp-2 text-[11px] leading-snug text-muted-foreground sm:text-xs">{hint}</span>
      </span>
      {value > 0 && (
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 max-sm:hidden" />
      )}
    </>
  );
  // En 0 no hay nada que ver: Publicaciones descartaría además un filtro de estado sin publicaciones que lo tengan.
  if (value === 0) {
    return <div className={cn(CARD, "flex items-center gap-2.5 p-3 sm:gap-4 sm:p-4")}>{content}</div>;
  }
  return (
    <Link
      href={href}
      aria-label={`${label}: ${value}. Ver en Publicaciones`}
      className={cn(
        CARD,
        "group flex items-center gap-2.5 p-3 sm:gap-4 sm:p-4 transition-colors hover:border-border hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
      )}
    >
      {content}
    </Link>
  );
}

function DistributionBar({ buckets, hrefFor }: { buckets: StatusBucket[]; hrefFor: (statusKey: string) => string }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex h-9 w-full overflow-hidden rounded-lg" role="list" aria-label="Publicaciones por estado">
        {buckets.map((bucket) => (
          <Link
            key={bucket.statusId}
            role="listitem"
            href={hrefFor(bucket.key)}
            title={`${bucket.label}: ${bucket.count} (${bucket.percent}%)`}
            aria-label={`${bucket.label}: ${bucket.count} publicaciones, ${bucket.percent}%. Ver en Publicaciones`}
            className="flex min-w-6 items-center justify-center overflow-hidden text-sm font-semibold transition-[filter] hover:brightness-95 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            style={{ flexGrow: bucket.count, flexBasis: 0, backgroundColor: bucket.color, color: getReadableTextColor(bucket.color) } as CSSProperties}
          >
            <span className="truncate px-1">{bucket.count}</span>
          </Link>
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-6 gap-y-2">
        {buckets.map((bucket) => (
          <li key={bucket.statusId}>
            <Link href={hrefFor(bucket.key)} className="flex items-start gap-2 rounded-md text-sm hover:underline">
              <span aria-hidden className="mt-1 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: bucket.color }} />
              <span className="flex flex-col leading-tight">
                <span className="font-medium text-foreground">{bucket.label}</span>
                <span className="text-xs text-muted-foreground">
                  {bucket.count} · {bucket.percent}%
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SectionHeader({ id, title, subtitle, action }: { id: string; title: ReactNode; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 border-b border-border/70 px-5 py-4">
      <div className="min-w-[13rem] flex-1">
        <h2 id={id} className="flex items-center gap-2 text-base font-semibold text-foreground">
          {title}
        </h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function UpcomingPublications({
  rows,
  calendarHref,
  listHref,
}: {
  rows: DashboardUpcomingRow[];
  calendarHref: string;
  listHref: string;
}) {
  return (
    <section className={cn(CARD, "flex flex-col")} aria-labelledby="dashboard-upcoming">
      <SectionHeader
        id="dashboard-upcoming"
        title="Próximas publicaciones"
        subtitle="Contenido programado y pendiente"
        action={
          <Link href={calendarHref} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0 gap-1.5")}>
            <CalendarDays className="size-3.5" />
            Ver calendario
          </Link>
        }
      />
      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">
          No hay publicaciones próximas.
        </p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((row) => (
            <li key={row.id} className="border-b border-border/60 last:border-b-0">
              {/* /p/<id>: el link universal existente — abre la publicación en el Planner del cliente. */}
              <Link
                href={`/p/${row.id}`}
                className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
              >
                <DateChip date={row.date} />
                <span className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground/50 sm:h-12 sm:w-16">
                  {row.thumbnailUrl ? (
                    <Image src={row.thumbnailUrl} alt="" fill sizes="64px" className="object-cover" />
                  ) : (
                    <ImageIcon className="size-5" />
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium text-foreground">{row.title}</span>
                  <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="truncate">{row.clientName}</span>
                    {row.platform && (
                      <>
                        <span aria-hidden>·</span>
                        <PlatformIcon platformKey={row.platform.key} className="size-3.5 shrink-0" style={{ color: row.platform.color }} />
                        <span className="truncate">
                          {row.platform.name}
                          {row.extraPlatforms > 0 && ` +${row.extraPlatforms}`}
                        </span>
                      </>
                    )}
                  </span>
                </span>
                {row.status && <StatusPill status={row.status} className="shrink-0 max-sm:hidden" />}
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto border-t border-border/70 px-5 py-3">
        <Link href={listHref} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          Ver todas las publicaciones
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </section>
  );
}

function DateChip({ date }: { date: string }) {
  const [, m, d] = date.split("-");
  return (
    <span className="flex w-11 shrink-0 flex-col items-center rounded-lg bg-muted/70 py-1 leading-none">
      <span className="text-base font-semibold text-foreground tabular-nums">{Number(d)}</span>
      <span className="mt-0.5 text-[10px] font-medium text-muted-foreground">{MONTH_ABBR[Number(m) - 1]}</span>
    </span>
  );
}

const MAX_DASHBOARD_NOTIFICATIONS = 5;

/**
 * Notificaciones sin leer del usuario (las de la campanita: mismo provider, mismo Realtime y mismo estado de
 * lectura). Con un espacio elegido se muestran solo las de ese cliente.
 */
function UnreadNotifications({ spaceId, clientNames }: { spaceId: string | null; clientNames: Record<string, string> }) {
  const { items, unreadCount, hasMore, loadState, loadError, open, markRead, resync } = useNotifications();
  const unread = items.filter((n) => !n.readAt && (spaceId === null || n.clientId === spaceId));
  // Sin filtro, el contador es el exacto de la campanita. Con un espacio se cuenta sobre las notificaciones ya
  // cargadas (las más recientes): si hay más sin cargar, el número es un mínimo y se muestra como "N+".
  const filteredIsPartial = spaceId !== null && hasMore;
  const count = spaceId === null ? unreadCount : unread.length;
  const countLabel = (count > 99 ? "99+" : String(count)) + (filteredIsPartial && count <= 99 ? "+" : "");

  return (
    <section className={cn(CARD, "flex flex-col")} aria-labelledby="dashboard-notifications">
      <SectionHeader
        id="dashboard-notifications"
        title={
          <>
            Notificaciones sin leer
            {loadState === "ready" && count > 0 && (
              <span
                className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#FF3459] px-1.5 text-xs font-semibold text-white"
                title={filteredIsPartial ? "Sin leer de este espacio entre tus notificaciones más recientes" : undefined}
              >
                {countLabel}
              </span>
            )}
          </>
        }
        action={
          <Link href="/admin/notifications" className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline">
            Ver todas
            <ArrowRight className="size-3.5" />
          </Link>
        }
      />
      {loadState === "loading" && (
        <p className="flex items-center gap-1.5 px-5 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Cargando notificaciones...
        </p>
      )}
      {loadState === "unavailable" && (
        <p className="px-5 py-10 text-sm text-muted-foreground">Las notificaciones todavía no están disponibles.</p>
      )}
      {loadState === "error" && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-6 text-sm text-destructive">
          <span>No se pudieron cargar las notificaciones. {loadError}</span>
          <Button size="sm" variant="outline" className="gap-1" onClick={() => void resync()}>
            <RefreshCcw className="size-3.5" />
            Reintentar
          </Button>
        </div>
      )}
      {loadState === "ready" && unread.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-5 py-10 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground/70">
            <BellOff className="size-5" />
          </span>
          <p className="max-w-64 text-sm text-muted-foreground">
          {spaceId === null
            ? "No tenés notificaciones sin leer."
            : filteredIsPartial
              ? "No hay notificaciones sin leer de este espacio entre las más recientes."
              : "No tenés notificaciones sin leer de este espacio."}
          </p>
        </div>
      )}
      {loadState === "ready" && unread.length > 0 && (
        <div className="flex flex-col">
          {unread.slice(0, MAX_DASHBOARD_NOTIFICATIONS).map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              context={[notification.clientId ? clientNames[notification.clientId] : null, notification.publicationTitle]
                .filter(Boolean)
                .join(" · ")}
              onOpen={() => open(notification)}
              onMarkRead={() => void markRead([notification.id])}
            />
          ))}
        </div>
      )}
    </section>
  );
}
