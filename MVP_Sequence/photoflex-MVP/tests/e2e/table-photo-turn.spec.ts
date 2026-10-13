import { expect, test, type Page } from "@playwright/test";
import type { WorktableDraft } from "../../src/contracts";

async function openTurnPhotoFixture(page: Page, count = 3) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your Projects", exact: true })).toBeVisible();
  const projectId = `turn-photo-${crypto.randomUUID()}`;
  await page.evaluate(async ({ id, count }) => {
    const fixtureModule = "/tests/helpers/browserProjectFixture.ts";
    const { createBrowserWorkspace } = await import(/* @vite-ignore */ fixtureModule);
    const photos = await Promise.all(Array.from({ length: count }, (_, index) => index + 1).map(async (number) => ({
      id: `turn-photo-${number}`, blob: await (await fetch(`/tests/fixtures/photos/photo-0${number}.jpg`)).blob(),
    })));
    const request = indexedDB.open("photoflex-mvp");
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const tx = db.transaction(["projects", "photo-index", "photo-thumbnails"], "readwrite");
    const placements: Record<string, unknown> = {};
    for (const [index, photo] of photos.entries()) {
      const relativePath = `Photo_${index + 1}.jpg`;
      placements[photo.id] = { id: photo.id, photoId: photo.id, filename: relativePath, x: 100 + index % 3 * 270, y: 120 + Math.floor(index / 3) * 210, width: 235, height: 175, z: index };
      tx.objectStore("photo-index").put({ id: photo.id, sourceId: "turn-source", relativePath, width: 800, height: 600 });
      tx.objectStore("photo-thumbnails").put({ photoId: photo.id, maxEdge: 512, sourceVersion: `${relativePath}|800|600|unknown-size|unknown-mtime|unknown-fingerprint`, blob: photo.blob });
    }
    tx.objectStore("projects").put(createBrowserWorkspace({ projectId: id, name: "Turn Photo", createdAt: new Date().toISOString(),
      worktableDraft: { projectId: id, placements, entryOrder: photos.map((photo) => photo.id), groups: [], links: [], pileOrder: [], pilePlacements: {} },
      resumeContext: { page: "table", filter: "all", tableViewport: { originX: 0, originY: 0, zoom: 1 } },
    }));
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    db.close();
    localStorage.setItem("photoflex:locale", "zh-CN");
  }, { id: projectId, count });
  await page.goto(`/#/projects/${projectId}/table`);
  await page.reload();
  return projectId;
}

async function readTurnPhotoDraft(page: Page, projectId: string): Promise<WorktableDraft> {
  return page.evaluate(async (id) => {
    const request = indexedDB.open("photoflex-mvp");
    const db = await new Promise<IDBDatabase>((resolve) => { request.onsuccess = () => resolve(request.result); });
    const project = await new Promise<{ worktableDraft: WorktableDraft }>((resolve) => { const get = db.transaction("projects").objectStore("projects").get(id); get.onsuccess = () => resolve(get.result); });
    db.close();
    return project.worktableDraft;
  }, projectId);
}

test("turn-photo mode flips cards, exits cleanly, and restores saved backs", async ({ page }, testInfo) => {
  const projectId = await openTurnPhotoFixture(page);
  const stage = page.locator(".worktable-stage"), tool = page.getByRole("button", { name: "翻面工具", exact: true });
  const a = page.locator("[data-worktable-photo-id='turn-photo-1']"), b = page.locator("[data-worktable-photo-id='turn-photo-2']");
  await expect(a).toBeVisible();
  await a.click();
  await expect(a).toHaveClass(/is-selected/);
  await tool.click();
  await expect(tool).toHaveAttribute("aria-pressed", "true");
  await expect(stage).toHaveCSS("cursor", /^url\(.+\) 2 2, auto$/);
  await expect(a).not.toHaveClass(/is-selected/);
  await expect(page.locator(".table-context-toolbar")).toHaveCount(0);
  await expect(page.locator(".worktable-turn-photo-hint")).toContainText("点击照片翻转");
  await expect(page.locator(".worktable-turn-photo-hint")).not.toContainText("可连续操作");
  const originalBox = await a.boundingBox();
  await a.click(); await b.click();
  await expect(a).toHaveClass(/is-face-down/);
  await expect(b).toHaveClass(/is-face-down/);
  await expect(tool).toHaveAttribute("aria-pressed", "true");
  await expect(a.locator(".worktable-photo-back")).toHaveCSS("background-color", "rgb(232, 231, 227)");
  await expect(a.locator(".worktable-photo-back")).toHaveText("");
  expect(await a.boundingBox()).toEqual(originalBox);
  await a.click();
  await expect(a).not.toHaveClass(/is-face-down/);
  await stage.press("Control+z");
  await expect(a).toHaveClass(/is-face-down/);
  await stage.press("Control+Shift+z");
  await expect(a).not.toHaveClass(/is-face-down/);
  await a.click();
  await stage.press("Escape");
  await expect(tool).toHaveAttribute("aria-pressed", "false");
  await expect(stage).not.toHaveClass(/is-turning-photos/);
  await a.click();
  await expect(a).toHaveClass(/is-selected/);
  await expect(a).toHaveClass(/is-face-down/);
  await tool.click(); await tool.click();
  await expect(tool).toHaveAttribute("aria-pressed", "false");
  await tool.click();
  await stage.click({ position: { x: 850, y: 450 } });
  await expect(tool).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".worktable-marquee")).toHaveCount(0);
  const line = page.getByRole("button", { name: "绘制连线", exact: true });
  await line.click(); await tool.click();
  await expect(line).toHaveAttribute("aria-pressed", "false");
  await line.click();
  await expect(tool).toHaveAttribute("aria-pressed", "false");
  await stage.press("Escape");
  await expect.poll(async () => Object.values((await readTurnPhotoDraft(page, projectId)).placements).map((item) => Boolean(item.faceDown))).toEqual([true, true, false]);
  await page.reload();
  await expect(a).toHaveClass(/is-face-down/);
  await expect(b).toHaveClass(/is-face-down/);
  await expect(tool).toHaveAttribute("aria-pressed", "false");
  await tool.click();
  await page.screenshot({ path: `design-output/turn-photo/table-turn-photo-${testInfo.project.name}.png`, animations: "disabled" });
});

