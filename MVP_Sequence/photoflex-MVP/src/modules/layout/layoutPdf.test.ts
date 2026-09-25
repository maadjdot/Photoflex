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
    const fontBytes = new Uint8Array(await readFile("src/assets/fonts/NotoSansCJKsc-Regular.otf"));
    const progress: string[] = [];
    const bytes = await createLayoutPdf(snapshot, { fontBytes, loadPhoto: async () => { throw new Error("Unexpected photo"); } },
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
    const snapshot = { ...base, pages: [{ ...base.pages[0], objects: [frame] },
      { id: "two" as LayoutPageId, objects: [{ ...frame, id: "image-again" as LayoutObjectId }] },
      { id: "three" as LayoutPageId, objects: [] }] };
    const fontBytes = new Uint8Array(await readFile("src/assets/fonts/NotoSansCJKsc-Regular.otf"));
    const jpeg = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDlaKKK+eP0k//Z", "base64");
    let loads = 0;
    const assets = { fontBytes, loadPhoto: async () => { loads++; return { bytes: new Uint8Array(jpeg), width: 2, height: 1 }; } };
    const bytes = await createLayoutPdf(snapshot, assets);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPage(0).node.Resources()?.lookup(PDFName.of("XObject"), PDFDict)?.keys().length).toBe(1);
    const firstImages = pdf.getPage(0).node.Resources()?.lookup(PDFName.of("XObject"), PDFDict);
    const secondImages = pdf.getPage(1).node.Resources()?.lookup(PDFName.of("XObject"), PDFDict);
    expect(loads).toBe(1);
    expect(firstImages?.get(firstImages.keys()[0])?.toString()).toBe(secondImages?.get(secondImages.keys()[0])?.toString());
    expect(pdf.getPage(2).node.Resources()?.lookup(PDFName.of("XObject"), PDFDict)?.keys().length ?? 0).toBe(0);
    const contents = pdf.getPage(0).node.Contents();
    const streams = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
    const operators = streams.map((entry) => new TextDecoder().decode(decodePDFRawStream(pdf.context.lookup(entry) as PDFRawStream).decode())).join("\n");
    expect(operators).toMatch(/\bre\s+W\s+n\b/);
    const controller = new AbortController();
    await expect(createLayoutPdf(snapshot, assets, controller.signal, ({ completed }) => {
      if (completed === 1) controller.abort();
    })).rejects.toMatchObject({ name: "AbortError" });
  }, 30000);
});
