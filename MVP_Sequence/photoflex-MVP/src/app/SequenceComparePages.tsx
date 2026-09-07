import { useEffect, useMemo, useState, type ButtonHTMLAttributes } from "react";
import previewIcon from "../assets/icons/table-preview.svg";
import swapIcon from "../assets/icons/table-swap.svg";
import type {
  PhotoId,
  ProjectId,
  SequenceDocument,
  SequenceId,
  SequenceItemId,
  SequenceSummary,
  SequenceVersion,
  VersionId,
  VersionSummary,
} from "../contracts";
import { compareSequences } from "../modules/sequence";
import { compareVersions } from "../modules/versioning";
import type { AppDependencies } from "./dependencies";
import { PhotoThumb } from "./PhotoThumb";
import type { AppRoute } from "./router";
import { useProjectWorkspaceSession } from "./useProjectWorkspace";

export function SequenceComparePage({
  dependencies,
  projectId,
  leftSequenceId,
  rightSequenceId,
  navigate,
}: {
  readonly dependencies: AppDependencies;
  readonly projectId: ProjectId;
  readonly leftSequenceId: SequenceId;
  readonly rightSequenceId: SequenceId;
  readonly navigate: (route: AppRoute) => void;
}) {
  const [left, setLeft] = useState<SequenceDocument>();
  const [right, setRight] = useState<SequenceDocument>();
  const [availableSequences, setAvailableSequences] = useState<readonly SequenceSummary[]>([]);
  const [error, setError] = useState<string>();
  const { loadSequence, listSequences } = useProjectWorkspaceSession(dependencies, projectId);

  useEffect(() => {
    let live = true;
    void Promise.all([loadSequence(leftSequenceId), loadSequence(rightSequenceId), listSequences()]).then(([a, b, all]) => {
      if (!live) return;
      if (!a.ok || !b.ok) {
        setError("Sequences could not be compared.");
        return;
      }
      setLeft(a.value);
      setRight(b.value);
      if (all.ok) setAvailableSequences(all.value);
    });
    return () => { live = false; };
  }, [leftSequenceId, listSequences, loadSequence, projectId, rightSequenceId]);

  const diff = useMemo(() => left && right ? compareSequences(left, right) : undefined, [left, right]);
  if (!left || !right || !diff) {
    return <main className="page centered-state">{error ? <h1>{error}</h1> : <><div className="loading-mark" /><p>Comparing Sequences…</p></>}</main>;
  }
  const leftOnly = new Set(diff.leftOnly);
  const rightOnly = new Set(diff.rightOnly);
  const moved = new Set(diff.shared.filter((item) => item.moved).map((item) => item.photoId));
  const choose = (side: "left" | "right", id: string) => navigate({
    name: "sequence-compare",
    projectId,
    leftSequenceId: (side === "left" ? id : left.id) as SequenceId,
    rightSequenceId: (side === "right" ? id : right.id) as SequenceId,
  });

  return <main className="sequence-compare-page page">
    <header>
      <button onClick={() => navigate({ name: "table", projectId })}>← Table</button>
      <strong>SEQUENCE COMPARE</strong>
      <div className="version-compare-pickers">
        <label>A <select value={left.id} onChange={(event) => choose("left", event.target.value)}>{availableSequences.map((sequence) => <option key={sequence.id} value={sequence.id}>{sequence.name}</option>)}</select></label>
        <label>B <select value={right.id} onChange={(event) => choose("right", event.target.value)}>{availableSequences.map((sequence) => <option key={sequence.id} value={sequence.id}>{sequence.name}</option>)}</select></label>
      </div>
      <div className="version-compare-actions">
        <CompareToolButton icon={swapIcon} label="Swap Sides" onClick={() => navigate({ name: "sequence-compare", projectId, leftSequenceId: right.id, rightSequenceId: left.id })} />
        <CompareToolButton icon={previewIcon} label="Read A" onClick={() => navigate({ name: "sequence", projectId, sequenceId: left.id })} />
        <CompareToolButton icon={previewIcon} label="Read B" onClick={() => navigate({ name: "sequence", projectId, sequenceId: right.id })} />
      </div>
      <span>Read-only · {diff.leftOnly.length} only A · {diff.rightOnly.length} only B · {moved.size} moved</span>
    </header>
    <div className="sequence-compare-lanes">
      <SequenceLane label="A" sequence={left} only={leftOnly} moved={moved} dependencies={dependencies} />
      <SequenceLane label="B" sequence={right} only={rightOnly} moved={moved} dependencies={dependencies} />
    </div>
  </main>;
}

