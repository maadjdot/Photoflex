export interface PhotoAsset {
  sourceId: string;
  name: string;
  url: string;
  thumbnailUrl?: string;
  bytes: number;
  relativePath?: string;
}

export interface PhotoRecord extends PhotoAsset {
  recordId: string;
  sourceIndex: number;
}

export function expandPhotoAssets(assets: readonly PhotoAsset[], targetCount: number): PhotoRecord[] {
  if (assets.length === 0 || targetCount <= 0) return [];
  return Array.from({ length: Math.trunc(targetCount) }, (_, index) => {
    const sourceIndex = index % assets.length;
    const asset = assets[sourceIndex] as PhotoAsset;
    return {
      ...asset,
      sourceIndex,
      recordId: `photo-${String(index).padStart(5, "0")}`,
    };
  });
}

export function isSupportedPhoto(file: Pick<File, "name" | "type">): boolean {
  return file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|tiff?|bmp|heic|heif)$/i.test(file.name);
}
