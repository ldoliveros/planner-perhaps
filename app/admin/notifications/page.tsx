import { NotificationsHistory } from "@/components/notifications/notifications-history";

/** Historial completo de notificaciones (staff). Datos y permisos: NotificationsProvider del layout + RLS. */
export default function AdminNotificationsPage() {
  return <NotificationsHistory />;
}
