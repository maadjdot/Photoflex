import { readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

// Scale probe using derived previews from all 39 originals in test_photos.
const directory = resolve("test_photos");
const names = (await readdir(directory)).filter((name) => /\.jpe?g$/i.test(name)).sort();
if (names.length !== 39) throw new Error(`Expected 39 JPEGs in ${directory}; found ${names.length}.`);
const originalBytes = (await Promise.all(names.map(async (name) => (await stat(resolve(directory, name))).size))).reduce((a, b) => a + b, 0);
const server = await createServer({ mode: "e2e", server: { host: "127.0.0.1", port: 4173, strictPort: true } });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("http://127.0.0.1:4173/");
  const dimensions = await page.evaluate(async (names) => {
    const photos = [];
    for (const [index, name] of names.entries()) {
      const response = await fetch(`/test_photos/${encodeURIComponent(name)}`);
      if (!response.ok) throw new Error(`Cannot fetch ${name}: ${response.status}`);
      const bitmap = await createImageBitmap(await response.blob());
      const width = bitmap.width, height = bitmap.height;
      const preview = async (edge) => {
        const canvas = document.createElement("canvas");
        const scale = edge / Math.max(width, height);
        canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
        canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise((done) => canvas.toBlob(done, "image/jpeg", .85));
        canvas.width = canvas.height = 0;
        if (!blob) throw new Error(`Cannot preview ${name}`);
        return blob;
      };
      const thumbnail = await preview(512), derived = await preview(768);
      bitmap.close();
      photos.push({ id: `real-${index}`, name, width, height, thumbnail, derived });
    }
    const request = indexedDB.open("photoflex-mvp");
    const db = await new Promise((ok, fail) => { request.onsuccess = () => ok(request.result); request.onerror = () => fail(request.error); });
    const projectId = "real-project", now = new Date().toISOString();
    const items = Array.from({ length: 500 }, (_, i) => ({ id: `item-${i}`, kind: "photo", photoId: photos[i % photos.length].id }));
    const readingUnits = items.map((item, i) => ({ id: `unit-${i}`, kind: "single", itemId: item.id }));
    const layouts = [
      { id: "real-50", sequenceId: "sequence-50", versionId: "version-50", pageCount: 50, firstPageObjects: 1 },
      { id: "real-200", sequenceId: "sequence-200", versionId: "version-200", pageCount: 200, firstPageObjects: 1 },
      { id: "real-objects", sequenceId: "sequence-objects", versionId: "version-objects", pageCount: 1, firstPageObjects: 50 },
    ];
    const pagesFor = ({ pageCount, firstPageObjects }) => Array.from({ length: pageCount }, (_, i) => ({ id: `page-${i}`, objects: Array.from({ length: i === 0 ? firstPageObjects : 1 }, (_, j) => ({
      kind: "image-frame", id: `frame-${i}-${j}`,
      rect: firstPageObjects > 1 ? { x: 25 + (j % 5) * 108, y: 25 + Math.floor(j / 5) * 79, width: 100, height: 71 } : { x: 34, y: 34, width: 520, height: 760 },
      photoId: photos[(i + j) % photos.length].id,
      crop: { mode: "fill", zoom: 1, focal: { x: .5, y: .5 } },
    })) }));
    const tx = db.transaction(["projects", "sequences", "versions", "layouts", "photo-index", "photo-thumbnails", "photo-derived-previews"], "readwrite");
    tx.objectStore("projects").put({ schemaVersion: 10, projectId, name: "Real photo L5", memo: "", expectedPhotoCount: null,
      sources: [], photoStates: {}, worktableDraft: { projectId, entryOrder: [], placements: {}, groups: [], links: [], pileOrder: layouts.map((layout) => layout.sequenceId), pilePlacements: {}, frameOrder: [], frames: {} },
      sequenceIds: layouts.map((layout) => layout.sequenceId), versionIds: layouts.map((layout) => layout.versionId), layoutIds: layouts.map((layout) => layout.id), revision: 0, createdAt: now, updatedAt: now, lastOpenedAt: now });
    for (const layout of layouts) {
      tx.objectStore("sequences").put({ id: layout.sequenceId, projectId, name: layout.id, items, segments: [], readingUnits, currentVersionId: layout.versionId, revision: 0, createdAt: now, updatedAt: now });
      tx.objectStore("versions").put({ id: layout.versionId, projectId, sequenceId: layout.sequenceId, name: "Initial", itemCount: items.length, items, segments: [], readingUnits, createdAt: now });
      tx.objectStore("layouts").put({ schemaVersion: 1, id: layout.id, projectId, sequenceId: layout.sequenceId, name: layout.id,
        pageSpec: { widthPt: 595.27559, heightPt: 841.88976 }, pages: pagesFor(layout), revision: 0, createdAt: now, updatedAt: now });
    }
    for (const photo of photos) {
      tx.objectStore("photo-index").put({ id: photo.id, sourceId: "preview-only", relativePath: photo.name, width: photo.width, height: photo.height });
      const sourceVersion = `${photo.name}|${photo.width}|${photo.height}|unknown-size|unknown-mtime|unknown-fingerprint`;
      tx.objectStore("photo-thumbnails").put({ photoId: photo.id, maxEdge: 512, sourceVersion, blob: photo.thumbnail });
      tx.objectStore("photo-derived-previews").put({ photoId: photo.id, maxEdge: 768, sourceVersion, blob: photo.derived });
    }
    await new Promise((ok, fail) => { tx.oncomplete = ok; tx.onerror = () => fail(tx.error); tx.onabort = () => fail(tx.error); });
    db.close();
    return [...new Set(photos.map((photo) => `${photo.width}x${photo.height}`))];
  }, names);
  console.log(JSON.stringify({ stage: "seed", uniquePhotos: names.length, originalBytes, dimensions }));
  for (const layout of ["real-50", "real-200", "real-objects"]) {
    const started = performance.now();
    await page.goto(`http://127.0.0.1:4173/?probe=${layout}#/projects/real-project/sequences/sequence-${layout.slice(5)}/layout/${layout}`);
    const buttons = page.locator(".layout-pages-list button");
    await buttons.first().waitFor({ timeout: 30_000 });
    const pageCount = await buttons.count();
    const openedMs = Math.round(performance.now() - started);
    const index = Math.floor(pageCount / 2), clicked = performance.now();
    await buttons.nth(index).click();
    await page.waitForFunction((i) => document.querySelectorAll(".layout-pages-list button")[i]?.getAttribute("aria-current") === "page", index);
    const selectMs = Math.round(performance.now() - clicked);
    await page.waitForTimeout(500);
    console.log(JSON.stringify({ stage: "browse", layout, pageCount, sequenceItems: 500, uniquePhotos: 39, openedMs, selectMs,
      trayMounted: await page.locator(".layout-photo-item").count(), visibleFrames: await page.locator(".layout-paper .layout-object-image-frame").count(),
      visibleImages: await page.locator(".layout-paper .layout-placed-image").count(), heapBytes: await page.evaluate(() => performance.memory?.usedJSHeapSize ?? null) }));
  }
} finally { await browser?.close(); await server.close(); }
