import { expect, test } from "@playwright/test";

test("Frame settings stay flush after visiting Layout and translate in Chinese", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your Projects", exact: true })).toBeVisible();
  const projectId = `frame-surfaces-${crypto.randomUUID()}`;
  await page.evaluate(async (id) => {
    const fixtureModule = "/tests/helpers/browserProjectFixture.ts";
    const { createBrowserWorkspace } = await import(/* @vite-ignore */ fixtureModule);
    const request = indexedDB.open("photoflex-mvp");
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const timestamp = new Date().toISOString();
    const transaction = db.transaction(["projects", "sequences", "versions", "layouts"], "readwrite");
    const items = [{ id: "blank-item", kind: "blank" }], readingUnits = [{ id: "blank-unit", kind: "blank", itemId: "blank-item" }];
    transaction.objectStore("projects").put(createBrowserWorkspace({ projectId: id, name: "Frame UI", memo: "", expectedPhotoCount: null, sources: [], photoStates: {},
      worktableDraft: { projectId: id, entryOrder: [], placements: {}, groups: [], links: [], pileOrder: [], pilePlacements: {}, frameOrder: [], frames: {} },
      sequenceIds: ["surface-sequence"], versionIds: ["surface-version"], layoutIds: ["surface-layout"], revision: 0, createdAt: timestamp, updatedAt: timestamp, lastOpenedAt: timestamp }));
    transaction.objectStore("sequences").put({ id: "surface-sequence", projectId: id, name: "UI Sequence", items, segments: [], readingUnits, currentVersionId: "surface-version", revision: 0, createdAt: timestamp, updatedAt: timestamp });
    transaction.objectStore("versions").put({ id: "surface-version", projectId: id, sequenceId: "surface-sequence", name: "Initial", itemCount: 1, items, segments: [], readingUnits, createdAt: timestamp });
    transaction.objectStore("layouts").put({ schemaVersion: 1, id: "surface-layout", projectId: id, sequenceId: "surface-sequence", name: "UI Layout", pageSpec: { widthPt: 600, heightPt: 840 },
      pages: [{ id: "surface-page", objects: [] }], revision: 0, createdAt: timestamp, updatedAt: timestamp });
    await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
    db.close();
  }, projectId);
  await page.goto(`/#/projects/${projectId}/table`);
  await page.getByRole("button", { name: "Frame templates" }).click();
  await page.getByRole("button", { name: /^Instax/ }).click();
  await page.getByRole("button", { name: /Instax mini/ }).click();
  const sidebar = page.locator(".table-frame-settings");
  const expectFlush = async () => {
    await expect(sidebar).toHaveCSS("margin", "0px");
    await expect(sidebar).toHaveCSS("border-radius", "0px");
    await expect(sidebar).toHaveCSS("box-shadow", "none");
    await expect(sidebar).toHaveCSS("border-top-width", "0px");
    await expect(sidebar).toHaveCSS("border-left-width", "1px");
  };
  await expectFlush();
  await page.evaluate((hash) => { window.location.hash = hash; }, `#/projects/${projectId}/sequences/surface-sequence/layout/surface-layout`);
  await expect(page.locator(".layout-workspace")).toBeVisible();
  await page.evaluate((hash) => { window.location.hash = hash; }, `#/projects/${projectId}/table`);
  await page.locator(".table-frame-title").click();
  await expectFlush();
  await page.getByRole("button", { name: "Back to Home" }).click();
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await page.evaluate((hash) => { window.location.hash = hash; }, `#/projects/${projectId}/table`);
  await page.locator(".table-frame-title").click();
  const settings = page.getByRole("complementary", { name: "画框设置", exact: true });
  await expect(settings.locator(".table-frame-panel-header strong")).toHaveText("画框设置");
  await expect(settings.getByRole("button", { name: "添加照片框", exact: true })).toBeVisible();
  await expect(settings.getByRole("button", { name: "恢复模板尺寸", exact: true })).toBeVisible();
  await settings.getByRole("button", { name: "纸张颜色", exact: true }).click();
  await expect(settings.getByRole("option", { name: "纯白", exact: true })).toBeVisible();
  await settings.getByRole("option", { name: "纯白", exact: true }).click();
  await settings.getByLabel("模板类型").selectOption("frames");
  await expect(settings.getByLabel("边框材质")).toContainText("木纹");
  await expect(settings.getByLabel("画框说明文字")).toHaveAttribute("placeholder", "地点、日期…");
  await expect(settings.getByRole("button", { name: "导出 JPEG", exact: true })).toBeVisible();
  await expect(settings.locator("h3")).toHaveText(["模板 1 个照片框", "页面尺寸", "照片框 1", "纸张", "外边框", "内边框 照片边缘", "图像适配 所有照片框", "说明文字", "导出"]);
  await page.locator("[data-frame-slot-id]").click();
  await expect(settings.getByRole("slider", { name: "圆角半径", exact: true })).toBeVisible();
  await expect(settings.getByRole("button", { name: "移除照片框", exact: true })).toBeVisible();
  const colors = await settings.locator(".table-frame-add-box, .table-frame-panel-header, .table-frame-hint, .table-frame-section h3, select, textarea").evaluateAll((nodes) => nodes.flatMap((node) => {
    const style = getComputedStyle(node); return [style.color, style.backgroundColor, style.borderTopColor];
  }));
  for (const color of colors) {
    const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(Number);
    expect(channels[0]).toBe(channels[1]); expect(channels[1]).toBe(channels[2]);
  }
  await expectFlush();
  await page.screenshot({ path: testInfo.outputPath("frame-settings-zh.png") });
  await settings.getByLabel("模板类型").scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("frame-settings-zh-top.png") });
  await page.reload();
  await page.locator(".table-frame-title").click();
  await expect(settings.locator(".table-frame-panel-header strong")).toHaveText("画框设置");
  await expectFlush();
});

