import type { LayoutImageFrame, LayoutObjectId, LayoutRect, PhotoId } from "../../contracts";
import { defaultCrop, defaultTemplate, MM_TO_PT, resolveImagePlacement, templateRects, type ImageCrop, type LayoutTemplateId, type TemplateDirection } from "../page-layout/pageGeometry";

export type ResizeHandle = "move" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
export interface LayoutAlignmentGuide { readonly axis: "x" | "y"; readonly value: number }
const minimum = MM_TO_PT;
const snapTolerance = 5;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const snap = (value: number, targets: readonly number[]) => {
  const near = targets.find((target) => Math.abs(value - target) <= snapTolerance);
  return near ?? value;
};

export function createImageFrame(id: LayoutObjectId, rect: LayoutRect, photoId: PhotoId | null = null): LayoutImageFrame {
  return { kind: "image-frame", id, rect, photoId, crop: { mode: "fit", zoom: 1, focal: { x: .5, y: .5 } } };
}

export function imageFrameAtPageCenter(id: LayoutObjectId, spec: { widthPt: number; heightPt: number }, photoId: PhotoId | null): LayoutImageFrame {
  const rect = templateRects(spec.widthPt, spec.heightPt, defaultTemplate("single"))[0];
  return createImageFrame(id, rect, photoId);
}

export function replaceFramePhoto(frame: LayoutImageFrame, photoId: PhotoId | null): LayoutImageFrame {
  return { ...frame, photoId, crop: { mode: "fit", zoom: 1, focal: { x: .5, y: .5 } } };
}

export function drawImageRect(start: { x: number; y: number }, end: { x: number; y: number }, spec: { widthPt: number; heightPt: number }): LayoutRect | undefined {
  const x1 = clamp(Math.min(start.x, end.x), 0, spec.widthPt);
  const x2 = clamp(Math.max(start.x, end.x), 0, spec.widthPt);
  const y1 = clamp(Math.min(start.y, end.y), 0, spec.heightPt);
  const y2 = clamp(Math.max(start.y, end.y), 0, spec.heightPt);
  return x2 - x1 >= minimum && y2 - y1 >= minimum ? { x: x1, y: y1, width: x2 - x1, height: y2 - y1 } : undefined;
}

