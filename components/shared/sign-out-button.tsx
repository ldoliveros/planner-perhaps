"use client";

import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/actions/auth";
import { toast } from "@/lib/toast";

interface SignOutButtonProps {
  redirectTo?: string;
  /** Contenido en reposo (p. ej. ícono + "Cerrar sesión"). */
  children: ReactNode;
  /** "menu": botón plano con `className` (item del menú de usuario). "button": Button outline sm. */
  variant?: "menu" | "button";
  className?: string;
}

/**
 * Cerrar sesión con feedback inmediato ("Cerrando sesión…") y sin doble envío. El servidor solo cierra la sesión y
 * devuelve el destino; se navega con una carga completa (`location.replace`) para descartar el caché del router
 * con las pantallas autenticadas y llegar directo a /login.
 */
export function SignOutButton({ redirectTo = "/login", children, variant = "menu", className }: SignOutButtonProps) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    if (pending) return;
    setPending(true);
    try {
      const result = await signOut(redirectTo);
      window.location.replace(result.redirectTo);
    } catch {
      setPending(false);
      toast.error("No se pudo cerrar la sesión", "Probá de nuevo.");
    }
  }

  const content = pending ? (
    <>
      <Loader2 className="size-3.5 animate-spin" />
      Cerrando sesión…
    </>
  ) : (
    children
  );

  if (variant === "button") {
    return (
      <Button type="button" variant="outline" size="sm" className={className} disabled={pending} onClick={handleClick}>
        {content}
      </Button>
    );
  }

  return (
    <button type="button" className={className} disabled={pending} onClick={handleClick}>
      {content}
    </button>
  );
}
