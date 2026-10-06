import type { FrameId, FrameSlotId } from "../contracts";

export function findFrameDropTarget(stage: HTMLElement | null, clientX: number, clientY: number): { frameId: FrameId; slotId?: FrameSlotId } | undefined {
  if (!stage) return undefined;
  const frames = [...stage.querySelectorAll<HTMLElement>("[data-frame-id]")].sort((a, b) => Number(getComputedStyle(b).zIndex) - Number(getComputedStyle(a).zIndex));
  const hit = (element: HTMLElement) => { const rect = element.getBoundingClientRect(); return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom; };
  for (const frame of frames) {
    const page = frame.querySelector<HTMLElement>(".table-frame-page");
    if (!page || !hit(page)) continue;
    const slot = [...page.querySelectorAll<HTMLElement>("[data-frame-slot-id]")].reverse().find(hit);
    return { frameId: frame.dataset.frameId as FrameId, slotId: slot?.dataset.frameSlotId as FrameSlotId | undefined };
  }
  return undefined;
}
