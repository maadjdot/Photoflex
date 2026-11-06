import type { ResearchAnchor, ResearchImage, ResearchNode } from "../../contracts/research";

export interface TextBlock { id: string; text: string }
export const RESEARCH_IMAGE_MIME = /^image\/(jpeg|png|webp|gif|avif|bmp)$/i;

export function textBlocks(content: ResearchNode): TextBlock[] {
  const blocks: TextBlock[] = [];
  const visit = (node: ResearchNode) => {
    if (typeof node.attrs?.blockId === "string") {
      blocks.push({ id: node.attrs.blockId, text: (node.content ?? []).map((part) => part.type === "hardBreak" ? "\n" : part.text ?? "").join("") });
    } else node.content?.forEach(visit);
  };
  visit(content);
  return blocks;
}

export function imagesIn(content: ResearchNode): ResearchImage[] {
  if (content.type === "researchImages") return (content.attrs?.images as ResearchImage[] | undefined) ?? [];
  return content.content?.flatMap(imagesIn) ?? [];
}

function indexBlocks(blocks: readonly TextBlock[]) {
  let offset = 0;
  const starts = blocks.map(({ text }) => { const start = offset; offset += text.length + 1; return start; });
  const text = blocks.map((block) => block.text).join("\n");
  const point = (position: number) => {
    let index = starts.length - 1;
    while (starts[index] > position) index -= 1;
    return { blockId: blocks[index].id, offset: position - starts[index] };
  };
  const position = (point: ResearchAnchor["start"]) => {
    const index = blocks.findIndex((block) => block.id === point.blockId);
    return index < 0 || point.offset < 0 || point.offset > blocks[index].text.length ? undefined : starts[index] + point.offset;
  };
  return { text, point, position };
}

export function makeAnchor(blocks: readonly TextBlock[], start: ResearchAnchor["start"], end: ResearchAnchor["end"]): ResearchAnchor | undefined {
  const { text, position } = indexBlocks(blocks);
  const from = position(start), to = position(end);
  if (from === undefined || to === undefined || to <= from || !text.slice(from, to).trim()) return undefined;
  const sameBlock = start.blockId === end.blockId ? blocks.find((block) => block.id === start.blockId) : undefined;
  const wholeBlock = sameBlock && start.offset === 0 && end.offset === sameBlock.text.length;
  const prefix = sameBlock ? sameBlock.text.slice(Math.max(0, start.offset - 32), start.offset) : text.slice(Math.max(0, from - 32), from);
  const suffix = sameBlock ? sameBlock.text.slice(end.offset, end.offset + 32) : text.slice(to, to + 32);
  return { start, end, quote: { exact: text.slice(from, to), prefix, suffix }, ...(wholeBlock ? { wholeBlock } : {}) };
}

export type ResolvedAnchor =
  | { status: "current" | "changed"; anchor: ResearchAnchor }
  | { status: "needs-review" | "orphaned" };

export function resolveAnchor(blocks: readonly TextBlock[], anchor: ResearchAnchor): ResolvedAnchor {
  const { exact, prefix, suffix } = anchor.quote;
  if (!exact || !blocks.length) return { status: "orphaned" };
  const original = blocks.find((block) => block.id === anchor.start.blockId);
  if (original && anchor.start.blockId === anchor.end.blockId) {
    const start = original.text.indexOf(exact);
    if (start >= 0 && start === original.text.lastIndexOf(exact)) {
      const end = start + exact.length;
      if (start === anchor.start.offset && end === anchor.end.offset) return { status: "current", anchor };
      return { status: "current", anchor: makeAnchor([original], { blockId: original.id, offset: start }, { blockId: original.id, offset: end })! };
    }
  }
  const { text, point } = indexBlocks(blocks);
  const matches: number[] = [];
  for (let at = text.indexOf(exact); at >= 0; at = text.indexOf(exact, at + 1)) matches.push(at);
  const inBlock = matches.filter((at) => point(at).blockId === anchor.start.blockId && point(at + exact.length).blockId === anchor.end.blockId);
  const candidates = inBlock.length ? inBlock : matches;
  const contextual = prefix || suffix
    ? candidates.filter((at) => text.slice(Math.max(0, at - prefix.length), at) === prefix && text.startsWith(suffix, at + exact.length))
    : [];
  const match = contextual.length === 1 ? contextual[0] : inBlock.length === 1 ? inBlock[0] : !original && matches.length === 1 ? matches[0] : undefined;
  if (match !== undefined) return { status: "current", anchor: makeAnchor(blocks, point(match), point(match + exact.length))! };
  if (inBlock.length > 1 || contextual.length > 1) return { status: "needs-review" };

  if (original && original.id === anchor.end.blockId && (anchor.wholeBlock || prefix || suffix)) {
    const body = original.text;
    const left = prefix ? body.indexOf(prefix) : 0;
    const right = suffix ? body.indexOf(suffix, left + prefix.length) : body.length;
    if (left >= 0 && right >= left + prefix.length && (!prefix || left === body.lastIndexOf(prefix)) && (!suffix || right === body.lastIndexOf(suffix))) {
      const candidate = makeAnchor(blocks, { blockId: original.id, offset: left + prefix.length }, { blockId: original.id, offset: right });
      if (candidate) return { status: "changed", anchor: candidate };
    }
  }
  return { status: matches.length ? "needs-review" : "orphaned" };
}
