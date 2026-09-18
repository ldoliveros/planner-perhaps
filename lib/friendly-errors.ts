/**
 * Traducciones a español de los errores PREVISIBLES que un usuario puede provocar
 * en uso normal (nombre de cliente repetido, email ya registrado, rate limit de
 * invitaciones, contraseña repetida). No es un traductor genérico: cualquier otro
 * error se registra en el servidor y el usuario ve un mensaje comprensible sin
 * detalles técnicos.
 */
interface ErrorLike {
  message: string;
  code?: string;
  status?: number;
}

const POSTGRES_UNIQUE_VIOLATION = "23505";

function includesAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

/** Error de inviteUserByEmail (alta o reenvío de invitación). */
export function friendlyInviteError(error: ErrorLike, options?: { resend?: boolean }): string {
  const message = error.message.toLowerCase();
  if (error.status === 429 || error.code === "over_email_send_rate_limit" || includesAny(message, ["rate limit", "security purposes"])) {
    return "Se enviaron demasiados mails en poco tiempo. Esperá un minuto y probá de nuevo.";
  }
  if (error.code === "email_exists" || includesAny(message, ["already been registered", "already registered"])) {
    return "Ya existe un usuario registrado con ese email.";
  }
  console.error("[invite]", error);
  return options?.resend
    ? "No se pudo reenviar la invitación. Probá de nuevo en unos minutos."
    : "No se pudo enviar la invitación. Probá de nuevo en unos minutos.";
}

/** Error al crear/editar un cliente (el slug se deriva del nombre y es único). */
export function friendlyClientSaveError(error: ErrorLike): string {
  if (error.code === POSTGRES_UNIQUE_VIOLATION) {
    return "Ya existe un cliente con ese nombre.";
  }
  console.error("[save-client]", error);
  return "No se pudo guardar el cliente. Probá de nuevo.";
}

/** Error de supabase.auth.updateUser({ password }). */
export function friendlyPasswordError(error: ErrorLike): string {
  const message = error.message.toLowerCase();
  if (error.code === "same_password" || includesAny(message, ["different from the old", "same as the old"])) {
    return "La nueva contraseña tiene que ser distinta de la actual.";
  }
  if (error.code === "weak_password" || includesAny(message, ["weak", "at least"])) {
    return "La contraseña es demasiado débil. Probá con una más larga o más difícil de adivinar.";
  }
  console.error("[update-password]", error);
  return "No se pudo actualizar la contraseña. Probá de nuevo.";
}
