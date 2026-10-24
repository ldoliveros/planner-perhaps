"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { UserAvatar } from "@/components/shared/user-avatar";
import { changeOwnPassword, requestPasswordReset, type ChangePasswordState, type PasswordResetState } from "@/lib/actions/auth";
import { updateDailyAgendaPreference, updateOwnProfile, type ProfileFormState } from "@/lib/actions/profile";
import { ROLE_LABELS } from "@/lib/role-labels";
import { toast } from "@/lib/toast";
import { ADMIN_CARD, ADMIN_PAGE_TITLE, ADMIN_SECTION_TITLE, ADMIN_SURFACE_VARS } from "@/lib/admin-surface";
import { cn } from "cn";
import type { UserRole } from "@/types";

/** Tarjeta de sección de Mi perfil (v1.6): blanca, borde suave, mismo padding en las tres. */
const PROFILE_CARD = cn(ADMIN_CARD, "flex flex-col gap-5 p-5 sm:p-6");

const INITIAL_STATE: ProfileFormState = { error: null, savedAt: null };
const INITIAL_PASSWORD_STATE: ChangePasswordState = { error: null, savedAt: null };
const INITIAL_RESET_STATE: PasswordResetState = { error: null, sentAt: null };

interface ProfileFormProps {
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  role: UserRole;
  /** Solo staff (role !== "client"): valor inicial de la Agenda diaria por email. Ausente si role es
   * "client" (la sección Notificaciones no se renderiza para ese rol). */
  dailyAgendaEnabled?: boolean;
}

export function ProfileForm({ email, fullName, avatarUrl, role, dailyAgendaEnabled }: ProfileFormProps) {
  const [state, formAction, isPending] = useActionState(updateOwnProfile, INITIAL_STATE);
  const lastSavedAt = useRef<number | null>(null);
  const [name, setName] = useState(fullName ?? "");
  const [preview, setPreview] = useState<string | null>(avatarUrl);

  useEffect(() => {
    if (state.savedAt && state.savedAt !== lastSavedAt.current) {
      lastSavedAt.current = state.savedAt;
      toast.success("Perfil actualizado");
    }
  }, [state.savedAt]);

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setPreview(URL.createObjectURL(file));
  }

  // v1.6: contenedor centrado (~960 px). Desktop: Información personal | Seguridad, y Notificaciones a todo el ancho
  // debajo; tablet y mobile: una columna en ese mismo orden.
  return (
    <div className={cn("mx-auto flex w-full max-w-[960px] flex-col gap-6 p-4 sm:p-6", ADMIN_SURFACE_VARS)}>
      <div className="flex flex-col gap-0.5">
        <h1 className={ADMIN_PAGE_TITLE}>Mi perfil</h1>
        <p className="text-sm text-muted-foreground">{ROLE_LABELS[role]}</p>
      </div>

      {/* Desktop: las dos tarjetas comparten la altura de la fila (stretch del grid) y cada formulario empuja su botón
          al pie (mt-auto), así "Guardar cambios" y "Actualizar contraseña" quedan alineados. Una columna: altura natural. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <section className={PROFILE_CARD} aria-labelledby="profile-personal">
      <h2 id="profile-personal" className={ADMIN_SECTION_TITLE}>Información personal</h2>
      <form action={formAction} className="flex flex-1 flex-col gap-4">
        <div className="flex items-center gap-5">
          <UserAvatar fullName={name} email={email} avatarUrl={preview} size={80} className="text-2xl" />
          <div className="flex flex-col items-start gap-2">
            <span className="text-sm font-medium text-foreground">Foto de perfil</span>
            {/* Botón "Cambiar foto": el input de archivo de siempre (mismo name, tipos y subida), oculto
                visualmente pero enfocable; el label lo abre y muestra el foco del teclado. */}
            <label
              className={cn(
                buttonVariants({ variant: "outline" }),
                "cursor-pointer has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring/50"
              )}
            >
              <Camera className="size-4" />
              Cambiar foto
              <input
                id="avatar"
                name="avatar"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleAvatarChange}
                className="sr-only"
              />
            </label>
            <p className="text-xs text-muted-foreground">JPG, PNG o WEBP. Se optimiza automáticamente.</p>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fullName">Nombre completo</Label>
          <Input id="fullName" name="fullName" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" value={email ?? ""} disabled readOnly />
          <p className="text-xs text-muted-foreground">Tu rol y clientes asignados los administra el equipo de Perhaps.</p>
        </div>

        {state.error && <p className="text-sm text-destructive">{state.error}</p>}

        <div className="mt-auto pt-2">
          <Button type="submit" disabled={isPending} className="w-fit">
            {isPending ? "Guardando..." : "Guardar cambios"}
          </Button>
        </div>
      </form>
      </section>

      {role === "client" ? <PasswordByEmailSection email={email} /> : <ChangePasswordSection />}
      </div>

      {role !== "client" && <NotificationsSection initialEnabled={dailyAgendaEnabled ?? true} />}
    </div>
  );
}

