"use client";

import { useEffect } from "react";

interface PlannerShortcutsOptions {
  /** Drawer o formulario de publicación ya abiertos — bloquea Ctrl/Cmd+N y flechas. */
  overlayOpen: boolean;
  /** Ausente para Client User (solo lectura): Ctrl/Cmd+N no hace nada ahí. */
  onNewPublication?: () => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/**
 * Atajos globales del Planner: Ctrl/Cmd+N (nueva publicación) y flechas
 * (semana anterior/siguiente). Nunca se disparan mientras se escribe en un
 * input/textarea/select/contenteditable, ni con el drawer o el formulario de
 * publicación ya abiertos (evita crear/navegar por detrás de un modal
 * activo). Ctrl/Cmd+S vive en el propio formulario — es el único que conoce
 * el <form> a submitear.
 */
export function usePlannerShortcuts({ overlayOpen, onNewPublication, onPrevWeek, onNextWeek }: PlannerShortcutsOptions) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target) || overlayOpen) return;
      const meta = e.ctrlKey || e.metaKey;

      if (meta && e.key.toLowerCase() === "n") {
        if (!onNewPublication) return; // Client User: sin acción, no interceptar el shortcut del navegador
        e.preventDefault();
        onNewPublication();
        return;
      }
      if (meta) return;

      if (e.key === "ArrowLeft") {
        onPrevWeek();
      } else if (e.key === "ArrowRight") {
        onNextWeek();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [overlayOpen, onNewPublication, onPrevWeek, onNextWeek]);
}
