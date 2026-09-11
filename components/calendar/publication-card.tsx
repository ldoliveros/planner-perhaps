"use client";

import Image from "next/image";
import { ImageIcon, Paperclip } from "lucide-react";
import { PLATFORM_ICONS } from "@/components/icons/brand-icons";
import { getAccountType, getContentType, getPlatform, getStatus } from "@/lib/constants";
import type { Publication } from "@/types";

interface PublicationCardProps {
  publication: Publication;
  onOpen: () => void;
}

export function PublicationCard({ publication, onOpen }: PublicationCardProps) {
  const contentType = getContentType(publication.contentTypeId);
  const status = getStatus(publication.statusId);
  const primaryAsset = publication.assets.find((a) => a.isPrimary) ?? publication.assets[0];

  const uniquePlatformIds = Array.from(new Set(publication.destinations.map((d) => d.platformId)));
  const uniqueAccountNames = Array.from(
    new Set(publication.destinations.map((d) => getAccountType(d.accountTypeId)?.name).filter(Boolean))
  );

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full flex-col overflow-hidden rounded-lg border border-border bg-card text-left shadow-xs transition hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-md"
    >
      <div className="relative h-48 w-full shrink-0 overflow-hidden bg-muted">
        {primaryAsset?.thumbnailUrl ? (
          <Image
            src={primaryAsset.thumbnailUrl}
            alt=""
            fill
            sizes="220px"
            className="object-cover transition duration-200 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1 bg-muted/60 text-muted-foreground">
            <ImageIcon className="size-5" />
            <span className="text-[10px] font-medium">Sin preview</span>
          </div>
        )}

        <div className="absolute left-1.5 top-1.5 flex gap-1">
          {uniquePlatformIds.map((platformId) => {
            const platform = getPlatform(platformId);
            if (!platform) return null;
            const Icon = PLATFORM_ICONS[platform.key];
            return (
              <span
                key={platformId}
                className="flex size-5 items-center justify-center rounded-full bg-white/95 shadow-sm"
                title={platform.name}
              >
                <Icon className="size-3" style={{ color: platform.color }} />
              </span>
            );
          })}
        </div>

        {publication.publicationTime && (
          <span className="absolute right-1.5 top-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
            {publication.publicationTime}
          </span>
        )}

        {publication.assets.length > 0 && (
          <span className="absolute bottom-1.5 right-1.5 flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
            <Paperclip className="size-2.5" />
            {publication.assets.length}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 border-l-[3px] p-2" style={{ borderLeftColor: status?.color }}>
        <p className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground">{publication.title}</p>
        <div className="flex items-center justify-between gap-1 text-[11px] text-muted-foreground">
          <span className="truncate">
            {contentType?.label}
            {uniqueAccountNames.length > 0 ? ` · ${uniqueAccountNames.join(" + ")}` : ""}
          </span>
        </div>
        {status && (
          <div className="flex items-center gap-1 text-[11px] font-medium" style={{ color: status.color }}>
            <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: status.color }} />
            {status.label}
          </div>
        )}
      </div>
    </button>
  );
}
