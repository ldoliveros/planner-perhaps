"use client";

import Image from "next/image";
import { ImageIcon, Paperclip } from "lucide-react";
import { PlatformIcon } from "@/components/icons/brand-icons";
import { useLookups } from "@/components/providers/lookups-provider";
import { formatTime } from "@/lib/date-utils";
import type { Publication } from "@/types";

interface PublicationCardProps {
  publication: Publication;
  onOpen: () => void;
  showCalendarLabel?: boolean;
}

export function PublicationCard({ publication, onOpen, showCalendarLabel }: PublicationCardProps) {
  const { getCalendar, getClientAccount, getContentType, getPlatform, getStatus } = useLookups();
  const contentType = getContentType(publication.contentTypeId);
  const status = getStatus(publication.statusId);
  const calendar = showCalendarLabel ? getCalendar(publication.calendarId) : undefined;
  const primaryAsset = publication.assets.find((a) => a.isPrimary) ?? null;
  const heroAsset = primaryAsset ?? publication.assets[0] ?? null;
  const fileAssetCount = publication.assets.filter((a) => !a.isPrimary).length;

  const destinationAccounts = publication.destinations
    .map((d) => getClientAccount(d.clientAccountId))
    .filter((a): a is NonNullable<typeof a> => Boolean(a));
  const uniquePlatformIds = Array.from(new Set(destinationAccounts.map((a) => a.platformId)));
  const uniqueAccountNames = Array.from(new Set(destinationAccounts.map((a) => a.name)));

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full flex-col overflow-hidden rounded-lg border border-border bg-card text-left shadow-xs transition hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-md"
    >
      <div className="relative h-48 w-full shrink-0 overflow-hidden bg-muted">
        {heroAsset?.thumbnailUrl ? (
          <Image
            src={heroAsset.thumbnailUrl}
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

        <div className="absolute inset-x-1.5 top-1.5 flex items-start justify-between gap-1">
          {status && (
            <span
              title={status.label}
              className="min-w-0 truncate rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white shadow-sm"
              style={{ backgroundColor: status.color }}
            >
              {status.label}
            </span>
          )}
          {publication.publicationTime && (
            <span className="shrink-0 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
              {formatTime(publication.publicationTime)}
            </span>
          )}
        </div>

        {fileAssetCount > 0 && (
          <span className="absolute bottom-1.5 right-1.5 flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
            <Paperclip className="size-2.5" />
            {fileAssetCount}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 border-l-[3px] p-2" style={{ borderLeftColor: status?.color }}>
        {uniquePlatformIds.length > 0 && (
          <div className="flex items-center gap-1">
            {uniquePlatformIds.map((platformId) => {
              const platform = getPlatform(platformId);
              if (!platform) return null;
              return (
                <span key={platformId} title={platform.name}>
                  <PlatformIcon platformKey={platform.key} className="size-3.5" style={{ color: platform.color }} />
                </span>
              );
            })}
          </div>
        )}
        <p className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground">{publication.title}</p>
        {calendar && (
          <span className="w-fit rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {calendar.name}
          </span>
        )}
        <div className="flex items-center justify-between gap-1 text-[11px] text-muted-foreground">
          <span className="truncate">
            {contentType?.label}
            {uniqueAccountNames.length > 0 ? ` · ${uniqueAccountNames.join(" + ")}` : ""}
          </span>
        </div>
      </div>
    </button>
  );
}
