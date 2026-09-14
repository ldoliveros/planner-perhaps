"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Search, Trash2, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlatformIcon } from "@/components/icons/brand-icons";
import { deletePublication } from "@/lib/actions/publications";
import { formatFullDate, formatTime } from "@/lib/date-utils";
import { toast } from "@/lib/toast";
import type { Calendar, Client, ClientAccount, ContentType, Platform, Publication, Status } from "@/types";

const ALL = "__all__";

interface PublicationsSearchPageClientProps {
  publications: Publication[];
  clients: Client[];
  calendars: Calendar[];
  clientAccounts: ClientAccount[];
  platforms: Platform[];
  contentTypes: ContentType[];
  statuses: Status[];
}

export function PublicationsSearchPageClient({
  publications,
  clients,
  calendars,
  clientAccounts,
  platforms,
  contentTypes,
  statuses,
}: PublicationsSearchPageClientProps) {
  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const calendarMap = useMemo(() => new Map(calendars.map((c) => [c.id, c])), [calendars]);
  const clientAccountMap = useMemo(() => new Map(clientAccounts.map((a) => [a.id, a])), [clientAccounts]);
  const platformMap = useMemo(() => new Map(platforms.map((p) => [p.id, p])), [platforms]);
  const contentTypeMap = useMemo(() => new Map(contentTypes.map((c) => [c.id, c])), [contentTypes]);
  const statusMap = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses]);

  const [search, setSearch] = useState("");
  const [clientId, setClientId] = useState(ALL);
  const [calendarId, setCalendarId] = useState(ALL);
  const [platformId, setPlatformId] = useState(ALL);
  const [accountId, setAccountId] = useState(ALL);
  const [statusId, setStatusId] = useState(ALL);
  const [campaign, setCampaign] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const calendarsForClient = clientId === ALL ? calendars : calendars.filter((c) => c.clientId === clientId);
  const accountsForClient = clientId === ALL ? clientAccounts : clientAccounts.filter((a) => a.clientId === clientId);

  const hasActiveFilters =
    search.trim() !== "" ||
    clientId !== ALL ||
    calendarId !== ALL ||
    platformId !== ALL ||
    accountId !== ALL ||
    statusId !== ALL ||
    campaign.trim() !== "" ||
    dateFrom !== "" ||
    dateTo !== "";

  function clearFilters() {
    setSearch("");
    setClientId(ALL);
    setCalendarId(ALL);
    setPlatformId(ALL);
    setAccountId(ALL);
    setStatusId(ALL);
    setCampaign("");
    setDateFrom("");
    setDateTo("");
  }

  const results = useMemo(() => {
    const query = search.trim().toLowerCase();
    return publications.filter((p) => {
      if (query && !p.title.toLowerCase().includes(query)) return false;
      if (clientId !== ALL && p.clientId !== clientId) return false;
      if (calendarId !== ALL && p.calendarId !== calendarId) return false;
      if (statusId !== ALL && p.statusId !== statusId) return false;
      if (campaign.trim() && !(p.campaign ?? "").toLowerCase().includes(campaign.trim().toLowerCase())) return false;
      if (dateFrom && p.publicationDate < dateFrom) return false;
      if (dateTo && p.publicationDate > dateTo) return false;
      if (platformId !== ALL) {
        const matches = p.destinations.some((d) => clientAccountMap.get(d.clientAccountId)?.platformId === platformId);
        if (!matches) return false;
      }
      if (accountId !== ALL && !p.destinations.some((d) => d.clientAccountId === accountId)) return false;
      return true;
    });
  }, [publications, search, clientId, calendarId, statusId, campaign, dateFrom, dateTo, platformId, accountId, clientAccountMap]);

  return (
    <div className="flex flex-col gap-4 p-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Publicaciones</h1>
        <p className="text-sm text-muted-foreground">
          Búsqueda global — el flujo principal para crear y editar contenido sigue siendo el planner de cada cliente.
        </p>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título..."
            className="pl-8"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select
            value={clientId}
            onValueChange={(v) => {
              setClientId(v as string);
              setCalendarId(ALL);
              setAccountId(ALL);
            }}
            items={{ [ALL]: "Todos los clientes", ...Object.fromEntries(clients.map((c) => [c.id, c.name])) }}
          >
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos los clientes</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={calendarId}
            onValueChange={(v) => setCalendarId(v as string)}
            items={{ [ALL]: "Todos los calendarios", ...Object.fromEntries(calendarsForClient.map((c) => [c.id, c.name])) }}
          >
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos los calendarios</SelectItem>
              {calendarsForClient.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={platformId}
            onValueChange={(v) => setPlatformId(v as string)}
            items={{ [ALL]: "Todos los canales", ...Object.fromEntries(platforms.map((p) => [p.id, p.name])) }}
          >
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos los canales</SelectItem>
              {platforms.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={accountId}
            onValueChange={(v) => setAccountId(v as string)}
            items={{ [ALL]: "Todas las cuentas", ...Object.fromEntries(accountsForClient.map((a) => [a.id, a.name])) }}
          >
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas las cuentas</SelectItem>
              {accountsForClient.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={statusId}
            onValueChange={(v) => setStatusId(v as string)}
            items={{ [ALL]: "Todos los estados", ...Object.fromEntries(statuses.map((s) => [s.id, s.label])) }}
          >
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos los estados</SelectItem>
              {statuses.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            value={campaign}
            onChange={(e) => setCampaign(e.target.value)}
            placeholder="Campaña"
            className="w-36"
          />
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36" />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36" />

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" onClick={clearFilters}>
              <X />
              Limpiar filtros
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Calendario</TableHead>
              <TableHead>Canal</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  {hasActiveFilters
                    ? "No hay publicaciones que coincidan con los filtros."
                    : "Todavía no hay publicaciones."}
                </TableCell>
              </TableRow>
            )}
            {results.map((p) => {
              const client = clientMap.get(p.clientId);
              const calendar = calendarMap.get(p.calendarId);
              const contentType = contentTypeMap.get(p.contentTypeId);
              const status = statusMap.get(p.statusId);
              const uniquePlatformIds = Array.from(
                new Set(p.destinations.map((d) => clientAccountMap.get(d.clientAccountId)?.platformId).filter(Boolean))
              ) as string[];

              return (
                <TableRow key={p.id}>
                  <TableCell className="max-w-52 truncate font-medium text-foreground">{p.title}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {client ? (
                      <span className="flex items-center gap-1.5">
                        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: client.color }} />
                        {client.name}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{calendar?.name ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {uniquePlatformIds.map((platformId) => {
                        const platform = platformMap.get(platformId);
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
                    {status && (
                      <Badge variant="outline" style={{ borderColor: status.color, color: status.color }}>
                        {status.label}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatFullDate(p.publicationDate)}
                    {p.publicationTime ? ` · ${formatTime(p.publicationTime)}` : ""}
                  </TableCell>
                  <TableCell className="text-right">
                    {client && <PublicationRowActions publication={p} clientId={client.id} />}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function PublicationRowActions({ publication, clientId }: { publication: Publication; clientId: string }) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleConfirmDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deletePublication(publication.id, clientId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDeleteOpen(false);
      router.refresh();
      toast.success("Publicación eliminada");
    });
  }

  return (
    <div className="flex justify-end gap-1">
      <Button
        variant="ghost"
        size="sm"
        nativeButton={false}
        render={<Link href={`/admin/clients/${clientId}/planner?calendars=${publication.calendarId}&publication=${publication.id}`} />}
      >
        Ver
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5"
        nativeButton={false}
        render={<Link href={`/admin/clients/${clientId}/planner?calendars=${publication.calendarId}&duplicate=${publication.id}`} />}
      >
        <Copy className="size-3.5" />
        Duplicar
      </Button>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogTrigger render={<Button variant="ghost" size="sm" className="gap-1.5 text-destructive" />}>
          <Trash2 className="size-3.5" />
          Eliminar
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar &quot;{publication.title}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. No se eliminan archivos originales de Google Drive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={isPending} onClick={handleConfirmDelete}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
