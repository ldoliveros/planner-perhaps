import { Toast } from "@base-ui/react/toast";

export const toastManager = Toast.createToastManager();

export const toast = {
  success(title: string, description?: string) {
    toastManager.add({ title, description, type: "success" });
  },
  error(title: string, description?: string) {
    toastManager.add({ title, description, type: "error", timeout: 8000 });
  },
  info(title: string, description?: string) {
    toastManager.add({ title, description, type: "info" });
  },
};
