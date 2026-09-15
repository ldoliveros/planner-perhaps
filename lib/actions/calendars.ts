"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/slugify";

export interface CalendarFormState {
  error: string | null;
  savedAt: number | null;
  calendarId: string | null;
}

const UNIQUE_VIOLATION = "23505";

export async function saveCalendar(
  _prevState: CalendarFormState,
  formData: FormData
): Promise<CalendarFormState> {
  const id = formData.get("id") ? String(formData.get("id")) : null;
  const clientId = String(formData.get("clientId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const status = String(formData.get("status") ?? "active") as "draft" | "active" | "archived";

  if (!clientId || !name) {
    return { error: "Completá cliente y nombre.", savedAt: null, calendarId: null };
  }

  const supabase = await createClient();

  if (id) {
    const { error } = await supabase
      .from("calendars")
      .update({ client_id: clientId, name, description, status })
      .eq("id", id);
    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        return { error: "Ya existe un calendario con ese nombre para este cliente.", savedAt: null, calendarId: null };
      }
      return { error: error.message, savedAt: null, calendarId: null };
    }
    revalidatePath("/admin/calendars");
    revalidatePath(`/admin/clients/${clientId}`);
    revalidatePath(`/admin/clients/${clientId}/planner`);
    return { error: null, savedAt: Date.now(), calendarId: id };
  }

  const slug = slugify(name);
  const { data, error } = await supabase
    .from("calendars")
    .insert({ client_id: clientId, name, slug, description, status })
    .select("id")
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { error: "Ya existe un calendario con ese nombre para este cliente.", savedAt: null, calendarId: null };
    }
    return { error: error.message, savedAt: null, calendarId: null };
  }

  revalidatePath("/admin/calendars");
  revalidatePath(`/admin/clients/${clientId}`);
  revalidatePath(`/admin/clients/${clientId}/planner`);
  return { error: null, savedAt: Date.now(), calendarId: data.id };
}

export async function setCalendarArchived(
  calendarId: string,
  clientId: string,
  archived: boolean
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("calendars")
    .update({ status: archived ? "archived" : "active" })
    .eq("id", calendarId);
  if (error) return { error: error.message };

  revalidatePath("/admin/calendars");
  revalidatePath(`/admin/clients/${clientId}`);
  revalidatePath(`/admin/clients/${clientId}/planner`);
  return { error: null };
}

/**
 * Solo permite eliminar calendarios ya archivados y sin publicaciones. Nunca
 * cascadea sobre contenido editorial: si tiene publicaciones se bloquea acá
 * mismo, en vez de dejar que el ON DELETE CASCADE de la FK las borre en
 * silencio.
 */
export async function deleteCalendar(calendarId: string, clientId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { data: calendar, error: calendarError } = await supabase
    .from("calendars")
    .select("status")
    .eq("id", calendarId)
    .maybeSingle();
  if (calendarError) return { error: calendarError.message };
  if (!calendar) return { error: "El calendario no existe." };
  if (calendar.status !== "archived") {
    return { error: "Solo se pueden eliminar calendarios archivados." };
  }

  const { count, error: countError } = await supabase
    .from("publications")
    .select("id", { count: "exact", head: true })
    .eq("calendar_id", calendarId);
  if (countError) return { error: countError.message };
  if ((count ?? 0) > 0) {
    return {
      error: `Este calendario contiene ${count} publicaci${count === 1 ? "ón" : "ones"} y no puede eliminarse definitivamente. Podés mantenerlo archivado para conservar el historial.`,
    };
  }

  const { error } = await supabase.from("calendars").delete().eq("id", calendarId);
  if (error) return { error: error.message };

  revalidatePath("/admin/calendars");
  revalidatePath(`/admin/clients/${clientId}`);
  revalidatePath(`/admin/clients/${clientId}/planner`);
  return { error: null };
}
