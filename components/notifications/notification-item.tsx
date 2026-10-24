"use client";

import { AtSign, Check, CheckCircle2, MessageSquare, Send } from "lucide-react";
import { UserAvatar } from "@/components/shared/user-avatar";
import { describeNotification, formatNotificationAge } from "@/lib/notification-text";
import { cn } from "cn";
import type { AppNotification, NotificationType } from "@/types";

const TYPE_ICON: Record<NotificationType, typeof MessageSquare> = {
  comment: MessageSquare,
  mention: AtSign,
  review_requested: Send,
  approved_by_client: CheckCircle2,
  approved_by_agency: CheckCircle2,
};

interface NotificationItemProps {
  notification: AppNotification;
  onOpen: () => void;
  /** Historial: botón para marcar como leída sin abrir. */
  onMarkRead?: () => void;
  compact?: boolean;
  /** Línea secundaria opcional (dashboard de Inicio: "Cliente · Publicación"). */
  context?: string;
}

/** Fila de notificación (campanita e historial). Abrir = marcar leída + ir a /p/<id> (lo resuelve el provider). */
export function NotificationItem({ notification, onOpen, onMarkRead, compact, context }: NotificationItemProps) {
  const unread = !notification.readAt;
  const Icon = TYPE_ICON[notification.type] ?? MessageSquare;
  const text = describeNotification(notification);

  return (
    <div
      className={cn(
        "group flex items-start gap-2.5 border-b border-border/60 last:border-b-0",
        compact ? "px-3 py-2.5" : "px-4 py-3",
        unread && "bg-primary/[0.04]"
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        disabled={!notification.publicationId}
        className="flex min-w-0 flex-1 items-start gap-2.5 text-left disabled:cursor-default"
      >
        <span className="relative shrink-0">
          <UserAvatar fullName={notification.actorName} email={null} avatarUrl={notification.actorAvatarUrl} size={compact ? 28 : 32} />
          <span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full bg-background text-muted-foreground ring-1 ring-border">
            <Icon className="size-2.5" />
          </span>
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className={cn("text-sm leading-snug break-words", unread ? "font-medium text-foreground" : "text-muted-foreground")}>
            {text}
          </span>
          {context && <span className="truncate text-xs text-muted-foreground">{context}</span>}
          <span className="text-[11px] text-muted-foreground">{formatNotificationAge(notification.createdAt)}</span>
        </span>
      </button>
      {unread && (
        <span className="flex shrink-0 items-center gap-1.5 pt-1">
          {onMarkRead && (
            <button
              type="button"
              onClick={onMarkRead}
              aria-label="Marcar como leída"
              title="Marcar como leída"
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-70 hover:bg-muted hover:text-foreground hover:opacity-100"
            >
              <Check className="size-3.5" />
            </button>
          )}
          <span aria-label="Sin leer" className="size-2 rounded-full bg-[#3085E8]" />
        </span>
      )}
    </div>
  );
}
