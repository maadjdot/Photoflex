import { expect, it } from "vitest";
import type { LayoutPageId } from "../../contracts";
import { createEmptyLayout } from "./layoutDocument";
import { layoutPageLabel, layoutPageNumber, layoutPageProgressLabel } from "./layoutPageNumbers";

const base = createEmptyLayout({ id: "layout" as import("../../contracts").LayoutId,
  projectId: "project" as import("../../contracts").ProjectId, sequenceId: "sequence" as import("../../contracts").SequenceId,
  pageId: "body" as LayoutPageId, name: "Book", createdAt: "now" });

it("numbers body pages from one, excluding covers and renumbering after reorder", () => {
  const layout = { ...base, pages: [{ id: "cover" as LayoutPageId, kind: "cover" as const, objects: [] },
    base.pages[0], { id: "second" as LayoutPageId, objects: [] },
    { id: "back" as LayoutPageId, kind: "back-cover" as const, objects: [] }] };
  expect(layout.pages.map((_, index) => layoutPageNumber(layout, index))).toEqual([null, 1, 2, null]);
  expect(layoutPageLabel(layout, 0)).toBe("Front cover");
  expect(layoutPageLabel(layout, 1, true)).toBe("第 1 页");
  expect(layoutPageLabel(layout, 3, true)).toBe("封底");
  expect(layoutPageProgressLabel(layout, [1, 2])).toBe("1–2 / 2");
  expect(layoutPageProgressLabel(layout, [0], true)).toBe("封面");
  const reordered = { ...layout, pages: [layout.pages[0], layout.pages[2], layout.pages[1], layout.pages[3]] };
  expect(layoutPageNumber(reordered, reordered.pages.findIndex((page) => page.id === "body"))).toBe(2);
});

it("starts legacy layouts without a cover at one and keeps navigation labels when numbers are hidden", () => {
  expect(layoutPageNumber(base, 0)).toBe(1);
  expect(layoutPageProgressLabel(base, [0])).toBe("1 / 1");
  expect(layoutPageLabel({ ...base, showPageNumbers: false }, 0)).toBe("Page 1");
});
