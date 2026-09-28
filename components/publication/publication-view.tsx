"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Check, FolderOpen, ImageIcon, Share2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CampaignSelect } from "@/components/publication/campaign-select";
import { CopyEditor } from "@/components/publication/copy-editor";
import { ClientNotificationSection } from "@/components/publication/publication-drawer";
import { renderPublicationPreview } from "@/components/publication/previews/registry";
import { StatusPill } from "@/components/shared/status-pill";
import { PlatformIcon } from "@/components/icons/brand-icons";
import { useLookups } from "@/components/providers/lookups-provider";
import { hasNotifiableClientUsers, notifyClientPublicationApproved } from "@/lib/actions/publication-notifications";
import { savePublication, type PublicationFormState } from "@/lib/actions/publications";
import { formatTime } from "@/lib/date-utils";
import { toast } from "@/lib/toast";
import { useCopyToClipboard } from "@/lib/use-copy-to-clipboard";
import { cn } from "cn";
import type { Calendar, Campaign, ClientAccount, Publication, PublicationDestination } from "@/types";

const INITIAL_STATE: PublicationFormState = { error: null, savedAt: null };

interface PublicationViewProps {
  publication: Publication;
  onOpenChange: (open: boolean) => void;
  calendars: Calendar[];
  clientAccounts: ClientAccount[];
  campaigns: Campaign[];
}

/** Snapshot comparable de los campos editables — usado para el chequeo de "cambios sin guardar". */
interface FieldSnapshot {
  calendarId: string;
  campaignId: string;
  contentTypeId: string;
  statusId: string;
  publicationDate: string;
  publicationTime: string;
  title: string;
  copy: string;
  cta: string;
  externalUrl: string;
  driveFolderUrl: string;
  destinationIds: string;
}

/**
 * Vista de Publicación integrada (piloto): preview + datos + edición en un solo lugar, sin un segundo
 * "modo editar" — toda esta vista ES el formulario. Reutiliza savePublication tal cual (mismo contrato
 * de campos que PublicationForm), y los mismos flujos de estado→aviso al cliente. Se monta con
 * key={publication.id} desde el caller (mismo patrón que ClientNotificationSection en el drawer): cambiar
 * de publicación remonta el componente entero, así el estado "original" para dirty-check arranca limpio
 * sin necesitar sincronizarlo en un efecto.
 */
