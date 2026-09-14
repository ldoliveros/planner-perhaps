import { ClientsPageClient } from "@/components/admin/clients-page-client";
import { createClient } from "@/lib/supabase/server";
import { listClients } from "@/lib/supabase/queries";

export default async function ClientsPage() {
  const [clients, supabase] = await Promise.all([listClients(), createClient()]);
  const { data: calendars } = await supabase.from("calendars").select("client_id");

  const calendarCountByClientId: Record<string, number> = {};
  for (const row of calendars ?? []) {
    calendarCountByClientId[row.client_id] = (calendarCountByClientId[row.client_id] ?? 0) + 1;
  }

  return <ClientsPageClient clients={clients} calendarCountByClientId={calendarCountByClientId} />;
}