test("Home account menu stays above gallery photos", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  // Supply a signed-in local fixture through the application's dependency seam.
  await page.route("**/src/app/dependencies.ts", async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace("export function createBrowserDependencies()", "function createBrowserDependenciesBase()");
    await route.fulfill({ response, body: `${body}\nexport function createBrowserDependencies() { return { ...createBrowserDependenciesBase(), accountWorkspaces: undefined, accountSession: {
      getCurrentUser: async () => ({ ok: true, value: { id: "ui-account", email: "photo@example.com" } }), subscribe: () => () => {}, signOut: async () => ({ ok: true, value: undefined })
    } }; }` });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your Projects", exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const fixtureModule = "/tests/helpers/browserProjectFixture.ts";
    const { createBrowserWorkspace } = await import(/* @vite-ignore */ fixtureModule);
    const request = indexedDB.open("photoflex-mvp");
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const projectId = "home-menu-project", timestamp = new Date().toISOString();
    const transaction = db.transaction(["projects", "photo-index", "photo-thumbnails"], "readwrite");
    const placements: Record<string, unknown> = {}, entryOrder: string[] = [];
    for (let i = 0; i < 21; i++) {
      const photoId = `home-photo-${i}`, relativePath = `Home_${i}.jpg`; entryOrder.push(photoId);
      placements[photoId] = { id: photoId, photoId, filename: relativePath, x: i * 100, y: 100, z: i, width: 100, height: 150 };
      transaction.objectStore("photo-index").put({ id: photoId, sourceId: "home-source", relativePath, width: 800, height: 1200 });
      const blob = new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200"><rect width="800" height="1200" fill="#777"/></svg>'], { type: "image/svg+xml" });
      transaction.objectStore("photo-thumbnails").put({ photoId, maxEdge: 512, sourceVersion: `${relativePath}|800|1200|unknown-size|unknown-mtime|unknown-fingerprint`, blob });
    }
    transaction.objectStore("projects").put(createBrowserWorkspace({ projectId, name: "Home Menu", memo: "", expectedPhotoCount: null, sources: [], photoStates: {},
      worktableDraft: { projectId, placements, entryOrder, groups: [], links: [], pileOrder: [], pilePlacements: {}, frameOrder: [], frames: {} },
      sequenceIds: [], versionIds: [], layoutIds: [], revision: 0, createdAt: timestamp, updatedAt: timestamp, lastOpenedAt: timestamp }));
    await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
    db.close();
  });
  await page.reload();
  await expect(page.locator(".home-gallery img").first()).toBeVisible();
  await page.getByRole("button", { name: "PhotoFlex account", exact: true }).click();
  const menu = page.locator(".table-account-popover");
  await expect(menu.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
  const overlay = await menu.evaluate((node) => {
    const box = node.getBoundingClientRect();
    const overlapsPhoto = [...document.querySelectorAll(".home-gallery img")].some((photo) => {
      const bounds = photo.getBoundingClientRect();
      return bounds.left < box.right && bounds.right > box.left && bounds.top < box.bottom && bounds.bottom > box.top;
    });
    const isOnTop = [[.2, .5], [.8, .5], [.5, .8]].every(([x, y]) => node.contains(document.elementFromPoint(box.left + box.width * x, box.top + box.height * y)));
    return { overlapsPhoto, isOnTop };
  });
  expect(overlay).toEqual({ overlapsPhoto: true, isOnTop: true });
  await page.screenshot({ path: testInfo.outputPath("home-account-menu.png") });
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
});
