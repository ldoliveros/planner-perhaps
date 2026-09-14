import { notFound } from "next/navigation";
import { CalendarScreen } from "@/components/calendar/calendar-screen";
import { getCalendarById, getClientById, getLookups, listPublicationsForCalendar } from "@/lib/supabase/queries";

export default async function CalendarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const calendar = await getCalendarById(id);
  if (!calendar) notFound();

  const [client, publications, lookups] = await Promise.all([
    getClientById(calendar.clientId),
    listPublicationsForCalendar(calendar.id),
    getLookups(),
  ]);
  if (!client) notFound();

  return <CalendarScreen client={client} calendar={calendar} publications={publications} lookups={lookups} />;
}
