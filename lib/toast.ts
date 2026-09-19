import { Toast } from "@base-ui/react/toast";

export const toastManager = Toast.createToastManager();

// Duración de autocierre por tipo (ms). Ningún toast es persistente: todos se cierran solos.
const SUCCESS_DURATION = 4000;
const INFO_DURATION = 4000;
const ERROR_DURATION = 6000;

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
};
