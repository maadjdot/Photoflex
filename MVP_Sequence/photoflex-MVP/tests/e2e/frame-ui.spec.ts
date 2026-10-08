import { expect, test, type Locator, type Page } from "@playwright/test";

async function workspace(page: Page, photoCount = 0) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  const projectId = `frame-e2e-${crypto.randomUUID()}`;
  await page.evaluate(async ({ id, count }) => {
    const modulePath = "/tests/helpers/browserProjectFixture.ts";
    const { createBrowserWorkspace } = await import(/* @vite-ignore */ modulePath);
    const request = indexedDB.open("photoflex-mvp");
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const createdAt = new Date().toISOString();
    const sourceId = `source-${id}`;
    const photos: { id: string; handle: FileSystemFileHandle }[] = [];
    for (let index = 0; index < count; index++) {
      const canvas = document.createElement("canvas"); canvas.width = 1200; canvas.height = 900;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#9fb9c5"; ctx.fillRect(0, 0, 1200, 900);
      ctx.fillStyle = "#546653"; ctx.beginPath(); ctx.moveTo(0, 600); ctx.lineTo(430, 280); ctx.lineTo(900, 700); ctx.lineTo(1200, 500); ctx.lineTo(1200, 900); ctx.lineTo(0, 900); ctx.fill();
      ctx.fillStyle = "#c9bd9e"; ctx.beginPath(); ctx.moveTo(420, 900); ctx.lineTo(570, 540); ctx.lineTo(650, 540); ctx.lineTo(920, 900); ctx.fill();
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!), "image/jpeg"));
      const directory = await navigator.storage.getDirectory();
      const handle = await directory.getFileHandle(`${id}-${index}.jpg`, { create: true });
      const writable = await handle.createWritable(); await writable.write(blob); await writable.close();
      photos.push({ id: `photo-${id}-${index}`, handle });
    }
    const transaction = db.transaction(["projects", "photo-index", "photo-file-handles"], "readwrite");
    const placements = Object.fromEntries(photos.map((photo, index) => {
      transaction.objectStore("photo-index").put({ id: photo.id, sourceId, relativePath: `${id}-${index}.jpg`, locationKind: "file-handle", width: 1200, height: 900 });
      transaction.objectStore("photo-file-handles").put({ photoId: photo.id, handle: photo.handle });
      const cardId = `card-${index}`;
      return [cardId, { id: cardId, photoId: photo.id, filename: `Sample ${index + 1}.jpg`, x: 180 + index * 200, y: 150, z: index + 1, width: 180, height: 135 }];
    }));
    transaction.objectStore("projects").put(createBrowserWorkspace({ projectId: id, name: "Frame Settings", memo: "", expectedPhotoCount: null,
      sources: count ? [{ id: sourceId, displayName: "Sample", kind: "external-files", createdAt }] : [], photoStates: {},
      worktableDraft: { projectId: id, entryOrder: Object.keys(placements), placements, groups: [], links: [], pileOrder: [], pilePlacements: {}, frameOrder: [], frames: {} },
      sequenceIds: [], versionIds: [], layoutIds: [], revision: 0, createdAt, updatedAt: createdAt, lastOpenedAt: createdAt }));
    await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
    db.close();
  }, { id: projectId, count: photoCount });
  await page.goto(`/#/projects/${projectId}/table`);
  return projectId;
}

async function createFrame(page: Page, family: string, template: RegExp, withPhotos = false) {
  if (withPhotos) { await page.getByLabel("Photo worktable").focus(); await page.keyboard.press("Control+a"); }
  await page.getByRole("button", { name: "Frame templates", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "Frame templates" });
  await menu.getByRole("button", { name: new RegExp(`^${family}`) }).click();
  await menu.getByRole("button", { name: template }).click();
  return page.locator("[data-frame-id]").last();
}

const settings = (page: Page) => page.getByRole("complementary", { name: "Frame settings" });
const selectPage = async (frame: Locator) => frame.locator(".table-frame-title").click();

async function drawText(page: Page, frame: Locator, rect: { x: number; y: number; width: number; height: number }, text: string) {
  await selectPage(frame);
  await settings(page).getByRole("button", { name: "Add text", exact: true }).click();
  const bounds = (await frame.locator(".table-frame-page").boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width * rect.x, bounds.y + bounds.height * rect.y);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * (rect.x + rect.width), bounds.y + bounds.height * (rect.y + rect.height), { steps: 5 });
  await page.mouse.up();
  const input = frame.getByRole("textbox", { name: "Edit Frame text", exact: true });
  await expect(input).toBeVisible();
  await input.fill(text);
  await input.press("Control+Enter");
  const textId = await frame.locator("[data-frame-text-id]").last().getAttribute("data-frame-text-id");
  const box = frame.locator(`[data-frame-text-id="${textId}"]`);
  await expect(box.locator(".layout-text-content")).toContainText(text.replace(/\n/g, ""));
  return box;
}

