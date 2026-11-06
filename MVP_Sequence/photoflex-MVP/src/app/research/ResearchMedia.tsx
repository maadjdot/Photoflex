import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PhotoId, PhotoRef, ProjectId } from "../../contracts";
import type { ResearchImage, ResearchMaterial, ResearchMaterialSummary } from "../../contracts/research";
import { RESEARCH_IMAGE_MIME } from "../../modules/research/content";
import { ResearchImageView, ResearchMediaContext } from "./ResearchImageView";
import { useLocale } from "../locale";

export function ResearchImageGroup({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const { t } = useLocale();
  const { preview } = useContext(ResearchMediaContext);
  const images: ResearchImage[] = node.attrs.images;
  const move = (index: number, delta: number) => {
    const next = [...images];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    updateAttributes({ images: next });
  };
  const remove = (index: number) => images.length === 1 ? deleteNode() : updateAttributes({ images: images.filter((_, i) => i !== index) });
  return <NodeViewWrapper className={`research-image-group${images.length === 1 ? " is-single" : ""}`} contentEditable={false}>
    {images.map((image, i) => <figure key={`${image.kind}:${image.id}:${images.slice(0, i).filter((item) => item.id === image.id).length}`}>
      <div className="research-image-stage">
        <button type="button" className="research-image-open" aria-label={t("research.previewImage")} onClick={() => preview?.(image)}>
          <ResearchImageView id={image.id} kind={image.kind} alt={image.caption} />
        </button>
        <div className="research-image-actions">
          <button type="button" disabled={!i} aria-label={t("research.moveEarlier")} onClick={() => move(i, -1)}>←</button>
          <button type="button" disabled={i === images.length - 1} aria-label={t("research.moveLater")} onClick={() => move(i, 1)}>→</button>
          <button type="button" aria-label={t("research.removeImage")} onClick={() => remove(i)}>×</button>
        </div>
      </div>
      <input className="research-caption" aria-label={t("research.caption")} placeholder={t("research.caption")} value={image.caption}
        onChange={(event) => updateAttributes({ images: images.map((item, index) => index === i ? { ...item, caption: event.target.value } : item) })} />
      <figcaption>{t(image.kind === "project" ? "research.projectPhotos" : "research.materials")}</figcaption>
    </figure>)}
  </NodeViewWrapper>;
}

export function ResearchDialog({ title, close, children, className = "" }: { title: string; close: () => void; children: ReactNode; className?: string }) {
  const { t } = useLocale();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const active = document.activeElement;
    const modal = dialog.current;
    modal?.showModal();
    return () => {
      modal?.close();
      if (active instanceof HTMLElement && active.isConnected) active.focus();
    };
  }, []);
  return <dialog ref={dialog} aria-label={title} className={`research-dialog ${className}`} onCancel={(event) => { event.preventDefault(); close(); }}
    onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section><header><h2>{title}</h2><button type="button" aria-label={t("common.close")} onClick={close}>×</button></header>{children}</section>
  </dialog>;
}

export function ResearchImagePreview({ image, close }: { image: ResearchImage; close: () => void }) {
  const { t } = useLocale();
  return <ResearchDialog title={image.caption || t("research.previewImage")} close={close} className="research-preview">
    <ResearchImageView id={image.id} kind={image.kind} alt={image.caption} large />
    <footer>{t(image.kind === "project" ? "research.projectPhotos" : "research.materials")}</footer>
  </ResearchDialog>;
}

const imageLimit = 10 * 1024 * 1024;
export function imageFileSupported(file: File) {
  return RESEARCH_IMAGE_MIME.test(file.type) && file.size > 0 && file.size <= imageLimit;
}

export async function readResearchImage(file: File, projectId: ProjectId): Promise<ResearchMaterial> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  return { id: crypto.randomUUID(), projectId, name: file.name, mime: file.type, base64 };
}

