// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ok, type PhotoId, type PhotoSource, type ProjectId, type WorktableDraft } from "../contracts";
import { CompareOverlay } from "./CompareOverlay";

const photoA = "photo-a" as PhotoId;
const photoB = "photo-b" as PhotoId;
const draft: WorktableDraft = {
  projectId: "project" as ProjectId,
  entryOrder: [photoA, photoB],
  placements: {
    [photoA]: { photoId: photoA, filename: "A.jpg", x: 0, y: 0, width: 100, height: 100, z: 0 },
    [photoB]: { photoId: photoB, filename: "B.jpg", x: 100, y: 0, width: 100, height: 100, z: 1 },
  },
  groups: [],
  links: [],
};

describe("CompareOverlay", () => {
  it("keeps each preview URL associated with its photo after Swap", async () => {
    const preview = vi.fn(async (photoId: PhotoId) => ok({ url: `preview:${photoId}`, release() {} }));
    const photoSource = { preview } as unknown as PhotoSource;
    render(<CompareOverlay photoIds={[photoA, photoB]} draft={draft} photoSource={photoSource} onClose={() => {}} />);

    await waitFor(() => expect(screen.getByAltText("A.jpg").getAttribute("src")).toBe(`preview:${photoA}`));
    fireEvent.click(screen.getByRole("button", { name: "Swap" }));

    const images = screen.getAllByRole("img") as HTMLImageElement[];
    expect(images.map((image) => [image.alt, image.getAttribute("src")])).toEqual([
      ["B.jpg", `preview:${photoB}`],
      ["A.jpg", `preview:${photoA}`],
    ]);
    expect(preview).toHaveBeenCalledTimes(2);
  });
});