test("switches page and photo settings and applies stepped dimensions on Enter or an outside click", async ({ page }, testInfo) => {
  await workspace(page);
  const frame = await createFrame(page, "Plain Page", /Quad Grid 4 slots/);
  const panel = settings(page);
  await expect(panel.getByRole("heading", { name: "Template", exact: true })).toHaveCount(0);
  await expect(panel.getByRole("heading", { name: "Arrange", exact: true })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: /^(Front|Duplicate|Delete|Reset to template size)$/ })).toHaveCount(0);
  await panel.getByRole("group", { name: "Page aspect ratio", exact: true }).getByRole("button", { name: "3:4", exact: true }).click();
  await panel.getByRole("spinbutton", { name: "W mm", exact: true }).fill("180");
  await panel.getByRole("spinbutton", { name: "W mm", exact: true }).press("Enter");
  await expect(panel.getByRole("spinbutton", { name: "H mm", exact: true })).toHaveValue("240");
  await panel.getByRole("button", { name: "Increase W mm", exact: true }).click();
  await expect(panel.getByRole("spinbutton", { name: "W mm", exact: true })).toHaveValue("181");
  await panel.getByRole("button", { name: "Decrease W mm", exact: true }).click();
  await expect(panel.getByRole("spinbutton", { name: "W mm", exact: true })).toHaveValue("180");
  await panel.getByRole("button", { name: "Lock aspect ratio", exact: true }).click();
  await panel.getByRole("spinbutton", { name: "H mm", exact: true }).fill("260");
  await selectPage(frame);
  await expect(panel.getByRole("spinbutton", { name: "H mm", exact: true })).toHaveValue("260");
  await page.screenshot({ path: testInfo.outputPath("page-settings-1440.png") });
  await panel.getByRole("button", { name: "Add photo box", exact: true }).click();
  await expect(frame.locator("[data-frame-slot-id]")).toHaveCount(5);
  await expect(panel.getByRole("heading", { name: "Photo box 05", exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Paper color", exact: true })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Add text", exact: true })).toHaveCount(0);
  await panel.getByRole("spinbutton", { name: "X mm", exact: true }).fill("20");
  await panel.getByRole("spinbutton", { name: "X mm", exact: true }).press("Enter");
  await panel.getByRole("button", { name: "Increase X mm", exact: true }).click();
  await expect(panel.getByRole("spinbutton", { name: "X mm", exact: true })).toHaveValue("21");
  await panel.getByRole("slider", { name: "Corner radius", exact: true }).press("End");
  await expect(frame.locator(".table-frame-photo-clip").last()).toHaveCSS("border-radius", "32px");
  await page.screenshot({ path: testInfo.outputPath("photo-settings-1440.png") });
  await selectPage(frame);
  await expect(panel.getByRole("heading", { name: "Page size", exact: true })).toBeVisible();
  await expect(panel.getByRole("slider", { name: "Corner radius", exact: true })).toHaveCount(0);
  await page.reload();
  await selectPage(page.locator("[data-frame-id]"));
  await expect(panel.getByRole("spinbutton", { name: "H mm", exact: true })).toHaveValue("260");
  await frame.locator("[data-frame-slot-id]").last().click();
  await expect(panel.getByRole("spinbutton", { name: "X mm", exact: true })).toHaveValue("21");
  await panel.getByRole("button", { name: "Remove photo box", exact: true }).click();
  await expect(frame.locator("[data-frame-slot-id]")).toHaveCount(4);
  await page.setViewportSize({ width: 1280, height: 800 });
  await selectPage(frame);
  await page.screenshot({ path: testInfo.outputPath("page-settings-1280.png") });
});

