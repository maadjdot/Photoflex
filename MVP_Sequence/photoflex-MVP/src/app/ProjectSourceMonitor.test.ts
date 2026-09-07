import { expect, it, vi } from "vitest";
import { ok, type Result, type SourceError, type SourceId, type SourceScanEvent } from "../contracts";
import { MemoryPhotoSource } from "../platform/memory/MemoryPhotoSource";
import { startSharedScan } from "./ProjectSourceMonitor";

class ThrowingThenSuccessfulPhotoSource extends MemoryPhotoSource {
  attempts = 0;

  override async *scan(sourceId: SourceId): AsyncIterable<Result<SourceScanEvent, SourceError>> {
    this.attempts += 1;
    if (this.attempts === 1) throw new Error("scan adapter failed");
    yield ok({
      kind: "completed",
      state: {
        sourceId,
        status: "empty",
        discoveredCount: 0,
        indexedCount: 0,
        skippedCount: 0,
        failedCount: 0,
      },
    });
  }
}

it("allows a source scan to be retried after the async iterator throws", async () => {
  const photoSource = new ThrowingThenSuccessfulPhotoSource();
  const sourceId = "throwing-source" as SourceId;

  startSharedScan(photoSource, sourceId);
  await vi.waitFor(() => expect(photoSource.attempts).toBe(1));
  await new Promise((resolve) => setTimeout(resolve, 0));
  startSharedScan(photoSource, sourceId);

  await vi.waitFor(() => expect(photoSource.attempts).toBe(2));
});
