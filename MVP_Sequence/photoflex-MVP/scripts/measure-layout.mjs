import { chromium } from "@playwright/test";

// Synthetic Layout scale probe. Start Vite with `corepack pnpm dev --port 4173 --mode e2e` first.
const browser = await chromium.launch({ channel: "chrome" });
const pageCount = Number(process.argv[2] ?? 50), objectsPerPage = Number(process.argv[3] ?? 1);
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://127.0.0.1:4173/");
await page.evaluate(async ({ pageCount, objectsPerPage }) => {
  const req = indexedDB.open("photoflex-mvp");
  const db = await new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
  const projectId = "perf-project", sequenceId = "perf-sequence", layoutId = "perf-layout", versionId = "perf-version";
  const now = new Date().toISOString();
  const items = Array.from({ length: 500 }, (_, i) => ({ id: `item-${i}`, kind: "photo", photoId: `photo-${i}` }));
  const readingUnits = items.map((item, i) => ({ id: `unit-${i}`, kind: "single", itemId: item.id }));
  const pages = Array.from({ length: pageCount }, (_, i) => ({ id: `page-${i}`, objects: Array.from({ length: i === 0 ? objectsPerPage : 1 }, (_, j) => ({ kind: "image-frame", id: `frame-${i}-${j}`,
    rect: objectsPerPage > 1 ? { x: 34 + (j % 5) * 105, y: 34 + Math.floor(j / 5) * 75, width: 100, height: 70 }
      : { x: 34, y: 34, width: 520, height: 760 }, photoId: `photo-${(i + j) % 500}`,
    crop: { mode: "fill", zoom: 1, focal: { x: .5, y: .5 } } })) }));
  const tx = db.transaction(["projects", "sequences", "versions", "layouts", "photo-index", "photo-thumbnails", "photo-derived-previews"], "readwrite");
  tx.objectStore("projects").put({ schemaVersion: 10, projectId, name: "Performance", memo: "", expectedPhotoCount: null,
    sources: [], photoStates: {}, worktableDraft: { projectId, entryOrder: [], placements: {}, groups: [], links: [], pileOrder: [sequenceId],
      pilePlacements: { [sequenceId]: { sequenceId, x: 100, y: 100, z: 1, width: 400, height: 170 } }, frameOrder: [], frames: {} },
    sequenceIds: [sequenceId], versionIds: [versionId], layoutIds: [layoutId], revision: 0, createdAt: now, updatedAt: now, lastOpenedAt: now });
  tx.objectStore("sequences").put({ id: sequenceId, projectId, name: "Performance", items, segments: [], readingUnits, currentVersionId: versionId, revision: 0, createdAt: now, updatedAt: now });
  tx.objectStore("versions").put({ id: versionId, projectId, sequenceId, name: "Initial", itemCount: items.length, items, segments: [], readingUnits, createdAt: now });
  tx.objectStore("layouts").put({ schemaVersion: 1, id: layoutId, projectId, sequenceId, name: "Performance Layout", pageSpec: { widthPt: 595.27559, heightPt: 841.88976 }, pages, revision: 0, createdAt: now, updatedAt: now });
  for (let i = 0; i < 500; i++) {
    const width = i % 2 ? 800 : 1200, height = i % 2 ? 1200 : 800;
    const photoId = `photo-${i}`;
    tx.objectStore("photo-index").put({ id: photoId, sourceId: "missing", relativePath: `${i}.jpg`, width, height });
    const sourceVersion = `${i}.jpg|${width}|${height}|unknown-size|unknown-mtime|unknown-fingerprint`;
    const blob = new Blob([`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="hsl(${i % 360} 40% 60%)"/></svg>`], { type: "image/svg+xml" });
    tx.objectStore("photo-thumbnails").put({ photoId, maxEdge: 512, sourceVersion, blob });
    tx.objectStore("photo-derived-previews").put({ photoId, maxEdge: 768, sourceVersion, blob });
  }
  await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
  db.close();
}, { pageCount, objectsPerPage });
const started = Date.now();
await page.goto("http://127.0.0.1:4173/#/projects/perf-project/sequences/perf-sequence/layout/perf-layout");
await page.getByRole("main", { name: "Layout workspace" }).waitFor();
const opened = Date.now() - started;
const list = page.locator(".layout-pages-list button");
const count = await list.count();
const selectedIndex = Math.floor(pageCount / 2);
const clicked = Date.now();
await list.nth(selectedIndex).click();
await page.waitForFunction((index) => document.querySelectorAll(".layout-pages-list button")[index]?.getAttribute("aria-current") === "page", selectedIndex);
const select = Date.now() - clicked;
await page.waitForTimeout(300);
const renderedPhotos = await page.locator(".layout-photo-item").count();
const visibleFrames = await page.locator(".layout-paper .layout-object-image-frame").count();
const visibleImages = await page.locator(".layout-paper .layout-placed-image").count();
const heap = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? null);
console.log(JSON.stringify({ openedMs: opened, selectMs: select, pages: count, objectsPerPage, sequenceItems: 500, photoTrayMounted: renderedPhotos, visibleFrames, visibleImages, heapBytes: heap,
  userAgent: await page.evaluate(() => navigator.userAgent) }));
await browser.close();
