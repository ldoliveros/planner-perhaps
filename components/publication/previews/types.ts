export interface PublicationPreviewProps {
  coverUrl: string | null;
  /** Solo para previews de carrusel (varias imágenes en orden) — Reel/Post/Story siguen usando coverUrl. */
  images?: string[];
  handle: string | null;
  accountName: string | null;
  copy: string;
  driveFolderUrl: string | null;
  /** Logo del cliente (clients.logo_url, ya firmado) usado como avatar en todos los previews — no depende
   * de la cuenta/destino activo, es el mismo para Instagram/Facebook/futuras redes. null si el cliente no
   * tiene logo cargado, en cuyo caso cada preview mantiene su fallback de iniciales actual. */
  avatarUrl: string | null;
}
