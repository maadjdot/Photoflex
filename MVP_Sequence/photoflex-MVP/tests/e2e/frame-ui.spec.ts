import { expect, test } from "@playwright/test";

test("creates and edits a Frame on the Table and restores it after reload", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  const projectId = `frame-e2e-${crypto.randomUUID()}`;
  await page.evaluate(async (id) => {
    const request = indexedDB.open("photoflex-mvp");
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const createdAt = new Date().toISOString();
    const transaction = db.transaction("projects", "readwrite");
    transaction.objectStore("projects").put({ schemaVersion: 9, projectId: id, name: "Frame Test", memo: "", expectedPhotoCount: null, sources: [], photoStates: {},
      worktableDraft: { projectId: id, entryOrder: [], placements: {}, groups: [], links: [], pileOrder: [], pilePlacements: {}, frameOrder: [], frames: {} },
      sequenceIds: [], versionIds: [], revision: 0, createdAt, updatedAt: createdAt, lastOpenedAt: createdAt });
    await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
    db.close();
  }, projectId);
  await page.goto(`/#/projects/${projectId}/table`);
  await expect(page.getByLabel("Photo worktable")).toBeVisible();
  await page.getByRole("button", { name: "Frame templates" }).click();
  await page.getByRole("button", { name: /Quad Grid 4 slots/ }).click();
  const frame = page.locator("[data-frame-id]");
  await expect(frame).toHaveCount(1);
  await expect(frame.locator("[data-frame-slot-id]")).toHaveCount(4);
  const settings = page.getByRole("complementary", { name: "Frame settings" });
  await expect(settings).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Photo Sources" })).toHaveCount(0);
  await settings.getByRole("button", { name: "Diptych", exact: true }).click();
  await expect(frame.locator("[data-frame-slot-id]")).toHaveCount(2);
  await settings.getByRole("button", { name: "Add photo box" }).click();
  await expect(frame.locator("[data-frame-slot-id]")).toHaveCount(3);
  await expect(settings.getByText("PHOTO BOX 03")).toBeVisible();
  await expect(settings.getByRole("group", { name: "Template" })).toBeVisible();
  await expect(settings.getByRole("slider", { name: "Corner radius" })).toBeVisible();
  await settings.getByRole("button", { name: "Remove photo box" }).click();
  await expect(frame.locator("[data-frame-slot-id]")).toHaveCount(2);
  await frame.locator("[data-frame-slot-id]").first().click();
  await page.keyboard.press("Delete");
  await expect(frame).toHaveCount(1);
  await expect(frame.locator("[data-frame-slot-id]")).toHaveCount(1);
  await settings.getByRole("button", { name: "Duplicate" }).click();
  await expect(page.locator("[data-frame-id]")).toHaveCount(2);
  await page.reload();
  await expect(page.locator("[data-frame-id]")).toHaveCount(2);
  await expect(page.locator("[data-frame-id]").first().locator("[data-frame-slot-id]")).toHaveCount(1);
  await page.locator("[data-frame-id]").first().click();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.locator("[data-frame-id]").last().locator(".table-frame-title").click({ position: { x: 50, y: 4 } });
  const inspector = await settings.boundingBox();
  const stage = await page.getByLabel("Photo worktable").boundingBox();
  expect(inspector && stage && inspector.x >= stage.x + stage.width && inspector.x + inspector.width <= 1280).toBeTruthy();
  await page.getByRole("button", { name: "Frame templates" }).click();
  const popover = page.getByRole("dialog", { name: "Frame templates" });
  await expect(popover).toBeVisible();
  const bounds = await popover.boundingBox();
  expect(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 1280 && bounds.y + bounds.height <= 800).toBeTruthy();
  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
  await page.getByRole("button", { name: "Frame templates" }).click();
  await page.getByLabel("Photo worktable").click({ position: { x: 220, y: 100 } });
  await expect(popover).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath("frame.png") });
});

