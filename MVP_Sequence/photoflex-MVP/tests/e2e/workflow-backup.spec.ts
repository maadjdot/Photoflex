import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { backupFixture } from "../helpers/projectBackup";
import type { ProjectBackupV1 } from "../../src/contracts";

async function importBackup(page: Page, document = JSON.stringify(backupFixture())) {
  return page.evaluate(async (document) => {
    const module = "/tests/helpers/browserProjectFixture.ts";
    return (await import(/* @vite-ignore */ module)).importBrowserBackup(document);
  }, document);
}
async function exportBackup(page: Page, projectId: string): Promise<ProjectBackupV1> {
  return page.evaluate(async (projectId) => {
    const module = "/tests/helpers/browserProjectFixture.ts";
    return JSON.parse(await (await import(/* @vite-ignore */ module)).exportBrowserBackup(projectId));
  }, projectId);
}
const photoOrder = (backup: ProjectBackupV1) => backup.sequences[0].items.map((item) =>
  item.kind === "photo" ? backup.photoManifest.find((photo) => photo.photoId === item.photoId)?.relativePath : item.kind);

test("current first-use guide, navigation and backup API round trip retain project content", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    (window as any).showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle("restored-photos");
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await page.getByRole("button", { name: "User guide", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "User guide", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close user guide" }).click();
  await page.getByRole("button", { name: "New project", exact: true }).click();
  const creator = page.getByRole("dialog", { name: "New Project", exact: true });
  await creator.getByLabel("Project name").fill("First project");
  await creator.getByRole("button", { name: "Create project", exact: true }).click();
  await expect(page).toHaveURL(/#\/projects\/[^/]+\/table$/);
  await expect(page.getByLabel("Photo worktable")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("first-use.png") });

  // Daily backup controls were removed. Exercise the supported persistence API
  // instead of introducing a test-only backup button into the product.
  const projectId = await importBackup(page);
  await page.goto(`/#/projects/${projectId}`);
  await expect(page.getByRole("button", { name: "Reconnect folder", exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const folder = await (await navigator.storage.getDirectory()).getDirectoryHandle("restored-photos", { create: true });
    for (const [name, color] of [["one.jpg", "#43856b"], ["two.jpg", "#b46445"]]) {
      const canvas = document.createElement("canvas"); canvas.width = 1200; canvas.height = 800;
      const ctx = canvas.getContext("2d")!; ctx.fillStyle = color; ctx.fillRect(0, 0, 1200, 800);
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!), "image/jpeg"));
      const file = await folder.getFileHandle(name, { create: true });
      const writer = await file.createWritable(); await writer.write(blob); await writer.close();
    }
  });
  await page.getByRole("button", { name: "Reconnect folder", exact: true }).click();
  await expect(page.locator(".source-card.status-ready")).toBeVisible();
  await page.locator(".source-card").getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.locator(".photo-tile img")).toHaveCount(2);
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Table", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`#/projects/${projectId}/table$`));
  await expect(page.locator(".worktable-card")).toHaveCount(2);

  const exported = await exportBackup(page, projectId);
  expect(exported.photoManifest).toHaveLength(2);
  expect(exported.versions).toHaveLength(2);
  expect(exported.sequences[0].readingUnits.map((unit) => unit.kind)).toEqual(backupFixture().sequences[0].readingUnits.map((unit) => unit.kind));
  await page.goto(`/#/projects/${projectId}/sequences/${exported.sequences[0].id}`);
  const overlay = page.getByRole("dialog", { name: /^Sequence / });
  await expect(overlay.getByRole("gridcell")).toHaveCount(3);
  for (const width of [1280, 1024]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(overlay.getByRole("button", { name: "Read", exact: true })).toBeVisible();
    const bounds = await overlay.locator("header button").evaluateAll((buttons) => buttons.map((button) => {
      const rect = button.getBoundingClientRect(); return { left: rect.left, right: rect.right };
    }));
    expect(bounds.every((rect) => rect.left >= 0 && rect.right <= width)).toBe(true);
  }
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`#/projects/${projectId}/table$`));
  await page.goForward();
  await expect(overlay).toBeVisible();

  const downloading = page.waitForEvent("download");
  await page.evaluate(async (document) => {
    const module = "/src/app/downloadRecoveryBackup.ts";
    (await import(/* @vite-ignore */ module)).downloadRecoveryBackup(new TextEncoder().encode(document));
  }, JSON.stringify(exported));
  const filePath = testInfo.outputPath("project.photoflex.json");
  await (await downloading).saveAs(filePath);
  const copyId = await importBackup(page, await readFile(filePath, "utf8"));
  expect(copyId).not.toBe(projectId);
  const copy = await exportBackup(page, copyId);
  expect(photoOrder(copy)).toEqual(photoOrder(exported));
  expect(copy.project.worktableDraft.entryOrder).toHaveLength(2);
  expect(copy.versions).toHaveLength(2);
  await page.goto(`/#/projects/${copyId}/table`);
  await expect(page.locator(".worktable-card")).toHaveCount(2);
  await page.reload();
  await expect(page.locator(".worktable-card")).toHaveCount(2);
});

