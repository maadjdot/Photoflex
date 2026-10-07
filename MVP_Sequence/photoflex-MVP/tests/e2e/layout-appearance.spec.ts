import { expect, test, type Page } from "@playwright/test";

async function seedBook(page: Page, legacy: boolean) {
  const projectId = `layout-covers-${crypto.randomUUID()}`;
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your Projects", exact: true })).toBeVisible();
  await page.evaluate(async ({ projectId, legacy }) => {
    const fixtureModule = "/tests/helpers/browserProjectFixture.ts";
    const { createBrowserWorkspace } = await import(/* @vite-ignore */ fixtureModule);
    const request = indexedDB.open("photoflex-mvp");
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const now = new Date().toISOString();
    const sequenceId = "cover-sequence", versionId = "cover-version", photoId = "cover-photo";
    const items = Array.from({ length: 3 }, (_, index) => ({ id: `item-${index}`, kind: "photo", photoId }));
    const readingUnits = items.map((item, index) => ({ id: `unit-${index}`, kind: "single", itemId: item.id }));
    const canvas = document.createElement("canvas"); canvas.width = 1200; canvas.height = 800;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#ddd4c5"; context.fillRect(0, 0, 1200, 800);
    context.fillStyle = "#52605b"; context.beginPath(); context.moveTo(0, 800); context.lineTo(350, 200);
    context.lineTo(700, 600); context.lineTo(1200, 100); context.lineTo(1200, 800); context.fill();
    const original = await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!), "image/jpeg"));
    const directory = await navigator.storage.getDirectory();
    const handle = await directory.getFileHandle(`${projectId}.jpg`, { create: true });
    const writable = await handle.createWritable(); await writable.write(original); await writable.close();
    const transaction = db.transaction(["projects", "sequences", "versions", "layouts", "photo-index", "photo-thumbnails", "photo-derived-previews", "photo-file-handles"], "readwrite");
    transaction.objectStore("projects").put(createBrowserWorkspace({ projectId, name: "Cover sample", memo: "", expectedPhotoCount: null, sources: [], photoStates: {},
      worktableDraft: { projectId, entryOrder: [], placements: {}, groups: [], links: [], pileOrder: [], pilePlacements: {}, frameOrder: [], frames: {} },
      sequenceIds: [sequenceId], versionIds: [versionId], layoutIds: legacy ? ["cover-layout"] : [], revision: 0, createdAt: now, updatedAt: now, lastOpenedAt: now }));
    transaction.objectStore("sequences").put({ id: sequenceId, projectId, name: "Cover sample", items, segments: [], readingUnits, currentVersionId: versionId, revision: 0, createdAt: now, updatedAt: now });
    transaction.objectStore("versions").put({ id: versionId, projectId, sequenceId, name: "Initial", itemCount: 3, items, segments: [], readingUnits, createdAt: now });
    if (legacy) transaction.objectStore("layouts").put({ schemaVersion: 1, id: "cover-layout", projectId, sequenceId, name: "Cover sample Layout",
      pageSpec: { widthPt: 600, heightPt: 840 }, pages: Array.from({ length: 3 }, (_, index) => ({ id: `page-${index}`, objects: [{
        kind: "image-frame", id: `frame-${index}`, rect: { x: 60, y: 100, width: 480, height: 500 }, photoId, crop: { mode: "fit", zoom: 1, focal: { x: .5, y: .5 } },
      }] })), revision: 0, createdAt: now, updatedAt: now });
    const photo = { id: photoId, sourceId: "missing-source", relativePath: "cover.jpg", locationKind: "file-handle", width: 1200, height: 800 };
    transaction.objectStore("photo-index").put(photo);
    transaction.objectStore("photo-file-handles").put({ photoId, handle });
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#ddd4c5"/><path d="M0 800 L350 200 L700 600 L1200 100 V800 Z" fill="#52605b"/></svg>';
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const sourceVersion = "cover.jpg|1200|800|unknown-size|unknown-mtime|unknown-fingerprint";
    transaction.objectStore("photo-thumbnails").put({ photoId, maxEdge: 512, sourceVersion, blob });
    transaction.objectStore("photo-derived-previews").put({ photoId, maxEdge: 768, sourceVersion, blob });
    await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
    db.close();
  }, { projectId, legacy });
  return projectId;
}

