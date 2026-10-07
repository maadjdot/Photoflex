import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { photoPng } from "../helpers/photoImages";

async function preparePhotos(page: Page) {
  await page.goto("/");
  return page.evaluate(async ({ png, apng }) => {
    const sourceModule = "/src/platform/browser/BrowserPhotoSource.ts";
    const { BrowserPhotoSource } = await import(/* @vite-ignore */ sourceModule);
    const directory = await (await navigator.storage.getDirectory()).getDirectoryHandle("formats", { create: true });
    const write = async (name: string, bytes: BlobPart) => {
      const handle = await directory.getFileHandle(name, { create: true });
      const writer = await handle.createWritable(); await writer.write(new Blob([bytes])); await writer.close();
      return handle;
    };
    await write("alpha.PNG", new Uint8Array(png));
    await write("animation.apng", new Uint8Array(apng));
    await write("broken.png", "not an image");
    await write("unsupported.gif", "unsupported");
    const canvas = document.createElement("canvas"); canvas.width = 1200; canvas.height = 800;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "rgba(255,0,0,.5)"; context.fillRect(400, 0, 400, 800);
    context.fillStyle = "#f00"; context.fillRect(800, 0, 400, 800);
    const encode = (type: string) => new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!), type, 1));
    await write("alpha.WeBp", await encode("image/webp"));
    context.fillStyle = "#f00"; context.fillRect(0, 0, 1200, 800);
    await write("legacy.JPG", await encode("image/jpeg"));

    // Build two real animated WebP frames from the browser's static encoder.
    canvas.width = 96; canvas.height = 64;
    const concat = (parts: Uint8Array[]) => {
      const result = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
      let offset = 0; for (const part of parts) { result.set(part, offset); offset += part.length; } return result;
    };
    const chunk = (kind: string, data: Uint8Array) => {
      const header = new Uint8Array(8); header.set(new TextEncoder().encode(kind));
      new DataView(header.buffer).setUint32(4, data.length, true);
      return concat([header, data, new Uint8Array(data.length % 2)]);
    };
    const frames: Uint8Array[] = [];
    for (const color of ["#f00", "#0f0"]) {
      context.clearRect(0, 0, 96, 64); context.fillStyle = color;
      context.globalAlpha = .5; context.fillRect(32, 0, 32, 64);
      context.globalAlpha = 1; context.fillRect(64, 0, 32, 64);
      const bytes = new Uint8Array(await (await encode("image/webp")).arrayBuffer());
      const parts: Uint8Array[] = [];
      for (let at = 12; at + 8 <= bytes.length;) {
        const size = new DataView(bytes.buffer).getUint32(at + 4, true);
        const name = new TextDecoder().decode(bytes.slice(at, at + 4));
        if (["ALPH", "VP8 ", "VP8L"].includes(name)) parts.push(bytes.slice(at, at + 8 + size + size % 2));
        at += 8 + size + size % 2;
      }
      const header = new Uint8Array(16);
      header[6] = 95; header[9] = 63; header[12] = 100; header[15] = 2;
      frames.push(chunk("ANMF", concat([header, ...parts])));
    }
    const extended = new Uint8Array(10); extended[0] = 0x12; extended[4] = 95; extended[7] = 63;
    const body = concat([new TextEncoder().encode("WEBP"), chunk("VP8X", extended), chunk("ANIM", new Uint8Array(6)), ...frames]);
    const riff = new Uint8Array(8); riff.set(new TextEncoder().encode("RIFF")); new DataView(riff.buffer).setUint32(4, body.length, true);
    await write("animation.webp", concat([riff, body]));
    const source = new BrowserPhotoSource({ databaseName: "photoflex-mvp", picker: async () => directory });
    const grant = await source.chooseFolder([]);
    if (!grant.ok) throw Error(JSON.stringify(grant));
    let state;
    for await (const result of source.scan(grant.value.sourceId)) {
      if (!result.ok) throw Error(JSON.stringify(result)); state = result.value.state;
    }
    const listed = await source.listPhotos(grant.value.sourceId);
    if (!listed.ok) throw Error("index failed");
    const decoderModule = "/src/platform/browser/photoImage.ts";
    const { decodePhotoImage } = await import(/* @vite-ignore */ decoderModule);
    const errors = [];
    for await (const [name, handle] of (directory as any).entries()) {
      if (name === "broken.png" || name === "unsupported.gif") continue;
      try { (await decodePhotoImage(await handle.getFile())).close(); }
      catch (error) { errors.push({ name, error: String(error) }); }
    }
    (window as any).__formats = { source, directory, photos: listed.value.items };
    return { state, errors, sourceId: grant.value.sourceId, photos: listed.value.items };
  }, { png: Array.from(photoPng(1200, 800)), apng: Array.from(photoPng(96, 64, true)) });
}

