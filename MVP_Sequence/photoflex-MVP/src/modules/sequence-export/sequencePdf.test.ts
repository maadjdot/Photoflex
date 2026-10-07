import { PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { expect, it, vi } from "vitest";
import type { PhotoId, ProjectId, ReadingUnitId, SequenceDocument, SequenceItemId } from "../../contracts";
import { createInitialSequenceBundle } from "../sequence";
import { createSequencePdf } from "./index";
import { photoPng } from "../../../tests/helpers/photoImages";

const viewport = { width: 1440, height: 1024 };
function fixture() {
  return createInitialSequenceBundle({ projectId: "project" as ProjectId, name: "白底 / Edit", content: { kind: "photos", photoIds: ["first", "second"].map((id) => id as PhotoId) } }).sequence;
}

it("preserves PNG alpha in single and spread pages", async () => {
  const sequence = fixture();
  const loadImage = vi.fn(async () => ({ bytes: photoPng(), format: "png" as const }));
  const pdf = await PDFDocument.load(await createSequencePdf({ sequence, viewport }, { loadImage }));
  for (const page of pdf.getPages()) {
    const images = page.node.Resources()!.lookup(PDFName.of("XObject"), PDFDict)!;
    for (const key of images.keys()) {
      const image = pdf.context.lookup(images.get(key)) as PDFRawStream;
      const mask = pdf.context.lookup(image.dict.get(PDFName.of("SMask"))) as PDFRawStream;
      expect([...new Set(decodePDFRawStream(mask).decode())]).toEqual([0, 128, 255]);
    }
  }
  expect(loadImage).toHaveBeenCalledTimes(2);
});

it("preserves blank reading pages and produces a readable PDF without fetching photos", async () => {
  const base = fixture();
  const id = "blank" as SequenceItemId;
  const sequence: SequenceDocument = { ...base, items: [{ kind: "blank", id }], readingUnits: [{ kind: "blank", id: "unit" as ReadingUnitId, itemId: id }] };
  const loadImage = vi.fn();
  const onProgress = vi.fn();
  const bytes = await createSequencePdf({ sequence, viewport, onProgress }, { loadImage });
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBe(1);
  expect(pdf.getTitle()).toBe(sequence.name);
  expect(pdf.getPages()[0].getSize()).toEqual({ width: 570, height: 599.04 });
  expect(loadImage).not.toHaveBeenCalled();
  expect(onProgress.mock.calls.map(([value]) => value)).toEqual([{ completed: 0, total: 1 }, { completed: 1, total: 1 }]);
});

it("fails the whole export when a photo cannot be loaded, without skipping pages", async () => {
  const sequence = fixture();
  const loadImage = vi.fn().mockRejectedValue(new Error("Photo unavailable"));
  await expect(createSequencePdf({ sequence, viewport }, { loadImage })).rejects.toThrow("Photo unavailable");
  expect(loadImage).toHaveBeenCalledTimes(1);
  expect(loadImage).toHaveBeenCalledWith("first", undefined);
});

it("honors cancellation before work and after an in-flight photo load", async () => {
  const controller = new AbortController();
  controller.abort();
  const loadImage = vi.fn();
  await expect(createSequencePdf({ sequence: fixture(), viewport, signal: controller.signal }, { loadImage })).rejects.toMatchObject({ name: "AbortError" });
  expect(loadImage).not.toHaveBeenCalled();

  const inFlight = new AbortController();
  loadImage.mockImplementation(async () => { inFlight.abort(); return new Uint8Array(); });
  await expect(createSequencePdf({ sequence: fixture(), viewport, signal: inFlight.signal }, { loadImage })).rejects.toMatchObject({ name: "AbortError" });
  expect(loadImage).toHaveBeenCalledTimes(1);
});

it("rejects empty Sequences instead of manufacturing a blank PDF", async () => {
  await expect(createSequencePdf({ sequence: { ...fixture(), items: [], readingUnits: [] }, viewport }, { loadImage: vi.fn() })).rejects.toThrow("no pages");
});