export function PublicationView({ publication, onOpenChange, calendars, clientAccounts, campaigns }: PublicationViewProps) {
  const { statuses, contentTypes, platforms, getPlatform } = useLookups();
  const router = useRouter();
  const { copy: copyToClipboard } = useCopyToClipboard();
  const [state, formAction, isPending] = useActionState(savePublication, INITIAL_STATE);
  const lastSavedAt = useRef<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);

  const primaryAsset = publication.assets.find((a) => a.isPrimary) ?? publication.assets[0] ?? null;

  const [calendarId, setCalendarId] = useState(publication.calendarId);
  const [campaignId, setCampaignId] = useState(publication.campaignId ?? "");
  const [contentTypeId, setContentTypeId] = useState(publication.contentTypeId);
  const [statusId, setStatusId] = useState(publication.statusId);
  const [publicationDate, setPublicationDate] = useState(publication.publicationDate);
  const [publicationTime, setPublicationTime] = useState(formatTime(publication.publicationTime));
  const [title, setTitle] = useState(publication.title);
  const [copyText, setCopyText] = useState(publication.copy);
  const [cta, setCta] = useState(publication.cta ?? "");
  const [externalUrl, setExternalUrl] = useState(publication.externalUrl ?? "");
  const [driveFolderUrl, setDriveFolderUrl] = useState(publication.driveFolderUrl ?? "");
  const [destinations, setDestinations] = useState<PublicationDestination[]>(publication.destinations);
  const [localCampaigns, setLocalCampaigns] = useState<Campaign[]>(campaigns);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(primaryAsset?.thumbnailUrl ?? null);

  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [approveNotifyOpen, setApproveNotifyOpen] = useState(false);
  const [hasNotifiable, setHasNotifiable] = useState(false);
  const notifyAfterSaveRef = useRef(false);
  const skipApproveCheckRef = useRef(false);

  function snapshotOf(p: Publication): FieldSnapshot {
    return {
      calendarId: p.calendarId,
      campaignId: p.campaignId ?? "",
      contentTypeId: p.contentTypeId,
      statusId: p.statusId,
      publicationDate: p.publicationDate,
      publicationTime: formatTime(p.publicationTime),
      title: p.title,
      copy: p.copy,
      cta: p.cta ?? "",
      externalUrl: p.externalUrl ?? "",
      driveFolderUrl: p.driveFolderUrl ?? "",
      destinationIds: JSON.stringify([...p.destinations.map((d) => d.clientAccountId)].sort()),
    };
  }

  // Baseline para el dirty-check: se actualiza al valor recién guardado dentro del mismo efecto que
  // procesa savedAt, así "dirty" vuelve a false después de guardar sin depender de que el prop
  // `publication` se refresque con datos nuevos del servidor (estado, no ref: se lee durante el render).
  const [original, setOriginal] = useState<FieldSnapshot>(() => snapshotOf(publication));

  const selectedAccountIds = new Set(destinations.map((d) => d.clientAccountId));
  function toggleDestination(clientAccountId: string) {
    setDestinations((prev) =>
      selectedAccountIds.has(clientAccountId)
        ? prev.filter((d) => d.clientAccountId !== clientAccountId)
        : [...prev, { clientAccountId }]
    );
  }

  const current: FieldSnapshot = {
    calendarId,
    campaignId,
    contentTypeId,
    statusId,
    publicationDate,
    publicationTime,
    title,
    copy: copyText,
    cta,
    externalUrl,
    driveFolderUrl,
    destinationIds: JSON.stringify([...selectedAccountIds].sort()),
  };
  const isDirty = thumbnailFile !== null || JSON.stringify(current) !== JSON.stringify(original);

  const approvedStatus = statuses.find((s) => s.key === "approved");
  const isCurrentlyApproved = Boolean(approvedStatus && statusId === approvedStatus.id);

  // "Aviso al cliente" solo debe existir cuando el estado elegido AHORA es Aprobado y además hay
  // Client Users a quienes avisar — reutiliza hasNotifiableClientUsers (misma función que ya usa
  // handleSaveClick, sin duplicar la regla de destinatarios). El guard `isCurrentlyApproved &&` en el
  // render ya oculta la sección al instante si se sale de Aprobado, así que acá no hace falta resetear
  // hasNotifiable sincrónicamente (evita setState fuera de un callback async dentro del efecto).
  useEffect(() => {
    if (!isCurrentlyApproved) return;
    let cancelled = false;
    hasNotifiableClientUsers(publication.clientId).then((result) => {
      if (!cancelled) setHasNotifiable(result);
    });
    return () => {
      cancelled = true;
    };
  }, [isCurrentlyApproved, publication.clientId]);

  useEffect(() => {
    if (state.savedAt && state.savedAt !== lastSavedAt.current) {
      lastSavedAt.current = state.savedAt;
      setOriginal(current);
      setThumbnailFile(null);
      router.refresh();
      toast.success("Publicación guardada");
      if (notifyAfterSaveRef.current) {
        notifyAfterSaveRef.current = false;
        notifyClientPublicationApproved(publication.id).then((result) => {
          if (result.error) {
            toast.error("No se pudo avisar al cliente", result.error);
          } else if (result.failedCount > 0) {
            toast.error("Aviso enviado parcialmente", `${result.sentCount} enviado(s), ${result.failedCount} fallaron.`);
          } else {
            toast.success("Aviso enviado al cliente");
          }
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.savedAt]);

  function requestClose() {
    if (isDirty) {
      setConfirmCloseOpen(true);
      return;
    }
    onOpenChange(false);
  }

  function handleThumbnailChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setThumbnailFile(file);
      setThumbnailPreview(URL.createObjectURL(file));
    }
  }

  /** Misma interceptación "¡Lista para publicar!" que en el menú rápido y en PublicationForm — acá los
   * campos ya son controlados, así que no hace falta leer FormData para saber el estado elegido. */
  async function handleSaveClick(e: React.MouseEvent) {
    if (skipApproveCheckRef.current) {
      skipApproveCheckRef.current = false;
      return;
    }
    const isNewlyApproved = approvedStatus && statusId === approvedStatus.id && publication.statusId !== approvedStatus.id;
    if (!isNewlyApproved) return;

    e.preventDefault();
    const hasRecipients = await hasNotifiableClientUsers(publication.clientId);
    if (!hasRecipients) {
      skipApproveCheckRef.current = true;
      formRef.current?.requestSubmit();
      return;
    }
    setApproveNotifyOpen(true);
  }

  function handleCampaignCreated(campaign: Campaign) {
    setLocalCampaigns((prev) => (prev.some((c) => c.id === campaign.id) ? prev : [...prev, campaign]));
    router.refresh();
  }

  async function handleShare() {
    const url = `${window.location.origin}/p/${publication.id}`;
    if (await copyToClipboard(url)) {
      toast.success("Link copiado");
    } else {
      toast.error("No se pudo copiar el link", "Tu navegador bloqueó el acceso al portapapeles.");
    }
  }

  const selectableCalendars = calendars.filter((c) => c.status !== "archived" || c.id === calendarId);
  const selectableAccounts = clientAccounts.filter((a) => a.active || selectedAccountIds.has(a.id));
  const accountsByPlatform = new Map<string, ClientAccount[]>();
  for (const account of selectableAccounts) {
    const list = accountsByPlatform.get(account.platformId) ?? [];
    list.push(account);
    accountsByPlatform.set(account.platformId, list);
  }

  const selectedContentType = contentTypes.find((c) => c.id === contentTypeId);
  const instagramAccount = clientAccounts.find(
    (a) => selectedAccountIds.has(a.id) && getPlatform(a.platformId)?.key === "instagram"
  );
  const previewNode = renderPublicationPreview(instagramAccount ? "instagram" : undefined, selectedContentType?.key, {
    coverUrl: thumbnailPreview,
    handle: instagramAccount?.handle ?? null,
    accountName: instagramAccount?.name ?? null,
    copy: copyText,
    driveFolderUrl: driveFolderUrl || null,
  });
  const previewPlatform = instagramAccount ? getPlatform(instagramAccount.platformId) : undefined;
  const previewLabel = previewNode && previewPlatform && selectedContentType ? `${previewPlatform.name} · ${selectedContentType.label}` : null;

  return (
    <Dialog open onOpenChange={(next) => !next && requestClose()}>
      <DialogContent
        showCloseButton
        className="grid max-h-[calc(100dvh-2rem)] w-full max-w-5xl grid-rows-[auto_1fr] gap-0 overflow-hidden p-0 sm:max-w-5xl max-md:h-[100dvh] max-md:max-h-[100dvh] max-md:max-w-full max-md:rounded-none"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border py-3 pr-14 pl-5">
          <DialogTitle className="text-sm font-medium text-muted-foreground">Publicación</DialogTitle>
          <Button size="sm" variant="outline" className="gap-1.5" type="button" onClick={handleShare}>
            <Share2 className="size-3.5" />
            Compartir
          </Button>
        </div>

        <div className="grid grid-cols-1 overflow-y-auto md:grid-cols-[minmax(0,380px)_1fr] md:overflow-hidden">
          {/* Izquierda: preview — sin scroll propio, centrado verticalmente cuando sobra alto; se mantiene
              visible mientras la columna derecha scrollea (esa es la única con overflow-y-auto). */}
          <div className="flex flex-col items-center justify-center gap-3 border-b border-border bg-muted/30 p-6 md:h-full md:overflow-hidden md:border-b-0 md:border-r">
            {previewNode ? (
              <>
                {previewLabel && <span className="text-xs font-medium text-muted-foreground">{previewLabel}</span>}
                {previewNode}
              </>
            ) : (
              <div className="flex aspect-9/16 w-full max-w-[300px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-muted p-6 text-center">
                <ImageIcon className="size-8 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">
                  Todavía no hay preview para esta combinación de plataforma y tipo de contenido.
                </p>
              </div>
            )}
          </div>

          {/* Derecha: datos / edición (toda esta vista ES el formulario, sin modo editar aparte) */}
          <div className="flex flex-col gap-5 overflow-y-auto p-5">
            <form ref={formRef} action={formAction} className="flex flex-col gap-5">
              <input type="hidden" name="id" value={publication.id} />
              <input type="hidden" name="campaignId" value={campaignId} readOnly />
              <input type="hidden" name="destinations" value={JSON.stringify(destinations)} readOnly />

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pv-title">Título</Label>
                  <Input id="pv-title" name="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pv-calendarId">Calendario</Label>
                  <Select
                    name="calendarId"
                    value={calendarId}
                    onValueChange={(v) => setCalendarId(v as string)}
                    items={Object.fromEntries(selectableCalendars.map((c) => [c.id, c.name]))}
                  >
                    <SelectTrigger id="pv-calendarId" className="w-full">
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
              </div>

              <div className="flex flex-col gap-2">
                <Label>Destinos</Label>
                {selectableAccounts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Este cliente todavía no tiene cuentas configuradas.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {platforms
                      .filter((platform) => accountsByPlatform.has(platform.id))
                      .flatMap((platform) =>
                        accountsByPlatform.get(platform.id)!.map((account) => {
                          const selected = selectedAccountIds.has(account.id);
                          return (
                            <button
                              key={account.id}
                              type="button"
                              onClick={() => toggleDestination(account.id)}
                              aria-pressed={selected}
                              className={cn(
                                "flex items-center gap-1.5 rounded-full border bg-white px-3 py-1.5 text-sm transition-colors hover:bg-muted/40",
                                selected ? "border-foreground/60 text-foreground" : "border-border text-muted-foreground"
                              )}
                            >
                              <PlatformIcon
                                platformKey={platform.key}
                                className="size-3.5 shrink-0"
                                style={{ color: platform.color, opacity: selected ? 1 : 0.5 }}
                              />
                              {account.handle}
                              {selected && <Check className="size-3.5" />}
                            </button>
                          );
                        })
                      )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="campaignId">Campaña</Label>
                  <CampaignSelect
                    clientId={publication.clientId}
                    campaigns={localCampaigns}
                    value={campaignId}
                    onChange={setCampaignId}
                    onCreated={handleCampaignCreated}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pv-contentTypeId">Tipo de contenido</Label>
                  <Select
                    name="contentTypeId"
                    value={contentTypeId}
                    onValueChange={(v) => setContentTypeId(v as string)}
                    items={Object.fromEntries(contentTypes.map((ct) => [ct.id, ct.label]))}
                  >
                    <SelectTrigger id="pv-contentTypeId" className="w-full">
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

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pv-publicationDate">Fecha</Label>
                  <Input
                    id="pv-publicationDate"
                    name="publicationDate"
                    type="date"
                    value={publicationDate}
                    onChange={(e) => setPublicationDate(e.target.value)}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pv-publicationTime">Hora</Label>
                  <Input
                    id="pv-publicationTime"
                    name="publicationTime"
                    type="time"
                    value={publicationTime}
                    onChange={(e) => setPublicationTime(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pv-statusId">Estado</Label>
                <Select
                  name="statusId"
                  value={statusId}
                  onValueChange={(v) => setStatusId(v as string)}
                  items={Object.fromEntries(statuses.map((s) => [s.id, s.label]))}
                >
                  <SelectTrigger id="pv-statusId" className="w-full">
                    <SelectValue placeholder="Elegí un estado">
                      {(value: string | null) => {
                        const selected = statuses.find((s) => s.id === value);
                        return selected ? <StatusPill status={selected} /> : "Elegí un estado";
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {statuses.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        <StatusPill status={s} />
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pv-thumbnail">Portada</Label>
                <div className="flex items-center gap-3">
                  <div className="relative size-16 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                    {thumbnailPreview ? (
                      <Image src={thumbnailPreview} alt="" fill sizes="64px" className="object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground/40">
                        <ImageIcon className="size-5" />
                      </div>
                    )}
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => thumbnailInputRef.current?.click()}>
                    Cambiar portada
                  </Button>
                  <input
                    ref={thumbnailInputRef}
                    id="pv-thumbnail"
                    type="file"
                    name="thumbnail"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleThumbnailChange}
                    hidden
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pv-copy">Copy</Label>
                <CopyEditor id="pv-copy" name="copy" defaultValue={publication.copy} onChange={setCopyText} />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pv-cta">CTA</Label>
                  <Input id="pv-cta" name="cta" value={cta} onChange={(e) => setCta(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pv-externalUrl">URL</Label>
                  <Input
                    id="pv-externalUrl"
                    name="externalUrl"
                    type="url"
                    value={externalUrl}
                    onChange={(e) => setExternalUrl(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pv-driveFolderUrl">Carpeta de Google Drive</Label>
                <Input
                  id="pv-driveFolderUrl"
                  name="driveFolderUrl"
                  type="url"
                  placeholder="https://drive.google.com/drive/folders/..."
                  value={driveFolderUrl}
                  onChange={(e) => setDriveFolderUrl(e.target.value)}
                />
                {driveFolderUrl && (
                  <a
                    href={driveFolderUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-fit gap-1.5")}
                  >
                    <FolderOpen className="size-3.5" />
                    Abrir carpeta en Drive
                  </a>
                )}
              </div>

              {publication.internalNotes && (
                <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                  <div className="mb-1 text-xs font-medium uppercase tracking-wide">Notas internas</div>
                  {publication.internalNotes}
                </div>
              )}

              {state.error && <p className="text-sm text-destructive">{state.error}</p>}

              <div className="sticky bottom-0 -mx-5 -mb-5 flex justify-end gap-2 border-t border-border bg-popover px-5 py-3">
                <Button type="submit" disabled={isPending || !isDirty} onClick={handleSaveClick}>
                  {isPending ? "Guardando..." : "Guardar cambios"}
                </Button>
              </div>
            </form>

            {isCurrentlyApproved && hasNotifiable && (
              <ClientNotificationSection publicationId={publication.id} clientId={publication.clientId} />
            )}
          </div>
        </div>
      </DialogContent>

      <AlertDialog open={confirmCloseOpen} onOpenChange={setConfirmCloseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hay cambios sin guardar</AlertDialogTitle>
            <AlertDialogDescription>Si salís ahora, los cambios que hiciste se perderán.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir editando</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => onOpenChange(false)}>
              Salir sin guardar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={approveNotifyOpen} onOpenChange={setApproveNotifyOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¡Lista para publicar!</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Querés avisarle al cliente que esta publicación está aprobada y lista?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                notifyAfterSaveRef.current = false;
                skipApproveCheckRef.current = true;
                formRef.current?.requestSubmit();
              }}
            >
              No, solo aprobar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setApproveNotifyOpen(false);
                notifyAfterSaveRef.current = true;
                skipApproveCheckRef.current = true;
                formRef.current?.requestSubmit();
              }}
            >
              Sí, aprobar y avisar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
