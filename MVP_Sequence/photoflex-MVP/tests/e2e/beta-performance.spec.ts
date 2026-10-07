import { expect, test } from "@playwright/test";
import { build, preview, type PreviewServer } from "vite";
import type { LayoutId, ProjectId, SequenceId } from "../../src/contracts";
import { routeToHash } from "../../src/app/router";
import { writeFile } from "node:fs/promises";

let localPreview: PreviewServer, productionPreview: PreviewServer;
test.beforeAll(async () => {
  // Both previews build from current code, without private environment files or
  // a pre-existing dist. Only the login fixture enables the real CloudBase SDK.
  const define = {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(""),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(""),
  };
  await build({ mode: "e2e", logLevel: "silent", define: { ...define, "import.meta.env.VITE_CLOUDBASE_ENV_ID": JSON.stringify("") }, build: { outDir: "tmp/performance-dist" } });
  await build({ mode: "production", logLevel: "silent", define: { ...define, "import.meta.env.VITE_CLOUDBASE_ENV_ID": JSON.stringify("photoflex-performance-fixture") }, build: { outDir: "tmp/performance-cloud-dist" } });
  localPreview = await preview({ mode: "e2e", logLevel: "silent", build: { outDir: "tmp/performance-dist" }, preview: { host: "127.0.0.1", port: 4175, strictPort: true } });
  productionPreview = await preview({ mode: "production", logLevel: "silent", build: { outDir: "tmp/performance-cloud-dist" }, preview: { host: "127.0.0.1", port: 4176, strictPort: true } });
});
test.afterAll(async () => {
  await Promise.all([localPreview, productionPreview].filter(Boolean).map((server) => new Promise<void>((resolve) => server.httpServer.close(() => resolve()))));
});

test("cold limited-network production routes load fonts, PDF and reader resources on demand", async ({ page, context }, testInfo) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable"); await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 40, downloadThroughput: 5_000_000 / 8, uploadThroughput: 5_000_000 / 8 });
  const requested: string[] = []; page.on("request", (request) => requested.push(request.url()));
  const measurements: Record<string, number> = {};
  let started = Date.now(); await page.goto("http://127.0.0.1:4176/");
  await expect(page.getByRole("heading", { name: "Sign in to Photoflex" })).toBeVisible(); measurements.loginMs = Date.now() - started;
  started = Date.now(); await page.goto("http://127.0.0.1:4175/");
  await expect(page.getByRole("heading", { name: "Your Projects" })).toBeVisible();
  const ids = await page.evaluate(async () => {
    const module = "http://127.0.0.1:4173/tests/helpers/betaPerformanceBrowserFixture.ts";
    return (await import(/* @vite-ignore */ module)).seedPerformanceWorkspace();
  });
  const projectId = ids.projectId as ProjectId, sequenceId = ids.sequenceId as SequenceId, layoutId = ids.layoutId as LayoutId;
  started = Date.now(); await page.goto("http://127.0.0.1:4175/" + routeToHash({ name: "table", projectId }));
  await expect(page.getByLabel("Photo worktable", { exact: true })).toBeVisible(); measurements.tableMs = Date.now() - started;
  requested.length = 0;
  started = Date.now(); await page.goto("http://127.0.0.1:4175/" + routeToHash({ name: "layout", projectId, sequenceId, layoutId }));
  await expect(page.locator(".layout-text-line").first()).toHaveText("Cold cache caption"); measurements.layoutMs = Date.now() - started;
  expect(requested.filter((url) => /exportLayoutPdf-|LayoutReader-|\.ttf(?:$|\?)/.test(url))).toEqual([]);
  expect(requested.some((url) => /CourierPrime-Regular.*\.woff2/.test(url))).toBe(true);
  expect(requested.some((url) => /NotoSerifSC/.test(url))).toBe(false);
  started = Date.now(); await page.getByRole("button", { name: "Export PDF", exact: true }).click();
  const downloading = page.waitForEvent("download");
  await page.getByRole("dialog", { name: "PDF export quality" }).getByRole("button", { name: "Export PDF", exact: true }).click();
  await downloading; measurements.exportMs = Date.now() - started;
  expect(requested.some((url) => /exportLayoutPdf-/.test(url))).toBe(true);
  expect(requested.some((url) => /CourierPrime-Regular.*\.ttf/.test(url))).toBe(true);
  expect(requested.some((url) => /LayoutReader-/.test(url))).toBe(false);
  await page.getByRole("button", { name: "Read", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Read Performance" })).toBeVisible();
  expect(requested.some((url) => /LayoutReader-/.test(url))).toBe(true);
  const record = { network: "5 Mbps, 40 ms latency, HTTP cache disabled", measurements };
  const path = testInfo.outputPath("cold-route-performance.json"); await writeFile(path, JSON.stringify(record, null, 2));
  await testInfo.attach("cold-route-performance", { path, contentType: "application/json" });
});

test("a small project snapshot and 100 rapid edits remain bounded with 25000 unrelated IndexedDB photos", async ({ page }, testInfo) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const module = "/tests/helpers/betaPerformanceBrowserFixture.ts";
    return (await import(/* @vite-ignore */ module)).measureSmallProjectSync();
  });
  expect(result.samples.map((sample: { manifestPhotos: number }) => sample.manifestPhotos)).toEqual([30, 30]);
  expect(result.flushed).toBe(true); expect(result.finalText).toBe("99"); expect(result.uploads).toBe(1);
  expect(result.metric?.outcome).toBe("uploaded");
  const path = testInfo.outputPath("indexeddb-sync-performance.json"); await writeFile(path, JSON.stringify(result, null, 2));
  await testInfo.attach("indexeddb-sync-performance", { path, contentType: "application/json" });
});

test("large JPEG previews release originals and a long edit session retains 100 undo steps", async ({ page, context }, testInfo) => {
  await page.goto("/");
  const cdp = await context.newCDPSession(page), before = await cdp.send("Runtime.getHeapUsage");
  const result = await page.evaluate(async () => {
    const module = "/tests/helpers/betaPerformanceBrowserFixture.ts";
    return (await import(/* @vite-ignore */ module)).measurePreviewSession();
  });
  expect(result.jpegBytes).toBeGreaterThan(1_000_000);
  expect(result.originalUrlsAfterRelease).toBe(0); expect(result.urlsAfterClose).toBe(0);
  expect(result.undoSteps).toBe(100);
  await cdp.send("HeapProfiler.collectGarbage");
  const after = await cdp.send("Runtime.getHeapUsage");
  const path = testInfo.outputPath("jpeg-history-performance.json"); await writeFile(path, JSON.stringify({ ...result, heapBeforeBytes: before.usedSize, heapAfterGcBytes: after.usedSize }, null, 2));
  await testInfo.attach("jpeg-history-performance", { path, contentType: "application/json" });
});
