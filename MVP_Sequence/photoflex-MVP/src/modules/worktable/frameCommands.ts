import { err, ok, type Result, type WorktableDraft } from "../../contracts";
import type { FrameCommandError, FrameEditCommand, FrameId, FrameSlot, WorktableFrame } from "../../contracts/frame";
import { defaultFrameCrop, frameTemplateRects, frameWorldSize, validFrameCrop, FRAME_MM_TO_PT } from "./frameLayout";

const failure = (kind: FrameCommandError["kind"]) => err({ kind } as FrameCommandError);
const framesOf = (draft: WorktableDraft) => draft.frames ?? {};
const orderOf = (draft: WorktableDraft): readonly FrameId[] => draft.frameOrder ?? [];

export function validWorktableFrame(frame: unknown): frame is WorktableFrame {
  if (!frame || typeof frame !== "object") return false;
  const item = frame as WorktableFrame;
  if (typeof item.id !== "string" || !item.id || typeof item.name !== "string" || !item.name.trim()) return false;
  if (![item.x, item.y, item.z, item.displayScale].every(Number.isFinite) || item.displayScale < .1 || item.displayScale > 4
    || (item.frontOfPhotos !== undefined && typeof item.frontOfPhotos !== "boolean")) return false;
  const page = item.page;
  if (!page || !Array.isArray(page.slots) || (page.background !== undefined && page.background !== "white" && page.background !== "black")) return false;
  if (page.cornerRadiusPt !== undefined && (!Number.isFinite(page.cornerRadiusPt) || page.cornerRadiusPt < 0 || page.cornerRadiusPt > 32)) return false;
  if (page.bleedPt !== undefined && (!Number.isFinite(page.bleedPt) || page.bleedPt < 0 || page.bleedPt > 20 * FRAME_MM_TO_PT)) return false;
  if (![page.widthPt, page.heightPt].every((n) => Number.isFinite(n) && n >= 50 * FRAME_MM_TO_PT && n <= 600 * FRAME_MM_TO_PT)) return false;
  const template = page.templateSource;
  if (!template || !["single", "diptych", "triptych", "quad-grid", "full-page", "square-nine-grid"].includes(template.id) || !["horizontal", "vertical"].includes(template.direction)
    || !Number.isInteger(template.version) || template.version < 1 || typeof template.modified !== "boolean") return false;
  try { frameTemplateRects(page.widthPt, page.heightPt, template); } catch { return false; }
  if (new Set(page.slots.map((slot) => slot?.id)).size !== page.slots.length) return false;
  return page.slots.every((slot) => {
    if (!slot || !slot.rect || !slot.crop || !slot.crop.focal || typeof slot.id !== "string" || !slot.id || (slot.photoId !== null && typeof slot.photoId !== "string") || (slot.origin !== undefined && slot.origin !== "manual" && slot.origin !== "template") || !validFrameCrop(slot.crop)
      || (slot.cornerRadiusPt !== undefined && (!Number.isFinite(slot.cornerRadiusPt) || slot.cornerRadiusPt < 0 || slot.cornerRadiusPt > 32))) return false;
    const { x, y, width, height } = slot.rect;
    return [x, y, width, height].every(Number.isFinite) && width >= FRAME_MM_TO_PT && height >= FRAME_MM_TO_PT
      && x + width >= FRAME_MM_TO_PT && y + height >= FRAME_MM_TO_PT
      && x <= page.widthPt - FRAME_MM_TO_PT && y <= page.heightPt - FRAME_MM_TO_PT;
  });
}

export function validFrameCollection(draft: WorktableDraft): boolean {
  const order = orderOf(draft), frames = framesOf(draft);
  return Array.isArray(order) && frames !== null && typeof frames === "object"
    && new Set(order).size === order.length && Object.keys(frames).length === order.length
    && order.every((id) => typeof id === "string" && validWorktableFrame(frames[id as FrameId]) && frames[id as FrameId].id === id);
}

export function copyFrame(frame: WorktableFrame): WorktableFrame {
  return { ...frame, page: { ...frame.page,
    templateSource: { ...frame.page.templateSource, marginsPt: { ...frame.page.templateSource.marginsPt } },
    slots: frame.page.slots.map((slot) => ({ ...slot, rect: { ...slot.rect }, crop: { ...slot.crop, focal: { ...slot.crop.focal } } })),
  } };
}

