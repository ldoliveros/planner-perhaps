export interface PublicationPreviewProps {
  coverUrl: string | null;
  /** Solo para previews de carrusel (varias imágenes en orden) — Reel/Post/Story siguen usando coverUrl. */
  images?: string[];
  handle: string | null;
  accountName: string | null;
  copy: string;
  driveFolderUrl: string | null;
}
