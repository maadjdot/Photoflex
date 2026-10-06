// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { createRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LayoutPageCurl, type LayoutPageCurlHandle } from "./LayoutPageCurl";

afterEach(cleanup);

describe("LayoutPageCurl", () => {
  beforeEach(() => {
    let frame = 0;
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => ++frame));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      disconnect() {}
    });
    const measuredSize = (element: HTMLElement, dimension: "width" | "height") => {
      const authored = element.style[dimension];
      const parsed = Number.parseFloat(authored);
      if (Number.isFinite(parsed)) {
        if (authored.endsWith("%") && element.parentElement) {
          const parentSize = dimension === "width"
            ? element.parentElement.offsetWidth
            : element.parentElement.offsetHeight;
          return parentSize * parsed / 100;
        }
        return parsed;
      }
      if (element.parentElement) {
        return dimension === "width"
          ? element.parentElement.offsetWidth
          : element.parentElement.offsetHeight;
      }
      return dimension === "width" ? 600 : 800;
    };
    Object.defineProperties(HTMLElement.prototype, {
      offsetWidth: { configurable: true, get() { return measuredSize(this, "width"); } },
      offsetHeight: { configurable: true, get() { return measuredSize(this, "height"); } },
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const width = Number.parseFloat(this.style.width) || this.offsetWidth;
      const height = Number.parseFloat(this.style.height) || this.offsetHeight;
      return { x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height, toJSON: () => ({}) };
    });
  });

  it("loads React pages, exposes the small navigation interface and stops animation work on unmount", async () => {
    const curl = createRef<LayoutPageCurlHandle>();
    const commits: number[] = [];
    function Harness() {
      const [page, setPage] = useState(0);
      return <LayoutPageCurl ref={curl} pageWidth={300} pageHeight={420} currentPage={page} mode="facing" ariaLabel="Book" onPageChange={(next) => { commits.push(next); setPage(next); }}>
        {Array.from({ length: 4 }, (_, index) => <article key={index}>Page {index + 1}</article>)}
      </LayoutPageCurl>;
    }

    const view = render(<Harness />);
    await waitFor(() => expect(view.container.querySelector(".stf__block")).toBeTruthy());
    expect(view.container.querySelector(".stf__wrapper.--landscape")).toBeTruthy();
    expect(view.container.querySelector(".layout-page-curl-flyleaf")).toBeTruthy();
    expect(view.container.querySelectorAll(".stf__item.--soft")).toHaveLength(0);
    expect(view.container.querySelectorAll(".stf__item.--hard")).toHaveLength(5);
    expect(view.container.querySelector<HTMLElement>(".layout-page-curl")?.style.getPropertyValue("--book-offset")).toBe("-150px");

    act(() => { expect(curl.current?.goTo(1)).toBe(true); });
    await waitFor(() => expect(commits.at(-1)).toBe(1));
    expect(view.container.querySelector<HTMLElement>(".layout-page-curl")?.style.getPropertyValue("--book-offset")).toBe("0px");

    act(() => { expect(curl.current?.goTo(3)).toBe(true); });
    await waitFor(() => expect(commits.at(-1)).toBe(3));
    expect(view.container.querySelector<HTMLElement>(".layout-page-curl")?.style.getPropertyValue("--book-offset")).toBe("150px");

    view.unmount();
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });

  it("forces portrait layout for single-page reading", async () => {
    const view = render(<LayoutPageCurl pageWidth={300} pageHeight={420} currentPage={0} mode="single" ariaLabel="Book" onPageChange={() => {}}>
      <article>Page 1</article><article>Page 2</article>
    </LayoutPageCurl>);
    await waitFor(() => expect(view.container.querySelector(".stf__wrapper.--portrait")).toBeTruthy());
    expect(view.container.querySelector(".layout-page-curl-flyleaf")).toBeNull();
  });

  it.each([5, 6])("shows the back cover alone with %i logical pages and can return to the body", async (count) => {
    const curl = createRef<LayoutPageCurlHandle>();
    const commits: number[] = [];
    function Harness() {
      const [page, setPage] = useState(0);
      return <LayoutPageCurl ref={curl} pageWidth={300} pageHeight={420} currentPage={page} mode="facing" backCover ariaLabel="Book"
        onPageChange={(next) => { commits.push(next); setPage(next); }}>
        {Array.from({ length: count }, (_, index) => <article key={index}>Page {index + 1}</article>)}
      </LayoutPageCurl>;
    }
    const view = render(<Harness />);
    await waitFor(() => expect(view.container.querySelector(".stf__block")).toBeTruthy());
    act(() => { expect(curl.current?.goTo(count - 1)).toBe(true); });
    await waitFor(() => expect(commits.at(-1)).toBe(count - 1));
    const book = view.container.querySelector<HTMLElement>(".layout-page-curl")!;
    expect(book.style.getPropertyValue("--book-offset")).toBe("150px");
    expect(book.style.getPropertyValue("--book-spine")).toBe("0");
    act(() => { expect(curl.current?.goTo(3)).toBe(true); });
    await waitFor(() => expect(commits.at(-1)).toBe(3));
    expect(book.style.getPropertyValue("--book-offset")).toBe(count === 5 ? "150px" : "0px");
  });
});
