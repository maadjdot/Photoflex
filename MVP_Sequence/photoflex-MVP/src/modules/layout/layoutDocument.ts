import { err, ok, type LayoutDocument, type LayoutEditCommand, type LayoutId, type LayoutObject, type LayoutPage, type LayoutPageId, type LayoutRevision, type ProjectId, type Result, type SequenceId } from "../../contracts";
import { MM_TO_PT, validCrop } from "../page-layout/pageGeometry";
import { isLayoutFontFamily } from "./layoutFonts";
import { isLayoutPaper } from "./layoutPaper";
import { validFrameInnerEdge } from "../worktable/frameAppearance";

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

function validRect(value: unknown, widthPt: number, heightPt: number, pageIndex: number, pageCount: number, backCover: boolean): boolean {
  if (!value || typeof value !== "object") return false;
  const rect = value as Record<string, unknown>;
  if (![rect.x, rect.y, rect.width, rect.height].every(finite)) return false;
  const { x, y, width, height } = rect as unknown as { x: number; y: number; width: number; height: number };
  const bodyEnd = backCover ? pageCount - 1 : pageCount;
  const leftPage = pageIndex > 0 && pageIndex % 2 === 1 && pageIndex + 1 < bodyEnd;
  const rightPage = pageIndex > 0 && pageIndex < bodyEnd && pageIndex % 2 === 0;
  return width >= MM_TO_PT && height >= MM_TO_PT && x + width >= (rightPage ? -widthPt : 0) + MM_TO_PT && y + height >= MM_TO_PT
    && x <= (leftPage ? 2 * widthPt : widthPt) - MM_TO_PT && y <= heightPt - MM_TO_PT;
}

function validObject(value: unknown, widthPt: number, heightPt: number, pageIndex: number, pageCount: number, backCover: boolean): value is LayoutObject {
  if (!value || typeof value !== "object") return false;
  const object = value as Partial<LayoutObject>;
  if (!id(object.id) || !validRect(object.rect, widthPt, heightPt, pageIndex, pageCount, backCover)) return false;
  if (object.kind === "image-frame") {
    return (object.photoId === null || id(object.photoId)) && Boolean(object.crop?.focal) && validCrop(object.crop!)
      && (object.photoAspectRatio === undefined || (finite(object.photoAspectRatio) && object.photoAspectRatio > 0));
  }
  if (object.kind === "text-box") {
    const style = object.style;
    return typeof object.text === "string" && isLayoutFontFamily(style?.fontFamily)
      && (style.fontWeight === undefined || style.fontWeight === "normal" || style.fontWeight === "bold")
      && (style.fontStyle === undefined || style.fontStyle === "normal" || style.fontStyle === "italic")
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
    || typeof document.createdAt !== "string" || typeof document.updatedAt !== "string"
    || (document.showPageNumbers !== undefined && typeof document.showPageNumbers !== "boolean")) return false;
  const widthPt = document.pageSpec?.widthPt, heightPt = document.pageSpec?.heightPt;
  if (!finite(widthPt) || !finite(heightPt) || widthPt < 50 * MM_TO_PT || widthPt > 600 * MM_TO_PT
    || heightPt < 50 * MM_TO_PT || heightPt > 600 * MM_TO_PT) return false;
  if (!Array.isArray(document.pages) || document.pages.length === 0) return false;
  const pageIds = new Set<string>(), objectIds = new Set<string>();
  for (const [pageIndex, page] of (document.pages as readonly LayoutPage[]).entries()) {
    if (!page || !id(page.id) || pageIds.has(page.id) || !Array.isArray(page.objects)
      || (page.paper !== undefined && !isLayoutPaper(page.paper))
      || (page.kind !== undefined && !((page.kind === "cover" && pageIndex === 0) || (page.kind === "back-cover" && pageIndex === document.pages.length - 1)))
      || (page.innerEdge !== undefined && !validFrameInnerEdge(page.innerEdge))
      || (page.photoElevationPt !== undefined && (!finite(page.photoElevationPt) || page.photoElevationPt < 0 || page.photoElevationPt > 20 * MM_TO_PT))) return false;
    pageIds.add(page.id);
    for (const object of page.objects) {
      if (!validObject(object, widthPt, heightPt, pageIndex, document.pages.length, document.pages.at(-1)?.kind === "back-cover") || objectIds.has(object.id)) return false;
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
  let showPageNumbers = document.showPageNumbers;
  if (command.type === "rename") name = command.name.trim();
  else if (command.type === "set-page-numbers") showPageNumbers = command.show;
  else if (command.type === "set-page-size") {
    const scaleX = command.widthPt / pageSpec.widthPt;
    const scaleY = command.heightPt / pageSpec.heightPt;
    if (![scaleX, scaleY].every((value) => Number.isFinite(value) && value > 0)) return fail();
    pageSpec = { widthPt: command.widthPt, heightPt: command.heightPt };
    pages = pages.map((page, pageIndex) => ({ ...page, objects: page.objects.map((object) => {
      const width = Math.max(MM_TO_PT, object.rect.width * scaleX);
      const height = Math.max(MM_TO_PT, object.rect.height * scaleY);
      const bodyEnd = pages.at(-1)?.kind === "back-cover" ? pages.length - 1 : pages.length;
      const leftPage = pageIndex > 0 && pageIndex % 2 === 1 && pageIndex + 1 < bodyEnd;
      const rightPage = pageIndex > 0 && pageIndex < bodyEnd && pageIndex % 2 === 0;
      return { ...object, rect: {
        x: Math.max((rightPage ? -command.widthPt : 0) + MM_TO_PT - width,
          Math.min((leftPage ? 2 * command.widthPt : command.widthPt) - MM_TO_PT, object.rect.x * scaleX)),
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
  } else if (command.type === "set-paper") {
    const pageIds = new Set(command.pageIds);
    if (!pageIds.size || pageIds.size !== command.pageIds.length || !isLayoutPaper(command.paper)
      || [...pageIds].some((pageId) => !pages.some((page) => page.id === pageId))) return fail();
    pages = pages.map((page) => pageIds.has(page.id) ? { ...page, paper: { ...command.paper } } : page);
  } else if (command.type === "set-photo-appearance") {
    const pageIds = new Set(command.pageIds);
    if (!pageIds.size || pageIds.size !== command.pageIds.length || !validFrameInnerEdge(command.innerEdge)
      || !finite(command.photoElevationPt) || command.photoElevationPt < 0 || command.photoElevationPt > 20 * MM_TO_PT
      || [...pageIds].some((pageId) => !pages.some((page) => page.id === pageId))) return fail();
    pages = pages.map((page) => pageIds.has(page.id) ? { ...page, innerEdge: { ...command.innerEdge }, photoElevationPt: command.photoElevationPt } : page);
  } else if (command.type === "remove-objects") {
    pages = pages.map((page) => ({ ...page, objects: page.objects.filter((object) => !command.objectIds.includes(object.id)) }));
  } else if (command.type === "upsert-objects") {
    if (!command.updates.length || command.updates.some((update) => !pages.some((page) => page.id === update.pageId))) return fail();
    pages = pages.map((page) => {
      const updates = command.updates.filter((update) => update.pageId === page.id);
      if (!updates.length) return page;
      const objects = [...page.objects];
      for (const update of updates) {
        const at = objects.findIndex((object) => object.id === update.object.id);
        if (at >= 0) objects[at] = update.object;
        else objects.push(update.object);
      }
      return { ...page, objects };
    });
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
  const next = { ...document, name, pageSpec, pages, showPageNumbers };
  return isLayoutDocument(next) ? ok(next) : fail();
}
