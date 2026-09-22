/**
 * Actualiza uno o más query params de la URL actual con la History API nativa (no `router.replace()`), para
 * que Next sincronice `usePathname()`/`useSearchParams()` sin disparar una navegación real (sin re-ejecutar el
 * Server Component de la página ni volver a pedir datos que ya están en el cliente). Mismo patrón que la
 * optimización de e8172e6 (Semana/Mes/Lista, filtro de calendarios, cierre del drawer) — factorizado acá para
 * no repetir el mismo `URLSearchParams` + `history.replaceState` en cada lugar que lo necesita.
 *
 * `updates`: `null` borra esa key, cualquier otro string la setea. El resto de los params existentes se
 * conserva tal cual.
 */
export function replaceSearchParams(
  pathname: string,
  current: URLSearchParams,
  updates: Record<string, string | null>
): void {
  const params = new URLSearchParams(current.toString());
  for (const [key, value] of Object.entries(updates)) {
    if (value === null) params.delete(key);
    else params.set(key, value);
  }
  const query = params.toString();
  window.history.replaceState(null, "", `${pathname}${query ? `?${query}` : ""}`);
}
