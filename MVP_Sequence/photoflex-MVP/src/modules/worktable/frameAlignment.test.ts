import { expect, it } from "vitest";
import { alignFrameRect } from "./frameAlignment";

it("snaps a moving photo box to another box and page center", () => {
  const moving = { x: 98, y: 147, width: 40, height: 30 };
  const other = { x: 50, y: 20, width: 50, height: 40 };
  const result = alignFrameRect(moving, { widthPt: 200, heightPt: 300 }, [other], 4);
  expect(result.rect).toMatchObject({ x: 100, y: 150 });
  expect(result.guides).toEqual([{ axis: "x", value: 100 }, { axis: "y", value: 150 }]);
});
