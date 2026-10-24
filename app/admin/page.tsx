import { Suspense } from "react";
import { AdminDashboard, type DashboardData, type DashboardUpcomingRow } from "@/components/admin/dashboard/admin-dashboard";
import { DashboardError, DashboardSkeleton } from "@/components/admin/dashboard/dashboard-states";
import {
  addDaysIso,
  parseDashboardPeriod,
  periodRange,
  platformDistribution,
  statusDistribution,
  todayIso,
  UPCOMING_WINDOW_DAYS,
  upcomingPublications,
} from "@/lib/dashboard";
import { fetchAllClientAccountsAdmin, fetchClients, fetchLookups, fetchPublicationsInRange } from "@/lib/supabase/queries";

/**
 * Inicio (v1.6): dashboard de Super Admin y Account Manager. Filtros en la URL: `?space=<clientId>` y el período con
 * los controles del Planner (`?view=day|week|month&date=YYYY-MM-DD`; un `?month=YYYY-MM` viejo se sigue leyendo).
 * Todo lo que se ve sale de las consultas existentes, ya scopeadas por RLS: Super Admin ve todos los clientes y
 * Account Manager solo los asignados (mismas reglas que Publicaciones). Una consulta por recurso, sin N+1.
 */
export default async function AdminHomePage({
  searchParams,
}: {
  searchParams: Promise<{ space?: string; month?: string; view?: string; date?: string }>;
}) {
  const params = await searchParams;
  // El layout de /admin ya resolvió sesión y rol (staff).
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent
        spaceParam={params.space ?? null}
        viewParam={params.view ?? null}
        dateParam={params.date ?? null}
        monthParam={params.month ?? null}
      />
    </Suspense>
  );
}

async function DashboardContent({
  spaceParam,
  viewParam,
  dateParam,
  monthParam,
}: {
  spaceParam: string | null;
  viewParam: string | null;
  dateParam: string | null;
  monthParam: string | null;
}) {
  const today = todayIso();
  const { view, date } = parseDashboardPeriod({ view: viewParam, date: dateParam, month: monthParam }, today);
  const { from, to } = periodRange(view, date);

  // null = falló alguna consulta (error real de Supabase o excepción): estado de error con reintento.
  let data: DashboardData | null = null;
  try {
    // Estadísticas: el período elegido. Próximas publicaciones: desde hoy, con su propia ventana — no dependen del
    // período (misma consulta, otro rango).
    const results = await Promise.all([
      fetchClients(),
      fetchPublicationsInRange(from, to),
      fetchLookups(),
      fetchAllClientAccountsAdmin(),
      fetchPublicationsInRange(today, addDaysIso(today, UPCOMING_WINDOW_DAYS)),
    ]);
    // Un error real de Supabase no se presenta como "sin datos".
    if (results.some((r) => r.error)) throw new Error(results.find((r) => r.error)?.error ?? "consulta fallida");
    const [{ data: clients }, { data: publications }, { data: lookups }, { data: accounts }, { data: nextPublications }] = results;

    // Un espacio desconocido o sin acceso (RLS) se trata como "Todos los espacios".
    const spaceId = spaceParam && clients.some((c) => c.id === spaceParam) ? spaceParam : null;
    const inScope = spaceId ? publications.filter((p) => p.clientId === spaceId) : publications;
    const upcomingInScope = spaceId ? nextPublications.filter((p) => p.clientId === spaceId) : nextPublications;

    const statusById = new Map(lookups.statuses.map((s) => [s.id, s]));
    const statusByKey = new Map(lookups.statuses.map((s) => [s.key, s]));
    const clientById = new Map(clients.map((c) => [c.id, c]));
    const accountById = new Map(accounts.map((a) => [a.id, a]));
    const platformById = new Map(lookups.platforms.map((p) => [p.id, p]));
    const countByKey = (key: string) => inScope.filter((p) => statusById.get(p.statusId)?.key === key).length;
    // Total activo = sin descartadas. La distribución sí las muestra (histórico completo del período).
    const discarded = countByKey("discarded");

    const upcoming: DashboardUpcomingRow[] = upcomingPublications(upcomingInScope, lookups.statuses, today).map((p) => {
      const platforms = [
        ...new Map(
          p.destinations
            .map((d) => platformById.get(accountById.get(d.clientAccountId)?.platformId ?? ""))
            .filter((pl) => pl !== undefined)
            .map((pl) => [pl.id, pl])
        ).values(),
      ];
      const hero = p.assets.find((a) => a.isPrimary) ?? p.assets[0] ?? null;
      const client = clientById.get(p.clientId);
      return {
        id: p.id,
        title: p.title,
        date: p.publicationDate,
        time: p.publicationTime,
        clientName: client?.name ?? "",
        thumbnailUrl: hero?.thumbnailUrl ?? null,
        platform: platforms[0] ? { key: platforms[0].key, name: platforms[0].name, color: platforms[0].color } : null,
        extraPlatforms: Math.max(0, platforms.length - 1),
        status: statusById.get(p.statusId) ?? null,
      };
    });

    // Publicaciones por red social: mismas publicaciones que el indicador "Publicaciones" (sin descartadas).
    const platformIdByAccountId = new Map(accounts.map((a) => [a.id, a.platformId]));
    const activeInScope = inScope.filter((p) => statusById.get(p.statusId)?.key !== "discarded");

    data = {
      view,
      date,
      today,
      spaceId,
      spaces: clients
        .filter((c) => c.active || c.id === spaceId)
        .map((c) => ({ id: c.id, name: c.name, color: c.color, logoUrl: c.logoUrl })),
      clientNames: Object.fromEntries(clients.map((c) => [c.id, c.name])),
      total: inScope.length - discarded,
      totalWithDiscarded: inScope.length,
      discarded,
      inReview: countByKey("in_review"),
      approved: countByKey("approved"),
      published: countByKey("published"),
      statusColors: {
        in_review: statusByKey.get("in_review")?.color ?? null,
        approved: statusByKey.get("approved")?.color ?? null,
        published: statusByKey.get("published")?.color ?? null,
      },
      // Escritorio (v1.6): por defecto sin descartadas (porcentajes sobre las activas); con el checkbox "Mostrar
      // publicaciones descartadas", la variante completa. Se calculan las dos para cambiar sin volver a consultar.
      distribution: statusDistribution(activeInScope, lookups.statuses),
      distributionWithDiscarded: statusDistribution(inScope, lookups.statuses),
      // Mismo criterio que el KPI "Publicaciones" (sin descartadas), para filtrar su listado de destino.
      activeStatusKeys: [...lookups.statuses]
        .sort((a, b) => a.order - b.order)
        .map((s) => s.key)
        .filter((key) => key !== "discarded"),
      platforms: platformDistribution(activeInScope, platformIdByAccountId, lookups.platforms),
      platformsWithDiscarded: platformDistribution(inScope, platformIdByAccountId, lookups.platforms),
      upcoming,
    };
  } catch {
    data = null;
  }

  return data ? <AdminDashboard data={data} /> : <DashboardError />;
}
