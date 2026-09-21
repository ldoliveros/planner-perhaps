"use client";

import Image from "next/image";
import { ImageIcon } from "lucide-react";
import { PublicationQuickActions } from "@/components/calendar/publication-quick-actions";
import { PlatformIcon } from "@/components/icons/brand-icons";
import { StatusPill } from "@/components/shared/status-pill";
import { useLookups } from "@/components/providers/lookups-provider";
import { formatTime } from "@/lib/date-utils";
import type { Publication } from "@/types";

interface PublicationCompactCardProps {
  publication: Publication;
  onOpen: () => void;
  /** Los tres juntos habilitan las Quick Actions (Super Admin / Account Manager). El Client User no los pasa. */
  onEdit?: (publication: Publication) => void;
  onDuplicate?: (publication: Publication) => void;
  clientId?: string;
  showCalendarLabel?: boolean;
}

/**
 * Card compacta para mobile (vistas Semana y Lista): miniatura, título, estado, hora y canales.
 * Toda la card abre el Drawer; el `•••` (encima de ese botón) nunca lo dispara.
 */
export function PublicationCompactCard({
  publication,
  onOpen,
  onEdit,
  onDuplicate,
  clientId,
  showCalendarLabel,
}: PublicationCompactCardProps) {
  const { getCalendar, getClientAccount, getPlatform, getStatus } = useLookups();
  const status = getStatus(publication.statusId);
  const calendar = showCalendarLabel ? getCalendar(publication.calendarId) : undefined;
  const heroAsset = publication.assets.find((a) => a.isPrimary) ?? publication.assets[0] ?? null;
  const platformIds = Array.from(
    new Set(
      publication.destinations
        .map((d) => getClientAccount(d.clientAccountId)?.platformId)
        .filter((id): id is string => Boolean(id))
    )
  );
  const canManage = Boolean(onEdit && onDuplicate && clientId);

  return (
    <div
      className="relative flex items-center gap-3 rounded-lg border border-l-[3px] border-border bg-card p-2 pl-2.5 shadow-xs"
      style={{ borderLeftColor: status?.color }}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={publication.title}
        className="absolute inset-0 z-[1] rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <span className="relative size-14 shrink-0 overflow-hidden rounded-md bg-muted">
        {heroAsset?.thumbnailUrl ? (
          <Image src={heroAsset.thumbnailUrl} alt="" fill sizes="56px" className="object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center text-muted-foreground/40">
            <ImageIcon className="size-5" />
          </span>
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="line-clamp-2 text-sm leading-snug font-medium text-foreground">{publication.title}</p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {status && <StatusPill status={status} size="sm" />}
          {publication.publicationTime && (
            <span className="text-xs text-muted-foreground tabular-nums">{formatTime(publication.publicationTime)}</span>
          )}
          {platformIds.length > 0 && (
            <span className="flex items-center gap-1">
              {platformIds.map((platformId) => {
                const platform = getPlatform(platformId);
                if (!platform) return null;
                return (
                  <span key={platformId} title={platform.name}>
                    <PlatformIcon platformKey={platform.key} className="size-3.5" style={{ color: platform.color }} />
                  </span>
                );
              })}
            </span>
          )}
        </div>
        {calendar && <span className="truncate text-[11px] text-muted-foreground">{calendar.name}</span>}
      </div>
      {canManage && (
        <div className="relative z-10 -my-1 -mr-1 shrink-0">
          <PublicationQuickActions
            publication={publication}
            clientId={clientId!}
            onEdit={() => onEdit!(publication)}
            onDuplicate={() => onDuplicate!(publication)}
            className="size-11"
          />
        </div>
      )}
    </div>
  );
}
