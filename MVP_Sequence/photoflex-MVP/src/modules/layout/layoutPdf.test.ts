import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { PDFArray, PDFDocument, PDFDict, PDFName, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import type { LayoutId, LayoutObjectId, LayoutPageId, LayoutTextBox, PhotoId, ProjectId, SequenceId } from "../../contracts";
import { createEmptyLayout } from "./layoutDocument";
import { createLayoutPdf } from "./layoutPdf";

describe("Layout PDF", () => {
  it("keeps physical page order and empty pages, embedding Chinese as PDF text", async () => {
    const base = createEmptyLayout({ id: "layout" as LayoutId, projectId: "project" as ProjectId,
      sequenceId: "sequence" as SequenceId, pageId: "one" as LayoutPageId, name: "上海街景", createdAt: "2026-09-24" });
    const text: LayoutTextBox = { kind: "text-box", id: "text" as LayoutObjectId,
      rect: { x: 40, y: 40, width: 440, height: 100 }, text: "摄影集：上海街景，人物与光影。\n第二页 2026 / Café",
      style: { fontFamily: "noto-sans-sc", fontSizePt: 12, lineHeight: 1.2, color: "#171513", align: "left" } };
    const snapshot = { ...base, pages: [{ ...base.pages[0], objects: [text] }, { id: "two" as LayoutPageId, objects: [] }] };
    const fontBytes = new Uint8Array(await readFile("src/assets/fonts/Noto_Sans_SC/static/NotoSansSC-Regular.ttf"));
    const progress: string[] = [];
    const bytes = await createLayoutPdf(snapshot, { fonts: [{ family: "noto-sans-sc", weight: "normal", style: "normal",
      bytes: fontBytes, syntheticBold: false, syntheticItalic: false }], loadPhoto: async () => { throw new Error("Unexpected photo"); } },
      undefined, ({ completed, total }) => progress.push(`${completed}/${total}`));
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getTitle()).toBe("上海街景");
    expect(pdf.getPageCount()).toBe(2);
    expect(progress).toEqual(["0/2", "1/2", "2/2"]);
    expect(pdf.getPages().map((page) => [page.getWidth(), page.getHeight()])).toEqual([
      [base.pageSpec.widthPt, base.pageSpec.heightPt], [base.pageSpec.widthPt, base.pageSpec.heightPt],
    ]);
    const fontResources = pdf.getPage(0).node.Resources()?.lookup(PDFName.of("Font"), PDFDict);
    expect(fontResources?.keys().length).toBeGreaterThan(0);
    expect(pdf.getPage(1).node.Resources()?.lookup(PDFName.of("XObject"), PDFDict)?.keys().length ?? 0).toBe(0);
  }, 30000);

  it("embeds a Fill photo and cancels before returning a partial PDF", async () => {
    const base = createEmptyLayout({ id: "layout" as LayoutId, projectId: "project" as ProjectId,
      sequenceId: "sequence" as SequenceId, pageId: "one" as LayoutPageId, name: "Photo", createdAt: "2026-09-24" });
    const frame = { kind: "image-frame" as const, id: "image" as LayoutObjectId,
      rect: { x: 30, y: 40, width: 100, height: 100 }, photoId: "photo" as PhotoId,
      crop: { mode: "fill" as const, zoom: 2, focal: { x: .7, y: .5 } } };
    const snapshot = { ...base, pages: [{ ...base.pages[0], innerEdge: { mode: "bevel" as const, color: "#F1EDE1", widthPt: 3 }, photoElevationPt: 4, objects: [frame] },
      { id: "two" as LayoutPageId, objects: [{ ...frame, id: "image-again" as LayoutObjectId,
        rect: { ...frame.rect, x: base.pageSpec.widthPt - 50 } }] },
      { id: "three" as LayoutPageId, objects: [] }] };
    const jpeg = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDlaKKK+eP0k//Z", "base64");
    let loads = 0;
    const assets = { fonts: [], loadPhoto: async () => { loads++; return { bytes: new Uint8Array(jpeg), width: 2, height: 1 }; } };
    const bytes = await createLayoutPdf(snapshot, assets);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPage(0).node.Resources()?.lookup(PDFName.of("XObject"), PDFDict)?.keys().length).toBe(1);
    const firstImages = pdf.getPage(0).node.Resources()?.lookup(PDFName.of("XObject"), PDFDict);
    const secondImages = pdf.getPage(1).node.Resources()?.lookup(PDFName.of("XObject"), PDFDict);
    expect(loads).toBe(1);
    expect(firstImages?.get(firstImages.keys()[0])?.toString()).toBe(secondImages?.get(secondImages.keys()[0])?.toString());
    expect(pdf.getPage(2).node.Resources()?.lookup(PDFName.of("XObject"), PDFDict)?.keys().length ?? 0).toBe(1);
    const contents = pdf.getPage(0).node.Contents();
    const streams = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
    const operators = streams.map((entry) => new TextDecoder().decode(decodePDFRawStream(pdf.context.lookup(entry) as PDFRawStream).decode())).join("\n");
    expect(operators).toMatch(/\bre\s+W\s+n\b/);
    expect(operators).toMatch(/\bgs\b/); // translucent photo elevation
    expect(operators).toMatch(/0 0 m\s+106 0 l\s+103 3 l\s+3 3 l/); // the top bevel surrounds the visible crop
    const coverSnapshot = { ...snapshot, pages: snapshot.pages.map((page, index) => index === 2 ? { ...page, kind: "back-cover" as const } : page) };
    const coverPdf = await PDFDocument.load(await createLayoutPdf(coverSnapshot, assets));
    expect(coverPdf.getPageCount()).toBe(3);
    expect(coverPdf.getPage(2).node.Resources()?.lookup(PDFName.of("XObject"), PDFDict)?.keys().length ?? 0).toBe(0);
    let paperLoads = 0;
    const paperSnapshot = { ...snapshot, pages: snapshot.pages.map((page, index) => ({ ...page,
      paper: { color: index < 2 ? "#F1EDE1" : "#28282A", material: "coarse-linen" as const } })) };
    const paperBytes = await createLayoutPdf(paperSnapshot, { ...assets, loadPaperBackground: async () => {
      paperLoads++;
      return { bytes: new Uint8Array(jpeg), format: "jpg" as const };
    } });
    const paperPdf = await PDFDocument.load(paperBytes);
    expect(paperLoads).toBe(2); // one cached background per unique color/material combination
    expect(paperPdf.getPage(0).node.Resources()?.lookup(PDFName.of("XObject"), PDFDict)?.keys().length).toBe(2);
    expect(paperPdf.getPage(2).node.Resources()?.lookup(PDFName.of("XObject"), PDFDict)?.keys().length).toBe(2);
    const controller = new AbortController();
    await expect(createLayoutPdf(snapshot, assets, controller.signal, ({ completed }) => {
      if (completed === 1) controller.abort();
    })).rejects.toMatchObject({ name: "AbortError" });
  }, 30000);

  it("uses Noto Serif SC for Chinese missing from the selected font", async () => {
    const base = createEmptyLayout({ id: "layout" as LayoutId, projectId: "project" as ProjectId,
      sequenceId: "sequence" as SequenceId, pageId: "one" as LayoutPageId, name: "Fallback", createdAt: "2026-09-24" });
    const text: LayoutTextBox = { kind: "text-box", id: "text" as LayoutObjectId,
      rect: { x: 40, y: 40, width: 440, height: 100 }, text: "Album 上海",
      style: { fontFamily: "architects-daughter", fontWeight: "bold", fontStyle: "italic", fontSizePt: 12, lineHeight: 1.2, color: "#171513", align: "left" } };
    const [latin, chinese] = await Promise.all([
      readFile("src/assets/fonts/Architects_Daughter/ArchitectsDaughter-Regular.ttf"),
      readFile("src/assets/fonts/Noto_Serif_SC/static/NotoSerifSC-Bold.ttf"),
    ]);
    const bytes = await createLayoutPdf({ ...base, pages: [{ ...base.pages[0], objects: [text] }] }, {
      fonts: [
        { family: "architects-daughter", weight: "bold", style: "italic", bytes: new Uint8Array(latin), syntheticBold: true, syntheticItalic: true },
        { family: "noto-serif-sc", weight: "bold", style: "italic", bytes: new Uint8Array(chinese), syntheticBold: false, syntheticItalic: true },
      ],
      loadPhoto: async () => { throw new Error("Unexpected photo"); },
    });
    const pdf = await PDFDocument.load(bytes);
    const fontResources = pdf.getPage(0).node.Resources()?.lookup(PDFName.of("Font"), PDFDict);
    expect(fontResources?.keys().length).toBeGreaterThanOrEqual(2);
  }, 60000);

  it("embeds the newly installed Layout fonts", async () => {
    const base = createEmptyLayout({ id: "layout" as LayoutId, projectId: "project" as ProjectId,
      sequenceId: "sequence" as SequenceId, pageId: "one" as LayoutPageId, name: "New fonts", createdAt: "2026-09-24" });
    const makeText = (id: string, family: "ancizar-serif" | "eb-garamond" | "lxgw-wenkai-tc", text: string, y: number): LayoutTextBox => ({
      kind: "text-box", id: id as LayoutObjectId, rect: { x: 40, y, width: 440, height: 60 }, text,
      style: { fontFamily: family, fontSizePt: 12, lineHeight: 1.2, color: "#171513", align: "left" },
    });
    const [ancizar, garamond, wenKai] = await Promise.all([
      readFile("src/assets/fonts/AncizarSerif/AncizarSerif.ttf"),
      readFile("src/assets/fonts/EB_Garamond/static/EBGaramond-Regular.ttf"),
      readFile("src/assets/fonts/LXGWWenKaiTC/LXGWWenKaiTC-Regular.ttf"),
    ]);
    const bytes = await createLayoutPdf({ ...base, pages: [{ ...base.pages[0], objects: [
      makeText("ancizar", "ancizar-serif", "Ancizar Serif", 40),
      makeText("garamond", "eb-garamond", "EB Garamond", 120),
      makeText("wenkai", "lxgw-wenkai-tc", "霞鹜文楷 TC", 200),
    ] }] }, {
      fonts: [
        { family: "ancizar-serif", weight: "normal", style: "normal", bytes: new Uint8Array(ancizar), syntheticBold: false, syntheticItalic: false },
        { family: "eb-garamond", weight: "normal", style: "normal", bytes: new Uint8Array(garamond), syntheticBold: false, syntheticItalic: false },
        { family: "lxgw-wenkai-tc", weight: "normal", style: "normal", bytes: new Uint8Array(wenKai), syntheticBold: false, syntheticItalic: false },
      ],
      loadPhoto: async () => { throw new Error("Unexpected photo"); },
    });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPage(0).node.Resources()?.lookup(PDFName.of("Font"), PDFDict)?.keys().length).toBeGreaterThanOrEqual(3);
  }, 60000);

  it("exports the normalized ZCOOL fonts without a fontkit buffer error", async () => {
    const base = createEmptyLayout({ id: "layout" as LayoutId, projectId: "project" as ProjectId,
      sequenceId: "sequence" as SequenceId, pageId: "one" as LayoutPageId, name: "ZCOOL", createdAt: "2026-09-24" });
    const makeText = (id: string, family: "zcool-qingke-huangyou" | "zcool-xiaowei", y: number): LayoutTextBox => ({
      kind: "text-box", id: id as LayoutObjectId, rect: { x: 40, y, width: 440, height: 60 }, text: "字体导出 Test",
      style: { fontFamily: family, fontSizePt: 12, lineHeight: 1.2, color: "#171513", align: "left" },
    });
    const [qingke, xiaowei] = await Promise.all([
      readFile("src/assets/fonts/ZCOOL_QingKe_HuangYou/ZCOOLQingKeHuangYou-PhotoFlex.ttf"),
      readFile("src/assets/fonts/ZCOOL_XiaoWei/ZCOOLXiaoWei-PhotoFlex.ttf"),
    ]);
    const bytes = await createLayoutPdf({ ...base, pages: [{ ...base.pages[0], objects: [
      makeText("qingke", "zcool-qingke-huangyou", 40), makeText("xiaowei", "zcool-xiaowei", 120),
    ] }] }, {
      fonts: [
        { family: "zcool-qingke-huangyou", weight: "normal", style: "normal", bytes: new Uint8Array(qingke), syntheticBold: false, syntheticItalic: false },
        { family: "zcool-xiaowei", weight: "normal", style: "normal", bytes: new Uint8Array(xiaowei), syntheticBold: false, syntheticItalic: false },
      ],
      loadPhoto: async () => { throw new Error("Unexpected photo"); },
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  }, 60000);
});
