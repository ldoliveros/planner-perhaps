"use client";

import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import {
  approvePublicationAsClient,
  getPublicationApproval,
  type ClientApprovalResult,
  type PublicationApproval,
} from "@/lib/actions/editorial-flow";
import { ROLE_LABELS } from "@/lib/role-labels";
import { toast } from "@/lib/toast";
import type { UserRole } from "@/types";

function formatApprovedAt(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

function roleLabel(role: string | null): string | null {
  return role && role in ROLE_LABELS ? ROLE_LABELS[role as UserRole] : null;
}

/**
 * Registro de aprobación (v1.6): "Aprobado por X (rol) · fecha", desde publication_status_events. Se monta
 * solo cuando la publicación está Aprobada; `refreshKey` fuerza releer después de una aprobación nueva. Si
 * no hay registro (aprobada antes de v1.6, o migración no aplicada) no muestra nada.
 */
export function ApprovalRecord({ publicationId, refreshKey }: { publicationId: string; refreshKey?: string | number }) {
  const [approval, setApproval] = useState<PublicationApproval | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPublicationApproval(publicationId)
      .then((result) => {
        if (!cancelled) setApproval(result);
      })
      .catch(() => {
        if (!cancelled) setApproval(null);
      });
    return () => {
      cancelled = true;
    };
  }, [publicationId, refreshKey]);

  if (!approval) return null;
  const role = roleLabel(approval.actorRole);

  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600" />
      <span>
        Aprobado por <span className="font-medium text-foreground">{approval.actorName ?? "un usuario"}</span>
        {role ? ` (${role})` : ""} · {formatApprovedAt(approval.approvedAt)}
      </span>
    </p>
  );
}

/**
 * Aprobación por el Client User (v1.6): solo se muestra con la publicación En revisión. Confirma antes de
 * aprobar; la RPC valida cliente, rol, estado Y versión (`expectedUpdatedAt`, la que el cliente está viendo):
 * si la agencia la cambió mientras tanto, no aprueba nada y la vista se recarga con la versión vigente.
 */
export function ClientApproveButton({
  publicationId,
  expectedUpdatedAt,
  onApproved,
  onStale,
}: {
  publicationId: string;
  expectedUpdatedAt: string;
  onApproved: () => void;
  /** La publicación cambió desde que se abrió: el caller recarga la versión vigente. */
  onStale: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleApprove() {
    setPending(true);
    let result: ClientApprovalResult;
    try {
      result = await approvePublicationAsClient(publicationId, expectedUpdatedAt);
    } catch {
      result = { error: "No se pudo conectar con el servidor. Probá de nuevo." };
    }
    setPending(false);
    setConfirmOpen(false);
    if (result.error) {
      toast.error(result.stale ? "La publicación cambió" : "No se pudo aprobar la publicación", result.error);
      if (result.stale) onStale();
      return;
    }
    toast.success("Publicación aprobada");
    onApproved();
  }

  return (
    <>
      <Button className="w-fit gap-1.5" onClick={() => setConfirmOpen(true)} disabled={pending}>
        <CheckCircle2 className="size-4" />
        Aprobar publicación
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={(open) => !pending && setConfirmOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Aprobar esta publicación?</AlertDialogTitle>
            <AlertDialogDescription>
              Le avisamos a la agencia que está aprobada. Los comentarios se cierran mientras siga Aprobada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={pending} onClick={handleApprove}>
              {pending ? "Aprobando..." : "Aprobar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