export function applyFrameCommand(draft: WorktableDraft, command: FrameEditCommand): Result<WorktableDraft, FrameCommandError> {
  const frames = framesOf(draft), order = orderOf(draft);
  if (command.type === "create-frame") {
    if (frames[command.frame.id]) return failure("duplicate-frame");
    if (!validWorktableFrame(command.frame)) return failure("invalid-frame");
    return ok({ ...draft, frameOrder: [...order, command.frame.id], frames: { ...frames, [command.frame.id]: copyFrame(command.frame) } });
  }
  const frame = frames[command.frameId];
  if (!frame) return failure("unknown-frame");
  if (command.type === "remove-frame") {
    const next = { ...frames };
    delete next[command.frameId];
    return ok({ ...draft, frameOrder: order.filter((id) => id !== command.frameId), frames: next });
  }
  const update = (replacement: WorktableFrame): Result<WorktableDraft, FrameCommandError> => {
    if (!validWorktableFrame(replacement)) return failure("invalid-frame");
    if (JSON.stringify(replacement) === JSON.stringify(frame)) return ok(draft);
    return ok({ ...draft, frames: { ...frames, [frame.id]: replacement } });
  };
  if (command.type === "move-frame") return update({ ...frame, x: frame.x + command.by.x, y: frame.y + command.by.y });
  if (command.type === "scale-frame") return update({ ...frame, displayScale: command.displayScale });
  if (command.type === "set-frame-background") return update({ ...frame, page: { ...frame.page, background: command.background } });
  if (command.type === "set-frame-bleed") return update({ ...frame, page: { ...frame.page, bleedPt: command.bleedPt } });
  if (command.type === "rename-frame") return update({ ...frame, name: command.name.trim() });
  if (command.type === "resize-frame-page") {
    if (command.reflow) {
      let rects: readonly FrameSlot["rect"][];
      try { rects = frameTemplateRects(command.widthPt, command.heightPt, frame.page.templateSource); } catch { return failure("invalid-frame"); }
      let templateIndex = 0;
      return update({ ...frame, page: { ...frame.page, widthPt: command.widthPt, heightPt: command.heightPt,
        templateSource: { ...frame.page.templateSource, modified: false },
        slots: frame.page.slots.map((slot) => slot.origin === "manual" ? slot : { ...slot, rect: rects[templateIndex++] ?? slot.rect }) } });
    }
    return update({ ...frame, page: { ...frame.page, widthPt: command.widthPt, heightPt: command.heightPt,
      templateSource: { ...frame.page.templateSource, modified: true } } });
  }
  if (command.type === "bring-frame-to-front") {
    const max = Math.max(-1, ...Object.values(draft.placements).map((p) => p.z), ...Object.values(draft.pilePlacements).map((p) => p.z),
      ...(draft.memos ?? []).map((m) => m.z ?? 0), ...Object.values(frames).map((f) => f.z));
    return frame.frontOfPhotos && frame.z === max ? ok(draft) : update({ ...frame, z: max + 1, frontOfPhotos: true });
  }
  if (command.type === "duplicate-frame") {
    if (frames[command.copyId]) return failure("duplicate-frame");
    if (command.slotIds.length !== frame.page.slots.length || new Set(command.slotIds).size !== command.slotIds.length) return failure("invalid-frame");
    const size = frameWorldSize(frame);
    let x = frame.x + size.width + 36;
    const occupied = [
      ...Object.values(frames).map((item) => ({ x: item.x, y: item.y, ...frameWorldSize(item) })),
      ...Object.values(draft.placements), ...Object.values(draft.pilePlacements), ...(draft.memos ?? []),
    ];
    while (occupied.some((item) => x < item.x + item.width + 24 && x + size.width + 24 > item.x && frame.y < item.y + item.height + 24 && frame.y + size.height + 24 > item.y)) x += size.width + 36;
    const copy: WorktableFrame = { ...copyFrame(frame), id: command.copyId, name: `${frame.name} copy`, x,
      frontOfPhotos: false, y: frame.y, z: Math.min(1, ...Object.values(draft.placements).map((item) => item.z)) - 1,
      page: { ...frame.page, slots: frame.page.slots.map((slot, index) => ({ ...slot, id: command.slotIds[index] })) } };
    return validWorktableFrame(copy) ? ok({ ...draft, frameOrder: [...order, copy.id], frames: { ...frames, [copy.id]: copy } }) : failure("invalid-frame");
  }
  if (command.type === "apply-frame-template") {
    if (command.expectedSlotIds.length !== frame.page.slots.length || command.expectedSlotIds.some((id, i) => frame.page.slots[i].id !== id)) return failure("frame-template-changed");
    const squareSide = Math.min(frame.page.widthPt, frame.page.heightPt);
    const widthPt = command.template.id === "square-nine-grid" ? squareSide : frame.page.widthPt;
    const heightPt = command.template.id === "square-nine-grid" ? squareSide : frame.page.heightPt;
    let rects;
    try { rects = frameTemplateRects(widthPt, heightPt, command.template); } catch { return failure("invalid-frame"); }
    const keepOnPage = (slot: FrameSlot): FrameSlot => command.template.id !== "square-nine-grid" ? slot : { ...slot, rect: { ...slot.rect,
      x: Math.max(FRAME_MM_TO_PT - slot.rect.width, Math.min(widthPt - FRAME_MM_TO_PT, slot.rect.x)),
      y: Math.max(FRAME_MM_TO_PT - slot.rect.height, Math.min(heightPt - FRAME_MM_TO_PT, slot.rect.y)) } };
    const managed = frame.page.slots.filter((slot) => slot.origin !== "manual");
    const manual = frame.page.slots.filter((slot) => slot.origin === "manual").map(keepOnPage);
    const targetCount = command.template.id === frame.page.templateSource.id && !managed.length ? 0 : rects.length;
    const laidOut = rects.slice(0, targetCount).map((rect, index): FrameSlot => managed[index]
      ? { ...managed[index], rect, origin: "template" }
      : { id: crypto.randomUUID() as FrameSlot["id"], rect, photoId: null, crop: defaultFrameCrop(command.template.id), origin: "template" });
    const retainedPhotos = managed.slice(targetCount).filter((slot) => slot.photoId).map((slot): FrameSlot => keepOnPage({ ...slot, origin: "manual" }));
    return update({ ...frame, page: { ...frame.page, widthPt, heightPt, templateSource: { ...command.template, modified: false }, slots: [...laidOut, ...manual, ...retainedPhotos] } });
  }
  if (command.type === "add-frame-slot") {
    if (frame.page.slots.some((slot) => slot.id === command.slotId)) return failure("invalid-frame");
    const { widthPt, heightPt } = frame.page;
    const width = Math.min(widthPt * .36, 100 * FRAME_MM_TO_PT), height = Math.min(heightPt * .3, 85 * FRAME_MM_TO_PT);
    const offset = frame.page.slots.filter((slot) => slot.origin === "manual").length * 12 * FRAME_MM_TO_PT;
    const rect = { x: Math.min(widthPt - width, (widthPt - width) / 2 + offset), y: Math.min(heightPt - height, (heightPt - height) / 2 + offset), width, height };
    const slot: FrameSlot = { id: command.slotId, rect, photoId: null, crop: defaultFrameCrop("single"), origin: "manual" };
    return update({ ...frame, page: { ...frame.page, templateSource: { ...frame.page.templateSource, modified: true }, slots: [...frame.page.slots, slot] } });
  }
  if (command.type === "remove-frame-slot") {
    if (!frame.page.slots.some((slot) => slot.id === command.slotId)) return failure("unknown-frame-slot");
    return update({ ...frame, page: { ...frame.page, templateSource: { ...frame.page.templateSource, modified: true }, slots: frame.page.slots.filter((slot) => slot.id !== command.slotId) } });
  }
  if (command.type === "bring-frame-slot-to-front") {
    const target = frame.page.slots.find((slot) => slot.id === command.slotId);
    if (!target) return failure("unknown-frame-slot");
    return update({ ...frame, page: { ...frame.page, slots: [...frame.page.slots.filter((slot) => slot.id !== target.id), target] } });
  }
  if (command.type === "set-frame-slot-corner-radius") {
    if (!frame.page.slots.some((slot) => slot.id === command.slotId)) return failure("unknown-frame-slot");
    return update({ ...frame, page: { ...frame.page, slots: frame.page.slots.map((slot) => slot.id === command.slotId ? { ...slot, cornerRadiusPt: command.cornerRadiusPt } : slot) } });
  }
  if (command.type === "fill-frame-slots") {
    const empty = frame.page.slots.filter((slot) => !slot.photoId);
    if (command.photoIds.length > empty.length) return failure("frame-capacity");
    if (!command.photoIds.length) return ok(draft);
    const fill = new Map(empty.slice(0, command.photoIds.length).map((slot, i) => [slot.id, command.photoIds[i]]));
    return update({ ...frame, page: { ...frame.page, slots: frame.page.slots.map((slot) => fill.has(slot.id) ? { ...slot, photoId: fill.get(slot.id)! } : slot) } });
  }
  const slot = frame.page.slots.find((item) => item.id === ("slotId" in command ? command.slotId : undefined));
  if (command.type === "swap-frame-photos") {
    const first = frame.page.slots.find((item) => item.id === command.firstId), second = frame.page.slots.find((item) => item.id === command.secondId);
    if (!first || !second) return failure("unknown-frame-slot");
    if (first.id === second.id) return ok(draft);
    return update({ ...frame, page: { ...frame.page, slots: frame.page.slots.map((item) => item.id === first.id ? { ...item, photoId: second.photoId, crop: second.crop }
      : item.id === second.id ? { ...item, photoId: first.photoId, crop: first.crop } : item) } });
  }
  if (!slot) return failure("unknown-frame-slot");
  const nextSlot: FrameSlot = command.type === "replace-frame-photo" ? { ...slot, photoId: command.photoId, crop: defaultFrameCrop(frame.page.templateSource.id) }
    : command.type === "clear-frame-photo" ? { ...slot, photoId: null }
      : command.type === "transform-frame-slot" ? { ...slot, rect: command.rect }
        : { ...slot, crop: command.crop };
  const templateSource = command.type === "transform-frame-slot" ? { ...frame.page.templateSource, modified: true } : frame.page.templateSource;
  return update({ ...frame, page: { ...frame.page, templateSource, slots: frame.page.slots.map((item) => item.id === slot.id ? nextSlot : item) } });
}
