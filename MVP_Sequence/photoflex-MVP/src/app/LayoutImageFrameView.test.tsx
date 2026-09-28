// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ok, type LayoutImageFrame, type PhotoId, type PhotoSource, type SourceId } from "../contracts";
import { LayoutImageFrameView } from "./LayoutImageFrameView";

afterEach(cleanup);
it("releases its preview lease when the visible page is removed", async () => {
  const release = vi.fn();
  const photoId = "photo" as PhotoId;
  const source: PhotoSource = {
    getPhoto: vi.fn(async () => ok({ id: photoId, sourceId: "source" as SourceId, relativePath: "photo.jpg", width: 1200, height: 800 })),
    derivedPreview: vi.fn(async () => ok({ url: "data:image/gif;base64,R0lGODlhAQABAAAAACw=", release })),
  } as unknown as PhotoSource;
  const frame: LayoutImageFrame = { kind: "image-frame", id: "frame" as LayoutImageFrame["id"], rect: { x: 0, y: 0, width: 200, height: 100 },
    photoId, crop: { mode: "fill", zoom: 1, focal: { x: .5, y: .5 } } };
  const view = render(<LayoutImageFrameView frame={frame} photoSource={source} sourceRevision={0} onMetadata={() => undefined} onMissing={() => undefined} />);
  await waitFor(() => expect(view.container.querySelector("img")).toBeTruthy());
  expect(source.derivedPreview).toHaveBeenCalledWith(photoId, 768);
  view.unmount();
  expect(release).toHaveBeenCalledOnce();
});

it("shows a 768px preview first and swaps its lease for the requested reading tier", async () => {
  const lowRelease = vi.fn(), highRelease = vi.fn();
  const photoId = "photo" as PhotoId;
  const source: PhotoSource = {
    getPhoto: vi.fn(async () => ok({ id: photoId, sourceId: "source" as SourceId, relativePath: "photo.jpg", width: 3000, height: 2000 })),
    derivedPreview: vi.fn(async (_id: PhotoId, edge: number) => ok({ url: `preview-${edge}`, release: edge === 768 ? lowRelease : highRelease })),
  } as unknown as PhotoSource;
  const frame: LayoutImageFrame = { kind: "image-frame", id: "frame" as LayoutImageFrame["id"], rect: { x: 0, y: 0, width: 200, height: 100 },
    photoId, crop: { mode: "fill", zoom: 1, focal: { x: .5, y: .5 } } };
  const view = render(<LayoutImageFrameView frame={frame} photoSource={source} sourceRevision={0} previewEdge={2048} eager onMetadata={() => undefined} onMissing={() => undefined} />);
  await waitFor(() => expect(view.container.querySelector("img")?.getAttribute("src")).toBe("preview-2048"));
  expect(source.derivedPreview).toHaveBeenNthCalledWith(1, photoId, 768);
  expect(source.derivedPreview).toHaveBeenNthCalledWith(2, photoId, 2048);
  expect(lowRelease).toHaveBeenCalledOnce();
  view.unmount();
  expect(highRelease).toHaveBeenCalledOnce();
});
