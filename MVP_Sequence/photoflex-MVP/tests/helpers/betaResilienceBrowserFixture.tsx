import { createRoot } from "react-dom/client";
import type { LayoutObjectId, ProjectId } from "../../src/contracts";
import { LayoutTextView } from "../../src/app/LayoutTextView";
import { BrowserPhotoSource } from "../../src/platform/browser/BrowserPhotoSource";
import { IndexedDbProjectStore } from "../../src/platform/browser/IndexedDbProjectStore";
import { STORE_NAMES } from "../../src/platform/browser/indexedDbSchema";

export function mountFontRetryFixture() {
  const host = document.createElement("div"); host.id = "font-retry-fixture";
  host.style.cssText = "position:fixed;inset:50px;z-index:500;background:white;padding:30px";
  document.body.append(host);
  createRoot(host).render(<LayoutTextView box={{ kind: "text-box", id: "retry-text" as LayoutObjectId, text: "Recovered caption 上海",
    rect: { x: 0, y: 0, width: 500, height: 200 }, style: { fontFamily: "architects-daughter", fontSizePt: 20, lineHeight: 1.2, color: "#171513", align: "left" } }} scale={1} />);
}

export async function mountCacheQuotaFixture() {
  const canvas = document.createElement("canvas"); canvas.width = 96; canvas.height = 64;
  const context = canvas.getContext("2d")!; context.fillStyle = "#d26934"; context.fillRect(0, 0, 96, 64);
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!), "image/png"));
  const file = new File([blob], "photo.png", { type: "image/png" });
  Object.defineProperty(file, "webkitRelativePath", { value: "Photos/photo.png" });
  const databaseName = "native-cache-quota-" + crypto.randomUUID();
  const local = IndexedDbProjectStore.open({ databaseName });
  const id = "quota-project" as ProjectId;
  const created = await local.createProject({ id, name: "Retained", createdAt: new Date().toISOString() });
  if (!created.ok) throw Error("project creation failed");
  const source = new BrowserPhotoSource({ databaseName, filePicker: async () => [file] });
  const grant = await source.chooseFolder([]); if (!grant.ok) throw Error("photo fixture failed");
  for await (const result of source.scan(grant.value.sourceId)) if (!result.ok) throw Error("scan failed");
  const photos = await source.listPhotos(grant.value.sourceId); if (!photos.ok) throw Error("index failed");
  const originalPut = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore["put"]>) {
    if (this.name === STORE_NAMES.photoThumbnails || this.name === STORE_NAMES.photoDerivedPreviews) throw new DOMException("Full", "QuotaExceededError");
    return originalPut.apply(this, args);
  };
  try {
    const photoId = photos.value.items[0].id;
    const leases = await Promise.all([source.thumbnail(photoId), source.derivedPreview(photoId, 768)]);
    const host = document.createElement("div"); host.id = "cache-quota-fixture";
    host.style.cssText = "position:fixed;inset:50px;z-index:500;background:white;padding:30px"; document.body.append(host);
    for (const lease of leases) {
      if (!lease.ok) throw Error("usable preview lost to cache failure");
      const image = document.createElement("img"); image.src = lease.value.url; host.append(image);
    }
    const saved = await local.saveWorkspace({ ...created.value, name: "Still editable" }, created.value.revision);
    const original = await source.readOriginalFile(photoId);
    return { saved: saved.ok, originalUnchanged: original.ok && original.value.size === file.size };
  } finally { IDBObjectStore.prototype.put = originalPut; }
}
