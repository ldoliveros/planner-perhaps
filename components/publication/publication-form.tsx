"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ImageIcon, Plus, Trash2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { PlatformIcon } from "@/components/icons/brand-icons";
import { useLookups } from "@/components/providers/lookups-provider";
import { deletePublication, savePublication, type PublicationFormState } from "@/lib/actions/publications";
import type { AssetType, Publication, PublicationDestination } from "@/types";

const INITIAL_STATE: PublicationFormState = { error: null, savedAt: null };

const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  image: "Imagen",
  video: "Video",
  pdf: "PDF",
  document: "Documento",
  other: "Otro",
};

interface ManualAssetRow {
  id?: string;
  type: AssetType;
  filename: string;
  driveFileUrl: string | null;
}

interface PublicationFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  calendarId: string;
  publication?: Publication;
  defaultDate?: string;
}

function destinationKey(platformId: string, accountTypeId: string | null): string {
  return `${platformId}::${accountTypeId ?? ""}`;
}

export function PublicationForm({ open, onOpenChange, calendarId, publication, defaultDate }: PublicationFormProps) {
  const { platforms, accountTypes, contentTypes, statuses } = useLookups();
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(savePublication, INITIAL_STATE);
  const lastSavedAt = useRef<number | null>(null);

  // El padre remonta este componente (key) cada vez que se abre para un target
  // nuevo, así que los valores iniciales alcanzan — no hace falta re-sincronizar
  // este estado en un efecto.
  const primaryAsset = publication?.assets.find((a) => a.isPrimary) ?? null;
  const otherAssets = publication?.assets.filter((a) => !a.isPrimary) ?? [];

  const [destinations, setDestinations] = useState<PublicationDestination[]>(publication?.destinations ?? []);
  const [manualAssets, setManualAssets] = useState<ManualAssetRow[]>(() =>
    otherAssets.map((a) => ({ id: a.id, type: a.type, filename: a.filename, driveFileUrl: a.driveFileUrl }))
  );
  const [removedAssetIds, setRemovedAssetIds] = useState<string[]>([]);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(primaryAsset?.thumbnailUrl ?? null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.savedAt && state.savedAt !== lastSavedAt.current) {
      lastSavedAt.current = state.savedAt;
      onOpenChange(false);
      router.refresh();
    }
  }, [state.savedAt, onOpenChange, router]);

  const selectedKeys = new Set(destinations.map((d) => destinationKey(d.platformId, d.accountTypeId)));

  function toggleDestination(platformId: string, accountTypeId: string | null) {
    const key = destinationKey(platformId, accountTypeId);
    setDestinations((prev) =>
      selectedKeys.has(key)
        ? prev.filter((d) => destinationKey(d.platformId, d.accountTypeId) !== key)
        : [...prev, { platformId, accountTypeId }]
    );
  }

  function handleThumbnailChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) setThumbnailPreview(URL.createObjectURL(file));
  }

  function addManualAsset() {
    setManualAssets((prev) => [...prev, { type: "image", filename: "", driveFileUrl: null }]);
  }

  function updateManualAsset(index: number, patch: Partial<ManualAssetRow>) {
    setManualAssets((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeManualAsset(index: number) {
    setManualAssets((prev) => {
      const row = prev[index];
      if (row.id) setRemovedAssetIds((ids) => [...ids, row.id as string]);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleConfirmDelete() {
    if (!publication) return;
    setDeleteError(null);
    const result = await deletePublication(publication.id, calendarId);
    if (result.error) {
      setDeleteError(result.error);
      return;
    }
    setDeleteOpen(false);
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{publication ? "Editar contenido" : "Nuevo contenido"}</SheetTitle>
        </SheetHeader>

        <form action={formAction} className="flex flex-col gap-6 px-4 pb-6">
          {publication && <input type="hidden" name="id" value={publication.id} />}
          <input type="hidden" name="calendarId" value={calendarId} />
          <input type="hidden" name="destinations" value={JSON.stringify(destinations)} readOnly />
          <input
            type="hidden"
            name="manualAssets"
            value={JSON.stringify(manualAssets.filter((a) => a.filename.trim().length > 0))}
            readOnly
          />
          <input type="hidden" name="removedAssetIds" value={JSON.stringify(removedAssetIds)} readOnly />

          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Información</h3>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="title">Título</Label>
              <Input id="title" name="title" defaultValue={publication?.title} required autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="campaign">Campaña</Label>
                <Input id="campaign" name="campaign" defaultValue={publication?.campaign ?? ""} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="contentTypeId">Tipo de contenido</Label>
                <Select
                  name="contentTypeId"
                  defaultValue={publication?.contentTypeId}
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
          </section>

          <Separator />

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
                  defaultValue={publication?.publicationTime ?? ""}
                />
              </div>
            </div>
          </section>

          <Separator />

          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Destinos / Canales</h3>
            <div className="flex flex-col gap-2">
              {platforms.map((platform) => (
                <div
                  key={platform.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <PlatformIcon platformKey={platform.key} className="size-4" style={{ color: platform.color }} />
                    <span className="text-sm font-medium text-foreground">{platform.name}</span>
                  </div>
                  {platform.requiresAccountType ? (
                    <div className="flex flex-wrap gap-3">
                      {accountTypes.map((accountType) => (
                        <label key={accountType.id} className="flex items-center gap-1.5 text-sm text-foreground">
                          <Checkbox
                            checked={selectedKeys.has(destinationKey(platform.id, accountType.id))}
                            onCheckedChange={() => toggleDestination(platform.id, accountType.id)}
                          />
                          {accountType.name}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <label className="flex items-center gap-1.5 text-sm text-foreground">
                      <Checkbox
                        checked={selectedKeys.has(destinationKey(platform.id, null))}
                        onCheckedChange={() => toggleDestination(platform.id, null)}
                      />
                      Incluir
                    </label>
                  )}
                </div>
              ))}
            </div>
          </section>

          <Separator />

          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contenido</h3>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="copy">Copy</Label>
              <Textarea id="copy" name="copy" rows={5} defaultValue={publication?.copy ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cta">CTA</Label>
              <Input id="cta" name="cta" defaultValue={publication?.cta ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="externalUrl">URL</Label>
              <Input id="externalUrl" name="externalUrl" type="url" defaultValue={publication?.externalUrl ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="internalNotes">Notas internas</Label>
              <Textarea id="internalNotes" name="internalNotes" rows={2} defaultValue={publication?.internalNotes ?? ""} />
            </div>
          </section>

          <Separator />

          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estado</h3>
            <Select
              name="statusId"
              defaultValue={publication?.statusId ?? statuses.find((s) => s.order === 1)?.id}
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

          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Portada / preview</h3>
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

          <Separator />

          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Archivos / Drive</h3>
              <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={addManualAsset}>
                <Plus className="size-3.5" />
                Agregar archivo
              </Button>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="driveFolderUrl">Carpeta de Drive de la publicación (opcional)</Label>
              <Input
                id="driveFolderUrl"
                name="driveFolderUrl"
                type="url"
                placeholder="https://drive.google.com/drive/folders/..."
                defaultValue={publication?.driveFolderUrl ?? ""}
              />
            </div>

            {manualAssets.length > 0 && (
              <div className="flex flex-col gap-2">
                {manualAssets.map((asset, index) => (
                  <div key={asset.id ?? `new-${index}`} className="flex items-start gap-2 rounded-lg border border-border p-2">
                    <div className="grid flex-1 grid-cols-2 gap-2">
                      <Input
                        placeholder="Nombre del archivo"
                        value={asset.filename}
                        onChange={(e) => updateManualAsset(index, { filename: e.target.value })}
                        className="col-span-2"
                      />
                      <Select
                        value={asset.type}
                        onValueChange={(value) => updateManualAsset(index, { type: value as AssetType })}
                        items={ASSET_TYPE_LABELS}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(ASSET_TYPE_LABELS) as AssetType[]).map((type) => (
                            <SelectItem key={type} value={type}>
                              {ASSET_TYPE_LABELS[type]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        placeholder="URL de Drive (opcional)"
                        type="url"
                        value={asset.driveFileUrl ?? ""}
                        onChange={(e) => updateManualAsset(index, { driveFileUrl: e.target.value || null })}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground"
                      onClick={() => removeManualAsset(index)}
                      aria-label="Quitar archivo"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
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
