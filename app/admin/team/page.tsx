import { redirect } from "next/navigation";
import { TeamPageClient } from "@/components/admin/team-page-client";
import { getCurrentProfile, listClients, listTeamMembers } from "@/lib/supabase/queries";

export default async function TeamPage() {
  const profile = await getCurrentProfile();

  // Bloqueo server-side, no solo ocultar el link en la nav: un Account
  // Manager que entra a esta URL a mano vuelve a /admin.
  if (!profile || profile.role !== "super_admin") {
    redirect("/admin");
  }

  const [members, clients] = await Promise.all([listTeamMembers(), listClients()]);

  return <TeamPageClient members={members} clients={clients} />;
}