test("creates a full-page square nine-grid and adds selected photo-box settings below Frame settings", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const projectId = `frame-nine-${crypto.randomUUID()}`;
  await page.evaluate(async (id) => {
    const request = indexedDB.open("photoflex-mvp");
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const createdAt = new Date().toISOString();
    const transaction = db.transaction("projects", "readwrite");
    transaction.objectStore("projects").put({ schemaVersion: 9, projectId: id, name: "Nine Grid Test", memo: "", expectedPhotoCount: null, sources: [], photoStates: {},
      worktableDraft: { projectId: id, entryOrder: [], placements: {}, groups: [], links: [], pileOrder: [], pilePlacements: {}, frameOrder: [], frames: {} },
      sequenceIds: [], versionIds: [], revision: 0, createdAt, updatedAt: createdAt, lastOpenedAt: createdAt });
    await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
    db.close();
  }, projectId);
  await page.goto(`/#/projects/${projectId}/table`);
  await page.getByRole("button", { name: "Frame templates" }).click();
  await page.getByRole("button", { name: /Square Nine Grid 9 slots/ }).click();
  const frame = page.locator("[data-frame-id]");
  const settings = page.getByRole("complementary", { name: "Frame settings" });
  await expect(frame.locator("[data-frame-slot-id]")).toHaveCount(9);
  const pageSize = await frame.locator(".table-frame-page").evaluate((node) => ({ width: (node as HTMLElement).style.width, height: (node as HTMLElement).style.height }));
  expect(pageSize.width).toBe(pageSize.height);
  await settings.getByRole("button", { name: "Black background" }).click();
  await expect(frame.locator(".table-frame-page")).toHaveClass(/is-black/);
  await page.screenshot({ path: testInfo.outputPath("frame-settings.png") });
  await expect(settings.getByRole("slider", { name: "Corner radius" })).toHaveCount(0);
  await settings.getByRole("spinbutton", { name: "Bleed mm" }).fill("3");
  await settings.getByRole("spinbutton", { name: "Bleed mm" }).press("Tab");
  await expect(frame.locator(".table-frame-bleed-guide")).toBeVisible();
  const firstId = await frame.locator("[data-frame-slot-id]").first().getAttribute("data-frame-slot-id");
  await frame.locator("[data-frame-slot-id]").first().click();
  await expect(settings.getByText("PHOTO BOX 01")).toBeVisible();
  await expect(settings.getByRole("group", { name: "Template" })).toBeVisible();
  await expect(settings.getByRole("group", { name: "Background color" })).toBeVisible();
  await settings.getByRole("slider", { name: "Corner radius" }).focus();
  await page.keyboard.press("End");
  await expect(frame.locator(".table-frame-photo-clip").first()).toHaveCSS("border-radius", "32px");
  await expect(frame.locator(".table-frame-photo-clip").nth(1)).toHaveCSS("border-radius", "0px");
  await page.screenshot({ path: testInfo.outputPath("photo-box-settings.png") });
  await settings.getByRole("button", { name: "Front photo box" }).click();
  await expect(frame.locator("[data-frame-slot-id]").last()).toHaveAttribute("data-frame-slot-id", firstId!);
  await page.keyboard.press("Delete");
  await expect(frame.locator("[data-frame-slot-id]")).toHaveCount(8);
  await expect(settings.getByRole("button", { name: "Add photo box" })).toBeVisible();
  await page.reload();
  await expect(page.locator("[data-frame-id] .table-frame-page")).toHaveClass(/is-black/);
  await expect(page.locator("[data-frame-id] [data-frame-slot-id]")).toHaveCount(8);
});

test("keeps Table photos above existing Frames until Front is chosen", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const projectId = `frame-layer-${crypto.randomUUID()}`;
  await page.evaluate(async (id) => {
    const request = indexedDB.open("photoflex-mvp");
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const createdAt = new Date().toISOString();
    const transaction = db.transaction("projects", "readwrite");
    transaction.objectStore("projects").put({ schemaVersion: 9, projectId: id, name: "Frame Layer Test", memo: "", expectedPhotoCount: null, sources: [], photoStates: {},
      worktableDraft: { projectId: id, entryOrder: ["card-layer"], placements: { "card-layer": { id: "card-layer", photoId: "photo-layer", z: 1, x: 180, y: 150, width: 200, height: 160, filename: "Layer.jpg" } },
        groups: [], links: [], pileOrder: [], pilePlacements: {}, frameOrder: [], frames: {} },
      sequenceIds: [], versionIds: [], revision: 0, createdAt, updatedAt: createdAt, lastOpenedAt: createdAt });
    await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
    db.close();
  }, projectId);
  await page.goto(`/#/projects/${projectId}/table`);
  await page.getByRole("button", { name: "Frame templates" }).click();
  await page.getByRole("button", { name: /Single 1 slots/ }).click();
  const frame = page.locator("[data-frame-id]");
  const photo = page.locator("[data-worktable-photo-id]");
  await expect(frame).toBeVisible();
  await expect(photo).toBeVisible();
  await page.waitForFunction(async (id) => {
    const request = indexedDB.open("photoflex-mvp");
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const read = db.transaction("projects", "readonly").objectStore("projects").get(id);
    const workspace = await new Promise<{ worktableDraft?: { frameOrder?: string[] } }>((resolve, reject) => { read.onsuccess = () => resolve(read.result); read.onerror = () => reject(read.error); });
    db.close();
    return workspace?.worktableDraft?.frameOrder?.length === 1;
  }, projectId);
  await page.evaluate(async (id) => {
    const request = indexedDB.open("photoflex-mvp");
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const transaction = db.transaction("projects", "readwrite");
    const store = transaction.objectStore("projects");
    const read = store.get(id);
    const workspace = await new Promise<any>((resolve, reject) => { read.onsuccess = () => resolve(read.result); read.onerror = () => reject(read.error); });
    const frameId = workspace.worktableDraft.frameOrder[0];
    Object.assign(workspace.worktableDraft.frames[frameId], { x: 120, y: 100, z: 999 });
    store.put(workspace);
    await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
    db.close();
  }, projectId);
  await page.reload();
  await expect(frame).toBeVisible();
  const overlapIsPhoto = () => page.evaluate(() => {
    const frameRect = document.querySelector(".table-frame-page")!.getBoundingClientRect();
    const photoRect = document.querySelector("[data-worktable-photo-id]")!.getBoundingClientRect();
    const left = Math.max(frameRect.left, photoRect.left), right = Math.min(frameRect.right, photoRect.right);
    const top = Math.max(frameRect.top, photoRect.top), bottom = Math.min(frameRect.bottom, photoRect.bottom);
    if (left >= right || top >= bottom) return "no-overlap";
    const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2) as HTMLElement | null;
    return hit?.closest("[data-worktable-photo-id]") ? "photo" : hit?.closest("[data-frame-id]") ? "frame" : "other";
  });
  expect(await overlapIsPhoto()).toBe("photo");
  await frame.locator(".table-frame-title").click();
  expect(await overlapIsPhoto()).toBe("photo");
  await page.getByRole("complementary", { name: "Frame settings" }).getByRole("button", { name: "Front", exact: true }).click();
  expect(await overlapIsPhoto()).toBe("frame");
});
