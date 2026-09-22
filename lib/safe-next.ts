/** `/p/<id>` (link universal de Compartir, ver app/p/[id]/page.tsx): esa ruta resuelve el destino final según
 * quién esté logueado, así que no se gatea por rol acá — solo se valida que sea exactamente un segmento. */
const SHARED_PUBLICATION_PATH = /^\/p\/[^/]+$/;

/**
 * Destino de retorno tras el login (`?next=`). Solo se aceptan rutas propias de la app (/admin/..., /client/...
 * o /p/<id>): nada de URLs absolutas, `//host` ni barras invertidas (open redirect). Con `role`, además debe ser
 * una ruta de ese rol (excepto /p/<id>, que es universal); si no, se descarta y el llamador usa el destino por
 * defecto del rol.
 */
export function sanitizeNext(next: unknown, role?: "staff" | "client"): string | null {
  if (typeof next !== "string" || next.length === 0 || next.length > 2048) return null;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return null;

  let url: URL;
  try {
    url = new URL(next, "http://planner.local");
  } catch {
    return null;
  }
  if (url.origin !== "http://planner.local") return null;

  const { pathname } = url;
  const inArea = (area: string) => pathname === area || pathname.startsWith(`${area}/`);
  const isAdmin = inArea("/admin");
  const isClient = inArea("/client") && pathname !== "/client/login";
  const isSharedPublication = SHARED_PUBLICATION_PATH.test(pathname);
  if (!isAdmin && !isClient && !isSharedPublication) return null;
  if (role === "staff" && !isAdmin && !isSharedPublication) return null;
  if (role === "client" && !isClient && !isSharedPublication) return null;

  return `${pathname}${url.search}`;
}
