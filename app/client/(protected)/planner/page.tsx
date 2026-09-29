import { notFound } from "next/navigation";
import { CalendarScreen } from "@/components/calendar/calendar-screen";
import {
  getClientById,
  getCurrentProfile,
  getLookups,
  listCalendarsForClient,
  listCampaignsForClient,
  listClientAccountsForClient,
  listClientMembers,
  listPublicationsForClient,
} from "@/lib/supabase/queries";

export default async function ClientPlannerPage() {
  const profile = await getCurrentProfile();
  if (!profile?.clientId) notFound();

  const client = await getClientById(profile.clientId);
  if (!client) notFound();

  const [calendars, publications, clientAccounts, campaigns, lookups, members] = await Promise.all([
    listCalendarsForClient(client.id),
    listPublicationsForClient(client.id),
    listClientAccountsForClient(client.id),
    listCampaignsForClient(client.id),
    getLookups(),
    listClientMembers(client.id),
  ]);

  return (
    <CalendarScreen
      client={client}
      calendars={calendars}
      // internalNotes es exclusivo de staff: se descarta acá, en servidor, para que nunca viaje al navegador
      // del Client User (no alcanza con ocultarlo en la UI).
      publications={publications.map((p) => ({ ...p, internalNotes: null }))}
      clientAccounts={clientAccounts}
      campaigns={campaigns}
      lookups={lookups}
      members={members}
      readOnly
    />
  );
}
