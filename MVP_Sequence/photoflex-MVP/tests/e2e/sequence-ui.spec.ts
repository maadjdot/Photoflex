import { expect, test, type Page } from "@playwright/test";

const PROJECT_ID = "sequence-visual-project";
const SEQUENCE_ID = "sequence-visual";

test("Sequence opens over Table as a clean grid and reads uncropped photos", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await seedSequence(page);

  await page.goto(`/#/projects/${PROJECT_ID}/sequences/${SEQUENCE_ID}`);
  const overlay = page.getByRole("dialog", { name: "Sequence Street Edit" });
  const grid = page.getByRole("grid", { name: "Sequence photo order" });
  const cards = grid.getByRole("gridcell");

  await expect(overlay).toBeVisible();
  await expect(page.locator(".table-page")).toHaveCount(1);
  await expect(cards).toHaveCount(8);
  await expect(page.getByRole("button", { name: "Read", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export PDF" })).toHaveCount(0);
  expect(await overlay.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(242, 242, 242)");
  expect(await cards.first().evaluate((element) => getComputedStyle(element).borderRadius)).toBe("0px");
  expect(await cards.first().locator("img").evaluate((element) => getComputedStyle(element).objectFit)).toBe("contain");
  expect(await cards.first().evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(242, 242, 242)");
  const landscapeWidth = (await cards.nth(0).locator("img").boundingBox())!.width;
  const portraitWidth = (await cards.nth(1).locator("img").boundingBox())!.width;
  expect(landscapeWidth).toBeGreaterThan(portraitWidth);

  const firstRowTop = (await cards.nth(0).boundingBox())!.y;
  const firstColumnX = (await cards.nth(0).boundingBox())!.x;
  const secondRowFirstColumn = await cards.nth(5).boundingBox();
  const secondRowTop = secondRowFirstColumn!.y;
  expect(secondRowTop).toBeGreaterThan(firstRowTop + 200);
  expect(secondRowFirstColumn!.x).toBeCloseTo(firstColumnX, 0);
  await page.screenshot({ path: "design-output/Sequence/sequence-overlay-grid-1440.png", fullPage: true });

  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(cards).toHaveCount(8);
  await page.screenshot({ path: "design-output/Sequence/sequence-overlay-grid-1280.png", fullPage: true });

  await cards.nth(1).click();
  const preview = page.getByRole("dialog", { name: "Preview photo 2" });
  await expect(preview).toBeVisible();
  await expect(page.locator(".sequence-read")).toHaveCount(0);
  const previewMedia = await preview.locator(".sequence-photo-preview-media").boundingBox();
  const previewImage = await preview.getByAltText("Sequence photograph 2").boundingBox();
  expect(previewImage!.x).toBeGreaterThanOrEqual(previewMedia!.x - 1);
  expect(previewImage!.y).toBeGreaterThanOrEqual(previewMedia!.y - 1);
  expect(previewImage!.x + previewImage!.width).toBeLessThanOrEqual(previewMedia!.x + previewMedia!.width + 1);
  expect(previewImage!.y + previewImage!.height).toBeLessThanOrEqual(previewMedia!.y + previewMedia!.height + 1);
  await preview.locator(".sequence-photo-preview-media").hover({ position: { x: previewMedia!.width * .75, y: previewMedia!.height / 2 } });
  await page.mouse.wheel(0, -Math.log(1.25) / .0015);
  await expect(preview.getByRole("button", { name: "Reset zoom" })).toHaveText("125%");
  await expect(preview.locator(".sequence-photo-preview-media")).toHaveCSS("cursor", "grab");
  await expect(preview.locator(".sequence-photo-preview-media")).toHaveCSS("overflow", "hidden");
  const transformBeforeDrag = await preview.locator(".sequence-photo-preview-image").evaluate((element) => (element as HTMLElement).style.transform);
  await page.mouse.move(previewMedia!.x + previewMedia!.width * .75, previewMedia!.y + previewMedia!.height / 2);
  await page.mouse.down();
  await expect(preview.locator(".sequence-photo-preview-media")).toHaveCSS("cursor", "grabbing");
  await page.mouse.move(previewMedia!.x + previewMedia!.width * .75 + 60, previewMedia!.y + previewMedia!.height / 2 + 30);
  await page.mouse.up();
  await expect.poll(() => preview.locator(".sequence-photo-preview-image").evaluate((element) => (element as HTMLElement).style.transform)).not.toBe(transformBeforeDrag);
  await preview.getByRole("button", { name: "Rotate right" }).click();
  await expect(preview.locator(".sequence-photo-preview-image")).toHaveAttribute("data-rotation", "90");
  await preview.getByRole("button", { name: "Reset zoom" }).click();
  await expect(preview.getByRole("button", { name: "Reset zoom" })).toHaveText("100%");
  await preview.getByRole("button", { name: "Close" }).click();
  await expect(preview).toHaveCount(0);

  await page.getByRole("button", { name: "Read", exact: true }).click();
  const read = page.locator(".sequence-read");
  const track = page.locator(".sequence-read-track");
  await expect(read).toBeVisible();
  await expect(read.locator(".sequence-read-navigation output")).toHaveText("01 / 08");
  expect(await read.locator(".sequence-read-photo img").first().evaluate((element) => getComputedStyle(element).objectFit)).toBe("contain");
  const readFrame = await read.locator(".sequence-read-photo").nth(0).boundingBox();
  expect(readFrame!.width).toBeLessThan(1280 * .5);
  expect(readFrame!.height).toBeLessThan(720 * .75);
  await page.getByRole("button", { name: "Next photo" }).click();
  await expect(read.locator(".sequence-read-navigation output")).toHaveText("02 / 08");
  const portraitFrame = await read.locator(".sequence-read-photo").nth(1).boundingBox();
  const portraitImage = await read.getByAltText("Sequence reading photograph 2").boundingBox();
  expect(portraitImage!.y).toBeGreaterThanOrEqual(portraitFrame!.y - 1);
  expect(portraitImage!.y + portraitImage!.height).toBeLessThanOrEqual(portraitFrame!.y + portraitFrame!.height + 1);
  await page.screenshot({ path: "design-output/Sequence/sequence-read-1280.png", fullPage: true });

  const scrollBefore = await track.evaluate((element) => element.scrollLeft);
  await track.hover();
  await page.mouse.wheel(0, 260);
  await expect.poll(() => track.evaluate((element) => element.scrollLeft)).toBeGreaterThan(scrollBefore);
  await page.getByRole("button", { name: "Next photo" }).click();
  await expect(read.locator(".sequence-read-navigation output")).toContainText("/");
  await page.keyboard.press("Escape");
  await expect(read).toHaveCount(0);
  await expect(grid).toBeVisible();

  const beforeRevision = await sequenceRevision(page);
  const first = await cards.nth(0).boundingBox();
  const last = await cards.nth(7).boundingBox();
  if (!first || !last) throw new Error("Sequence grid is not visible");
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(last.x + last.width * .8, last.y + last.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => sequenceRevision(page)).toBe(beforeRevision + 1);

  await page.getByRole("button", { name: "Close Sequence" }).click();
  await expect(overlay).toHaveCount(0);
  await expect(page.locator(".table-page")).toBeVisible();
  const pile = page.getByRole("article", { name: "Sequence pile Street Edit" });
  await expect(pile).toBeVisible();
  await expect(page.getByRole("region", { name: "Sequence Order" })).toHaveCount(0);
  const pileThumbs = pile.locator(".sequence-pile-thumbs > span");
  await expect(pileThumbs).toHaveCount(6);
  expect(await pileThumbs.first().locator("img").evaluate((element) => getComputedStyle(element).objectFit)).toBe("cover");
  const thumbWidths = await pileThumbs.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().width));
  expect(Math.max(...thumbWidths) - Math.min(...thumbWidths)).toBeLessThan(1);
  const originalPileWidth = (await pile.boundingBox())!.width;
  await pile.hover();
  const resizeHandle = pile.getByRole("button", { name: "Resize sequence pile" });
  await expect(resizeHandle).toBeVisible();
  const handleBox = await resizeHandle.boundingBox();
  if (!handleBox) throw new Error("Sequence resize handle is not visible");
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 70, handleBox.y + handleBox.height / 2 + 32, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await pile.boundingBox())!.width).toBeGreaterThan(originalPileWidth);
  await expect(overlay).toHaveCount(0);
  await page.screenshot({ path: "design-output/Sequence/sequence-table-card-enlarged.png", fullPage: true });
  await page.screenshot({ path: "design-output/Sequence/sequence-table-card.png", fullPage: true });
});

