import HTMLFlipBook, {
  type FlipBookHandle,
  type FlippingState,
} from "@gullabs/react-flipbook";
import {
  Children,
  forwardRef,
  isValidElement,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  pageCurlEnginePage,
  pageCurlLogicalPage,
  pageCurlBookPose,
  type PageCurlDirection,
} from "../modules/layout/pageCurl";
import { navigateLayoutReaderPage, type ResolvedLayoutReaderMode } from "../modules/layout/layoutReader";

// All leaves use the engine's rigid rotateY path. Lighting and the book block
// follow that same turn; page content stays live DOM at every zoom level.
const CURL_SETTLE_MS = 800;
const CURL_SHADOW_OPACITY = 0.24;
const CURL_SWIPE_DISTANCE = 30;

export interface LayoutPageCurlHandle {
  turn(direction: PageCurlDirection): boolean;
  goTo(page: number, animated?: boolean): boolean;
  cancel(): boolean;
}

export interface LayoutPageCurlProps {
  readonly pageWidth: number;
  readonly pageHeight: number;
  readonly currentPage: number;
  readonly mode: ResolvedLayoutReaderMode;
  readonly backCover?: boolean;
  readonly ariaLabel: string;
  readonly pageBackground?: string;
  readonly children: ReactNode;
  readonly onPageChange: (page: number) => void;
  readonly onTurnSettled?: () => void;
  readonly onTurnIntent?: (direction: PageCurlDirection) => void;
}

/**
 * Deep module around the third-party curl engine. Callers own reader state and
 * page content; this module owns engine configuration, leaf roots and lifecycle.
 */
