"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface CalendarFormState {
  error: string | null;
  savedAt: number | null;
  calendarId: string | null;
}

export async function saveCalendar(
  _prevState: CalendarFormState,
  formData: FormData
): Promise<CalendarFormState> {
  const id = formData.get("id") ? String(formData.get("id")) : null;
  const clientId = String(formData.get("clientId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const month = Number(formData.get("month"));
  const year = Number(formData.get("year"));
  const description = String(formData.get("description") ?? "").trim() || null;
  const status = String(formData.get("status") ?? "active") as "draft" | "active" | "archived";
  const driveFolderUrl = String(formData.get("driveFolderUrl") ?? "").trim() || null;

  if (!clientId || !name || !month || !year) {
    return { error: "Completá cliente, nombre, mes y año.", savedAt: null, calendarId: null };
  }
  if (month < 1 || month > 12) {
    return { error: "El mes debe estar entre 1 y 12.", savedAt: null, calendarId: null };
  }

  const supabase = await createClient();

  if (id) {
    const { error } = await supabase
      .from("calendars")
      .update({ client_id: clientId, name, month, year, description, status, drive_folder_url: driveFolderUrl })
      .eq("id", id);
    if (error) return { error: error.message, savedAt: null, calendarId: null };
    revalidatePath("/admin/calendars");
    revalidatePath(`/admin/calendars/${id}`);
    return { error: null, savedAt: Date.now(), calendarId: id };
  }

  const { data, error } = await supabase
    .from("calendars")
    .insert({ client_id: clientId, name, month, year, description, status, drive_folder_url: driveFolderUrl })
    .select("id")
    .single();
  if (error) return { error: error.message, savedAt: null, calendarId: null };

  revalidatePath("/admin/calendars");
  return { error: null, savedAt: Date.now(), calendarId: data.id };
}
