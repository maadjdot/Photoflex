// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ok, type PhotoId, type PhotoRef, type ProjectId, type SourceId } from "../contracts";
import { MemoryPhotoSource } from "../platform/memory/MemoryPhotoSource";
import { MemoryProjectStore } from "../platform/memory/MemoryProjectStore";
import { App } from "./App";
import { VirtualPhotoGrid } from "./M1App";
import { startSharedScan } from "./ProjectSourceMonitor";

class TestResizeObserver {
  observe() {}
  disconnect() {}
}

class TrackingPhotoSource extends MemoryPhotoSource {
  activeThumbnailLeases = 0;

  override async thumbnail(photoId: PhotoId) {
    this.activeThumbnailLeases += 1;
    let released = false;
    return {
      ok: true as const,
      value: {
        url: `memory:${photoId}`,
        release: () => {
          if (released) return;
          released = true;
          this.activeThumbnailLeases -= 1;
        },
      },
    };
  }
}

afterEach(() => {
  cleanup();
  window.location.hash = "#/";
  vi.unstubAllGlobals();
});

describe("VirtualPhotoGrid", () => {
  it("连续 scroll 在同一帧只安排一次可见范围更新", () => {
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    const requestFrame = vi.fn(() => 1);
    const cancelFrame = vi.fn();
    vi.stubGlobal("requestAnimationFrame", requestFrame);
    vi.stubGlobal("cancelAnimationFrame", cancelFrame);

    const sourceId = "source-1" as SourceId;
    const photos: PhotoRef[] = Array.from({ length: 20 }, (_, index) => ({
      id: `photo-${index}` as PhotoId,
      sourceId,
      relativePath: `${index}.jpg`,
      width: 1200,
      height: 800,
    }));
    const photoSource = new MemoryPhotoSource([{
      grant: { sourceId, displayName: "Photos", status: "ready", restored: false },
      photos,
      previewUrls: Object.fromEntries(photos.map((photo) => [photo.id, `memory:${photo.id}`])) as Record<PhotoId, string>,
    }]);

    const view = render(
      <VirtualPhotoGrid
        photos={photos}
        selected={new Set()}
        tableIds={[]}
        missingIds={new Set()}
        onAnchorChange={() => {}}
        onToggle={() => {}}
        onOpen={() => {}}
        onNearEnd={() => {}}
        onPhotoSourceError={() => {}}
        photoSource={photoSource}
      />,
    );
    const scroller = view.container.querySelector<HTMLElement>(".sheet-scroll")!;
    Object.defineProperties(scroller, {
      clientWidth: { value: 860 },
      clientHeight: { value: 620 },
      scrollHeight: { value: 2_000 },
      scrollTop: { value: 0, writable: true },
    });

    scroller.scrollTop = 100;
    fireEvent.scroll(scroller);
    scroller.scrollTop = 120;
    fireEvent.scroll(scroller);
    scroller.scrollTop = 140;
    fireEvent.scroll(scroller);

    expect(requestFrame).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(cancelFrame).toHaveBeenCalledWith(1);
  });

  it("缩略图读取失败时把带类型的错误回传给页面", async () => {
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    const sourceId = "source-missing" as SourceId;
    const photo: PhotoRef = {
      id: "missing-photo" as PhotoId,
      sourceId,
      relativePath: "missing.jpg",
      width: 1200,
      height: 800,
    };
    const photoSource = new MemoryPhotoSource([{
      grant: { sourceId, displayName: "Photos", status: "ready", restored: false },
      photos: [photo],
    }]);
    const onPhotoSourceError = vi.fn();

    render(
      <VirtualPhotoGrid
        photos={[photo]}
        selected={new Set()}
        tableIds={[]}
        missingIds={new Set()}
        onAnchorChange={() => {}}
        onToggle={() => {}}
        onOpen={() => {}}
        onNearEnd={() => {}}
        onPhotoSourceError={onPhotoSourceError}
        photoSource={photoSource}
      />,
    );

    await waitFor(() => expect(onPhotoSourceError).toHaveBeenCalledWith(
      photo.id,
      { kind: "photo-not-found", photoId: photo.id },
    ));
  });

  it("Contact Sheet 把 photo-not-found 标记为 Missing", async () => {
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    const projectId = "project-missing" as ProjectId;
    const sourceId = "source-missing-page" as SourceId;
    const photo: PhotoRef = {
      id: "missing-page-photo" as PhotoId,
      sourceId,
      relativePath: "gone.jpg",
      width: 1200,
      height: 800,
    };
    const projectStore = new MemoryProjectStore();
    await projectStore.createProject({
      id: projectId,
      name: "Missing test",
      createdAt: "2026-08-28T00:00:00.000Z",
      initialSource: { id: sourceId, displayName: "Photos", createdAt: "2026-08-28T00:00:00.000Z" },
    });
    const photoSource = new MemoryPhotoSource([{
      grant: { sourceId, displayName: "Photos", status: "ready", restored: false },
      photos: [photo],
    }]);
    window.location.hash = `#/projects/${projectId}/sources/${sourceId}`;

    render(<App dependencies={{ projectStore, photoSource }} />);

    expect(await screen.findByLabelText(/gone\.jpg，未选择，文件已移动或重命名/, {}, { timeout: 5000 })).toBeTruthy();
  });

  it("50,000 条元数据仍只挂载视口与 overscan 内的照片和 lease", async () => {
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    const sourceId = "source-large" as SourceId;
    const photos: PhotoRef[] = Array.from({ length: 50_000 }, (_, index) => ({
      id: `large-${index}` as PhotoId,
      sourceId,
      relativePath: `${index}.jpg`,
      width: 1200,
      height: 800,
    }));
    const photoSource = new TrackingPhotoSource();

    const view = render(
      <VirtualPhotoGrid
        photos={photos}
        selected={new Set()}
        tableIds={[]}
        missingIds={new Set()}
        onAnchorChange={() => {}}
        onToggle={() => {}}
        onOpen={() => {}}
        onNearEnd={() => {}}
        onPhotoSourceError={() => {}}
        photoSource={photoSource}
      />,
    );

    await waitFor(() => expect(photoSource.activeThumbnailLeases).toBeGreaterThan(0));
    const mountedTiles = view.container.querySelectorAll(".photo-tile").length;
    expect(mountedTiles).toBeLessThanOrEqual(40);
    expect(photoSource.activeThumbnailLeases).toBe(mountedTiles);

    act(() => view.unmount());
    expect(photoSource.activeThumbnailLeases).toBe(0);
  });

  it("permission-lost 只提示重新授权，不把照片误标为 Missing", async () => {
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    const projectId = "project-permission" as ProjectId;
    const sourceId = "source-permission" as SourceId;
    const photo: PhotoRef = {
      id: "permission-photo" as PhotoId,
      sourceId,
      relativePath: "permission.jpg",
      width: 1200,
      height: 800,
    };
    const projectStore = new MemoryProjectStore();
    await projectStore.createProject({
      id: projectId,
      name: "Permission test",
      createdAt: "2026-08-28T00:00:00.000Z",
      initialSource: { id: sourceId, displayName: "Photos", createdAt: "2026-08-28T00:00:00.000Z" },
    });
    const photoSource = new MemoryPhotoSource([{
      grant: { sourceId, displayName: "Photos", status: "ready", restored: false },
      photos: [photo],
    }]);
    photoSource.thumbnail = async () => ({
      ok: false,
      error: { kind: "permission-lost", sourceId },
    });
    window.location.hash = `#/projects/${projectId}/sources/${sourceId}`;

    render(<App dependencies={{ projectStore, photoSource }} />);

    expect(await screen.findByText("文件夹授权已失效，请重新连接。")).toBeTruthy();
    expect(screen.getByLabelText("permission.jpg，未选择")).toBeTruthy();
    expect(screen.queryByText("MISSING")).toBeNull();
  });

  it("使用 M1_v2 的 Contact Sheet 标题、来源搜索与默认缩放", async () => {
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    const projectId = "project-contact-ui" as ProjectId;
    const sourceId = "source-contact-ui" as SourceId;
    const photo: PhotoRef = {
      id: "contact-ui-photo" as PhotoId,
      sourceId,
      relativePath: "one.jpg",
      width: 800,
      height: 1200,
    };
    const projectStore = new MemoryProjectStore();
    await projectStore.createProject({
      id: projectId,
      name: "UI test",
      createdAt: "2026-08-28T00:00:00.000Z",
      initialSource: { id: sourceId, displayName: "Raw Selects", createdAt: "2026-08-28T00:00:00.000Z" },
    });
    const photoSource = new MemoryPhotoSource([{
      grant: { sourceId, displayName: "Raw Selects", status: "ready", restored: false },
      photos: [photo],
      previewUrls: { [photo.id]: "memory:one" } as Record<PhotoId, string>,
    }]);
    window.location.hash = `#/projects/${projectId}/sources/${sourceId}`;

    render(<App dependencies={{ projectStore, photoSource }} />);

    expect(await screen.findByRole("heading", { name: "Raw Selects" })).toBeTruthy();
    expect(screen.getByPlaceholderText("Search Project")).toBeTruthy();
    expect(screen.getByLabelText("Photos 缩放").textContent).toContain("75%");
    expect(document.querySelector(".topbar")?.classList.contains("is-table")).toBe(true);
  });

  it("预览用 CSS 一次适应全图，并由 PhotoFlex 接管 Ctrl 加滚轮", async () => {
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    const projectId = "project-preview-ui" as ProjectId;
    const sourceId = "source-preview-ui" as SourceId;
    const photo: PhotoRef = {
      id: "portrait-photo" as PhotoId,
      sourceId,
      relativePath: "portrait.jpg",
      width: 800,
      height: 1600,
    };
    const projectStore = new MemoryProjectStore();
    await projectStore.createProject({
      id: projectId,
      name: "Preview test",
      createdAt: "2026-08-28T00:00:00.000Z",
      initialSource: { id: sourceId, displayName: "Portraits", createdAt: "2026-08-28T00:00:00.000Z" },
    });
    const photoSource = new MemoryPhotoSource([{
      grant: { sourceId, displayName: "Portraits", status: "ready", restored: false },
      photos: [photo],
      previewUrls: { [photo.id]: "memory:portrait" } as Record<PhotoId, string>,
    }]);
    window.location.hash = `#/projects/${projectId}/sources/${sourceId}`;
    const view = render(<App dependencies={{ projectStore, photoSource }} />);
    const tile = await screen.findByLabelText(/portrait\.jpg，未选择/);

    fireEvent.doubleClick(tile);
    const dialog = await screen.findByRole("dialog", { name: "Full Size Preview" });
    const image = await waitFor(() => {
      const element = view.container.querySelector<HTMLImageElement>(".preview-image-wrap img");
      expect(element).toBeTruthy();
      return element!;
    });

    // Before dimensions are decoded, the preview still has a safe fitted frame.
    expect(image.style.width).toBe("100%");
    expect(image.style.height).toBe("100%");
    expect(image.style.objectFit).toBe("contain");
    expect(image.style.objectPosition).toBe("center");
    expect(image.closest(".preview-image-wrap")?.classList.contains("is-zoomed")).toBe(true);

    const wheel = new WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -100 });
    act(() => { dialog.dispatchEvent(wheel); });
    expect(wheel.defaultPrevented).toBe(true);
    expect(screen.getByText("116%")).toBeTruthy();
  });

  it("从 Table preview 移除当前唯一照片时关闭预览且页面保持可用", async () => {
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    const projectId = "project-table-preview-remove" as ProjectId;
    const sourceId = "source-table-preview-remove" as SourceId;
    const photo: PhotoRef = {
      id: "table-preview-photo" as PhotoId,
      sourceId,
      relativePath: "remove-me.jpg",
      width: 1200,
      height: 800,
    };
    const projectStore = new MemoryProjectStore();
    await projectStore.createProject({
      id: projectId,
      name: "Table preview remove",
      createdAt: "2026-09-07T00:00:00.000Z",
      initialSource: { id: sourceId, displayName: "Photos", createdAt: "2026-09-07T00:00:00.000Z" },
    });
    const photoSource = new MemoryPhotoSource([{
      grant: { sourceId, displayName: "Photos", status: "ready", restored: false },
      photos: [photo],
      previewUrls: { [photo.id]: "memory:remove-me" } as Record<PhotoId, string>,
    }]);
    window.location.hash = `#/projects/${projectId}/sources/${sourceId}`;

    render(<App dependencies={{ projectStore, photoSource }} />);
    fireEvent.click(await screen.findByLabelText(/remove-me\.jpg，未选择/));
    fireEvent.click(screen.getByRole("button", { name: "Place on Table" }));
    const tablePreview = screen.getByLabelText("Table preview");
    fireEvent.click(await within(tablePreview).findByRole("button", { name: /remove-me\.jpg/ }));
    expect(await screen.findByRole("dialog", { name: "Full Size Preview" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Remove from Table" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Full Size Preview" })).toBeNull());
    expect(within(tablePreview).getByText("Place selected photographs here, then arrange them on Table.")).toBeTruthy();
  });

  it("照片数量不变的重扫也会刷新 Contact Sheet 元数据和缩略图", async () => {
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    const projectId = "project-same-count-rescan" as ProjectId;
    const sourceId = "source-same-count-rescan" as SourceId;
    const photoId = "same-count-photo" as PhotoId;
    const before: PhotoRef = { id: photoId, sourceId, relativePath: "before.jpg", width: 1200, height: 800, fileLastModified: 1 };
    const after: PhotoRef = { ...before, relativePath: "after.jpg", fileLastModified: 2 };
    const projectStore = new MemoryProjectStore();
    await projectStore.createProject({
      id: projectId,
      name: "Same count rescan",
      createdAt: "2026-09-07T00:00:00.000Z",
      initialSource: { id: sourceId, displayName: "Photos", createdAt: "2026-09-07T00:00:00.000Z" },
    });
    const photoSource = new MemoryPhotoSource([{
      grant: { sourceId, displayName: "Photos", status: "ready", restored: false },
      photos: [before],
      previewUrls: { [photoId]: "memory:before" } as Record<PhotoId, string>,
    }]);
    let refreshed = false;
    let scanAttempts = 0;
    vi.spyOn(photoSource, "listPhotos").mockImplementation(async () => ok({ items: [refreshed ? after : before], nextCursor: null, issues: [] }));
    vi.spyOn(photoSource, "thumbnail").mockImplementation(async () => ok({ url: refreshed ? "memory:after" : "memory:before", release() {} }));
    vi.spyOn(photoSource, "scan").mockImplementation(async function* () {
      scanAttempts += 1;
      yield ok({ kind: "progress", state: { sourceId, status: "loading", discoveredCount: 1, indexedCount: 0, skippedCount: 0, failedCount: 0, scanRevision: scanAttempts } });
      if (scanAttempts === 2) refreshed = true;
      yield ok({ kind: "completed", state: { sourceId, status: "ready", discoveredCount: 1, indexedCount: 1, skippedCount: 0, failedCount: 0, scanRevision: scanAttempts } });
    });
    window.location.hash = `#/projects/${projectId}/sources/${sourceId}`;

    const view = render(<App dependencies={{ projectStore, photoSource }} />);
    expect(await screen.findByLabelText(/before\.jpg，未选择/)).toBeTruthy();
    await waitFor(() => expect(view.container.querySelector<HTMLImageElement>('img[src="memory:before"]')).toBeTruthy());
    await waitFor(() => expect(scanAttempts).toBe(1));

    startSharedScan(photoSource, sourceId);

    expect(await screen.findByLabelText(/after\.jpg，未选择/)).toBeTruthy();
    await waitFor(() => expect(view.container.querySelector<HTMLImageElement>('img[src="memory:after"]')).toBeTruthy());
  });
});
