import { notFound } from "next/navigation";
import { ClientDetailPageClient } from "@/components/admin/client-detail-page-client";
import { createClient } from "@/lib/supabase/server";
import { getClientById, listCalendarsForClient } from "@/lib/supabase/queries";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const client = await getClientById(id);
  if (!client) notFound();

  const [calendars, supabase] = await Promise.all([listCalendarsForClient(client.id), createClient()]);

  const calendarIds = calendars.map((c) => c.id);
  const { data: publications } =
    calendarIds.length > 0
      ? await supabase.from("publications").select("calendar_id").in("calendar_id", calendarIds)
      : { data: [] };

  const publicationCountByCalendarId: Record<string, number> = {};
  for (const row of publications ?? []) {
    publicationCountByCalendarId[row.calendar_id] = (publicationCountByCalendarId[row.calendar_id] ?? 0) + 1;
  }

  return (
    <ClientDetailPageClient
      client={client}
      calendars={calendars}
      publicationCountByCalendarId={publicationCountByCalendarId}
    />
  );
}
