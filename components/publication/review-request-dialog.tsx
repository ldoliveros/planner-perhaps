"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ReviewRequestDialogProps {
  open: boolean;
  /** Confirmar: el caller aplica el cambio de estado. */
  onConfirm: () => void;
  /** Cancelar (botón, Escape o click afuera): el caller no modifica el estado. */
  onCancel: () => void;
}

/**
 * Confirmación al pasar una publicación a En revisión (v1.6). Mismo lugar en el flujo que "¡Lista para
 * publicar!" (Aprobado), pero siempre se muestra. El aviso por email al cliente quedó postergado para una versión
 * posterior (F5): este diálogo no lo ofrece y no encola nada; las notificaciones internas de Planner siguen igual.
 * La infraestructura (`requestReviewEmail` / RPC `request_status_email`) se conserva para retomarlo.
 */
export function ReviewRequestDialog({ open, onConfirm, onCancel }: ReviewRequestDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Enviar a revisión</AlertDialogTitle>
          <AlertDialogDescription>
            La publicación pasa a En revisión: el cliente va a poder verla, comentarla y aprobarla.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Enviar a revisión</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