test("new Layout includes covers and persists photo effects in editing and reading", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const projectId = await seedBook(page, false);
  await page.goto(`/#/projects/${projectId}/sequences/cover-sequence`);
  await page.getByRole("button", { name: "Layout", exact: true }).click();
  const creator = page.getByRole("dialog", { name: "Create Layout" });
  await expect(creator).toContainText("5 pages, including covers");
  await creator.getByRole("button", { name: "Create Layout" }).click();
  const workspace = page.getByRole("main", { name: "Layout workspace" });
  const pages = workspace.locator(".layout-pages-list button");
  await expect(pages).toHaveCount(5);
  await expect(pages.first()).toContainText("Front cover");
  await expect(pages.last()).toContainText("Back cover");
  await expect(pages.first().locator(".layout-page-index")).toBeEmpty();
  await expect(pages.last().locator(".layout-page-index")).toBeEmpty();
  await expect(pages.nth(1)).toContainText("Page 1");
  await expect(workspace.locator(".layout-paper-number")).toHaveCount(0);
  await expect(workspace.locator(".layout-pages-list")).not.toContainText("objects");
  await pages.nth(1).click();
  await expect(workspace.locator(".layout-paper.is-current .layout-paper-number")).toHaveText("01");
  const properties = workspace.getByRole("complementary", { name: "Page properties" });
  await properties.getByRole("button", { name: "Mat bevel", exact: true }).click();
  await properties.getByLabel("Inner edge width mm").fill("2");
  await properties.getByLabel("Inner edge width mm").press("Tab");
  await properties.getByLabel("Photo elevation mm").fill("4");
  await properties.getByLabel("Photo elevation mm").press("Tab");
  await expect(workspace.locator(".layout-paper.is-current .inner-edge-bevel")).toBeVisible();
  await expect(workspace.locator(".layout-paper.is-current .layout-photo-elevation")).toBeVisible();
  await expect(workspace.locator(".layout-paper.is-current .layout-image-clip")).toHaveCSS("overflow", "hidden");
  await expect(workspace.getByText("Saved locally", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("layout-photo-effects.png") });
  await page.reload();
  await pages.nth(1).click();
  await expect(properties.getByLabel("Inner edge width mm")).toHaveValue("2");
  await expect(properties.getByLabel("Photo elevation mm")).toHaveValue("4");
  await workspace.getByRole("button", { name: "Read", exact: true }).click();
  const reader = page.locator(".layout-reader");
  await expect(reader.locator(".inner-edge-bevel").first()).toBeVisible();
  await page.keyboard.press("Home");
  await expect(reader.locator(".layout-reader-progress")).toContainText("Front cover");
  await expect(reader.locator(".stf__item.--shown article")).toHaveCount(1);
  await expect(reader.locator(".layout-page-curl-flyleaf").first()).toHaveCSS("opacity", "0");
  const front = (await reader.locator('article[aria-label="Front cover"]').boundingBox())!;
  expect(front.x + front.width / 2).toBeCloseTo(720, 0);
  await page.keyboard.press("End");
  await expect(reader.locator(".layout-reader-progress")).toContainText("Back cover");
  await expect(reader.locator(".stf__item.--shown article")).toHaveCount(1);
  await expect(reader.locator(".layout-page-curl-flyleaf").last()).toHaveCSS("opacity", "0");
  const back = (await reader.locator('article[aria-label="Back cover"]').boundingBox())!;
  expect(back.x + back.width / 2).toBeCloseTo(720, 0);
  await page.screenshot({ path: testInfo.outputPath("layout-back-cover.png") });
  await page.keyboard.press("ArrowLeft");
  await expect(reader.locator(".layout-reader-progress")).toContainText("3 / 3");
  await page.keyboard.press("Escape");
  await pages.last().click();
  await workspace.getByRole("button", { name: "+ Blank page", exact: true }).click();
  await expect(pages).toHaveCount(6);
  await expect(pages.last()).toContainText("Back cover");
});