export const LayoutPageCurl = forwardRef<LayoutPageCurlHandle, LayoutPageCurlProps>(function LayoutPageCurl({
  pageWidth,
  pageHeight,
  currentPage,
  mode,
  backCover = false,
  ariaLabel,
  pageBackground = "#fff",
  children,
  onPageChange,
  onTurnSettled,
  onTurnIntent,
}, ref) {
  const engineRef = useRef<FlipBookHandle>(null);
  const bookRef = useRef<HTMLDivElement>(null);
  const settledPage = useRef(currentPage);
  const litLeaves = useRef<HTMLElement[]>([]);
  const grab = useRef<{ pointerId: number; x: number; y: number } | undefined>(undefined);
  const pageCount = Children.count(children);
  const initialPage = useRef(pageCurlEnginePage(currentPage, mode, pageCount, backCover));
  const depth = Math.min(5, 1 + Math.ceil(pageCount / 2) * .1) * pageWidth / 420;
  // The library's lazy shells omit density attributes. Keep hard roots mounted
  // and window only their content, so every page retains rigid geometry.
  const leaves = useMemo(() => {
    const pages = Children.map(children, (child, index) => (
      <div className="layout-page-curl-leaf" data-density="hard" data-face-side={mode === "facing" && (index % 2 === 1 || (backCover && index === pageCount - 1)) ? "left" : "right"} key={isValidElement(child) && child.key !== null ? child.key : index}>
        <div className="layout-page-curl-face">{Math.abs(index - currentPage) <= (mode === "single" ? 2 : 3) ? child : null}</div>
      </div>
    )) ?? [];
    if (mode === "single") return pages;
    if (backCover && pageCount > 1 && pageCount % 2 === 1) pages.splice(pages.length - 1, 0,
      <div className="layout-page-curl-leaf layout-page-curl-flyleaf" data-density="hard" key="layout-page-curl-back-flyleaf" aria-hidden="true" inert />);
    return [
      <div className="layout-page-curl-leaf layout-page-curl-flyleaf" data-density="hard" key="layout-page-curl-flyleaf" aria-hidden="true" inert />,
      ...pages,
    ];
  }, [children, mode, currentPage, pageCount, backCover]);

  const paintPose = (page: number, target = page, progress = 0) => {
    const book = bookRef.current;
    if (!book) return;
    const from = pageCurlBookPose(page, pageCount, mode, backCover), to = pageCurlBookPose(target, pageCount, mode, backCover);
    const mix = (start: number, end: number) => start + (end - start) * progress;
    book.style.setProperty("--book-offset", `${mix(from.offset, to.offset) * pageWidth}px`);
    book.style.setProperty("--book-spine", String(mix(from.spine, to.spine)));
    book.style.setProperty("--book-left-depth", `${mix(from.left, to.left) * depth}px`);
    book.style.setProperty("--book-right-depth", `${mix(from.right, to.right) * depth}px`);
    book.style.setProperty("--book-left-opacity", String(Math.min(1, mix(from.left + from.spine, to.left + to.spine) * 8)));
    book.style.setProperty("--book-right-opacity", String(Math.min(1, mix(from.right + from.spine, to.right + to.spine) * 8)));
  };
  const settleVisuals = (page = settledPage.current) => {
    settledPage.current = page;
    for (const leaf of litLeaves.current) leaf.style.removeProperty("--turn-shade");
    litLeaves.current = [];
    bookRef.current?.removeAttribute("data-turning");
    paintPose(page);
  };

  useLayoutEffect(() => { settleVisuals(currentPage); }, [currentPage, mode, pageCount, pageWidth, pageHeight, backCover]);

  useImperativeHandle(ref, () => ({
    turn: (direction) => direction > 0
      ? engineRef.current?.flipNext() ?? false
      : engineRef.current?.flipPrev() ?? false,
    goTo: (page, animated = false) => {
      const enginePage = pageCurlEnginePage(page, mode, pageCount, backCover);
      return animated
        ? engineRef.current?.flipToPage(enginePage) ?? false
        : engineRef.current?.turnToPage(enginePage) ?? false;
    },
    cancel: () => engineRef.current?.cancelTurn() ?? false,
  }), [mode, pageCount, backCover]);

  return <div ref={bookRef} className={`layout-page-curl is-${mode}`} onPointerDownCapture={(event) => {
    if (event.button === 0) grab.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  }} onPointerUpCapture={(event) => {
    const start = grab.current;
    grab.current = undefined;
    if (!start || start.pointerId !== event.pointerId) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    // The engine measures folds from the spine, so a grab in the middle can
    // start near half-turn. A short drag should return to the grabbed page.
    if (Math.hypot(dx, dy) > 5 && Math.abs(dx) < pageWidth * .16) engineRef.current?.cancelTurn();
  }} onPointerCancelCapture={() => { grab.current = undefined; }} style={{
    width: pageWidth * (mode === "single" ? 1 : 2), height: pageHeight,
    "--book-page-width": `${pageWidth}px`,
  } as CSSProperties}>
    <div className="layout-page-curl-stack is-left" aria-hidden="true" />
    <div className="layout-page-curl-stack is-right" aria-hidden="true" />
    <HTMLFlipBook
    ref={engineRef}
    width={pageWidth}
    height={pageHeight}
    initialPage={initialPage.current}
    page={pageCurlEnginePage(currentPage, mode, pageCount, backCover)}
    pageTransition="instant"
    sizing={mode === "single" ? "responsive" : "fixed"}
    minWidth={pageWidth}
    maxWidth={pageWidth}
    minHeight={pageHeight}
    maxHeight={pageHeight}
    usePortrait={mode === "single"}
    autoSize={false}
    drawShadow
    maxShadowOpacity={CURL_SHADOW_OPACITY}
    flippingTime={CURL_SETTLE_MS}
    allowTouchScroll={false}
    respectInteractiveContent
    respectReducedMotion
    swipeDistance={CURL_SWIPE_DISTANCE}
    foldCornerOnHover={false}
    flipOnClick="anywhere"
    useKeyboard={false}
    controls="none"
    liveRegion={false}
    aria-label={ariaLabel}
    pageBackground={pageBackground}
    className="layout-page-curl-engine"
    style={{ width: pageWidth * (mode === "single" ? 1 : 2), height: pageHeight }}
    onPageChange={(snapshot) => {
      const page = pageCurlLogicalPage(snapshot.page, mode, pageCount, backCover);
      settleVisuals(page);
      onPageChange(page);
    }}
    onChangeState={({ state }: { state: FlippingState }) => {
      if (state === "read") { settleVisuals(); onTurnSettled?.(); }
    }}
    onTurnProgress={({ progress, direction }) => {
      const turnDirection = direction === "next" ? 1 : -1;
      if (!bookRef.current?.hasAttribute("data-turning")) {
        bookRef.current?.setAttribute("data-turning", direction);
        const engine = engineRef.current?.pageFlip();
        const visible = engine?.getVisiblePages() ?? [];
        const front = mode === "single" ? visible[0] : turnDirection > 0 ? visible.at(-1) : visible[0];
        litLeaves.current = front === undefined ? [] : [front, front + turnDirection]
          .map((index) => engine?.getPageElement(index))
          .filter((leaf): leaf is HTMLElement => !!leaf);
        onTurnIntent?.(turnDirection);
      }
      const shade = Math.sin(progress * Math.PI) * .18;
      for (const leaf of litLeaves.current) leaf.style.setProperty("--turn-shade", String(shade));
      paintPose(settledPage.current, navigateLayoutReaderPage(pageCount, settledPage.current, mode, turnDirection, backCover), progress);
    }}
    onTurnRejected={() => { settleVisuals(); onTurnSettled?.(); }}
  >{leaves}</HTMLFlipBook>
    <div className="layout-page-curl-spine" aria-hidden="true" />
  </div>;
});
