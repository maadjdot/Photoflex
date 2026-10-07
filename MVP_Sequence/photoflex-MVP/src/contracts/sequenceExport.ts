import type { PhotoId } from "./ids";
import type { SequenceDocument, SequenceTextItem } from "./sequence";

export interface SequencePdfProgress {
  readonly completed: number;
  readonly total: number;
}

export interface SequencePdfOptions {
  readonly sequence: SequenceDocument;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: SequencePdfProgress) => void;
}

/** Encoded photograph, with orientation applied, ready to embed in a PDF. */
export interface SequencePdfImage { readonly bytes: Uint8Array; readonly format: "jpg" | "png" }

export interface SequencePdfImageSource {
  loadImage(photoId: PhotoId, signal?: AbortSignal): Promise<SequencePdfImage>;
  loadTextJpeg?(item: SequenceTextItem, width: number, height: number, signal?: AbortSignal): Promise<Uint8Array>;
}
