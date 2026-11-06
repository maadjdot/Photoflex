import { Extension, Node } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { ReactNodeViewRenderer } from "@tiptap/react";
import type { ResearchAnchor, ResearchNode } from "../../contracts/research";
import { makeAnchor, textBlocks } from "../../modules/research/content";
import { ResearchImageGroup } from "./ResearchMedia";

const blockTypes = ["paragraph", "heading", "codeBlock"];
export const sourceHighlightKey = new PluginKey<DecorationSet>("researchSourceHighlight");
export const extractMarkersKey = new PluginKey<DecorationSet>("researchExtractMarkers");
type Range = { from: number; to: number };
const hasBlock = (nodes: ResearchNode[]): boolean => nodes.some((node) => node.type !== "text" && node.type !== "hardBreak");

export const ResearchBlocks = Extension.create({
  name: "researchBlocks",
  addGlobalAttributes() {
    return [{ types: blockTypes, attributes: { blockId: { default: null, rendered: false } } }];
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction(transactions, _previous, next) {
          const structural = transactions.some((tr) => tr.docChanged && tr.steps.some((step) => {
            const json = step.toJSON();
            return json.stepType !== "replace" || hasBlock(json.slice?.content ?? []);
          }));
          if (!structural) return null;
          const seen = new Set<string>();
          const tr = next.tr;
          next.doc.descendants((node, pos) => {
            if (!blockTypes.includes(node.type.name)) return;
            const id = node.attrs.blockId;
            if (id && !seen.has(id)) seen.add(id);
            else tr.setNodeMarkup(pos, undefined, { ...node.attrs, blockId: crypto.randomUUID() });
          });
          return tr.steps.length ? tr.setMeta("addToHistory", false) : null;
        },
      }),
      new Plugin<DecorationSet>({
        key: sourceHighlightKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, decorations) {
            const range = tr.getMeta(sourceHighlightKey) as { from: number; to: number } | null | undefined;
            if (range === null) return DecorationSet.empty;
            return range ? DecorationSet.create(tr.doc, [Decoration.inline(range.from, range.to, { class: "research-source-highlight" })])
              : decorations.map(tr.mapping, tr.doc);
          },
        },
        props: { decorations: (state) => sourceHighlightKey.getState(state) },
      }),
      new Plugin<DecorationSet>({
        key: extractMarkersKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, decorations) {
            const ranges = tr.getMeta(extractMarkersKey) as Range[] | undefined;
            return ranges ? DecorationSet.create(tr.doc, ranges.map(({ from, to }) => Decoration.inline(from, to, { class: "research-extract-marker" })))
              : decorations.map(tr.mapping, tr.doc);
          },
        },
        props: { decorations: (state) => extractMarkersKey.getState(state) },
      }),
    ];
  },
});

export const ResearchImageBlock = Node.create({
  name: "researchImages",
  group: "block",
  atom: true,
  draggable: false,
  addAttributes() { return { images: { default: [], rendered: false } }; },
  renderHTML: () => ["div", { "data-research-images": "" }],
});

export const ResearchImages = ResearchImageBlock.extend({
  addNodeView: () => ReactNodeViewRenderer(ResearchImageGroup),
});

export function anchorForSelection(doc: ProseMirrorNode, from: number, to: number): ResearchAnchor | undefined {
  let start: ResearchAnchor["start"] | undefined;
  let end: ResearchAnchor["end"] | undefined;
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock || !node.attrs.blockId) return;
    const blockId: string = node.attrs.blockId;
    const first = Math.max(0, from - pos - 1), last = Math.min(node.content.size, to - pos - 1);
    if (first < last) {
      start ??= { blockId, offset: first };
      end = { blockId, offset: last };
    }
    return false;
  });
  return start && end ? makeAnchor(textBlocks(doc.toJSON()), start, end) : undefined;
}

export function rangeForAnchor(doc: ProseMirrorNode, anchor: ResearchAnchor) {
  let from: number | undefined, to: number | undefined;
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return;
    if (node.attrs.blockId === anchor.start.blockId) from = pos + 1 + anchor.start.offset;
    if (node.attrs.blockId === anchor.end.blockId) to = pos + 1 + anchor.end.offset;
    return false;
  });
  return from !== undefined && to !== undefined && to > from ? { from, to } : undefined;
}
