import { redirect } from "next/navigation";
import { getMostRecentCalendarId } from "@/lib/supabase/queries";

export default async function AdminIndexPage() {
  const calendarId = await getMostRecentCalendarId();
  redirect(calendarId ? `/admin/calendars/${calendarId}` : "/admin/clients");
}