for (const count of [2, 6]) {
  test(`box selection restores only backs and classifies ${count} photos into two saved grids`, async ({ page }, testInfo) => {
    const projectId = await openTurnPhotoFixture(page, count);
    await page.setViewportSize({ width: 1600, height: 1000 });
    const stage = page.locator(".worktable-stage"), cards = page.locator("[data-worktable-photo-id]");
    const tool = page.getByRole("button", { name: "翻面工具", exact: true });
    await tool.click();
    for (let index = 0; index < count; index += 2) await cards.nth(index).click();
    await stage.press("Escape");
    const stageBox = (await stage.boundingBox())!;
    await page.mouse.move(stageBox.x + 60, stageBox.y + 90);
    await page.mouse.down();
    await page.mouse.move(stageBox.x + 930, stageBox.y + 550, { steps: 5 });
    await page.mouse.up();
    await expect(page.locator(".worktable-card.is-selected")).toHaveCount(count);
    const restore = page.getByRole("button", { name: "翻回正面", exact: true }), filter = page.getByRole("button", { name: "筛选", exact: true });
    await expect(restore).toBeEnabled();
    await expect(filter).toBeEnabled();
    const frontPhotoBox = await cards.nth(1).boundingBox();
    await restore.click();
    await expect(page.locator(".worktable-card.is-face-down")).toHaveCount(0);
    expect(await cards.nth(1).boundingBox()).toEqual(frontPhotoBox);
    await expect(restore).toBeDisabled();
    await expect(filter).toBeDisabled();
    await stage.press("Control+z");
    await expect(page.locator(".worktable-card.is-face-down")).toHaveCount(count / 2);
    await filter.click();
    const groups = page.locator(".worktable-group-frame");
    await expect(groups).toHaveCount(2);
    await expect(groups.nth(0)).toContainText("正面照片");
    await expect(groups.nth(1)).toContainText("背面照片");
    const frontGroupBox = (await groups.nth(0).boundingBox())!, backGroupBox = (await groups.nth(1).boundingBox())!;
    expect(frontGroupBox.x + frontGroupBox.width).toBeLessThan(backGroupBox.x);
    await stage.press("Control+z");
    await expect(groups).toHaveCount(0);
    await expect(page.locator(".worktable-card.is-face-down")).toHaveCount(count / 2);
    await stage.press("Control+Shift+z");
    await expect.poll(async () => (await readTurnPhotoDraft(page, projectId)).groups.map((group) => ({ name: group.name, count: group.photoIds.length }))).toEqual([
      { name: "正面照片", count: count / 2 }, { name: "背面照片", count: count / 2 },
    ]);
    await page.reload();
    await expect(groups).toHaveCount(2);
    await expect(page.locator(".worktable-card.is-face-down")).toHaveCount(count / 2);
    await stage.press("Control+a");
    if (count === 6) await page.screenshot({ path: `design-output/turn-photo/table-photo-classification-${testInfo.project.name}.png`, animations: "disabled" });
    await restore.click();
    await expect(page.locator(".worktable-card.is-face-down")).toHaveCount(0);
    await expect(groups).toHaveCount(2);
  });
}
