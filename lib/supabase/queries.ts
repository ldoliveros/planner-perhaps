import { createClient } from "./server";
import {
  mapAccountType,
  mapCalendar,
  mapClient,
  mapClientAccount,
  mapClientUser,
  mapContentType,
  mapPlatform,
  mapPublication,
  mapStatus,
} from "./mappers";
import { withSignedClientLogos, withSignedThumbnails } from "./storage";
import type {
  AccountType,
  Calendar,
  Client,
  ClientAccount,
  ClientUser,
  ContentType,
  Platform,
  Publication,
  Status,
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

export async function listAllClientAccountsAdmin(): Promise<ClientAccount[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("client_accounts").select("*").order("name");
  return (data ?? []).map(mapClientAccount);
}

export async function listClientAccountsForClient(clientId: string): Promise<ClientAccount[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("client_accounts")
    .select("*")
    .eq("client_id", clientId)
    .order("sort_order")
    .order("name");
  return (data ?? []).map(mapClientAccount);
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

export interface CurrentProfile {
  userId: string;
  email: string | null;
  role: "admin" | "client";
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
    .select("role, client_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) return null;

  return { userId: user.id, email: user.email ?? null, role: profile.role, clientId: profile.client_id };
}
