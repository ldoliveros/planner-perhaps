"use client";

import { useActionState, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Archive, ArrowUpRight, Bell, Check, ChevronDown, ExternalLink, FolderOpen, ImageIcon, Plus, RefreshCcw, Share2, Trash2, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CampaignSelect } from "@/components/publication/campaign-select";
import { CopyBlock } from "@/components/publication/copy-block";
import { CopyEditor } from "@/components/publication/copy-editor";
import { ReviewRequestDialog } from "@/components/publication/review-request-dialog";
import { ApprovalRecord, ClientApproveButton } from "@/components/publication/approval-section";
import { renderPublicationPreview, isPreviewSupported } from "@/components/publication/previews/registry";
import { StatusPill } from "@/components/shared/status-pill";
import { PlatformIcon } from "@/components/icons/brand-icons";
import { accountLabel, accountSecondaryName } from "@/lib/account-label";
import { useLookups } from "@/components/providers/lookups-provider";
import { deletePublication, savePublication, type PublicationFormState } from "@/lib/actions/publications";
import { fetchPublicationForView } from "@/lib/actions/editorial-flow";
import { PublicationComments } from "@/components/publication/comments/publication-comments";
import { useOptionalNotifications } from "@/components/notifications/notifications-provider";
import { describeNotification } from "@/lib/notification-text";
import { isValidTrelloUrl, TRELLO_URL_ERROR } from "@/lib/trello-url";
import { canClientApprove, requiresReviewConfirmation } from "@/lib/editorial-transitions";
import { formatFullDate, formatTime } from "@/lib/date-utils";
import { toast } from "@/lib/toast";
import { useCopyToClipboard } from "@/lib/use-copy-to-clipboard";
import { cn } from "cn";
import type { AppNotification, Calendar, Campaign, ClientAccount, Publication, PublicationDestination } from "@/types";

const INITIAL_STATE: PublicationFormState = { error: null, savedAt: null };
const MAX_CAROUSEL_IMAGES = 10;
/** Límite por request de archivos NUEVOS (Netlify corta con 413 apenas arriba de ~4.5 MB por request;
 * 4 MiB deja margen para el resto del FormData). Las imágenes ya guardadas (assetId) no viajan, no cuentan. */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

function formatMegabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fileTooLargeMessage(file: File): string {
  return `"${file.name}" pesa ${formatMegabytes(file.size)} y el máximo por archivo es 4 MB.`;
}

function totalTooLargeMessage(totalBytes: number): string {
  return `Las imágenes nuevas suman ${formatMegabytes(totalBytes)} y el máximo por guardado es 4 MB. Quitá imágenes o guardá en tandas — las imágenes ya guardadas no cuentan.`;
}

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
  /** Justo antes de eliminar desde esta vista (v1.6): la pantalla no confunde su propio borrado con uno ajeno. */
  onDeleteStart?: (publicationId: string) => void;
  /** v1.6: archivar desde el editor (CalendarScreen: server action + listas + toast "Deshacer"). Sin esta prop (Client
   * User, o archivado no disponible en la base) solo se ofrece Eliminar. */
  onArchive?: (publication: Publication) => Promise<boolean>;
  /** Client User: misma vista y mismos previews, pero la columna derecha es una presentación de solo
   * lectura (sin form) y se ocultan todas las acciones de staff. Solo tiene sentido con `publication`. */
  readOnly?: boolean;
  /** v1.6: la vista necesita mostrar la versión vigente (aprobación del cliente, versión desactualizada o un
   * cambio de estado recibido en vivo). El caller reemplaza la publicación y remonta la vista con ella. */
  onPublicationReloaded?: (publication: Publication, tab: PublicationViewTab) => void;
  /** v1.6: pestaña inicial (solo con `publication`). Desde el calendario: la primera; desde una notificación:
   * Comentarios. */
  initialTab?: PublicationViewTab;
}

