"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface CreateCampaignResult {
  campaign?: { id: string; name: string };
  error?: string;
}

/**
 * Busca una campaña equivalente (mismo cliente, nombre case-insensitive/trim)
 * antes de crear una nueva — el índice único de la base es la barrera real
 * contra duplicados por carrera; esta función solo evita el caso feliz.
 */
export async function createOrGetCampaign(clientId: string, rawName: string): Promise<CreateCampaignResult> {
  const name = rawName.trim();
  if (!name) return { error: "El nombre de la campaña no puede estar vacío." };
  if (!clientId) return { error: "Elegí un calendario antes de crear una campaña." };

  const supabase = await createClient();

  const { data: existing, error: existingError } = await supabase
    .from("campaigns")
    .select("id, name, archived_at")
    .eq("client_id", clientId)
    .ilike("name", name)
    .maybeSingle();
  if (existingError) return { error: existingError.message };

  if (existing) {
    if (existing.archived_at) {
      const { error: unarchiveError } = await supabase
        .from("campaigns")
        .update({ archived_at: null })
        .eq("id", existing.id);
      if (unarchiveError) return { error: unarchiveError.message };
    }
    return { campaign: { id: existing.id, name: existing.name } };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: created, error: createError } = await supabase
    .from("campaigns")
    .insert({ client_id: clientId, name, created_by: user?.id ?? null })
    .select("id, name")
    .single();

  if (createError) {
    // Carrera: otra request creó la misma campaña (case-insensitive) entre el
    // SELECT y el INSERT — el índice único la rechazó. Reutilizamos esa fila.
    const { data: retry } = await supabase
      .from("campaigns")
      .select("id, name")
      .eq("client_id", clientId)
      .ilike("name", name)
      .maybeSingle();
    if (retry) return { campaign: { id: retry.id, name: retry.name } };
    return { error: createError.message };
  }

  revalidatePath(`/admin/clients/${clientId}/planner`);
  revalidatePath(`/admin/clients/${clientId}`);
  return { campaign: { id: created.id, name: created.name } };
}