export function VersionComparePage({
  dependencies,
  projectId,
  leftVersionId,
  rightVersionId,
  navigate,
}: {
  readonly dependencies: AppDependencies;
  readonly projectId: ProjectId;
  readonly leftVersionId: VersionId;
  readonly rightVersionId: VersionId;
  readonly navigate: (route: AppRoute) => void;
}) {
  const [left, setLeft] = useState<SequenceVersion>();
  const [right, setRight] = useState<SequenceVersion>();
  const [availableVersions, setAvailableVersions] = useState<readonly VersionSummary[]>([]);
  const [error, setError] = useState<string>();
  const { loadVersion, listVersions } = useProjectWorkspaceSession(dependencies, projectId);

  useEffect(() => {
    let live = true;
    void Promise.all([loadVersion(leftVersionId), loadVersion(rightVersionId), listVersions()]).then(([a, b, all]) => {
      if (!live) return;
      if (!a.ok || !b.ok) {
        setError("Versions could not be compared.");
        return;
      }
      setLeft(a.value);
      setRight(b.value);
      if (all.ok) setAvailableVersions(all.value);
    });
    return () => { live = false; };
  }, [leftVersionId, listVersions, loadVersion, projectId, rightVersionId]);

  const diff = useMemo(() => left && right ? compareVersions(left, right) : undefined, [left, right]);
  if (!left || !right || !diff?.ok) {
    return <main className="page centered-state">{error ? <h1>{error}</h1> : <><div className="loading-mark" /><p>Comparing versions…</p></>}</main>;
  }
  const moved = new Set(diff.value.moved.map((item) => item.itemId));
  const added = new Set(diff.value.added);
  const removed = new Set(diff.value.removed);
  const choose = (side: "left" | "right", id: string) => navigate({
    name: "version-compare",
    projectId,
    leftVersionId: (side === "left" ? id : left.id) as VersionId,
    rightVersionId: (side === "right" ? id : right.id) as VersionId,
  });

  return <main className="sequence-compare-page page">
    <header>
      <button onClick={() => navigate({ name: "table", projectId })}>← Table</button>
      <strong>VERSION COMPARE</strong>
      <div className="version-compare-pickers">
        <label>A <select value={left.id} onChange={(event) => choose("left", event.target.value)}>{availableVersions.map((version) => <option key={version.id} value={version.id}>{version.name}</option>)}</select></label>
        <label>B <select value={right.id} onChange={(event) => choose("right", event.target.value)}>{availableVersions.map((version) => <option key={version.id} value={version.id}>{version.name}</option>)}</select></label>
      </div>
      <div className="version-compare-actions">
        <CompareToolButton icon={swapIcon} label="Swap Sides" onClick={() => navigate({ name: "version-compare", projectId, leftVersionId: right.id, rightVersionId: left.id })} />
        <CompareToolButton icon={previewIcon} label="Read A" onClick={() => navigate({ name: "sequence", projectId, sequenceId: left.sequenceId, openVersionId: left.id })} />
        <CompareToolButton icon={previewIcon} label="Read B" onClick={() => navigate({ name: "sequence", projectId, sequenceId: right.sequenceId, openVersionId: right.id })} />
      </div>
      <span>{diff.value.added.length} added · {diff.value.removed.length} removed · {diff.value.moved.length} moved · {diff.value.readingUnitChanged.length} unit · {diff.value.segmentChanged.length} segment</span>
    </header>
    <div className="sequence-compare-lanes">
      <VersionLane label="A" version={left} added={new Set()} removed={removed} moved={moved} dependencies={dependencies} />
      <VersionLane label="B" version={right} added={added} removed={new Set()} moved={moved} dependencies={dependencies} />
    </div>
  </main>;
}

function CompareToolButton({ icon, label, className = "", ...props }: { icon: string; label: string } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  return <button className={`compare-tool-button${className ? ` ${className}` : ""}`} {...props}><img src={icon} alt="" /><span>{label}</span></button>;
}

function VersionLane({ label, version, added, removed, moved, dependencies }: { label: string; version: SequenceVersion; added: ReadonlySet<SequenceItemId>; removed: ReadonlySet<SequenceItemId>; moved: ReadonlySet<SequenceItemId>; dependencies: AppDependencies }) {
  return <section className="sequence-compare-lane"><header><b>{label}</b><strong>{version.name}</strong><span>{version.items.length} items</span></header><div>{version.items.map((item, index) => <article key={item.id} className={added.has(item.id) ? "is-only" : removed.has(item.id) ? "is-only" : moved.has(item.id) ? "is-moved" : "is-shared"}>{item.kind === "photo" ? <PhotoThumb photoSource={dependencies.photoSource} photoId={item.photoId} alt={`${version.name} ${index + 1}`} /> : <div className="sequence-blank-page">BLANK</div>}<span>{index + 1}</span><small>{added.has(item.id) ? "ADDED" : removed.has(item.id) ? "REMOVED" : moved.has(item.id) ? "MOVED" : "UNCHANGED"}</small></article>)}</div></section>;
}

function SequenceLane({ label, sequence, only, moved, dependencies }: { label: string; sequence: SequenceDocument; only: ReadonlySet<PhotoId>; moved: ReadonlySet<PhotoId>; dependencies: AppDependencies }) {
  return <section className="sequence-compare-lane"><header><b>{label}</b><strong>{sequence.name}</strong><span>{sequence.items.length} items</span></header><div>{sequence.items.map((item, index) => <article key={item.id} className={item.kind === "blank" ? "is-blank" : only.has(item.photoId) ? "is-only" : moved.has(item.photoId) ? "is-moved" : "is-shared"}>{item.kind === "photo" ? <PhotoThumb photoSource={dependencies.photoSource} photoId={item.photoId} alt={`${sequence.name} ${index + 1}`} /> : <div className="sequence-blank-page">BLANK</div>}<span>{index + 1}</span><small>{item.kind === "blank" ? "BLANK" : only.has(item.photoId) ? `ONLY ${label}` : moved.has(item.photoId) ? "MOVED" : "SHARED"}</small></article>)}</div></section>;
}
