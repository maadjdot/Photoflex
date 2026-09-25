import { resolve } from "node:path";
import { readFile, stat } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { createServer } from "vite";

const pageCount = Number(process.argv.find((arg) => arg.startsWith("--pages="))?.split("=")[1] ?? 1);
if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > 50) throw new Error("--pages must be between 1 and 50.");
const browserName = process.argv.find((arg) => arg.startsWith("--browser="))?.split("=")[1] ?? "chrome";
if (!["chrome", "edge"].includes(browserName)) throw new Error("--browser must be chrome or edge.");
const quality = process.argv.find((arg) => arg.startsWith("--quality="))?.split("=")[1] ?? "medium";
if (!["low", "medium", "high", "original"].includes(quality)) throw new Error("--quality must be low, medium, high, or original.");
const server = await createServer({ mode: "e2e", server: { host: "127.0.0.1", port: 4173, strictPort: true } });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ channel: browserName === "edge" ? "msedge" : "chrome" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await page.addInitScript(() => Object.defineProperty(window, "showDirectoryPicker", { value: undefined, configurable: true }));
  page.on("pageerror", (error) => console.error(`Page error: ${error.message}`));
  await page.goto("http://127.0.0.1:4173/");
  await page.locator(".home-page").waitFor();
  await page.evaluate(async () => {
    const request = indexedDB.open("photoflex-mvp");
    const db = await new Promise((ok, fail) => { request.onsuccess = () => ok(request.result); request.onerror = () => fail(request.error); });
    const now = new Date().toISOString(), projectId = "folder-project", sequenceId = "folder-sequence", versionId = "folder-version", layoutId = "folder-layout";
    const item = { id: "item-0", kind: "photo", photoId: "pending-photo" };
    const unit = { id: "unit-0", kind: "single", itemId: item.id };
    const tx = db.transaction(["projects", "sequences", "versions", "layouts"], "readwrite");
    tx.objectStore("projects").put({ schemaVersion: 10, projectId, name: "Folder export", memo: "", expectedPhotoCount: null, sources: [], photoStates: {},
      worktableDraft: { projectId, entryOrder: [], placements: {}, groups: [], links: [], pileOrder: [sequenceId],
        pilePlacements: { [sequenceId]: { sequenceId, x: 100, y: 100, z: 1, width: 400, height: 170 } }, frameOrder: [], frames: {} },
      sequenceIds: [sequenceId], versionIds: [versionId], layoutIds: [layoutId], revision: 0, createdAt: now, updatedAt: now, lastOpenedAt: now });
    tx.objectStore("sequences").put({ id: sequenceId, projectId, name: "Folder sample", items: [item], segments: [], readingUnits: [unit], currentVersionId: versionId, revision: 0, createdAt: now, updatedAt: now });
    tx.objectStore("versions").put({ id: versionId, projectId, sequenceId, name: "Initial", itemCount: 1, items: [item], segments: [], readingUnits: [unit], createdAt: now });
    tx.objectStore("layouts").put({ schemaVersion: 1, id: layoutId, projectId, sequenceId, name: "Folder sample", pageSpec: { widthPt: 595.27559, heightPt: 841.88976 },
      pages: [{ id: "page-0", objects: [{ kind: "image-frame", id: "frame-0", rect: { x: 34, y: 34, width: 520, height: 760 }, photoId: "pending-photo",
        crop: { mode: "fill", zoom: 1, focal: { x: .5, y: .5 } } }] }], revision: 0, createdAt: now, updatedAt: now });
    await new Promise((ok, fail) => { tx.oncomplete = ok; tx.onerror = () => fail(tx.error); });
    db.close();
  });
  await page.goto("http://127.0.0.1:4173/#/projects/folder-project/table");
  try { await page.locator(".table-page").waitFor({ timeout: 10_000 }); }
  catch (error) { console.log(JSON.stringify({ stage: "table-error", url: page.url(), body: await page.locator("body").innerText() })); throw error; }
  console.log(JSON.stringify({ stage: "table" }));
  const chooserPromise = page.waitForEvent("filechooser", { timeout: 30_000 });
  await page.getByRole("button", { name: /Add Source|Add a photo folder|添加来源|添加照片文件夹/ }).first().click();
  const chooser = await chooserPromise;
  await chooser.setFiles(resolve("test_photos"));
  let ids = [];
  for (let attempt = 0; attempt < 240; attempt++) {
    ids = await page.evaluate(async () => {
      const request = indexedDB.open("photoflex-mvp");
      const db = await new Promise((ok) => { request.onsuccess = () => ok(request.result); });
      const photos = await new Promise((ok) => { const get = db.transaction("photo-index").objectStore("photo-index").getAll(); get.onsuccess = () => ok(get.result); });
      db.close();
      return photos.map((photo) => photo.id);
    });
    if (ids.length >= 39) break;
    await page.waitForTimeout(500);
  }
  if (ids.length !== 39) throw new Error(`Folder import indexed ${ids.length} photos. UI: ${await page.locator("body").innerText()}`);
  console.log(JSON.stringify({ stage: "folder-import", indexedPhotos: ids.length }));
  await page.evaluate(async ({ ids, pageCount }) => {
    const request = indexedDB.open("photoflex-mvp");
    const db = await new Promise((ok) => { request.onsuccess = () => ok(request.result); });
    const now = new Date().toISOString();
    const items = ids.map((photoId, index) => ({ id: `item-${index}`, kind: "photo", photoId }));
    const units = items.map((item, index) => ({ id: `unit-${index}`, kind: "single", itemId: item.id }));
    const pages = Array.from({ length: pageCount }, (_, index) => ({ id: `page-${index}`, objects: [{ kind: "image-frame", id: `frame-${index}`,
      rect: { x: 34, y: 34, width: 520, height: 760 }, photoId: ids[index % ids.length], crop: { mode: "fill", zoom: 1, focal: { x: .5, y: .5 } } }] }));
    const tx = db.transaction(["sequences", "versions", "layouts"], "readwrite");
    tx.objectStore("sequences").put({ id: "folder-sequence", projectId: "folder-project", name: "Folder sample", items, segments: [], readingUnits: units,
      currentVersionId: "folder-version", revision: 0, createdAt: now, updatedAt: now });
    tx.objectStore("versions").put({ id: "folder-version", projectId: "folder-project", sequenceId: "folder-sequence", name: "Initial", itemCount: items.length,
      items, segments: [], readingUnits: units, createdAt: now });
    tx.objectStore("layouts").put({ schemaVersion: 1, id: "folder-layout", projectId: "folder-project", sequenceId: "folder-sequence", name: "Folder sample",
      pageSpec: { widthPt: 595.27559, heightPt: 841.88976 }, pages, revision: 0, createdAt: now, updatedAt: now });
    await new Promise((ok, fail) => { tx.oncomplete = ok; tx.onerror = () => fail(tx.error); });
    db.close();
  }, { ids, pageCount });
  await page.goto("http://127.0.0.1:4173/#/projects/folder-project/sequences/folder-sequence/layout/folder-layout");
  await page.locator(".layout-pages-list button").first().waitFor({ timeout: 30_000 });
  const downloadPromise = page.waitForEvent("download", { timeout: 300_000 });
  await page.locator(".layout-export-button").click();
  const dialog = page.getByRole("dialog", { name: "PDF 导出质量" });
  if (process.argv.includes("--screenshot-dialog")) await dialog.screenshot({ path: "test-results/Layout-export-quality.png" });
  await dialog.locator(`input[value="${quality}"]`).check();
  await dialog.getByRole("button", { name: "导出 PDF" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  const pdf = await PDFDocument.load(await readFile(downloadPath));
  const imagePages = pdf.getPages().filter((physical) => physical.node.Resources()?.lookup(PDFName.of("XObject"), PDFDict)?.keys().length === 1).length;
  if (pdf.getPageCount() !== pageCount || imagePages !== pageCount) throw new Error("Folder export PDF has the wrong pages or images.");
  console.log(JSON.stringify({ stage: "folder-export", browser: browserName, quality, pageCount, imagePages, importedPhotos: ids.length, pdfBytes: (await stat(downloadPath)).size }));
} finally { await browser?.close(); await server.close(); }
