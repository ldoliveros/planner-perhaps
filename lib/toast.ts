import { Toast } from "@base-ui/react/toast";

export const toastManager = Toast.createToastManager();

// Duración de autocierre por tipo (ms). Ningún toast es persistente: todos se cierran solos.
const SUCCESS_DURATION = 4000;
const INFO_DURATION = 4000;
const ERROR_DURATION = 6000;
const NOTIFICATION_DURATION = 6000;

export const toast = {
  success(title: string, description?: string) {
    toastManager.add({ title, description, type: "success", timeout: SUCCESS_DURATION });
  },
  error(title: string, description?: string) {
    toastManager.add({ title, description, type: "error", timeout: ERROR_DURATION });
  },
  info(title: string, description?: string) {
    toastManager.add({ title, description, type: "info", timeout: INFO_DURATION });
  },
  /** Éxito con una acción (v1.6), p. ej. "Publicación archivada" + "Deshacer". */
  successWithAction(title: string, action: { label: string; onClick: () => void }) {
    let id = "";
    id = toastManager.add({
      title,
      type: "success",
      timeout: NOTIFICATION_DURATION,
      actionProps: {
        children: action.label,
        onClick: () => {
          toastManager.close(id);
          action.onClick();
        },
      },
    });
  },
  /** Notificación interna (v1.6): discreta (sin sonido) y con una acción, p. ej. "Abrir" la publicación. */
  notification(title: string, description: string | undefined, action: { label: string; onClick: () => void }) {
    let id = "";
    id = toastManager.add({
      title,
      description,
      type: "notification",
      timeout: NOTIFICATION_DURATION,
      actionProps: {
        children: action.label,
        onClick: () => {
          toastManager.close(id);
          action.onClick();
        },
      },
    });
  },
};
