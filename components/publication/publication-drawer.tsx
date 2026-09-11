"use client";

import Image from "next/image";
import { ExternalLink, File, FileText, FolderOpen, ImageIcon, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CopyBlock } from "@/components/publication/copy-block";
import { PLATFORM_ICONS } from "@/components/icons/brand-icons";
import { getAccountType, getContentType, getPlatform, getStatus } from "@/lib/constants";
import { formatFullDate } from "@/lib/date-utils";
import { cn } from "cn";
import type { AssetType, Publication } from "@/types";

const ASSET_ICONS: Record<AssetType, typeof ImageIcon> = {
  image: ImageIcon,
  video: Video,
  pdf: FileText,
  document: FileText,
  other: File,
};

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  const mb = bytes / 1_000_000;
  if (mb < 1) return `${Math.round(bytes / 1000)} KB`;
  return `${mb.toFixed(1)} MB`;
}

interface PublicationDrawerProps {
  publication: Publication | null;
  onOpenChange: (open: boolean) => void;
}

export function PublicationDrawer({ publication, onOpenChange }: PublicationDrawerProps) {
  const contentType = publication ? getContentType(publication.contentTypeId) : undefined;
  const status = publication ? getStatus(publication.statusId) : undefined;
  const primaryAsset = publication?.assets.find((a) => a.isPrimary) ?? publication?.assets[0];

  return (
    <Sheet open={publication !== null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg">
        {publication && (
          <>
            <div className="relative aspect-16/10 w-full shrink-0 bg-muted">
              {primaryAsset?.thumbnailUrl ? (
                <Image src={primaryAsset.thumbnailUrl} alt="" fill sizes="480px" className="object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground/40">
                  <ImageIcon className="size-10" />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-5 p-5">
              <SheetHeader className="gap-1 p-0 text-left">
                <SheetTitle className="text-lg">{publication.title}</SheetTitle>
                <SheetDescription>
                  {formatFullDate(publication.publicationDate)}
                  {publication.publicationTime ? ` · ${publication.publicationTime}` : ""}
                </SheetDescription>
              </SheetHeader>

              <div className="flex flex-wrap items-center gap-1.5">
                {publication.destinations.map((destination, index) => {
                  const platform = getPlatform(destination.platformId);
                  const accountType = getAccountType(destination.accountTypeId);
                  if (!platform || !accountType) return null;
                  const Icon = PLATFORM_ICONS[platform.key];
                  return (
                    <Badge key={`${destination.platformId}-${destination.accountTypeId}-${index}`} variant="outline" className="gap-1.5 py-1">
                      <Icon className="size-3" style={{ color: platform.color }} />
                      {platform.name} · {accountType.name}
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
                {publication.campaign && <Badge variant="outline">{publication.campaign}</Badge>}
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

              {publication.internalNotes && (
                <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                  <div className="mb-1 text-xs font-medium uppercase tracking-wide">Notas internas</div>
                  {publication.internalNotes}
                </div>
              )}

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Archivos
                  </span>
                  {publication.driveFolderUrl && (
                    <a
                      href={publication.driveFolderUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5 text-xs")}
                    >
                      <FolderOpen className="size-3.5" />
                      Abrir carpeta en Drive
                    </a>
                  )}
                </div>

                {publication.assets.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Todavía no hay archivos asociados.</p>
                ) : (
                  <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
                    {publication.assets.map((asset) => {
                      const Icon = ASSET_ICONS[asset.type];
                      return (
                        <div key={asset.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                          <span className="flex min-w-0 items-center gap-2">
                            <Icon className="size-4 shrink-0 text-muted-foreground" />
                            <span className="truncate">{asset.filename}</span>
                            {asset.fileSize && (
                              <span className="shrink-0 text-xs text-muted-foreground">{formatFileSize(asset.fileSize)}</span>
                            )}
                          </span>
                          {asset.driveUrl ? (
                            <a
                              href={asset.driveUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="shrink-0 text-xs font-medium text-primary hover:underline"
                            >
                              Abrir en Drive
                            </a>
                          ) : (
                            <span className="shrink-0 text-xs text-muted-foreground">Sin Drive</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
