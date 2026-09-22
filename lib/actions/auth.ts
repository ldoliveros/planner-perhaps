"use server";

import { createClient } from "@/lib/supabase/server";
import { getSiteURL } from "@/lib/site-url";
import { friendlyPasswordError } from "@/lib/friendly-errors";
import { sanitizeNext } from "@/lib/safe-next";

export interface AuthActionState {
  error: string | null;
  /** Destino según el rol; el cliente navega ahí (ver signIn). */
  redirectTo?: string;
}

export async function signIn(_prevState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Completá email y contraseña." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Email o contraseña incorrectos." };
  }

  // Login único (/login): el destino lo decide el rol, no la pantalla. Se devuelve en lugar de usar redirect():
  // con redirect() el servidor renderiza el destino dentro de la misma respuesta y el navegador lo vuelve a pedir
  // (en producción sumaba ~3 s); devolviéndolo, el cliente navega y el destino se pide una sola vez.
  // Si venía de una ruta protegida (`next`, p. ej. un link compartido) y es de su rol, continúa ahí; si no, al destino del rol.
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  const isClient = profile?.role === "client";
  const next = sanitizeNext(formData.get("next"), isClient ? "client" : "staff");
  return { error: null, redirectTo: next ?? (isClient ? "/client/planner" : "/admin") };
}

/** Mensaje para el usuario cuando falla el envío de un link por email (magic link / recuperar contraseña). */
function emailLinkError(error: { code?: string }): string {
  return error.code === "over_email_send_rate_limit"
    ? "Pediste el link hace muy poco. Esperá unos segundos e intentá de nuevo."
    : "No se pudo enviar el link. Intentá de nuevo.";
}

export interface MagicLinkState {
  error: string | null;
  sentAt: number | null;
}

export async function requestMagicLink(
  _prevState: MagicLinkState,
  formData: FormData
): Promise<MagicLinkState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    return { error: "Completá tu email.", sentAt: null };
  }

  const siteURL = await getSiteURL();
  const supabase = await createClient();
  // Con `next` (venía de un link compartido), /auth/callback continúa ahí después de validar el link.
  const next = sanitizeNext(formData.get("next"));
  const callbackURL = `${siteURL}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ""}`;
  // shouldCreateUser: false — el link solo entra a usuarios ya invitados; un email desconocido
  // nunca crea una cuenta. Para no revelar qué emails existen, ese caso (`otp_disabled`) responde
  // igual que un envío exitoso.
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: callbackURL, shouldCreateUser: false },
  });

  if (error && error.code !== "otp_disabled") {
    return { error: emailLinkError(error), sentAt: null };
  }

  return { error: null, sentAt: Date.now() };
}

/** Cierra la sesión y devuelve a dónde ir (el cliente navega; ver SignOutButton). */
export async function signOut(redirectTo: string = "/login"): Promise<{ redirectTo: string }> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return { redirectTo };
}

export interface PasswordResetState {
  error: string | null;
  sentAt: number | null;
}

export async function requestPasswordReset(
  _prevState: PasswordResetState,
  formData: FormData
): Promise<PasswordResetState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    return { error: "Completá tu email.", sentAt: null };
  }

  const siteURL = await getSiteURL();
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteURL}/auth/callback?next=/auth/reset-password`,
  });

  if (error) {
    return { error: emailLinkError(error), sentAt: null };
  }

  return { error: null, sentAt: Date.now() };
}

export interface UpdatePasswordState {
  error: string | null;
  savedAt: number | null;
}

export async function updatePassword(
  _prevState: UpdatePasswordState,
  formData: FormData
): Promise<UpdatePasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (password.length < 10) {
    return { error: "La contraseña debe tener al menos 10 caracteres.", savedAt: null };
  }
  if (password !== confirmPassword) {
    return { error: "Las contraseñas no coinciden.", savedAt: null };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Tu sesión de recuperación expiró. Pedí un nuevo link.", savedAt: null };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: friendlyPasswordError(error), savedAt: null };

  return { error: null, savedAt: Date.now() };
}

export interface ChangePasswordState {
  error: string | null;
  savedAt: number | null;
}

/**
 * Cambio de contraseña estando logueado (Super Admin / Account Manager). El Client User crea o
 * cambia su contraseña por el flujo de recuperación por email (requestPasswordReset), porque puede
 * no tener una contraseña actual. Reautentica con la
 * contraseña actual antes de aplicar la nueva: un cambio de contraseña es
 * una operación sensible, no alcanza con tener la sesión abierta.
 */
export async function changeOwnPassword(
  _prevState: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!currentPassword) {
    return { error: "Ingresá tu contraseña actual.", savedAt: null };
  }
  if (newPassword.length < 10) {
    return { error: "La nueva contraseña debe tener al menos 10 caracteres.", savedAt: null };
  }
  if (newPassword !== confirmPassword) {
    return { error: "Las contraseñas nuevas no coinciden.", savedAt: null };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "No autenticado.", savedAt: null };

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (verifyError) return { error: "La contraseña actual no es correcta.", savedAt: null };

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { error: friendlyPasswordError(error), savedAt: null };

  return { error: null, savedAt: Date.now() };
}
