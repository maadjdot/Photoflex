import { useEffect, useRef, useState } from "react";
import type { PhotoSource, SequenceDocument, SequencePdfProgress } from "../contracts";
import exportIcon from "../assets/icons/sequence-export.svg";

export function SequencePdfExportButton({ sequence, photoSource }: { sequence: SequenceDocument; photoSource: PhotoSource }) {
  const active = useRef<AbortController | undefined>(undefined);
  const [progress, setProgress] = useState<SequencePdfProgress>();
  const [notice, setNotice] = useState<string>();
  useEffect(() => () => { active.current?.abort(); active.current = undefined; }, []);

  const start = async () => {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setNotice(undefined);
    setProgress({ completed: 0, total: sequence.readingUnits.length });
    try {
      const options = {
        sequence: structuredClone(sequence),
        viewport: { width: window.innerWidth, height: window.innerHeight },
        signal: controller.signal,
        onProgress: (value: SequencePdfProgress) => { if (!controller.signal.aborted) setProgress(value); },
      };
      const { exportSequencePdf } = await import("../platform/browser/exportSequencePdf");
      await exportSequencePdf(options, photoSource);
      if (!controller.signal.aborted) setNotice("PDF download started.");
    } catch (error) {
      if (!controller.signal.aborted) setNotice(error instanceof Error ? error.message : "PDF export failed. Please retry.");
    } finally {
      if (active.current === controller) { active.current = undefined; setProgress(undefined); }
    }
  };
  const cancel = () => {
    active.current?.abort();
    active.current = undefined;
    setProgress(undefined);
    setNotice("PDF export cancelled.");
  };

  return <>
    <button type="button" className="table-tool-button sequence-tool-button sequence-export-button" disabled={Boolean(progress) || !sequence.readingUnits.length} title="Export all Reading Units as white photo pages" onClick={() => void start()}>
      <img src={exportIcon} alt="" /><span>{progress ? "Exporting…" : "Export PDF"}</span>
    </button>
    {(progress || notice) && <div className="sequence-export-status" onKeyDown={(event) => event.stopPropagation()}>
      <span role="status">{progress ? `Exporting PDF · ${progress.completed} / ${progress.total} pages` : notice}</span>
      {progress ? <button type="button" onClick={cancel}>Cancel export</button> : <button type="button" aria-label="Dismiss export message" onClick={() => setNotice(undefined)}>×</button>}
    </div>}
  </>;
}
