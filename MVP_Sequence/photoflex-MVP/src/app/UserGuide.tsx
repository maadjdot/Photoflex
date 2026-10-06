import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "./locale";
import { layoutGuideContent, userGuideContent, type GuideContent } from "./userGuideContent";
import "../styles/user-guide.css";

export function UserGuideButton({ scope = "general" }: { readonly scope?: "general" | "layout" }) {
  const { locale } = useLocale();
  const copy = (scope === "layout" ? layoutGuideContent : userGuideContent)[locale];
  const [open, setOpen] = useState(false);
  const [chapter, setChapter] = useState(0);
  return <>
    <button type="button" className="user-guide-trigger" aria-label={copy.title} title={copy.title} aria-haspopup="dialog" onClick={() => setOpen(true)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9.4 9a2.65 2.65 0 0 1 5.2.7c0 1.8-2.6 2.1-2.6 3.8" strokeLinecap="round" /><circle cx="12" cy="17" r=".8" fill="currentColor" stroke="none" /></svg>
    </button>
    {open && <UserGuide copy={copy} chapter={chapter} onChapter={setChapter} onClose={() => setOpen(false)} />}
  </>;
}

function UserGuide({ copy, chapter, onChapter, onClose }: { readonly copy: GuideContent; readonly chapter: number; readonly onChapter: (chapter: number) => void; readonly onClose: () => void }) {
  const { locale } = useLocale();
  const current = copy.chapters[chapter];
  const titleId = useId();
  const chapterId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const articleRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current!;
    const page = document.documentElement;
    const overflow = page.style.overflow;
    page.style.overflow = "hidden";
    dialog.showModal();
    return () => { dialog.close(); page.style.overflow = overflow; opener?.focus(); };
  }, []);
  useEffect(() => {
    if (articleRef.current) articleRef.current.scrollTop = 0;
    headingRef.current?.focus();
  }, [chapter]);

  return createPortal(<dialog ref={dialogRef} className="user-guide" lang={locale} aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onKeyDown={(event) => event.stopPropagation()}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="user-guide-shell">
      <header className="user-guide-header">
        <div><span>PHOTOFLEX / GUIDE</span><h2 id={titleId}>{copy.title}</h2></div>
        <button type="button" className="user-guide-close" aria-label={copy.close} title={copy.close} onClick={onClose}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg></button>
      </header>
      <div className="user-guide-body">
        <nav className="user-guide-nav" aria-label={copy.contents}>
          {copy.chapters.map((item, index) => <button key={item.id} type="button" aria-current={chapter === index ? "step" : undefined} onClick={() => onChapter(index)}>{item.title}</button>)}
        </nav>
        <article ref={articleRef} className="user-guide-article" aria-labelledby={chapterId}>
          <span className="user-guide-progress">{copy.progress(chapter + 1, copy.chapters.length)}</span>
          <h3 id={chapterId} ref={headingRef} tabIndex={-1}>{current.title}</h3>
          {current.intro && <p className="user-guide-intro">{current.intro}</p>}
          {current.steps.length > 0 && <ol className="user-guide-steps">{current.steps.map((step, index) => <li key={step.title}><span aria-hidden="true">{index + 1}</span><div><h4>{step.title}</h4><p>{step.body}</p>{step.details && <ul className="user-guide-details">{step.details.map((detail) => <li key={detail.title}><strong>{detail.title}{locale === "zh-CN" ? "：" : ": "}</strong>{detail.body}</li>)}</ul>}</div></li>)}</ol>}
          {current.shortcuts && <dl className="user-guide-shortcuts">{current.shortcuts.map((shortcut) => <div key={shortcut.keys}><dt><kbd>{shortcut.keys}</kbd></dt><dd>{shortcut.action}</dd></div>)}</dl>}
        </article>
      </div>
      <footer className="user-guide-footer">
        <button type="button" disabled={chapter === 0} onClick={() => onChapter(chapter - 1)}>{copy.previous}</button>
        <span aria-hidden="true">{String(chapter + 1).padStart(2, "0")} / {String(copy.chapters.length).padStart(2, "0")}</span>
        <button type="button" className="is-primary" onClick={() => chapter === copy.chapters.length - 1 ? onClose() : onChapter(chapter + 1)}>{chapter === copy.chapters.length - 1 ? copy.done : copy.next}<span aria-hidden="true">{chapter === copy.chapters.length - 1 ? "✓" : "→"}</span></button>
      </footer>
    </div>
  </dialog>, document.body);
}