function ChangePasswordSection() {
  const [state, formAction, isPending] = useActionState(changeOwnPassword, INITIAL_PASSWORD_STATE);
  const lastSavedAt = useRef<number | null>(null);
  const [sessionKey, setSessionKey] = useState(0);

  useEffect(() => {
    if (state.savedAt && state.savedAt !== lastSavedAt.current) {
      lastSavedAt.current = state.savedAt;
      setSessionKey((k) => k + 1);
      toast.success("Contraseña actualizada");
    }
  }, [state.savedAt]);

  return (
    <section className={PROFILE_CARD} aria-labelledby="profile-security">
      <h2 id="profile-security" className={ADMIN_SECTION_TITLE}>Seguridad</h2>
      <form key={sessionKey} action={formAction} className="flex flex-1 flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="currentPassword">Contraseña actual</Label>
          <PasswordInput id="currentPassword" name="currentPassword" autoComplete="current-password" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="newPassword">Nueva contraseña</Label>
          <PasswordInput
            id="newPassword"
            name="newPassword"
            autoComplete="new-password"
            minLength={10}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirmPassword">Confirmar nueva contraseña</Label>
          <PasswordInput
            id="confirmPassword"
            name="confirmPassword"
            autoComplete="new-password"
            minLength={10}
            required
          />
        </div>

        {state.error && <p className="text-sm text-destructive">{state.error}</p>}

        <div className="mt-auto pt-2">
          <Button type="submit" disabled={isPending} className="w-fit">
            {isPending ? "Actualizando..." : "Actualizar contraseña"}
          </Button>
        </div>
      </form>
    </section>
  );
}

/**
 * Client User: crear o cambiar contraseña SIN fijarla directamente. Puede no tener una contraseña
 * actual (entra por link), así que se reutiliza el flujo de recuperación por email: el link llega a
 * su casilla, abre una sesión de recuperación y /auth/reset-password guarda la nueva contraseña.
 */
function PasswordByEmailSection({ email }: { email: string | null }) {
  const [state, formAction, isPending] = useActionState(requestPasswordReset, INITIAL_RESET_STATE);
  const lastSentAt = useRef<number | null>(null);

  useEffect(() => {
    if (state.sentAt && state.sentAt !== lastSentAt.current) {
      lastSentAt.current = state.sentAt;
      toast.success("Te enviamos un link a tu email", "Abrilo para crear o cambiar tu contraseña.");
    }
  }, [state.sentAt]);

  return (
    <section className={PROFILE_CARD} aria-labelledby="profile-security">
      <h2 id="profile-security" className={ADMIN_SECTION_TITLE}>Seguridad</h2>
      <p className="text-sm text-muted-foreground">
        Podés ingresar con email y contraseña. Para crearla o cambiarla te enviamos un link seguro a tu email.
      </p>
      <form action={formAction} className="flex flex-1 flex-col gap-3">
        <input type="hidden" name="email" value={email ?? ""} />
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        <div className="mt-auto">
          <Button type="submit" variant="outline" disabled={isPending || !email} className="w-fit">
            {isPending ? "Enviando..." : "Crear o cambiar contraseña"}
          </Button>
        </div>
      </form>
    </section>
  );
}

/**
 * Solo staff (role !== "client", ver ProfileForm). Toggle inmediato — sin botón "Guardar" aparte,
 * mismo criterio que otros toggles puntuales del proyecto (ej. cambiar estado de una publicación):
 * actualiza optimista, revierte + toast de error si falla la Server Action.
 */
function NotificationsSection({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isPending, setIsPending] = useState(false);

  async function handleChange(next: boolean) {
    setEnabled(next);
    setIsPending(true);
    const result = await updateDailyAgendaPreference(next);
    setIsPending(false);
    if (result.error) {
      setEnabled(!next);
      toast.error("No se pudo guardar", result.error);
      return;
    }
    toast.success(next ? "Agenda diaria activada" : "Agenda diaria desactivada");
  }

  return (
    <section className={PROFILE_CARD} aria-labelledby="profile-notifications">
      <h2 id="profile-notifications" className={ADMIN_SECTION_TITLE}>Notificaciones</h2>
      <label className="flex items-center justify-between gap-4">
        <span className="flex flex-col gap-0.5 pr-2">
          <span className="text-sm font-medium text-foreground">Agenda diaria por email</span>
          <span className="text-xs text-muted-foreground">
            Recibí cada mañana un resumen de los contenidos pendientes del día.
          </span>
        </span>
        <Switch checked={enabled} onCheckedChange={handleChange} disabled={isPending} />
      </label>
    </section>
  );
}
