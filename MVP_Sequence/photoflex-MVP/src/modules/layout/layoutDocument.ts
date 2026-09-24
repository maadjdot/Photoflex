import { err, ok, type LayoutDocument, type LayoutEditCommand, type LayoutId, type LayoutObject, type LayoutPage, type LayoutPageId, type LayoutRevision, type ProjectId, type Result, type SequenceId } from "../../contracts";
import { MM_TO_PT, validCrop } from "../page-layout/pageGeometry";

export function createEmptyLayout(input: { id: LayoutId; projectId: ProjectId; sequenceId: SequenceId; pageId: LayoutPageId; name: string; createdAt: string; widthPt?: number; heightPt?: number }): LayoutDocument {
  return {
    schemaVersion: 1, id: input.id, projectId: input.projectId, sequenceId: input.sequenceId,
    name: input.name, pageSpec: { widthPt: input.widthPt ?? 210 * MM_TO_PT, heightPt: input.heightPt ?? 297 * MM_TO_PT },
    pages: [{ id: input.pageId, objects: [] }], revision: 0 as LayoutRevision,
    createdAt: input.createdAt, updatedAt: input.createdAt,
  };
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const id = (value: unknown): value is string => typeof value === "string" && value.length > 0;

function validRect(value: unknown, widthPt: number, heightPt: number): boolean {
  if (!value || typeof value !== "object") return false;
  const rect = value as Record<string, unknown>;
  if (![rect.x, rect.y, rect.width, rect.height].every(finite)) return false;
  const { x, y, width, height } = rect as unknown as { x: number; y: number; width: number; height: number };
  return width >= MM_TO_PT && height >= MM_TO_PT && x + width >= MM_TO_PT && y + height >= MM_TO_PT
    && x <= widthPt - MM_TO_PT && y <= heightPt - MM_TO_PT;
}

function validObject(value: unknown, widthPt: number, heightPt: number): value is LayoutObject {
  if (!value || typeof value !== "object") return false;
  const object = value as Partial<LayoutObject>;
  if (!id(object.id) || !validRect(object.rect, widthPt, heightPt)) return false;
  if (object.kind === "image-frame") {
    return (object.photoId === null || id(object.photoId)) && Boolean(object.crop?.focal) && validCrop(object.crop!);
  }
  if (object.kind === "text-box") {
    const style = object.style;
    return typeof object.text === "string" && style?.fontFamily === "noto-sans-sc"
      && finite(style.fontSizePt) && style.fontSizePt >= 6 && style.fontSizePt <= 144
      && finite(style.lineHeight) && style.lineHeight >= .8 && style.lineHeight <= 3
      && typeof style.color === "string" && /^#[0-9a-fA-F]{6}$/.test(style.color)
      && ["left", "center", "right"].includes(style.align);
  }
  return false;
}

export function isLayoutDocument(value: unknown): value is LayoutDocument {
  if (!value || typeof value !== "object") return false;
  const document = value as Partial<LayoutDocument>;
  if (document.schemaVersion !== 1 || !id(document.id) || !id(document.projectId) || !id(document.sequenceId)
    || typeof document.name !== "string" || !document.name.trim()
    || !finite(document.revision) || !Number.isInteger(document.revision) || document.revision < 0
    || typeof document.createdAt !== "string" || typeof document.updatedAt !== "string") return false;
  const widthPt = document.pageSpec?.widthPt, heightPt = document.pageSpec?.heightPt;
  if (!finite(widthPt) || !finite(heightPt) || widthPt < 50 * MM_TO_PT || widthPt > 600 * MM_TO_PT
    || heightPt < 50 * MM_TO_PT || heightPt > 600 * MM_TO_PT) return false;
  if (!Array.isArray(document.pages) || document.pages.length === 0) return false;
  const pageIds = new Set<string>(), objectIds = new Set<string>();
  for (const page of document.pages as readonly LayoutPage[]) {
    if (!page || !id(page.id) || pageIds.has(page.id) || !Array.isArray(page.objects)) return false;
    pageIds.add(page.id);
    for (const object of page.objects) {
      if (!validObject(object, widthPt, heightPt) || objectIds.has(object.id)) return false;
      objectIds.add(object.id);
    }
  }
  return true;
}

export function applyLayoutCommand(document: LayoutDocument, command: LayoutEditCommand): Result<LayoutDocument, { readonly kind: "invalid-layout-command" }> {
  const fail = () => err({ kind: "invalid-layout-command" } as const);
  let pages: readonly LayoutPage[] = document.pages;
  let name = document.name;
  let pageSpec = document.pageSpec;
  if (command.type === "rename") name = command.name.trim();
  else if (command.type === "set-page-size") {
    const scaleX = command.widthPt / pageSpec.widthPt;
    const scaleY = command.heightPt / pageSpec.heightPt;
    if (![scaleX, scaleY].every((value) => Number.isFinite(value) && value > 0)) return fail();
    pageSpec = { widthPt: command.widthPt, heightPt: command.heightPt };
    pages = pages.map((page) => ({ ...page, objects: page.objects.map((object) => {
      const width = Math.max(MM_TO_PT, object.rect.width * scaleX);
      const height = Math.max(MM_TO_PT, object.rect.height * scaleY);
      return { ...object, rect: {
        x: Math.max(MM_TO_PT - width, Math.min(command.widthPt - MM_TO_PT, object.rect.x * scaleX)),
        y: Math.max(MM_TO_PT - height, Math.min(command.heightPt - MM_TO_PT, object.rect.y * scaleY)),
        width, height,
      } };
    }) }));
  }
  else if (command.type === "add-page") {
    const at = command.at ?? pages.length;
    if (!Number.isInteger(at) || at < 0 || at > pages.length) return fail();
    pages = [...pages.slice(0, at), command.page, ...pages.slice(at)];
  } else if (command.type === "remove-page") {
    if (pages.length === 1 || !pages.some((page) => page.id === command.pageId)) return fail();
    pages = pages.filter((page) => page.id !== command.pageId);
  } else if (command.type === "move-page") {
    const source = pages.findIndex((page) => page.id === command.pageId);
    if (source < 0 || !Number.isInteger(command.to) || command.to < 0 || command.to >= pages.length) return fail();
    const moving = pages[source];
    const rest = pages.filter((page) => page.id !== command.pageId);
    pages = [...rest.slice(0, command.to), moving, ...rest.slice(command.to)];
  } else {
    const targetPage = pages.find((page) => page.id === command.pageId);
    if (!targetPage) return fail();
    if (command.type === "move-object" && (!targetPage.objects.some((object) => object.id === command.objectId)
      || !Number.isInteger(command.to) || command.to < 0 || command.to >= targetPage.objects.length)) return fail();
    pages = pages.map((page) => {
      if (page.id !== command.pageId) return page;
      if (command.type === "upsert-object") {
        return { ...page, objects: page.objects.some((object) => object.id === command.object.id)
          ? page.objects.map((object) => object.id === command.object.id ? command.object : object)
          : [...page.objects, command.object] };
      }
      if (command.type === "move-object") {
        const at = page.objects.findIndex((object) => object.id === command.objectId);
        if (at < 0 || !Number.isInteger(command.to) || command.to < 0 || command.to >= page.objects.length) return page;
        const objects = [...page.objects];
        const [moving] = objects.splice(at, 1);
        objects.splice(command.to, 0, moving);
        return { ...page, objects };
      }
      if (command.type === "replace-image-frames") {
        return { ...page, objects: [...command.frames, ...page.objects.filter((object) => object.kind !== "image-frame")] };
      }
      return { ...page, objects: page.objects.filter((object) => object.id !== command.objectId) };
    });
  }
  const next = { ...document, name, pageSpec, pages };
  return isLayoutDocument(next) ? ok(next) : fail();
}
