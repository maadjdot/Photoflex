import { expect, test } from "@playwright/test";

test("M2 Sequence supports Reading Units, Segment, Overview, Read and one-save drag", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.goto("/");
  await expect(page.getByText("Begin with a body of work.")).toBeVisible();
  await page.evaluate(async () => {
    const request = indexedDB.open("photoflex-mvp");
    const database = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const projectId = "sequence-visual-project", sequenceId = "sequence-visual", versionId = "version-sequence-visual";
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
    transaction.objectStore("projects").put({ schemaVersion: 6, projectId, name: "Sequence Visual", memo: "", expectedPhotoCount: null, sources: [], photoStates: {}, worktableDraft: { projectId, entryOrder: [], placements: {}, groups: [], links: [], pileOrder: [sequenceId], pilePlacements: { [sequenceId]: { sequenceId, x: 40, y: 40, z: 1, width: 190, height: 118 } } }, sequenceIds: [sequenceId], versionIds: [versionId], revision: 0, createdAt, updatedAt: createdAt, lastOpenedAt: createdAt });
    transaction.objectStore("sequences").put({ id: sequenceId, projectId, name: "Street Edit", items, segments: [], readingUnits, currentVersionId: versionId, revision: 0, createdAt, updatedAt: createdAt });
    transaction.objectStore("versions").put({ id: versionId, projectId, sequenceId, name: "Initial · Street Edit", itemCount: items.length, items, segments: [], readingUnits, createdAt });
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
  await expect(page.locator(".sequence-card")).toHaveCount(4);

  const deviceScale = await page.evaluate(() => window.devicePixelRatio);
  await page.locator(".sequence-rhythm-stage").hover();
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, 120);
  await page.keyboard.up("Control");
  await expect(page.locator(".sequence-zoom")).toContainText("50%");
  expect(await page.evaluate(() => window.devicePixelRatio)).toBe(deviceScale);

  await page.locator(".sequence-card").nth(0).click();
  await page.locator(".sequence-card").nth(1).click({ modifiers: ["Shift"] });
  await page.getByRole("button", { name: "Create Spread" }).click();
  await page.getByRole("button", { name: "Segment", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Create Segment" })).toBeVisible();
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
});
