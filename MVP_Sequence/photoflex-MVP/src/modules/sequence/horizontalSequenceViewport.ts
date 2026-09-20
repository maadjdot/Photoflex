import type { SequenceItem, SequencePhotoItem } from "../../contracts";

export interface ProjectedSequencePhoto {
  readonly item: SequencePhotoItem;
  readonly itemIndex: number;
  readonly photoIndex: number;
}

export interface HorizontalSequenceGeometry {
  readonly count: number;
  readonly itemWidth: number;
  readonly gap: number;
  readonly sidePadding: number;
  readonly viewportWidth: number;
}

/** The photo-only view shared by Sequence sorting and Read mode. */
export function projectSequencePhotos(items: readonly SequenceItem[]): readonly ProjectedSequencePhoto[] {
  const photos: ProjectedSequencePhoto[] = [];
  items.forEach((item, itemIndex) => {
    if (item.kind === "photo") photos.push({ item, itemIndex, photoIndex: photos.length });
  });
  return photos;
}

/** Converts a photo-grid insertion slot into the existing editor's complete-item insertion index. */
export function photoInsertionToItemIndex(items: readonly SequenceItem[], photoInsertionIndex: number): number {
  const photos = projectSequencePhotos(items);
  const clamped = Math.max(0, Math.min(photos.length, Math.trunc(photoInsertionIndex)));
  return clamped === photos.length ? items.length : photos[clamped].itemIndex;
}

/** Mouse wheels drive the horizontal reader; native horizontal trackpad gestures remain untouched. */
export function horizontalWheelIntent(deltaX: number, deltaY: number): { readonly handled: boolean; readonly delta: number } {
  if (!deltaY || Math.abs(deltaX) > Math.abs(deltaY)) return { handled: false, delta: 0 };
  return { handled: true, delta: deltaY };
}

export function sequenceScrollTarget(index: number, geometry: HorizontalSequenceGeometry, maxScrollLeft: number): number {
  if (!geometry.count) return 0;
  const clampedIndex = Math.max(0, Math.min(geometry.count - 1, Math.trunc(index)));
  const center = geometry.sidePadding + clampedIndex * (geometry.itemWidth + geometry.gap) + geometry.itemWidth / 2;
  return Math.max(0, Math.min(maxScrollLeft, center - geometry.viewportWidth / 2));
}

export function centerPhotoIndex(scrollLeft: number, geometry: HorizontalSequenceGeometry): number {
  if (!geometry.count) return 0;
  const firstCenter = geometry.sidePadding + geometry.itemWidth / 2;
  const raw = Math.round((scrollLeft + geometry.viewportWidth / 2 - firstCenter) / (geometry.itemWidth + geometry.gap));
  return Math.max(0, Math.min(geometry.count - 1, raw));
}

export function visiblePhotoRange(scrollLeft: number, geometry: HorizontalSequenceGeometry, overscan = 2): { readonly start: number; readonly end: number } {
  if (!geometry.count) return { start: 0, end: 0 };
  const stride = geometry.itemWidth + geometry.gap;
  const first = Math.floor((scrollLeft - geometry.sidePadding) / stride);
  const last = Math.floor((scrollLeft + geometry.viewportWidth - geometry.sidePadding) / stride);
  return {
    start: Math.max(0, first - overscan),
    end: Math.min(geometry.count, last + overscan + 1),
  };
}
