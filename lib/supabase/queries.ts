import { createClient } from "./server";
import {
  mapAccountType,
  mapCalendar,
  mapClient,
  mapContentType,
  mapPlatform,
  mapPublication,
  mapStatus,
} from "./mappers";
import { withSignedClientLogos, withSignedThumbnails } from "./storage";
import type { AccountType, Calendar, Client, ContentType, Platform, Publication, Status } from "@/types";

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
  const { data } = await supabase
    .from("calendars")
    .select("*")
    .order("year", { ascending: false })
    .order("month", { ascending: false });
  return (data ?? []).map(mapCalendar);
}

export async function getCalendarById(id: string): Promise<Calendar | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("calendars").select("*").eq("id", id).maybeSingle();
  return data ? mapCalendar(data) : null;
}

export async function getMostRecentCalendarId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("calendars")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export async function listPublicationsForCalendar(calendarId: string): Promise<Publication[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("publications")
    .select(PUBLICATION_SELECT)
    .eq("calendar_id", calendarId)
    .order("publication_date");
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