test("imports mixed formats, retains alpha and freezes both animation formats across preview sizes and refresh", async ({ page }) => {
  const fixture = await preparePhotos(page);
  expect(fixture.errors).toEqual([]);
  expect(fixture.state).toMatchObject({ indexedCount: 5, skippedCount: 1, failedCount: 1 });
  const results = await page.evaluate(async () => {
    const { source, directory, photos } = (window as any).__formats;
    const samples = async (url: string) => {
      const image = new Image(); image.src = url; await image.decode();
      const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d")!;
      const sample = () => {
        context.clearRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0);
        return [.15, .5, .85].map((x) => [...context.getImageData(Math.floor(canvas.width * x), Math.floor(canvas.height / 2), 1, 1).data]);
      };
      const first = sample(); await new Promise((resolve) => setTimeout(resolve, 350));
      return { first, later: sample(), width: canvas.width };
    };
    const results = [];
    for (const photo of photos.filter((photo: any) => !photo.relativePath.endsWith("JPG"))) {
      for (const size of ["thumbnail", 768, 2048, "original"]) {
        const lease = size === "thumbnail" ? await source.thumbnail(photo.id) : size === "original" ? await source.preview(photo.id) : await source.derivedPreview(photo.id, size);
        if (!lease.ok) throw Error(`preview failed ${photo.relativePath}: ${JSON.stringify(lease)}`);
        try { results.push({ name: photo.relativePath, size, ...await samples(lease.value.url) }); }
        finally { lease.value.release(); }
      }
    }
    const handles = await Promise.all(photos.map((photo: any) => directory.getFileHandle(photo.relativePath)));
    const dropped = await source.ingestDroppedFiles(handles, [{ id: photos[0].sourceId, kind: "folder", displayName: "formats", createdAt: "now" }], "external");
    if (!dropped.ok) throw Error("drop failed");
    const exportModule = "/src/platform/browser/exportSequenceFolder.ts";
    const { exportSequenceFolder } = await import(/* @vite-ignore */ exportModule);
    const destination = await (await navigator.storage.getDirectory()).getDirectoryHandle("exports", { create: true });
    (window as any).showDirectoryPicker = async () => destination;
    const copied = await exportSequenceFolder({ name: "Originals", items: photos.map((photo: any) => ({ kind: "photo", id: photo.id, photoId: photo.id })) }, source);
    const exported = await destination.getDirectoryHandle(copied.folderName);
    const unchanged = [];
    for (const photo of photos) {
      const original = new Uint8Array(await (await (await directory.getFileHandle(photo.relativePath)).getFile()).arrayBuffer());
      const copy = new Uint8Array(await (await (await exported.getFileHandle(photo.relativePath)).getFile()).arrayBuffer());
      unchanged.push(original.length === copy.length && original.every((byte, index) => byte === copy[index]));
    }
    await source.close();
    return { previews: results, unchanged, dropped: dropped.value.items.map((item: any) => ({ id: item.photo.id, status: item.status })) };
  });
  for (const result of results.previews) {
    expect(result.first[0][3], `${result.name} ${result.size} transparent`).toBe(0);
    expect(result.first[1][3]).toBeCloseTo(128, -1);
    expect(result.first[2][0]).toBeGreaterThan(235);
    expect(result.first[2][1]).toBeLessThan(15);
    expect(result.first[2][2]).toBeLessThan(15);
    expect(result.later).toEqual(result.first);
  }
  expect(results.dropped.map((item: { status: string }) => item.status)).toEqual(Array(5).fill("reused"));
  expect(results.unchanged).toEqual(Array(5).fill(true));
  await page.reload();
  const restored = await page.evaluate(async (sourceId) => {
    const module = "/src/platform/browser/BrowserPhotoSource.ts";
    const { BrowserPhotoSource } = await import(/* @vite-ignore */ module);
    const source = new BrowserPhotoSource({ databaseName: "photoflex-mvp" });
    const grant = await source.restoreFolder(sourceId);
    for await (const _result of source.scan(sourceId)) { /* Wait for indexing. */ }
    const listed = await source.listPhotos(sourceId);
    await source.close();
    return { grant, ids: listed.ok ? listed.value.items.map((photo: any) => photo.id) : [] };
  }, fixture.sourceId);
  expect(restored.grant.ok).toBe(true);
  expect(restored.ids).toEqual(fixture.photos.map((photo: any) => photo.id));
});

