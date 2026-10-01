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
  /** Directly placed photos resize as a whole at their source aspect ratio. */
  readonly photoAspectRatio?: number;
  readonly crop: { readonly mode: "fit" | "fill"; readonly zoom: number; readonly focal: { readonly x: number; readonly y: number } };
}

export type LayoutFontFamily =
  | "ancizar-serif"
  | "architects-daughter"
  | "courier-prime"
  | "eb-garamond"
  | "google-sans"
  | "gudea"
  | "lxgw-wenkai-tc"
  | "noto-sans-sc"
  | "noto-serif"
  | "noto-serif-sc"
  | "patrick-hand"
  | "roboto"
  | "special-elite"
  | "zcool-kuaile" // legacy documents only; no longer selectable
  | "zcool-qingke-huangyou"
  | "zcool-xiaowei";
export type LayoutFontWeight = "normal" | "bold";
export type LayoutFontStyle = "normal" | "italic";

export interface LayoutTextBox {
  readonly kind: "text-box";
  readonly id: LayoutObjectId;
  readonly rect: LayoutRect;
  readonly text: string;
  readonly style: {
    readonly fontFamily: LayoutFontFamily;
    /** Omitted values in existing documents are treated as normal. */
    readonly fontWeight?: LayoutFontWeight;
    readonly fontStyle?: LayoutFontStyle;
    readonly fontSizePt: number;
    readonly lineHeight: number;
    readonly color: string;
    readonly align: "left" | "center" | "right";
  };
}

export type LayoutObject = LayoutImageFrame | LayoutTextBox;

export type LayoutPaperMaterial = "none" | "fine-paper" | "natural-fiber" | "fine-linen" | "coarse-linen" | "bookcloth";

export interface LayoutPaper {
  readonly color: string;
  readonly material: LayoutPaperMaterial;
}

export interface LayoutPage {
  readonly id: LayoutPageId;
  /** Omitted in existing documents and interpreted as plain white paper. */
  readonly paper?: LayoutPaper;
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
  | { readonly type: "set-page-size"; readonly widthPt: number; readonly heightPt: number }
  | { readonly type: "add-page"; readonly page: LayoutPage; readonly at?: number }
  | { readonly type: "remove-page"; readonly pageId: LayoutPageId }
  | { readonly type: "move-page"; readonly pageId: LayoutPageId; readonly to: number }
  | { readonly type: "set-paper"; readonly pageIds: readonly LayoutPageId[]; readonly paper: LayoutPaper }
  | { readonly type: "upsert-object"; readonly pageId: LayoutPageId; readonly object: LayoutObject }
  | { readonly type: "upsert-objects"; readonly updates: readonly { readonly pageId: LayoutPageId; readonly object: LayoutObject }[] }
  | { readonly type: "remove-object"; readonly pageId: LayoutPageId; readonly objectId: LayoutObjectId }
  | { readonly type: "remove-objects"; readonly objectIds: readonly LayoutObjectId[] }
  | { readonly type: "move-object"; readonly pageId: LayoutPageId; readonly objectId: LayoutObjectId; readonly to: number }
  | { readonly type: "replace-image-frames"; readonly pageId: LayoutPageId; readonly frames: readonly LayoutImageFrame[] };
