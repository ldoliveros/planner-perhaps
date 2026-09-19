"use client";

import type { ButtonHTMLAttributes } from "react";
import Image from "next/image";
import { ImageIcon, Paperclip } from "lucide-react";
import { cn } from "cn";
import { PublicationQuickActions } from "@/components/calendar/publication-quick-actions";
import { PlatformIcon } from "@/components/icons/brand-icons";
import { StatusPill } from "@/components/shared/status-pill";
import { useLookups } from "@/components/providers/lookups-provider";
import { formatTime } from "@/lib/date-utils";
import type { Publication } from "@/types";

interface PublicationCardProps {
  publication: Publication;
  onOpen: () => void;
  onEdit?: (publication: Publication) => void;
  onDuplicate?: (publication: Publication) => void;
  clientId?: string;
  showCalendarLabel?: boolean;
  /**
   * Drag & Drop en Semana (Bloque D). El botón que cubre la card es el activador
   * del drag: así el `•••` (hermano por encima) nunca inicia un drag. Sin estas
   * props la card se comporta exactamente como antes (Client User, previews).
   */
  dragRef?: (node: HTMLElement | null) => void;
  dragProps?: ButtonHTMLAttributes<HTMLButtonElement>;
  dragState?: "dragging" | "saving";
}

export function PublicationCard({
  publication,
  onOpen,
  onEdit,
  onDuplicate,
  clientId,
  showCalendarLabel,
  dragRef,
  dragProps,
  dragState,
}: PublicationCardProps) {
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

  const canManage = Boolean(onEdit && onDuplicate && clientId);

  return (
    <div
      className={cn(
        "group/card relative flex w-full flex-col overflow-hidden rounded-lg border border-border bg-card text-left shadow-xs transition hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-md",
        dragState === "dragging" && "opacity-40",
        dragState === "saving" && "animate-pulse opacity-70"
      )}
    >
      <button
        ref={dragRef}
        type="button"
        onClick={onOpen}
        aria-label={publication.title}
        {...dragProps}
        className={cn(
          "absolute inset-0 z-[1] rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          dragProps && "cursor-grab active:cursor-grabbing"
        )}
      />
      <div className="relative h-48 w-full shrink-0 overflow-hidden bg-muted">
        {heroAsset?.thumbnailUrl ? (
          <Image
            src={heroAsset.thumbnailUrl}
            alt=""
            fill
            sizes="220px"
            className="object-cover transition duration-200 group-hover/card:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1 bg-muted/60 text-muted-foreground">
            <ImageIcon className="size-5" />
            <span className="text-[10px] font-medium">Sin preview</span>
          </div>
        )}

        <div className="absolute inset-x-1.5 top-1.5 flex items-start justify-between gap-1">
          {status && <StatusPill status={status} size="sm" className="shadow-sm" />}
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
        {(uniquePlatformIds.length > 0 || canManage) && (
          <div className="flex items-center justify-between gap-1">
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
            {canManage && (
              <div className="relative z-10 -my-1 -mr-1 shrink-0">
                <PublicationQuickActions
                  publication={publication}
                  clientId={clientId!}
                  onEdit={() => onEdit!(publication)}
                  onDuplicate={() => onDuplicate!(publication)}
                  className="size-6"
                />
              </div>
            )}
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
    </div>
  );
}
