import { createContext, memo, useContext, useEffect, useRef, useState } from "react";
import type { PhotoId, PhotoSource, ProjectId, SourceRecord } from "../../contracts";
import type { ResearchImage, ResearchStore } from "../../contracts/research";
import { RESEARCH_IMAGE_MIME } from "../../modules/research/content";
import { PhotoThumb } from "../PhotoThumb";
import { useLocale } from "../locale";

export interface ResearchMediaContextValue {
  projectId: ProjectId;
  source: PhotoSource;
  sources: readonly SourceRecord[];
  store: ResearchStore;
  preview?: (image: ResearchImage) => void;
}
export const ResearchMediaContext = createContext<ResearchMediaContextValue>(null!);

export const ResearchImageView = memo(function ResearchImageView({ kind, id, alt, large, fit = "contain" }: { kind: ResearchImage["kind"]; id: string; alt: string; large?: boolean; fit?: "contain" | "cover" }) {
  const { projectId, source, sources, store } = useContext(ResearchMediaContext);
  const { t } = useLocale();
  const [value, setValue] = useState<{ id: string; url?: string; allowed?: boolean }>();
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let current = true;
    const load = async () => {
      if (kind === "project") {
        const photo = await source.getPhoto(id as PhotoId);
        if (current) setValue({ id, allowed: photo.ok && sources.some((entry) => !entry.removedAt && entry.id === photo.value.sourceId) });
      } else {
        const material = await store.loadMaterial(projectId, id);
        if (current) setValue({ id, url: material.ok && RESEARCH_IMAGE_MIME.test(material.value.mime) ? `data:${material.value.mime};base64,${material.value.base64}` : undefined });
      }
    };
    const observer = !large && root.current && typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer?.disconnect();
      void load();
    }, { rootMargin: "300px" }) : undefined;
    if (observer && root.current) observer.observe(root.current);
    else void load();
    return () => { current = false; observer?.disconnect(); };
  }, [kind, id, projectId, source, sources, store, large]);
  return <div ref={root} className="research-image-view">
    {value?.id !== id ? <span className="research-media-placeholder" /> : value.allowed ? <PhotoThumb photoSource={source} photoId={id as PhotoId} alt={alt} fit={fit} resolution={large ? "read" : "thumbnail"} />
      : value.url ? <img src={value.url} alt={alt} decoding="async" /> : <span className="research-media-placeholder">{t("research.missingImage")}</span>}
  </div>;
});
