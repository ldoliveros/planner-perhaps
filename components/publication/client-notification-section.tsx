"use client";

import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
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
import { getLastPublicationNotification, notifyClientPublicationApproved } from "@/lib/actions/publication-notifications";
import { toast } from "@/lib/toast";

/** "26 de septiembre de 2026" + "14:30", en America/Argentina/Buenos_Aires (mismo huso que Agenda diaria). */
function formatSentAt(iso: string): { date: string; time: string } {
  const when = new Date(iso);
  const date = new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(when);
  const time = new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(when);
  return { date, time };
}

/**
 * Se monta dentro de PublicationView, que a su vez se remonta con un `key` nuevo en cada apertura: cambiar
 * de publicación reinicia este componente entero, así el estado vuelve solo a "cargando" sin necesidad de
 * resetearlo a mano dentro del efecto (evita el warning de setState síncrono en el cuerpo de un effect).
 */
export function ClientNotificationSection({
  publicationId,
  clientId,
  externalSending = false,
  externalSentAt = null,
}: {
  publicationId: string;
  clientId: string;
  /** Aviso en curso disparado fuera de esta sección (PublicationView, "¡Lista para publicar!"). */
  externalSending?: boolean;
  /** Fecha ISO de un aviso exitoso disparado fuera de esta sección, en esta misma sesión. */
  externalSentAt?: string | null;
}) {
  // undefined = cargando, null = nunca se envió, string = fecha ISO del último envío exitoso.
  const [fetchedOrLocalAt, setLastNotifiedAt] = useState<string | null | undefined>(undefined);
  const [localNotifying, setNotifying] = useState(false);
  const notifying = localNotifying || externalSending;
  // El más reciente entre lo cargado/enviado acá y un envío externo — así la sección nunca queda en
  // "Todavía no se envió" después de aprobar y avisar, sin importar cuál de los dos resolvió último.
  const lastNotifiedAt =
    externalSentAt && (!fetchedOrLocalAt || externalSentAt > fetchedOrLocalAt) ? externalSentAt : fetchedOrLocalAt;
  const [resendConfirmOpen, setResendConfirmOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getLastPublicationNotification(publicationId, clientId).then((result) => {
      if (!cancelled) setLastNotifiedAt(result?.sentAt ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [publicationId, clientId]);

  async function handleNotify() {
    setNotifying(true);
    const result = await notifyClientPublicationApproved(publicationId);
    setNotifying(false);
    if (result.error) {
      toast.error("No se pudo avisar al cliente", result.error);
      return;
    }
    if (result.failedCount > 0) {
      toast.error("Aviso enviado parcialmente", `${result.sentCount} enviado(s), ${result.failedCount} fallaron.`);
    } else {
      toast.success("Aviso enviado al cliente");
    }
    setLastNotifiedAt(new Date().toISOString());
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Mail className="size-3.5" />
        Aviso al cliente
      </div>
      {lastNotifiedAt === undefined ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : externalSending && lastNotifiedAt === null ? (
        <p className="text-sm text-muted-foreground">Enviando aviso...</p>
      ) : lastNotifiedAt === null ? (
        <>
          <p className="text-sm text-muted-foreground">Todavía no se envió el aviso.</p>
          <Button size="sm" className="w-fit gap-1.5" disabled={notifying} onClick={handleNotify}>
            <Mail className="size-3.5" />
            {notifying ? "Enviando..." : "Avisar al cliente"}
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Aviso enviado el {formatSentAt(lastNotifiedAt).date} a las {formatSentAt(lastNotifiedAt).time}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="w-fit gap-1.5"
            disabled={notifying}
            onClick={() => setResendConfirmOpen(true)}
          >
            <Mail className="size-3.5" />
            Reenviar aviso
          </Button>
        </>
      )}

      <AlertDialog open={resendConfirmOpen} onOpenChange={setResendConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reenviar aviso</AlertDialogTitle>
            <AlertDialogDescription>
              {lastNotifiedAt
                ? `Ya se avisó al cliente sobre esta publicación el ${formatSentAt(lastNotifiedAt).date} a las ${formatSentAt(lastNotifiedAt).time}. `
                : ""}
              ¿Querés enviar el aviso nuevamente?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setResendConfirmOpen(false);
                handleNotify();
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
