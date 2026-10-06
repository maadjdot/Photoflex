import type { LayoutImageFrame, LayoutRect } from "../../contracts";
import { resolveImagePlacement } from "../page-layout/pageGeometry";

/** The visible photo area inside its crop frame, in local page points. */
export function layoutVisiblePhotoRect(frame: LayoutImageFrame, photo: { width: number; height: number }): LayoutRect {
  const placed = resolveImagePlacement(photo, frame.rect, frame.crop);
  const x = Math.max(0, placed.x), y = Math.max(0, placed.y);
  return { x, y, width: Math.max(0, Math.min(frame.rect.width, placed.x + placed.width) - x),
    height: Math.max(0, Math.min(frame.rect.height, placed.y + placed.height) - y) };
}
