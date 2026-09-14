import type {
  AccountTypeRow,
  CalendarRow,
  ClientRow,
  ContentTypeRow,
  PlatformRow,
  PublicationAssetRow,
  PublicationDestinationRow,
  PublicationRow,
  StatusRow,
} from "./database.types";
import type {
  AccountType,
  Calendar,
  Client,
  ContentType,
  Platform,
  Publication,
  PublicationAsset,
  PublicationDestination,
  Status,
} from "@/types";

export function mapClient(row: ClientRow): Client {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    logoUrl: row.logo_url,
    color: row.color,
    active: row.active,
    driveFolderId: row.drive_folder_id,
    driveFolderUrl: row.drive_folder_url,
  };
}

export function mapCalendar(row: CalendarRow): Calendar {
  return {
    id: row.id,
    clientId: row.client_id,
    name: row.name,
    month: row.month,
    year: row.year,
    description: row.description,
    status: row.status,
    driveFolderId: row.drive_folder_id,
    driveFolderUrl: row.drive_folder_url,
  };
}

export function mapPlatform(row: PlatformRow): Platform {
  return {
    id: row.id,
    key: row.slug,
    name: row.name,
    color: row.color,
    requiresAccountType: row.requires_account_type,
  };
}

export function mapAccountType(row: AccountTypeRow): AccountType {
  return { id: row.id, key: row.slug, name: row.name };
}

export function mapContentType(row: ContentTypeRow): ContentType {
  return { id: row.id, key: row.key, label: row.label, order: row.sort_order };
}

export function mapStatus(row: StatusRow): Status {
  return { id: row.id, key: row.key, label: row.label, color: row.color, order: row.sort_order };
}

export function mapPublicationDestination(row: PublicationDestinationRow): PublicationDestination {
  return { platformId: row.platform_id, accountTypeId: row.account_type_id };
}

export function mapPublicationAsset(row: PublicationAssetRow): PublicationAsset {
  return {
    id: row.id,
    publicationId: row.publication_id,
    type: row.type,
    filename: row.filename,
    mimeType: row.mime_type,
    driveFileId: row.drive_file_id,
    driveFileUrl: row.drive_file_url,
    thumbnailUrl: row.thumbnail_url,
    fileSize: row.file_size,
    sortOrder: row.sort_order,
    isPrimary: row.is_primary,
  };
}

type PublicationRowWithRelations = PublicationRow & {
  publication_destinations?: PublicationDestinationRow[] | null;
  publication_assets?: PublicationAssetRow[] | null;
};

export function mapPublication(row: PublicationRowWithRelations): Publication {
  return {
    id: row.id,
    calendarId: row.calendar_id,
    clientId: row.client_id,
    title: row.title,
    publicationDate: row.publication_date,
    publicationTime: row.publication_time,
    campaign: row.campaign,
    contentTypeId: row.content_type_id,
    statusId: row.status_id,
    copy: row.copy,
    cta: row.cta,
    externalUrl: row.external_url,
    internalNotes: row.internal_notes,
    driveFolderId: row.drive_folder_id,
    driveFolderUrl: row.drive_folder_url,
    destinations: (row.publication_destinations ?? []).map(mapPublicationDestination),
    assets: (row.publication_assets ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(mapPublicationAsset),
  };
}
