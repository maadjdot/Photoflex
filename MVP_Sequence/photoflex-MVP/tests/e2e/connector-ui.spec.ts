import { expect, test, type Page } from "@playwright/test";
import { frameTemplateSource } from "../../src/modules/worktable/frameLayout";

async function openTable(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  const projectId = `connector-${crypto.randomUUID()}`;
  await page.evaluate(async ({ id, template }) => {
    const request = indexedDB.open("photoflex-mvp");
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const createdAt = new Date().toISOString(), tx = db.transaction("projects", "readwrite");
    tx.objectStore("projects").put({ schemaVersion: 10, projectId: id, name: "Line Tool", memo: "", expectedPhotoCount: null, sources: [], photoStates: {},
      worktableDraft: { projectId: id, entryOrder: ["photo"], placements: { photo: { id: "photo", photoId: "photo", filename: "photo.jpg", x: 100, y: 100, width: 200, height: 100, z: 2 } },
        groups: [], links: [], pileOrder: [], pilePlacements: {},
        memos: [{ id: "memo", text: "Connected thoughts", x: 500, y: 100, width: 160, height: 100, z: 3, fontSize: 16, photoIds: [] }],
        frameOrder: ["frame"], frames: { frame: { id: "frame", name: "Frame", x: 800, y: 100, z: 0, displayScale: .5, page: { widthPt: 400, heightPt: 600, templateSource: template, slots: [] } } } },
      resumeContext: { page: "table", filter: "all", tableViewport: { originX: 0, originY: 0, zoom: 1 } },
      sequenceIds: [], versionIds: [], layoutIds: [], revision: 0, createdAt, updatedAt: createdAt, lastOpenedAt: createdAt });
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    db.close();
  }, { id: projectId, template: frameTemplateSource("single") });
  await page.goto(`/#/projects/${projectId}/table`);
  await expect(page.getByLabel("Photo worktable")).toBeVisible();
  return projectId;
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const stage = (await page.getByLabel("Photo worktable").boundingBox())!;
  await page.mouse.move(stage.x + from.x, stage.y + from.y);
  await page.mouse.down();
  await page.mouse.move(stage.x + to.x, stage.y + to.y, { steps: 12 });
  await page.mouse.up();
}

test("draws free and bound lines, follows objects, selects/deletes, and restores after reload", async ({ page }, testInfo) => {
  await openTable(page);
  const stage = page.getByLabel("Photo worktable"), lines = page.locator("[data-worktable-connector-id]");
  await page.getByRole("button", { name: "Draw line", exact: true }).click();
  await expect(stage).toHaveCSS("cursor", "crosshair");
  await expect(page.getByLabel("Memo text")).toHaveCSS("cursor", "crosshair");
  await drag(page, { x: 200, y: 150 }, { x: 580, y: 150 });
  await expect(lines).toHaveCount(1);
  await expect(lines.first().locator("line")).toHaveAttribute("x1", "300");
  await expect(lines.first().locator("line")).toHaveAttribute("x2", "500");
  await drag(page, { x: 580, y: 150 }, { x: 900, y: 200 });
  await expect(lines).toHaveCount(2);
  await expect(page.getByLabel("Memo text")).toHaveValue("Connected thoughts");
  await drag(page, { x: 100, y: 400 }, { x: 500, y: 400 });
  await expect(lines).toHaveCount(3);
  await page.keyboard.press("Escape");
  await expect(stage).not.toHaveCSS("cursor", "crosshair");
  await drag(page, { x: 200, y: 150 }, { x: 250, y: 180 });
  await expect(lines.first().locator("line")).toHaveAttribute("x1", "350");
  await expect(lines.first().locator("line")).toHaveAttribute("y1", "180");
  const memoHandle = (await page.getByRole("button", { name: "Move memo", exact: true }).boundingBox())!;
  await page.mouse.move(memoHandle.x + memoHandle.width / 2, memoHandle.y + memoHandle.height / 2); await page.mouse.down();
  await page.mouse.move(memoHandle.x + memoHandle.width / 2 + 30, memoHandle.y + memoHandle.height / 2 + 40, { steps: 8 });
  await expect(lines.first().locator("line")).toHaveAttribute("x2", "530");
  await expect(lines.first().locator("line")).toHaveAttribute("y2", "190");
  await page.mouse.up();
  const frameTitle = (await page.locator(".table-frame-title").boundingBox())!;
  await page.mouse.move(frameTitle.x + 50, frameTitle.y + 5); await page.mouse.down();
  await page.mouse.move(frameTitle.x + 70, frameTitle.y + 35, { steps: 8 });
  await expect(lines.nth(1).locator("line")).toHaveAttribute("x2", "820");
  await page.mouse.up();
  await stage.click({ position: { x: 300, y: 400 } });
  await page.keyboard.press("Delete");
  await expect(lines).toHaveCount(2);
  await page.keyboard.press("Control+z");
  await expect(lines).toHaveCount(3);
  await page.keyboard.press("Control+Shift+z");
  await expect(lines).toHaveCount(2);
  await page.getByRole("button", { name: "Redo", exact: true }).waitFor();
  await expect(page.locator(".table-notice")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("line-tool.png") });
  await page.reload();
  await expect(lines).toHaveCount(2);
  await expect(lines.first().locator("line")).toHaveAttribute("x1", "350");
});

test("shows binding feedback, keeps screen snapping at zoom, and cancels drawings", async ({ page }, testInfo) => {
  await openTable(page);
  const stage = page.getByLabel("Photo worktable"), lines = page.locator("[data-worktable-connector-id]");
  await stage.click({ position: { x: 350, y: 500 } });
  await page.keyboard.press("l");
  const box = (await stage.boundingBox())!;
  await page.mouse.move(box.x + 200, box.y + 150); await page.mouse.down();
  await page.mouse.move(box.x + 580, box.y + 150, { steps: 8 });
  await expect(page.locator(".worktable-connector-target")).toHaveCount(2);
  await expect(page.locator(".worktable-connector-preview line")).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath("line-preview.png") });
  await page.keyboard.press("Escape"); await page.mouse.up();
  await expect(lines).toHaveCount(0);
  await expect(page.locator(".worktable-connector-preview")).toHaveCount(0);
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await page.getByRole("button", { name: "Draw line", exact: true }).click();
  const photo = await page.getByLabel("photo.jpg", { exact: true }).boundingBox(), memo = await page.locator(".table-memo").boundingBox();
  await page.mouse.move(photo!.x + photo!.width / 2, photo!.y + photo!.height / 2); await page.mouse.down();
  // Release just outside the memo's left border, within ten screen pixels.
  await page.mouse.move(memo!.x - 9, memo!.y + memo!.height / 2, { steps: 10 }); await page.mouse.up();
  await expect(lines).toHaveCount(1);
  await expect(lines.first().locator("line")).toHaveAttribute("x2", "500");
});
