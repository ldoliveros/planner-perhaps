"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Suscripción a una media query. Devuelve `null` en el servidor y durante la hidratación (todavía no se
 * sabe el viewport) y `true` / `false` una vez hidratado. Sirve para montar UNA sola versión de una vista
 * pesada (desktop o mobile) en vez de renderizar las dos y ocultar una con CSS: mientras vale `null`, quien
 * la usa puede emitir ambas y dejar que el CSS decida, así el HTML del servidor no parpadea.
 */
export function useMediaQuery(query: string): boolean | null {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query]
  );
  return useSyncExternalStore<boolean | null>(
    subscribe,
    () => window.matchMedia(query).matches,
    () => null
  );
}
