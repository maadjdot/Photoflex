import type { PhotoId, ProjectId } from "../contracts";
import type { ResearchImage, ResearchNode, ResearchRecord } from "../contracts/research";
import { RESEARCH_IMAGE_MIME } from "../modules/research/content";

function isNode(value: ResearchNode): boolean {
  if (!value || typeof value.type !== "string" || (value.text !== undefined && typeof value.text !== "string")
    || (value.marks !== undefined && (!Array.isArray(value.marks) || !value.marks.every((mark) => typeof mark?.type === "string")))) return false;
  if (value.type === "researchImages") {
    const images = value.attrs?.images as ResearchImage[] | undefined;
    if (!Array.isArray(images) || !images.every((image) => image && (image.kind === "project" || image.kind === "research")
      && typeof image.id === "string" && typeof image.caption === "string")) return false;
  }
  return value.content === undefined || (Array.isArray(value.content) && value.content.every(isNode));
}

export function validateResearchRecords(records: readonly ResearchRecord[] | undefined, projectId: ProjectId) {
  if (records === undefined) return;
  if (!Array.isArray(records)) throw new Error("Invalid research records.");
  const keys = new Set<string>();
  const notes = new Set(records.filter((row) => row?.kind === "note").map((row) => row.id));
  for (const row of records) {
    if (!row || row.projectId !== projectId || typeof row.id !== "string" || !row.id) throw new Error("Invalid research ownership.");
    const key = JSON.stringify([row.kind, row.id]);
    if (keys.has(key)) throw new Error("Duplicate research records.");
    keys.add(key);
    if (row.kind === "note") {
      if (typeof row.title !== "string" || typeof row.createdAt !== "string" || typeof row.updatedAt !== "string"
        || (row.deletedAt !== null && typeof row.deletedAt !== "string") || !Number.isSafeInteger(row.version) || row.version < 1
        || row.content?.type !== "doc" || !isNode(row.content)) throw new Error("Invalid research note.");
    } else if (row.kind === "material") {
      if (typeof row.name !== "string" || !RESEARCH_IMAGE_MIME.test(row.mime) || typeof row.base64 !== "string"
        || !/^[A-Za-z0-9+/]+={0,2}$/.test(row.base64)) throw new Error("Invalid research material.");
    } else if (row.kind === "extract") {
      const { anchor } = row;
      if (!notes.has(row.noteId) || typeof row.snapshot !== "string" || typeof row.note !== "string" || !Number.isSafeInteger(row.acceptedVersion)
        || ![anchor?.start, anchor?.end].every((point) => point && typeof point.blockId === "string" && Number.isSafeInteger(point.offset) && point.offset >= 0)
        || typeof anchor?.quote?.exact !== "string" || typeof anchor.quote.prefix !== "string" || typeof anchor.quote.suffix !== "string") throw new Error("Invalid research extract.");
    } else throw new Error("Unknown research record.");
  }
}

export function remapResearchPhotos(node: ResearchNode, photoId: (id: PhotoId) => PhotoId): ResearchNode {
  if (node.type === "researchImages") {
    const images = (node.attrs?.images as ResearchImage[]).map((image) => image.kind === "project" ? { ...image, id: photoId(image.id) } : image);
    return { ...node, attrs: { ...node.attrs, images } };
  }
  return node.content ? { ...node, content: node.content.map((child) => remapResearchPhotos(child, photoId)) } : node;
}
