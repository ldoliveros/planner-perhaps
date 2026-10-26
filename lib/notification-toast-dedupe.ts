/**
 * Evita mostrar el mismo toast de notificación en varias pestañas (v1.6). Cada pestaña tiene su propia
 * suscripción Realtime, así que todas reciben el mismo evento. Reglas:
 *   1. Solo intenta mostrarlo una pestaña visible (una pestaña en segundo plano nunca "gana" un toast que nadie ve).
 *   2. Entre pestañas visibles (p. ej. dos ventanas lado a lado) gana la primera que toma el Web Lock del id; el
 *      resto lo ve ya registrado en localStorage y no lo muestra.
 * Sin Web Locks o sin localStorage (modo privado, bloqueado): degrada a "una vez por pestaña" — nunca rompe la
 * campanita, que se actualiza igual en todas.
 */

const STORAGE_KEY = "planner:notification-toasts";
const TTL_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 200;

type Registry = Record<string, number>;

function readRegistry(): Registry {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    return parsed && typeof parsed === "object" ? (parsed as Registry) : {};
  } catch {
    return {};
  }
}

function writeRegistry(registry: Registry) {
  try {
    const now = Date.now();
    const entries = Object.entries(registry)
      .filter(([, at]) => now - at < TTL_MS)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_ENTRIES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Storage no disponible: queda la deduplicación por pestaña.
  }
}

/** Reclama el toast de `id` en esta pestaña. Resuelve true solo si esta pestaña debe mostrarlo. */
export async function claimNotificationToast(id: string, shownInThisTab: Set<string>): Promise<boolean> {
  if (shownInThisTab.has(id)) return false;
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return false;
  shownInThisTab.add(id);

  const claim = (): boolean => {
    const registry = readRegistry();
    if (registry[id]) return false;
    registry[id] = Date.now();
    writeRegistry(registry);
    return true;
  };

  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (!locks) return claim();
  try {
    return await locks.request(`planner-notification-toast:${id}`, { ifAvailable: true }, (lock) =>
      lock ? claim() : false
    );
  } catch {
    return claim();
  }
}
