// PROTOTYPE — Three photo-book layout directions, switchable via ?variant= on /prototype/layout.
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import "../styles/layout-prototype.css";

type Variant = "A" | "B" | "C";
type Panel = "pages" | "materials" | "details" | null;
type CropMode = "fit" | "fill";

const variants: ReadonlyArray<{ key: Variant; name: string }> = [
  { key: "A", name: "模板先行" },
  { key: "B", name: "极简画布" },
  { key: "C", name: "页面 + 属性" },
];

const photos = [
  { id: "coast", label: "海岸 01", url: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=85" },
  { id: "cliff", label: "海岸 02", url: "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1400&q=85" },
  { id: "water", label: "海岸 03", url: "https://images.unsplash.com/photo-1497436072909-f5e4be4cec?auto=format&fit=crop&w=1400&q=85" },
  { id: "forest", label: "海岸 04", url: "https://images.unsplash.com/photo-1511497584788-876760111969?auto=format&fit=crop&w=1400&q=85" },
  { id: "road", label: "城市 01", url: "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&w=1400&q=85" },
  { id: "window", label: "城市 02", url: "https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=1400&q=85" },
] as const;

const templateNames = ["留白单图", "左右对页", "满版跨页", "一主二辅"] as const;

interface PrototypeState {
  readonly page: number;
  readonly selected: string;
  readonly cropMode: CropMode;
  readonly panel: Panel;
  readonly template: number;
  readonly zoom: number;
  readonly offset: { x: number; y: number };
}

export function LayoutPrototype() {
  const [variant, setVariantState] = useState<Variant>(() => readVariant());
  const [page, setPage] = useState(2);
  const [selected, setSelected] = useState("title");
  const [cropMode, setCropMode] = useState<CropMode>("fill");
  const [panel, setPanel] = useState<Panel>(null);
  const [template, setTemplate] = useState(1);
  const [zoom, setZoom] = useState(75);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const setVariant = useCallback((next: Variant) => {
    const url = new URL(window.location.href);
    url.searchParams.set("variant", next);
    window.history.replaceState(null, "", url);
    setVariantState(next);
    setPanel(null);
  }, []);

  const cycleVariant = useCallback((direction: -1 | 1) => {
    const index = variants.findIndex((item) => item.key === variant);
    setVariant(variants[(index + direction + variants.length) % variants.length].key);
  }, [setVariant, variant]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, [contenteditable='true']")) return;
      if (event.key === "ArrowLeft") { event.preventDefault(); cycleVariant(-1); }
      if (event.key === "ArrowRight") { event.preventDefault(); cycleVariant(1); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cycleVariant]);

  const state: PrototypeState = { page, selected, cropMode, panel, template, zoom, offset };
  const actions = {
    setPage,
    setSelected,
    setCropMode,
    setPanel: (next: Panel) => setPanel((current) => current === next ? null : next),
    setTemplate,
    setZoom: (next: number) => setZoom(Math.max(45, Math.min(110, next))),
    setOffset,
  };

  return (
    <main className="lp-root">
      {variant === "A" && <VariantA state={state} actions={actions} />}
      {variant === "B" && <VariantB state={state} actions={actions} />}
      {variant === "C" && <VariantC state={state} actions={actions} />}
      <PrototypeStateStrip variant={variant} state={state} />
      {import.meta.env.DEV && <PrototypeSwitcher current={variant} onPrevious={() => cycleVariant(-1)} onNext={() => cycleVariant(1)} />}
    </main>
  );
}

interface VariantProps {
  readonly state: PrototypeState;
  readonly actions: {
    setPage(page: number): void;
    setSelected(id: string): void;
    setCropMode(mode: CropMode): void;
    setPanel(panel: Panel): void;
    setTemplate(index: number): void;
    setZoom(zoom: number): void;
    setOffset(offset: { x: number; y: number }): void;
  };
}

function VariantA({ state, actions }: VariantProps) {
  return (
    <section className="lp-app lp-a" aria-label="方案 A：模板先行">
      <PrototypeHeader title="海岸手记 · 作品集" subtitle="Sequence 生成 · 12 张照片" />
      <div className="lp-a-body">
        <aside className="lp-template-rail">
          <div className="lp-section-heading"><strong>版式</strong><span>4 个建议</span></div>
          <div className="lp-template-list">
            {templateNames.map((name, index) => (
              <button className={state.template === index ? "is-active" : ""} onClick={() => actions.setTemplate(index)} key={name}>
                <TemplateMiniature index={index} />
                <span>{name}</span>
              </button>
            ))}
          </div>
          <button className="lp-text-link">＋ 保存当前版式</button>
        </aside>
        <section className="lp-a-workspace">
          <div className="lp-context-row">
            <div><button>撤销</button><button>重做</button><span className="lp-rule" /><button>交换图片</button></div>
            <div><button onClick={() => actions.setCropMode("fit")} className={state.cropMode === "fit" ? "is-active" : ""}>完整显示</button><button onClick={() => actions.setCropMode("fill")} className={state.cropMode === "fill" ? "is-active" : ""}>填满画框</button></div>
          </div>
          <div className="lp-spread-wrap">
            <BookSpread template={state.template} selected={state.selected} cropMode={state.cropMode} offset={state.offset} onSelect={actions.setSelected} onOffset={actions.setOffset} />
          </div>
          <div className="lp-page-nav"><button onClick={() => actions.setPage(Math.max(1, state.page - 1))}>‹</button><span>第 {state.page}–{state.page + 1} 页 / 12</span><button onClick={() => actions.setPage(Math.min(11, state.page + 1))}>›</button></div>
          <MaterialTray selected={state.selected} onSelect={actions.setSelected} />
        </section>
        <aside className="lp-a-inspector">
          <div className="lp-section-heading"><strong>图片</strong><button>•••</button></div>
          <label>显示方式<div className="lp-segment"><button className={state.cropMode === "fit" ? "is-active" : ""} onClick={() => actions.setCropMode("fit")}>完整</button><button className={state.cropMode === "fill" ? "is-active" : ""} onClick={() => actions.setCropMode("fill")}>填满</button></div></label>
          <label>位置<div className="lp-input-row"><span>X&nbsp; {state.offset.x}</span><span>Y&nbsp; {state.offset.y}</span></div></label>
          <label>边距<div className="lp-range"><span style={{ width: "42%" }} /></div></label>
          <div className="lp-inspector-note"><span>印刷检查</span><strong>图片清晰度良好</strong><small>预计 318 PPI</small></div>
        </aside>
      </div>
    </section>
  );
}

function VariantB({ state, actions }: VariantProps) {
  return (
    <section className="lp-app lp-b" aria-label="方案 B：极简画布">
      <PrototypeHeader title="海岸手记 · 作品集" subtitle="已保存到本机" compact />
      <div className="lp-minimal-tools">
        <div><button>＋ 图片</button><button>＋ 文字</button><span className="lp-rule"/><button>↶</button><button>↷</button></div>
        <div><button onClick={() => actions.setPanel("pages")} className={state.panel === "pages" ? "is-active" : ""}>页面</button><button onClick={() => actions.setPanel("materials")} className={state.panel === "materials" ? "is-active" : ""}>材料</button><button onClick={() => actions.setPanel("details")} className={state.panel === "details" ? "is-active" : ""}>更多</button></div>
      </div>
      <div className="lp-b-stage">
        <Drawer panel={state.panel} state={state} actions={actions} />
        <div className="lp-b-paper-shell" style={{ "--lp-zoom": state.zoom / 75 } as CSSProperties}>
          {state.selected === "title" && <div className="lp-inline-toolbar"><button>衬线体</button><button>32</button><button>左对齐</button><button>•••</button></div>}
          <BookSpread template={state.template} selected={state.selected} cropMode={state.cropMode} offset={state.offset} onSelect={actions.setSelected} onOffset={actions.setOffset} clean />
        </div>
      </div>
      <footer className="lp-b-footer">
        <div><button onClick={() => actions.setPage(Math.max(1, state.page - 1))}>‹</button><span>第 {state.page} / 12 页</span><button onClick={() => actions.setPage(Math.min(12, state.page + 1))}>›</button><button>＋ 添加页面</button></div>
        <div><button onClick={() => actions.setZoom(state.zoom - 10)}>−</button><span>{state.zoom}%</span><button onClick={() => actions.setZoom(state.zoom + 10)}>＋</button></div>
      </footer>
    </section>
  );
}

function VariantC({ state, actions }: VariantProps) {
  return (
    <section className="lp-app lp-c" aria-label="方案 C：页面、照片与属性工作区">
      <PrototypeHeader title="海岸手记 · 作品集" subtitle="已保存到本机" />
      <div className="lp-c-body">
        <aside className="lp-page-overview">
          <div className="lp-section-heading"><strong>页面</strong><button>＋</button></div>
          <div className="lp-page-overview-list">
            {["封面", "海岸", "城市", "结束"].map((name, index) => (
              <button key={name} className={state.page === index + 1 ? "is-active" : ""} onClick={() => actions.setPage(index + 1)}>
                <span className="lp-page-number">{String(index + 1).padStart(2, "0")}</span>
                <TemplateMiniature index={index} />
                <span><strong>{name}</strong><small>{index === 1 ? "当前跨页" : index === 0 ? "扉页" : "2 张照片"}</small></span>
              </button>
            ))}
          </div>
        </aside>
        <section className="lp-c-center">
          <div className="lp-c-tools"><div><button className="is-active">选择</button><button>图片</button><button>文字</button><button>裁切</button></div><div><button>↶</button><button>↷</button><span className="lp-rule"/><button>适合页面</button></div></div>
          <div className="lp-c-canvas">
            <BookSpread template={1} selected={state.selected} cropMode={state.cropMode} offset={state.offset} onSelect={actions.setSelected} onOffset={actions.setOffset} clean />
            <div className="lp-c-page-status">第 {state.page}–{state.page + 1} 页 / 12</div>
          </div>
          <MaterialTray selected={state.selected} onSelect={actions.setSelected} />
        </section>
        <aside className="lp-property-panel">
          <div className="lp-property-tabs"><button className="is-active">Property</button><button>样式</button></div>
          <div className="lp-property-section"><span className="lp-property-caption">{state.selected === "title" ? "文字框" : "图片框"}</span><div className="lp-property-grid"><label>X <span>{state.offset.x}</span></label><label>Y <span>{state.offset.y}</span></label><label>W <span>{state.selected === "title" ? 280 : 320}</span></label><label>H <span>{state.selected === "title" ? 110 : 460}</span></label></div></div>
          {state.selected === "title" ? <>
            <div className="lp-property-section"><span className="lp-property-caption">字体</span><label className="lp-property-wide">字体 <span>Ancizar Serif</span></label><div className="lp-property-pair"><label>字号 <span>32</span></label><label>行高 <span>0.94</span></label></div><label className="lp-property-wide">颜色 <span><i className="lp-color-chip"/> #171717</span></label></div>
            <div className="lp-property-section"><span className="lp-property-caption">对齐</span><div className="lp-align-row"><button className="is-active">≡</button><button>≡</button><button>≡</button><button>≡</button></div></div>
          </> : <div className="lp-property-section"><span className="lp-property-caption">图片</span><div className="lp-segment"><button className={state.cropMode === "fit" ? "is-active" : ""} onClick={() => actions.setCropMode("fit")}>完整显示</button><button className={state.cropMode === "fill" ? "is-active" : ""} onClick={() => actions.setCropMode("fill")}>填满画框</button></div><label className="lp-property-wide">清晰度 <span>318 PPI</span></label></div>}
          <div className="lp-property-section"><span className="lp-property-caption">层级</span><div className="lp-layer-row"><button>↑</button><button>↓</button><button>置顶</button><button>置底</button></div></div>
        </aside>
      </div>
    </section>
  );
}

function PrototypeHeader({ title, subtitle, compact = false }: { title: string; subtitle: string; compact?: boolean }) {
  return <header className={`lp-header${compact ? " is-compact" : ""}`}><div className="lp-brand">PhotoFlex <span>/ 海岸手记</span></div><nav><button>Table</button><button>Sequence</button><button className="is-active">Layout</button></nav><div className="lp-header-actions"><span>{subtitle}</span><button className="lp-export">导出 PDF</button></div><div className="lp-document-title">{title}</div></header>;
}

function BookSpread({ template, selected, cropMode, offset, onSelect, onOffset, clean = false, compact = false }: { template: number; selected: string; cropMode: CropMode; offset: { x: number; y: number }; onSelect(id: string): void; onOffset(offset: { x: number; y: number }): void; clean?: boolean; compact?: boolean }) {
  const beginDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const start = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
    const move = (moveEvent: PointerEvent) => onOffset({ x: Math.round(start.ox + (moveEvent.clientX - start.x)), y: Math.round(start.oy + (moveEvent.clientY - start.y)) });
    const end = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
  };
  const cls = `lp-spread lp-template-${template}${clean ? " is-clean" : ""}${compact ? " is-compact" : ""}`;
  return <div className={cls}>
    <div className="lp-page lp-page-left">
      <button className={`lp-frame lp-main-photo${selected === "coast" ? " is-selected" : ""}`} onClick={(event) => { event.stopPropagation(); onSelect("coast"); }} onPointerDown={beginDrag} style={{ "--photo-x": `${offset.x}px`, "--photo-y": `${offset.y}px` } as CSSProperties}><Photo photo={photos[0]} mode={cropMode}/><Handles visible={selected === "coast"}/></button>
      <span className="lp-folio">02</span>
    </div>
    <div className="lp-page lp-page-right">
      <button className={`lp-frame lp-secondary-photo${selected === "cliff" ? " is-selected" : ""}`} onClick={(event) => { event.stopPropagation(); onSelect("cliff"); }}><Photo photo={photos[1]} mode={cropMode}/><Handles visible={selected === "cliff"}/></button>
      <button className={`lp-title-block${selected === "title" ? " is-selected" : ""}`} onClick={(event) => { event.stopPropagation(); onSelect("title"); }}><strong>Between shore<br/>& city</strong><span>潮汐褪去以后，城市从远处开始显形。沿着岸线行走，记录海风、建筑与人之间短暂的停顿。</span><Handles visible={selected === "title"}/></button>
      <span className="lp-folio">03</span>
    </div>
  </div>;
}