test("Layout opens from Sequence and keeps page order at 1280 and 1440", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await seedSequence(page);
  await page.goto(`/#/projects/${PROJECT_ID}/sequences/${SEQUENCE_ID}`);
  await page.getByRole("dialog", { name: "Sequence Street Edit" }).getByRole("button", { name: "Layout" }).click();
  const creator = page.getByRole("dialog", { name: "Create Layout" });
  await expect(creator).toBeVisible();
  await expect(creator).toContainText("From Sequence (8 pages)");
  await creator.getByRole("button", { name: "Create Layout" }).click();
  const layout = page.getByRole("main", { name: "Layout workspace" });
  await expect(layout).toBeVisible();
  await expect(layout.getByRole("status")).toContainText("Saved locally");
  const route = new URL(page.url()).hash;
  expect(route).toMatch(/\/layout\//);
  const initialSize = await layout.locator(".layout-paper").first().boundingBox();
  expect(initialSize!.height / initialSize!.width).toBeCloseTo(297 / 210, 1);
  await layout.getByRole("button", { name: "+ Blank page" }).click();
  await expect(layout.locator(".layout-pages-list button")).toHaveCount(9);
  await layout.getByRole("button", { name: "Move earlier" }).click();
  await layout.getByRole("button", { name: "Single" }).click();
  await expect(layout.locator(".layout-paper")).toHaveCount(1);
  await page.setViewportSize({ width: 1280, height: 720 });
  for (const name of ["+ Blank page", "Duplicate", "Delete", "Move earlier", "Move later", "Single", "Facing pages"]) {
    const control = layout.getByRole("button", { name });
    await expect(control).toBeVisible();
    const bounds = await control.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(1280);
  }
  await page.reload();
  await expect(layout.locator(".layout-pages-list button")).toHaveCount(9);
  await expect(layout.getByRole("status")).toContainText("Saved locally");
  await layout.getByRole("button", { name: "← Sequence" }).click();
  await expect(page.getByRole("dialog", { name: "Sequence Street Edit" })).toBeVisible();
  await page.getByRole("dialog", { name: "Sequence Street Edit" }).getByRole("button", { name: "Layout" }).click();
  await expect(layout).toBeVisible();
  expect(new URL(page.url()).hash).toBe(route);
});

