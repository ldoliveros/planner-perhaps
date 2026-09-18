"use client";

import { useState } from "react";
import Image from "next/image";
import { Copy, ExternalLink, FolderOpen, ImageIcon, Pencil } from "lucide-react";
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
import { PlatformIcon } from "@/components/icons/brand-icons";
import { useLookups } from "@/components/providers/lookups-provider";
import { formatFullDate, formatTime } from "@/lib/date-utils";
import { cn } from "cn";
import type { Publication } from "@/types";

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

  return (
    <Sheet open={publication !== null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg">
        {publication && (
          <>
            <button
              type="button"
              onClick={() => heroAsset?.thumbnailUrl && setLightboxOpen(true)}
              disabled={!heroAsset?.thumbnailUrl}
              className="relative aspect-16/10 w-full shrink-0 bg-muted disabled:cursor-default"
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
                  className="absolute bottom-2 right-2 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm hover:bg-black/75"
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
                  <div className="flex items-center justify-end gap-1.5">
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
                  return (
                    <Badge key={destination.clientAccountId} variant="outline" className="gap-1.5 py-1">
                      <PlatformIcon platformKey={platform.key} className="size-3" style={{ color: platform.color }} />
                      {account.name}
                      {account.handle ? ` · ${account.handle}` : ""}
                    </Badge>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {contentType && <Badge variant="secondary">{contentType.label}</Badge>}
                {status && (
                  <Badge variant="outline" style={{ borderColor: status.color, color: status.color }}>
                    {status.label}
                  </Badge>
                )}
                {campaign && <Badge variant="outline">{campaign.name}</Badge>}
              </div>

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
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
