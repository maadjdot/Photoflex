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
