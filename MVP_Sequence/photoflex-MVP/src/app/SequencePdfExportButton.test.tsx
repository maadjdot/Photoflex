// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { PhotoId, ProjectId, SequencePdfOptions } from "../contracts";
import { createInitialSequenceBundle } from "../modules/sequence";
import { MemoryPhotoSource } from "../platform/memory/MemoryPhotoSource";
import { exportSequencePdf } from "../platform/browser/exportSequencePdf";
import { SequencePdfExportButton } from "./SequencePdfExportButton";

vi.mock("../platform/browser/exportSequencePdf", () => ({ exportSequencePdf: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const sequence = createInitialSequenceBundle({ projectId: "project" as ProjectId, name: "Edit", content: { kind: "photos", photoIds: ["one" as PhotoId] } }).sequence;
const photoSource = new MemoryPhotoSource();

it("exports a snapshot, reports progress and prevents duplicate requests", async () => {
  let finish!: () => void;
  vi.mocked(exportSequencePdf).mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
  render(<SequencePdfExportButton sequence={sequence} photoSource={photoSource} />);
  fireEvent.click(screen.getByRole("button", { name: "Export PDF" }));
  await waitFor(() => expect(exportSequencePdf).toHaveBeenCalledTimes(1));
  const [options, source] = vi.mocked(exportSequencePdf).mock.calls[0];
  expect(options.sequence).toEqual(sequence);
  expect(options.sequence).not.toBe(sequence);
  expect(source).toBe(photoSource);
  expect((screen.getByRole("button", { name: "Exporting…" }) as HTMLButtonElement).disabled).toBe(true);
  act(() => options.onProgress?.({ completed: 1, total: 1 }));
  expect(screen.getByRole("status").textContent).toContain("1 / 1 pages");
  await act(async () => finish());
  expect(screen.getByRole("status").textContent).toBe("PDF download started.");
});

it("offers retry after failure", async () => {
  vi.mocked(exportSequencePdf).mockRejectedValueOnce(new Error("Reconnect the source folder.")).mockResolvedValueOnce();
  render(<SequencePdfExportButton sequence={sequence} photoSource={photoSource} />);
  fireEvent.click(screen.getByRole("button", { name: "Export PDF" }));
  await screen.findByText("Reconnect the source folder.");
  fireEvent.click(screen.getByRole("button", { name: "Export PDF" }));
  await screen.findByText("PDF download started.");
  expect(exportSequencePdf).toHaveBeenCalledTimes(2);
});

it("cancels a pending export and aborts it on unmount", async () => {
  const calls: SequencePdfOptions[] = [];
  vi.mocked(exportSequencePdf).mockImplementation((options) => {
    calls.push(options);
    return new Promise<void>((_resolve, reject) => options.signal?.addEventListener("abort", () => reject(options.signal?.reason)));
  });
  const view = render(<SequencePdfExportButton sequence={sequence} photoSource={photoSource} />);
  fireEvent.click(screen.getByRole("button", { name: "Export PDF" }));
  await waitFor(() => expect(calls).toHaveLength(1));
  fireEvent.click(screen.getByRole("button", { name: "Cancel export" }));
  expect(calls[0].signal?.aborted).toBe(true);
  expect(screen.getByRole("status").textContent).toBe("PDF export cancelled.");
  fireEvent.click(screen.getByRole("button", { name: "Export PDF" }));
  await waitFor(() => expect(calls).toHaveLength(2));
  view.unmount();
  expect(calls[1].signal?.aborted).toBe(true);
});