function Photo({ photo, mode = "fill" }: { photo: typeof photos[number]; mode?: CropMode }) {
  return <span className={`lp-photo lp-photo-${photo.id}`} style={{ backgroundImage: `linear-gradient(135deg, rgba(13,21,24,.12), rgba(236,231,218,.05)), url(${photo.url}), var(--lp-photo-fallback)`, backgroundSize: `cover, ${mode === "fill" ? "cover" : "contain"}, cover` }} role="img" aria-label={photo.label} />;
}

function Handles({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return <><i className="lp-handle nw"/><i className="lp-handle ne"/><i className="lp-handle sw"/><i className="lp-handle se"/></>;
}

function TemplateMiniature({ index }: { index: number }) {
  return <span className={`lp-template-mini mini-${index}`}><i/><i/><b/></span>;
}

function MaterialTray({ selected, onSelect }: { selected: string; onSelect(id: string): void }) {
  return <div className="lp-material-tray"><div><strong>材料</strong><span>已使用 4 / 12</span></div><div className="lp-materials">{photos.map((photo, index) => <button key={photo.id} className={selected === photo.id ? "is-active" : ""} onClick={() => onSelect(photo.id)}><Photo photo={photo}/><span>{index < 2 ? "已使用" : "+"}</span></button>)}</div></div>;
}

function Drawer({ panel, state, actions }: { panel: Panel; state: PrototypeState; actions: VariantProps["actions"] }) {
  if (!panel) return null;
  return <aside className="lp-drawer">
    <div className="lp-section-heading"><strong>{panel === "pages" ? "页面" : panel === "materials" ? "材料" : "详细属性"}</strong><button onClick={() => actions.setPanel(panel)}>×</button></div>
    {panel === "pages" && <div className="lp-drawer-pages">{[1,2,3,4].map((number) => <button className={state.page === number ? "is-active" : ""} onClick={() => actions.setPage(number)} key={number}><TemplateMiniature index={(number - 1) % 4}/><span>{number}</span></button>)}</div>}
    {panel === "materials" && <div className="lp-drawer-materials">{photos.map((photo) => <button key={photo.id} onClick={() => actions.setSelected(photo.id)}><Photo photo={photo}/><span>{photo.label}</span></button>)}</div>}
    {panel === "details" && <div className="lp-drawer-details"><label>适配方式<div className="lp-segment"><button className={state.cropMode === "fit" ? "is-active" : ""} onClick={() => actions.setCropMode("fit")}>完整</button><button className={state.cropMode === "fill" ? "is-active" : ""} onClick={() => actions.setCropMode("fill")}>填满</button></div></label><label>位置<div className="lp-input-row"><span>X {state.offset.x}</span><span>Y {state.offset.y}</span></div></label><label>透明度<div className="lp-range"><span style={{width:"100%"}}/></div></label></div>}
  </aside>;
}

function PrototypeSwitcher({ current, onPrevious, onNext }: { current: Variant; onPrevious(): void; onNext(): void }) {
  const item = variants.find((variant) => variant.key === current)!;
  return <div className="lp-switcher" aria-label="原型方案切换"><button onClick={onPrevious} aria-label="上一个方案">←</button><span><small>PROTOTYPE</small>{item.key} — {item.name}</span><button onClick={onNext} aria-label="下一个方案">→</button><kbd>← →</kbd></div>;
}

function PrototypeStateStrip({ variant, state }: { variant: Variant; state: PrototypeState }) {
  const visible = useMemo(() => JSON.stringify({ 方案: variant, 页码: state.page, 选中: state.selected, 图片: state.cropMode, 面板: state.panel ?? "关闭", 版式: templateNames[state.template], 缩放: `${state.zoom}%`, 偏移: state.offset }), [state, variant]);
  return <details className="lp-state"><summary>查看当前状态</summary><code>{visible}</code></details>;
}

function readVariant(): Variant {
  const value = new URLSearchParams(window.location.search).get("variant")?.toUpperCase();
  return value === "A" || value === "B" || value === "C" ? value : "B";
}
