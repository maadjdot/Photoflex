import { expect, test } from "@playwright/test";

test("M2.1 Contact Sheet 提供 Place on Table，并移除 Pool 栏", async ({ page }, testInfo) => {
  const projectId = `visual-project-${testInfo.project.name}-${Date.now()}`;
  const sourceId = `visual-source-${testInfo.project.name}-${Date.now()}`;
  const projectName = `Visual Project ${testInfo.project.name}`;
  await page.setViewportSize({ width: 1441, height: 1027 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await page.evaluate(async ({ projectId, sourceId, projectName }) => {
    const request = indexedDB.open("photoflex-mvp");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const createdAt = "2026-08-28T06:32:00.000Z";
    const photoIds = Array.from({ length: 16 }, (_, index) => `visual-photo-${index}`);
    const storeNames = ["projects", "photo-index", "photo-thumbnails", "sequences", "versions", "source-grants", "photo-derived-previews"]
      .filter((name) => database.objectStoreNames.contains(name));
    const transaction = database.transaction(storeNames, "readwrite");
    storeNames.forEach((name) => transaction.objectStore(name).clear());
    transaction.objectStore("projects").put({
      schemaVersion: 7,
      projectId,
      name: projectName,
      memo: "",
      expectedPhotoCount: null,
      sources: [{ id: sourceId, displayName: "Raw Selects", createdAt }],
      photoStates: {},
      worktableDraft: { projectId, entryOrder: [], placements: {}, groups: [], links: [], pileOrder: [], pilePlacements: {} },
      sequenceIds: [],
      versionIds: [],
      revision: 0,
      createdAt,
      updatedAt: createdAt,
      lastOpenedAt: createdAt,
    });
    const photoStore = transaction.objectStore("photo-index");
    const thumbnailStore = transaction.objectStore("photo-thumbnails");
    photoIds.forEach((id, index) => {
      photoStore.put({ id, sourceId, relativePath: `PF_${String(2401 + index).padStart(4, "0")}.jpg`, width: 1200, height: 900 });
      const hue = 25 + index * 17;
      const thumbnail = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="hsl(${hue} 18% 75%)"/><path d="M0 260L95 155L180 225L270 105L400 225V300H0Z" fill="hsl(${hue} 14% 43%)"/><path d="M0 280L105 205L190 255L285 165L400 245V300H0Z" fill="hsl(${hue} 18% 25%)"/></svg>`;
      thumbnailStore.put({ photoId: id, blob: new Blob([thumbnail], { type: "image/svg+xml" }) });
    });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  }, { projectId, sourceId, projectName });

  await page.goto(`/#/projects/${projectId}/sources/${sourceId}`);
  await expect(page.getByRole("heading", { name: "Raw Selects" })).toBeVisible();
  await expect(page.locator(".photo-tile").first()).toBeVisible();

  const header = await page.locator(".topbar").boundingBox();
  const sourceRail = await page.locator(".source-rail").boundingBox();
  const firstRow = await page.locator(".photo-tile").evaluateAll((tiles) => {
    const tops = tiles.map((tile) => Math.round(tile.getBoundingClientRect().top));
    const firstTop = Math.min(...tops);
    return tops.filter((top) => Math.abs(top - firstTop) <= 1).length;
  });

  expect(header?.height).toBe(44);
  expect(sourceRail?.width).toBeGreaterThanOrEqual(210);
  expect(sourceRail?.width).toBeLessThanOrEqual(213);
  await expect(page.locator(".pool-panel")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Place on Table" })).toBeVisible();
  expect(firstRow).toBeGreaterThanOrEqual(4);

  await page.screenshot({ path: testInfo.outputPath("contact-sheet.png"), fullPage: true });

  await page.locator(".photo-tile").nth(0).click();
  await page.locator(".photo-tile").nth(1).click();
  await page.getByRole("button", { name: "Place on Table" }).click();
  await expect.poll(async () => page.evaluate(async (id) => {
    const request = indexedDB.open("photoflex-mvp");
    const database = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const workspace = await new Promise<{ worktableDraft?: { entryOrder?: unknown[] } } | undefined>((resolve, reject) => {
      const read = database.transaction("projects", "readonly").objectStore("projects").get(id);
      read.onsuccess = () => resolve(read.result);
      read.onerror = () => reject(read.error);
    });
    database.close();
    return workspace?.worktableDraft?.entryOrder?.length ?? 0;
  }, projectId)).toBe(2);
  await page.getByRole("button", { name: "Table", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`#\\/projects\\/${projectId}\\/table$`));
  await expect(page.locator(".worktable-card")).toHaveCount(2);
  await expect(page.getByRole("group", { name: "Table selection actions" })).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "Photo Sources" })).toBeVisible();
  const sourcePhoto = page.getByRole("button", { name: "PF_2403.jpg" });
  await expect(sourcePhoto).toBeVisible();
  await sourcePhoto.click();
  const addToTable = page.getByRole("button", { name: "Add to Table" });
  await expect(addToTable).toHaveText("Add to Table");
  expect(await addToTable.evaluate((button) => ({ height: button.getBoundingClientRect().height, fontSize: getComputedStyle(button).fontSize }))).toEqual({ height: 26, fontSize: "9px" });
  await addToTable.click();
  await expect(page.locator(".worktable-card")).toHaveCount(3);

  const firstCard = page.locator(".worktable-card").first();
  const beforeDrag = await firstCard.boundingBox();
  if (!beforeDrag) throw new Error("Table card is not visible");
  await page.mouse.move(beforeDrag.x + beforeDrag.width / 2, beforeDrag.y + beforeDrag.height / 2);
  await page.mouse.down();
  await page.mouse.move(beforeDrag.x + beforeDrag.width / 2 + 48, beforeDrag.y + beforeDrag.height / 2 + 32, { steps: 3 });
  await page.mouse.up();
  await expect.poll(async () => (await firstCard.boundingBox())?.x).toBeGreaterThan(beforeDrag.x + 40);
  const afterDrag = await firstCard.boundingBox();
  await page.reload();
  await expect(page.locator(".worktable-card")).toHaveCount(3);
  const afterReload = await page.locator(".worktable-card").first().boundingBox();
  expect(Math.round(afterReload?.x ?? 0)).toBe(Math.round(afterDrag?.x ?? 0));

  await page.screenshot({ path: testInfo.outputPath("table.png"), fullPage: true });

  await page.goto("/");
  await page.getByRole("button", { name: `Open project ${projectName}` }).first().click();
  await expect(page).toHaveURL(new RegExp(`#\\/projects\\/${projectId}\\/table$`));
  const sourceBrowser = page.getByRole("complementary", { name: "Photo Sources" });
  await expect(sourceBrowser).toBeVisible();
  await sourceBrowser.getByRole("button", { name: "Collapse Photo Sources" }).click();
  await expect(sourceBrowser).toHaveCount(0);
  await page.getByRole("button", { name: "Open Photo Sources" }).click();
  await expect(sourceBrowser).toBeVisible();
  const sourceCard = sourceBrowser.locator(".table-source-photo").first();
  await expect(sourceCard).toBeVisible();
  await expect.poll(() => sourceCard.locator(":scope > img, :scope > .thumb-placeholder").first().evaluate((image) => getComputedStyle(image).objectFit)).toBe("contain");

  for (const viewport of [{ width: 1577, height: 900 }, { width: 1280, height: 800 }, { width: 1024, height: 800 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate((key) => window.sessionStorage.removeItem(`${key}:expanded`), `photoflex:table-sidebar:${projectId}`);
    await page.goto(`/#/projects/${projectId}/table`);
    await expect(page.locator(".worktable-card")).toHaveCount(3);
    const responsiveSidebar = page.getByRole("complementary", { name: "Photo Sources" });
    if (await responsiveSidebar.getAttribute("class").then((value) => !value?.includes("is-expanded"))) {
      await responsiveSidebar.getByRole("button", { name: "Expand Photo Sources" }).click();
    }
    await expect(responsiveSidebar).toHaveClass(/is-expanded/);
    const mainBox = await page.locator(".table-workspace-main").boundingBox();
    const sidebarBox = await responsiveSidebar.boundingBox();
    const resizer = page.getByRole("separator", { name: "Resize Photo Sources" });
    const resizerBox = await resizer.boundingBox();
    expect(Math.round(sidebarBox?.width ?? 0)).toBe(viewport.width === 1024 ? 560 : 548);
    expect(Math.round(resizerBox?.width ?? 0)).toBe(9);
    if (viewport.width === 1024) {
      expect(Math.round(mainBox?.width ?? 0)).toBe(viewport.width);
      expect(Math.round(sidebarBox?.x ?? 0)).toBe(viewport.width - 560 - 12);
      if (!resizerBox) throw new Error("Photo Sources resizer is not visible");
      await page.mouse.move(resizerBox.x + resizerBox.width / 2, resizerBox.y + resizerBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(resizerBox.x + resizerBox.width / 2 - 64, resizerBox.y + resizerBox.height / 2, { steps: 3 });
      await page.mouse.up();
      await expect.poll(async () => Math.round((await responsiveSidebar.boundingBox())?.width ?? 0)).toBe(624);
      await resizer.focus();
      await page.keyboard.press("ArrowRight");
      await expect.poll(async () => Math.round((await responsiveSidebar.boundingBox())?.width ?? 0)).toBe(608);
      await page.keyboard.press("Home");
      await expect.poll(async () => Math.round((await responsiveSidebar.boundingBox())?.width ?? 0)).toBe(560);
      await responsiveSidebar.getByRole("button", { name: "Use compact Photo Sources" }).click();
      await expect(responsiveSidebar).toHaveClass(/is-compact/);
      const compactMainBox = await page.locator(".table-workspace-main").boundingBox();
      const compactSidebarBox = await responsiveSidebar.boundingBox();
      expect(Math.round(compactMainBox?.width ?? 0)).toBe(viewport.width);
      expect(Math.round(compactSidebarBox?.width ?? 0)).toBe(280);
      expect(Math.round(compactSidebarBox?.x ?? 0)).toBe(viewport.width - 280 - 12);
      await page.screenshot({ path: testInfo.outputPath("table-1024x800-compact.png"), fullPage: true });
      await responsiveSidebar.getByRole("button", { name: "Expand Photo Sources" }).click();
      await expect(responsiveSidebar).toHaveClass(/is-expanded/);
    } else {
      expect(Math.round((mainBox?.width ?? 0) + (resizerBox?.width ?? 0) + (sidebarBox?.width ?? 0) + 12)).toBe(viewport.width);
    }
    if (viewport.width === 1280) {
      await responsiveSidebar.getByRole("button", { name: "Use compact Photo Sources" }).click();
      await expect(responsiveSidebar).toHaveClass(/is-compact/);
      await expect.poll(async () => Math.round((await responsiveSidebar.boundingBox())?.width ?? 0)).toBe(268);
      await responsiveSidebar.getByRole("button", { name: "Collapse Photo Sources" }).click();
      await expect(responsiveSidebar).toHaveCount(0);
      await page.getByRole("button", { name: "Open Photo Sources" }).click();
      await expect(responsiveSidebar).toBeVisible();
      await responsiveSidebar.getByRole("button", { name: "Expand Photo Sources" }).click();
      await expect(responsiveSidebar).toHaveClass(/is-expanded/);
      await expect.poll(async () => Math.round((await responsiveSidebar.boundingBox())?.width ?? 0)).toBe(548);
    }
    await page.screenshot({ path: testInfo.outputPath(`table-${viewport.width}x${viewport.height}.png`), fullPage: true });
  }

  await page.setViewportSize({ width: 1577, height: 900 });
  await page.goto(`/#/projects/${projectId}/table`);
  const finalCards = page.locator(".worktable-card");
  await expect(finalCards).toHaveCount(3);
  await finalCards.nth(0).click();
  await finalCards.nth(1).click({ modifiers: ["Control"] });
  const selectionToolbar = page.getByRole("group", { name: "Table selection actions" });
  await expect(selectionToolbar).toBeVisible();
  expect(await selectionToolbar.evaluate((element) => getComputedStyle(element).flexWrap)).toBe("nowrap");
  await expect(selectionToolbar.getByRole("button", { name: "Clear" })).toHaveCount(0);
  const finalSourcePhotos = page.locator(".table-source-photo");
  await expect(finalSourcePhotos.nth(3)).toBeVisible();
  await finalSourcePhotos.nth(3).click();
  await expect(finalSourcePhotos.nth(3)).toHaveClass(/is-selected/);
  await page.screenshot({ path: testInfo.outputPath("table-final-interaction-states.png"), fullPage: true });
});
