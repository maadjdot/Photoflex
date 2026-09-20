import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { backupFixture } from "../helpers/projectBackup";

test("first-use guidance, shared navigation and project backup round trip", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Turn your photographs into a story" })).toBeVisible();
  const steps = await page.locator(".first-use-steps").boundingBox();
  const create = await page.getByRole("button", { name: "Create a project", exact: true }).boundingBox();
  expect(create!.y).toBeGreaterThan(steps!.y + steps!.height);
  await page.screenshot({ path: testInfo.outputPath("first-use.png") });
  await page.getByLabel("Project backup file").setInputFiles({ name: "Street.photoflex.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backupFixture())) });
  await expect(page).toHaveURL(/#\/projects\/[^/]+$/);
  const projectUrl = page.url();
  const nav = page.getByRole("navigation", { name: "Project navigation" });
  await expect(nav.getByRole("button")).toHaveText(["Home", "Project", "Contact Sheet", "Table", "Sequence"]);
  await expect(nav.locator('[aria-current="page"]')).toHaveText("Project");
  await expect(page.getByRole("button", { name: "Reconnect folder" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("restored-project.png") });
  // A real browser directory handle, isolated in OPFS, supplies the source files.
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const folder = await root.getDirectoryHandle("restored-photos", { create: true });
    for (const [name, color] of [["one.jpg", "#43856b"], ["two.jpg", "#b46445"]]) {
      const canvas = document.createElement("canvas"); canvas.width = 1200; canvas.height = 800;
      const ctx = canvas.getContext("2d")!; ctx.fillStyle = color; ctx.fillRect(0, 0, 1200, 800);
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!), "image/jpeg"));
      const file = await folder.getFileHandle(name, { create: true });
      const writer = await file.createWritable(); await writer.write(blob); await writer.close();
    }
    (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker = async () => folder;
  });
  await page.getByRole("button", { name: "Reconnect folder" }).click();
  await expect(page.getByRole("button", { name: "Reconnect folder" })).toHaveCount(0);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export project backup" }).click();
  const file = await download;
  const filePath = testInfo.outputPath("project.photoflex.json");
  await file.saveAs(filePath);
  const exported = JSON.parse(await readFile(filePath, "utf8"));
  expect(exported.photoManifest).toHaveLength(2);
  expect(exported.versions).toHaveLength(2);
  expect(exported.sequences[0].readingUnits).toEqual(backupFixture().sequences[0].readingUnits);

  await nav.getByRole("button", { name: "Contact Sheet", exact: true }).click();
  await expect(nav.locator('[aria-current="page"]')).toHaveText("Contact Sheet");
  await expect(page.locator(".photo-tile img")).toHaveCount(2);
  await nav.getByRole("button", { name: "Table", exact: true }).click();
  await expect(page.getByLabel("Photo worktable")).toBeVisible();
  await expect(nav.locator('[aria-current="page"]')).toHaveText("Table");
  expect((await nav.boundingBox())!.y).toBe(44);
  expect((await page.locator(".table-page").boundingBox())!.y).toBe(82);
  await page.screenshot({ path: testInfo.outputPath("table-navigation.png") });
  await nav.getByRole("button", { name: "Sequence", exact: true }).click();
  await expect(page.locator(".sequence-workspace")).toBeVisible();
  for (const width of [1280, 1024]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(nav.locator('[aria-current="page"]')).toHaveText("Sequence");
    expect((await nav.boundingBox())!.y).toBe(44);
    await expect(page.getByRole("button", { name: "Export PDF", exact: true })).toBeVisible();
    const bounds = await nav.getByRole("button").evaluateAll((buttons) => buttons.map((button) => { const r = button.getBoundingClientRect(); return { left: r.left, right: r.right }; }));
    expect(bounds.every((r) => r.left >= 0 && r.right <= width)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`sequence-navigation-${width}.png`) });
  }
  await page.goBack();
  await expect(nav.locator('[aria-current="page"]')).toHaveText("Table");
  await page.goForward();
  await expect(nav.locator('[aria-current="page"]')).toHaveText("Sequence");
  await nav.getByRole("button", { name: "Home", exact: true }).click();
  await expect(page.locator(".home-gallery-photo").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Table", exact: true })).toHaveCount(0);
  await page.getByLabel("Project backup file").setInputFiles(filePath);
  await expect(page).toHaveURL(/#\/projects\/[^/]+$/);
  expect(page.url()).not.toBe(projectUrl);
});

test("two tabs preserve the first saved edit and recover the conflicting draft as a separate project", async ({ page, context }, testInfo) => {
  await page.goto("/");
  await page.getByLabel("Project backup file").setInputFiles({ name: "Street.photoflex.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backupFixture())) });
  const nav = page.getByRole("navigation", { name: "Project navigation" });
  await expect(nav.getByRole("button", { name: "Sequence", exact: true })).toBeEnabled();
  await nav.getByRole("button", { name: "Sequence", exact: true }).click();
  await expect(page.locator(".sequence-card")).toHaveCount(4);
  const originalSequenceUrl = page.url();
  const other = await context.newPage();
  await other.goto(originalSequenceUrl);
  await expect(other.locator(".sequence-card")).toHaveCount(4);
  // A removes the blank page. B still has the original four-item draft.
  await page.locator(".sequence-card").nth(2).click();
  await page.locator(".sequence-workspace").press("Delete");
  await expect(page.locator(".sequence-card")).toHaveCount(3);
  const readOriginal = async () => page.evaluate(async () => {
    const request = indexedDB.open("photoflex-mvp");
    const db = await new Promise<IDBDatabase>((resolve) => { request.onsuccess = () => resolve(request.result); });
    const id = location.hash.split("/").at(-1)!;
    const row = await new Promise<{ revision: number; items: { id: string }[] }>((resolve) => { const read = db.transaction("sequences", "readonly").objectStore("sequences").get(id); read.onsuccess = () => resolve(read.result); });
    db.close(); return row;
  });
  await expect.poll(async () => (await readOriginal()).revision).toBe(1);
  await other.locator(".sequence-card").nth(0).click();
  await other.locator(".sequence-workspace").press("Delete");
  await expect(other.getByRole("button", { name: "Changes not saved · Retry" })).toBeVisible();
  expect((await readOriginal()).items.map((i) => i.id)).toEqual(["i1", "i2", "i4"]);
  await other.getByRole("navigation", { name: "Project navigation" }).getByRole("button", { name: "Home", exact: true }).click();
  await expect(other.getByText("Your latest edits have not been saved.")).toBeVisible();
  expect(other.url()).toBe(originalSequenceUrl);
  await other.screenshot({ path: testInfo.outputPath("conflict-recovery.png") });
  await other.getByRole("button", { name: "Save recovery copy" }).click();
  await expect(other).toHaveURL(/#\/projects\/[^/]+$/);
  await other.getByRole("navigation", { name: "Project navigation" }).getByRole("button", { name: "Sequence", exact: true }).click();
  await expect(other.locator(".sequence-card")).toHaveCount(3);
  expect(await other.locator(".sequence-card").evaluateAll((cards) => cards.map((card) => (card as HTMLElement).dataset.itemId))).toEqual(["i2", "i3", "i4"]);
  expect((await readOriginal()).items.map((i) => i.id)).toEqual(["i1", "i2", "i4"]);
  await other.close();
});
