import { redirect } from "next/navigation";
import { ProfileForm } from "@/components/shared/profile-form";
import { getCurrentProfile, getDailyAgendaPreference } from "@/lib/supabase/queries";

export default async function AdminProfilePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  // Solo staff ve/usa esta preferencia (ver ProfileForm) — no consultarla para Client User.
  const dailyAgendaEnabled =
    profile.role !== "client" ? await getDailyAgendaPreference(profile.userId) : undefined;

  return (
    <ProfileForm
      email={profile.email}
      fullName={profile.fullName}
      avatarUrl={profile.avatarUrl}
      role={profile.role}
      dailyAgendaEnabled={dailyAgendaEnabled}
    />
  );
}
