import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";

test("exports Read photos, spreads, blanks and repeated photos in order", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await page.evaluate(async () => {
    const handle = await (await navigator.storage.getDirectory()).getDirectoryHandle("pdf-fixture", { create: true });
    const photos = [{ id: "red", width: 1200, height: 800, color: "#b33d32" }, { id: "green", width: 800, height: 1200, color: "#368564" }, { id: "blue", width: 1200, height: 800, color: "#3e639e" }];
    for (const photo of photos) {
      const canvas = document.createElement("canvas");
      canvas.width = photo.width; canvas.height = photo.height;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = photo.color; ctx.fillRect(0, 0, photo.width, photo.height);
      ctx.fillStyle = "#fff"; ctx.font = "80px sans-serif"; ctx.fillText(photo.id, 80, 140);
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!), "image/jpeg"));
      const file = await handle.getFileHandle(`${photo.id}.jpg`, { create: true });
      const writer = await file.createWritable(); await writer.write(blob); await writer.close();
    }
    const request = indexedDB.open("photoflex-mvp");
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const projectId = "pdf-project", sequenceId = "pdf-sequence", versionId = "pdf-version", sourceId = "pdf-source";
    const createdAt = "2026-09-08T00:00:00.000Z";
    const items = [{ id: "a", kind: "photo", photoId: "red" }, { id: "b", kind: "photo", photoId: "green" }, { id: "c", kind: "photo", photoId: "blue" }, { id: "blank", kind: "blank" }, { id: "repeat", kind: "photo", photoId: "red" }];
    const readingUnits = [{ id: "u1", kind: "single", itemId: "a" }, { id: "u2", kind: "spread", leftItemId: "b", rightItemId: "c" }, { id: "u3", kind: "blank", itemId: "blank" }, { id: "u4", kind: "single", itemId: "repeat" }];
    const tx = db.transaction(["projects", "sequences", "versions", "photo-index", "source-grants"], "readwrite");
    tx.objectStore("projects").put({ schemaVersion: 7, projectId, name: "PDF Export", memo: "", expectedPhotoCount: null, sources: [{ id: sourceId, displayName: "PDF photos", createdAt }], photoStates: {}, worktableDraft: { projectId, entryOrder: [], placements: {}, groups: [], links: [], pileOrder: [sequenceId], pilePlacements: { [sequenceId]: { sequenceId, x: 40, y: 40, z: 1, width: 190, height: 118 } } }, sequenceIds: [sequenceId], versionIds: [versionId], revision: 0, createdAt, updatedAt: createdAt, lastOpenedAt: createdAt });
    tx.objectStore("sequences").put({ id: sequenceId, projectId, name: "白底 Street Edit", items, segments: [], readingUnits, currentVersionId: versionId, revision: 0, createdAt, updatedAt: createdAt });
    tx.objectStore("versions").put({ id: versionId, projectId, sequenceId, name: "Initial", itemCount: items.length, items, segments: [], readingUnits, createdAt });
    tx.objectStore("source-grants").put({ sourceId, displayName: "PDF photos", handle });
    photos.forEach((photo) => tx.objectStore("photo-index").put({ id: photo.id, width: photo.width, height: photo.height, sourceId, relativePath: `${photo.id}.jpg` }));
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    db.close();
  });
  await page.goto("/#/projects/pdf-project/sequences/pdf-sequence");
  const exportButton = page.getByRole("button", { name: "Export PDF", exact: true });
  await expect(exportButton).toBeVisible();
  for (const width of [1440, 1280, 1024]) {
    await page.setViewportSize({ width, height: 1024 });
    const boxes = await page.locator(".sequence-toolbar").evaluate((toolbar) => {
      const rects = [...toolbar.querySelectorAll("button, select")].map((element) => element.getBoundingClientRect()).filter((rect) => rect.width > 0);
      return rects.map(({ left, right }) => ({ left, right }));
    });
    await page.screenshot({ path: testInfo.outputPath(`toolbar-${width}.png`) });
    expect(boxes.filter((box) => box.left < 0 || box.right > width), `Toolbar overflow at ${width}px`).toEqual([]);
  }
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.getByRole("button", { name: "Read", exact: true }).click();
  await expect(page.locator(".sequence-read-page img")).toBeVisible();
  await page.getByRole("button", { name: "White background" }).click();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".sequence-read-page img")).toHaveCount(2);
  await page.screenshot({ path: testInfo.outputPath("read-spread.png") });
  await page.getByRole("button", { name: "Close", exact: true }).click();
  const downloadEvent = page.waitForEvent("download");
  await exportButton.click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("白底 Street Edit.pdf");
  const path = testInfo.outputPath("sequence.pdf");
  await download.saveAs(path);
  const pdf = await PDFDocument.load(await readFile(path));
  expect(pdf.getPageCount()).toBe(4);
  expect(pdf.getTitle()).toBe("白底 Street Edit");
  const pages = pdf.getPages();
  pages.forEach((p, index) => expect(p.getWidth()).toBeCloseTo(index === 1 ? 885.6 : 570));
  expect(pages.every((p) => Math.abs(p.getHeight() - 599.04) < 0.01)).toBe(true);
  const images = pages.map((p) => p.node.Resources()?.lookup(PDFName.of("XObject"), PDFDict)?.keys().length ?? 0);
  expect(images).toEqual([1, 2, 0, 1]);
  await expect(page.getByRole("status").filter({ hasText: "PDF download started." })).toBeVisible();
});
