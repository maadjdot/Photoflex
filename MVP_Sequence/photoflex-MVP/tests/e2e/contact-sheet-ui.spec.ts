import { expect, test } from "@playwright/test";

test("M2.1 Contact Sheet 提供 Place on Table，并移除 Pool 栏", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1441, height: 1027 });
  await page.goto("/");
  await expect(page.getByText("Begin your photo journey")).toBeVisible();
  await page.evaluate(async () => {
    const request = indexedDB.open("photoflex-mvp");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const projectId = "visual-project";
    const sourceId = "visual-source";
    const createdAt = "2026-08-28T06:32:00.000Z";
    const photoIds = Array.from({ length: 16 }, (_, index) => `visual-photo-${index}`);
    const transaction = database.transaction(["projects", "photo-index", "photo-thumbnails"], "readwrite");
    transaction.objectStore("projects").put({
      schemaVersion: 6,
      projectId,
      name: "Visual Project",
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
  });

  await page.goto("/#/projects/visual-project/sources/visual-source");
  await expect(page.getByRole("heading", { name: "Raw Selects" })).toBeVisible();
  await expect(page.locator(".photo-tile").first()).toBeVisible();

  const header = await page.locator(".topbar").boundingBox();
  const sourceRail = await page.locator(".source-rail").boundingBox();
  const firstRow = await page.locator(".photo-tile").evaluateAll((tiles) => {
    const tops = tiles.map((tile) => Math.round(tile.getBoundingClientRect().top));
    const firstTop = Math.min(...tops);
    return tops.filter((top) => Math.abs(top - firstTop) <= 1).length;
  });

  expect(header?.height).toBe(65);
  expect(sourceRail?.width).toBeGreaterThanOrEqual(210);
  expect(sourceRail?.width).toBeLessThanOrEqual(213);
  await expect(page.locator(".pool-panel")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Place on Table" })).toBeVisible();
  expect(firstRow).toBeGreaterThanOrEqual(4);

  await page.screenshot({ path: testInfo.outputPath("contact-sheet.png"), fullPage: true });

  await page.locator(".photo-tile").nth(0).click();
  await page.locator(".photo-tile").nth(1).click();
  await page.getByRole("button", { name: "Place on Table" }).click();
  await page.getByRole("button", { name: "Table", exact: true }).click();
  await expect(page).toHaveURL(/#\/projects\/visual-project\/table$/);
  await expect(page.locator(".worktable-card")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Group" })).toBeDisabled();

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
  await expect(page.locator(".worktable-card")).toHaveCount(2);
  const afterReload = await page.locator(".worktable-card").first().boundingBox();
  expect(Math.round(afterReload?.x ?? 0)).toBe(Math.round(afterDrag?.x ?? 0));

  await page.screenshot({ path: testInfo.outputPath("table.png"), fullPage: true });
});
