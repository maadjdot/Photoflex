import { useEffect, useRef, useState, type RefObject } from "react";
import type { PhotoSource, WorktableFrame } from "../contracts";
import { useLocale } from "./locale";
import { exportFrameJpeg } from "../platform/browser/exportFrameJpeg";
import { beginAnalyticsOperation, failureKind } from "../platform/analytics/analytics";
import { analyticsForPhotoSource } from "../platform/analytics/instrumentDependencies";

export function FrameJpegExportButton({ frame, pageRef, photoSource }: {
  readonly frame: WorktableFrame;
  readonly pageRef: RefObject<HTMLElement | null>;
  readonly photoSource: PhotoSource;
}) {
  const { locale } = useLocale();
  const zh = locale === "zh-CN";
  const active = useRef<AbortController | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  useEffect(() => () => active.current?.abort(), []);
  const start = async () => {
    if (active.current || !pageRef.current) return;
    const page = pageRef.current;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true); setNotice(undefined);
    const operation = beginAnalyticsOperation(analyticsForPhotoSource(photoSource), "export_started", "frame", { format: "jpeg", count: 1 });
    try {
      await exportFrameJpeg(frame, page, photoSource, controller.signal);
      operation.finish(!controller.signal.aborted, { error_kind: controller.signal.aborted ? "cancelled" : undefined });
      if (!controller.signal.aborted) setNotice(zh ? "JPEG 已开始下载。" : "JPEG download started.");
    } catch (error) {
      operation.finish(false, { error_kind: controller.signal.aborted ? "cancelled" : failureKind(error instanceof Error ? error.name : undefined) });
      if (!controller.signal.aborted) setNotice(zh ? "JPEG 导出失败，请检查照片来源后重试。" : error instanceof Error ? error.message : "The Frame could not be exported. Try again.");
    } finally {
      active.current = undefined;
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  return <div className="table-frame-export"><button type="button" disabled={busy} onClick={() => void start()}>{busy ? (zh ? "正在导出…" : "Exporting…") : (zh ? "导出 JPEG" : "Export JPEG")}</button>
    {notice && <p className="table-frame-hint" role="status">{notice}</p>}
  </div>;
}
