import { expect, test } from "@playwright/test";

test("left toolbar matches the reference and keeps its actions, hover, focus and collapse behavior", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your Projects", exact: true })).toBeVisible();
  const projectId = `toolbar-${crypto.randomUUID()}`;
  await page.evaluate(async (id) => {
    const fixtureModule = "/tests/helpers/browserProjectFixture.ts";
    const { createBrowserWorkspace } = await import(/* @vite-ignore */ fixtureModule);
    const photos = await Promise.all([1, 2, 3].map(async (number) => ({
      id: `toolbar-photo-${number}`, blob: await (await fetch(`/tests/fixtures/photos/photo-0${number}.jpg`)).blob(),
    })));
    const request = indexedDB.open("photoflex-mvp");
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const timestamp = new Date().toISOString();
    const tx = db.transaction(["projects", "photo-index", "photo-thumbnails"], "readwrite");
    const placements: Record<string, unknown> = {};
    for (const [index, photo] of photos.entries()) {
      const relativePath = `Photo_${index + 1}.jpg`;
      placements[photo.id] = { id: photo.id, photoId: photo.id, filename: relativePath, x: 100 + index * 230, y: 100 + index * 20, width: 200, height: 150, z: index };
      tx.objectStore("photo-index").put({ id: photo.id, sourceId: "toolbar-source", relativePath, width: 800, height: 600 });
      tx.objectStore("photo-thumbnails").put({ photoId: photo.id, maxEdge: 512, sourceVersion: `${relativePath}|800|600|unknown-size|unknown-mtime|unknown-fingerprint`, blob: photo.blob });
    }
    tx.objectStore("projects").put(createBrowserWorkspace({ projectId: id, name: "Photoflex Toolbar", createdAt: timestamp,
      worktableDraft: { projectId: id, placements, entryOrder: photos.map((photo) => photo.id), groups: [], links: [], pileOrder: [], pilePlacements: {} },
      resumeContext: { page: "table", filter: "all", tableViewport: { originX: 0, originY: 0, zoom: 1 } },
    }));
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    db.close();
  }, projectId);
  await page.goto(`/#/projects/${projectId}/table`);
  const stage = page.getByLabel("Photo worktable"), rail = page.locator(".table-tools-rail");
  await expect(stage).toBeVisible();
  await expect(rail).toHaveCSS("width", "56px");
  const railBox = (await rail.boundingBox())!, stageBox = (await stage.boundingBox())!;
  expect(railBox.y).toBe(stageBox.y);
  expect(railBox.height).toBe(stageBox.height);
  expect(stageBox.x).toBe(railBox.x + 56);
  await expect(rail.locator(".table-rail-icon")).toHaveCount(10);
  await expect(rail.getByRole("button", { name: "Grid", exact: true })).toBeDisabled();
  await expect(rail.locator(".table-rail-button").first()).toHaveCSS("width", "40px");
  await expect(rail.locator(".table-rail-icon").first()).toHaveAttribute("width", "20");
  const undo = rail.getByRole("button", { name: "Undo", exact: true });
  const redo = rail.getByRole("button", { name: "Redo", exact: true });
  expect((await redo.boundingBox())!.y + 40).toBe(railBox.y + railBox.height - 12);
  await expect(undo).toBeDisabled();

  const memo = rail.getByRole("button", { name: "Add memo", exact: true });
  await memo.hover();
  await expect(memo).toHaveCSS("background-color", "rgb(244, 244, 245)");
  await expect(page.getByRole("tooltip", { name: "Memo M", exact: true })).toBeVisible();
  await page.screenshot({ path: `design-output/improve-ui/table-left-toolbar-hover-${testInfo.project.name}.png` });
  await page.mouse.move(800, 600);
  await memo.focus();
  await expect(page.getByRole("tooltip", { name: "Memo M", exact: true })).toBeVisible();

  const link = rail.getByRole("button", { name: "Draw line", exact: true });
  await link.click();
  await expect(link).toHaveAttribute("aria-pressed", "true");
  await expect(link).toHaveCSS("background-color", "rgb(228, 228, 231)");
  await expect(stage).toHaveCSS("cursor", "crosshair");
  await stage.press("Escape");
  await expect(link).toHaveAttribute("aria-pressed", "false");
  await stage.click({ position: { x: 800, y: 500 } });
  await stage.press("Control+a");
  const grid = rail.getByRole("button", { name: "Grid", exact: true });
  await expect(grid).toBeEnabled();
  await grid.click();
  await expect(page.getByRole("dialog", { name: "Grid layout", exact: true })).toBeVisible();
  await expect(grid).toHaveCSS("background-color", "rgb(228, 228, 231)");
  await page.getByRole("button", { name: "2 per row", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Grid layout", exact: true })).toHaveCount(0);
  await rail.getByRole("button", { name: "Row", exact: true }).click();
  await expect(rail.getByRole("button", { name: "Row", exact: true })).toHaveCSS("background-color", "rgb(228, 228, 231)");
  await rail.getByRole("combobox", { name: "Align", exact: true }).selectOption("top");
  await rail.getByRole("button", { name: "Group selection", exact: true }).click();
  await expect(page.locator(".worktable-group-frame")).toHaveCount(1);
  await undo.click();
  await expect(page.locator(".worktable-group-frame")).toHaveCount(0);
  await redo.click();
  await expect(page.locator(".worktable-group-frame")).toHaveCount(1);
  await page.mouse.move(800, 600);
  await stage.focus();
  await page.screenshot({ path: `design-output/improve-ui/table-left-toolbar-${testInfo.project.name}.png` });

  await memo.click();
  await expect(page.getByRole("textbox", { name: "Memo text", exact: true })).toBeVisible();
  const fontSize = page.getByRole("spinbutton", { name: "Memo font size", exact: true });
  await fontSize.fill("24");
  await expect(fontSize).toHaveValue("24");
  await stage.click({ position: { x: 800, y: 500 } });
  await expect(fontSize).toHaveCount(0);

  await rail.getByRole("button", { name: "Frame templates", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Frame templates", exact: true })).toBeVisible();
  const hide = page.locator("header").getByRole("button", { name: "Hide left toolbar", exact: true });
  await hide.click();
  await expect(rail).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Frame templates", exact: true })).toHaveCount(0);
  expect((await stage.boundingBox())!.x).toBe(railBox.x);
  await page.reload();
  await expect(rail).toHaveCount(0);
  await page.locator("header").getByRole("button", { name: "Show left toolbar", exact: true }).click();
  await expect(rail).toBeVisible();
  await page.setViewportSize({ width: 760, height: 540 });
  const smallRail = (await rail.boundingBox())!, smallRedo = (await redo.boundingBox())!;
  expect(smallRedo.y + smallRedo.height).toBeLessThanOrEqual(smallRail.y + smallRail.height);
  await expect(rail.getByRole("button", { name: "Frame templates", exact: true })).toBeVisible();
});
