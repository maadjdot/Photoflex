import type { PhotoId } from "../contracts";

export interface HomeGalleryPhoto {
  readonly photoId: PhotoId;
  readonly column: number;
}

/** Seven slots keep the reference's spacing; each populated row holds 3–6 photos. */
export function createHomeGallery(photoIds: readonly PhotoId[], random = Math.random): HomeGalleryPhoto[][] {
  const photos = shuffle([...new Set(photoIds)], random);
  if (!photos.length) return [];
  const total = Math.min(15, photos.length);
  const rowCount = total < 3 ? 1 : Math.min(3, Math.ceil(total / 6));
  const counts = Array<number>(rowCount).fill(total < 3 ? total : 3);
  let remaining = total - counts.reduce((sum, count) => sum + count, 0);
  while (remaining > 0) {
    const available = counts.map((count, index) => count < 6 ? index : -1).filter((index) => index >= 0);
    const index = available[Math.floor(random() * available.length)];
    counts[index] += 1;
    remaining -= 1;
  }
  let offset = 0;
  const usedLayouts = new Set<string>();
  return counts.map((count) => {
    let columns = shuffle([1, 2, 3, 4, 5, 6, 7], random).slice(0, count).sort((a, b) => a - b);
    // Rotate a repeated arrangement so even equally populated rows look different.
    while (usedLayouts.has(columns.join(","))) {
      columns = columns.map((column) => column % 7 + 1).sort((a, b) => a - b);
    }
    usedLayouts.add(columns.join(","));
    return columns.map((column) => ({ photoId: photos[offset++], column }));
  });
}

function shuffle<T>(items: T[], random: () => number): T[] {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [items[index], items[other]] = [items[other], items[index]];
  }
  return items;
}
