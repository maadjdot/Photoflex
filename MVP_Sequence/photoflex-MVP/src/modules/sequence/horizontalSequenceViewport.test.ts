import { describe, expect, it } from "vitest";
import type { PhotoId, SequenceItem, SequenceItemId } from "../../contracts";
import {
  centerPhotoIndex,
  horizontalWheelIntent,
  photoInsertionToItemIndex,
  projectSequencePhotos,
  sequenceScrollTarget,
  visiblePhotoRange,
} from "./horizontalSequenceViewport";

const photo = (id: string): SequenceItem => ({
  id: id as SequenceItemId,
  kind: "photo",
  photoId: `photo-${id}` as PhotoId,
});

describe("HorizontalSequenceViewport", () => {
  it("projects only photos while preserving their complete-item indices", () => {
    const items: readonly SequenceItem[] = [
      photo("a"),
      { id: "blank" as SequenceItemId, kind: "blank" },
      { id: "text" as SequenceItemId, kind: "text", text: "note", fontSize: 24 },
      photo("b"),
    ];

    expect(projectSequencePhotos(items).map(({ item, itemIndex, photoIndex }) => ({ id: item.id, itemIndex, photoIndex }))).toEqual([
      { id: "a", itemIndex: 0, photoIndex: 0 },
      { id: "b", itemIndex: 3, photoIndex: 1 },
    ]);
  });

  it("maps a visible grid insertion point back to the complete item list", () => {
    const items: readonly SequenceItem[] = [
      photo("a"),
      { id: "blank" as SequenceItemId, kind: "blank" },
      photo("b"),
      { id: "text" as SequenceItemId, kind: "text", text: "note", fontSize: 24 },
      photo("c"),
    ];

    expect(photoInsertionToItemIndex(items, 0)).toBe(0);
    expect(photoInsertionToItemIndex(items, 1)).toBe(2);
    expect(photoInsertionToItemIndex(items, 2)).toBe(4);
    expect(photoInsertionToItemIndex(items, 3)).toBe(5);
  });

  it("maps a vertical mouse wheel to horizontal motion but preserves native trackpad horizontal input", () => {
    expect(horizontalWheelIntent(0, 120)).toEqual({ handled: true, delta: 120 });
    expect(horizontalWheelIntent(70, 12)).toEqual({ handled: false, delta: 0 });
    expect(horizontalWheelIntent(0, 0)).toEqual({ handled: false, delta: 0 });
  });

  it("calculates centered navigation, current photo and a small virtual range", () => {
    const geometry = { count: 12, itemWidth: 440, gap: 12, sidePadding: 280, viewportWidth: 1000 };
    expect(sequenceScrollTarget(3, geometry, 5000)).toBe(1356);
    expect(centerPhotoIndex(1356, geometry)).toBe(3);
    expect(visiblePhotoRange(1356, geometry, 1)).toEqual({ start: 1, end: 6 });
  });
});