test("draws multiple independent text boxes, edits them and restores them after reload", async ({ page }, testInfo) => {
  await workspace(page);
  const frame = await createFrame(page, "Plain Page", /Full Page 1 slots/);
  const panel = settings(page);
  const first = await drawText(page, frame, { x: .12, y: .15, width: .65, height: .16 }, "Shanghai\n2026");
  const firstId = await first.getAttribute("data-frame-text-id");
  await expect(panel.getByRole("button", { name: "Paper color", exact: true })).toHaveCount(0);
  await expect(panel.getByRole("slider", { name: "Corner radius", exact: true })).toHaveCount(0);
  await panel.getByLabel("Text font", { exact: true }).selectOption("architects-daughter");
  await panel.getByRole("spinbutton", { name: "Text size pt", exact: true }).fill("24");
  await panel.getByRole("spinbutton", { name: "Text size pt", exact: true }).press("Enter");
  await panel.getByRole("button", { name: "Increase Text size pt", exact: true }).click();
  await expect(first.locator(".layout-text-content")).toHaveCSS("font-size", "25px");
  await panel.getByRole("button", { name: "Text bold", exact: true }).click();
  await expect(first.locator(".layout-text-content")).toHaveCSS("font-weight", "700");
  const before = await first.evaluate((node) => ({ x: parseFloat((node as HTMLElement).style.left), width: parseFloat((node as HTMLElement).style.width) }));
  const bounds = (await first.boundingBox())!;
  await page.mouse.move(bounds.x + 15, bounds.y + 10); await page.mouse.down(); await page.mouse.move(bounds.x + 32, bounds.y + 25, { steps: 4 }); await page.mouse.up();
  expect(await first.evaluate((node) => parseFloat((node as HTMLElement).style.left))).toBeGreaterThan(before.x);
  const handle = (await first.getByRole("button", { name: "Resize text box se", exact: true }).boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down(); await page.mouse.move(handle.x + 20, handle.y + 14, { steps: 4 }); await page.mouse.up();
  expect(await first.evaluate((node) => parseFloat((node as HTMLElement).style.width))).toBeGreaterThan(before.width);
  const second = await drawText(page, frame, { x: .16, y: .58, width: .6, height: .14 }, "A second text box");
  await expect(frame.locator("[data-frame-text-id]")).toHaveCount(2);
  await second.dblclick();
  await frame.getByRole("textbox", { name: "Edit Frame text", exact: true }).fill("Edited in place");
  await selectPage(frame);
  await expect(second.locator(".layout-text-content")).toHaveText("Edited in place");
  await first.click();
  await expect(panel.getByLabel("Text font", { exact: true })).toHaveValue("architects-daughter");
  await expect(panel.getByRole("spinbutton", { name: "Text size pt", exact: true })).toHaveValue("25");
  await page.screenshot({ path: testInfo.outputPath("text-settings-1440.png") });
  await page.reload();
  await expect(frame.locator("[data-frame-text-id]")).toHaveCount(2);
  const restored = frame.locator(`[data-frame-text-id="${firstId}"]`);
  await restored.click();
  await expect(panel.getByRole("spinbutton", { name: "Text size pt", exact: true })).toHaveValue("25");
  await page.keyboard.press("Delete");
  await expect(frame.locator("[data-frame-text-id]")).toHaveCount(1);
  await expect(frame).toHaveCount(1);
  await page.keyboard.press("Control+z");
  await expect(frame.locator("[data-frame-text-id]")).toHaveCount(2);
  await selectPage(frame);
  await panel.getByRole("button", { name: "Add text", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(panel.getByRole("button", { name: "Add text", exact: true })).toHaveAttribute("aria-pressed", "false");
});

test("keeps crop button-only and photo appearance local to the selected photo box", async ({ page }, testInfo) => {
  await workspace(page, 2);
  const frame = await createFrame(page, "Plain Page", /Diptych 2 slots/, true);
  const panel = settings(page);
  const first = frame.locator("[data-frame-slot-id]").first();
  const second = frame.locator("[data-frame-slot-id]").nth(1);
  await expect(first.locator("img")).toBeVisible();
  const photo = first.locator("img");
  const widthBefore = await photo.evaluate((node) => parseFloat(node.style.width));
  await first.dblclick();
  await expect(panel.getByRole("button", { name: "Cancel crop", exact: true })).toHaveCount(0);
  await first.click({ button: "right" });
  await expect(panel.getByRole("button", { name: "Cancel crop", exact: true })).toHaveCount(0);
  await panel.getByRole("button", { name: "Adjust crop", exact: true }).click();
  const worldBefore = await page.locator(".worktable-world").getAttribute("style");
  const wheel = () => first.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    node.dispatchEvent(new WheelEvent("wheel", { deltaY: -120, clientX: rect.left + rect.width * .6, clientY: rect.top + rect.height * .4, bubbles: true, cancelable: true }));
  });
  await wheel();
  await expect.poll(() => photo.evaluate((node) => parseFloat(node.style.width))).toBeGreaterThan(widthBefore);
  await expect(page.locator(".worktable-world")).toHaveAttribute("style", worldBefore!);
  await panel.getByRole("button", { name: "Cancel crop", exact: true }).click();
  await expect.poll(() => photo.evaluate((node) => parseFloat(node.style.width))).toBe(widthBefore);
  await panel.getByRole("button", { name: "Adjust crop", exact: true }).click(); await wheel();
  await panel.getByRole("button", { name: "Done", exact: true }).click();
  await panel.getByRole("group", { name: "Inner edge", exact: true }).getByRole("button", { name: "Mat bevel", exact: true }).click();
  await panel.getByRole("spinbutton", { name: "Inner edge width mm", exact: true }).fill("2");
  await panel.getByRole("spinbutton", { name: "Inner edge width mm", exact: true }).press("Enter");
  await panel.getByRole("slider", { name: "Photo elevation", exact: true }).press("Home");
  for (let step = 0; step < 3; step++) await panel.getByRole("slider", { name: "Photo elevation", exact: true }).press("ArrowRight");
  await expect(first.locator(".table-frame-inner-edge")).toHaveCount(1);
  await expect(first.locator(".table-frame-photo-elevation")).toHaveCount(1);
  await expect(second.locator(".table-frame-inner-edge")).toHaveCount(0);
  await expect(second.locator(".table-frame-photo-elevation")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("photo-crop-settings.png") });
  await page.reload(); await first.click();
  await expect(panel.getByRole("spinbutton", { name: "Inner edge width mm", exact: true })).toHaveValue("2");
  await expect(panel.getByRole("slider", { name: "Photo elevation", exact: true })).toHaveValue("3");
});

