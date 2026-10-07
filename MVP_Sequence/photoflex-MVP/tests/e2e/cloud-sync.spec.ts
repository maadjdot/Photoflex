import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

async function mount(page: Page, databaseName: string, seed = false) {
  await page.goto("/");
  await page.evaluate(async (options) => {
    const module = "/tests/helpers/cloudSyncBrowserFixture.tsx";
    const { mountCloudSyncFixture } = await import(/* @vite-ignore */ module);
    (window as any).__syncFixture = await mountCloudSyncFixture(options);
  }, { databaseName, seed });
  await expect(page.locator("#cloud-sync-fixture .table-cloud-save-status")).toContainText(/Saved/);
}

test("two tabs retain newer edits during a delayed upload and reopen with the latest cloud content", async ({ page, context }) => {
  const databaseName = "native-sync-" + crypto.randomUUID();
  await mount(page, databaseName, true);
  const other = await context.newPage(); await mount(other, databaseName);
  await page.evaluate(async () => {
    const f = (window as any).__syncFixture; f.holdNextUpload("Edit A"); await f.editName("Edit A");
    (window as any).__syncFlush = f.store.flushPending();
  });
  await page.waitForFunction(() => (window as any).__syncFixture.uploadStarted());
  try { await other.evaluate(async () => { await (window as any).__syncFixture.editName("Edit B"); }); }
  finally { await page.evaluate(() => (window as any).__syncFixture.releaseUpload()); }
  expect(await page.evaluate(() => (window as any).__syncFlush)).toBe(true);
  expect(await other.evaluate(() => (window as any).__syncFixture.store.flushPending())).toBe(true);
  expect(await page.evaluate(() => (window as any).__syncFixture.remoteName())).toBe("Edit B");
  await expect(other.locator("#cloud-sync-fixture .table-cloud-save-status")).toContainText("Saved");
  const reopened = await context.newPage(); await mount(reopened, databaseName);
  expect(await reopened.evaluate(async () => { const f = (window as any).__syncFixture; const loaded = await f.store.loadWorkspace(f.id); return loaded.ok && loaded.value.name; })).toBe("Edit B");
});

test("cloud conflict offers a real backup and keeps a separate project before loading the cloud version", async ({ page }, testInfo) => {
  await mount(page, "native-conflict-" + crypto.randomUUID(), true);
  await page.evaluate(async () => {
    const f = (window as any).__syncFixture; f.remoteEdit("Remote version"); await f.editName("Local version"); await f.store.flushPending();
  });
  const root = page.locator("#cloud-sync-fixture"), alert = root.getByRole("alert");
  await expect(alert).toContainText("Cloud save conflict");
  await expect(root.locator(".table-cloud-save-status")).toContainText("Saved locally · cloud conflict");
  await page.screenshot({ path: testInfo.outputPath("cloud-conflict-recovery.png") });
  const downloading = page.waitForEvent("download");
  await alert.getByRole("button", { name: "Download recovery backup" }).click();
  const backupPath = testInfo.outputPath("recovery.photoflex.json");
  await (await downloading).saveAs(backupPath);
  expect(JSON.parse(await readFile(backupPath, "utf8")).project.name).toBe("Local version");
  await alert.getByRole("button", { name: "Keep a copy and load cloud version" }).click();
  await expect(root.getByRole("alert")).toHaveCount(0);
  await expect(root.getByRole("button", { name: "Open recovery copy" })).toBeVisible();
  const names = await page.evaluate(async () => {
    const f = (window as any).__syncFixture, projects = await f.local.listProjects();
    return projects.ok ? projects.value.map((project: any) => project.name) : [];
  });
  expect(names).toContain("Local version (restored)");
  expect(names).toContain("Remote version");
  await expect(root.locator(".table-cloud-save-status")).toContainText("Saved");
});

test("cloud unavailable on reload retains account cache and pending edits, then resumes synchronization", async ({ page }) => {
  const databaseName = "native-offline-cache-" + crypto.randomUUID();
  await mount(page, databaseName, true);
  expect(await page.evaluate(async () => {
    const f = (window as any).__syncFixture; f.setOffline(true); await f.editName("Offline edit"); return f.store.flushPending();
  })).toBe(false);
  await page.reload();
  await page.evaluate(async (databaseName) => {
    const module = "/tests/helpers/cloudSyncBrowserFixture.tsx";
    (window as any).__syncFixture = await (await import(/* @vite-ignore */ module)).mountCloudSyncFixture({ databaseName });
  }, databaseName);
  await expect(page.locator("#cloud-sync-fixture .table-cloud-save-status")).toContainText(/Saved locally|Using local cache/);
  const retained = await page.evaluate(async () => {
    const f = (window as any).__syncFixture, loaded = await f.store.loadWorkspace(f.id), state = await f.local.readCloudSyncState(f.id);
    return { name: loaded.ok && loaded.value.name, pending: state.ok && state.value.localRevision > state.value.acknowledgedRevision, remote: f.remoteName() };
  });
  expect(retained).toEqual({ name: "Offline edit", pending: true, remote: "Before" });
  expect(await page.evaluate(async () => { const f = (window as any).__syncFixture; f.setOffline(false); return f.store.flushPending(); })).toBe(true);
  await expect(page.locator("#cloud-sync-fixture .table-cloud-save-status")).toContainText(/Saved/);
  expect(await page.evaluate(() => (window as any).__syncFixture.remoteName())).toBe("Offline edit");
});

test("Home isolates a damaged cloud project and downloads its raw data while a healthy project stays usable", async ({ page }, testInfo) => {
  const databaseName = "native-damaged-cache-" + crypto.randomUUID();
  await mount(page, databaseName, true);
  await page.evaluate(() => (window as any).__syncFixture.addDamagedProject());
  await page.reload();
  await page.evaluate(async (databaseName) => {
    const module = "/tests/helpers/cloudSyncBrowserFixture.tsx";
    (window as any).__syncFixture = await (await import(/* @vite-ignore */ module)).mountCloudSyncFixture({ databaseName, home: true });
  }, databaseName);
  const root = page.locator("#cloud-sync-fixture");
  await root.getByRole("button", { name: "Damaged project", exact: true }).click();
  await expect(root.getByRole("alert")).toContainText("damaged-cloud-project");
  await expect(root.getByText("No photos on this Table yet")).toHaveCount(0);
  const downloading = page.waitForEvent("download");
  await root.getByRole("button", { name: "Download raw data for recovery" }).click();
  const path = testInfo.outputPath("raw-project-recovery.json"); await (await downloading).saveAs(path);
  const recovery = JSON.parse(await readFile(path, "utf8"));
  expect(recovery.format).toBe("photoflex-project-recovery");
  expect(recovery.cloudSnapshot.document.project.worktableDraft).toBeNull();
  await root.getByRole("button", { name: "Before", exact: true }).click();
  await expect(root.getByRole("alert")).toHaveCount(0);
  await root.getByRole("button", { name: "Open Table" }).click();
  await expect(root.getByLabel("Photo worktable", { exact: true })).toBeVisible();
});
