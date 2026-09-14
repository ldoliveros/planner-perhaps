import { notFound } from "next/navigation";
import { CalendarScreen } from "@/components/calendar/calendar-screen";
import {
  getClientById,
  getLookups,
  listCalendarsForClient,
  listClientAccountsForClient,
  listPublicationsForClient,
} from "@/lib/supabase/queries";

export default async function ClientPlannerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const client = await getClientById(id);
  if (!client) notFound();

  const [calendars, publications, clientAccounts, lookups] = await Promise.all([
    listCalendarsForClient(client.id),
    listPublicationsForClient(client.id),
    listClientAccountsForClient(client.id),
    getLookups(),
  ]);

  return (
    <CalendarScreen
      client={client}
      calendars={calendars}
      publications={publications}
      clientAccounts={clientAccounts}
      lookups={lookups}
    />
  );
}
