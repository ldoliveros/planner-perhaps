"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Copy, ExternalLink, FolderOpen, ImageIcon, Mail, Pencil } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CopyBlock } from "@/components/publication/copy-block";
import { StatusPill } from "@/components/shared/status-pill";
import { accountLabel, accountSecondaryName } from "@/lib/account-label";
import { PlatformIcon } from "@/components/icons/brand-icons";
import { useLookups } from "@/components/providers/lookups-provider";
import { getLastPublicationNotification, notifyClientPublicationApproved } from "@/lib/actions/publication-notifications";
import { formatFullDate, formatTime } from "@/lib/date-utils";
import { toast } from "@/lib/toast";
import { cn } from "cn";
import type { Publication } from "@/types";

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

interface PublicationDrawerProps {
  publication: Publication | null;
  onOpenChange: (open: boolean) => void;
  onEdit?: (publication: Publication) => void;
  onDuplicate?: (publication: Publication) => void;
}

export function PublicationDrawer({ publication, onOpenChange, onEdit, onDuplicate }: PublicationDrawerProps) {
  const { getCampaign, getClientAccount, getContentType, getPlatform, getStatus } = useLookups();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const contentType = publication ? getContentType(publication.contentTypeId) : undefined;
  const status = publication ? getStatus(publication.statusId) : undefined;
  const campaign = publication?.campaignId ? getCampaign(publication.campaignId) : undefined;
  const primaryAsset = publication?.assets.find((a) => a.isPrimary) ?? null;
  const heroAsset = primaryAsset ?? publication?.assets[0] ?? null;

  // Aviso al cliente — solo para staff (onEdit) y publicaciones Aprobado. Ver ClientNotificationSection
  // más abajo (montada con key={publication.id} para resetear su estado al cambiar de publicación).
  const isApproved = status?.key === "approved";

  return (
    <Sheet open={publication !== null} onOpenChange={onOpenChange}>
      <SheetContent side="right" mobile="bottom" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg">
        {publication && (
          <>
            <button
              type="button"
              onClick={() => heroAsset?.thumbnailUrl && setLightboxOpen(true)}
              disabled={!heroAsset?.thumbnailUrl}
              className="relative aspect-16/10 w-full shrink-0 bg-muted disabled:cursor-default max-md:aspect-auto max-md:h-44"
            >
              {heroAsset?.thumbnailUrl ? (
                <Image
                  src={heroAsset.thumbnailUrl}
                  alt=""
                  fill
                  sizes="480px"
                  className="cursor-zoom-in object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground/40">
                  <ImageIcon className="size-10" />
                </div>
              )}
              {primaryAsset?.driveFileUrl && (
                <a
                  href={primaryAsset.driveFileUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="absolute bottom-2 right-2 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm hover:bg-black/75 pointer-coarse:px-3 pointer-coarse:py-2.5"
                >
                  Abrir en Drive
                </a>
              )}
            </button>

            {heroAsset?.thumbnailUrl && (
              <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
                <DialogContent className="max-w-3xl border-none bg-transparent p-0 shadow-none ring-0 sm:max-w-3xl">
                  <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
                    <Image src={heroAsset.thumbnailUrl} alt="" fill sizes="90vw" className="object-contain" />
                  </div>
                </DialogContent>
              </Dialog>
            )}

            <div className="flex flex-col gap-5 p-5">
              <SheetHeader className="flex flex-col gap-3 p-0 text-left">
                {(onEdit || onDuplicate) && (
                  <div className="flex items-center justify-end gap-1.5 max-md:hidden">
                    {onDuplicate && (
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onDuplicate(publication)}>
                        <Copy className="size-3.5" />
                        Duplicar
                      </Button>
                    )}
                    {onEdit && (
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onEdit(publication)}>
                        <Pencil className="size-3.5" />
                        Editar
                      </Button>
                    )}
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <SheetTitle className="w-full text-lg">{publication.title}</SheetTitle>
                  <SheetDescription>
                    {formatFullDate(publication.publicationDate)}
                    {publication.publicationTime ? ` · ${formatTime(publication.publicationTime)}` : ""}
                  </SheetDescription>
                </div>
              </SheetHeader>

              <div className="flex flex-wrap items-center gap-1.5">
                {publication.destinations.map((destination) => {
                  const account = getClientAccount(destination.clientAccountId);
                  if (!account) return null;
                  const platform = getPlatform(account.platformId);
                  if (!platform) return null;
                  const secondaryName = accountSecondaryName(account);
                  return (
                    <Badge key={destination.clientAccountId} variant="outline" className="gap-1.5 py-1">
                      <PlatformIcon platformKey={platform.key} className="size-3" style={{ color: platform.color }} />
                      {accountLabel(account)}
                      {secondaryName ? ` · ${secondaryName}` : ""}
                    </Badge>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {contentType && <Badge variant="secondary">{contentType.label}</Badge>}
                {status && <StatusPill status={status} size="md" />}
                {campaign && <Badge variant="outline">{campaign.name}</Badge>}
              </div>

              {onEdit && isApproved && (
                <ClientNotificationSection key={publication.id} publicationId={publication.id} clientId={publication.clientId} />
              )}

              <CopyBlock copy={publication.copy} />

              {(publication.cta || publication.externalUrl) && (
                <div className="flex flex-col gap-1.5 text-sm">
                  {publication.cta && (
                    <div>
                      <span className="text-muted-foreground">CTA: </span>
                      {publication.cta}
                    </div>
                  )}
                  {publication.externalUrl && (
                    <a
                      href={publication.externalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex w-fit items-center gap-1 text-primary hover:underline"
                    >
                      <ExternalLink className="size-3.5" />
                      {publication.externalUrl}
                    </a>
                  )}
                </div>
              )}

              {onEdit && publication.internalNotes && (
                <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                  <div className="mb-1 text-xs font-medium uppercase tracking-wide">Notas internas</div>
                  {publication.internalNotes}
                </div>
              )}

              {publication.driveFolderUrl && (
                <div>
                  <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Archivos
                  </span>
                  <a
                    href={publication.driveFolderUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
                  >
                    <FolderOpen className="size-3.5" />
                    Abrir carpeta en Drive
                  </a>
                </div>
              )}
            </div>

            {/* Solo < md: acciones principales siempre a mano, sin tapar el contenido (van al final del scroll). */}
            {(onEdit || onDuplicate) && (
              <div className="sticky bottom-0 z-10 mt-auto flex gap-2 border-t border-border bg-popover px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden">
                {onDuplicate && (
                  <Button variant="outline" className="flex-1 gap-1.5" onClick={() => onDuplicate(publication)}>
                    <Copy className="size-3.5" />
                    Duplicar
                  </Button>
                )}
                {onEdit && (
                  <Button className="flex-1 gap-1.5" onClick={() => onEdit(publication)}>
                    <Pencil className="size-3.5" />
                    Editar
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * Se monta con key={publicationId} desde PublicationDrawer: cambiar de publicación remonta este
 * componente entero, así el estado vuelve solo a "cargando" sin necesidad de resetearlo a mano dentro
 * del efecto (evita el warning de setState síncrono en el cuerpo de un effect).
 */
export function ClientNotificationSection({ publicationId, clientId }: { publicationId: string; clientId: string }) {
  // undefined = cargando, null = nunca se envió, string = fecha ISO del último envío exitoso.
  const [lastNotifiedAt, setLastNotifiedAt] = useState<string | null | undefined>(undefined);
  const [notifying, setNotifying] = useState(false);
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
