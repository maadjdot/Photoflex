import type { PhotoId } from "../contracts";

export interface HomeGalleryPhoto {
  readonly photoId: PhotoId;
  readonly column: number;
}

/** Seven slots keep the reference's spacing; empty slots are part of the composition. */
export function createHomeGallery(photoIds: readonly PhotoId[], random = Math.random): HomeGalleryPhoto[][] {
  const photos = shuffle([...new Set(photoIds)], random);
  if (!photos.length) return [];
  const total = Math.min(15, photos.length);
  const rowCount = Math.min(3, Math.max(1, Math.floor(total / 3)));
  const counts = Array<number>(rowCount).fill(Math.min(3, total));
  if (total >= 9) {
    let available = total;
    for (let row = 0; row < rowCount; row += 1) {
      const maximum = Math.min(5, available - (rowCount - row - 1) * 3);
      counts[row] = 3 + Math.floor(random() * (maximum - 2));
      available -= counts[row];
    }
  }
  let remaining = total < 9 ? total - counts.reduce((sum, count) => sum + count, 0) : 0;
  while (remaining > 0) {
    const available = counts.map((count, index) => count < 5 ? index : -1).filter((index) => index >= 0);
    counts[available[Math.floor(random() * available.length)]] += 1;
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
