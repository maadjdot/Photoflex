// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ok, type PhotoId, type ProjectId } from "../contracts";
import { MemoryPhotoSource } from "../platform/memory/MemoryPhotoSource";
import { MemoryProjectStore } from "../platform/memory/MemoryProjectStore";
import { HomePage } from "./HomePage";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("shows only the selected Table's photos, keeps the layout stable during renders, and opens that Table", async () => {
  const projectStore = new MemoryProjectStore();
  const photoSource = new MemoryPhotoSource();
  vi.spyOn(photoSource, "thumbnail").mockResolvedValue(ok({ url: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", release() {} }));
  for (const name of ["Coast", "City"]) {
    const id = name as ProjectId;
    const created = await projectStore.createProject({ id, name, createdAt: "2026-09-08T00:00:00.000Z" });
    if (!created.ok) throw new Error("Fixture creation failed");
    const entryOrder = Array.from({ length: 24 }, (_, index) => `${name}-${index}` as PhotoId);
    const saved = await projectStore.saveWorktable(id, {
      ...created.value.worktableDraft,
      entryOrder,
      placements: Object.fromEntries(entryOrder.map((photoId) => [photoId, { photoId, x: 0, y: 0, z: 1, width: 100, height: 150, filename: `${photoId}.jpg` }])),
    }, created.value.revision);
    if (!saved.ok) throw new Error("Fixture save failed");
  }
  const navigate = vi.fn();
  const view = render(<HomePage dependencies={{ projectStore, photoSource }} navigate={navigate} />);
  fireEvent.click(await screen.findByRole("button", { name: "Coast" }));
  const coast = await screen.findByLabelText("Coast photos");
  expect(coast.querySelectorAll(".home-gallery-photo").length).toBeGreaterThanOrEqual(9);
  expect(coast.querySelectorAll(".home-gallery-photo").length).toBeLessThanOrEqual(15);
  expect([...coast.querySelectorAll(".home-gallery-photo")].every((photo) => photo.classList.contains("is-portrait"))).toBe(true);
  expect([...coast.querySelectorAll<HTMLElement>(".home-gallery-photo")].every((photo) => photo.dataset.photoId?.startsWith("Coast-"))).toBe(true);
  const composition = () => [...coast.querySelectorAll<HTMLElement>(".home-gallery-photo")].map((photo) => ({ id: photo.dataset.photoId, style: photo.getAttribute("style") }));
  const before = composition();
  view.rerender(<HomePage dependencies={{ projectStore, photoSource }} navigate={navigate} />);
  expect(composition()).toEqual(before);
  fireEvent.click(screen.getByRole("button", { name: "City" }));
  const city = await screen.findByLabelText("City photos");
  await waitFor(() => expect(city.querySelectorAll("img")).toHaveLength(city.querySelectorAll(".home-gallery-photo").length));
  expect(screen.queryByLabelText("Coast photos")).toBeNull();
  const buttons = [...city.querySelectorAll<HTMLButtonElement>("button")];
  for (const button of buttons) {
    expect(button.dataset.photoId).toMatch(/^City-/);
    fireEvent.click(button);
    expect(navigate).toHaveBeenLastCalledWith({ name: "table", projectId: "City" });
  }
});
