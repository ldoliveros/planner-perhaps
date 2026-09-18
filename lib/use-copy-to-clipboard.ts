"use client";

import { useCallback, useState } from "react";

/**
 * Unica implementacion de "copiar al portapapeles" reutilizada por
 * copy-block.tsx (drawer) y por el editor de Copy (formulario) — evita
 * tener multiples wrappers de Clipboard API con manejo de error distinto.
 */
export function useCopyToClipboard(resetDelayMs = 1500) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);

  const copy = useCallback(
    /** Devuelve si copió con éxito — no depender del estado `error` inmediatamente
     * después del await, que todavía reflejaría el render anterior. */
    async (text: string): Promise<boolean> => {
      try {
        await navigator.clipboard.writeText(text);
        setError(false);
        setCopied(true);
        setTimeout(() => setCopied(false), resetDelayMs);
        return true;
      } catch {
        setCopied(false);
        setError(true);
        return false;
      }
    },
    [resetDelayMs]
  );

  return { copied, error, copy };
}
