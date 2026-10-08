import type { FrameRect, FrameTextBox, LayoutObjectId, WorktableFrame } from "../../contracts";
import { DEFAULT_LAYOUT_FONT } from "../layout/layoutFonts";
import { isDarkLayoutPaper } from "../layout/layoutPaper";
import { framePaper, FRAME_MM_TO_PT } from "./frameLayout";
import { validFrameCaptionStyle } from "./frameAppearance";

export function createFrameTextBox(page: WorktableFrame["page"], id: LayoutObjectId, rect: FrameRect): FrameTextBox {
  return { kind: "text-box", id, rect, text: "", style: { fontFamily: DEFAULT_LAYOUT_FONT, fontWeight: "normal", fontStyle: "normal", fontSizePt: 12, lineHeight: 1.4,
    color: isDarkLayoutPaper(framePaper(page)) ? "#EAE7DE" : "#171513", align: "left" } };
}

export function validFrameTextBox(box: FrameTextBox, page: WorktableFrame["page"]): boolean {
  return Boolean(box && box.kind === "text-box" && typeof box.id === "string" && box.id && typeof box.text === "string"
    && validFrameCaptionStyle({ ...box.style, rect: box.rect }, page));
}

export const copyFrameTextBox = (box: FrameTextBox): FrameTextBox => ({ ...box, rect: { ...box.rect }, style: { ...box.style } });

export function reflowFrameTextBoxes(page: WorktableFrame["page"], widthPt: number, heightPt: number): Pick<WorktableFrame["page"], "textBoxes"> {
  return page.textBoxes ? { textBoxes: page.textBoxes.map((box) => ({ ...box, rect: {
    x: box.rect.x * widthPt / page.widthPt, y: box.rect.y * heightPt / page.heightPt,
    width: Math.max(FRAME_MM_TO_PT, box.rect.width * widthPt / page.widthPt), height: Math.max(FRAME_MM_TO_PT, box.rect.height * heightPt / page.heightPt),
  } })) } : {};
}
