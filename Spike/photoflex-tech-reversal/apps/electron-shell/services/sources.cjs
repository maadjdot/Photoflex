const { createHash, randomUUID } = require("node:crypto");
const { mkdir, readFile, readdir, realpath, rename, stat, writeFile } = require("node:fs/promises");
const { basename, dirname, join, relative, resolve, sep } = require("node:path");

const IMAGE_EXTENSION = /\.(jpe?g|png|tiff?|webp|heic|heif)$/i;
const MIME_BY_EXTENSION = new Map([
  [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"], [".png", "image/png"],
  [".tif", "image/tiff"], [".tiff", "image/tiff"], [".webp", "image/webp"],
  [".heic", "image/heic"], [".heif", "image/heif"]
]);

function within(root, candidate) {
  const relativePath = relative(resolve(root), resolve(candidate));
  return relativePath === "" || (relativePath !== ".." && !relativePath.startsWith(`..${sep}`) && !relativePath.includes(`${sep}..${sep}`));
}

function photoIdFor(relativePath) {
  return createHash("sha256").update(relativePath.replaceAll("\\", "/")).digest("hex").slice(0, 24);
}

async function walkPhotos(root, directory = root, output = []) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const candidate = join(directory, entry.name);
    if (!within(root, candidate)) continue;
    if (entry.isDirectory()) await walkPhotos(root, candidate, output);
    else if (entry.isFile() && IMAGE_EXTENSION.test(entry.name)) output.push(candidate);
  }
  return output;
}

function createSourceService(dialog, registryRoot) {
  const storageRoot = registryRoot ?? join(process.cwd(), ".photoflex-source-grants");
  const registryPath = join(storageRoot, "source-grants.json");
  const grants = new Map();
  const indexes = new Map();
  let registryLoaded = false;

  async function loadRegistry() {
    if (registryLoaded) return;
    registryLoaded = true;
    try {
      const saved = JSON.parse(await readFile(registryPath, "utf8"));
      for (const [sourceId, root] of Object.entries(saved)) {
        if (typeof sourceId === "string" && typeof root === "string") grants.set(sourceId, root);
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  async function persistRegistry() {
    await mkdir(dirname(registryPath), { recursive: true });
    const temporary = `${registryPath}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(Object.fromEntries(grants), null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await rename(temporary, registryPath);
  }

  async function buildIndex(sourceId) {
    await loadRegistry();
    const root = grants.get(sourceId);
    if (!root) throw new Error("Unknown or expired source grant");
    const canonicalRoot = await realpath(root);
    const files = await walkPhotos(canonicalRoot);
    const records = [];
    const byId = new Map();
    for (const candidate of files) {
      const canonical = await realpath(candidate);
      if (!within(canonicalRoot, canonical)) continue;
      const relativePath = relative(canonicalRoot, canonical);
      const photoId = photoIdFor(relativePath);
      const file = await stat(canonical);
      const cacheKey = createHash("sha256").update(`${canonical}\0${file.size}\0${file.mtimeMs}`).digest("hex");
      const record = { photoId, sourceId, relativePath, absolutePath: canonical, bytes: file.size, cacheKey };
      records.push(record);
      byId.set(photoId, record);
    }
    const index = { root: canonicalRoot, records, byId };
    indexes.set(sourceId, index);
    return index;
  }

  async function indexFor(sourceId) {
    return indexes.get(sourceId) ?? buildIndex(sourceId);
  }

  async function registerFolder(folder) {
    const root = await realpath(resolve(folder));
    const sourceId = randomUUID();
    grants.set(sourceId, root);
    await persistRegistry();
    return { sourceId, displayName: basename(root), restored: false };
  }

  return {
    async requestFolderGrant() {
      const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
      if (result.canceled || !result.filePaths[0]) throw new Error("Folder selection cancelled");
      return registerFolder(result.filePaths[0]);
    },

    registerFolderForTest(folder) {
      return registerFolder(folder);
    },

    async restoreGrant({ sourceId }) {
      await loadRegistry();
      const root = grants.get(sourceId);
      if (!root) throw new Error("Unknown or expired source grant");
      const canonical = await realpath(root);
      if (!within(root, canonical)) throw new Error("Source grant target changed outside its boundary");
      grants.set(sourceId, canonical);
      return { sourceId, displayName: basename(canonical), restored: true };
    },

    async query({ sourceId, offset, limit }) {
      if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new Error("Invalid page request");
      const index = await indexFor(sourceId);
      return index.records.slice(offset, offset + limit).map((record) => ({
        photoId: record.photoId,
        sourceId,
        relativePath: record.relativePath,
        proxyUrl: `photoflex-source://photo/${encodeURIComponent(sourceId)}/${encodeURIComponent(record.photoId)}`,
        width: 0,
        height: 0,
        bytes: record.bytes
      }));
    },

    async proxyUrl({ sourceId, photoId }) {
      const index = await indexFor(sourceId);
      if (!index.byId.has(photoId)) throw new Error("Unknown photo ID");
      return `photoflex-source://photo/${encodeURIComponent(sourceId)}/${encodeURIComponent(photoId)}`;
    },

    async resolveProxyRequest(requestUrl) {
      const parsed = new URL(requestUrl);
      if (parsed.protocol !== "photoflex-source:" || parsed.hostname !== "photo") throw new Error("Invalid source proxy URL");
      const [sourceId, photoId, ...extra] = parsed.pathname.split("/").filter(Boolean).map(decodeURIComponent);
      if (!sourceId || !photoId || extra.length > 0) throw new Error("Invalid source proxy URL");
      const index = await indexFor(sourceId);
      const record = index.byId.get(photoId);
      if (!record) throw new Error("Unknown photo ID");
      const canonical = await realpath(record.absolutePath);
      if (!within(index.root, canonical)) throw new Error("Source path escaped grant root");
      const extension = canonical.slice(canonical.lastIndexOf(".")).toLowerCase();
      return { absolutePath: canonical, contentType: MIME_BY_EXTENSION.get(extension) ?? "application/octet-stream", cacheKey: record.cacheKey };
    }
  };
}

module.exports = { createSourceService, photoIdFor, walkPhotos, within };
