import { expect, test } from "@playwright/test";

test("M1_v2 Contact Sheet 保持三栏比例与四列首屏", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1441, height: 1027 });
  await page.goto("/");
  await expect(page.getByText("Begin with a body of work.")).toBeVisible();
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
      schemaVersion: 2,
      projectId,
      name: "Visual Project",
      memo: "",
      expectedPhotoCount: null,
      sources: [{ id: sourceId, displayName: "Raw Selects", createdAt }],
      poolPhotoIds: photoIds.slice(0, 8),
      sequenceDraft: { projectId, items: [] },
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
  const pool = await page.locator(".pool-panel").boundingBox();
  const firstRow = await page.locator(".photo-tile").evaluateAll((tiles) => {
    const tops = tiles.map((tile) => Math.round(tile.getBoundingClientRect().top));
    const firstTop = Math.min(...tops);
    return tops.filter((top) => Math.abs(top - firstTop) <= 1).length;
  });

  expect(header?.height).toBe(80);
  expect(sourceRail?.width).toBeGreaterThanOrEqual(210);
  expect(sourceRail?.width).toBeLessThanOrEqual(213);
  expect(pool?.width).toBeGreaterThanOrEqual(324);
  expect(pool?.width).toBeLessThanOrEqual(327);
  expect(firstRow).toBe(4);

  await page.screenshot({ path: testInfo.outputPath("contact-sheet.png"), fullPage: true });
});
