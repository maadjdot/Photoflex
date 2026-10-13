import { expect, test } from "@playwright/test";

test("turn-photo mode flips cards, exits cleanly, and restores saved backs", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your Projects", exact: true })).toBeVisible();
  const projectId = `turn-photo-${crypto.randomUUID()}`;
  await page.evaluate(async (id) => {
    const fixtureModule = "/tests/helpers/browserProjectFixture.ts";
    const { createBrowserWorkspace } = await import(/* @vite-ignore */ fixtureModule);
    const photos = await Promise.all([1, 2, 3].map(async (number) => ({
      id: `turn-photo-${number}`, blob: await (await fetch(`/tests/fixtures/photos/photo-0${number}.jpg`)).blob(),
    })));
    const request = indexedDB.open("photoflex-mvp");
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const tx = db.transaction(["projects", "photo-index", "photo-thumbnails"], "readwrite");
    const placements: Record<string, unknown> = {};
    for (const [index, photo] of photos.entries()) {
      const relativePath = `Photo_${index + 1}.jpg`;
      placements[photo.id] = { id: photo.id, photoId: photo.id, filename: relativePath, x: 100 + index * 270, y: 120, width: 235, height: 175, z: index };
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
  }, projectId);
  await page.goto(`/#/projects/${projectId}/table`);
  await page.reload();
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
  await expect.poll(() => page.evaluate(async (id) => {
    const request = indexedDB.open("photoflex-mvp");
    const db = await new Promise<IDBDatabase>((resolve) => { request.onsuccess = () => resolve(request.result); });
    const project = await new Promise<{ worktableDraft: { placements: Record<string, { faceDown?: boolean }> } }>((resolve) => { const get = db.transaction("projects").objectStore("projects").get(id); get.onsuccess = () => resolve(get.result); });
    db.close();
    return [project.worktableDraft.placements["turn-photo-1"].faceDown, project.worktableDraft.placements["turn-photo-2"].faceDown];
  }, projectId)).toEqual([true, true]);
  await page.reload();
  await expect(a).toHaveClass(/is-face-down/);
  await expect(b).toHaveClass(/is-face-down/);
  await expect(tool).toHaveAttribute("aria-pressed", "false");
  await tool.click();
  await page.screenshot({ path: `design-output/turn-photo/table-turn-photo-${testInfo.project.name}.png`, animations: "disabled" });
});
