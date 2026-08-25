import { describe, expect, it } from "vitest";
import { createBenchmarkPdf } from "../src/pdfDocument";

describe("PDF document public seam", () => {
  it("creates a valid three-page PDF from sequence labels", () => {
    const bytes = createBenchmarkPdf(["photo-a.jpg", "photo-b.jpg", "photo-c.jpg"]);
    const text = new TextDecoder().decode(bytes);

    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("/Count 3");
    expect((text.match(/\/Type \/Page\b/g) ?? []).length).toBe(3);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
  });
});