test("cover placeholders stay invisible and the page block stays flush when opening and turning", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const projectId = await seedBook(page, true);
  await page.goto(`/#/projects/${projectId}/sequences/cover-sequence/layout/cover-layout`);
  const workspace = page.getByRole("main", { name: "Layout workspace" });
  // Legacy layouts also use an engine-only placeholder before their first page.
  await workspace.getByRole("button", { name: "Paper color", exact: true }).click();
  await workspace.getByRole("option", { name: "Ink Blue", exact: true }).click();
  await workspace.getByRole("button", { name: "Paper material", exact: true }).click();
  await workspace.getByRole("option", { name: "Diagonal bookcloth", exact: true }).click();
  await workspace.getByRole("button", { name: "Read", exact: true }).click();
  const reader = page.locator(".layout-reader");
  const book = reader.locator(".layout-page-curl");
  const flyleaf = book.locator(".layout-page-curl-flyleaf");
  await expect(reader.locator(".layout-reader-progress")).toContainText("1 / 3");
  await expect(flyleaf).toHaveCSS("opacity", "0");
  await expect(flyleaf).toHaveCSS("pointer-events", "none");
  await expect(reader.locator(".stf__item.--shown article")).toHaveCount(1);
  const cover = (await reader.locator('article[aria-label="Page 1"]').boundingBox())!;
  expect(cover.x + cover.width / 2).toBeCloseTo(720, 0);
  const block = book.locator(".layout-page-curl-stack.is-right");
  await expect(block).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(block).toHaveCSS("transform", "none");
  const edge = await block.evaluate((element) => {
    const style = getComputedStyle(element, "::after");
    return { depth: parseFloat(style.height), pageHeight: element.getBoundingClientRect().height };
  });
  expect(edge.depth).toBeGreaterThan(0);
  expect(edge.depth).toBeLessThan(cover.width * .012);
  expect(edge.pageHeight).toBeCloseTo(cover.height, 0);
  await page.screenshot({ path: testInfo.outputPath("reader-cover-refined.png") });
  await page.keyboard.press("ArrowRight");
  await expect(reader.locator(".layout-reader-progress")).toContainText("2–3 / 3");
  await expect(book).not.toHaveAttribute("data-turning");
  await expect(book.locator(".layout-page-curl-stack.is-left")).toHaveCSS("transform", "none");
  await expect(book.locator(".layout-page-curl-stack.is-right")).toHaveCSS("transform", "none");
  await page.screenshot({ path: testInfo.outputPath("reader-spread-refined.png") });
  await page.keyboard.press("ArrowLeft");
  await expect(reader.locator(".layout-reader-progress")).toContainText("1 / 3");
  await expect(flyleaf).toHaveCSS("opacity", "0");
  await expect(reader.locator(".stf__item.--shown article")).toHaveCount(1);
  await reader.getByRole("button", { name: "Single", exact: true }).click();
  await expect(book.locator(".layout-page-curl-flyleaf")).toHaveCount(0);
  await reader.getByRole("button", { name: "Facing", exact: true }).click();
  await expect(book.locator(".layout-page-curl-flyleaf")).toHaveCSS("opacity", "0");
});

test("legacy Layout can add covers and keep them at the ends after reload", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const projectId = await seedBook(page, true);
  await page.goto(`/#/projects/${projectId}/sequences/cover-sequence/layout/cover-layout`);
  const workspace = page.getByRole("main", { name: "Layout workspace" });
  const pages = workspace.locator(".layout-pages-list button");
  await expect(pages).toHaveCount(3);
  await workspace.getByRole("button", { name: "+ Front cover", exact: true }).click();
  await workspace.getByRole("button", { name: "+ Back cover", exact: true }).click();
  await expect(pages).toHaveCount(5);
  await expect(pages.first()).toContainText("Front cover");
  await expect(pages.last()).toContainText("Back cover");
  await expect(pages.first()).toHaveAttribute("draggable", "false");
  await expect(pages.last()).toHaveAttribute("draggable", "false");
  await expect(workspace.getByText("Saved locally", { exact: true })).toBeVisible();
  await page.reload();
  await expect(pages).toHaveCount(5);
  await expect(pages.first()).toContainText("Front cover");
  await expect(pages.last()).toContainText("Back cover");
  await pages.last().click();
  await workspace.getByRole("button", { name: "Read", exact: true }).click();
  await expect(page.locator(".layout-reader-progress")).toContainText("Back cover");
});


