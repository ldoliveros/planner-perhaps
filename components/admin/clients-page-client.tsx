"use client";

import Link from "next/link";
import Image from "next/image";
import { CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClientFormDialog } from "@/components/admin/client-form-dialog";
import { getContrastTextColor } from "@/lib/color-contrast";
import type { Client } from "@/types";

interface ClientsPageClientProps {
  clients: Client[];
  calendarCountByClientId: Record<string, number>;
}

export function ClientsPageClient({ clients, calendarCountByClientId }: ClientsPageClientProps) {
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Clientes</h1>
        <ClientFormDialog />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Calendarios</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  Todavía no hay clientes. Creá el primero con &quot;Nuevo cliente&quot;.
                </TableCell>
              </TableRow>
            )}
            {clients.map((client) => (
              <TableRow key={client.id}>
                <TableCell>
                  <Link href={`/admin/clients/${client.id}`} className="flex items-center gap-2 hover:underline">
                    <span
                      className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md text-xs font-semibold"
                      style={
                        client.logoUrl
                          ? undefined
                          : { backgroundColor: client.color, color: getContrastTextColor(client.color) }
                      }
                    >
                      {client.logoUrl ? (
                        <Image src={client.logoUrl} alt="" fill sizes="32px" className="object-cover" />
                      ) : (
                        client.name.charAt(0)
                      )}
                    </span>
                    <span className="font-medium text-foreground">{client.name}</span>
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{calendarCountByClientId[client.id] ?? 0}</TableCell>
                <TableCell>
                  <Badge variant={client.active ? "secondary" : "outline"}>
                    {client.active ? "Activo" : "Inactivo"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/admin/clients/${client.id}`} />}>
                      Ver
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5"
                      nativeButton={false}
                      render={<Link href={`/admin/clients/${client.id}/planner`} />}
                    >
                      <CalendarDays className="size-3.5" />
                      Ver planner
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
