"use client";

import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClientFormDialog } from "@/components/admin/client-form-dialog";
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
                  <div className="flex items-center gap-2">
                    <span
                      className="flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold text-white"
                      style={{ backgroundColor: client.color }}
                    >
                      {client.name.charAt(0)}
                    </span>
                    <span className="font-medium text-foreground">{client.name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{calendarCountByClientId[client.id] ?? 0}</TableCell>
                <TableCell>
                  <Badge variant={client.active ? "secondary" : "outline"}>
                    {client.active ? "Activo" : "Inactivo"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <ClientFormDialog
                    client={client}
                    trigger={
                      <Button variant="ghost" size="sm" className="gap-1.5">
                        <Pencil className="size-3.5" />
                        Editar
                      </Button>
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
