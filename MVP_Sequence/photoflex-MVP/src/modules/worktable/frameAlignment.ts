import type { FrameRect } from "../../contracts/frame";

export interface FrameAlignmentGuide {
  readonly axis: "x" | "y";
  readonly value: number;
}

export function alignFrameRect(
  moving: FrameRect,
  page: { widthPt: number; heightPt: number },
  otherRects: readonly FrameRect[],
  thresholdPt: number,
): { rect: FrameRect; guides: readonly FrameAlignmentGuide[] } {
  const xTargets = [0, page.widthPt / 2, page.widthPt];
  const yTargets = [0, page.heightPt / 2, page.heightPt];
  for (const other of otherRects) {
    xTargets.push(other.x, other.x + other.width / 2, other.x + other.width);
    yTargets.push(other.y, other.y + other.height / 2, other.y + other.height);
  }
  const nearest = (edges: readonly number[], targets: readonly number[]) => {
    const candidates = edges.flatMap((edge) => targets.map((target) => ({ target, delta: target - edge })));
    return candidates.filter((item) => Math.abs(item.delta) <= thresholdPt)
      .sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta))[0];
  };
  const x = nearest([moving.x, moving.x + moving.width / 2, moving.x + moving.width], xTargets);
  const y = nearest([moving.y, moving.y + moving.height / 2, moving.y + moving.height], yTargets);
  return {
    rect: { ...moving, x: moving.x + (x?.delta ?? 0), y: moving.y + (y?.delta ?? 0) },
    guides: [...(x ? [{ axis: "x" as const, value: x.target }] : []), ...(y ? [{ axis: "y" as const, value: y.target }] : [])],
  };
}
