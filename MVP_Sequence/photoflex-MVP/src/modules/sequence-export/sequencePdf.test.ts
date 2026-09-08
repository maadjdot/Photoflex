import { PDFDocument } from "pdf-lib";
import { expect, it, vi } from "vitest";
import type { PhotoId, ProjectId, ReadingUnitId, SequenceDocument, SequenceItemId } from "../../contracts";
import { createInitialSequenceBundle } from "../sequence";
import { createSequencePdf } from "./index";

const viewport = { width: 1440, height: 1024 };
function fixture() {
  return createInitialSequenceBundle({ projectId: "project" as ProjectId, name: "白底 / Edit", content: { kind: "photos", photoIds: ["first", "second"].map((id) => id as PhotoId) } }).sequence;
}

it("preserves blank reading pages and produces a readable PDF without fetching photos", async () => {
  const base = fixture();
  const id = "blank" as SequenceItemId;
  const sequence: SequenceDocument = { ...base, items: [{ kind: "blank", id }], readingUnits: [{ kind: "blank", id: "unit" as ReadingUnitId, itemId: id }] };
  const loadJpeg = vi.fn();
  const onProgress = vi.fn();
  const bytes = await createSequencePdf({ sequence, viewport, onProgress }, { loadJpeg });
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBe(1);
  expect(pdf.getTitle()).toBe(sequence.name);
  expect(pdf.getPages()[0].getSize()).toEqual({ width: 570, height: 599.04 });
  expect(loadJpeg).not.toHaveBeenCalled();
  expect(onProgress.mock.calls.map(([value]) => value)).toEqual([{ completed: 0, total: 1 }, { completed: 1, total: 1 }]);
});

it("fails the whole export when a photo cannot be loaded, without skipping pages", async () => {
  const sequence = fixture();
  const loadJpeg = vi.fn().mockRejectedValue(new Error("Photo unavailable"));
  await expect(createSequencePdf({ sequence, viewport }, { loadJpeg })).rejects.toThrow("Photo unavailable");
  expect(loadJpeg).toHaveBeenCalledTimes(1);
  expect(loadJpeg).toHaveBeenCalledWith("first", undefined);
});

it("honors cancellation before work and after an in-flight photo load", async () => {
  const controller = new AbortController();
  controller.abort();
  const loadJpeg = vi.fn();
  await expect(createSequencePdf({ sequence: fixture(), viewport, signal: controller.signal }, { loadJpeg })).rejects.toMatchObject({ name: "AbortError" });
  expect(loadJpeg).not.toHaveBeenCalled();

  const inFlight = new AbortController();
  loadJpeg.mockImplementation(async () => { inFlight.abort(); return new Uint8Array(); });
  await expect(createSequencePdf({ sequence: fixture(), viewport, signal: inFlight.signal }, { loadJpeg })).rejects.toMatchObject({ name: "AbortError" });
  expect(loadJpeg).toHaveBeenCalledTimes(1);
});

it("rejects empty Sequences instead of manufacturing a blank PDF", async () => {
  await expect(createSequencePdf({ sequence: { ...fixture(), items: [], readingUnits: [] }, viewport }, { loadJpeg: vi.fn() })).rejects.toThrow("no pages");
});
