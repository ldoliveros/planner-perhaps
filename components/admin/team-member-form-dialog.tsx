"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
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
import { ResendInvitationButton } from "@/components/admin/resend-invitation-button";
import { UserAccessBadge } from "@/components/admin/user-access-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  changeTeamMemberRole,
  deleteTeamMember,
  inviteTeamMember,
  saveTeamMemberAssignments,
  sendTeamMemberPasswordReset,
  setTeamMemberActive,
  updateTeamMemberName,
  type TeamActionState,
} from "@/lib/actions/team";
import { ROLE_LABELS } from "@/lib/role-labels";
import { toast } from "@/lib/toast";
import type { Client, TeamMember } from "@/types";

const INITIAL_STATE: TeamActionState = { error: null, savedAt: null };
type TeamRole = "super_admin" | "account_manager";
const ROLE_OPTIONS: TeamRole[] = ["account_manager", "super_admin"];

function ClientChecklist({
  clients,
  selectedIds,
  onToggle,
}: {
  clients: Client[];
  selectedIds: string[];
  onToggle: (clientId: string) => void;
}) {
  const selected = new Set(selectedIds);
  // Clientes archivados no se ofrecen para nuevas asignaciones, salvo que el
  // usuario ya estuviera asignado (para no "perder" esa asignación en silencio).
  const selectableClients = clients.filter((c) => c.active || selected.has(c.id));
  return (
    <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-lg border border-border px-3 py-2">
      {selectableClients.length === 0 ? (
        <p className="py-1 text-sm text-muted-foreground">No hay clientes creados todavía.</p>
      ) : (
        selectableClients.map((client) => (
          <label key={client.id} className="flex items-center gap-2 text-sm text-foreground">
            <Checkbox checked={selected.has(client.id)} onCheckedChange={() => onToggle(client.id)} />
            {client.name}
          </label>
        ))
      )}
    </div>
  );
}

interface TeamMemberCreateDialogProps {
  clients: Client[];
}

export function TeamMemberCreateDialog({ clients }: TeamMemberCreateDialogProps) {
  const [open, setOpen] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);

  function handleOpenChange(next: boolean) {
    if (next) setSessionKey((k) => k + 1);
    setOpen(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button size="sm" className="gap-1.5">
            <Plus />
            Nuevo usuario
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo usuario interno</DialogTitle>
        </DialogHeader>
        <CreateBody key={sessionKey} clients={clients} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function CreateBody({ clients, onDone }: { clients: Client[]; onDone: () => void }) {
  const [state, formAction, isPending] = useActionState(inviteTeamMember, INITIAL_STATE);
  const lastSavedAt = useRef<number | null>(null);
  const router = useRouter();
  const [role, setRole] = useState<TeamRole>("account_manager");
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.savedAt && state.savedAt !== lastSavedAt.current) {
      lastSavedAt.current = state.savedAt;
      router.refresh();
      onDone();
      toast.success("Invitación enviada");
    }
  }, [state.savedAt, onDone, router]);

  function toggleClient(clientId: string) {
    setSelectedClientIds((prev) => (prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId]));
  }

  function handleSubmitClick(e: React.MouseEvent) {
    if (role === "super_admin") {
      e.preventDefault();
      setConfirmOpen(true);
    }
  }

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="role" value={role} readOnly />
      <input type="hidden" name="clientIds" value={JSON.stringify(selectedClientIds)} readOnly />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tm-fullName">Nombre completo</Label>
        <Input id="tm-fullName" name="fullName" required autoFocus />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tm-email">Email</Label>
        <Input id="tm-email" name="email" type="email" required />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tm-role">Rol</Label>
        <Select value={role} onValueChange={(value) => setRole(value as TeamRole)} items={ROLE_LABELS}>
          <SelectTrigger id="tm-role" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {role === "account_manager" && (
        <div className="flex flex-col gap-1.5">
          <Label>Clientes asignados</Label>
          <ClientChecklist clients={clients} selectedIds={selectedClientIds} onToggle={toggleClient} />
        </div>
      )}

      {role === "super_admin" && (
        <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          Un Super Admin tiene acceso global a todos los clientes — no se le asignan clientes puntuales.
        </p>
      )}

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <DialogFooter>
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <Button type="submit" disabled={isPending} onClick={handleSubmitClick}>
            {isPending ? "Enviando..." : role === "super_admin" ? "Crear Super Admin" : "Enviar invitación"}
          </Button>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Crear un nuevo Super Admin?</AlertDialogTitle>
              <AlertDialogDescription>
                Va a tener acceso global a todos los clientes, calendarios y publicaciones — igual que vos. Confirmá
                que es lo que querés antes de enviar la invitación.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setConfirmOpen(false);
                  formRef.current?.requestSubmit();
                }}
              >
                Confirmar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogFooter>
    </form>
  );
}

