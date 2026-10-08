import { expect, test, type Page } from "@playwright/test";

async function seedNavigationProject(page: Page) {
  const projectId = `layout-navigation-${crypto.randomUUID()}`;
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your Projects", exact: true })).toBeVisible();
  await page.evaluate(async (id) => {
    const fixtureModule = "/tests/helpers/browserProjectFixture.ts";
    const { createBrowserWorkspace } = await import(/* @vite-ignore */ fixtureModule);
    const request = indexedDB.open("photoflex-mvp");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const blob = await (await fetch("/tests/fixtures/photos/photo-01.jpg")).blob();
    const now = new Date().toISOString();
    const tx = db.transaction(["projects", "sequences", "versions", "layouts", "photo-index", "photo-thumbnails"], "readwrite");
    const sequenceIds = ["other-sequence", "layout-sequence"];
    tx.objectStore("projects").put(createBrowserWorkspace({
      projectId: id, name: "Layout navigation", createdAt: now, sequenceIds, versionIds: sequenceIds.map((sequenceId) => `${sequenceId}-version`), layoutIds: ["navigation-layout"],
      worktableDraft: { projectId: id, entryOrder: [], placements: {}, groups: [], links: [], pileOrder: sequenceIds,
        pilePlacements: {
          "other-sequence": { sequenceId: "other-sequence", x: 100, y: 100, width: 280, height: 176, z: 0 },
          "layout-sequence": { sequenceId: "layout-sequence", x: 5200, y: 3800, width: 420, height: 220, z: 1 },
        }, frameOrder: [], frames: {} },
      resumeContext: { page: "table", filter: "all", sequenceId: "other-sequence", tableViewport: { originX: 36, originY: 28, zoom: 0.75 } },
    }));
    for (const sequenceId of sequenceIds) {
      const items = [{ id: `${sequenceId}-item`, kind: "photo", photoId: "navigation-photo" }];
      const readingUnits = [{ id: `${sequenceId}-unit`, kind: "single", itemId: items[0].id }];
      tx.objectStore("sequences").put({ id: sequenceId, projectId: id, name: sequenceId, items, segments: [], readingUnits,
        currentVersionId: `${sequenceId}-version`, revision: 0, createdAt: now, updatedAt: now });
      tx.objectStore("versions").put({ id: `${sequenceId}-version`, projectId: id, sequenceId, name: "Initial",
        itemCount: 1, items, segments: [], readingUnits, createdAt: now });
    }
    tx.objectStore("layouts").put({ schemaVersion: 1, id: "navigation-layout", projectId: id, sequenceId: "layout-sequence", name: "Navigation Layout",
      pageSpec: { widthPt: 600, heightPt: 840 }, pages: [{ id: "navigation-page", objects: [] }], revision: 0, createdAt: now, updatedAt: now });
    tx.objectStore("photo-index").put({ id: "navigation-photo", sourceId: "navigation-source", relativePath: "navigation.jpg", width: 800, height: 600 });
    tx.objectStore("photo-thumbnails").put({ photoId: "navigation-photo", maxEdge: 512,
      sourceVersion: "navigation.jpg|800|600|unknown-size|unknown-mtime|unknown-fingerprint", blob });
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    db.close();
  }, projectId);
  return projectId;
}

for (const returnVia of ["Table", "Sequence"] as const) {
  test(`returning from Layout via ${returnVia} shows its Sequence and preserves Table zoom`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const projectId = await seedNavigationProject(page);
    await page.goto(`/#/projects/${projectId}/table`);
    const stage = page.getByLabel("Photo worktable");
    const pile = page.getByLabel("Sequence pile layout-sequence", { exact: true });
    await expect(stage).toBeVisible();
    await expect(page.getByRole("button", { name: "Fit", exact: true })).toHaveText("75%");
    expect((await pile.boundingBox())!.x).toBeGreaterThan(1280);
    await page.goto(`/#/projects/${projectId}/sequences/layout-sequence`);
    const overlay = page.getByRole("dialog", { name: "Sequence layout-sequence", exact: true });
    await overlay.getByRole("button", { name: "Layout", exact: true }).click();
    const workspace = page.getByRole("main", { name: "Layout workspace" });
    await expect(workspace).toBeVisible();
    await workspace.getByRole("navigation", { name: "Workspace", exact: true }).getByRole("button", { name: returnVia === "Table" ? "Table" : "← Sequence", exact: true }).click();
    if (returnVia === "Sequence") await overlay.getByRole("button", { name: "Close Sequence", exact: true }).click();
    await expect(stage).toBeVisible();
    await expect(overlay).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Fit", exact: true })).toHaveText("75%");
    await expect.poll(async () => {
      const canvas = (await stage.boundingBox())!, card = (await pile.boundingBox())!;
      return Math.max(Math.abs(card.x + card.width / 2 - canvas.x - canvas.width / 2), Math.abs(card.y + card.height / 2 - canvas.y - canvas.height / 2));
    }).toBeLessThan(1);
    const canvas = (await stage.boundingBox())!, card = (await pile.boundingBox())!;
    expect(card.x).toBeGreaterThanOrEqual(canvas.x);
    expect(card.y).toBeGreaterThanOrEqual(canvas.y);
    expect(card.x + card.width).toBeLessThanOrEqual(canvas.x + canvas.width);
    expect(card.y + card.height).toBeLessThanOrEqual(canvas.y + canvas.height);
    await stage.press("ArrowRight");
    await expect.poll(async () => Math.abs((await pile.boundingBox())!.x - card.x)).toBe(64);
    await expect.poll(async () => page.evaluate(async (id) => {
      const request = indexedDB.open("photoflex-mvp");
      const db = await new Promise<IDBDatabase>((resolve) => { request.onsuccess = () => resolve(request.result); });
      const project = db.transaction("projects").objectStore("projects").get(id);
      const originX = await new Promise<number>((resolve) => { project.onsuccess = () => resolve(project.result.resumeContext.tableViewport.originX); });
      db.close(); return originX;
    }, projectId)).toBeCloseTo(card.x - canvas.x - 5200 * 0.75 - 64);
    expect(Math.abs((await pile.boundingBox())!.x - card.x)).toBe(64);
  });
}
