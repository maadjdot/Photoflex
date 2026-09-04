// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ok, type DerivedPreviewMaxEdge, type PhotoId, type PhotoSource, type PreviewLease } from "../contracts";
import { MemoryPhotoSource } from "../platform/memory/MemoryPhotoSource";
import { PhotoThumb } from "./PhotoThumb";

const photoId = "resolution-policy-photo" as PhotoId;

const lease = (url: string): PreviewLease => ({ url, release: vi.fn() });

describe("PhotoThumb resolution policy", () => {
  afterEach(() => cleanup());

  it("routes each UI context to its intended derived-image tier", async () => {
    const photoSource: PhotoSource = new MemoryPhotoSource();
    const thumbnail = vi.spyOn(photoSource, "thumbnail").mockResolvedValue(ok(lease("thumbnail")));
    const derivedPreview = vi.spyOn(photoSource, "derivedPreview").mockImplementation(async (_id: PhotoId, maxEdge: DerivedPreviewMaxEdge) => ok(lease(`derived-${maxEdge}`)));
    const preview = vi.spyOn(photoSource, "preview").mockResolvedValue(ok(lease("original")));

    render(<>
      <PhotoThumb photoSource={photoSource} photoId={photoId} alt="thumbnail" />
      <PhotoThumb photoSource={photoSource} photoId={photoId} alt="table" resolution="table" />
      <PhotoThumb photoSource={photoSource} photoId={photoId} alt="sequence" resolution="sequence" />
      <PhotoThumb photoSource={photoSource} photoId={photoId} alt="read" resolution="read" />
      <PhotoThumb photoSource={photoSource} photoId={photoId} alt="full" resolution="full" />
    </>);

    await waitFor(() => expect(preview).toHaveBeenCalledTimes(1));
    expect(thumbnail).toHaveBeenCalledWith(photoId);
    expect(derivedPreview.mock.calls).toEqual([
      [photoId, 768],
      [photoId, 1536],
      [photoId, 2048],
    ]);
    expect(preview).toHaveBeenCalledWith(photoId);
  });
});
