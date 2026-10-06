import { describe, expect, it } from "vitest";
import {
  beginPageCurlTurn,
  beginPageCurlGoTo,
  cancelPageCurlTurn,
  commitPageCurlTurn,
  createPageCurlNavigationState,
  pageCurlEnginePage,
  pageCurlLogicalPage,
  pageCurlBookPose,
} from "./pageCurl";

describe("page curl navigation", () => {
  it("maps a detached back cover through padding without exposing an extra document page", () => {
    expect(pageCurlEnginePage(4, "facing", 5, true)).toBe(6);
    expect(pageCurlLogicalPage(6, "facing", 5, true)).toBe(4);
    expect(pageCurlEnginePage(5, "facing", 6, true)).toBe(6);
    expect(pageCurlLogicalPage(6, "facing", 6, true)).toBe(5);
    expect(pageCurlBookPose(4, 5, "facing", true)).toMatchObject({ offset: .5, spine: 0 });
    expect(beginPageCurlGoTo(createPageCurlNavigationState(0, 5), 4, 5, "facing", true))
      .toMatchObject({ targetPage: 4 });
    expect(beginPageCurlTurn(createPageCurlNavigationState(4, 5), -1, 5, "facing", true))
      .toMatchObject({ targetPage: 3 });
  });
  it("keeps the committed spread stable until a turn lands", () => {
    const initial = createPageCurlNavigationState(0, 8);
    const turning = beginPageCurlTurn(initial, 1, 8, "facing");

    expect(turning).toEqual({ status: "turning", committedPage: 0, targetPage: 1, direction: 1 });
    expect(commitPageCurlTurn(turning, 1, 8)).toEqual({ status: "idle", committedPage: 1 });
  });

  it("returns to the committed page when a drag is cancelled", () => {
    const turning = beginPageCurlTurn(createPageCurlNavigationState(3, 8), -1, 8, "facing");
    expect(cancelPageCurlTurn(turning)).toEqual({ status: "idle", committedPage: 3 });
  });

  it("does not begin turns beyond the first or last spread", () => {
    const first = createPageCurlNavigationState(0, 5);
    const last = createPageCurlNavigationState(4, 5);
    expect(beginPageCurlTurn(first, -1, 5, "facing")).toBe(first);
    expect(beginPageCurlTurn(last, 1, 5, "single")).toBe(last);
  });

  it("normalises direct jumps to the facing spread head", () => {
    expect(beginPageCurlGoTo(createPageCurlNavigationState(0, 8), 4, 8, "facing"))
      .toEqual({ status: "turning", committedPage: 0, targetPage: 3, direction: 1 });
    expect(beginPageCurlGoTo(createPageCurlNavigationState(3, 8), 4, 8, "facing"))
      .toEqual({ status: "idle", committedPage: 3 });
    expect(beginPageCurlGoTo(createPageCurlNavigationState(3, 8), 6, 8, "single"))
      .toEqual({ status: "turning", committedPage: 3, targetPage: 6, direction: 1 });
  });

  it("maps the engine flyleaf without changing logical facing spreads", () => {
    expect([0, 1, 3].map((page) => pageCurlEnginePage(page, "facing"))).toEqual([0, 2, 4]);
    expect([0, 2, 4].map((page) => pageCurlLogicalPage(page, "facing"))).toEqual([0, 1, 3]);
    expect(pageCurlEnginePage(3, "single")).toBe(3);
    expect(pageCurlLogicalPage(3, "single")).toBe(3);
  });
});
