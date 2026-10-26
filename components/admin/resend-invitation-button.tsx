"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { resendInvitation } from "@/lib/actions/invitations";
import { toast } from "@/lib/toast";

interface ResendInvitationButtonProps {
  userId: string;
  variant?: "outline" | "ghost";
}

/** Reenvío de invitación (botón o ítem de menú "•••"): misma acción y mismos avisos. Evita el doble envío. */
export function useResendInvitation(userId: string) {
  const [isPending, startTransition] = useTransition();

  function resend() {
    startTransition(async () => {
      const result = await resendInvitation(userId);
      if (result.error) {
        toast.error("No se pudo reenviar la invitación", result.error);
        return;
      }
      toast.success(`Invitación reenviada a ${result.email}`);
    });
  }

  return { resend, isPending };
}

/** Botón "Reenviar invitación" (solo para usuarios en estado Invitado). Evita el doble submit mientras envía. */
export function ResendInvitationButton({ userId, variant = "outline" }: ResendInvitationButtonProps) {
  const { resend, isPending } = useResendInvitation(userId);

  return (
    <Button type="button" variant={variant} size="sm" disabled={isPending} onClick={resend}>
      {isPending ? "Enviando..." : "Reenviar invitación"}
    </Button>
  );
}
