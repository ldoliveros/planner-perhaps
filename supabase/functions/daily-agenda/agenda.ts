// Lógica de la Agenda diaria por email — deliberadamente SIN imports de Deno ni de "@supabase/supabase-js":
// recibe un cliente Supabase ya construido (`supabase`, cualquier objeto que exponga `.from()`) y solo usa
// Web APIs estándar (fetch, Intl, Date). Así este archivo se puede correr tal cual tanto desde el entry point
// de Deno (index.ts, import relativo) como desde un script Node local para probarlo sin desplegar — es
// exactamente el mismo código en los dos casos, no una reimplementación paralela.

const TIMEZONE = "America/Argentina/Buenos_Aires";
const STALE_PROCESSING_MINUTES = 5;
const PENDING_STATUS_KEYS = ["draft", "in_review", "approved"];

export interface AgendaOptions {
  /** Cliente Supabase con permisos de service_role (bypassea RLS) — ya construido por el caller. */
  supabase: any;
  resendApiKey: string;
  fromAddress: string;
  siteUrl: string;
  /**
   * Solo QA: si se pasa, la corrida se acota a este único profile (sin importar su
   * daily_agenda_enabled), en vez de resolver todos los destinatarios reales. Nunca se usa en la
   * invocación real vía Cron.
   */
  testUserId?: string;
  /** No llama a Resend ni escribe en daily_agenda_log — solo calcula y devuelve el HTML para revisar. */
  dryRun?: boolean;
  /**
   * Solo QA: fuerza el envío real a esta dirección en vez de profile.email, sin tocar la selección
   * de destinatarios (los datos/agenda siguen siendo los del profile real). Requiere testUserId — si
   * se pasa sin testUserId se rechaza, así nunca puede afectar la corrida real vía Cron (que no manda
   * body).
   */
  overrideEmail?: string;
}

export interface AgendaClientGroup {
  clientId: string;
  clientName: string;
  clientColor: string | null;
  publications: { id: string; time: string | null; title: string; statusLabel: string; statusColor: string }[];
}

export interface AgendaRecipientResult {
  userId: string;
  email: string | null;
  fullName: string | null;
  role: string;
  totalCount: number;
  clients: AgendaClientGroup[];
  html: string;
  subject: string;
  result: "sent" | "failed" | "skipped_no_pending" | "skipped_already_sent" | "skipped_in_progress" | "dry_run";
  resendEmailId?: string;
  error?: string;
}

export interface AgendaRunResult {
  today: string;
  recipients: AgendaRecipientResult[];
}

function getTodayInBuenosAires(): string {
  // "en-CA" formatea como YYYY-MM-DD — coincide exactamente con el formato de publication_date (date, sin hora).
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date());
}

function formatDisplayDate(dateStr: string): string {
  const date = new Date(`${dateStr}T12:00:00`); // mediodía: evita que un TZ de render distinto corra el día
  // Día de la semana en minúscula a propósito (estilo de redacción del email, no un error de casing).
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: TIMEZONE,
  }).format(date);
}

