"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { UserAvatar } from "@/components/shared/user-avatar";
import { changeOwnPassword, requestPasswordReset, type ChangePasswordState, type PasswordResetState } from "@/lib/actions/auth";
import { updateDailyAgendaPreference, updateOwnProfile, type ProfileFormState } from "@/lib/actions/profile";
import { ROLE_LABELS } from "@/lib/role-labels";
import { toast } from "@/lib/toast";
import type { UserRole } from "@/types";

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

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 p-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Mi perfil</h1>
        <p className="text-sm text-muted-foreground">{ROLE_LABELS[role]}</p>
      </div>

      <form action={formAction} className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <UserAvatar fullName={name} email={email} avatarUrl={preview} size={64} className="text-xl" />
          <div className="flex flex-col gap-1">
            <Label htmlFor="avatar">Foto de perfil</Label>
            <Input id="avatar" name="avatar" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAvatarChange} />
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

        <Button type="submit" disabled={isPending} className="mt-2 w-fit">
          {isPending ? "Guardando..." : "Guardar cambios"}
        </Button>
      </form>

      <Separator />
      {role === "client" ? <PasswordByEmailSection email={email} /> : <ChangePasswordSection />}

      {role !== "client" && (
        <>
          <Separator />
          <NotificationsSection initialEnabled={dailyAgendaEnabled ?? true} />
        </>
      )}
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
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-foreground">Cambiar contraseña</h2>
      <form key={sessionKey} action={formAction} className="flex flex-col gap-4">
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

        <Button type="submit" disabled={isPending} className="w-fit">
          {isPending ? "Actualizando..." : "Actualizar contraseña"}
        </Button>
      </form>
    </div>
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
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-foreground">Contraseña</h2>
      <p className="text-sm text-muted-foreground">
        Podés ingresar con email y contraseña. Para crearla o cambiarla te enviamos un link seguro a tu email.
      </p>
      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="email" value={email ?? ""} />
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        <Button type="submit" variant="outline" disabled={isPending || !email} className="w-fit">
          {isPending ? "Enviando..." : "Crear o cambiar contraseña"}
        </Button>
      </form>
    </div>
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
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-foreground">Notificaciones</h2>
      <label className="flex items-center justify-between gap-4">
        <span className="flex flex-col gap-0.5 pr-2">
          <span className="text-sm font-medium text-foreground">Agenda diaria por email</span>
          <span className="text-xs text-muted-foreground">
            Recibí cada mañana un resumen de los contenidos pendientes del día.
          </span>
        </span>
        <Switch checked={enabled} onCheckedChange={handleChange} disabled={isPending} />
      </label>
    </div>
  );
}