test("exports alpha and the first animation frame in all PDF qualities and composites Frame JPEG on paper", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await preparePhotos(page);
  const qualityResults = await page.evaluate(async () => {
    const module = "/src/platform/browser/exportLayoutPdf.ts";
    const { loadLayoutPhoto } = await import(/* @vite-ignore */ module);
    const { source, photos } = (window as any).__formats;
    const results = [];
    for (const photo of photos) for (const quality of ["low", "medium", "high", "original"]) {
      const frame = { kind: "image-frame", id: "image", photoId: photo.id, rect: { x: 20, y: 20, width: 288, height: 192 },
        crop: { mode: "fill", zoom: 1, focal: { x: .5, y: .5 } } };
      const image = await loadLayoutPhoto(source, photo.id, frame, quality);
      const bitmap = await createImageBitmap(new Blob([image.bytes]));
      const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext("2d")!; context.drawImage(bitmap, 0, 0); bitmap.close();
      const samples = [.15, .5, .85].map((x) => [...context.getImageData(Math.floor(canvas.width * x), Math.floor(canvas.height / 2), 1, 1).data]);
      results.push({ name: photo.relativePath, quality, format: image.format, width: image.width, height: image.height, samples });
    }
    return results;
  });
  for (const image of qualityResults) {
    const jpeg = image.name.endsWith("JPG");
    expect(image.format).toBe(jpeg ? "jpg" : "png");
    expect(image.samples[0][3]).toBe(jpeg ? 255 : 0);
    if (!jpeg) expect(image.samples[1][3]).toBeCloseTo(128, -1);
    expect(image.samples[2][0]).toBeGreaterThan(235);
    expect(image.samples[2][1]).toBeLessThan(15);
    if (image.name === "alpha.PNG" || image.name === "alpha.WeBp") {
      expect(image.width).toBe({ low: 600, medium: 880, high: 1200, original: 1200 }[image.quality as string]);
    }
  }
  const sequenceDownload = page.waitForEvent("download");
  await page.evaluate(async () => {
    const adapter = "/src/platform/browser/exportSequencePdf.ts", sequenceModule = "/src/modules/sequence/index.ts";
    const { exportSequencePdf } = await import(/* @vite-ignore */ adapter);
    const { createInitialSequenceBundle } = await import(/* @vite-ignore */ sequenceModule);
    const { source, photos } = (window as any).__formats;
    const sequence = createInitialSequenceBundle({ projectId: "project", name: "Alpha sequence",
      content: { kind: "photos", photoIds: photos.map((photo: any) => photo.id) } }).sequence;
    await exportSequencePdf({ sequence, viewport: { width: 1440, height: 1024 } }, source);
  });
  const sequencePath = testInfo.outputPath("sequence-alpha.pdf");
  await (await sequenceDownload).saveAs(sequencePath);
  const sequencePdf = await PDFDocument.load(await readFile(sequencePath));
  expect(sequencePdf.getPageCount()).toBe(5);
  const alphaImages = sequencePdf.context.enumerateIndirectObjects().filter(([, value]) => value instanceof PDFRawStream && value.dict.has(PDFName.of("SMask")));
  expect(alphaImages).toHaveLength(4);
  for (const [, value] of alphaImages) {
    const mask = sequencePdf.context.lookup((value as PDFRawStream).dict.get(PDFName.of("SMask"))) as PDFRawStream;
    expect(new Set(decodePDFRawStream(mask).decode())).toContain(0);
    expect(new Set(decodePDFRawStream(mask).decode())).toContain(128);
  }
  const frameResults = await page.evaluate(async () => {
    const adapter = "/src/platform/browser/exportFrameJpeg.ts", geometry = "/src/modules/worktable/frameLayout.ts", paperModule = "/src/modules/layout/layoutPaper.ts";
    const { createFrameJpeg } = await import(/* @vite-ignore */ adapter);
    const { frameTemplateSource } = await import(/* @vite-ignore */ geometry);
    const { layoutPaperMaterial } = await import(/* @vite-ignore */ paperModule);
    const { source, photos } = (window as any).__formats;
    const results = [];
    for (const paper of [{ color: "#123456", material: "none" }, { color: "#28282A", material: "none" }, { color: "#835660", material: "fine-paper" }]) {
      const photo = photos.find((photo: any) => photo.relativePath === "animation.apng");
      const frame = { id: "frame", name: "Alpha", x: 0, y: 0, z: 1, displayScale: 1,
        page: { widthPt: 360, heightPt: 240, paper, templateSource: frameTemplateSource("single"),
          slots: [{ id: "slot", photoId: photo.id, rect: { x: 36, y: 24, width: 288, height: 192 },
            crop: { mode: "fill", zoom: 1, focal: { x: .5, y: .5 } } }] } };
      const element = document.createElement("div");
      element.style.cssText = `width:360px;height:240px;position:relative;background-color:${paper.color}`;
      const texture = layoutPaperMaterial(paper.material).textureUrl;
      if (texture) element.style.backgroundImage = `url("${texture}")`;
      element.innerHTML = '<div class="table-frame-slot has-photo" data-frame-slot-id="slot" style="position:absolute;left:36px;top:24px;width:288px;height:192px;border:0"><div class="table-frame-photo-clip"><img></div></div>';
      document.body.append(element);
      const blob = await createFrameJpeg(frame, element, source);
      element.remove();
      const bitmap = await createImageBitmap(blob), canvas = document.createElement("canvas");
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext("2d")!; context.drawImage(bitmap, 0, 0); bitmap.close();
      const sample = (x: number, y: number) => [...context.getImageData(Math.floor(x * canvas.width / 360), Math.floor(y * canvas.height / 240), 1, 1).data];
      results.push({ paper, background: sample(20, 120), transparent: sample(70, 120), half: sample(180, 120), red: sample(280, 120) });
      const url = URL.createObjectURL(blob), img = document.createElement("img"); img.src = url; img.style.width = "360px";
      document.body.append(img);
    }
    return results;
  });
  for (const image of frameResults) {
    if (image.paper.material === "none") {
      const paper = image.paper.color.slice(1).match(/../g)!.map((hex: string) => parseInt(hex, 16));
      paper.forEach((channel: number, index: number) => expect(Math.abs(image.transparent[index] - channel)).toBeLessThan(5));
      expect(image.half[0]).toBeGreaterThan(image.transparent[0]);
    } else expect(image.transparent[0]).toBeGreaterThan(50);
    expect(image.red[0]).toBeGreaterThan(235); expect(image.red[1]).toBeLessThan(15);
  }
  await page.screenshot({ path: testInfo.outputPath("transparent-frame-exports.png"), fullPage: true });
});