function formatTime(time: string | null): string {
  if (!time) return "Sin hora";
  return time.slice(0, 5); // "14:00:00" -> "14:00"
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const CLIENT_NAME_FALLBACK_COLOR = "#26a9e0"; // azul Planner — mismo tono del CTA/branding existente

/** Luminancia relativa WCAG (sRGB) de un color #rrggbb. */
function relativeLuminance(hex: string): number | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const r = parseInt(match[1].slice(0, 2), 16);
  const g = parseInt(match[1].slice(2, 4), 16);
  const b = parseInt(match[1].slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Usa client.color para el nombre del cliente si tiene contraste suficiente sobre fondo blanco
 * (tarjeta del email); si no (o si el cliente no tiene color guardado), cae a un color legible fijo.
 */
function resolveClientNameColor(clientColor: string | null): string {
  if (!clientColor) return CLIENT_NAME_FALLBACK_COLOR;
  const luminance = relativeLuminance(clientColor);
  if (luminance === null) return CLIENT_NAME_FALLBACK_COLOR;
  const whiteLuminance = 1;
  const contrast = (whiteLuminance + 0.05) / (luminance + 0.05);
  return contrast >= 3 ? clientColor : CLIENT_NAME_FALLBACK_COLOR;
}

/** Mismo branding que supabase/email-templates/invite.html (logo, tagline, tipografía, botón #26a9e0). */
function renderEmailHtml(params: {
  siteUrl: string;
  fullName: string | null;
  displayDate: string;
  totalCount: number;
  clients: AgendaClientGroup[];
  ctaUrl: string;
}): string {
  const { siteUrl, fullName, displayDate, totalCount, clients, ctaUrl } = params;
  const greetingName = fullName ? escapeHtml(fullName.split(" ")[0]) : null;
  const itemWord = totalCount === 1 ? "contenido pendiente" : "contenidos pendientes";

  const clientSections = clients
    .map((group) => {
      const rows = group.publications
        .map(
          (p) => `
            <tr>
              <td width="64" style="width:64px; padding:6px 0; font-family:Arial, Helvetica, sans-serif; font-size:13px; color:#6b7280; white-space:nowrap; vertical-align:top;">${escapeHtml(formatTime(p.time))}</td>
              <td style="padding:6px 12px; font-family:Arial, Helvetica, sans-serif; font-size:14px; color:#111827; vertical-align:top;">${escapeHtml(p.title)}</td>
              <td style="padding:6px 0; text-align:right; vertical-align:top;">
                <span style="display:inline-block; padding:4px 12px; border-radius:999px; font-family:Arial, Helvetica, sans-serif; font-size:12px; font-weight:700; color:#ffffff; background-color:${p.statusColor};">${escapeHtml(p.statusLabel)}</span>
              </td>
            </tr>`
        )
        .join("");
      return `
        <tr>
          <td style="padding:28px 0 8px 0;" align="left">
            <p style="margin:0; font-family:Arial, Helvetica, sans-serif; font-size:14px; font-weight:700; color:${resolveClientNameColor(group.clientColor)};">${escapeHtml(group.clientName)}</p>
          </td>
        </tr>
        <tr>
          <td>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #e5e7eb;">
              ${rows}
            </table>
          </td>
        </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Tu agenda de hoy · Planner</title>
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
                <h1 style="margin:0 0 16px 0; font-family:Arial, Helvetica, sans-serif; font-size:24px; line-height:1.3; color:#111827; font-weight:700;">Tu agenda de hoy</h1>
                <p style="margin:0 0 4px 0; font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:1.6; color:#4b5563;">${greetingName ? `Hola ${greetingName},` : "Hola,"}</p>
                <p style="margin:0 0 28px 0; font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:1.6; color:#4b5563;">Tenés <strong>${totalCount} ${itemWord}</strong> para hoy, ${escapeHtml(displayDate)}.</p>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  ${clientSections}
                </table>

                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:32px;">
                  <tr>
                    <td style="border-radius:10px; background-color:#26a9e0;">
                      <a href="${ctaUrl}" target="_blank" style="display:inline-block; padding:14px 28px; font-family:Arial, Helvetica, sans-serif; font-size:14px; font-weight:700; color:#ffffff; text-decoration:none; border-radius:10px;">Ver agenda en Planner</a>
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

/**
 * Reclama el envío del día para (userId, agendaDate) — INSERT primero; si ya existe, decide si se puede
 * reintentar (failed siempre; processing solo si quedó stale > 5 min) o si hay que saltear (sent, o
 * processing todavía "fresco"). Ver diseño acordado (daily_agenda_log).
 */
async function claimSend(
  supabase: any,
  userId: string,
  agendaDate: string
): Promise<{ claimed: boolean; rowId?: string; reason?: string }> {
  const { data: inserted, error: insertErr } = await supabase
    .from("daily_agenda_log")
    .insert({ user_id: userId, agenda_date: agendaDate, status: "processing" })
    .select("id")
    .single();
  if (!insertErr) return { claimed: true, rowId: inserted.id };
  if (insertErr.code !== "23505") throw insertErr;

  const { data: existing, error: readErr } = await supabase
    .from("daily_agenda_log")
    .select("id, status, updated_at, attempt_count")
    .eq("user_id", userId)
    .eq("agenda_date", agendaDate)
    .single();
  if (readErr || !existing) throw readErr ?? new Error("daily_agenda_log: no se pudo leer la fila existente");

  if (existing.status === "sent") return { claimed: false, reason: "skipped_already_sent" };

  const staleThresholdMs = Date.now() - STALE_PROCESSING_MINUTES * 60 * 1000;
  const isStale = existing.status === "processing" && new Date(existing.updated_at).getTime() < staleThresholdMs;
  const retryable = existing.status === "failed" || isStale;
  if (!retryable) return { claimed: false, reason: "skipped_in_progress" };

  const { data: retried } = await supabase
    .from("daily_agenda_log")
    .update({ status: "processing", attempt_count: existing.attempt_count + 1 })
    .eq("id", existing.id)
    .eq("status", existing.status) // guarda optimista: si otra corrida ya lo reclamó, esto no matchea
    .select("id")
    .maybeSingle();
  if (!retried) return { claimed: false, reason: "skipped_in_progress" };
  return { claimed: true, rowId: retried.id };
}

/**
 * Determina si un usuario ya aceptó su invitación y sigue activo, usando ÚNICAMENTE datos reales de
 * Supabase Auth (email_confirmed_at + banned_until) — nunca se infiere desde `profiles` (un usuario
 * invitado ya tiene fila en profiles antes de confirmar). Equivalente a deriveUserAccessStatus() de
 * lib/user-access.ts (Next.js) === "active"; se reimplementa standalone acá a propósito: agenda.ts no
 * puede importar módulos con alias `@/` (Deno los despliega vía import relativo/npm:, no resuelve
 * paths de bundler de Next).
 */
function isConfirmedActiveAuthUser(user: { email_confirmed_at?: string | null; banned_until?: string | null }): boolean {
  if (user.banned_until && new Date(user.banned_until).getTime() > Date.now()) return false;
  return Boolean(user.email_confirmed_at);
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

export async function runDailyAgenda(options: AgendaOptions): Promise<AgendaRunResult> {
  const { supabase, resendApiKey, fromAddress, siteUrl, testUserId, dryRun, overrideEmail } = options;
  if (overrideEmail && !testUserId) {
    throw new Error("overrideEmail solo puede usarse junto con testUserId (invocación manual QA).");
  }
  const today = getTodayInBuenosAires();
  const displayDate = formatDisplayDate(today);
  const ctaUrl = `${siteUrl}/admin/publications?view=list&from=${today}&to=${today}`;

  // 1) Candidatos: normalmente Super Admin/Account Manager con daily_agenda_enabled=true; en modo QA
  // (testUserId), un único profile puntual, sin mirar su preferencia (fuerza la corrida para probarlo).
  let candidates: { id: string; email: string | null; full_name: string | null; role: string }[];
  if (testUserId) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, role")
      .eq("id", testUserId)
      .single();
    if (error || !data) throw new Error(`testUserId no encontrado: ${testUserId}`);
    if (data.role === "client") throw new Error("testUserId corresponde a un Client User — nunca recibe agenda.");
    candidates = [data];
  } else {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, role")
      .in("role", ["super_admin", "account_manager"])
      .eq("daily_agenda_enabled", true);
    if (error) throw error;
    candidates = data ?? [];
  }

  // 1b) Regla obligatoria: además de role + daily_agenda_enabled, el usuario tiene que estar
  // confirmado/activo en Auth (aceptó la invitación). Bug real detectado en QA del 2026-09-25: un
  // Account Manager invitado pero sin confirmar recibía la agenda igual. Se aplica también en modo QA
  // (testUserId): un usuario sin confirmar no debería poder disparar un envío real ni de prueba.
  const { data: authList, error: authListErr } = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (authListErr) throw authListErr;
  const authById = new Map(authList.users.map((u: { id: string }) => [u.id, u]));
  if (testUserId) {
    const authUser = authById.get(testUserId);
    if (!authUser || !isConfirmedActiveAuthUser(authUser)) {
      throw new Error(`testUserId ${testUserId} no está confirmado/activo en Auth — no recibiría la agenda real.`);
    }
  }
  candidates = candidates.filter((c) => {
    const authUser = authById.get(c.id);
    return authUser ? isConfirmedActiveAuthUser(authUser) : false;
  });

  // 2) Catálogo de estados "pendientes" (id -> label/color) — una sola vez para toda la corrida.
  const { data: statuses, error: statusesErr } = await supabase
    .from("statuses")
    .select("id, key, label, color")
    .in("key", PENDING_STATUS_KEYS);
  if (statusesErr) throw statusesErr;
  const pendingStatusIds = (statuses ?? []).map((s: any) => s.id);
  const statusById = new Map((statuses ?? []).map((s: any) => [s.id, s]));

  // 3) Todos los clientes + todas las asignaciones de una sola vez (evita N+1 por destinatario).
  const { data: allClients, error: clientsErr } = await supabase.from("clients").select("id, name, color");
  if (clientsErr) throw clientsErr;
  const clientNameById = new Map((allClients ?? []).map((c: any) => [c.id, c.name]));
  const clientColorById = new Map((allClients ?? []).map((c: any) => [c.id, c.color]));

  const { data: assignments, error: assignmentsErr } = await supabase
    .from("user_client_assignments")
    .select("user_id, client_id");
  if (assignmentsErr) throw assignmentsErr;
  const clientIdsByUser = new Map<string, string[]>();
  for (const a of assignments ?? []) {
    const list = clientIdsByUser.get(a.user_id) ?? [];
    list.push(a.client_id);
    clientIdsByUser.set(a.user_id, list);
  }
  const allClientIds = (allClients ?? []).map((c: any) => c.id);

  const results: AgendaRecipientResult[] = [];

  for (const profile of candidates) {
    const clientIds = profile.role === "super_admin" ? allClientIds : (clientIdsByUser.get(profile.id) ?? []);
    if (clientIds.length === 0 || pendingStatusIds.length === 0) {
      results.push(emptyResult(profile, "skipped_no_pending"));
      continue;
    }

    const { data: pubs, error: pubsErr } = await supabase
      .from("publications")
      .select("id, client_id, title, publication_time, status_id")
      .eq("publication_date", today)
      .in("client_id", clientIds)
      .in("status_id", pendingStatusIds)
      .order("publication_time", { ascending: true, nullsFirst: true });
    if (pubsErr) throw pubsErr;

    if (!pubs || pubs.length === 0) {
      results.push(emptyResult(profile, "skipped_no_pending"));
      continue;
    }

    const groups = new Map<string, AgendaClientGroup>();
    for (const p of pubs) {
      const status = statusById.get(p.status_id);
      const group = groups.get(p.client_id) ?? {
        clientId: p.client_id,
        clientName: clientNameById.get(p.client_id) ?? "Cliente",
        clientColor: clientColorById.get(p.client_id) ?? null,
        publications: [],
      };
      group.publications.push({
        id: p.id,
        time: p.publication_time,
        title: p.title,
        statusLabel: status?.label ?? "—",
        statusColor: status?.color ?? "#94A3B8",
      });
      groups.set(p.client_id, group);
    }
    const clientGroups = Array.from(groups.values()).sort((a, b) => a.clientName.localeCompare(b.clientName));

    const subject = "Tu agenda de hoy · Planner";
    const html = renderEmailHtml({
      siteUrl,
      fullName: profile.full_name,
      displayDate,
      totalCount: pubs.length,
      clients: clientGroups,
      ctaUrl,
    });

    if (dryRun) {
      results.push({
        userId: profile.id,
        email: profile.email,
        fullName: profile.full_name,
        role: profile.role,
        totalCount: pubs.length,
        clients: clientGroups,
        html,
        subject,
        result: "dry_run",
      });
      continue;
    }

    const claim = await claimSend(supabase, profile.id, today);
    if (!claim.claimed) {
      results.push({
        userId: profile.id,
        email: profile.email,
        fullName: profile.full_name,
        role: profile.role,
        totalCount: pubs.length,
        clients: clientGroups,
        html,
        subject,
        result: (claim.reason as AgendaRecipientResult["result"]) ?? "skipped_in_progress",
      });
      continue;
    }

    try {
      const recipientEmail = overrideEmail ?? profile.email;
      if (!recipientEmail) throw new Error("El profile no tiene email.");
      const sent = await sendViaResend({ resendApiKey, from: fromAddress, to: recipientEmail, subject, html });
      await supabase.from("daily_agenda_log").update({ status: "sent", resend_email_id: sent.id }).eq("id", claim.rowId);
      results.push({
        userId: profile.id,
        email: profile.email,
        fullName: profile.full_name,
        role: profile.role,
        totalCount: pubs.length,
        clients: clientGroups,
        html,
        subject,
        result: "sent",
        resendEmailId: sent.id,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await supabase.from("daily_agenda_log").update({ status: "failed", error_message: message.slice(0, 500) }).eq("id", claim.rowId);
      results.push({
        userId: profile.id,
        email: profile.email,
        fullName: profile.full_name,
        role: profile.role,
        totalCount: pubs.length,
        clients: clientGroups,
        html,
        subject,
        result: "failed",
        error: message,
      });
    }
  }

  return { today, recipients: results };
}

function emptyResult(
  profile: { id: string; email: string | null; full_name: string | null; role: string },
  result: AgendaRecipientResult["result"]
): AgendaRecipientResult {
  return {
    userId: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    role: profile.role,
    totalCount: 0,
    clients: [],
    html: "",
    subject: "",
    result,
  };
}
