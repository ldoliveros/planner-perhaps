"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowUpRight, Check, FolderOpen, ImageIcon, Plus, Share2, Trash2, X } from "lucide-react";
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
import { renderPublicationPreview, isPreviewSupported } from "@/components/publication/previews/registry";
import { StatusPill } from "@/components/shared/status-pill";
import { PlatformIcon } from "@/components/icons/brand-icons";
import { useLookups } from "@/components/providers/lookups-provider";
import { hasNotifiableClientUsers, notifyClientPublicationApproved } from "@/lib/actions/publication-notifications";
import { deletePublication, savePublication, type PublicationFormState } from "@/lib/actions/publications";
import { formatTime } from "@/lib/date-utils";
import { toast } from "@/lib/toast";
import { useCopyToClipboard } from "@/lib/use-copy-to-clipboard";
import { cn } from "cn";
import type { Calendar, Campaign, ClientAccount, Publication, PublicationDestination } from "@/types";

const INITIAL_STATE: PublicationFormState = { error: null, savedAt: null };
const MAX_CAROUSEL_IMAGES = 10;

interface PublicationViewProps {
  clientId: string;
  onOpenChange: (open: boolean) => void;
  calendars: Calendar[];
  clientAccounts: ClientAccount[];
  campaigns: Campaign[];
  /** Editar: la publicación existente. Ausente en create/duplicate. */
  publication?: Publication;
  /** Duplicar: publicación de origen — precarga campos pero siempre crea una fila nueva (nunca UPDATE). */
  duplicateFrom?: Publication;
  defaultCalendarId?: string;
  defaultDate?: string;
  /** Publicaciones (global): permite al caller reflejar el guardado/borrado de inmediato en su lista local
   * (globalPublications), sin esperar a que router.refresh() la re-sincronice — ver CalendarScreen. */
  onSaved?: (publication: Publication) => void;
  onDeleted?: (publicationId: string) => void;
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

/** Un slot de imagen del carrusel: o una imagen existente (assetId, ya subida) o una recién elegida en
 * este pase (file, con preview local vía blob URL) — nunca ambas a la vez. */
interface CarouselImage {
  key: string;
  url: string;
  assetId: string | null;
  file: File | null;
}

function carouselSignatureOf(images: CarouselImage[]): string {
  return JSON.stringify(images.map((img) => img.assetId ?? img.key));
}

/**
 * Vista de Publicación integrada: preview + datos + edición en un solo lugar, sin un segundo "modo
 * editar" — toda esta vista ES el formulario, en sus 3 modos (edit/duplicate/create, derivados de qué
 * props llegan: `publication` = edit, `duplicateFrom` = duplicate, ninguno = create — mismo criterio que
 * ya usaba PublicationForm). Reutiliza savePublication tal cual (mismo contrato de campos, y la misma
 * bifurcación INSERT/UPDATE por presencia del input oculto "id"). Se monta con key desde el caller (mismo
 * patrón que ClientNotificationSection en el drawer): abrir para un target nuevo remonta el componente
 * entero, así el estado "original" para dirty-check arranca limpio sin necesitar sincronizarlo en un efecto.
 */
export function PublicationView({
  clientId,
  publication,
  duplicateFrom,
  onOpenChange,
  calendars,
  clientAccounts,
  campaigns,
  defaultCalendarId,
  defaultDate,
  onSaved,
  onDeleted,
}: PublicationViewProps) {
  const { statuses, contentTypes, platforms, getPlatform, getClient } = useLookups();
  const router = useRouter();
  const { copy: copyToClipboard } = useCopyToClipboard();
  const [state, formAction, isPending] = useActionState(savePublication, INITIAL_STATE);
  const lastSavedAt = useRef<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const carouselAddInputRef = useRef<HTMLInputElement>(null);
  const carouselFilesInputRef = useRef<HTMLInputElement>(null);
  const submitButtonRef = useRef<HTMLButtonElement>(null);

  // Duplicar deliberadamente NO copia media (mismo comportamiento que ya tenía PublicationForm): el
  // primaryAsset sale SOLO de `publication` (edit), nunca de `duplicateFrom`.
  const primaryAsset = publication?.assets.find((a) => a.isPrimary) ?? publication?.assets[0] ?? null;
  const firstStatusId = statuses.find((s) => s.order === 1)?.id ?? "";

  // Valores iniciales — mismos defaults que PublicationForm para los 3 modos (ver ese componente):
  // edit lee de `publication`, duplicate precarga desde `duplicateFrom` (salvo fecha/hora/Drive/media,
  // que arrancan vacíos a propósito), create usa defaultCalendarId/defaultDate o vacío.
  const initialCalendarId = publication?.calendarId ?? duplicateFrom?.calendarId ?? defaultCalendarId ?? "";
  const initialCampaignId = publication?.campaignId ?? duplicateFrom?.campaignId ?? "";
  const initialContentTypeId = publication?.contentTypeId ?? duplicateFrom?.contentTypeId ?? "";
  const initialStatusId = publication?.statusId ?? firstStatusId;
  const initialPublicationDate = publication?.publicationDate ?? defaultDate ?? "";
  const initialPublicationTime = formatTime(publication?.publicationTime ?? null);
  const initialTitle = publication?.title ?? (duplicateFrom ? `${duplicateFrom.title} (copia)` : "");
  const initialCopy = publication?.copy ?? duplicateFrom?.copy ?? "";
  const initialCta = publication?.cta ?? duplicateFrom?.cta ?? "";
  const initialExternalUrl = publication?.externalUrl ?? duplicateFrom?.externalUrl ?? "";
  const initialDriveFolderUrl = publication?.driveFolderUrl ?? "";
  const initialDestinations = publication?.destinations ?? duplicateFrom?.destinations ?? [];

  const [calendarId, setCalendarId] = useState(initialCalendarId);
  const [campaignId, setCampaignId] = useState(initialCampaignId);
  const [contentTypeId, setContentTypeId] = useState(initialContentTypeId);
  const [statusId, setStatusId] = useState(initialStatusId);
  const [publicationDate, setPublicationDate] = useState(initialPublicationDate);
  const [publicationTime, setPublicationTime] = useState(initialPublicationTime);
  const [title, setTitle] = useState(initialTitle);
  const [copyText, setCopyText] = useState(initialCopy);
  const [cta, setCta] = useState(initialCta);
  const [externalUrl, setExternalUrl] = useState(initialExternalUrl);
  const [driveFolderUrl, setDriveFolderUrl] = useState(initialDriveFolderUrl);
  const [destinations, setDestinations] = useState<PublicationDestination[]>(initialDestinations);
  const [localCampaigns, setLocalCampaigns] = useState<Campaign[]>(campaigns);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(primaryAsset?.thumbnailUrl ?? null);
  const [carouselImages, setCarouselImages] = useState<CarouselImage[]>(() =>
    (publication?.assets ?? []).map((a) => ({ key: a.id, url: a.thumbnailUrl ?? "", assetId: a.id, file: null }))
  );
  const [originalCarouselSignature, setOriginalCarouselSignature] = useState(() => carouselSignatureOf(carouselImages));

  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [approveNotifyOpen, setApproveNotifyOpen] = useState(false);
  const [hasNotifiable, setHasNotifiable] = useState(false);
  const notifyAfterSaveRef = useRef(false);
  const skipApproveCheckRef = useRef(false);

  // Eliminar — misma action/confirmación que ya usan PublicationForm y el menú "..." de la card (ver
  // deletePublication), sin lógica de borrado nueva. Solo aplica a edit (publication existente).
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Baseline para el dirty-check: en los 3 modos arranca en los mismos valores iniciales de arriba (para
  // create/duplicate, eso es "sin cambios todavía" contra los defaults/lo precargado). Se actualiza al
  // valor recién guardado dentro del mismo efecto que procesa savedAt (solo en edit — ver ese efecto), así
  // "dirty" vuelve a false después de guardar sin depender de que el prop `publication` se refresque.
  const [original, setOriginal] = useState<FieldSnapshot>(() => ({
    calendarId: initialCalendarId,
    campaignId: initialCampaignId,
    contentTypeId: initialContentTypeId,
    statusId: initialStatusId,
    publicationDate: initialPublicationDate,
    publicationTime: initialPublicationTime,
    title: initialTitle,
    copy: initialCopy,
    cta: initialCta,
    externalUrl: initialExternalUrl,
    driveFolderUrl: initialDriveFolderUrl,
    destinationIds: JSON.stringify([...initialDestinations.map((d) => d.clientAccountId)].sort()),
  }));

  const selectedAccountIds = new Set(destinations.map((d) => d.clientAccountId));
  function toggleDestination(clientAccountId: string) {
    setDestinations((prev) =>
      selectedAccountIds.has(clientAccountId)
        ? prev.filter((d) => d.clientAccountId !== clientAccountId)
        : [...prev, { clientAccountId }]
    );
  }

  const selectedContentType = contentTypes.find((c) => c.id === contentTypeId);
  const isCarouselMode = selectedContentType?.key === "carousel";

  // Plataformas con preview disponible entre los destinos elegidos, para el tipo de contenido actual —
  // en el orden de `destinations` (refleja el orden en que se fueron eligiendo, sin prioridad fija de
  // ninguna red). La primera de esta lista es la que se muestra si el usuario no eligió otra a mano.
  const compatiblePlatformKeys: string[] = [];
  for (const destination of destinations) {
    const account = clientAccounts.find((a) => a.id === destination.clientAccountId);
    const key = account ? getPlatform(account.platformId)?.key : undefined;
    if (key && isPreviewSupported(key, selectedContentType?.key) && !compatiblePlatformKeys.includes(key)) {
      compatiblePlatformKeys.push(key);
    }
  }
  const compatiblePlatformKeysSignature = compatiblePlatformKeys.join(",");

  const [activePreviewPlatform, setActivePreviewPlatform] = useState<string | undefined>(
    () => compatiblePlatformKeys[0]
  );

  // Si la plataforma activa deja de ser compatible (se sacó ese destino, o cambió el tipo de contenido y
  // ya no tiene preview para esa combinación), se recalcula sola a la primera compatible restante — el
  // usuario nunca queda mirando una pill que ya no existe. Elegir plataforma acá es puramente local al
  // preview: no toca `destinations` ni ningún campo del form, así que nunca ensucia el dirty state.
  const lastCompatibleSignature = useRef<string | null>(null);
  useEffect(() => {
    if (compatiblePlatformKeysSignature !== lastCompatibleSignature.current) {
      lastCompatibleSignature.current = compatiblePlatformKeysSignature;
      setActivePreviewPlatform((prev) => (prev && compatiblePlatformKeys.includes(prev) ? prev : compatiblePlatformKeys[0]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compatiblePlatformKeysSignature]);

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
  const carouselDirty = isCarouselMode && carouselSignatureOf(carouselImages) !== originalCarouselSignature;
  const isDirty = thumbnailFile !== null || carouselDirty || JSON.stringify(current) !== JSON.stringify(original);
  // Crear/Duplicar siempre pueden intentar guardar (la validación de campos obligatorios la hace el
  // required nativo + savePublication, igual que ya hacía PublicationForm) — el gate por "sin cambios" es
  // exclusivo de Editar, donde no tiene sentido reenviar una publicación intacta.
  const canSubmit = publication ? isDirty : true;

  const approvedStatus = statuses.find((s) => s.key === "approved");
  const isCurrentlyApproved = Boolean(approvedStatus && statusId === approvedStatus.id);

  // "Aviso al cliente" solo debe existir cuando el estado elegido AHORA es Aprobado y además hay
  // Client Users a quienes avisar — reutiliza hasNotifiableClientUsers (misma función que ya usa
  // handleSaveClick, sin duplicar la regla de destinatarios). El guard `isCurrentlyApproved &&` en el
  // render ya oculta la sección al instante si se sale de Aprobado, así que acá no hace falta resetear
  // hasNotifiable sincrónicamente (evita setState fuera de un callback async dentro del efecto). Solo
  // aplica a Editar: en Crear/Duplicar no hay publicación persistida todavía a la cual avisar sobre.
  useEffect(() => {
    if (!publication || !isCurrentlyApproved) return;
    let cancelled = false;
    hasNotifiableClientUsers(clientId).then((result) => {
      if (!cancelled) setHasNotifiable(result);
    });
    return () => {
      cancelled = true;
    };
  }, [publication, isCurrentlyApproved, clientId]);

  // Reconciliación de imágenes del carrusel: el server devuelve los assetId/URLs reales recién
  // asignados a las imágenes nuevas — sin esto, un segundo guardado volvería a subirlas como "nuevas"
  // en vez de reconocerlas como ya existentes, duplicándolas. Efecto separado (misma forma que el de
  // arriba: guardado contra un ref) en vez de anidarlo ahí, para que quede al tope del cuerpo del efecto.
  const lastReconciledAssets = useRef<PublicationFormState["assets"]>(undefined);
  useEffect(() => {
    if (state.assets && state.assets !== lastReconciledAssets.current) {
      lastReconciledAssets.current = state.assets;
      for (const img of carouselImages) {
        if (img.file) URL.revokeObjectURL(img.url);
      }
      const reconciled = state.assets.map((a) => ({ key: a.id, url: a.thumbnailUrl ?? "", assetId: a.id, file: null }));
      setCarouselImages(reconciled);
      setOriginalCarouselSignature(carouselSignatureOf(reconciled));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.assets]);

  // Editar: mismo comportamiento que ya tenía esta vista (se queda abierta, resetea la baseline de dirty).
  useEffect(() => {
    if (!publication) return;
    if (!state.savedAt || state.savedAt === lastSavedAt.current) return;
    lastSavedAt.current = state.savedAt;
    setOriginal(current);
    setThumbnailFile(null);
    router.refresh();
    toast.success("Publicación guardada");
    if (state.publication) onSaved?.(state.publication);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.savedAt]);

  // Crear/Duplicar: la fila nueva se cierra apenas se guarda (mismo comportamiento que ya tenía
  // PublicationForm en este caso) — el Publication recién creado que ahora devuelve savePublication es lo
  // que permite a calendar-screen agregarlo a su lista local sin depender de router.refresh().
  useEffect(() => {
    if (publication) return;
    if (!state.savedAt || state.savedAt === lastSavedAt.current) return;
    lastSavedAt.current = state.savedAt;
    router.refresh();
    toast.success(duplicateFrom ? "Publicación duplicada" : "Publicación creada");
    if (state.publication) onSaved?.(state.publication);
    onOpenChange(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.savedAt]);

  function requestClose() {
    if (isDirty) {
      setConfirmCloseOpen(true);
      return;
    }
    onOpenChange(false);
  }

  // Ctrl/Cmd+S — mismo atajo que PublicationForm, pero disparando un click real sobre el botón de submit
  // (en vez de formRef.current?.requestSubmit(), que en Form salta directo al submit nativo) para que pase
  // por el mismo handleSaveClick de abajo y respete la interceptación "¡Lista para publicar!" también acá.
  // Bloqueado mientras haya cualquier AlertDialog abierto, para no competir con esos flujos.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "s") return;
      e.preventDefault();
      if (isPending || !canSubmit) return;
      if (confirmCloseOpen || approveNotifyOpen || deleteOpen) return;
      submitButtonRef.current?.click();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPending, canSubmit, confirmCloseOpen, approveNotifyOpen, deleteOpen]);

  /** Reutiliza deletePublication tal cual (misma action que PublicationForm y el menú de la card). Cierra
   * PublicationView llamando a onOpenChange (la prop) directamente, NO a requestClose(): así el dirty
   * state de los campos nunca dispara una segunda confirmación después de ya haber confirmado el borrado.
   * Solo alcanzable en Editar — el botón que abre este diálogo está oculto en Crear/Duplicar. */
  async function handleConfirmDelete() {
    if (!publication) return;
    setDeleteError(null);
    setIsDeleting(true);
    const result = await deletePublication(publication.id, publication.clientId);
    setIsDeleting(false);
    if (result.error) {
      setDeleteError(result.error);
      toast.error("No se pudo eliminar", result.error);
      return;
    }
    setDeleteOpen(false);
    onOpenChange(false);
    router.refresh();
    toast.success("Publicación eliminada");
    onDeleted?.(publication.id);
  }

  function handleThumbnailChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setThumbnailFile(file);
      setThumbnailPreview(URL.createObjectURL(file));
    }
  }

  // El input real que viaja en el <form> (name="carouselImages") se sincroniza acá vía DataTransfer con
  // los File de las imágenes nuevas, en el orden actual — los inputs nativos no aceptan asignar un
  // FileList arbitrario directamente, pero sí `.files` construido con DataTransfer.
  useEffect(() => {
    const input = carouselFilesInputRef.current;
    if (!input) return;
    const dataTransfer = new DataTransfer();
    for (const img of carouselImages) {
      if (img.file) dataTransfer.items.add(img.file);
    }
    input.files = dataTransfer.files;
  }, [carouselImages]);

  function handleCarouselFilesPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const room = MAX_CAROUSEL_IMAGES - carouselImages.length;
    const toAdd = Array.from(files).slice(0, room);
    setCarouselImages((prev) => [
      ...prev,
      ...toAdd.map((file) => ({
        key: `new-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        url: URL.createObjectURL(file),
        assetId: null,
        file,
      })),
    ]);
    e.target.value = "";
  }

  function removeCarouselImage(key: string) {
    setCarouselImages((prev) => {
      const removedImg = prev.find((img) => img.key === key);
      if (removedImg?.file) URL.revokeObjectURL(removedImg.url);
      return prev.filter((img) => img.key !== key);
    });
  }

  function moveCarouselImage(from: number, to: number) {
    setCarouselImages((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function handleCarouselDragStart(e: React.DragEvent, index: number) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  }

  function handleCarouselDrop(e: React.DragEvent, index: number) {
    e.preventDefault();
    const source = Number(e.dataTransfer.getData("text/plain"));
    if (!Number.isNaN(source) && source !== index) moveCarouselImage(source, index);
  }

  /** Misma interceptación "¡Lista para publicar!" que en el menú rápido y en PublicationForm — acá los
   * campos ya son controlados, así que no hace falta leer FormData para saber el estado elegido. Solo
   * aplica a Editar (publication existente): crear directo en Aprobado no es una "transición". */
  async function handleSaveClick(e: React.MouseEvent) {
    if (skipApproveCheckRef.current) {
      skipApproveCheckRef.current = false;
      return;
    }
    const isNewlyApproved =
      publication && approvedStatus && statusId === approvedStatus.id && publication.statusId !== approvedStatus.id;
    if (!isNewlyApproved) return;

    e.preventDefault();
    const hasRecipients = await hasNotifiableClientUsers(clientId);
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
    if (!publication) return;
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

  const previewAccount = activePreviewPlatform
    ? clientAccounts.find((a) => selectedAccountIds.has(a.id) && getPlatform(a.platformId)?.key === activePreviewPlatform)
    : undefined;
  const carouselImageUrls = carouselImages.map((img) => img.url).filter(Boolean);
  // Manifest ordenado que lee savePublication: cada slot referencia una imagen existente (assetId, se
  // conserva/reordena) o el índice del File nuevo dentro de `carouselImages` (name="carouselImages",
  // sincronizado por el efecto de arriba) — ambos recorridos van en el mismo orden, así los índices calzan.
  let carouselNewFileIndex = 0;
  const carouselManifest = carouselImages.map((img) =>
    img.assetId ? { assetId: img.assetId } : { fileIndex: carouselNewFileIndex++ }
  );
  // Avatar de los previews: el logo del cliente (ya firmado por withSignedClientLogos, vía
  // useLookups/getClient), el mismo para cualquier plataforma — no depende de la cuenta/destino activo.
  const previewNode = renderPublicationPreview(activePreviewPlatform, selectedContentType?.key, {
    coverUrl: isCarouselMode ? (carouselImageUrls[0] ?? null) : thumbnailPreview,
    images: isCarouselMode ? carouselImageUrls : undefined,
    handle: previewAccount?.handle ?? null,
    accountName: previewAccount?.name ?? null,
    copy: copyText,
    driveFolderUrl: driveFolderUrl || null,
    avatarUrl: getClient(clientId)?.logoUrl ?? null,
  });

  const headerTitle = publication ? "Publicación" : duplicateFrom ? "Duplicar publicación" : "Nueva publicación";
  const submitLabel = isPending ? "Guardando..." : publication ? "Guardar cambios" : "Crear publicación";

  return (
    <Dialog open onOpenChange={(next) => !next && requestClose()}>
      <DialogContent
        showCloseButton
        className="grid max-h-[calc(100dvh-2rem)] w-full max-w-5xl grid-rows-[auto_1fr] gap-0 overflow-hidden p-0 sm:max-w-5xl max-md:h-[100dvh] max-md:max-h-[100dvh] max-md:max-w-full max-md:rounded-none"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border py-3 pr-14 pl-5">
          <DialogTitle className="text-sm font-medium text-muted-foreground">{headerTitle}</DialogTitle>
          {publication && (
            <Button size="sm" variant="outline" className="gap-1.5" type="button" onClick={handleShare}>
              <Share2 className="size-3.5" />
              Compartir
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 overflow-y-auto md:grid-cols-[minmax(0,380px)_1fr] md:overflow-hidden">
          {/* Izquierda: preview — sin scroll propio, centrado verticalmente cuando sobra alto; se mantiene
              visible mientras la columna derecha scrollea (esa es la única con overflow-y-auto). */}
          <div className="flex flex-col items-center justify-center gap-3 border-b border-border bg-muted/30 p-6 md:h-full md:overflow-hidden md:border-b-0 md:border-r">
            {previewNode ? (
              <>
                <div className="flex flex-col items-center gap-1.5">
                  {selectedContentType && (
                    <span className="text-xs font-medium text-muted-foreground">
                      Vista previa · {selectedContentType.label}
                    </span>
                  )}
                  <div className="flex items-center gap-1.5">
                    {compatiblePlatformKeys.map((key) => {
                      const platform = platforms.find((p) => p.key === key);
                      if (!platform) return null;
                      const active = key === activePreviewPlatform;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setActivePreviewPlatform(key)}
                          aria-pressed={active}
                          className={cn(
                            "flex items-center gap-1 rounded-full border bg-white px-2 py-1 text-xs font-medium transition-colors hover:bg-muted/40",
                            active ? "border-foreground/60 text-foreground" : "border-border text-muted-foreground"
                          )}
                        >
                          <PlatformIcon
                            platformKey={key}
                            className="size-3.5"
                            style={{ color: platform.color, opacity: active ? 1 : 0.5 }}
                          />
                          {platform.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {previewNode}
                {/* Acción de Drive — fuera de la simulación de la red social a propósito: no es parte del
                    preview, es una acción de Planner. No afecta dirty state (solo lee driveFolderUrl). */}
                {driveFolderUrl && (
                  <a
                    href={driveFolderUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground hover:underline"
                  >
                    <ArrowUpRight className="size-3.5" />
                    Ver material en Drive
                  </a>
                )}
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

          {/* Derecha: datos / edición (toda esta vista ES el formulario, sin modo editar aparte). Grid de
              2 filas: arriba el único sector con scroll (form + aviso al cliente), abajo el footer fijo
              real (fuera del scroll, no sticky-dentro-del-scroll) — así nunca queda contenido del form
              pasando por debajo del botón de guardar. */}
          <div className="grid grid-rows-[1fr_auto] overflow-hidden">
            <div className="flex flex-col gap-5 overflow-y-auto p-5">
              <form ref={formRef} id="pv-form" action={formAction} className="flex flex-col gap-5">
                {publication && <input type="hidden" name="id" value={publication.id} />}
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
                    clientId={clientId}
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

              {isCarouselMode ? (
                <div className="flex flex-col gap-1.5">
                  <Label>Imágenes</Label>
                  <div className="flex flex-wrap gap-2">
                    {carouselImages.map((img, index) => (
                      <div
                        key={img.key}
                        draggable
                        onDragStart={(e) => handleCarouselDragStart(e, index)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleCarouselDrop(e, index)}
                        className="group relative size-20 shrink-0 cursor-grab overflow-hidden rounded-lg border border-border bg-muted active:cursor-grabbing"
                      >
                        {img.url && <Image src={img.url} alt="" fill sizes="80px" className="object-cover" />}
                        <span className="absolute top-1 left-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-[10px] font-semibold text-white">
                          {index + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeCarouselImage(img.key)}
                          aria-label="Quitar imagen"
                          className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ))}
                    {carouselImages.length < MAX_CAROUSEL_IMAGES && (
                      <button
                        type="button"
                        onClick={() => carouselAddInputRef.current?.click()}
                        className="flex size-20 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-muted-foreground hover:bg-muted"
                      >
                        <Plus className="size-5" />
                        <span className="text-xs">Agregar</span>
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    La primera imagen es la portada. Arrastrá para reordenar. Máximo {MAX_CAROUSEL_IMAGES}.
                  </p>
                  <input
                    ref={carouselAddInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    hidden
                    onChange={handleCarouselFilesPicked}
                  />
                  <input ref={carouselFilesInputRef} type="file" name="carouselImages" multiple hidden />
                  <input type="hidden" name="carouselManifest" value={JSON.stringify(carouselManifest)} readOnly />
                </div>
              ) : (
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
              )}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pv-copy">Copy</Label>
                <CopyEditor id="pv-copy" name="copy" defaultValue={initialCopy} onChange={setCopyText} />
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

              {publication && publication.internalNotes && (
                <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                  <div className="mb-1 text-xs font-medium uppercase tracking-wide">Notas internas</div>
                  {publication.internalNotes}
                </div>
              )}

              {state.error && <p className="text-sm text-destructive">{state.error}</p>}
              </form>

              {publication && isCurrentlyApproved && hasNotifiable && (
                <ClientNotificationSection publicationId={publication.id} clientId={clientId} />
              )}

              {/* Acción destructiva discreta, separada a propósito del botón principal de guardar. Solo
                  Editar: en Crear/Duplicar todavía no hay nada persistido que eliminar. */}
              {publication && (
                <div className="flex justify-start border-t border-border pt-4">
                  <button
                    type="button"
                    onClick={() => setDeleteOpen(true)}
                    className="flex items-center gap-1.5 text-xs font-medium text-destructive/70 transition-colors hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                    Eliminar publicación
                  </button>
                </div>
              )}
            </div>

            <div className="flex shrink-0 justify-end border-t border-border bg-white px-5 py-3">
              <Button ref={submitButtonRef} type="submit" form="pv-form" disabled={isPending || !canSubmit} onClick={handleSaveClick}>
                {submitLabel}
              </Button>
            </div>
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

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta publicación?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. No se eliminan archivos originales de Google Drive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={isDeleting} onClick={handleConfirmDelete}>
              {isDeleting ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
