import { expect, test } from "@playwright/test";

test("M2 Sequence supports Reading Units, Segment, Overview, Read and one-save drag", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.goto("/");
  await expect(page.getByText("Begin your photo journey")).toBeVisible();
  await page.evaluate(async () => {
    const request = indexedDB.open("photoflex-mvp");
    const database = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const projectId = "sequence-visual-project", sequenceId = "sequence-visual", compareSequenceId = "sequence-compare", versionId = "version-sequence-visual", compareVersionId = "version-sequence-compare";
    const createdAt = "2026-09-01T06:00:00.000Z";
    const photos = [
      { id: "sequence-photo-1", width: 1200, height: 800 },
      { id: "sequence-photo-2", width: 800, height: 1200 },
      { id: "sequence-photo-3", width: 1200, height: 800 },
      { id: "sequence-photo-4", width: 1200, height: 800 },
    ];
    const items = photos.map((photo, index) => ({ id: `sequence-item-${index + 1}`, kind: "photo", photoId: photo.id }));
    const readingUnits = items.map((item, index) => ({ id: `sequence-unit-${index + 1}`, kind: "single", itemId: item.id }));
    const transaction = database.transaction(["projects", "sequences", "versions", "photo-index", "photo-thumbnails"], "readwrite");
    transaction.objectStore("projects").put({ schemaVersion: 7, projectId, name: "Sequence Visual", memo: "", expectedPhotoCount: null, sources: [], photoStates: {}, worktableDraft: { projectId, entryOrder: [], placements: {}, groups: [], links: [], pileOrder: [sequenceId, compareSequenceId], pilePlacements: { [sequenceId]: { sequenceId, x: 40, y: 40, z: 1, width: 190, height: 118 }, [compareSequenceId]: { sequenceId: compareSequenceId, x: 260, y: 40, z: 2, width: 190, height: 118 } } }, sequenceIds: [sequenceId, compareSequenceId], versionIds: [versionId, compareVersionId], revision: 0, createdAt, updatedAt: createdAt, lastOpenedAt: createdAt });
    transaction.objectStore("sequences").put({ id: sequenceId, projectId, name: "Street Edit", items, segments: [], readingUnits, currentVersionId: versionId, revision: 0, createdAt, updatedAt: createdAt });
    transaction.objectStore("sequences").put({ id: compareSequenceId, projectId, name: "Alternate Edit", items: [...items].reverse(), segments: [], readingUnits: [...readingUnits].reverse(), currentVersionId: compareVersionId, revision: 0, createdAt, updatedAt: createdAt });
    transaction.objectStore("versions").put({ id: versionId, projectId, sequenceId, name: "Initial · Street Edit", itemCount: items.length, items, segments: [], readingUnits, createdAt });
    transaction.objectStore("versions").put({ id: compareVersionId, projectId, sequenceId: compareSequenceId, name: "Initial · Alternate Edit", itemCount: items.length, items: [...items].reverse(), segments: [], readingUnits: [...readingUnits].reverse(), createdAt });
    for (const [index, photo] of photos.entries()) {
      transaction.objectStore("photo-index").put({ ...photo, sourceId: "missing-source", relativePath: `SEQ_${index + 1}.jpg` });
      const hue = 34 + index * 62;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${photo.width}" height="${photo.height}"><rect width="100%" height="100%" fill="hsl(${hue} 18% 76%)"/><path d="M0 ${photo.height} L${photo.width * .35} ${photo.height * .35} L${photo.width * .62} ${photo.height * .72} L${photo.width} ${photo.height * .22} V${photo.height}Z" fill="hsl(${hue} 18% 34%)"/></svg>`;
      transaction.objectStore("photo-thumbnails").put({ photoId: photo.id, blob: new Blob([svg], { type: "image/svg+xml" }) });
    }
    await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error); });
    database.close();
  });

  await page.goto("/#/projects/sequence-visual-project/sequences/sequence-visual");
  await expect(page.getByRole("button", { name: "Sequence", exact: true })).toHaveClass(/is-active/);
  await expect(page.locator(".topbar")).toHaveClass(/is-table/);
  await expect(page.locator(".project-context-name")).toHaveText("Sequence Visual");
  await expect(page.getByRole("button", { name: "Undo" })).toHaveClass(/table-tool-button/);
  await expect(page.getByRole("button", { name: "Collapse Sequence Order" })).toBeVisible();
  await expect(page.locator(".sequence-card")).toHaveCount(4);
  await expect(page.locator(".sequence-order-image > :first-child").first()).toBeVisible();
  expect(await page.locator(".sequence-order-image > :first-child").first().evaluate((image) => getComputedStyle(image).objectFit)).toBe("cover");
  expect(await page.locator(".sequence-order-badge", { hasText: "SINGLE" }).count()).toBe(0);

  await page.getByRole("button", { name: "Compare", exact: true }).click();
  const compareDialog = page.getByRole("dialog", { name: "Compare Sequences" });
  await expect(compareDialog).toBeVisible();
  expect(await compareDialog.evaluate((dialog) => getComputedStyle(dialog).borderRadius)).toBe("8px");
  await expect(compareDialog.locator(".version-list > div")).toHaveCount(2);
  await compareDialog.getByRole("button", { name: "Close" }).click();

  await page.locator(".sequence-card").first().click();
  await page.getByRole("button", { name: "Insert Blank After" }).click();
  const blank = page.locator(".sequence-card .sequence-blank-page").first();
  await expect(blank).toBeVisible();
  expect(await blank.evaluate((element) => ({ background: getComputedStyle(element).backgroundColor, border: getComputedStyle(element).borderStyle }))).toEqual({ background: "rgb(255, 255, 255)", border: "solid" });
  await blank.locator("..").click();
  await page.getByRole("button", { name: "Remove Blank" }).click();
  await expect(page.locator(".sequence-card")).toHaveCount(4);

  const deviceScale = await page.evaluate(() => window.devicePixelRatio);
  await page.locator(".sequence-rhythm-stage").hover();
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, 120);
  await page.keyboard.up("Control");
  await expect(page.locator(".sequence-zoom")).toContainText("100%");
  expect(await page.evaluate(() => window.devicePixelRatio)).toBe(deviceScale);

  await page.locator(".sequence-card").nth(0).click();
  await page.locator(".sequence-card").nth(1).click({ modifiers: ["Shift"] });
  await page.getByRole("button", { name: "Create Spread" }).click();
  await page.getByRole("button", { name: "Segment", exact: true }).click();
  const segmentDialog = page.getByRole("dialog", { name: "Create Segment" });
  await expect(segmentDialog).toBeVisible();
  expect(await segmentDialog.evaluate((dialog) => getComputedStyle(dialog).borderRadius)).toBe("8px");
  await page.getByLabel("Segment name").fill("Opening");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.locator(".sequence-segment-header").getByText("Opening")).toBeVisible();

  await page.getByRole("button", { name: "Overview Grid" }).click();
  await expect(page.locator(".sequence-overview [role=gridcell]")).toHaveCount(4);
  await page.getByRole("button", { name: "Overview Grid" }).click();

  await page.getByRole("button", { name: "Read", exact: true }).click();
  await expect(page.locator(".sequence-read")).toBeVisible();
  await expect(page.locator(".sequence-read-page")).toHaveCount(2);
  await page.getByRole("button", { name: "Close" }).click();

  const beforeRevision = await page.evaluate(async () => { const request = indexedDB.open("photoflex-mvp"); const db = await new Promise<IDBDatabase>((resolve) => { request.onsuccess = () => resolve(request.result); }); const row = await new Promise<Record<string, unknown>>((resolve) => { const get = db.transaction("sequences", "readonly").objectStore("sequences").get("sequence-visual"); get.onsuccess = () => resolve(get.result); }); db.close(); return Number(row.revision); });
  const first = await page.locator(".sequence-order-item").nth(0).boundingBox();
  const last = await page.locator(".sequence-order-item").nth(3).boundingBox();
  if (!first || !last) throw new Error("Sequence Order is not visible");
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(last.x + last.width, last.y + last.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => page.evaluate(async () => { const request = indexedDB.open("photoflex-mvp"); const db = await new Promise<IDBDatabase>((resolve) => { request.onsuccess = () => resolve(request.result); }); const row = await new Promise<Record<string, unknown>>((resolve) => { const get = db.transaction("sequences", "readonly").objectStore("sequences").get("sequence-visual"); get.onsuccess = () => resolve(get.result); }); db.close(); return Number(row.revision); })).toBe(beforeRevision + 1);

  await page.getByRole("button", { name: "Table", exact: true }).click();
  await expect(page.locator(".sequence-strip-item > :first-child").first()).toBeVisible();
  expect(await page.locator(".sequence-strip-item > :first-child").first().evaluate((image) => getComputedStyle(image).objectFit)).toBe("cover");
});
