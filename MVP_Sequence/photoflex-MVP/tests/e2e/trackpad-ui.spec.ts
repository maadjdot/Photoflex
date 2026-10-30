import { expect, test } from "@playwright/test";

test("trackpad scroll pans Table in both axes and pinch zoom stays anchored inside the app", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your Projects", exact: true })).toBeVisible();
  const projectId = `trackpad-${crypto.randomUUID()}`;
  await page.evaluate(async (id) => {
    const fixtureModule = "/tests/helpers/browserProjectFixture.ts";
    const { createBrowserWorkspace } = await import(/* @vite-ignore */ fixtureModule);
    const request = indexedDB.open("photoflex-mvp");
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const tx = db.transaction("projects", "readwrite");
    tx.objectStore("projects").put(createBrowserWorkspace({ projectId: id, name: "Trackpad", createdAt: new Date().toISOString(),
      resumeContext: { page: "table", filter: "all", tableViewport: { originX: 0, originY: 0, zoom: 1 } },
    }));
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    db.close();
  }, projectId);
  await page.goto(`/#/projects/${projectId}/table`);
  const stage = page.getByLabel("Photo worktable");
  const world = stage.locator(".worktable-world");
  await expect(stage).toBeVisible();
  const viewport = () => world.evaluate((element) => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
    return { x: matrix.m41, y: matrix.m42, zoom: matrix.a };
  });
  const bounds = (await stage.boundingBox())!;
  const point = { x: Math.floor(bounds.x + bounds.width * .6), y: Math.floor(bounds.y + bounds.height * .4) };
  await page.mouse.move(point.x, point.y);
  for (const delta of [{ x: 0, y: 80 }, { x: 60, y: 0 }, { x: -25, y: -40 }]) {
    const before = await viewport();
    await page.mouse.wheel(delta.x, delta.y);
    await expect.poll(viewport).toEqual({ x: before.x - delta.x, y: before.y - delta.y, zoom: before.zoom });
  }
  const before = await viewport();
  const worldPoint = { x: (point.x - bounds.x - before.x) / before.zoom, y: (point.y - bounds.y - before.y) / before.zoom };
  const browserScale = await page.evaluate(() => ({ width: innerWidth, pixelRatio: devicePixelRatio, scale: visualViewport?.scale }));
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Control");
  await expect.poll(async () => (await viewport()).zoom).toBeGreaterThan(before.zoom);
  const after = await viewport();
  expect((point.x - bounds.x - after.x) / after.zoom).toBeCloseTo(worldPoint.x, 2);
  expect((point.y - bounds.y - after.y) / after.zoom).toBeCloseTo(worldPoint.y, 2);
  expect(await page.evaluate(() => ({ width: innerWidth, pixelRatio: devicePixelRatio, scale: visualViewport?.scale }))).toEqual(browserScale);
  await page.mouse.wheel(20, 30);
  await expect.poll(viewport).toEqual({ x: after.x - 20, y: after.y - 30, zoom: after.zoom });
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, 100);
  await page.keyboard.up("Control");
  await expect.poll(async () => (await viewport()).zoom).toBeCloseTo(1);
});
