"use client";

import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/**
 * Canales Realtime SOLO con sesión válida en el navegador.
 *
 * Por qué: el cliente del navegador (supabase-js) le da a Realtime el token de la sesión y, si no hay sesión, la ANON
 * KEY (`SupabaseClient._getAccessToken`). Un canal que se une —o se re-une, o renueva su token en el heartbeat— sin
 * sesión queda con rol `anon`, que no tiene SELECT en las tablas v1.6, y Realtime rechaza los filtros con
 * "invalid column for filter …" y reintenta indefinidamente.
 *
 * Cómo se propaga el token (no hace falta llamar a `realtime.setAuth` a mano): supabase-js registra su propio
 * `onAuthStateChange` al crear el cliente (antes que este), y en INITIAL_SESSION / SIGNED_IN / TOKEN_REFRESHED llama a
 * `realtime.setAuth(token)`, que fija el token de forma sincrónica; un canal creado después desde nuestro callback ya se
 * une con ese token, y los refrescos posteriores se empujan solos a los canales abiertos.
 *
 * `whileSignedIn(setup)` ejecuta `setup` mientras haya sesión válida (y, si se indica, del usuario esperado), y su
 * teardown al perderla: SIGNED_OUT, sesión vencida, otro usuario, o un `recheck()` que detecta que la sesión ya no está
 * (p. ej. el logout se hizo en el servidor o en otra pestaña y este navegador no recibió ningún evento). Al recuperar la
 * sesión vuelve a ejecutar `setup` (canal nuevo; el anterior ya se eliminó). Devuelve la función de limpieza.
 */
export type RealtimeSetup = (ctx: {
  userId: string;
  /** true si antes hubo una sesión en este montaje que se perdió: conviene resincronizar datos. */
  resumed: boolean;
  /** Para los callbacks de estado del canal (error / cierre / timeout): confirma la sesión y, si no hay, desarma. */
  recheck: () => void;
}) => () => void;

function validUserId(session: Session | null): string | null {
  if (!session?.user?.id || !session.access_token) return null;
  // Vencida (p. ej. refresh fallido por red): no unir canales con un token que Realtime va a rechazar.
  if (session.expires_at && session.expires_at * 1000 <= Date.now()) return null;
  return session.user.id;
}

export type WhileSignedInOptions = {
  /** Solo cuenta como sesión válida la de este usuario (p. ej. el del layout). */
  expectedUserId?: string;
  /**
   * Al volver a la pestaña o recuperar la conexión, DESPUÉS de confirmar (getSession) que sigue la misma sesión válida.
   * Sin sesión no se llama (no hay consultas que vayan a responder 401); si la sesión vuelve, el que resincroniza es
   * `setup` (con `resumed: true`), así que tampoco se llama en ese caso.
   */
  onRefocus?: () => void;
};

export function whileSignedIn(setup: RealtimeSetup, options: WhileSignedInOptions = {}): () => void {
  const supabase = createClient();
  let disposed = false;
  let activeUserId: string | null = null;
  let teardown: (() => void) | null = null;
  let hadSession = false;

  const stop = () => {
    const current = teardown;
    teardown = null;
    activeUserId = null;
    current?.();
  };

  const apply = (session: Session | null) => {
    if (disposed) return;
    let userId = validUserId(session);
    if (userId && options.expectedUserId && userId !== options.expectedUserId) userId = null;
    if (userId === activeUserId) return;
    stop();
    if (!userId) return;
    activeUserId = userId;
    const resumed = hadSession;
    hadSession = true;
    teardown = setup({ userId, resumed, recheck });
  };

  function recheck(onSameSession?: () => void) {
    if (disposed) return;
    // getSession lee el almacenamiento (cookies): detecta un logout —o un nuevo login— hecho fuera de este cliente
    // (acción de servidor u otra pestaña), que no emite eventos acá. Fuera del callback de auth, así que no compite por
    // el lock de supabase-js.
    supabase.auth.getSession().then(
      ({ data }) => {
        const before = activeUserId;
        apply(data.session);
        if (onSameSession && !disposed && before !== null && activeUserId === before) onSameSession();
      },
      () => undefined
    );
  }

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session) => {
    // Sincrónico y sin llamadas a Supabase que esperen el lock de auth: solo crea o elimina canales.
    apply(event === "SIGNED_OUT" ? null : session);
  });

  const onVisible = () => {
    if (document.visibilityState === "visible") recheck(options.onRefocus);
  };
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", onVisible);

  return () => {
    disposed = true;
    subscription.unsubscribe();
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("online", onVisible);
    stop();
  };
}

/**
 * Rechazo de postgres_changes. Realtime NO lo informa como CHANNEL_ERROR: el canal queda SUBSCRIBED y el error llega
 * como mensaje `system` ({ extension: 'postgres_changes', status: 'error', message: '… invalid column for filter …' }).
 * Verificado en QA con un canal sin sesión (anon). Quien lo recibe debe cerrar el canal y confirmar la sesión.
 */
export function isPostgresChangesRejection(payload: unknown): boolean {
  const p = payload as { extension?: unknown; status?: unknown } | null;
  return !!p && p.extension === "postgres_changes" && p.status === "error";
}

/** Errores de suscripción que no se arreglan reintentando con la misma sesión: se cierra el canal en vez de reintentar. */
export function isPermanentChannelError(err: Error | undefined): boolean {
  return /invalid column|subscribe to changes|does not exist|not found|unauthorized|permission/i.test(err?.message ?? "");
}
