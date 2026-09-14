import { PublicationsSearchPageClient } from "@/components/admin/publications-search-page-client";
import {
  getLookups,
  listAllClientAccountsAdmin,
  listAllPublicationsAdmin,
  listCalendars,
  listClients,
} from "@/lib/supabase/queries";

export default async function AdminPublicationsPage() {
  const [publications, clients, calendars, clientAccounts, lookups] = await Promise.all([
    listAllPublicationsAdmin(),
    listClients(),
    listCalendars(),
    listAllClientAccountsAdmin(),
    getLookups(),
  ]);

  return (
    <PublicationsSearchPageClient
      publications={publications}
      clients={clients}
      calendars={calendars}
      clientAccounts={clientAccounts}
      platforms={lookups.platforms}
      contentTypes={lookups.contentTypes}
      statuses={lookups.statuses}
    />
  );
}