test("exports a gallery frame with independent text boxes and photo finishes", async ({ page }, testInfo) => {
  test.setTimeout(90000);
  await workspace(page, 1);
  const frame = await createFrame(page, "Frames", /Gallery single/, true);
  const panel = settings(page);
  await panel.getByRole("button", { name: "Paper color", exact: true }).click();
  await panel.getByRole("option", { name: "Ink Blue", exact: true }).click();
  await panel.getByRole("button", { name: "Paper material", exact: true }).click();
  await panel.getByRole("option", { name: "Fine cotton paper", exact: true }).click();
  await panel.getByLabel("Frame edge color", { exact: true }).selectOption({ label: "Walnut" });
  await panel.getByLabel("Frame material", { exact: true }).selectOption("wood");
  await panel.getByRole("spinbutton", { name: "Frame edge width mm", exact: true }).fill("10");
  await panel.getByRole("spinbutton", { name: "Frame edge width mm", exact: true }).press("Enter");
  await expect(panel.getByRole("button", { name: "Reset to template size", exact: true })).toHaveCount(0);
  const title = await drawText(page, frame, { x: .12, y: .08, width: .7, height: .12 }, "HELLO FRAME");
  await panel.getByRole("spinbutton", { name: "Text size pt", exact: true }).fill("60");
  await panel.getByRole("spinbutton", { name: "Text size pt", exact: true }).press("Enter");
  await panel.getByLabel("Text font", { exact: true }).selectOption("roboto");
  await drawText(page, frame, { x: .12, y: .78, width: .7, height: .12 }, "Shanghai, 2026");
  await selectPage(frame);
  await expect(title.locator(".layout-text-content")).toContainText("HELLO FRAME");
  await page.screenshot({ path: testInfo.outputPath("frame-text-page-1440.png") });
  const downloadEvent = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Export JPEG", exact: true }).click();
  const download = await downloadEvent;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const bytes = Buffer.concat(chunks);
  expect([...bytes.subarray(0, 2)]).toEqual([0xff, 0xd8]);
  const exported = await page.evaluate(async (base64) => {
    const data = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const image = await createImageBitmap(new Blob([data], { type: "image/jpeg" }));
    const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d")!; context.drawImage(image, 0, 0);
    const titlePixels = context.getImageData(Math.round(image.width * .12), Math.round(image.height * .08), Math.round(image.width * .7), Math.round(image.height * .12)).data;
    let lightPixels = 0;
    for (let index = 0; index < titlePixels.length; index += 4) if (titlePixels[index] > 180 && titlePixels[index + 1] > 180 && titlePixels[index + 2] > 180) lightPixels++;
    const result = { width: image.width, height: image.height, lightPixels };
    image.close(); return result;
  }, bytes.toString("base64"));
  expect(exported.width).toBe(6554); expect(exported.height).toBe(8192); expect(exported.lightPixels).toBeGreaterThan(500);
  await download.saveAs(testInfo.outputPath("frame-with-text.jpeg"));
  await expect(panel.getByRole("status")).toHaveText("JPEG download started.");
  await page.reload();
  await expect(frame.locator("[data-frame-text-id]")).toHaveCount(2);
  await expect(frame.locator(".table-frame-gallery-edge")).toHaveClass(/edge-material-wood/);
});
