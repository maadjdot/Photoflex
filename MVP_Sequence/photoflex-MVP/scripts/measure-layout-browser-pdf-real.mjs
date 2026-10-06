import { copyFile, open, readdir, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { createServer } from "vite";

const names = (await readdir("test_photos")).filter((name) => /\.jpe?g$/i.test(name)).sort();
if (names.length !== 39) throw new Error(`Expected 39 JPEGs; found ${names.length}.`);
const pageCount = Number(process.argv.find((arg) => arg.startsWith("--pages="))?.split("=")[1] ?? 39);
if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > 200) throw new Error("--pages must be between 1 and 200.");
const browserName = process.argv.find((arg) => arg.startsWith("--browser="))?.split("=")[1] ?? "chrome";
if (browserName !== "chrome" && browserName !== "edge") throw new Error("--browser must be chrome or edge.");
const quality = process.argv.find((arg) => arg.startsWith("--quality="))?.split("=")[1] ?? "original";
if (!["low", "medium", "high", "original"].includes(quality)) throw new Error("--quality must be low, medium, high, or original.");

async function imageSize(path) {
  const file = await open(path, "r");
  try {
    const bytes = Buffer.alloc(256 * 1024);
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    for (let at = 2; at + 9 < bytesRead;) {
      if (bytes[at] !== 0xff) throw new Error(`Invalid JPEG marker in ${path}`);
      const marker = bytes[at + 1], length = bytes.readUInt16BE(at + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3].includes(marker)) return { width: bytes.readUInt16BE(at + 7), height: bytes.readUInt16BE(at + 5) };
      at += length + 2;
    }
    throw new Error(`JPEG dimensions not found in ${path}`);
  } finally { await file.close(); }
}
const photos = await Promise.all(names.slice(0, Math.min(pageCount, names.length)).map(async (name, index) => ({ id: `photo-${index}`, name, ...(await imageSize(resolve("test_photos", name))) })));
const server = await createServer({ mode: "e2e", server: { host: "127.0.0.1", port: 4173, strictPort: true } });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ channel: browserName === "edge" ? "msedge" : "chrome" });
  const page = await browser.newPage({ acceptDownloads: true });
  page.on("console", (message) => { if (message.type() === "log") console.log(message.text()); });
  page.on("pageerror", (error) => console.error(`Page error: ${error.message}`));
  page.on("crash", () => console.error("Page crashed"));
  await page.goto("http://127.0.0.1:4173/");
  const started = performance.now();
  const downloadPromise = page.waitForEvent("download", { timeout: 300_000 });
  const exportPromise = page.evaluate(async ({ photos, pageCount, quality }) => {
    const { exportLayoutPdf, preflightLayoutPdf } = await import("/src/platform/browser/exportLayoutPdf.ts");
    const byId = new Map(photos.map((photo) => [photo.id, photo]));
    const source = {
      async getPhoto(photoId) {
        const photo = byId.get(photoId);
        return photo ? { ok: true, value: photo } : { ok: false, error: { kind: "photo-not-found", photoId } };
      },
      async readOriginalFile(photoId) {
        const photo = byId.get(photoId);
        if (!photo) return { ok: false, error: { kind: "photo-not-found", photoId } };
        const response = await fetch(`/test_photos/${encodeURIComponent(photo.name)}`);
        if (!response.ok) return { ok: false, error: { kind: "photo-not-found", photoId } };
        return { ok: true, value: await response.blob() };
      },
    };
    const snapshot = { id: "real-browser-pdf", projectId: "real-project", sequenceId: "real-sequence", name: "Real Photo Scale",
      pageSpec: { widthPt: 595.27559, heightPt: 841.88976 }, pages: Array.from({ length: pageCount }, (_, index) => ({ id: `page-${index}`, objects: [
        { kind: "image-frame", id: `frame-${index}`, rect: { x: 34, y: 34, width: 520, height: 760 }, photoId: photos[index % photos.length].id,
          crop: { mode: "fill", zoom: 1, focal: { x: .5, y: .5 } } },
        ...(index === 0 ? [{ kind: "text-box", id: "caption", rect: { x: 40, y: 801, width: 500, height: 28 }, text: "上海街景 / Café 2026",
          style: { fontFamily: "noto-sans-sc", fontSizePt: 12, lineHeight: 1.2, color: "#171513", align: "left" } }] : []),
      ] })) };
    const check = await preflightLayoutPdf(snapshot, source);
    if (check.blocking.length || check.warnings.length) throw new Error(`Unexpected preflight issues: ${JSON.stringify(check)}`);
    await exportLayoutPdf(snapshot, source, undefined, (progress) => console.log(`PDF progress ${progress.completed}/${progress.total}`), quality);
    return { preflight: check, heapBytes: performance.memory?.usedJSHeapSize ?? null, userAgent: navigator.userAgent };
  }, { photos, pageCount, quality });
  const [download, result] = await Promise.all([downloadPromise, exportPromise]);
  const path = await download.path();
  const savePath = process.argv.find((arg) => arg.startsWith("--save="))?.slice("--save=".length);
  if (savePath) await copyFile(path, resolve(savePath));
  const pdf = await PDFDocument.load(await (await import("node:fs/promises")).readFile(path));
  const pdfPages = pdf.getPages();
  const correctSize = pdfPages.every((physical) => Math.abs(physical.getWidth() - 595.27559) < .01 && Math.abs(physical.getHeight() - 841.88976) < .01);
  const oneImagePerPage = pdfPages.every((physical) => physical.node.Resources()?.lookup(PDFName.of("XObject"), PDFDict)?.keys().length === 1);
  const firstPageHasFont = (pdfPages[0].node.Resources()?.lookup(PDFName.of("Font"), PDFDict)?.keys().length ?? 0) > 0;
  if (pdfPages.length !== pageCount || !correctSize || !oneImagePerPage || !firstPageHasFont) throw new Error("Exported PDF page structure is incorrect.");
  const pdfium = spawnSync("python", ["-c", "import pypdfium2 as p,sys,json; d=p.PdfDocument(sys.argv[1]); t=d[0].get_textpage(); q={'chinese':''.join(map(chr,[0x4e0a,0x6d77,0x8857,0x666f])),'accent':'Caf'+chr(0xe9)}; print(json.dumps({k:t.search(v).get_next() for k,v in q.items()}))", path], { encoding: "utf8" });
  if (pdfium.status !== 0) throw new Error(`PDFium search failed: ${pdfium.stderr}`);
  const search = JSON.parse(pdfium.stdout.trim());
  if (!search.chinese || !search.accent) throw new Error(`PDFium could not find the Chinese and accented text: ${JSON.stringify(search)}`);
  console.log(JSON.stringify({ stage: "browser-export", browser: browserName, quality, pages: pdfPages.length, correctSize, oneImagePerPage, firstPageHasFont, search, uniquePhotos: photos.length,
    pdfBytes: (await stat(path)).size, elapsedMs: Math.round(performance.now() - started), ...result }));
} finally { await browser?.close(); await server.close(); }