async function seedSequence(page: Page) {
  await page.evaluate(async ({ projectId, sequenceId }) => {
    const request = indexedDB.open("photoflex-mvp");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const versionId = "version-sequence-visual";
    const createdAt = "2026-09-01T06:00:00.000Z";
    const photos = Array.from({ length: 8 }, (_, index) => ({
      id: `sequence-photo-${index + 1}`,
      width: index % 2 === 0 ? 1400 : 800,
      height: index % 2 === 0 ? 800 : 1280,
    }));
    const items = photos.map((photo, index) => ({ id: `sequence-item-${index + 1}`, kind: "photo", photoId: photo.id }));
    const readingUnits = items.map((item, index) => ({ id: `sequence-unit-${index + 1}`, kind: "single", itemId: item.id }));
    const transaction = database.transaction(["projects", "sequences", "versions", "photo-index", "photo-thumbnails", "photo-derived-previews"], "readwrite");
    transaction.objectStore("projects").put({
      schemaVersion: 10, projectId, name: "Sequence Visual", memo: "", expectedPhotoCount: null, sources: [], photoStates: {},
      worktableDraft: { projectId, entryOrder: [], placements: {}, groups: [], links: [], pileOrder: [sequenceId], pilePlacements: { [sequenceId]: { sequenceId, x: 120, y: 110, z: 1, width: 402, height: 176 } }, frameOrder: [], frames: {} },
      sequenceIds: [sequenceId], versionIds: [versionId], layoutIds: [], revision: 0, createdAt, updatedAt: createdAt, lastOpenedAt: createdAt,
    });
    transaction.objectStore("sequences").put({ id: sequenceId, projectId, name: "Street Edit", items, segments: [], readingUnits, currentVersionId: versionId, revision: 0, createdAt, updatedAt: createdAt });
    transaction.objectStore("versions").put({ id: versionId, projectId, sequenceId, name: "Initial · Street Edit", itemCount: items.length, items, segments: [], readingUnits, createdAt });
    for (const [index, photo] of photos.entries()) {
      transaction.objectStore("photo-index").put({ ...photo, sourceId: "missing-source", relativePath: `SEQ_${index + 1}.jpg` });
      const hue = 25 + index * 41;
      const markerX = photo.width * .12;
      const markerY = photo.height * .16;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${photo.width}" height="${photo.height}"><rect width="100%" height="100%" fill="hsl(${hue} 22% 78%)"/><path d="M0 ${photo.height} L${photo.width * .32} ${photo.height * .35} L${photo.width * .63} ${photo.height * .7} L${photo.width} ${photo.height * .2} V${photo.height}Z" fill="hsl(${hue} 25% 34%)"/><circle cx="${markerX}" cy="${markerY}" r="${Math.min(photo.width, photo.height) * .06}" fill="#fff"/></svg>`;
      const blob = new Blob([svg], { type: "image/svg+xml" });
      const sourceVersion = `SEQ_${index + 1}.jpg|${photo.width}|${photo.height}|unknown-size|unknown-mtime|unknown-fingerprint`;
      transaction.objectStore("photo-thumbnails").put({ photoId: photo.id, maxEdge: 512, sourceVersion, blob });
      transaction.objectStore("photo-derived-previews").put({ photoId: photo.id, maxEdge: 768, sourceVersion, blob });
    }
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  }, { projectId: PROJECT_ID, sequenceId: SEQUENCE_ID });
}

async function sequenceRevision(page: Page) {
  return page.evaluate(async (sequenceId) => {
    const request = indexedDB.open("photoflex-mvp");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const row = await new Promise<{ revision: number }>((resolve, reject) => {
      const get = database.transaction("sequences", "readonly").objectStore("sequences").get(sequenceId);
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
    });
    database.close();
    return Number(row.revision);
  }, SEQUENCE_ID);
}
