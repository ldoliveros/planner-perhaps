"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSiteURL } from "@/lib/site-url";

export interface AuthActionState {
  error: string | null;
}

export async function signIn(_prevState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Completá email y contraseña." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Email o contraseña incorrectos." };
  }

  redirect("/admin");
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
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${siteURL}/auth/callback` },
  });

  if (error) {
    return { error: "No se pudo enviar el link. Intentá de nuevo.", sentAt: null };
  }

  return { error: null, sentAt: Date.now() };
}

export async function signOut(redirectTo: string = "/login") {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(redirectTo);
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
    return { error: "No se pudo enviar el link. Intentá de nuevo.", sentAt: null };
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
  if (error) return { error: error.message, savedAt: null };

  return { error: null, savedAt: Date.now() };
}

export interface ChangePasswordState {
  error: string | null;
  savedAt: number | null;
}

/**
 * Cambio de contraseña estando logueado (Super Admin / Account Manager —
 * Client User sigue siendo exclusivamente Magic Link). Reautentica con la
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
  if (error) return { error: error.message, savedAt: null };

  return { error: null, savedAt: Date.now() };
}