const PAGE_SIZE = 48;
export function ResearchImagePicker({ close, insert, importFiles }: {
  close: () => void;
  insert: (images: ResearchImage[]) => void;
  importFiles: (files: File[]) => Promise<readonly ResearchMaterialSummary[]>;
}) {
  const { t } = useLocale();
  const { store, projectId, source, sources } = useContext(ResearchMediaContext);
  const [tab, setTab] = useState<ResearchImage["kind"]>("project");
  const [photos, setPhotos] = useState<PhotoRef[]>([]);
  const [materials, setMaterials] = useState<readonly ResearchMaterialSummary[]>([]);
  const [selected, setSelected] = useState<ResearchImage[]>([]);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [importing, setImporting] = useState(false);
  const [uploadMessage, setUploadMessage] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let current = true;
    void store.listMaterials(projectId).then((result) => {
      if (current && result.ok) setMaterials(result.value);
      else if (current) setFailed(true);
    });
    void Promise.all(sources.filter((entry) => !entry.removedAt).map(async (entry) => {
      const items: PhotoRef[] = [];
      let cursor: string | undefined;
      do {
        const page = await source.listPhotos(entry.id, cursor, 500);
        if (!page.ok) { if (current) setFailed(true); break; }
        items.push(...page.value.items);
        cursor = page.value.nextCursor ?? undefined;
      } while (current && cursor);
      return items;
    })).then((pages) => { if (current) { setPhotos(pages.flat()); setLoading(false); } });
    return () => { current = false; };
  }, [projectId, source, sources, store]);
  const results = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    const entries = tab === "project" ? photos.map((photo) => ({ id: photo.id, name: photo.relativePath })) : materials;
    return entries.filter(({ name }) => name.toLocaleLowerCase().includes(term));
  }, [query, tab, materials, photos]);
  const switchTab = (next: ResearchImage["kind"]) => { setTab(next); setQuery(""); setLimit(PAGE_SIZE); };
  const upload = async (files: File[]) => {
    if (!files.length || importing) return;
    setImporting(true);
    setUploadMessage(false);
    try {
      const added = await importFiles(files);
      setUploadMessage(added.length !== files.length);
      if (added.length) {
        setMaterials((previous) => [...added, ...previous]);
        setSelected((previous) => [...previous, ...added.map(({ id }): ResearchImage => ({ id, kind: "research", caption: "" }))]);
        switchTab("research");
      }
    } finally { setImporting(false); }
  };
  return <ResearchDialog title={t("research.insertImage")} close={() => { if (!importing) close(); }} className="research-picker">
    <div className="research-picker-tabs">
      <button type="button" aria-pressed={tab === "project"} onClick={() => switchTab("project")}>{t("research.projectPhotos")} <small>{photos.length}</small></button>
      <button type="button" aria-pressed={tab === "research"} onClick={() => switchTab("research")}>{t("research.materials")} <small>{materials.length}</small></button>
      <button type="button" disabled={importing} onClick={() => fileInput.current?.click()}>{t("research.upload")}</button>
      <input ref={fileInput} hidden type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/bmp" multiple onChange={(event) => {
        void upload(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = "";
      }} />
    </div>
    <div className="research-picker-content" onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }}
      onDrop={(event) => { event.preventDefault(); void upload(Array.from(event.dataTransfer.files)); }}
      onPaste={(event) => { if (event.clipboardData.files.length) { event.preventDefault(); void upload(Array.from(event.clipboardData.files)); } }}>
      <input type="search" aria-label={t("research.searchImages")} placeholder={t("research.searchImages")} value={query} onChange={(event) => { setQuery(event.target.value); setLimit(PAGE_SIZE); }} />
      {uploadMessage && <p role="alert">{t("research.uploadFailed")}</p>}
      {failed && <p role="alert">{t("research.imagesUnavailable")}</p>}
      <div className="research-picker-grid">
        {results.slice(0, limit).map(({ id, name }) => {
          const active = selected.some((image) => image.id === id && image.kind === tab);
          return <button key={id} type="button" aria-pressed={active} onClick={() => setSelected((previous) => active
            ? previous.filter((image) => image.id !== id || image.kind !== tab)
            : [...previous, (tab === "project" ? { kind: tab, id: id as PhotoId, caption: "" } : { kind: tab, id, caption: "" })])}>
            <ResearchImageView id={id} kind={tab} alt="" /><span title={name}>{name}</span>
          </button>;
        })}
      </div>
      {!results.length && <p className="research-empty-images">{loading && tab === "project" ? t("common.loading") : t(query ? "research.noMatches" : "research.noImages")}</p>}
      {results.length > limit && <button type="button" onClick={() => setLimit(limit + PAGE_SIZE)}>{t("research.moreImages")}</button>}
    </div>
    <footer><span>{t("research.selectedImages", { count: selected.length })}</span><button type="button" onClick={close} disabled={importing}>{t("common.cancel")}</button>
      <button className="research-primary" type="button" disabled={!selected.length || importing} onClick={() => insert(selected)}>{t("research.insertImage")}</button></footer>
  </ResearchDialog>;
}
