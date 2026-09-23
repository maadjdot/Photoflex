import type { PhotoId } from "./ids";

export type FrameId = string & { readonly __brand: "FrameId" };
export type FrameSlotId = string & { readonly __brand: "FrameSlotId" };
export type FrameTemplateId = "single" | "diptych" | "triptych" | "quad-grid" | "full-page" | "square-nine-grid";
export type FrameDirection = "horizontal" | "vertical";

export interface FrameRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface FrameCrop {
  readonly mode: "fit" | "fill";
  readonly zoom: number;
  readonly focal: { readonly x: number; readonly y: number };
}

export interface FrameSlot {
  readonly id: FrameSlotId;
  readonly rect: FrameRect; // page points
  readonly photoId: PhotoId | null;
  readonly crop: FrameCrop;
  readonly cornerRadiusPt?: number;
  readonly origin?: "template" | "manual";
}

export interface FrameTemplateSource {
  readonly id: FrameTemplateId;
  readonly version: number;
  readonly direction: FrameDirection;
  readonly marginsPt: { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number };
  readonly gapPt: number;
  readonly modified: boolean;
}

export interface WorktableFrame {
  readonly id: FrameId;
  readonly name: string;
  readonly x: number; // Table world coordinates
  readonly y: number;
  readonly z: number;
  readonly frontOfPhotos?: boolean;
  readonly displayScale: number; // world coordinates per page point
  readonly page: {
    readonly widthPt: number;
    readonly heightPt: number;
    readonly background?: "white" | "black";
    readonly cornerRadiusPt?: number;
    readonly bleedPt?: number;
    readonly templateSource: FrameTemplateSource;
    readonly slots: readonly FrameSlot[];
  };
}

export type FrameEditCommand =
  | { readonly type: "create-frame"; readonly frame: WorktableFrame }
  | { readonly type: "move-frame"; readonly frameId: FrameId; readonly by: { readonly x: number; readonly y: number } }
  | { readonly type: "scale-frame"; readonly frameId: FrameId; readonly displayScale: number }
  | { readonly type: "rename-frame"; readonly frameId: FrameId; readonly name: string }
  | { readonly type: "resize-frame-page"; readonly frameId: FrameId; readonly widthPt: number; readonly heightPt: number; readonly reflow?: boolean }
  | { readonly type: "apply-frame-template"; readonly frameId: FrameId; readonly template: FrameTemplateSource; readonly expectedSlotIds: readonly FrameSlotId[] }
  | { readonly type: "add-frame-slot"; readonly frameId: FrameId; readonly slotId: FrameSlotId }
  | { readonly type: "remove-frame-slot"; readonly frameId: FrameId; readonly slotId: FrameSlotId }
  | { readonly type: "bring-frame-slot-to-front"; readonly frameId: FrameId; readonly slotId: FrameSlotId }
  | { readonly type: "set-frame-slot-corner-radius"; readonly frameId: FrameId; readonly slotId: FrameSlotId; readonly cornerRadiusPt: number }
  | { readonly type: "set-frame-background"; readonly frameId: FrameId; readonly background: "white" | "black" }
  | { readonly type: "set-frame-bleed"; readonly frameId: FrameId; readonly bleedPt: number }
  | { readonly type: "fill-frame-slots"; readonly frameId: FrameId; readonly photoIds: readonly PhotoId[] }
  | { readonly type: "replace-frame-photo"; readonly frameId: FrameId; readonly slotId: FrameSlotId; readonly photoId: PhotoId }
  | { readonly type: "clear-frame-photo"; readonly frameId: FrameId; readonly slotId: FrameSlotId }
  | { readonly type: "swap-frame-photos"; readonly frameId: FrameId; readonly firstId: FrameSlotId; readonly secondId: FrameSlotId }
  | { readonly type: "transform-frame-slot"; readonly frameId: FrameId; readonly slotId: FrameSlotId; readonly rect: FrameRect }
  | { readonly type: "set-frame-photo-crop"; readonly frameId: FrameId; readonly slotId: FrameSlotId; readonly crop: FrameCrop }
  | { readonly type: "duplicate-frame"; readonly frameId: FrameId; readonly copyId: FrameId; readonly slotIds: readonly FrameSlotId[] }
  | { readonly type: "remove-frame"; readonly frameId: FrameId }
  | { readonly type: "bring-frame-to-front"; readonly frameId: FrameId };

export type FrameCommandError =
  | { readonly kind: "unknown-frame" }
  | { readonly kind: "unknown-frame-slot" }
  | { readonly kind: "duplicate-frame" }
  | { readonly kind: "frame-capacity" }
  | { readonly kind: "frame-template-changed" }
  | { readonly kind: "invalid-frame" };