test("two tabs retain the saved Sequence and download or copy the conflicting draft", async ({ page, context }, testInfo) => {
  await page.goto("/");
  const projectId = await importBackup(page);
  const before = await exportBackup(page, projectId), sequenceId = before.sequences[0].id;
  const sequenceUrl = `/#/projects/${projectId}/sequences/${sequenceId}`;
  await page.goto(sequenceUrl);
  const grid = page.getByRole("grid", { name: "Sequence photo order" });
  await expect(grid.getByRole("gridcell")).toHaveCount(3);
  const other = await context.newPage(); await other.goto(sequenceUrl);
  const otherGrid = other.getByRole("grid", { name: "Sequence photo order" });
  await expect(otherGrid.getByRole("gridcell")).toHaveCount(3);
  await grid.getByRole("gridcell").nth(0).click({ modifiers: ["Control"] });
  await grid.press("Delete");
  await expect(grid.getByRole("gridcell")).toHaveCount(2);
  const savedIds = before.sequences[0].items.slice(1).map((item) => item.id);
  await expect.poll(async () => (await exportBackup(page, projectId)).sequences[0].items.map((item) => item.id)).toEqual(savedIds);
  await otherGrid.getByRole("gridcell").nth(1).click({ modifiers: ["Control"] });
  await otherGrid.press("Delete");
  await expect(otherGrid.getByRole("gridcell")).toHaveCount(2);
  await expect(other.getByRole("dialog", { name: /^Sequence / }).getByRole("button", { name: "Retry", exact: true })).toBeVisible();
  expect((await exportBackup(page, projectId)).sequences[0].items.map((item) => item.id)).toEqual(savedIds);
  // Browser hash navigation exercises the guarded route while the modal blocks
  // the background header. It must retain the draft and show recovery actions.
  await other.evaluate(() => { location.hash = "#/"; });
  const recovery = other.getByRole("alert").filter({ hasText: "Your latest edits have not been saved." });
  await expect(recovery).toContainText("Your latest edits have not been saved.");
  await expect(recovery).toHaveAttribute("open", "");
  await expect(recovery.getByRole("button", { name: "Keep editing" })).toBeFocused();
  await other.keyboard.press("Tab");
  await expect(recovery.getByRole("button", { name: "Download recovery backup" })).toBeFocused();
  await expect(other).toHaveURL(new RegExp(`#/projects/${projectId}/sequences/${sequenceId}$`));
  await other.screenshot({ path: testInfo.outputPath("conflict-recovery.png") });
  const downloading = other.waitForEvent("download");
  await recovery.getByRole("button", { name: "Download recovery backup" }).click();
  const path = testInfo.outputPath("unsaved.photoflex.json"); await (await downloading).saveAs(path);
  const draft = JSON.parse(await readFile(path, "utf8")) as ProjectBackupV1;
  expect(photoOrder(draft)).toEqual(["one.jpg", "blank", "one.jpg"]);
  await recovery.getByRole("button", { name: "Save recovery copy" }).click();
  await expect(other).toHaveURL(/#\/projects\/[^/]+$/);
  const copyId = other.url().split("#/projects/")[1];
  expect(copyId).not.toBe(projectId);
  expect(photoOrder(await exportBackup(other, copyId))).toEqual(photoOrder(draft));
  await other.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Sequence", exact: true }).click();
  await expect(other.getByRole("grid", { name: "Sequence photo order" }).getByRole("gridcell")).toHaveCount(2);
  expect((await exportBackup(page, projectId)).sequences[0].items.map((item) => item.id)).toEqual(savedIds);
  await other.close();
});
