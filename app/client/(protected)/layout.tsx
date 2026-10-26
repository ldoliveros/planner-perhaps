import { ClientAppShell } from "@/components/client/client-app-shell";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return <ClientAppShell>{children}</ClientAppShell>;
}
