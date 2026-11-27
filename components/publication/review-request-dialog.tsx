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
  /** Quién confirma: el staff avisa al cliente; un Cliente Editor, al equipo asignado (ver reglas de notificaciones). */
  actor?: "staff" | "client_editor";
}

/**
 * Confirmación al pasar una publicación a En revisión (v1.6). Mismo lugar en el flujo que "¡Lista para
 * publicar!" (Aprobado), pero siempre se muestra. El aviso por email al cliente quedó postergado para una versión
 * posterior (F5): este diálogo no lo ofrece y no encola nada; las notificaciones internas de Planner siguen igual.
 * La infraestructura (`requestReviewEmail` / RPC `request_status_email`) se conserva para retomarlo.
 */
export function ReviewRequestDialog({ open, onConfirm, onCancel, actor = "staff" }: ReviewRequestDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Enviar a revisión</AlertDialogTitle>
          <AlertDialogDescription>
            {actor === "client_editor"
              ? "La publicación pasará a En revisión y se notificará al equipo asignado."
              : "La publicación pasará a En revisión y se notificará al cliente para que la revise y apruebe."}
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
