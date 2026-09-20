import type { PhotoSource, SequenceDocument, SequenceItemId, SourceError } from "../../contracts";

export interface SequenceFolderExportProgress {
  readonly completed: number;
  readonly total: number;
  readonly filename?: string;
}

export interface SequenceFolderExportFailure {
  readonly itemId: SequenceItemId;
  readonly filename: string;
  readonly error: SourceError | "write-failed";
}

export interface SequenceFolderExportResult {
  readonly folderName: string;
  readonly copied: number;
  readonly failed: readonly SequenceFolderExportFailure[];
}

export type SequenceFolderExportErrorKind = "unsupported" | "cancelled" | "permission-denied" | "unsafe-destination" | "io";

export class SequenceFolderExportError extends Error {
  readonly kind: SequenceFolderExportErrorKind;

  constructor(kind: SequenceFolderExportErrorKind, message: string) {
    super(message);
    this.name = "SequenceFolderExportError";
    this.kind = kind;
  }
}

type DirectoryPicker = (options?: { readonly mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;

/** Copies original source bytes into a new destination folder; the source is read-only. */
export async function exportSequenceFolder(
  sequence: Pick<SequenceDocument, "name" | "items">,
  photoSource: Pick<PhotoSource, "getPhoto" | "readOriginalFile" | "isExportDirectorySafe">,
  onProgress?: (progress: SequenceFolderExportProgress) => void,
): Promise<SequenceFolderExportResult> {
  const picker = (globalThis as typeof globalThis & { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker;
  if (typeof picker !== "function") throw new SequenceFolderExportError("unsupported", "Folder export is not supported in this browser.");

  let destination: FileSystemDirectoryHandle;
  try {
    destination = await picker({ mode: "readwrite" });
  } catch (error) {
    throw mapPickerError(error);
  }
  if (!await photoSource.isExportDirectorySafe(destination)) {
    throw new SequenceFolderExportError("unsafe-destination", "The destination cannot be inside an original photo source folder.");
  }

  let folder: FileSystemDirectoryHandle;
  try {
    folder = await createUniqueDirectory(destination, sanitizeFolderName(sequence.name));
  } catch {
    throw new SequenceFolderExportError("io", "The destination folder could not be created.");
  }

  const photos = sequence.items.filter((item): item is Extract<SequenceDocument["items"][number], { kind: "photo" }> => item.kind === "photo");
  const usedNames = new Set<string>();
  const failed: SequenceFolderExportFailure[] = [];
  let copied = 0;
  for (let index = 0; index < photos.length; index += 1) {
    const item = photos[index];
    let filename = `photo-${String(index + 1).padStart(3, "0")}.jpg`;
    try {
      const photo = await photoSource.getPhoto(item.photoId);
      if (!photo.ok) {
        failed.push({ itemId: item.id, filename, error: photo.error });
        onProgress?.({ completed: index + 1, total: photos.length, filename });
        continue;
      }
      filename = uniqueFileName(sanitizeFileName(fileNameFromPath(photo.value.relativePath)), usedNames);
      const original = await photoSource.readOriginalFile(item.photoId);
      if (!original.ok) {
        failed.push({ itemId: item.id, filename, error: original.error });
        onProgress?.({ completed: index + 1, total: photos.length, filename });
        continue;
      }
      const fileHandle = await folder.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      try {
        await writable.write(original.value);
        await writable.close();
      } catch (error) {
        await writable.abort().catch(() => undefined);
        throw error;
      }
      copied += 1;
    } catch {
      failed.push({ itemId: item.id, filename, error: "write-failed" });
    }
    onProgress?.({ completed: index + 1, total: photos.length, filename });
  }
  return { folderName: folder.name, copied, failed };
}

function mapPickerError(error: unknown): SequenceFolderExportError {
  if (error instanceof DOMException && error.name === "AbortError") return new SequenceFolderExportError("cancelled", "Folder selection was cancelled.");
  if (error instanceof DOMException && error.name === "NotAllowedError") return new SequenceFolderExportError("permission-denied", "Permission to write to the destination folder was denied.");
  return new SequenceFolderExportError("io", "The destination folder could not be opened.");
}

async function createUniqueDirectory(parent: FileSystemDirectoryHandle, baseName: string): Promise<FileSystemDirectoryHandle> {
  for (let index = 1; index <= 100; index += 1) {
    const name = index === 1 ? baseName : `${baseName} (${index})`;
    try {
      await parent.getDirectoryHandle(name);
    } catch (error) {
      if (error instanceof DOMException && error.name === "TypeMismatchError") continue;
      if (!isNotFound(error)) throw error;
      return parent.getDirectoryHandle(name, { create: true });
    }
  }
  throw new Error("No unique destination folder name available.");
}

function isNotFound(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotFoundError";
}

function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).at(-1) || "photo.jpg";
}

function sanitizeFolderName(name: string): string {
  const value = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/g, "").trim();
  return value || "Sequence";
}

function sanitizeFileName(name: string): string {
  const value = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/g, "").trim();
  return value || "photo.jpg";
}

function uniqueFileName(name: string, used: Set<string>): string {
  const key = name.toLocaleLowerCase();
  if (!used.has(key)) {
    used.add(key);
    return name;
  }
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";
  let index = 2;
  while (used.has(`${stem} (${index})${extension}`.toLocaleLowerCase())) index += 1;
  const next = `${stem} (${index})${extension}`;
  used.add(next.toLocaleLowerCase());
  return next;
}
