import { notFound } from "next/navigation";
import { CalendarScreen } from "@/components/calendar/calendar-screen";
import {
  getClientById,
  getCurrentProfile,
  getLookups,
  listCalendarsForClient,
  listCampaignsForClient,
  listClientAccountsForClient,
  listPublicationsForClient,
} from "@/lib/supabase/queries";

export default async function ClientPlannerPage() {
  const profile = await getCurrentProfile();
  if (!profile?.clientId) notFound();

  const client = await getClientById(profile.clientId);
  if (!client) notFound();

  const [calendars, publications, clientAccounts, campaigns, lookups] = await Promise.all([
    listCalendarsForClient(client.id),
    listPublicationsForClient(client.id),
    listClientAccountsForClient(client.id),
    listCampaignsForClient(client.id),
    getLookups(),
  ]);

  return (
    <CalendarScreen
      client={client}
      calendars={calendars}
      publications={publications}
      clientAccounts={clientAccounts}
      campaigns={campaigns}
      lookups={lookups}
      readOnly
    />
  );
}
