import { PublicationsSearchPageClient } from "@/components/admin/publications-search-page-client";
import {
  getLookups,
  listAllCampaignsAdmin,
  listAllClientAccountsAdmin,
  listAllPublicationsAdmin,
  listCalendars,
  listClients,
} from "@/lib/supabase/queries";

export default async function AdminPublicationsPage() {
  const [publications, clients, calendars, clientAccounts, campaigns, lookups] = await Promise.all([
    listAllPublicationsAdmin(),
    listClients(),
    listCalendars(),
    listAllClientAccountsAdmin(),
    listAllCampaignsAdmin(),
    getLookups(),
  ]);

  return (
    <PublicationsSearchPageClient
      publications={publications}
      clients={clients}
      calendars={calendars}
      clientAccounts={clientAccounts}
      campaigns={campaigns}
      platforms={lookups.platforms}
      contentTypes={lookups.contentTypes}
      statuses={lookups.statuses}
    />
  );
}