interface TeamMemberEditDialogProps {
  member: TeamMember;
  clients: Client[];
}

export function TeamMemberEditDialog({ member, clients }: TeamMemberEditDialogProps) {
  const [open, setOpen] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);

  function handleOpenChange(next: boolean) {
    if (next) setSessionKey((k) => k + 1);
    setOpen(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="ghost" size="sm" />}>Editar</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{member.fullName ?? member.email}</DialogTitle>
        </DialogHeader>
        <EditBody key={sessionKey} member={member} clients={clients} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function EditBody({ member, clients, onDone }: { member: TeamMember; clients: Client[]; onDone: () => void }) {
  const router = useRouter();
  const [fullName, setFullName] = useState(member.fullName ?? "");
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>(member.assignedClients.map((c) => c.id));
  const [pendingRole, setPendingRole] = useState<TeamRole>(member.role);
  const [error, setError] = useState<string | null>(null);
  const [roleConfirmOpen, setRoleConfirmOpen] = useState(false);
  const [isSaving, startSaveTransition] = useTransition();
  const [isChangingRole, startRoleTransition] = useTransition();
  const [isTogglingActive, startActiveTransition] = useTransition();
  const [isSendingReset, startResetTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const roleChanged = pendingRole !== member.role;
  const roleChangeNeedsClients = pendingRole === "account_manager" && selectedClientIds.length === 0;

  function toggleClient(clientId: string) {
    setSelectedClientIds((prev) => (prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId]));
  }

  function handleSave() {
    setError(null);
    startSaveTransition(async () => {
      const results = await Promise.all([
        updateTeamMemberName(member.id, fullName),
        member.role === "account_manager"
          ? saveTeamMemberAssignments(member.id, selectedClientIds)
          : Promise.resolve({ error: null }),
      ]);
      const failure = results.find((r) => r.error)?.error;
      if (failure) {
        setError(failure);
        return;
      }
      router.refresh();
      onDone();
      toast.success("Cambios guardados");
    });
  }

  function handleConfirmRoleChange() {
    setError(null);
    startRoleTransition(async () => {
      const result = await changeTeamMemberRole(member.id, pendingRole, selectedClientIds);
      if (result.error) {
        setError(result.error);
        setRoleConfirmOpen(false);
        return;
      }
      setRoleConfirmOpen(false);
      router.refresh();
      onDone();
      toast.success("Rol actualizado");
    });
  }

  function handleToggleActive() {
    setError(null);
    startActiveTransition(async () => {
      const result = await setTeamMemberActive(member.id, !member.active);
      if (result.error) {
        // Cierra la confirmación (si estaba abierta) para que el error no quede oculto detrás del modal.
        setDeactivateOpen(false);
        toast.error(member.active ? "No se pudo desactivar el acceso" : "No se pudo reactivar el acceso", result.error);
        return;
      }
      router.refresh();
      onDone();
      toast.success(member.active ? "Acceso desactivado" : "Acceso reactivado");
    });
  }

  function handleSendPasswordReset() {
    setError(null);
    startResetTransition(async () => {
      const result = await sendTeamMemberPasswordReset(member.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success("Le enviamos un link para restablecer su contraseña");
    });
  }

  function handleConfirmDelete() {
    setDeleteError(null);
    startDeleteTransition(async () => {
      const result = await deleteTeamMember(member.id);
      if (result.error) {
        setDeleteError(result.error);
        return;
      }
      setDeleteOpen(false);
      router.refresh();
      onDone();
      toast.success("Usuario eliminado");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tm-edit-fullName">Nombre completo</Label>
        <Input id="tm-edit-fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tm-edit-email">Email</Label>
        <Input id="tm-edit-email" value={member.email ?? ""} disabled readOnly />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          disabled={isSendingReset}
          onClick={handleSendPasswordReset}
        >
          {isSendingReset ? "Enviando..." : "Enviar link de restablecimiento de contraseña"}
        </Button>
      </div>

      <div className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Estado:</span>
          <UserAccessBadge status={member.accessStatus} />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {member.accessStatus === "invited" && <ResendInvitationButton userId={member.id} />}
          {member.active ? (
          <AlertDialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
            <AlertDialogTrigger render={<Button type="button" variant="outline" size="sm" className="text-destructive" />}>
              Desactivar acceso
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Desactivar el acceso de {member.fullName ?? member.email}?</AlertDialogTitle>
                <AlertDialogDescription>
                  No va a poder iniciar sesión hasta que lo reactives. No se borra su cuenta, sus clientes asignados
                  ni su contenido.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction variant="destructive" disabled={isTogglingActive} onClick={handleToggleActive}>
                  Desactivar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <Button type="button" variant="outline" size="sm" disabled={isTogglingActive} onClick={handleToggleActive}>
            Reactivar acceso
          </Button>
        )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5 rounded-lg border border-border px-3 py-2">
        <Label htmlFor="tm-edit-role">Rol</Label>
        <div className="flex items-center gap-2">
          <Select
            value={pendingRole}
            onValueChange={(value) => setPendingRole(value as TeamRole)}
            items={ROLE_LABELS}
          >
            <SelectTrigger id="tm-edit-role" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {roleChanged && (
            <AlertDialog open={roleConfirmOpen} onOpenChange={setRoleConfirmOpen}>
              <AlertDialogTrigger
                render={<Button type="button" size="sm" disabled={roleChangeNeedsClients || isChangingRole} />}
              >
                Confirmar cambio
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    ¿Cambiar el rol de {member.fullName ?? member.email} a {ROLE_LABELS[pendingRole]}?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {pendingRole === "super_admin"
                      ? "Va a tener acceso global a todos los clientes, calendarios y publicaciones."
                      : "Va a perder el acceso global y quedar limitado a los clientes asignados abajo."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction disabled={isChangingRole} onClick={handleConfirmRoleChange}>
                    Confirmar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
        {roleChanged && roleChangeNeedsClients && (
          <p className="text-xs text-destructive">Elegí al menos un cliente para poder degradar a Account Manager.</p>
        )}
      </div>

      {(pendingRole === "account_manager" || member.role === "account_manager") && (
        <div className="flex flex-col gap-1.5">
          <Label>Clientes asignados</Label>
          <ClientChecklist clients={clients} selectedIds={selectedClientIds} onToggle={toggleClient} />
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/30 px-3 py-2">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-foreground">Eliminar usuario</span>
          <span className="text-xs text-muted-foreground">Acción irreversible: borra la cuenta por completo.</span>
        </div>
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogTrigger render={<Button type="button" variant="outline" size="sm" className="gap-1.5 text-destructive" />}>
            <Trash2 className="size-3.5" />
            Eliminar
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar a {member.fullName ?? member.email}?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción no se puede deshacer. Se borra su cuenta, su perfil y sus asignaciones de cliente. No afecta
                el contenido editorial que haya creado.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction variant="destructive" disabled={isDeleting} onClick={handleConfirmDelete}>
                Eliminar definitivamente
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <DialogFooter>
        <Button type="button" disabled={isSaving} onClick={handleSave}>
          {isSaving ? "Guardando..." : "Guardar"}
        </Button>
      </DialogFooter>
    </div>
  );
}
