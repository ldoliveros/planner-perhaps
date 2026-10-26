import { NotificationsHistory } from "@/components/notifications/notifications-history";

/** Historial completo de notificaciones (Client User). Datos y permisos: NotificationsProvider del layout + RLS. */
export default function ClientNotificationsPage() {
  return <NotificationsHistory />;
}
