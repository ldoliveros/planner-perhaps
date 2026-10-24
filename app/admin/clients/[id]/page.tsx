import { notFound } from "next/navigation";
import { ClientDetailPageClient } from "@/components/admin/client-detail-page-client";
import { createClient } from "@/lib/supabase/server";
import {
  countActivePublicationsByCalendar,
  getClientById,
  getCurrentProfile,
  getLookups,
  listCalendarsForClient,
  listClientAccountsForClient,
  listTeamMembers,
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

  // v1.6: conteos sin archivadas (ver countActivePublicationsByCalendar).
  const publicationCountByCalendarId = await countActivePublicationsByCalendar(calendars.map((c) => c.id));

  // v1.6 "Equipo asignado": miembros internos activos con sus asignaciones (misma consulta que la página Equipo,
  // solo para Super Admin, que es quien puede gestionarlas).
  const teamMembers =
    profile?.role === "super_admin"
      ? (await listTeamMembers())
          .filter((m) => m.active)
          .map((m) => ({ id: m.id, name: m.fullName || m.email || "Sin nombre", assignedClientIds: m.assignedClients.map((c) => c.id) }))
          .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }))
      : null;

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
      teamMembers={teamMembers}
    />
  );
}
