import { redirect } from "next/navigation";
import { TeamPageClient } from "@/components/admin/team-page-client";
import { getCurrentProfile, listTeamMembers } from "@/lib/supabase/queries";

export default async function TeamPage() {
  const profile = await getCurrentProfile();

  // Bloqueo server-side, no solo ocultar el link en la nav: un Account
  // Manager que entra a esta URL a mano vuelve a /admin.
  if (!profile || profile.role !== "super_admin") {
    redirect("/admin");
  }

  // "Clientes asignados" es solo lectura acá: las asignaciones se gestionan desde la ficha de cada cliente.
  const members = await listTeamMembers();

  return <TeamPageClient members={members} />;
}
