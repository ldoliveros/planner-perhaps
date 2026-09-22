import { createAdminClient, requireSuperAdmin } from "./admin";
import { createClient } from "./server";
import {
  mapAccountType,
  mapCalendar,
  mapCampaign,
  mapClient,
  mapClientAccount,
  mapClientUser,
  mapContentType,
  mapPlatform,
  mapPublication,
  mapStatus,
} from "./mappers";
import { withSignedClientLogos, withSignedThumbnails } from "./storage";
import { deriveUserAccessStatus } from "@/lib/user-access";
import type {
  AccountType,
  Calendar,
  Campaign,
  Client,
  ClientAccount,
  ClientUser,
  UserAccessStatus,
  ContentType,
  Platform,
  Publication,
  Status,
  TeamMember,
} from "@/types";

const PUBLICATION_SELECT = "*, publication_destinations(*), publication_assets(*)";

export interface Lookups {
  platforms: Platform[];
  accountTypes: AccountType[];
  contentTypes: ContentType[];
  statuses: Status[];
}

export async function getLookups(): Promise<Lookups> {
  const supabase = await createClient();
  const [platforms, accountTypes, contentTypes, statuses] = await Promise.all([
    supabase.from("platforms").select("*").eq("active", true).order("sort_order"),
    supabase.from("account_types").select("*").order("sort_order"),
    supabase.from("content_types").select("*").order("sort_order"),
    supabase.from("statuses").select("*").order("sort_order"),
  ]);

  return {
    platforms: (platforms.data ?? []).map(mapPlatform),
    accountTypes: (accountTypes.data ?? []).map(mapAccountType),
    contentTypes: (contentTypes.data ?? []).map(mapContentType),
    statuses: (statuses.data ?? []).map(mapStatus),
  };
}

export async function listClients(): Promise<Client[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("clients").select("*").order("name");
  const clients = (data ?? []).map(mapClient);
  return withSignedClientLogos(supabase, clients);
}

export async function getClientById(id: string): Promise<Client | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const [client] = await withSignedClientLogos(supabase, [mapClient(data)]);
  return client;
}

export async function listCalendars(): Promise<Calendar[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("calendars").select("*").order("name");
  return (data ?? []).map(mapCalendar);
}

export async function listCalendarsForClient(clientId: string): Promise<Calendar[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("calendars").select("*").eq("client_id", clientId).order("name");
  return (data ?? []).map(mapCalendar);
}

/** Orden estable por handle sin distinguir mayúsculas (opcionalmente después de sort_order). */
function sortAccountsByHandle(accounts: ClientAccount[], options: { bySortOrder?: boolean } = {}): ClientAccount[] {
  return [...accounts].sort((a, b) => {
    if (options.bySortOrder && a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.handle.localeCompare(b.handle, undefined, { sensitivity: "base" }) || a.id.localeCompare(b.id);
  });
}

export async function listAllClientAccountsAdmin(): Promise<ClientAccount[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("client_accounts").select("*");
  return sortAccountsByHandle((data ?? []).map(mapClientAccount));
}

export async function listClientAccountsForClient(clientId: string): Promise<ClientAccount[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("client_accounts")
    .select("*")
    .eq("client_id", clientId);
  return sortAccountsByHandle((data ?? []).map(mapClientAccount), { bySortOrder: true });
}

export async function listCampaignsForClient(clientId: string): Promise<Campaign[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("campaigns")
    .select("*")
    .eq("client_id", clientId)
    .order("name");
  return (data ?? []).map(mapCampaign);
}

export async function listAllCampaignsAdmin(): Promise<Campaign[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("campaigns").select("*").order("name");
  return (data ?? []).map(mapCampaign);
}

export async function listPublicationsForClient(clientId: string): Promise<Publication[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("publications")
    .select(PUBLICATION_SELECT)
    .eq("client_id", clientId)
    .order("publication_date");
  const publications = (data ?? []).map(mapPublication);
  return withSignedThumbnails(supabase, publications);
}

export async function listAllPublicationsAdmin(): Promise<Publication[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("publications").select(PUBLICATION_SELECT).order("publication_date");
  const publications = (data ?? []).map(mapPublication);
  return withSignedThumbnails(supabase, publications);
}

export async function getPublicationById(id: string): Promise<Publication | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("publications").select(PUBLICATION_SELECT).eq("id", id).maybeSingle();
  if (!data) return null;
  const [publication] = await withSignedThumbnails(supabase, [mapPublication(data)]);
  return publication;
}

export async function listUsersForClient(clientId: string): Promise<ClientUser[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at");
  return (data ?? []).map(mapClientUser);
}

