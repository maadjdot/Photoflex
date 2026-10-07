import type { LayoutFontStyle, LayoutFontWeight } from "../../contracts";

export interface LayoutFontFaces {
  readonly regular: string;
  readonly bold?: string;
  readonly italic?: string;
  readonly boldItalic?: string;
}

export interface ResolvedLayoutFontAsset {
  readonly url: string;
  readonly syntheticBold: boolean;
  readonly syntheticItalic: boolean;
}

export function resolveLayoutFontFace(faces: LayoutFontFaces, weight?: LayoutFontWeight, style?: LayoutFontStyle): ResolvedLayoutFontAsset {
  const requestedWeight = weight ?? "normal";
  const requestedStyle = style ?? "normal";
  if (requestedWeight === "bold" && requestedStyle === "italic" && faces.boldItalic) {
    return { url: faces.boldItalic, syntheticBold: false, syntheticItalic: false };
  }
  if (requestedWeight === "bold" && faces.bold) {
    return { url: faces.bold, syntheticBold: false, syntheticItalic: requestedStyle === "italic" };
  }
  if (requestedStyle === "italic" && faces.italic) {
    return { url: faces.italic, syntheticBold: requestedWeight === "bold", syntheticItalic: false };
  }
  return { url: faces.regular, syntheticBold: requestedWeight === "bold", syntheticItalic: requestedStyle === "italic" };
}