export function transformImageRect(rect: LayoutRect, handle: ResizeHandle, dx: number, dy: number, spec: { widthPt: number; heightPt: number }): LayoutRect {
  const xTargets = [0, 12 * MM_TO_PT, spec.widthPt - 12 * MM_TO_PT, spec.widthPt];
  const yTargets = [0, 12 * MM_TO_PT, spec.heightPt - 12 * MM_TO_PT, spec.heightPt];
  if (handle === "move") {
    let x = clamp(rect.x + dx, minimum - rect.width, spec.widthPt - minimum);
    let y = clamp(rect.y + dy, minimum - rect.height, spec.heightPt - minimum);
    const left = snap(x, xTargets), right = snap(x + rect.width, xTargets);
    const top = snap(y, yTargets), bottom = snap(y + rect.height, yTargets);
    const leftDistance = left === x ? Infinity : Math.abs(left - x);
    const rightDistance = right === x + rect.width ? Infinity : Math.abs(right - (x + rect.width));
    const topDistance = top === y ? Infinity : Math.abs(top - y);
    const bottomDistance = bottom === y + rect.height ? Infinity : Math.abs(bottom - (y + rect.height));
    x = leftDistance === Infinity && rightDistance === Infinity ? x : leftDistance <= rightDistance ? left : right - rect.width;
    y = topDistance === Infinity && bottomDistance === Infinity ? y : topDistance <= bottomDistance ? top : bottom - rect.height;
    return { ...rect, x, y };
  }
  let left = rect.x, top = rect.y, right = rect.x + rect.width, bottom = rect.y + rect.height;
  if (handle.includes("w")) left = snap(clamp(left + dx, minimum - rect.width, right - minimum), xTargets);
  if (handle.includes("e")) right = snap(clamp(right + dx, left + minimum, spec.widthPt + rect.width - minimum), xTargets);
  if (handle.includes("n")) top = snap(clamp(top + dy, minimum - rect.height, bottom - minimum), yTargets);
  if (handle.includes("s")) bottom = snap(clamp(bottom + dy, top + minimum, spec.heightPt + rect.height - minimum), yTargets);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function alignLayoutRect(rect: LayoutRect, handle: ResizeHandle, spec: { widthPt: number; heightPt: number },
  otherRects: readonly LayoutRect[], thresholdPt: number): { rect: LayoutRect; guides: readonly LayoutAlignmentGuide[] } {
  const targets = (axis: "x" | "y") => {
    const length = axis === "x" ? spec.widthPt : spec.heightPt;
    return [0, 12 * MM_TO_PT, length / 2, length - 12 * MM_TO_PT, length,
      ...otherRects.flatMap((other) => axis === "x"
        ? [other.x, other.x + other.width / 2, other.x + other.width]
        : [other.y, other.y + other.height / 2, other.y + other.height])];
  };
  const nearest = (anchors: readonly number[], values: readonly number[]) => anchors
    .flatMap((anchor) => values.map((value) => ({ value, delta: value - anchor })))
    .filter((item) => Math.abs(item.delta) <= thresholdPt)
    .sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta))[0];
  let aligned = { ...rect };
  const guides: LayoutAlignmentGuide[] = [];
  for (const axis of ["x", "y"] as const) {
    const start = axis === "x" ? aligned.x : aligned.y;
    const size = axis === "x" ? aligned.width : aligned.height;
    const pageLength = axis === "x" ? spec.widthPt : spec.heightPt;
    const leading = axis === "x" ? "w" : "n";
    const trailing = axis === "x" ? "e" : "s";
    const side = handle === "move" ? "move" : handle.includes(leading) ? "leading" : handle.includes(trailing) ? "trailing" : "none";
    if (side === "none") continue;
    const anchors = side === "move" ? [start, start + size / 2, start + size] : side === "leading" ? [start] : [start + size];
    const match = nearest(anchors, targets(axis));
    if (!match) continue;
    const nextStart = side === "trailing" ? start : start + match.delta;
    const nextSize = side === "move" ? size : side === "leading" ? size - match.delta : size + match.delta;
    if (nextSize < minimum || nextStart + nextSize < minimum || nextStart > pageLength - minimum) continue;
    aligned = axis === "x"
      ? { ...aligned, x: nextStart, width: nextSize }
      : { ...aligned, y: nextStart, height: nextSize };
    guides.push({ axis, value: match.value });
  }
  return { rect: aligned, guides };
}

export function panImageCrop(crop: ImageCrop, image: { width: number; height: number }, frame: LayoutRect, dxPt: number, dyPt: number): ImageCrop {
  const placement = resolveImagePlacement(image, frame, crop);
  return { ...crop, focal: { x: clamp(crop.focal.x - dxPt / placement.width, 0, 1), y: clamp(crop.focal.y - dyPt / placement.height, 0, 1) } };
}

export function zoomImageCropAtPoint(crop: ImageCrop, image: { width: number; height: number }, frame: LayoutRect,
  nextZoom: number, point: { x: number; y: number }): ImageCrop {
  const before = resolveImagePlacement(image, frame, crop);
  const zoom = clamp(nextZoom, 1, 8);
  const candidate = { ...crop, zoom };
  const after = resolveImagePlacement(image, frame, candidate);
  const x = point.x - (point.x - before.x) * after.width / before.width;
  const y = point.y - (point.y - before.y) * after.height / before.height;
  return { ...candidate, focal: {
    x: clamp((frame.width / 2 - x) / after.width, 0, 1),
    y: clamp((frame.height / 2 - y) / after.height, 0, 1),
  } };
}

export function imageTemplateFrames(input: { id: LayoutTemplateId; direction: TemplateDirection; spec: { widthPt: number; heightPt: number };
  marginMm: number; gapMm: number; photoIds?: readonly PhotoId[]; newId: () => LayoutObjectId }): readonly LayoutImageFrame[] {
  const config = defaultTemplate(input.id, input.direction);
  const margin = input.marginMm * MM_TO_PT;
  const frames = templateRects(input.spec.widthPt, input.spec.heightPt, {
    ...config, marginsPt: { top: margin, right: margin, bottom: margin, left: margin }, gapPt: input.gapMm * MM_TO_PT,
  });
  return frames.map((rect, index) => ({ kind: "image-frame", id: input.newId(), rect,
    photoId: input.photoIds?.[index] ?? null, crop: { ...defaultCrop(input.id), mode: "fit" } }));
}