/**
 * Estado de acceso de cada usuario, derivado de Supabase Auth (banned_until /
 * email_confirmed_at). Requiere la Auth Admin API: solo Super Admin.
 *
 * admin.auth.admin.listUsers() pega contra la API de Auth (no PostgREST) y no
 * tiene timeout propio: si esa API está lenta, un await sin acotar cuelga la
 * página entera. Se acota con una carrera contra un timer y, si no responde a
 * tiempo, devuelve null: quien llama muestra a todos como "Activo" por default
 * (estado visual, no afecta el bloqueo real de acceso vía ban_duration).
 */
async function getAccessStatusById(): Promise<Map<string, UserAccessStatus> | null> {
  await requireSuperAdmin();
  const admin = createAdminClient();
  const authList = await Promise.race([
    admin.auth.admin.listUsers({ perPage: 200 }).then((res) => res.data.users),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
  ]);
  if (!authList) return null;
  return new Map(authList.map((u) => [u.id, deriveUserAccessStatus(u)]));
}

/** Agrega `accessStatus` a los usuarios Client de una ficha. Super-Admin-only. */
export async function withAccessStatus(users: ClientUser[]): Promise<ClientUser[]> {
  const accessById = await getAccessStatusById();
  if (!accessById) return users;
  return users.map((u) => ({ ...u, accessStatus: accessById.get(u.id) }));
}

/**
 * Equipo interno (Super Admin + Account Manager) con sus clientes asignados
 * y estado real de acceso (Auth). Super-Admin-only: usa
 * createAdminClient() para leer el estado de ban, que no vive en `profiles`.
 */
export async function listTeamMembers(): Promise<TeamMember[]> {
  await requireSuperAdmin();
  const supabase = await createClient();

  // getAccessStatusById() (Auth Admin API) no depende de profiles/assignments/clients — se dispara ya
  // mismo en paralelo con esa cadena en vez de esperar a que termine, para no sumarle un salto más al
  // waterfall (era el último await de la función, puramente secuencial sin necesidad).
  const accessByIdPromise = getAccessStatusById();

  const { data: profilesData } = await supabase
    .from("profiles")
    .select("id, email, full_name, avatar_url, role, created_at")
    .in("role", ["super_admin", "account_manager"])
    .order("created_at");
  const members = profilesData ?? [];

  const memberIds = members.map((m) => m.id);
  const { data: assignments } =
    memberIds.length > 0
      ? await supabase.from("user_client_assignments").select("user_id, client_id").in("user_id", memberIds)
      : { data: [] as { user_id: string; client_id: string }[] };

  const clientIds = Array.from(new Set((assignments ?? []).map((a) => a.client_id)));
  const { data: clientsData } =
    clientIds.length > 0 ? await supabase.from("clients").select("id, name").in("id", clientIds) : { data: [] };
  const clientNameById = new Map((clientsData ?? []).map((c) => [c.id, c.name]));

  const accessById = await accessByIdPromise;

  return members.map((m) => ({
    id: m.id,
    email: m.email,
    fullName: m.full_name,
    avatarUrl: m.avatar_url,
    role: m.role as "super_admin" | "account_manager",
    assignedClients: (assignments ?? [])
      .filter((a) => a.user_id === m.id)
      .map((a) => ({ id: a.client_id, name: clientNameById.get(a.client_id) ?? "—" })),
    active: (accessById?.get(m.id) ?? "active") !== "disabled",
    accessStatus: accessById?.get(m.id) ?? "active",
    createdAt: m.created_at,
  }));
}

export interface CurrentProfile {
  userId: string;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  role: "super_admin" | "account_manager" | "client";
  clientId: string | null;
}

export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, client_id, full_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) return null;

  return {
    userId: user.id,
    email: user.email ?? null,
    fullName: profile.full_name,
    avatarUrl: profile.avatar_url,
    role: profile.role,
    clientId: profile.client_id,
  };
}

/**
 * v1.2 Bloque A — última versión de Perhaps Planner cuyas novedades el
 * usuario actual ya vio (banner "Nuevas actualizaciones"). Separada de
 * getCurrentProfile() a propósito: depende de profiles.last_seen_version,
 * columna todavía no aplicada contra la base compartida de dev/producción
 * (ver supabase/migrations/20260917000001_last_seen_version.sql) — no
 * tocar el select de getCurrentProfile(), que se usa en todo el admin/client
 * layout y rompería cada carga de página si la columna no existe todavía.
 */
export async function getLastSeenVersion(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("last_seen_version").eq("id", userId).maybeSingle();
  return data?.last_seen_version ?? null;
}
