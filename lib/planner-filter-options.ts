import type { Campaign, ClientAccount, ContentType, Platform, Publication, Status } from "@/types";
import { accountLabel, accountLabelsWithPlatform } from "@/lib/account-label";

export interface FilterOption {
  id: string;
  label: string;
}

/** Catálogos completos; el helper devuelve solo el subconjunto que las publicaciones del contexto usan. */
export interface FilterCatalog {
  platforms: Platform[];
  clientAccounts: ClientAccount[];
  contentTypes: ContentType[];
  statuses: Status[];
  campaigns: Campaign[];
}

export interface RelevantFilterOptions {
  platforms: FilterOption[];
  accounts: FilterOption[];
  contentTypes: FilterOption[];
  statuses: FilterOption[];
  campaigns: FilterOption[];
}

export interface FilterSelection {
  platformIds: string[];
  accountIds: string[];
  contentTypeIds: string[];
  statusIds: string[];
  campaigns: string[];
}

/**
 * Opciones de filtro relevantes: solo las que usa al menos una publicación de `contextPublications`
 * (SIN aplicar los filtros de contenido — así un filtro nunca reduce el catálogo de otro). Se llama con las
 * publicaciones del período visible (catálogo a mostrar) y con las de todo el universo de calendarios
 * (para validar selecciones). Conserva el orden y los labels de cada catálogo.
 * "Sin campaña" no es una opción del filtro de Campaña (solo lista campañas reales), por eso no se deriva.
 */
export function getRelevantFilterOptions(
  contextPublications: Publication[],
  catalog: FilterCatalog
): RelevantFilterOptions {
  const usedAccountIds = new Set<string>();
  const usedContentTypeIds = new Set<string>();
  const usedStatusIds = new Set<string>();
  const usedCampaignIds = new Set<string>();
  for (const p of contextPublications) {
    for (const d of p.destinations) usedAccountIds.add(d.clientAccountId);
    usedContentTypeIds.add(p.contentTypeId);
    usedStatusIds.add(p.statusId);
    if (p.campaignId) usedCampaignIds.add(p.campaignId);
  }

  const usedAccounts = catalog.clientAccounts.filter((a) => usedAccountIds.has(a.id));
  const usedPlatformIds = new Set(usedAccounts.map((a) => a.platformId));
  const accountLabels = accountLabelsWithPlatform(usedAccounts, new Map(catalog.platforms.map((p) => [p.id, p.name])));

  return {
    platforms: catalog.platforms.filter((p) => usedPlatformIds.has(p.id)).map((p) => ({ id: p.id, label: p.name })),
    accounts: usedAccounts.map((a) => ({ id: a.id, label: accountLabels.get(a.id) ?? accountLabel(a) })),
    contentTypes: catalog.contentTypes.filter((c) => usedContentTypeIds.has(c.id)).map((c) => ({ id: c.id, label: c.label })),
    statuses: catalog.statuses.filter((s) => usedStatusIds.has(s.id)).map((s) => ({ id: s.id, label: s.label })),
    campaigns: catalog.campaigns.filter((c) => usedCampaignIds.has(c.id)).map((c) => ({ id: c.id, label: c.name })),
  };
}

/**
 * Catálogo a mostrar: las opciones relevantes del período visible + las que el usuario ya tiene seleccionadas
 * aunque en este período no tengan publicaciones (navegar fechas no debe ocultar ni borrar una selección).
 * Las opciones salen de `universe` (todo el universo de los calendarios seleccionados), que siempre incluye a
 * las del período, así que se conserva el orden del catálogo. Al deseleccionar, una opción sin publicaciones
 * en el período desaparece.
 */
export function withSelectedOptions(
  period: RelevantFilterOptions,
  universe: RelevantFilterOptions,
  selection: FilterSelection
): RelevantFilterOptions {
  const merge = (periodOptions: FilterOption[], universeOptions: FilterOption[], selected: string[]) => {
    const keep = new Set([...periodOptions.map((o) => o.id), ...selected]);
    return universeOptions.filter((o) => keep.has(o.id));
  };
  return {
    platforms: merge(period.platforms, universe.platforms, selection.platformIds),
    accounts: merge(period.accounts, universe.accounts, selection.accountIds),
    contentTypes: merge(period.contentTypes, universe.contentTypes, selection.contentTypeIds),
    statuses: merge(period.statuses, universe.statuses, selection.statusIds),
    campaigns: merge(period.campaigns, universe.campaigns, selection.campaigns),
  };
}

function keepAvailable(selected: string[], options: FilterOption[]): string[] {
  const available = new Set(options.map((o) => o.id));
  const kept = selected.filter((id) => available.has(id));
  return kept.length === selected.length ? selected : kept;
}

/**
 * Descarta de la selección los valores que ya no están entre las opciones dadas (cada filtro por
 * separado). Se usa con las opciones del universo de calendarios, no las del período. Devuelve el MISMO objeto si no hay nada que limpiar, para poder compararlo por referencia
 * y no provocar re-renders ni loops.
 */
export function pruneFilters<T extends FilterSelection>(filters: T, options: RelevantFilterOptions): T {
  const platformIds = keepAvailable(filters.platformIds, options.platforms);
  const accountIds = keepAvailable(filters.accountIds, options.accounts);
  const contentTypeIds = keepAvailable(filters.contentTypeIds, options.contentTypes);
  const statusIds = keepAvailable(filters.statusIds, options.statuses);
  const campaigns = keepAvailable(filters.campaigns, options.campaigns);
  if (
    platformIds === filters.platformIds &&
    accountIds === filters.accountIds &&
    contentTypeIds === filters.contentTypeIds &&
    statusIds === filters.statusIds &&
    campaigns === filters.campaigns
  ) {
    return filters;
  }
  return { ...filters, platformIds, accountIds, contentTypeIds, statusIds, campaigns };
}
