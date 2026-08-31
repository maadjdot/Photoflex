import { describe, expect, it } from "vitest";
import { screenToWorld, worldToScreen, zoomAroundScreenPoint } from "./viewport";

describe("worktable viewport", () => {
  it("converts screen and world coordinates in both directions", () => {
    const viewport = { originX: 40, originY: -20, zoom: 0.75 };
    const rect = { left: 100, top: 80 };
    const screen = worldToScreen({ x: 320, y: 120 }, rect, viewport);
    expect(screenToWorld(screen, rect, viewport)).toEqual({ x: 320, y: 120 });
  });

  it("keeps the world point below the cursor fixed while zooming", () => {
    const rect = { left: 10, top: 20 };
    const cursor = { x: 410, y: 320 };
    const before = { originX: 30, originY: 40, zoom: 1 };
    const world = screenToWorld(cursor, rect, before);
    const after = zoomAroundScreenPoint(before, cursor, rect, 1.5);
    expect(worldToScreen(world, rect, after)).toEqual(cursor);
  });

  it("clamps zoom to the supported range", () => {
    const rect = { left: 0, top: 0 };
    expect(zoomAroundScreenPoint({ originX: 0, originY: 0, zoom: 1 }, { x: 0, y: 0 }, rect, 10).zoom).toBe(3);
    expect(zoomAroundScreenPoint({ originX: 0, originY: 0, zoom: 1 }, { x: 0, y: 0 }, rect, 0).zoom).toBe(.25);
  });
});
