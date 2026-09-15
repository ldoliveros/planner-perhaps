import { redirect } from "next/navigation";
import { ProfileForm } from "@/components/shared/profile-form";
import { getCurrentProfile } from "@/lib/supabase/queries";

export default async function ClientProfilePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/client/login");

  return (
    <ProfileForm
      email={profile.email}
      fullName={profile.fullName}
      avatarUrl={profile.avatarUrl}
      role={profile.role}
    />
  );
}
