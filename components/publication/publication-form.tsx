"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ImageIcon } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CampaignSelect } from "@/components/publication/campaign-select";
import { CopyEditor } from "@/components/publication/copy-editor";
import { PlatformIcon } from "@/components/icons/brand-icons";
import { useLookups } from "@/components/providers/lookups-provider";
import { deletePublication, savePublication, type PublicationFormState } from "@/lib/actions/publications";
import { formatTime } from "@/lib/date-utils";
import { toast } from "@/lib/toast";
import type { Calendar, Campaign, ClientAccount, Publication, PublicationDestination } from "@/types";

const INITIAL_STATE: PublicationFormState = { error: null, savedAt: null };

interface PublicationFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  calendars: Calendar[];
  clientAccounts: ClientAccount[];
  campaigns: Campaign[];
  defaultCalendarId?: string;
  publication?: Publication;
  /** Publicación de origen al duplicar: precarga campos pero siempre crea una fila nueva. */
  duplicateFrom?: Publication;
  defaultDate?: string;
}

export function PublicationForm({
  open,
  onOpenChange,
  clientId,
  calendars,
  clientAccounts,
  campaigns,
  defaultCalendarId,
  publication,
  duplicateFrom,
  defaultDate,
}: PublicationFormProps) {
  const { platforms, contentTypes, statuses } = useLookups();
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(savePublication, INITIAL_STATE);
  const lastSavedAt = useRef<number | null>(null);

  // El padre remonta este componente (key) cada vez que se abre para un target
  // nuevo, así que los valores iniciales alcanzan — no hace falta re-sincronizar
  // este estado en un efecto.
  const primaryAsset = publication?.assets.find((a) => a.isPrimary) ?? null;
  const firstStatusId = statuses.find((s) => s.order === 1)?.id;

  const [calendarId, setCalendarId] = useState(
    publication?.calendarId ?? duplicateFrom?.calendarId ?? defaultCalendarId ?? ""
  );
  // Campaña pertenece al CLIENTE, no al calendario — cambiar de calendario
  // (mismo cliente) nunca debe limpiar esto, y de hecho no hay ningún handler
  // acá que lo haga. La integridad cliente<->campaña real la garantiza el
  // trigger de DB (validate_publication_campaign), no el frontend.
  const [campaignId, setCampaignId] = useState(publication?.campaignId ?? duplicateFrom?.campaignId ?? "");
  const [localCampaigns, setLocalCampaigns] = useState<Campaign[]>(campaigns);
  const [destinations, setDestinations] = useState<PublicationDestination[]>(
    publication?.destinations ?? duplicateFrom?.destinations ?? []
  );
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(primaryAsset?.thumbnailUrl ?? null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Ctrl/Cmd+S guarda este formulario mientras está abierto — solo activo acá
  // (no en un listener global), así que nunca compite con el shortcut del
  // navegador cuando no hay un formulario de publicación en pantalla.
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!isPending) formRef.current?.requestSubmit();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, isPending]);

  useEffect(() => {
    if (state.savedAt && state.savedAt !== lastSavedAt.current) {
      lastSavedAt.current = state.savedAt;
      onOpenChange(false);
      router.refresh();
      toast.success(publication ? "Publicación guardada" : duplicateFrom ? "Publicación duplicada" : "Publicación creada");
    }
  }, [state.savedAt, onOpenChange, router, publication, duplicateFrom]);

  const selectedAccountIds = new Set(destinations.map((d) => d.clientAccountId));

  function toggleDestination(clientAccountId: string) {
    setDestinations((prev) =>
      selectedAccountIds.has(clientAccountId)
        ? prev.filter((d) => d.clientAccountId !== clientAccountId)
        : [...prev, { clientAccountId }]
    );
  }

  // Cuentas activas + cualquier cuenta ya seleccionada aunque haya sido desactivada
  // después (para no "perder" el destino silenciosamente al editar).
  const selectableAccounts = clientAccounts.filter((a) => a.active || selectedAccountIds.has(a.id));

  // Mismo criterio: calendarios no archivados + el que ya está asignado (si
  // se archivó después de crear esta publicación, no lo "perdemos" al editar).
  const selectableCalendars = calendars.filter((c) => c.status !== "archived" || c.id === calendarId);
  const accountsByPlatform = new Map<string, ClientAccount[]>();
  for (const account of selectableAccounts) {
    const list = accountsByPlatform.get(account.platformId) ?? [];
    list.push(account);
    accountsByPlatform.set(account.platformId, list);
  }

  function handleThumbnailChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) setThumbnailPreview(URL.createObjectURL(file));
  }

  // La campaña recién creada queda disponible al instante en ESTE formulario;
  // router.refresh() trae los datos frescos del servidor para que también
  // aparezca en el desplegable de las demás publicaciones del mismo cliente.
  function handleCampaignCreated(campaign: Campaign) {
    setLocalCampaigns((prev) => (prev.some((c) => c.id === campaign.id) ? prev : [...prev, campaign]));
    router.refresh();
  }

  async function handleConfirmDelete() {
    if (!publication) return;
    setDeleteError(null);
    const result = await deletePublication(publication.id, clientId);
    if (result.error) {
      setDeleteError(result.error);
      toast.error("No se pudo eliminar", result.error);
      return;
    }
    setDeleteOpen(false);
    onOpenChange(false);
    router.refresh();
    toast.success("Publicación eliminada");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{publication ? "Editar contenido" : duplicateFrom ? "Duplicar contenido" : "Nuevo contenido"}</SheetTitle>
        </SheetHeader>

        <form ref={formRef} action={formAction} className="flex flex-col gap-6 px-4 pb-6">
          {publication && <input type="hidden" name="id" value={publication.id} />}
          <input type="hidden" name="destinations" value={JSON.stringify(destinations)} readOnly />
          <input type="hidden" name="campaignId" value={campaignId} readOnly />

          {/* 1. Calendario */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="calendarId">Calendario</Label>
            <Select
              name="calendarId"
              value={calendarId}
              onValueChange={(value) => setCalendarId(value as string)}
              items={Object.fromEntries(selectableCalendars.map((c) => [c.id, c.name]))}
            >
              <SelectTrigger id="calendarId" className="w-full">
                <SelectValue placeholder="Elegí un calendario" />
              </SelectTrigger>
              <SelectContent>
                {selectableCalendars.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 2. Destinos */}
          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Destinos</h3>
            {selectableAccounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Este cliente todavía no tiene cuentas configuradas. Agregá una desde la ficha del cliente.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {platforms
                  .filter((platform) => accountsByPlatform.has(platform.id))
                  .map((platform) => (
                    <div key={platform.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <button
                              type="button"
                              aria-label={platform.name}
                              className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground"
                            />
                          }
                        >
                          <PlatformIcon platformKey={platform.key} className="size-4" style={{ color: platform.color }} />
                        </TooltipTrigger>
                        <TooltipContent side="top">{platform.name}</TooltipContent>
                      </Tooltip>
                      {accountsByPlatform.get(platform.id)!.map((account) => (
                        <label key={account.id} className="flex items-center gap-1.5 text-sm text-foreground">
                          <Checkbox
                            checked={selectedAccountIds.has(account.id)}
                            onCheckedChange={() => toggleDestination(account.id)}
                          />
                          {account.handle ? account.handle : account.name}
                          {!account.active && <span className="text-xs text-muted-foreground">(inactiva)</span>}
                        </label>
                      ))}
                    </div>
                  ))}
              </div>
            )}
          </section>

          {/* 3. Campaña | Tipo de contenido */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="campaignId">Campaña</Label>
              <CampaignSelect
                clientId={clientId}
                campaigns={localCampaigns}
                value={campaignId}
                onChange={setCampaignId}
                onCreated={handleCampaignCreated}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contentTypeId">Tipo de contenido</Label>
              <Select
                name="contentTypeId"
                defaultValue={publication?.contentTypeId ?? duplicateFrom?.contentTypeId}
                items={Object.fromEntries(contentTypes.map((ct) => [ct.id, ct.label]))}
              >
                <SelectTrigger id="contentTypeId" className="w-full">
                  <SelectValue placeholder="Elegí un tipo" />
                </SelectTrigger>
                <SelectContent>
                  {contentTypes.map((ct) => (
                    <SelectItem key={ct.id} value={ct.id}>
                      {ct.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 4. Programación */}
          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Programación</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="publicationDate">Fecha</Label>
                <Input
                  id="publicationDate"
                  name="publicationDate"
                  type="date"
                  defaultValue={publication?.publicationDate ?? defaultDate ?? ""}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="publicationTime">Hora</Label>
                <Input
                  id="publicationTime"
                  name="publicationTime"
                  type="time"
                  defaultValue={formatTime(publication?.publicationTime ?? null)}
                />
              </div>
            </div>
          </section>

          {/* 5. Estado */}
          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estado</h3>
            <Select
              name="statusId"
              defaultValue={publication?.statusId ?? firstStatusId}
              items={Object.fromEntries(statuses.map((s) => [s.id, s.label]))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Elegí un estado" />
              </SelectTrigger>
              <SelectContent>
                {statuses.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <span className="size-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>

          <Separator />

          {/* 6. Portada */}
          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Portada</h3>
            <div className="flex items-center gap-3">
              <div className="relative size-20 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                {thumbnailPreview ? (
                  <Image src={thumbnailPreview} alt="" fill sizes="80px" className="object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground/40">
                    <ImageIcon className="size-6" />
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <Input
                  ref={fileInputRef}
                  type="file"
                  name="thumbnail"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleThumbnailChange}
                  className="max-w-64"
                />
                <p className="text-xs text-muted-foreground">JPG, PNG o WEBP. Se optimiza automáticamente.</p>
              </div>
            </div>
          </section>

          {/* 7. Título */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">Título</Label>
            <Input
              id="title"
              name="title"
              defaultValue={publication?.title ?? (duplicateFrom ? `${duplicateFrom.title} (copia)` : undefined)}
              required
              autoFocus
            />
          </div>

          {/* 8. Contenido */}
          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contenido</h3>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="copy">Copy</Label>
              <CopyEditor id="copy" name="copy" defaultValue={publication?.copy ?? duplicateFrom?.copy ?? ""} />
            </div>
          </section>

          {/* 9. CTA */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cta">CTA</Label>
            <Input id="cta" name="cta" defaultValue={publication?.cta ?? duplicateFrom?.cta ?? ""} />
          </div>

          {/* 10. URL */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="externalUrl">URL</Label>
            <Input
              id="externalUrl"
              name="externalUrl"
              type="url"
              defaultValue={publication?.externalUrl ?? duplicateFrom?.externalUrl ?? ""}
            />
          </div>

          <Separator />

          {/* 11. Archivos / Drive */}
          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Archivos / Drive</h3>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="driveFolderUrl">Carpeta de Google Drive</Label>
              <Input
                id="driveFolderUrl"
                name="driveFolderUrl"
                type="url"
                placeholder="https://drive.google.com/drive/folders/..."
                defaultValue={publication?.driveFolderUrl ?? ""}
              />
              <p className="text-xs text-muted-foreground">
                Pegá el enlace a la carpeta donde están los archivos de esta publicación.
              </p>
            </div>
          </section>

          {state.error && <p className="text-sm text-destructive">{state.error}</p>}

          <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
            {publication ? (
              <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialogTrigger render={<Button type="button" variant="destructive" size="sm" />}>
                  Eliminar
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Eliminar esta publicación?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta acción no se puede deshacer. No se eliminan archivos originales de Google Drive.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={handleConfirmDelete}>
                      Eliminar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
