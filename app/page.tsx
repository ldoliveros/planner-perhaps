import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/supabase/queries";

export default async function Home() {
  const profile = await getCurrentProfile();

  if (!profile) redirect("/login");
  const isStaff = profile.role === "super_admin" || profile.role === "account_manager";
  redirect(isStaff ? "/admin" : "/client");
}