test("downloads Layout PDF in every quality and preserves Fit, cropped alpha and JPEG orientation", async ({ page }, testInfo) => {
  await preparePhotos(page);
  const geometry = await page.evaluate(async () => {
    const module = "/src/platform/browser/exportLayoutPdf.ts";
    const { loadLayoutPhoto } = await import(/* @vite-ignore */ module);
    const { source, photos, directory } = (window as any).__formats;
    const png = photos.find((photo: any) => photo.relativePath === "alpha.PNG");
    const frame = { kind: "image-frame", id: "image", photoId: png.id, rect: { x: 20, y: 20, width: 288, height: 288 },
      crop: { mode: "fit", zoom: 1, focal: { x: .5, y: .5 } } };
    const fit = await loadLayoutPhoto(source, png.id, frame, "low");
    const crop = await loadLayoutPhoto(source, png.id, { ...frame, rect: { ...frame.rect, height: 192 },
      crop: { ...frame.crop, mode: "fill", zoom: 2 } }, "high");
    const jpeg = new Uint8Array(await (await (await directory.getFileHandle("legacy.JPG")).getFile()).arrayBuffer());
    const exif = new Uint8Array([0xff, 0xe1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0, 0,
      0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 1, 0, 0x12, 1, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0]);
    const rotated = new Uint8Array(jpeg.length + exif.length);
    rotated.set(jpeg.slice(0, 2)); rotated.set(exif, 2); rotated.set(jpeg.slice(2), exif.length + 2);
    const originalSource = { readOriginalFile: async () => ({ ok: true, value: new Blob([rotated]) }),
      getPhoto: async () => ({ ok: true, value: { width: 800, height: 1200 } }) };
    const oriented = await loadLayoutPhoto(originalSource, "rotated", frame, "original");
    return { fit: { width: fit.width, height: fit.height, rect: fit.renderedRect },
      crop: { width: crop.width, height: crop.height, rect: crop.renderedRect }, oriented: { width: oriented.width, height: oriented.height, format: oriented.format } };
  });
  expect(geometry.fit).toEqual({ width: 600, height: 400, rect: { x: 0, y: 48, width: 288, height: 192 } });
  expect(geometry.crop).toEqual({ width: 600, height: 400, rect: { x: 0, y: 0, width: 288, height: 192 } });
  expect(geometry.oriented).toEqual({ width: 800, height: 1200, format: "jpg" });
  for (const quality of ["low", "medium", "high", "original"]) {
    const downloadEvent = page.waitForEvent("download");
    await page.evaluate(async (quality) => {
      const module = "/src/platform/browser/exportLayoutPdf.ts", documentModule = "/src/modules/layout/layoutDocument.ts";
      const { exportLayoutPdf } = await import(/* @vite-ignore */ module);
      const { createEmptyLayout } = await import(/* @vite-ignore */ documentModule);
      const { source, photos } = (window as any).__formats;
      const snapshot = createEmptyLayout({ id: "layout", projectId: "project", sequenceId: "sequence", pageId: "first",
        name: `Alpha ${quality}`, createdAt: "now", widthPt: 360, heightPt: 240 });
      snapshot.showPageNumbers = false;
      snapshot.pages = photos.map((photo: any, index: number) => ({ id: `page-${index}`,
        paper: { color: "#123456", material: index === 1 ? "fine-paper" : "none" }, photoElevationPt: 4,
        innerEdge: { mode: "color", color: "#333333", widthPt: 3, whiteGap: true },
        objects: [{ kind: "image-frame", id: `image-${index}`, photoId: photo.id, rect: { x: 36, y: 24, width: 288, height: 192 },
          crop: { mode: "fill", zoom: 1, focal: { x: .5, y: .5 } } }] }));
      await exportLayoutPdf(snapshot, source, undefined, undefined, quality);
    }, quality);
    const path = testInfo.outputPath(`layout-alpha-${quality}.pdf`);
    await (await downloadEvent).saveAs(path);
    const pdf = await PDFDocument.load(await readFile(path));
    expect(pdf.getPageCount()).toBe(5);
    const alphaImages = pdf.context.enumerateIndirectObjects().filter(([, value]) => value instanceof PDFRawStream && value.dict.has(PDFName.of("SMask")));
    expect(alphaImages).toHaveLength(4);
    for (const [, value] of alphaImages) {
      const image = value as PDFRawStream;
      const width = image.dict.lookup(PDFName.of("Width"), PDFNumber).asNumber();
      const height = image.dict.lookup(PDFName.of("Height"), PDFNumber).asNumber();
      const rgb = decodePDFRawStream(image).decode();
      const at = (Math.floor(height / 2) * width + Math.floor(width * .85)) * 3;
      expect(rgb[at]).toBeGreaterThan(235);
      expect(rgb[at + 1]).toBeLessThan(15);
      expect(rgb[at + 2]).toBeLessThan(15);
      const mask = pdf.context.lookup(image.dict.get(PDFName.of("SMask"))) as PDFRawStream;
      const alpha = new Set(decodePDFRawStream(mask).decode());
      for (const channel of [0, 128, 255]) expect(alpha).toContain(channel);
    }
    const images = pdf.getPage(0).node.Resources()!.lookup(PDFName.of("XObject"), PDFDict)!;
    expect(images.keys()).toHaveLength(1);
  }
});

