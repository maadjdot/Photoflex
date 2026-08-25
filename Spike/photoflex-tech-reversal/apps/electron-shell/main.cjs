const { app, BrowserWindow, dialog, ipcMain, nativeImage, protocol, session } = require("electron");
const { mkdir, readFile, writeFile } = require("node:fs/promises");
const { join } = require("node:path");
const { createWorkspaceService } = require("./services/workspace.cjs");
const { createSourceService } = require("./services/sources.cjs");
const { createExportService } = require("./services/exports.cjs");

app.commandLine.appendSwitch("disable-features", "OverscrollHistoryNavigation");
protocol.registerSchemesAsPrivileged([{ scheme: "photoflex-source", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

let sourceService;
let sourceProxyCacheRoot;
const sourceProtocolEvidence = { requests: 0, successes: 0, errors: [] };
const thumbnailJobs = new Map();
const thumbnailQueue = [];
let activeThumbnailJobs = 0;

function scheduleThumbnail(task) {
  return new Promise((resolve, reject) => {
    thumbnailQueue.push({ task, resolve, reject });
    pumpThumbnailQueue();
  });
}

function pumpThumbnailQueue() {
  while (activeThumbnailJobs < 4 && thumbnailQueue.length > 0) {
    const job = thumbnailQueue.shift();
    activeThumbnailJobs += 1;
    Promise.resolve()
      .then(job.task)
      .then(job.resolve, job.reject)
      .finally(() => {
        activeThumbnailJobs -= 1;
        pumpThumbnailQueue();
      });
  }
}

async function thumbnailBytes(resolved) {
  const cachePath = join(sourceProxyCacheRoot, `${resolved.cacheKey}.jpg`);
  try {
    return await readFile(cachePath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (!thumbnailJobs.has(cachePath)) {
    thumbnailJobs.set(cachePath, scheduleThumbnail(async () => {
      await mkdir(sourceProxyCacheRoot, { recursive: true });
      const thumbnail = await nativeImage.createThumbnailFromPath(resolved.absolutePath, { width: 384, height: 384 });
      if (thumbnail.isEmpty()) throw new Error("The operating system could not decode this photo for a thumbnail");
      const bytes = thumbnail.toJPEG(82);
      await writeFile(cachePath, bytes);
      return bytes;
    }).finally(() => thumbnailJobs.delete(cachePath)));
  }
  return thumbnailJobs.get(cachePath);
}

function registerHandlers() {
  const workspace = createWorkspaceService(app.getPath("userData"));
  const sources = createSourceService(dialog, app.getPath("userData"));
  sourceService = sources;
  sourceProxyCacheRoot = join(app.getPath("userData"), "source-proxies");
  const exports = createExportService(app.getPath("userData"));
  ipcMain.handle("photoflex:diagnostics", async () => {
    const metrics = app.getAppMetrics();
    const rssKb = metrics.reduce((sum, metric) => sum + (metric.memory?.workingSetSize ?? 0), 0);
    return {
      framework: "electron",
      environmentId: process.env.PHOTOFLEX_ENVIRONMENT_ID ?? "electron-unlocked",
      versions: { electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node },
      processTreeRssBytes: rssKb * 1024
    };
  });
  ipcMain.handle("workspace:open", (_event, payload) => workspace.open(payload));
  ipcMain.handle("workspace:migrate", (_event, payload) => workspace.migrate(payload));
  ipcMain.handle("workspace:autosave", (_event, payload) => workspace.autosave(payload));
  ipcMain.handle("workspace:create-snapshot", (_event, payload) => workspace.createSnapshot(payload));
  ipcMain.handle("workspace:restore-snapshot", (_event, payload) => workspace.restoreSnapshot(payload));
  ipcMain.handle("workspace:verify-recovery", (_event, payload) => workspace.verifyRecovery(payload));
  ipcMain.handle("sources:request-folder-grant", () => sources.requestFolderGrant());
  ipcMain.handle("sources:bootstrap-grant", () => {
    const sourceRoot = process.env.PHOTOFLEX_TEST_SOURCE;
    return sourceRoot ? sources.registerFolderForTest(sourceRoot) : null;
  });
  ipcMain.handle("sources:restore-grant", (_event, payload) => sources.restoreGrant(payload));
  ipcMain.handle("sources:query", (_event, payload) => sources.query(payload));
  ipcMain.handle("sources:proxy-url", (_event, payload) => sources.proxyUrl(payload));
  ipcMain.handle("exports:start-pdf", (_event, payload) => exports.startPdf(payload));
  ipcMain.handle("exports:status", (_event, payload) => exports.status(payload));
  ipcMain.handle("exports:cancel", (_event, payload) => exports.cancel(payload));
  ipcMain.handle("exports:retry", (_event, payload) => exports.retry(payload));
}

async function createWindow() {
  const window = new BrowserWindow({
    width: 1480,
    height: 980,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: process.env.NODE_ENV !== "production"
    }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    const allowedDev = url.startsWith("http://127.0.0.1:5173");
    const allowedFile = url.startsWith("file:");
    if (!allowedDev && !allowedFile) event.preventDefault();
  });
  const capturePath = process.env.PHOTOFLEX_CAPTURE_PATH;
  if (!capturePath) window.once("ready-to-show", () => window.show());
  const devUrl = process.env.PHOTOFLEX_BENCH_URL;
  if (devUrl) await window.loadURL(devUrl);
  else {
    const uiRoot = app.isPackaged ? join(process.resourcesPath, "benchmark-ui") : join(__dirname, "..", "benchmark-ui", "dist");
    const captureTab = process.env.PHOTOFLEX_CAPTURE_TAB;
    await window.loadFile(join(uiRoot, "index.html"), captureTab ? { query: { tab: captureTab } } : undefined);
  }
  if (capturePath) {
    await new Promise((resolve) => setTimeout(resolve, process.env.PHOTOFLEX_TEST_SOURCE ? 5000 : 1000));
    const imageEvidence = await window.webContents.executeJavaScript(`Array.from(document.images).slice(0, 30).map((image) => ({ src: image.src, complete: image.complete, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight }))`);
    const image = await window.webContents.capturePage();
    require("node:fs").writeFileSync(capturePath, image.toPNG());
    require("node:fs").writeFileSync(`${capturePath}.json`, `${JSON.stringify({ imageEvidence, sourceProtocolEvidence }, null, 2)}\n`, "utf8");
    app.quit();
  }
}

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  registerHandlers();
  protocol.handle("photoflex-source", async (request) => {
    sourceProtocolEvidence.requests += 1;
    try {
      const resolved = await sourceService.resolveProxyRequest(request.url);
      const wantsThumbnail = new URL(request.url).searchParams.get("kind") === "thumbnail";
      const bytes = wantsThumbnail ? await thumbnailBytes(resolved) : await readFile(resolved.absolutePath);
      sourceProtocolEvidence.successes += 1;
      return new Response(new Uint8Array(bytes), {
        status: 200,
        headers: { "Content-Type": wantsThumbnail ? "image/jpeg" : resolved.contentType, "Cache-Control": "private, max-age=3600" }
      });
    } catch (error) {
      sourceProtocolEvidence.errors.push(error instanceof Error ? error.message : String(error));
      return new Response(error instanceof Error ? error.message : "Source proxy failed", { status: 404 });
    }
  });
  await createWindow();
});

app.on("window-all-closed", () => app.quit());
