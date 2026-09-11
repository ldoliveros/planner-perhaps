import { notFound } from "next/navigation";
import { CalendarScreen } from "@/components/calendar/calendar-screen";
import { AIONIS_CLIENT, AIONIS_PUBLICATIONS, AIONIS_SEPTEMBER } from "@/lib/mock/aionis";

const CALENDARS = [AIONIS_SEPTEMBER];
const CLIENTS = [AIONIS_CLIENT];

export default async function CalendarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const calendar = CALENDARS.find((c) => c.id === id);
  if (!calendar) notFound();

  const client = CLIENTS.find((c) => c.id === calendar.clientId);
  if (!client) notFound();

  const publications = AIONIS_PUBLICATIONS.filter((p) => p.calendarId === calendar.id);

  return <CalendarScreen client={client} calendar={calendar} publications={publications} />;
}