test("shows new formats in the photo library, Canvas, Sequence and Layout without opaque photo backgrounds", async ({ page }, testInfo) => {
  const fixture = await preparePhotos(page);
  const ids = await page.evaluate(async ({ sourceId, photos }) => {
    const storeModule = "/src/platform/browser/IndexedDbProjectStore.ts", tableModule = "/src/modules/worktable/worktableEditor.ts";
    const sequenceModule = "/src/modules/sequence/index.ts", layoutModule = "/src/modules/layout/layoutDocument.ts";
    const { IndexedDbProjectStore } = await import(/* @vite-ignore */ storeModule);
    const { createWorktableEditor } = await import(/* @vite-ignore */ tableModule);
    const { createInitialSequenceBundle } = await import(/* @vite-ignore */ sequenceModule);
    const { createEmptyLayout } = await import(/* @vite-ignore */ layoutModule);
    const store = IndexedDbProjectStore.open();
    const created = await store.createProject({ id: "formats-project", name: "Image formats", createdAt: new Date().toISOString(),
      initialSource: { id: sourceId, kind: "folder", displayName: "formats", createdAt: "now" } });
    if (!created.ok) throw Error("project failed");
    const editor = createWorktableEditor(created.value.worktableDraft);
    const placed = editor.execute({ type: "place", items: photos.map((photo: any) => ({ photoId: photo.id, width: 235,
      height: 235 * photo.height / photo.width, filename: photo.relativePath })) });
    if (!placed.ok) throw Error("placement failed");
    const saved = await store.saveWorktable(created.value.projectId, editor.snapshot(), created.value.revision);
    if (!saved.ok) throw Error("table save failed");
    const bundle = createInitialSequenceBundle({ projectId: created.value.projectId, name: "New formats",
      content: { kind: "photos", photoIds: photos.map((photo: any) => photo.id) } });
    const sequence = await store.createSequence(created.value.projectId, saved.value.revision, bundle.sequence, bundle.initialVersion,
      { ...editor.snapshot(), pileOrder: [bundle.sequence.id], pilePlacements: { [bundle.sequence.id]:
        { sequenceId: bundle.sequence.id, x: 800, y: 400, width: 350, height: 170, z: 10 } } });
    if (!sequence.ok) throw Error("sequence save failed");
    const layout = createEmptyLayout({ id: "formats-layout", projectId: created.value.projectId, sequenceId: bundle.sequence.id,
      pageId: "body", name: "New formats", createdAt: "now", widthPt: 360, heightPt: 240 });
    layout.pages[0] = { ...layout.pages[0], paper: { color: "#123456", material: "fine-paper" },
      objects: [{ id: "photo", kind: "image-frame", photoId: photos.find((photo: any) => photo.relativePath === "alpha.PNG").id,
        rect: { x: 36, y: 24, width: 288, height: 192 }, crop: { mode: "fill", zoom: 1, focal: { x: .5, y: .5 } } }] };
    const result = await store.createLayout(created.value.projectId, sequence.value.revision, layout);
    if (!result.ok) throw Error("layout failed");
    await store.close();
    return { projectId: created.value.projectId, sequenceId: bundle.sequence.id, layoutId: layout.id };
  }, fixture);
  await page.goto(`/#/projects/${ids.projectId}/sources/${fixture.sourceId}`);
  await expect(page.getByRole("heading", { name: "formats", exact: true })).toBeVisible();
  await expect(page.locator(".photo-tile img")).toHaveCount(5);
  await page.goto(`/#/projects/${ids.projectId}/table`);
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await expect(page.locator(".worktable-photo img")).toHaveCount(5);
  await expect(page.locator(".worktable-photo").first()).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await page.screenshot({ path: testInfo.outputPath("canvas-transparent-photos.png") });
  await page.goto(`/#/projects/${ids.projectId}/sequences/${ids.sequenceId}`);
  const sequence = page.getByRole("dialog", { name: "Sequence New formats" });
  await expect(sequence.locator(".sequence-overlay-card img")).toHaveCount(5);
  await sequence.getByRole("button", { name: "Read", exact: true }).click();
  await expect(page.locator(".sequence-read img").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto(`/#/projects/${ids.projectId}/sequences/${ids.sequenceId}/layout/${ids.layoutId}`);
  await expect(page.locator(".layout-placed-image")).toBeVisible();
  await page.getByRole("button", { name: "Single", exact: true }).click();
  await page.getByRole("button", { name: "Fit page", exact: true }).click();
  await expect(page.locator(".layout-object-image-frame")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await page.screenshot({ path: testInfo.outputPath("layout-transparent-photo.png") });
  await page.getByRole("button", { name: "Read", exact: true }).click();
  await expect(page.locator(".layout-reader .layout-placed-image").first()).toBeVisible();
});
