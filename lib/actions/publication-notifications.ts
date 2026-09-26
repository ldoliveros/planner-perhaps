"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listClientMembers } from "@/lib/supabase/queries";
import { getSiteURL } from "@/lib/site-url";
import { formatFullDate, formatTime } from "@/lib/date-utils";

// Mismo remitente ya verificado en Resend para Planner (ver supabase/functions/daily-agenda/index.ts) —
// no se creó un remitente separado para este aviso porque no hay uno nuevo verificado en el dominio.
const FROM_ADDRESS = "Planner <agenda@perhaps.com.ar>";

/**
 * can_manage_client() no está tipada en Database["public"]["Functions"] (mismo motivo que can_view_client
 * en lib/supabase/queries.ts: agregarla ahí rompe la inferencia de otras queries). Se castea el cliente
 * completo, no el método suelto — `rpc` depende de `this` internamente.
 */
async function canManageClient(supabase: Awaited<ReturnType<typeof createClient>>, clientId: string): Promise<boolean> {
  const supabaseWithRpc = supabase as unknown as {
    rpc(fn: "can_manage_client", args: { target_client_id: string }): Promise<{ data: boolean | null; error: unknown }>;
  };
  const { data } = await supabaseWithRpc.rpc("can_manage_client", { target_client_id: clientId });
  return data === true;
}

/**
 * `publication_client_notifications` todavía no existe en Database (migración preparada, no aplicada
 * al proyecto compartido) — igual que can_view_client, se castea puntualmente en vez de tocar
 * database.types.ts, para no arriesgar romper la inferencia de otras queries ya tipadas.
 */
interface NotificationInsert {
  publication_id: string;
  recipient_user_id: string | null;
  recipient_email: string;
  status: "sent" | "failed";
  resend_email_id?: string | null;
  error_message?: string | null;
  created_by?: string | null;
}

interface NotificationsTableClient {
  insert(row: NotificationInsert): Promise<{ error: { message: string } | null }>;
  select(columns: string): {
    eq(column: string, value: string): {
      eq(column: string, value: string): {
        order(column: string, opts: { ascending: boolean }): {
          limit(count: number): {
            maybeSingle(): Promise<{ data: { sent_at: string } | null; error: unknown }>;
          };
        };
      };
    };
  };
}

