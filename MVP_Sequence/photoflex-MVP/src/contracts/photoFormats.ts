export type PhotoFormat = "jpg" | "png" | "webp";

/** Source selection is extension based, including files with an empty MIME type. */
export function supportedPhotoFormat(name: string): PhotoFormat | undefined {
  const extension = name.match(/\.([^.\/\\]+)$/)?.[1].toLowerCase();
  if (extension === "jpg" || extension === "jpeg") return "jpg";
  if (extension === "png" || extension === "apng") return "png";
  if (extension === "webp") return "webp";
  return undefined;
}

export const isSupportedPhoto = (name: string): boolean => supportedPhotoFormat(name) !== undefined;
