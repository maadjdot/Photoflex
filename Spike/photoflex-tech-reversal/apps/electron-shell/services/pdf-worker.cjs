const { parentPort, workerData } = require("node:worker_threads");
const { mkdir, rename, rm, writeFile } = require("node:fs/promises");
const { dirname } = require("node:path");

let cancelled = false;
parentPort.on("message", (message) => {
  if (message?.type === "cancel") cancelled = true;
});

function pdfText(value) {
  return value.replace(/[^\x20-\x7e]/g, "?").replace(/([\\()])/g, "\\$1");
}

function createPdf(labels) {
  const fontId = 3 + labels.length * 2;
  const pageIds = labels.map((_, index) => 3 + index * 2);
  const objects = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${labels.length} >>`;
  labels.forEach((label, index) => {
    const pageId = pageIds[index];
    const contentId = pageId + 1;
    const content = `BT /F1 18 Tf 54 760 Td (PhotoFlex benchmark page ${index + 1}) Tj 0 -28 Td (${pdfText(label)}) Tj ET`;
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`;
  });
  objects[fontId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  let document = "%PDF-1.4\n";
  const offsets = [0];
  for (let id = 1; id <= fontId; id += 1) {
    offsets[id] = Buffer.byteLength(document);
    document += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(document);
  document += `xref\n0 ${fontId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= fontId; id += 1) document += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  document += `trailer\n<< /Size ${fontId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(document, "utf8");
}

function yieldToWorkerEvents() {
  return new Promise((resolve) => setImmediate(resolve));
}

async function run() {
  const { pageIds, temporaryPath, destinationPath } = workerData;
  await mkdir(dirname(destinationPath), { recursive: true });
  for (let completed = 1; completed <= pageIds.length; completed += 1) {
    await yieldToWorkerEvents();
    if (cancelled) {
      await rm(temporaryPath, { force: true });
      parentPort.postMessage({ type: "cancelled", completed: completed - 1 });
      parentPort.close();
      return;
    }
    if (completed % 5 === 0 || completed === pageIds.length) parentPort.postMessage({ type: "progress", completed });
  }
  await writeFile(temporaryPath, createPdf(pageIds), { flag: "wx" });
  if (cancelled) {
    await rm(temporaryPath, { force: true });
    parentPort.postMessage({ type: "cancelled", completed: pageIds.length });
    parentPort.close();
    return;
  }
  await rename(temporaryPath, destinationPath);
  parentPort.postMessage({ type: "succeeded", completed: pageIds.length });
  parentPort.close();
}

run().catch(async (error) => {
  await rm(workerData.temporaryPath, { force: true }).catch(() => undefined);
  parentPort.postMessage({ type: "failed", message: error instanceof Error ? error.message : String(error) });
  parentPort.close();
});
