"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getPublicationById } from "@/lib/supabase/queries";
import type { Publication } from "@/types";
import { isMissingV16Object as isMissingCode, V16_PENDING_MESSAGE } from "@/lib/editorial-transitions";

/**
 * Circuito editorial de v1.6 (Fase 2): aprobación del Client User, pedido de email al pasar a En revisión y
 * registro de aprobación (quién, rol, cuándo).
 *
 * Todo pasa por RPCs / tablas de supabase/migrations/20261008000001_v16_collab_core.sql. Mientras esa
 * migración no esté aplicada, PostgREST responde "función/tabla inexistente": se detecta acá y se devuelve un
 * mensaje explícito (nunca un éxito falso), sin romper el cambio de estado que ya se guardó.
 *
 * Igual que can_manage_client en publication-notifications.ts, las RPCs nuevas no están tipadas en
 * database.types.ts (se regenera recién cuando la migración esté aplicada): se castea el cliente completo,
 * no el método suelto — `rpc` depende de `this` internamente.
 */

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

interface PostgrestLikeError {
  code?: string;
  message: string;
  hint?: string | null;
}

interface RpcClient {
  rpc(
    fn: "approve_publication_as_client",
    args: { p_publication_id: string; p_expected_updated_at: string }
  ): Promise<{ error: PostgrestLikeError | null }>;
  rpc(
    fn: "request_status_email",
    args: { p_publication_id: string; p_status_key: "in_review" | "approved"; p_request_id: string }
  ): Promise<{ data: number | null; error: PostgrestLikeError | null }>;
}

interface StatusEventsTableClient {
  from(table: "publication_status_events"): {
    select(columns: string): {
      eq(column: string, value: string): {
        eq(column: string, value: string): {
          order(column: string, opts: { ascending: boolean }): {
            limit(count: number): {
              maybeSingle(): Promise<{
                data: { actor_name: string | null; actor_role: string | null; created_at: string } | null;
                error: PostgrestLikeError | null;
              }>;
            };
          };
        };
      };
    };
  };
}

function isMissingV16Object(error: PostgrestLikeError | null): boolean {
  return Boolean(error && isMissingCode(error.code));
}

function rpcClient(supabase: SupabaseServerClient): RpcClient {
  return supabase as unknown as RpcClient;
}

export interface ClientApprovalResult {
  error: string | null;
  /** La publicación cambió (estado o contenido) después de que el cliente la abrió: no se aprobó nada y la
   * vista tiene que recargarla antes de permitir aprobar de nuevo. */
  stale?: boolean;
}

/**
 * Aprobación por el Client User: solo desde En revisión, solo su propio cliente y solo sobre la versión que está
 * viendo (`expectedUpdatedAt` = publications.updated_at con el que se cargó la vista). Todo lo valida la RPC
 * en la base; si algo cambió, rechaza sin modificar datos.
 */
export async function approvePublicationAsClient(
  publicationId: string,
  expectedUpdatedAt: string
): Promise<ClientApprovalResult> {
  const supabase = await createClient();
  const { error } = await rpcClient(supabase).rpc("approve_publication_as_client", {
    p_publication_id: publicationId,
    p_expected_updated_at: expectedUpdatedAt,
  });

  if (error) {
    if (isMissingV16Object(error)) return { error: V16_PENDING_MESSAGE };
    const stale = error.hint === "v16:stale_version" || error.hint === "v16:status_changed";
    return { error: error.message, stale };
  }

  revalidatePath("/client/planner");
  return { error: null };
}

/** Versión vigente de una publicación (scopeada por RLS), para recargar la vista sin cerrarla. */
export async function fetchPublicationForView(publicationId: string): Promise<Publication | null> {
  return getPublicationById(publicationId);
}

export interface StatusEmailResult {
  error: string | null;
  /** Destinatarios encolados (0 si el cliente no tiene Client Users activos o el pedido ya existía). */
  queued: number;
}

/**
 * Registra el pedido de "Notificar al cliente por email" al pasar a En revisión. Solo ENCOLA en el outbox:
 * el envío real lo hace el worker de F5 (todavía no implementado). Idempotente por `requestId` (un
 * confirm del diálogo = un requestId), así un reintento nunca duplica emails.
 */
export async function requestReviewEmail(publicationId: string, requestId: string): Promise<StatusEmailResult> {
  const supabase = await createClient();
  const { data, error } = await rpcClient(supabase).rpc("request_status_email", {
    p_publication_id: publicationId,
    p_status_key: "in_review",
    p_request_id: requestId,
  });

  if (error) {
    if (isMissingV16Object(error)) return { error: V16_PENDING_MESSAGE, queued: 0 };
    return { error: error.message, queued: 0 };
  }
  return { error: null, queued: data ?? 0 };
}

export interface PublicationApproval {
  actorName: string | null;
  actorRole: string | null;
  approvedAt: string;
}

/** Última aprobación registrada (usuario, rol y fecha). null si no hay registro o v1.6 no está activa. */
export async function getPublicationApproval(publicationId: string): Promise<PublicationApproval | null> {
  const supabase = await createClient();
  const { data: approved } = await supabase.from("statuses").select("id").eq("key", "approved").maybeSingle();
  if (!approved) return null;

  const { data, error } = await (supabase as unknown as StatusEventsTableClient)
    .from("publication_status_events")
    .select("actor_name, actor_role, created_at")
    .eq("publication_id", publicationId)
    .eq("to_status_id", approved.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return { actorName: data.actor_name, actorRole: data.actor_role, approvedAt: data.created_at };
}
