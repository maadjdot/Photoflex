import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";
import { PDFDocument } from "pdf-lib";

// Exercise the Layout PDF renderer with all 39 original JPEGs, without a browser.
const directory = resolve(process.argv[2] ?? "test_photos");
const names = (await readdir(directory)).filter((name) => /\.jpe?g$/i.test(name)).sort();
if (names.length !== 39) throw new Error(`Expected 39 JPEGs; found ${names.length}.`);
function jpegSize(bytes) {
  for (let at = 2; at + 4 < bytes.length;) {
    if (bytes[at] !== 0xff) throw new Error("Invalid JPEG marker");
    const marker = bytes[at + 1];
    const length = bytes.readUInt16BE(at + 2);
    if ([0xc0, 0xc1, 0xc2, 0xc3].includes(marker)) return { width: bytes.readUInt16BE(at + 7), height: bytes.readUInt16BE(at + 5) };
    at += length + 2;
  }
  throw new Error("JPEG dimensions not found");
}
const server = await createServer({ server: { middlewareMode: true } });
try {
  const { createLayoutPdf } = await server.ssrLoadModule("/src/modules/layout/layoutPdf.ts");
  const fontBytes = new Uint8Array(await readFile("src/assets/fonts/NotoSansCJKsc-Regular.otf"));
  const photos = new Map();
  for (const [index, name] of names.entries()) photos.set(`photo-${index}`, resolve(directory, name));
  const snapshot = { id: "real-pdf", projectId: "real-project", sequenceId: "real-sequence", name: "39 Real Photos",
    pageSpec: { widthPt: 595.27559, heightPt: 841.88976 }, pages: names.map((_, i) => ({ id: `page-${i}`, objects: [{ kind: "image-frame", id: `frame-${i}`,
      rect: { x: 34, y: 34, width: 520, height: 760 }, photoId: `photo-${i}`, crop: { mode: "fill", zoom: 1, focal: { x: .5, y: .5 } } }] })) };
  const started = performance.now();
  const bytes = await createLayoutPdf(snapshot, { fontBytes, async loadPhoto(photoId) {
    const path = photos.get(photoId);
    if (!path) throw new Error(`Missing ${photoId}`);
    const buffer = await readFile(path);
    return { bytes: new Uint8Array(buffer), ...jpegSize(buffer) };
  } });
  const pdf = await PDFDocument.load(bytes);
  console.log(JSON.stringify({ pages: pdf.getPageCount(), uniquePhotos: names.length, pdfBytes: bytes.length,
    elapsedMs: Math.round(performance.now() - started), nodeHeapBytes: process.memoryUsage().heapUsed, rssBytes: process.memoryUsage().rss }));
} finally { await server.close(); }
