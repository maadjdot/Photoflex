// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { FramePhotoEdge } from "./FrameEdges";

afterEach(cleanup);

it("separates solid color edges with an optional white ring and scales it with the photo", () => {
  const edge = { mode: "color" as const, color: "#333333", widthPt: 2 };
  const rect = { x: 0, y: 25, width: 100, height: 50 };
  const view = render(<FramePhotoEdge edge={edge} rect={rect} cornerRadiusPt={0} scale={.5} />);
  let border = view.container.querySelector<HTMLElement>(".table-frame-inner-edge")!;
  expect(border.style.left).toBe("-2.25px");
  expect(border.style.width).toBe("104.5px");
  expect(border.style.boxShadow).toContain("0.25px");
  view.rerender(<FramePhotoEdge edge={{ ...edge, whiteGap: false }} rect={rect} cornerRadiusPt={0} scale={.5} />);
  border = view.container.querySelector<HTMLElement>(".table-frame-inner-edge")!;
  expect(border.style.left).toBe("-2px");
  expect(border.style.width).toBe("104px");
  expect(border.style.boxShadow).toBe("none");
  view.rerender(<FramePhotoEdge edge={{ ...edge, mode: "none" }} rect={rect} cornerRadiusPt={0} />);
  expect(view.container.firstChild).toBeNull();
});