test("white gaps and page number visibility persist through undo, reload, and reading", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const projectId = await seedBook(page, false);
  await page.goto(`/#/projects/${projectId}/sequences/cover-sequence`);
  await page.getByRole("button", { name: "Layout", exact: true }).click();
  await page.getByRole("dialog", { name: "Create Layout" }).getByRole("button", { name: "Create Layout" }).click();
  const workspace = page.getByRole("main", { name: "Layout workspace" });
  const pages = workspace.locator(".layout-pages-list button");
  await pages.nth(1).click();
  const properties = workspace.getByRole("complementary", { name: "Page properties" });
  const gap = properties.getByRole("checkbox", { name: "Thin white gap" });
  const numbers = properties.getByRole("checkbox", { name: "Show page numbers" });
  await properties.getByRole("button", { name: "Color", exact: true }).click();
  await properties.getByLabel("Inner edge color").fill("#333333");
  await properties.getByLabel("Inner edge width mm").fill("2");
  await properties.getByLabel("Inner edge width mm").press("Tab");
  const edge = workspace.locator(".layout-paper.is-current .inner-edge-color");
  await expect(gap).toBeChecked();
  await expect(edge).not.toHaveCSS("box-shadow", "none");
  await page.screenshot({ path: testInfo.outputPath("layout-white-gap-on.png") });
  await gap.uncheck();
  await expect(edge).toHaveCSS("box-shadow", "none");
  await properties.getByRole("button", { name: "Apply photo effects to all pages" }).click();
  await numbers.uncheck();
  await expect(workspace.locator(".layout-paper-number")).toHaveCount(0);
  await workspace.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(numbers).toBeChecked();
  await expect(workspace.locator(".layout-paper.is-current .layout-paper-number")).toHaveText("01");
  await workspace.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(numbers).not.toBeChecked();
  await expect(workspace.getByText("Saved locally", { exact: true })).toBeVisible();
  await page.reload();
  await pages.nth(1).click();
  await expect(numbers).not.toBeChecked();
  await expect(gap).not.toBeChecked();
  await expect(edge).toHaveCSS("box-shadow", "none");
  await page.screenshot({ path: testInfo.outputPath("layout-white-gap-off.png") });
  await workspace.getByRole("button", { name: "Read", exact: true }).click();
  const reader = page.locator(".layout-reader");
  await expect(reader.locator(".layout-paper-number")).toHaveCount(0);
  await expect(reader.locator(".inner-edge-color").first()).toHaveCSS("box-shadow", "none");
  await expect(reader.locator(".layout-reader-progress")).toContainText("1–2 / 3");
  await page.keyboard.press("Escape");
  await numbers.check();
  await gap.check();
  await expect(workspace.locator(".layout-paper.is-current .layout-paper-number")).toHaveText("01");
  await workspace.getByRole("button", { name: "Read", exact: true }).click();
  await expect(reader.locator('article[aria-label="Page 1"] .layout-paper-number')).toHaveText("01");
  await expect(reader.locator('article[aria-label="Front cover"] .layout-paper-number')).toHaveCount(0);
  await expect(reader.locator('article[aria-label="Back cover"] .layout-paper-number')).toHaveCount(0);
  await expect(reader.locator('article[aria-label="Page 1"] .inner-edge-color')).not.toHaveCSS("box-shadow", "none");
});

test("Canvas uses the same optional white gap and restores it after reload", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const projectId = await seedBook(page, true);
  await page.evaluate(async (projectId) => {
    const request = indexedDB.open("photoflex-mvp");
    const db = await new Promise<IDBDatabase>((resolve) => { request.onsuccess = () => resolve(request.result); });
    const transaction = db.transaction("projects", "readwrite");
    const store = transaction.objectStore("projects");
    const get = store.get(projectId);
    get.onsuccess = () => {
      const project = get.result;
      project.worktableDraft.frameOrder = ["gap-frame"];
      project.worktableDraft.frames = { "gap-frame": { id: "gap-frame", name: "Gap sample", x: 200, y: 100, z: 1, displayScale: .6,
        page: { widthPt: 600, heightPt: 840, templateSource: { id: "single", version: 1, direction: "horizontal", modified: true,
          marginsPt: { top: 40, right: 40, bottom: 40, left: 40 }, gapPt: 20 },
          innerEdge: { mode: "color", color: "#333333", widthPt: 8 },
          slots: [{ id: "gap-slot", rect: { x: 60, y: 100, width: 480, height: 500 }, photoId: "cover-photo",
            crop: { mode: "fit", zoom: 1, focal: { x: .5, y: .5 } } }] } } };
      store.put(project);
    };
    await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
    db.close();
  }, projectId);
  await page.goto(`/#/projects/${projectId}/table`);
  const frame = page.locator('[data-frame-id="gap-frame"]');
  await frame.locator(".table-frame-title").click();
  const settings = page.getByRole("complementary", { name: "Frame settings" });
  const gap = settings.getByRole("checkbox", { name: "Thin white gap" });
  const edge = frame.locator(".inner-edge-color");
  await expect(frame.locator(".table-frame-photo-clip img")).toBeVisible();
  await expect(gap).toBeChecked();
  await expect(edge).not.toHaveCSS("box-shadow", "none");
  await gap.uncheck();
  await expect(edge).toHaveCSS("box-shadow", "none");
  await page.screenshot({ path: testInfo.outputPath("canvas-white-gap-off.png") });
  await expect.poll(() => page.evaluate(async (projectId) => {
    const request = indexedDB.open("photoflex-mvp");
    const db = await new Promise<IDBDatabase>((resolve) => { request.onsuccess = () => resolve(request.result); });
    const stored = db.transaction("projects").objectStore("projects").get(projectId);
    const project = await new Promise<any>((resolve) => { stored.onsuccess = () => resolve(stored.result); });
    db.close();
    return project.worktableDraft.frames["gap-frame"].page.innerEdge.whiteGap;
  }, projectId)).toBe(false);
  await page.reload();
  await frame.locator(".table-frame-title").click();
  await expect(gap).not.toBeChecked();
  await expect(edge).toHaveCSS("box-shadow", "none");
  await gap.check();
  await expect(edge).not.toHaveCSS("box-shadow", "none");
  await page.screenshot({ path: testInfo.outputPath("canvas-white-gap-on.png") });
});
