import { notFound } from "next/navigation";
import { ClientDetailPageClient } from "@/components/admin/client-detail-page-client";
import { createClient } from "@/lib/supabase/server";
import {
  getClientById,
  getCurrentProfile,
  getLookups,
  listCalendarsForClient,
  listClientAccountsForClient,
  listUsersForClient,
  withAccessStatus,
} from "@/lib/supabase/queries";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const client = await getClientById(id);
  if (!client) notFound();

  const [calendars, clientAccounts, clientUsers, lookups, supabase, profile] = await Promise.all([
    listCalendarsForClient(client.id),
    listClientAccountsForClient(client.id),
    listUsersForClient(client.id),
    getLookups(),
    createClient(),
    getCurrentProfile(),
  ]);

  const calendarIds = calendars.map((c) => c.id);
  const { data: publications } =
    calendarIds.length > 0
      ? await supabase.from("publications").select("calendar_id").in("calendar_id", calendarIds)
      : { data: [] };

  const publicationCountByCalendarId: Record<string, number> = {};
  for (const row of publications ?? []) {
    publicationCountByCalendarId[row.calendar_id] = (publicationCountByCalendarId[row.calendar_id] ?? 0) + 1;
  }

  const accountIds = clientAccounts.map((a) => a.id);
  const { data: usedDestinations } =
    accountIds.length > 0
      ? await supabase.from("publication_destinations").select("client_account_id").in("client_account_id", accountIds)
      : { data: [] };
  const usedAccountIds = Array.from(new Set((usedDestinations ?? []).map((d) => d.client_account_id)));

  return (
    <ClientDetailPageClient
      client={client}
      calendars={calendars}
      publicationCountByCalendarId={publicationCountByCalendarId}
      clientAccounts={clientAccounts}
      usedAccountIds={usedAccountIds}
      platforms={lookups.platforms}
      accountTypes={lookups.accountTypes}
      clientUsers={profile?.role === "super_admin" ? await withAccessStatus(clientUsers) : clientUsers}
      canEditClient={profile?.role === "super_admin"}
    />
  );
}
