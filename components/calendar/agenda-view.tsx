"use client";

import Image from "next/image";
import { ImageIcon } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PublicationQuickActions } from "@/components/calendar/publication-quick-actions";
import { PlatformIcon } from "@/components/icons/brand-icons";
import { StatusPill } from "@/components/shared/status-pill";
import { useLookups } from "@/components/providers/lookups-provider";
import { formatFullDate, formatTime, isSameDayAs } from "@/lib/date-utils";
import type { Publication } from "@/types";

interface AgendaViewProps {
  days: Date[];
  publications: Publication[];
  onOpenPublication: (publication: Publication) => void;
  onEditPublication?: (publication: Publication) => void;
  onDuplicatePublication?: (publication: Publication) => void;
  clientId?: string;
  showCalendarLabel: boolean;
}

/** Vista "Lista": tabla compacta con thumbnail, similar al listado de /admin/publications. */
export function AgendaView({
  days,
  publications,
  onOpenPublication,
  onEditPublication,
  onDuplicatePublication,
  clientId,
  showCalendarLabel,
}: AgendaViewProps) {
  const { getCalendar, getClientAccount, getContentType, getPlatform, getStatus } = useLookups();
  const canManage = Boolean(onEditPublication && onDuplicatePublication && clientId);

  const visiblePublications = days
    .flatMap((day) => publications.filter((p) => isSameDayAs(p.publicationDate, day)))
    .sort((a, b) => {
      if (a.publicationDate !== b.publicationDate) return a.publicationDate.localeCompare(b.publicationDate);
      return (a.publicationTime ?? "").localeCompare(b.publicationTime ?? "");
    });

  if (visiblePublications.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-12 text-center text-sm text-muted-foreground">
        No hay publicaciones en este período.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-14"></TableHead>
            <TableHead>Título</TableHead>
            {showCalendarLabel && <TableHead>Calendario</TableHead>}
            <TableHead>Canal</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Fecha</TableHead>
            {canManage && <TableHead className="sticky right-0 w-10 bg-background"></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {visiblePublications.map((publication) => {
            const primaryAsset = publication.assets.find((a) => a.isPrimary) ?? publication.assets[0];
            const contentType = getContentType(publication.contentTypeId);
            const status = getStatus(publication.statusId);
            const calendar = showCalendarLabel ? getCalendar(publication.calendarId) : undefined;
            const uniquePlatformIds = Array.from(
              new Set(
                publication.destinations
                  .map((d) => getClientAccount(d.clientAccountId)?.platformId)
                  .filter((id): id is string => Boolean(id))
              )
            );

            return (
              <TableRow
                key={publication.id}
                className="cursor-pointer"
                onClick={() => onOpenPublication(publication)}
              >
                <TableCell>
                  <span className="relative flex size-10 shrink-0 overflow-hidden rounded-md bg-muted">
                    {primaryAsset?.thumbnailUrl ? (
                      <Image src={primaryAsset.thumbnailUrl} alt="" fill sizes="40px" className="object-cover" />
                    ) : (
                      <span className="flex size-full items-center justify-center text-muted-foreground/40">
                        <ImageIcon className="size-4" />
                      </span>
                    )}
                  </span>
                </TableCell>
                <TableCell className="max-w-56 truncate font-medium text-foreground">{publication.title}</TableCell>
                {showCalendarLabel && <TableCell className="text-muted-foreground">{calendar?.name ?? "—"}</TableCell>}
                <TableCell>
                  <div className="flex items-center gap-1">
                    {uniquePlatformIds.map((platformId) => {
                      const platform = getPlatform(platformId);
                      if (!platform) return null;
                      return (
                        <PlatformIcon
                          key={platformId}
                          platformKey={platform.key}
                          className="size-3.5"
                          style={{ color: platform.color }}
                        />
                      );
                    })}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{contentType?.label ?? "—"}</TableCell>
                <TableCell>
                  {status && <StatusPill status={status} size="sm" />}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatFullDate(publication.publicationDate)}
                  {publication.publicationTime ? ` · ${formatTime(publication.publicationTime)}` : ""}
                </TableCell>
                {canManage && (
                  <TableCell className="sticky right-0 w-10 bg-background text-right" onClick={(e) => e.stopPropagation()}>
                    <PublicationQuickActions
                      publication={publication}
                      clientId={clientId!}
                      onEdit={() => onEditPublication!(publication)}
                      onDuplicate={() => onDuplicatePublication!(publication)}
                      className="ml-auto size-7"
                    />
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
