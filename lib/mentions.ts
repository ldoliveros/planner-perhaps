/** Lógica pura de menciones @ (v1.6) — sin React, testeable sin base de datos. */

export interface SelectedMention {
  id: string;
  name: string;
}

/** Menciones que siguen presentes en el texto (si se borró "@Nombre", deja de contar). Sin duplicados. */
export function activeMentionIds(body: string, mentions: SelectedMention[]): string[] {
  return [...new Set(mentions.filter((m) => body.includes(`@${m.name}`)).map((m) => m.id))];
}

/** "@texto" inmediatamente antes del cursor (sin espacios, al inicio o tras un espacio), o null. */
export function mentionQueryAt(value: string, caret: number): { start: number; query: string } | null {
  const before = value.slice(0, caret);
  const match = /(^|\s)@([^\s@]{0,40})$/u.exec(before);
  if (!match) return null;
  return { start: caret - match[2].length - 1, query: match[2] };
}

/** Comparación sin acentos ni mayúsculas para filtrar sugerencias ("jose" encuentra "José"). */
export function normalizeForSearch(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}
