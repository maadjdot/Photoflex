import type { LayoutId, LayoutObjectId, LayoutPageId, LayoutRevision, PhotoId, ProjectId, SequenceId } from "./ids";

export interface LayoutRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface LayoutImageFrame {
  readonly kind: "image-frame";
  readonly id: LayoutObjectId;
  readonly rect: LayoutRect;
  readonly photoId: PhotoId | null;
  readonly crop: { readonly mode: "fit" | "fill"; readonly zoom: number; readonly focal: { readonly x: number; readonly y: number } };
}

export interface LayoutTextBox {
  readonly kind: "text-box";
  readonly id: LayoutObjectId;
  readonly rect: LayoutRect;
  readonly text: string;
  readonly style: {
    readonly fontFamily: "noto-sans-sc";
    readonly fontSizePt: number;
    readonly lineHeight: number;
    readonly color: string;
    readonly align: "left" | "center" | "right";
  };
}

export type LayoutObject = LayoutImageFrame | LayoutTextBox;
export interface LayoutPage {
  readonly id: LayoutPageId;
  readonly objects: readonly LayoutObject[]; // array order is paint order
}

export interface LayoutDocument {
  readonly schemaVersion: 1;
  readonly id: LayoutId;
  readonly projectId: ProjectId;
  readonly sequenceId: SequenceId;
  readonly name: string;
  readonly pageSpec: { readonly widthPt: number; readonly heightPt: number };
  readonly pages: readonly LayoutPage[];
  readonly revision: LayoutRevision;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface LayoutSummary {
  readonly id: LayoutId;
  readonly projectId: ProjectId;
  readonly sequenceId: SequenceId;
  readonly name: string;
  readonly pageCount: number;
  readonly updatedAt: string;
}

export type LayoutEditCommand =
  | { readonly type: "rename"; readonly name: string }
  | { readonly type: "add-page"; readonly page: LayoutPage; readonly at?: number }
  | { readonly type: "remove-page"; readonly pageId: LayoutPageId }
  | { readonly type: "move-page"; readonly pageId: LayoutPageId; readonly to: number }
  | { readonly type: "upsert-object"; readonly pageId: LayoutPageId; readonly object: LayoutObject }
  | { readonly type: "remove-object"; readonly pageId: LayoutPageId; readonly objectId: LayoutObjectId }
  | { readonly type: "move-object"; readonly pageId: LayoutPageId; readonly objectId: LayoutObjectId; readonly to: number }
  | { readonly type: "replace-image-frames"; readonly pageId: LayoutPageId; readonly frames: readonly LayoutImageFrame[] };