function notificationsTable(admin: ReturnType<typeof createAdminClient>): NotificationsTableClient {
  return (admin as unknown as { from(table: string): NotificationsTableClient }).from(
    "publication_client_notifications"
  );
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Mismo branding que supabase/functions/daily-agenda/agenda.ts (logo, tagline, botón #26a9e0). */
function renderApprovalEmailHtml(params: {
  siteUrl: string;
  fullName: string | null;
  title: string;
  displayDate: string;
  displayTime: string | null;
  ctaUrl: string;
}): string {
  const { siteUrl, fullName, title, displayDate, displayTime, ctaUrl } = params;
  const greetingName = fullName ? escapeHtml(fullName) : null;

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Publicación lista para publicar · Planner</title>
  </head>
  <body style="margin:0; padding:0; background-color:#f4f5f7;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f5f7;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; background-color:#ffffff; border-radius:12px;">
            <tr>
              <td style="padding:40px 40px 24px 40px;" align="left">
                <img src="${siteUrl}/brand/perhaps-logo_low.png" width="150" height="47" alt="Planner by Perhaps" style="display:block; border:0; outline:none; text-decoration:none; max-width:150px;" />
                <div style="margin-top:10px; font-family:Arial, Helvetica, sans-serif; font-size:13px; color:#6b7280;">Ideas en orden. Contenido en movimiento.</div>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 40px 0 40px;" align="left">
                <h1 style="margin:0 0 16px 0; font-family:Arial, Helvetica, sans-serif; font-size:24px; line-height:1.3; color:#111827; font-weight:700;">Publicación lista para publicar</h1>
                <p style="margin:0 0 4px 0; font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:1.6; color:#4b5563;">${greetingName ? `Hola, ${greetingName}:` : "Hola:"}</p>
                <p style="margin:0 0 4px 0; font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:1.6; color:#4b5563;">Te avisamos que &ldquo;${escapeHtml(title)}&rdquo; está lista para publicarse.</p>
                <p style="margin:0 0 28px 0; font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:1.6; color:#4b5563;">Fecha prevista: <strong>${escapeHtml(displayDate)}</strong>${displayTime ? ` a las <strong>${escapeHtml(displayTime)}</strong>` : ""}.</p>
                <p style="margin:0 0 28px 0; font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:1.6; color:#4b5563;">Encontrá los textos y el material haciendo clic en el siguiente enlace.</p>

                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="border-radius:10px; background-color:#26a9e0;">
                      <a href="${ctaUrl}" target="_blank" style="display:inline-block; padding:14px 28px; font-family:Arial, Helvetica, sans-serif; font-size:14px; font-weight:700; color:#ffffff; text-decoration:none; border-radius:10px;">Ver publicación</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 40px 32px 40px;" align="left">
                <hr style="border:none; border-top:1px solid #e5e7eb; margin:0 0 20px 0;" />
                <p style="margin:0; font-family:Arial, Helvetica, sans-serif; font-size:11px; color:#9ca3af;">Planner</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function sendViaResend(params: { resendApiKey: string; from: string; to: string; subject: string; html: string }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${params.resendApiKey}` },
    body: JSON.stringify({ from: params.from, to: params.to, subject: params.subject, html: params.html }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${body?.message ?? JSON.stringify(body)}`);
  }
  return body as { id: string };
}

/** ¿Este cliente tiene al menos un Client User confirmado al que avisar? Determina si se muestra el modal. */
export async function hasNotifiableClientUsers(clientId: string): Promise<boolean> {
  const members = await listClientMembers(clientId);
  return members.some((m) => m.role === "client");
}

export interface NotifyResult {
  error: string | null;
  sentCount: number;
  failedCount: number;
}

/**
 * Envía "Publicación lista para publicar" a todos los Client Users confirmados/activos del cliente de
 * `publicationId` — un email individual por destinatario (no expone emails entre sí). Nunca bloquea la
 * aprobación: se llama DESPUÉS de que setPublicationStatus ya guardó el cambio. Cada intento (éxito o
 * falla) queda auditado en publication_client_notifications.
 */
export async function notifyClientPublicationApproved(publicationId: string): Promise<NotifyResult> {
  const supabase = await createClient();

  const { data: publication, error: pubError } = await supabase
    .from("publications")
    .select("id, title, publication_date, publication_time, client_id, status_id")
    .eq("id", publicationId)
    .maybeSingle();
  if (pubError) return { error: pubError.message, sentCount: 0, failedCount: 0 };
  if (!publication) return { error: "Publicación no encontrada o sin permisos.", sentCount: 0, failedCount: 0 };

  // Solo quien puede gestionar la publicación puede disparar el aviso — la policy RLS de publications
  // también deja leer al Client User dueño (publications_select_own), así que hace falta este chequeo
  // explícito además de la lectura de arriba.
  if (!(await canManageClient(supabase, publication.client_id))) {
    return { error: "No autorizado.", sentCount: 0, failedCount: 0 };
  }

  const { data: status } = await supabase.from("statuses").select("key").eq("id", publication.status_id).maybeSingle();
  if (status?.key !== "approved") {
    return { error: "Esta publicación no está aprobada.", sentCount: 0, failedCount: 0 };
  }

  const members = await listClientMembers(publication.client_id);
  const recipients = members.filter((m) => m.role === "client" && m.email);
  if (recipients.length === 0) {
    return { error: "Este cliente no tiene Client Users confirmados para avisar.", sentCount: 0, failedCount: 0 };
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    return { error: "Falta configurar RESEND_API_KEY en el entorno de la app.", sentCount: 0, failedCount: 0 };
  }

  const siteUrl = await getSiteURL();
  const ctaUrl = `${siteUrl}/p/${publication.id}`;
  const displayDate = formatFullDate(publication.publication_date);
  const displayTime = publication.publication_time ? formatTime(publication.publication_time) : null;
  const subject = "Publicación lista para publicar · Planner";

  const admin = createAdminClient();
  let sentCount = 0;
  let failedCount = 0;

  for (const recipient of recipients) {
    const html = renderApprovalEmailHtml({
      siteUrl,
      fullName: recipient.fullName,
      title: publication.title,
      displayDate,
      displayTime,
      ctaUrl,
    });

    const logRow: NotificationInsert = {
      publication_id: publication.id,
      recipient_user_id: recipient.id,
      recipient_email: recipient.email!,
      status: "sent",
    };

    try {
      const sent = await sendViaResend({ resendApiKey, from: FROM_ADDRESS, to: recipient.email!, subject, html });
      logRow.resend_email_id = sent.id;
      sentCount += 1;
    } catch (err) {
      logRow.status = "failed";
      logRow.error_message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
      failedCount += 1;
    }

    await notificationsTable(admin).insert(logRow);
  }

  if (failedCount > 0 && sentCount === 0) {
    return { error: "No se pudo enviar el aviso a ningún destinatario.", sentCount, failedCount };
  }
  return { error: null, sentCount, failedCount };
}

/** Fecha del último envío EXITOSO (para el drawer) — null si nunca se avisó. */
export async function getLastPublicationNotification(
  publicationId: string,
  clientId: string
): Promise<{ sentAt: string } | null> {
  const supabase = await createClient();
  if (!(await canManageClient(supabase, clientId))) return null;

  const admin = createAdminClient();
  const { data } = await notificationsTable(admin)
    .select("sent_at")
    .eq("publication_id", publicationId)
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ? { sentAt: data.sent_at } : null;
}