/** Pestañas de la Vista de Publicación existente: "main" = Edición (staff) / Publicación (Client User). */
export type PublicationViewTab = "main" | "comments";

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
  driveFolderUrl: string;
  trelloUrl: string;
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
 * props llegan: `publication` = edit, `duplicateFrom` = duplicate, ninguno = create).
 * Reutiliza savePublication tal cual (mismo contrato de campos, y la misma
 * bifurcación INSERT/UPDATE por presencia del input oculto "id"). Se monta con key desde el caller (ver
 * viewKey en CalendarScreen): abrir para un target nuevo remonta el componente
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
  onDeleteStart,
  onArchive,
  readOnly = false,
  onPublicationReloaded,
  initialTab = "main",
}: PublicationViewProps) {
  const { statuses, contentTypes, platforms, getPlatform, getClient } = useLookups();
  // Pestañas (v1.6, solo con una publicación existente). Ambos paneles quedan montados y el inactivo solo se
  // oculta: así se conservan los cambios sin guardar del form, el borrador del comentario y la suscripción Realtime.
  const [tab, setTab] = useState<PublicationViewTab>(publication ? initialTab : "main");
  const [commentCount, setCommentCount] = useState<number | null>(null);
  // Mobile (<md): el cuerpo entero es un solo scroll y la barra de pestañas queda fija arriba. Al cambiar de
  // pestaña con la barra ya fija, el contenido nuevo arranca justo debajo de ella (sin saltos ni quedar a mitad
  // de un panel más corto). En md+ cada panel tiene su propio scroll y no hace falta ajustar nada.
  const bodyRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const lastTabRef = useRef(tab);
  useLayoutEffect(() => {
    if (lastTabRef.current === tab) return;
    lastTabRef.current = tab;
    const body = bodyRef.current;
    const preview = previewRef.current;
    if (!body || !preview || getComputedStyle(body).overflowY === "hidden") return;
    const barTop = preview.offsetHeight;
    if (body.scrollTop > barTop) body.scrollTop = barTop;
  }, [tab]);
  const router = useRouter();
  const { copy: copyToClipboard } = useCopyToClipboard();
  const notifications = useOptionalNotifications();
  const [state, formAction, isPending] = useActionState(savePublication, INITIAL_STATE);
  const lastSavedAt = useRef<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const carouselAddInputRef = useRef<HTMLInputElement>(null);
  const carouselFilesInputRef = useRef<HTMLInputElement>(null);
  const submitButtonRef = useRef<HTMLButtonElement>(null);

  // Duplicar deliberadamente NO copia media a propósito: el
  // primaryAsset sale SOLO de `publication` (edit), nunca de `duplicateFrom`.
  const primaryAsset = publication?.assets.find((a) => a.isPrimary) ?? publication?.assets[0] ?? null;
  const firstStatusId = statuses.find((s) => s.order === 1)?.id ?? "";

  // Valores iniciales — para los 3 modos:
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
  const initialDriveFolderUrl = publication?.driveFolderUrl ?? "";
  // v1.6: Duplicar también copia el link a Trello (CTA/URL ya no se muestran ni se escriben).
  const initialTrelloUrl = publication?.trelloUrl ?? duplicateFrom?.trelloUrl ?? "";
  const initialDestinations = publication?.destinations ?? duplicateFrom?.destinations ?? [];

  const [calendarId, setCalendarId] = useState(initialCalendarId);
  const [campaignId, setCampaignId] = useState(initialCampaignId);
  const [contentTypeId, setContentTypeId] = useState(initialContentTypeId);
  const [statusId, setStatusId] = useState(initialStatusId);
  const [publicationDate, setPublicationDate] = useState(initialPublicationDate);
  const [publicationTime, setPublicationTime] = useState(initialPublicationTime);
  const [title, setTitle] = useState(initialTitle);
  const [copyText, setCopyText] = useState(initialCopy);
  const [driveFolderUrl, setDriveFolderUrl] = useState(initialDriveFolderUrl);
  const [trelloUrl, setTrelloUrl] = useState(initialTrelloUrl);
  const [destinations, setDestinations] = useState<PublicationDestination[]>(initialDestinations);
  const [localCampaigns, setLocalCampaigns] = useState<Campaign[]>(campaigns);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(primaryAsset?.thumbnailUrl ?? null);
  const [carouselImages, setCarouselImages] = useState<CarouselImage[]>(() =>
    (publication?.assets ?? []).map((a) => ({ key: a.id, url: a.thumbnailUrl ?? "", assetId: a.id, file: null }))
  );
  const [originalCarouselSignature, setOriginalCarouselSignature] = useState(() => carouselSignatureOf(carouselImages));

  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  // v1.6 — "Enviar a revisión": confirmación al pasar a En revisión (Editar desde otro estado, o Crear/
  // Duplicar directamente En revisión). El aviso por email al cliente quedó postergado (F5): no se encola nada.
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);

  // Eliminar — misma action/confirmación que el menú "..." de la card (ver
  // deletePublication), sin lógica de borrado nueva. Solo aplica a edit (publication existente).
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
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
    driveFolderUrl: initialDriveFolderUrl,
    trelloUrl: initialTrelloUrl,
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
    driveFolderUrl,
    trelloUrl,
    destinationIds: JSON.stringify([...selectedAccountIds].sort()),
  };
  const carouselDirty = isCarouselMode && carouselSignatureOf(carouselImages) !== originalCarouselSignature;
  const isDirty = thumbnailFile !== null || carouselDirty || JSON.stringify(current) !== JSON.stringify(original);
  // Crear/Duplicar siempre pueden intentar guardar (la validación de campos obligatorios la hace el
  // required nativo + savePublication) — el gate por "sin cambios" es
  // exclusivo de Editar, donde no tiene sentido reenviar una publicación intacta.
  const canSubmit = publication ? isDirty : true;

  const approvedStatus = statuses.find((s) => s.key === "approved");
  const inReviewStatus = statuses.find((s) => s.key === "in_review");
  // Registro de aprobación: solo si lo GUARDADO es Aprobado (no mientras se elige Aprobado en el select).
  const isSavedApproved = Boolean(publication && approvedStatus && original.statusId === approvedStatus.id);

  // Bloqueo optimista (v1.6): versión (updated_at) con la que se abrió el editor. Viaja junto al estado
  // original en cada guardado; savePublication rechaza el guardado entero si la publicación cambió desde
  // entonces. Tras cada guardado exitoso pasa a ser la versión recién guardada — ajuste durante el render
  // (patrón "derivar del último resultado" de React), no en un efecto, para no encadenar renders.
  const [baseUpdatedAt, setBaseUpdatedAt] = useState(publication?.updatedAt ?? "");
  const [versionSyncedState, setVersionSyncedState] = useState<PublicationFormState | null>(null);
  if (state.updatedAt && state !== versionSyncedState) {
    // Éxito o guardado PARCIAL: en ambos la fila ya cambió, así que el próximo intento parte de esa versión
    // (si no, el propio guardado anterior se confundiría con un conflicto de "otra persona").
    setVersionSyncedState(state);
    setBaseUpdatedAt(state.updatedAt);
  }

  useEffect(() => {
    if (!state.error) return;
    // Conflicto de versión: lo muestra el diálogo de recuperación (conflictOpen), sin toast duplicado.
    // Publicación inexistente (otro la eliminó mientras se guardaba): error visible, no solo al pie del formulario.
    if (state.notFound) toast.error("No se pudo guardar", state.error);
    if (state.partial) {
      // Nunca se presenta como éxito. Crear/Duplicar: la fila YA existe — se cierra la vista para que un
      // reintento no cree un duplicado; la publicación aparece en el Planner para revisarla y completarla.
      toast.error(publication ? "Guardado incompleto" : "La publicación se creó con errores", state.error);
      router.refresh();
      if (!publication && state.createdPublicationId) onOpenChange(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // v1.6 — Lectura de notificaciones al abrir una publicación:
  //  * Cambios de estado (revisión/aprobación): se dan por leídos al abrirla, como antes.
  //  * Comentarios y menciones: recién cuando la pestaña Comentarios está a la vista (y la ventana visible); ahí se
  //    marcan todas las de la publicación en la base (RPC). Mientras tanto siguen sin leer en la campanita y en el
  //    contador de la pestaña.
  const publicationIdForNotifications = publication?.id ?? null;
  const unreadForPublication = useMemo(
    () =>
      (notifications?.items ?? []).filter(
        (n) => !n.readAt && publicationIdForNotifications !== null && n.publicationId === publicationIdForNotifications
      ),
    [notifications?.items, publicationIdForNotifications]
  );
  const unreadCommentCount = unreadForPublication.filter((n) => n.type === "comment" || n.type === "mention").length;
  const unreadStatusIds = unreadForPublication
    .filter((n) => n.type !== "comment" && n.type !== "mention")
    .map((n) => n.id)
    .join(",");
  useEffect(() => {
    if (!notifications || notifications.loadState !== "ready" || !unreadStatusIds) return;
    void notifications.markRead(unreadStatusIds.split(","));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadStatusIds, notifications?.loadState]);

  const showingComments = tab === "comments" && publicationIdForNotifications !== null;
  const showingCommentsRef = useRef(showingComments);
  useEffect(() => {
    showingCommentsRef.current = showingComments;
  });
  useEffect(() => {
    if (!showingComments || !notifications || notifications.loadState !== "ready" || !publicationIdForNotifications) return;
    const markIfVisible = () => {
      if (document.visibilityState === "visible" && unreadCommentCount > 0) {
        void notifications.markPublicationRead(publicationIdForNotifications);
      }
    };
    markIfVisible();
    document.addEventListener("visibilitychange", markIfVisible);
    return () => document.removeEventListener("visibilitychange", markIfVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showingComments, unreadCommentCount, notifications?.loadState, publicationIdForNotifications]);

  // v1.6 — la vista se registra en el provider de notificaciones mientras está abierta:
  //  * Notificación nueva de ESTA publicación (ya marcada leída por el provider): un cambio de estado recarga la
  //    vista si no hay cambios sin guardar; si los hay, se muestra un aviso y el usuario decide (nunca se pisan).
  //    Comentarios/menciones no necesitan nada: el panel de comentarios ya se actualiza en vivo.
  //  * Pedido de abrir OTRA publicación (campanita / toast): se muestra un aviso dentro de la vista. Sin cambios
  //    sin guardar ofrece abrirla; con cambios, pide guardarlos primero — nunca los descarta.
  const [remoteStatusNotice, setRemoteStatusNotice] = useState<AppNotification | null>(null);
  const [switchRequest, setSwitchRequest] = useState<AppNotification | null>(null);
  const viewDirtyRef = useRef(false);
  const reloadRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    viewDirtyRef.current = !readOnly && isDirty;
  });
  const registerOpenPublication = notifications?.registerOpenPublication;
  useEffect(() => {
    if (!registerOpenPublication) return;
    return registerOpenPublication({
      publicationId: publicationIdForNotifications,
      isShowingComments: () => showingCommentsRef.current && document.visibilityState === "visible",
      onRelatedNotification: (notification) => {
        const isStatusChange = notification.type !== "comment" && notification.type !== "mention";
        if (!isStatusChange) return;
        if (viewDirtyRef.current) {
          setRemoteStatusNotice(notification);
          return;
        }
        toast.info("La publicación se actualizó", describeNotification(notification));
        reloadRef.current();
      },
      onOpenRequest: (notification) => {
        // Misma publicación: ya está abierta; se muestra la conversación (los cambios del form se conservan).
        if (notification.publicationId && notification.publicationId === publicationIdForNotifications) {
          setTab("comments");
          return;
        }
        setSwitchRequest(notification);
      },
    });
  }, [registerOpenPublication, publicationIdForNotifications]);

  /** Recarga la versión vigente (scopeada por RLS) y le pide al caller remontar la vista con ella. */
  useEffect(() => {
    reloadRef.current = () => void reloadPublication();
  });

  // ---- Recuperación ante un conflicto de versión (v1.6). La protección (guardado condicional) no cambia: acá solo se
  // ofrece copiar lo escrito y recargar la versión guardada, sin sobrescribir nada automáticamente.
  const [dismissedConflict, setDismissedConflict] = useState<PublicationFormState | null>(null);
  const conflictOpen = Boolean(state.conflict) && dismissedConflict !== state;
  const [confirmReload, setConfirmReload] = useState(false);

  /** Contenido editable del formulario, con etiquetas, tal como está en pantalla (no la versión guardada). */
  function buildLocalChangesText(): string {
    const form = formRef.current;
    if (!form) return "";
    const data = new FormData(form);
    const value = (name: string) => String(data.get(name) ?? "").trim();
    const nameOf = <T extends { id: string }>(list: T[], id: string, label: (item: T) => string) => {
      const item = list.find((x) => x.id === id);
      return item ? label(item) : "";
    };
    const accounts = destinations
      .map((d) => clientAccounts.find((a) => a.id === d.clientAccountId))
      .filter((a): a is ClientAccount => Boolean(a))
      .map((a) => `${getPlatform(a.platformId)?.name ?? ""} ${accountLabel(a)}`.trim());
    const lines: [string, string][] = [
      ["Título", value("title")],
      ["Calendario", nameOf(calendars, value("calendarId"), (c) => c.name)],
      ["Tipo de contenido", nameOf(contentTypes, value("contentTypeId"), (c) => c.label)],
      ["Fecha", value("publicationDate")],
      ["Hora", value("publicationTime")],
      ["Estado", nameOf(statuses, value("statusId"), (st) => st.label)],
      ["Campaña", nameOf(campaigns, value("campaignId"), (c) => c.name)],
      ["Cuentas", accounts.join(", ")],
      ["Carpeta de Drive", value("driveFolderUrl")],
      ["Link a Trello", value("trelloUrl")],
    ];
    const header = `Cambios sin guardar — ${publication?.title ?? "publicación"}`;
    const fields = lines.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);
    const copyText = value("copy");
    return [header, "", ...fields, ...(copyText ? ["", "Copy:", copyText] : [])].join("\n");
  }

  async function handleCopyLocalChanges() {
    const ok = await copyToClipboard(buildLocalChangesText());
    if (ok) toast.success("Cambios copiados", "Pegalos donde quieras antes de recargar.");
    else toast.error("No se pudo copiar", "Seleccioná y copiá el contenido del formulario a mano.");
  }

  function closeConflict() {
    setDismissedConflict(state);
    setConfirmReload(false);
  }

  async function reloadPublication() {
    if (!publication) return;
    router.refresh();
    try {
      const fresh = await fetchPublicationForView(publication.id);
      // La vista se remonta con la versión vigente: conserva la pestaña en la que estaba el usuario.
      if (fresh) onPublicationReloaded?.(fresh, tab);
    } catch {
      toast.error("No se pudo actualizar la publicación", "Cerrala y volvé a abrirla.");
    }
  }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.savedAt]);

  // Crear/Duplicar: la fila nueva se cierra apenas se guarda — el Publication recién creado que ahora devuelve savePublication es lo
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

  // Ctrl/Cmd+S — disparando un click real sobre el botón de submit
  // (en vez de formRef.current?.requestSubmit(), que en Form salta directo al submit nativo) para que pase
  // por el mismo handleSaveClick de abajo y respete la interceptación "Enviar a revisión" también acá.
  // Bloqueado mientras haya cualquier AlertDialog abierto, para no competir con esos flujos.
  // En readOnly no hay nada que guardar: no se registra el listener, así Ctrl/Cmd+S conserva su
  // comportamiento nativo del navegador.
  // Guardar pertenece solo a la pestaña Edición: en Comentarios el atajo no guarda (ni abre el diálogo del navegador).
  useEffect(() => {
    if (readOnly) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "s") return;
      e.preventDefault();
      if (tab !== "main") return;
      if (isPending || !canSubmit) return;
      if (confirmCloseOpen || deleteOpen || reviewDialogOpen || conflictOpen) return;
      submitButtonRef.current?.click();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [readOnly, tab, isPending, canSubmit, confirmCloseOpen, deleteOpen, reviewDialogOpen, conflictOpen]);

  /** Reutiliza deletePublication tal cual (misma action que el menú de la card). Cierra
   * PublicationView llamando a onOpenChange (la prop) directamente, NO a requestClose(): así el dirty
   * state de los campos nunca dispara una segunda confirmación después de ya haber confirmado el borrado.
   * Solo alcanzable en Editar — el botón que abre este diálogo está oculto en Crear/Duplicar. */
  async function handleConfirmDelete() {
    if (!publication) return;
    setDeleteError(null);
    setIsDeleting(true);
    // Aviso a la pantalla ANTES de borrar: el evento en vivo de este borrado no es "de otro usuario".
    onDeleteStart?.(publication.id);
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
    if (result.storageError) toast.error("Algunos archivos no se pudieron eliminar", result.storageError);
    onDeleted?.(publication.id);
  }

  /** Archivar desde el editor: con cambios sin guardar se pide resolverlos antes (archivar cierra la vista). */
  async function handleArchive() {
    if (!publication || !onArchive || archiving) return;
    if (isDirty) {
      toast.error("Hay cambios sin guardar", "Guardalos o descartalos antes de archivar la publicación.");
      return;
    }
    setArchiving(true);
    try {
      await onArchive(publication);
    } finally {
      setArchiving(false);
    }
  }

  /** Archivos nuevos que viajarían en este guardado (solo el input montado para el modo actual se envía). */
  function pendingUploadFiles(): File[] {
    if (isCarouselMode) return carouselImages.flatMap((img) => (img.file ? [img.file] : []));
    return thumbnailFile ? [thumbnailFile] : [];
  }

  /** Revalida el límite justo antes de enviar — si falla, no se abre la aprobación ni sale el request. */
  function uploadLimitError(): string | null {
    const files = pendingUploadFiles();
    const tooLarge = files.find((f) => f.size > MAX_UPLOAD_BYTES);
    if (tooLarge) return fileTooLargeMessage(tooLarge);
    const total = files.reduce((sum, f) => sum + f.size, 0);
    return total > MAX_UPLOAD_BYTES ? totalTooLargeMessage(total) : null;
  }

  function blockIfOverUploadLimit(e: React.SyntheticEvent): boolean {
    const error = uploadLimitError();
    if (!error) return false;
    e.preventDefault();
    setUploadError(error);
    toast.error("Las imágenes superan el límite", error);
    return true;
  }

  function handleThumbnailChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && file.size > MAX_UPLOAD_BYTES) {
      // Restaura en el input la portada elegida antes (si había), así no se pierde ni viaja la rechazada.
      const dataTransfer = new DataTransfer();
      if (thumbnailFile) dataTransfer.items.add(thumbnailFile);
      e.target.files = dataTransfer.files;
      const error = fileTooLargeMessage(file);
      setUploadError(error);
      toast.error("Imagen demasiado pesada", error);
      return;
    }
    if (file) {
      setUploadError(null);
      setThumbnailFile(file);
      setThumbnailPreview(URL.createObjectURL(file));
    }
  }

  // Los inputs file reales que viajan en el <form> (name="carouselImages" / name="thumbnail") se
  // sincronizan desde el state vía DataTransfer — los inputs nativos no aceptan asignar un FileList
  // arbitrario directamente, pero sí `.files` construido con DataTransfer. Se llama al cambiar el
  // carrusel y también justo antes de cada submit: React 19 resetea el <form action> al terminar la
  // action (incluso si devolvió error), lo que vacía estos inputs sin que el state cambie, y el
  // reintento viajaría sin las imágenes.
  function syncFileInputs() {
    const carouselInput = carouselFilesInputRef.current;
    if (carouselInput) {
      const dataTransfer = new DataTransfer();
      for (const img of carouselImages) {
        if (img.file) dataTransfer.items.add(img.file);
      }
      carouselInput.files = dataTransfer.files;
    }
    const thumbnailInput = thumbnailInputRef.current;
    if (thumbnailInput) {
      const dataTransfer = new DataTransfer();
      if (thumbnailFile) dataTransfer.items.add(thumbnailFile);
      thumbnailInput.files = dataTransfer.files;
    }
  }

  useEffect(() => {
    syncFileInputs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carouselImages]);

  function handleCarouselFilesPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const room = MAX_CAROUSEL_IMAGES - carouselImages.length;
    // Se agregan solo las que entran en el límite (por archivo y total de nuevas); las ya cargadas se conservan.
    let total = pendingUploadFiles().reduce((sum, f) => sum + f.size, 0);
    const toAdd: File[] = [];
    let error: string | null = null;
    for (const file of Array.from(files).slice(0, room)) {
      if (file.size > MAX_UPLOAD_BYTES) {
        error ??= fileTooLargeMessage(file);
      } else if (total + file.size > MAX_UPLOAD_BYTES) {
        error ??= totalTooLargeMessage(total + file.size);
      } else {
        total += file.size;
        toAdd.push(file);
      }
    }
    setUploadError(error);
    if (error) toast.error("Algunas imágenes no se agregaron", error);
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
    setUploadError(null);
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

  /** Misma interceptación "Enviar a revisión" que en el menú rápido — acá los campos ya son controlados, así que
   * no hace falta leer FormData para saber el estado elegido. Pasar a Aprobado se guarda directo: el aviso por email
   * al cliente ("¡Lista para publicar!") quedó postergado para F5. */
  // Las confirmaciones se resuelven con formRef.requestSubmit(), que dispara el submit SIN pasar por este
  // onClick: por eso no hace falta ningún flag para "saltear" la verificación, y cada click real vuelve a
  // evaluarla desde cero. Las transiciones se comparan contra lo GUARDADO (original.statusId), no contra el
  // prop `publication`, que puede quedar desactualizado después de un guardado dentro de esta misma vista.
  function handleSaveClick(e: React.MouseEvent) {
    if (blockIfOverUploadLimit(e)) return;
    // v1.6: pasar a En revisión siempre pide confirmación (Editar desde otro estado guardado, o Crear/Duplicar
    // directamente En revisión). Mientras siga En revisión, las ediciones normales no vuelven a preguntar.
    if (
      requiresReviewConfirmation({
        targetStatusId: statusId,
        savedStatusId: publication ? original.statusId : null,
        inReviewStatusId: inReviewStatus?.id,
      })
    ) {
      e.preventDefault();
      setReviewDialogOpen(true);
    }
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
  // Portada de Post/Reel/Story: la imagen primaria del último guardado (state.publication, ya firmada) salvo
  // que haya una portada nueva elegida sin guardar. Así, si se reordenó y guardó el carrusel y después se
  // pasa a otro tipo en la misma sesión, se ve la portada real (primera del carrusel), no la inicial.
  const savedPrimaryAsset = state.publication
    ? (state.publication.assets.find((a) => a.isPrimary) ?? state.publication.assets[0] ?? null)
    : undefined;
  const coverPreview = thumbnailFile || savedPrimaryAsset === undefined ? thumbnailPreview : (savedPrimaryAsset?.thumbnailUrl ?? null);
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
    coverUrl: isCarouselMode ? (carouselImageUrls[0] ?? null) : coverPreview,
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
        className={cn(
          "grid max-h-[calc(100dvh-2rem)] w-full max-w-5xl grid-rows-[auto_auto_1fr] gap-0 overflow-hidden p-0 sm:max-w-5xl max-md:h-[100dvh] max-md:max-h-[100dvh] max-md:max-w-full max-md:rounded-none",
          // Con pestañas: alto fijo (el de Edición, acotado al viewport) — alternar pestañas no cambia el tamaño del
          // modal; cada pestaña scrollea adentro. Crear/Duplicar (sin pestañas) conservan el alto según contenido.
          publication && "md:h-[min(calc(100dvh-2rem),900px)]"
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border py-3 pr-14 pl-5">
          <DialogTitle className="text-sm font-medium text-muted-foreground">{headerTitle}</DialogTitle>
          {publication && !readOnly && (
            <Button size="sm" variant="outline" className="gap-1.5" type="button" onClick={handleShare}>
              <Share2 className="size-3.5" />
              Compartir
            </Button>
          )}
        </div>

        {/* Fila de avisos de v1.6: siempre presente (vacía = alto 0) para no alterar la grilla header/cuerpo. */}
        <div aria-live="polite">
        {(switchRequest || remoteStatusNotice) && (
          <div className="flex flex-col gap-2 border-b border-border bg-muted/40 px-5 py-2.5 text-sm">
            {remoteStatusNotice && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                  <RefreshCcw className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    {describeNotification(remoteStatusNotice)}. Tenés cambios sin guardar: si guardás ahora se va a
                    rechazar por conflicto. Copiá lo que necesites y volvé a abrir la publicación para ver la versión
                    actual.
                  </span>
                </span>
                <span className="flex shrink-0 gap-2">
                  <Button size="sm" variant="outline" type="button" onClick={() => setRemoteStatusNotice(null)}>
                    Seguir acá
                  </Button>
                  <Button size="sm" type="button" onClick={() => setConfirmCloseOpen(true)}>
                    Descartar cambios y cerrar
                  </Button>
                </span>
              </div>
            )}
            {switchRequest && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                  <Bell className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    {describeNotification(switchRequest)}.{" "}
                    {!readOnly && isDirty
                      ? "Guardá o descartá los cambios de esta publicación para poder abrirla."
                      : "¿Querés abrirla ahora?"}
                  </span>
                </span>
                <span className="flex shrink-0 gap-2">
                  <Button size="sm" variant="outline" type="button" onClick={() => setSwitchRequest(null)}>
                    Quedarme acá
                  </Button>
                  {(readOnly || !isDirty) && (
                    <Button
                      size="sm"
                      type="button"
                      onClick={() => {
                        const target = switchRequest;
                        setSwitchRequest(null);
                        onOpenChange(false);
                        notifications?.navigateTo(target);
                      }}
                    >
                      Abrir
                    </Button>
                  )}
                </span>
              </div>
            )}
          </div>
        )}
        </div>

        <div
          ref={bodyRef}
          className="min-h-0 scroll-pb-24 overflow-y-auto md:grid md:grid-cols-[minmax(0,380px)_1fr] md:overflow-hidden md:scroll-pb-0"
        >
          {/* Izquierda: preview — sin scroll propio, centrado verticalmente cuando sobra alto; se mantiene
              visible mientras la columna derecha scrollea (esa es la única con overflow-y-auto). En mobile
              (<md) no hay columnas: el cuerpo entero es el ÚNICO scroll (preview + form, sin scrolls
              anidados) y el footer es sticky bottom-0 dentro de ese scroll. */}
          <div
            ref={previewRef}
            className="flex flex-col items-center justify-center gap-3 border-b border-border bg-muted/30 p-4 md:h-full md:p-6 md:overflow-hidden md:border-b-0 md:border-r"
          >
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
              <div className="flex w-full max-w-[300px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-muted px-4 py-6 text-center md:aspect-9/16 md:p-6">
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
              pasando por debajo del botón de guardar. En readOnly: solo la presentación de lectura, sin form
              ni footer. */}
          {readOnly && publication ? (
            <div className="contents md:grid md:grid-rows-[auto_1fr] md:overflow-hidden">
              <PublicationTabsBar mainLabel="Publicación" tab={tab} onTabChange={setTab} commentCount={commentCount} />
              <div className={tabPanelClass(tab === "main")}>
                <PublicationReadOnlyDetails
                  publication={publication}
                  calendars={calendars}
                  clientAccounts={clientAccounts}
                  campaigns={campaigns}
                  onApproved={() => void reloadPublication()}
                  onStale={() => void reloadPublication()}
                />
              </div>
              <div className={tabPanelClass(tab === "comments")}>
                <PublicationComments
                  publicationId={publication.id}
                  clientId={clientId}
                  statusId={publication.statusId}
                  embedded
                  active={tab === "comments"}
                  onUnreadCountChange={setCommentCount}
                  // Cliente: un cambio de estado de la agencia recarga la vista (botón Aprobar, versión, registro).
                  onRemoteStatusChange={(remoteStatusId) => {
                    if (remoteStatusId !== publication.statusId) void reloadPublication();
                  }}
                />
              </div>
            </div>
          ) : (
          <div
            className={cn(
              "contents md:grid md:overflow-hidden",
              publication ? "md:grid-rows-[auto_1fr_auto]" : "md:grid-rows-[1fr_auto]"
            )}
          >
            {publication && (
              <PublicationTabsBar
                mainLabel="Edición"
                tab={tab}
                onTabChange={setTab}
                commentCount={commentCount}
                mainHasUnsavedChanges={isDirty}
              />
            )}
            <div className={publication ? tabPanelClass(tab === "main") : "flex flex-col gap-5 p-5 md:overflow-y-auto"}>
              <form
                ref={formRef}
                id="pv-form"
                action={formAction}
                onSubmit={(e) => {
                  if (blockIfOverUploadLimit(e)) return;
                  syncFileInputs();
                }}
                className="flex flex-col gap-5">
                {publication && <input type="hidden" name="id" value={publication.id} />}
                {publication && <input type="hidden" name="originalStatusId" value={original.statusId} readOnly />}
                {publication && <input type="hidden" name="originalUpdatedAt" value={baseUpdatedAt} readOnly />}
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
                {publication && isSavedApproved && <ApprovalRecord publicationId={publication.id} refreshKey={state.savedAt ?? 0} />}
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
                      {coverPreview ? (
                        <Image src={coverPreview} alt="" fill sizes="64px" className="object-cover" />
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

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pv-trelloUrl">Link a Trello</Label>
                <Input
                  id="pv-trelloUrl"
                  name="trelloUrl"
                  type="url"
                  placeholder="https://trello.com/c/..."
                  value={trelloUrl}
                  aria-invalid={trelloUrl.trim() !== "" && !isValidTrelloUrl(trelloUrl.trim())}
                  onChange={(e) => setTrelloUrl(e.target.value)}
                />
                {trelloUrl.trim() !== "" &&
                  (isValidTrelloUrl(trelloUrl.trim()) ? (
                    <a
                      href={trelloUrl.trim()}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-fit gap-1.5")}
                    >
                      <ExternalLink className="size-3.5" />
                      Abrir tarjeta en Trello
                    </a>
                  ) : (
                    <p className="text-xs text-destructive">{TRELLO_URL_ERROR}</p>
                  ))}
              </div>

              {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
              {state.error && <p className="text-sm text-destructive">{state.error}</p>}
              </form>

              {/* Archivar / Eliminar (v1.6): menú discreto, separado a propósito del botón principal de guardar. Solo
                  Editar: en Crear/Duplicar todavía no hay nada persistido. Archivar no pide confirmación (se puede
                  deshacer); Eliminar abre la confirmación de siempre. */}
              {publication && (
                <div className="flex justify-start border-t border-border pt-4">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <button
                          type="button"
                          disabled={archiving}
                          className="flex items-center gap-1.5 rounded-md text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
                        />
                      }
                    >
                      <Archive className="size-3.5" />
                      {onArchive ? "Archivar o eliminar" : "Eliminar"}
                      <ChevronDown className="size-3" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {onArchive && (
                        <DropdownMenuItem onClick={() => void handleArchive()}>
                          <Archive />
                          Archivar
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                        <Trash2 />
                        Eliminar publicación
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>

            {/* Comentarios: según el estado GUARDADO (no el elegido sin guardar en el selector). Un cambio de
                estado recibido en vivo no recarga el editor (perdería lo que se está editando): el guardado
                igual lo detecta y lo rechaza como conflicto. En Comentarios el footer está oculto (su fila mide 0),
                así que la conversación ya usa todo el alto. */}
            {publication && (
              <div className={tabPanelClass(tab === "comments")}>
                <PublicationComments
                  publicationId={publication.id}
                  clientId={clientId}
                  statusId={original.statusId}
                  embedded
                  active={tab === "comments"}
                  onUnreadCountChange={setCommentCount}
                />
              </div>
            )}

            {/* Guardar pertenece solo a Edición: en Comentarios se oculta (los cambios del form se conservan). */}
            <div
              className={cn(
                "sticky bottom-0 z-10 flex shrink-0 justify-end border-t border-border bg-white px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:static md:pb-3",
                publication && "md:row-start-3",
                tab !== "main" && "hidden"
              )}
            >
              <Button ref={submitButtonRef} type="submit" form="pv-form" disabled={isPending || !canSubmit} onClick={handleSaveClick}>
                {submitLabel}
              </Button>
            </div>
          </div>
          )}
        </div>
      </DialogContent>

      {/* Dialogs de staff (cerrar sin guardar, aprobar y avisar, eliminar): inalcanzables en readOnly. */}
      {!readOnly && (
      <>
      {/* Conflicto de versión: nada se guardó y nada se sobrescribe; el usuario elige copiar lo suyo y/o recargar. */}
      <AlertDialog open={conflictOpen} onOpenChange={(open) => !open && closeConflict()}>
        {/* Más ancho que el AlertDialog por defecto (384 px no alcanza para tres acciones): mismo variant data-size para
            que el override aplique. Mobile: botones apilados a todo el ancho; desktop: en fila, envolviendo si hace falta. */}
        <AlertDialogContent className="data-[size=default]:max-w-[calc(100vw-2rem)] data-[size=default]:sm:max-w-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Otra persona modificó esta publicación</AlertDialogTitle>
            <AlertDialogDescription className="break-words">
              {state.error} Tus cambios siguen en el formulario y no se guardaron.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirmReload ? (
            <p className="rounded-lg bg-amber-50 p-2.5 text-sm break-words text-amber-900">
              Recargar reemplaza tus cambios no guardados por la versión guardada. Si los necesitás, copialos antes.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Podés copiar tus cambios al portapapeles y después recargar la versión actual para volver a aplicarlos.
            </p>
          )}
          <AlertDialogFooter className="sm:flex-wrap">
            <AlertDialogCancel onClick={closeConflict}>Seguir editando</AlertDialogCancel>
            <Button type="button" variant="outline" onClick={() => void handleCopyLocalChanges()}>
              Copiar mis cambios
            </Button>
            {confirmReload ? (
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  closeConflict();
                  void reloadPublication();
                }}
              >
                Reemplazar y recargar
              </Button>
            ) : (
              <Button type="button" onClick={() => setConfirmReload(true)}>
                Recargar versión actual
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      <ReviewRequestDialog
        open={reviewDialogOpen}
        onCancel={() => {
          // Cancelar no guarda nada y vuelve el selector al estado guardado (Crear: al estado inicial).
          setReviewDialogOpen(false);
          setStatusId(original.statusId);
        }}
        onConfirm={() => {
          setReviewDialogOpen(false);
          formRef.current?.requestSubmit();
        }}
      />

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
      </>
      )}
    </Dialog>
  );
}

/**
 * Panel de una pestaña (v1.6). En md+ los paneles comparten la celda bajo la barra y cada uno scrollea por su
 * cuenta; el inactivo queda `invisible` (no `hidden`) para conservar su posición de scroll y no alterar el alto.
 * En mobile el inactivo sale del flujo y el activo vive en el único scroll del cuerpo.
 */
function tabPanelClass(active: boolean): string {
  return cn(
    "flex flex-col gap-5 p-5 md:col-start-1 md:row-start-2 md:min-h-0 md:overflow-y-auto",
    // `visibility` se hereda y es animable: los descendientes con `transition-all` (p. ej. Button) la animarían
    // y seguirían visibles ~150 ms sobre el otro panel. Sin transiciones en el inactivo, se oculta al instante.
    !active && "max-md:hidden md:invisible md:[&_*]:transition-none!"
  );
}

/**
 * Pestañas de la columna derecha (v1.6), compartidas por staff ("Edición") y Client User ("Publicación").
 * En mobile queda fija arriba dentro del único scroll del cuerpo; en md+ es la primera fila de la columna.
 */
function PublicationTabsBar({
  mainLabel,
  tab,
  onTabChange,
  commentCount,
  mainHasUnsavedChanges = false,
}: {
  mainLabel: string;
  tab: PublicationViewTab;
  onTabChange: (tab: PublicationViewTab) => void;
  commentCount: number | null;
  mainHasUnsavedChanges?: boolean;
}) {
  const tabs: { value: PublicationViewTab; label: string }[] = [
    { value: "main", label: mainLabel },
    { value: "comments", label: "Comentarios" },
  ];
  return (
    <div className="sticky top-0 z-10 shrink-0 border-b border-border bg-white px-5 py-3 md:static">
      {/* Control segmentado: 100 % del ancho disponible, dos columnas iguales en todos los tamaños. */}
      <div
        role="tablist"
        aria-label="Secciones de la publicación"
        className="grid w-full grid-cols-2 gap-1 rounded-xl bg-neutral-100 p-1"
      >
        {tabs.map((option) => {
          const active = tab === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onTabChange(option.value)}
              className={cn(
                "flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:outline-none",
                active ? "bg-neutral-900 text-white shadow-sm" : "text-neutral-700 hover:bg-neutral-200 hover:text-neutral-900"
              )}
            >
              <span className="truncate">{option.label}</span>
              {option.value === "main" && mainHasUnsavedChanges && (
                <span
                  aria-label="Cambios sin guardar"
                  title="Cambios sin guardar"
                  className="size-2 shrink-0 rounded-full bg-amber-500 ring-2 ring-white/70"
                />
              )}
              {option.value === "comments" && commentCount !== null && commentCount > 0 && (
                <span
                  className={cn(
                    "min-w-5 shrink-0 rounded-full bg-[#000000] px-1.5 text-center text-xs leading-5 font-semibold text-[#FFFFFF]",
                    // Sobre la pestaña activa (fondo casi negro) un filo claro mantiene el contorno visible.
                    active && "ring-1 ring-white/40"
                  )}
                >
                  {commentCount > 99 ? "99+" : commentCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Columna derecha de PublicationView en readOnly (Client User): mismos datos y componentes que la vista
 * de staff (badges de destinos, StatusPill, CopyBlock, CTA/URL, Drive). */
function PublicationReadOnlyDetails({
  publication,
  calendars,
  clientAccounts,
  campaigns,
  onApproved,
  onStale,
}: {
  publication: Publication;
  calendars: Calendar[];
  clientAccounts: ClientAccount[];
  campaigns: Campaign[];
  onApproved: () => void;
  onStale: () => void;
}) {
  const { getContentType, getPlatform, getStatus } = useLookups();
  const calendar = calendars.find((c) => c.id === publication.calendarId);
  const campaign = publication.campaignId ? campaigns.find((c) => c.id === publication.campaignId) : undefined;
  const contentType = getContentType(publication.contentTypeId);
  const status = getStatus(publication.statusId);

  return (
    <>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{publication.title}</h2>
        <p className="text-sm text-muted-foreground">
          {formatFullDate(publication.publicationDate)}
          {publication.publicationTime ? ` · ${formatTime(publication.publicationTime)}` : ""}
          {calendar ? ` · ${calendar.name}` : ""}
        </p>
      </div>

      {publication.destinations.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {publication.destinations.map((destination) => {
            const account = clientAccounts.find((a) => a.id === destination.clientAccountId);
            if (!account) return null;
            const platform = getPlatform(account.platformId);
            if (!platform) return null;
            const secondaryName = accountSecondaryName(account);
            return (
              <Badge key={destination.clientAccountId} variant="outline" className="gap-1.5 py-1">
                <PlatformIcon platformKey={platform.key} className="size-3" style={{ color: platform.color }} />
                {accountLabel(account)}
                {secondaryName ? ` · ${secondaryName}` : ""}
              </Badge>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {contentType && <Badge variant="secondary">{contentType.label}</Badge>}
        {status && <StatusPill status={status} size="md" />}
        {campaign && <Badge variant="outline">{campaign.name}</Badge>}
      </div>

      {/* v1.6 — el cliente aprueba solo desde En revisión; una vez Aprobada, se muestra quién y cuándo. */}
      {canClientApprove(status?.key) && (
        <ClientApproveButton
          publicationId={publication.id}
          expectedUpdatedAt={publication.updatedAt}
          onApproved={onApproved}
          onStale={onStale}
        />
      )}
      {status?.key === "approved" && <ApprovalRecord publicationId={publication.id} refreshKey={publication.statusId} />}

      <CopyBlock copy={publication.copy} />

      {publication.driveFolderUrl && (
        <div>
          <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted-foreground">Archivos</span>
          <a
            href={publication.driveFolderUrl}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
          >
            <FolderOpen className="size-3.5" />
            Abrir carpeta en Drive
          </a>
        </div>
      )}

      {publication.trelloUrl && isValidTrelloUrl(publication.trelloUrl) && (
        <div>
          <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted-foreground">Trello</span>
          <a
            href={publication.trelloUrl}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
          >
            <ExternalLink className="size-3.5" />
            Abrir tarjeta en Trello
          </a>
        </div>
      )}
    </>
  );
}
