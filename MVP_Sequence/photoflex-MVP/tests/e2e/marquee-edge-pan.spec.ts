import { expect, test } from "@playwright/test";

test("marquee keeps earlier photos selected while the Table auto-pans", async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 640 });
  await page.goto("/");
  const projectId = `marquee-e2e-${crypto.randomUUID()}`;
  await page.evaluate(async (id) => {
    const request = indexedDB.open("photoflex-mvp");
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const createdAt = new Date().toISOString();
    const placements = {
      first: { id: "first", photoId: "photo-first", x: 120, y: 150, z: 1, width: 90, height: 90, filename: "first.jpg" },
      later: { id: "later", photoId: "photo-later", x: 710, y: 150, z: 2, width: 90, height: 90, filename: "later.jpg" },
    };
    const transaction = db.transaction("projects", "readwrite");
    transaction.objectStore("projects").put({ schemaVersion: 9, projectId: id, name: "Marquee Test", memo: "", expectedPhotoCount: null, sources: [], photoStates: {},
      worktableDraft: { projectId: id, entryOrder: ["first", "later"], placements, groups: [], links: [], pileOrder: [], pilePlacements: {}, frameOrder: [], frames: {} },
      resumeContext: { page: "table", filter: "all", tableViewport: { originX: 0, originY: 0, zoom: 1 } },
      sequenceIds: [], versionIds: [], revision: 0, createdAt, updatedAt: createdAt, lastOpenedAt: createdAt });
    await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
    db.close();
  }, projectId);
  await page.goto(`/#/projects/${projectId}/table`);
  const stage = page.getByLabel("Photo worktable");
  await expect(stage.locator("[data-worktable-photo-id='first']")).toBeVisible();
  const bounds = await stage.boundingBox();
  if (!bounds) throw new Error("Table stage missing");
  const start = { x: bounds.x + 60, y: bounds.y + 120 };
  const end = { x: bounds.x + bounds.width - 8, y: bounds.y + 300 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await expect.poll(async () => Number.parseFloat(await stage.locator(".worktable-marquee").evaluate((node) => getComputedStyle(node).left))).toBeLessThan(0);
  await page.waitForTimeout(500);
  await page.mouse.up();
  await expect(stage.locator("[data-worktable-photo-id='first']")).toHaveClass(/is-selected/);
  await expect(stage.locator("[data-worktable-photo-id='later']")).toHaveClass(/is-selected/);
});
