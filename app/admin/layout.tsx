export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen flex-1 flex-col bg-background">{children}</div>;
}
