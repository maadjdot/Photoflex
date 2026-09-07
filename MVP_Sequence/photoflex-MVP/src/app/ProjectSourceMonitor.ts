import { useEffect, useState } from "react";
import type { SourceId, SourceRecord, SourceRuntimeState } from "../contracts";
import type { AppDependencies } from "./dependencies";
import { initialRuntimeState, stateNeedsScan } from "./AppPrimitives";
type ScanListener = (state: SourceRuntimeState) => void;
interface SourceMonitorChannel { controller?: AbortController; readonly listeners: Set<ScanListener>; }
const sourceChannels = new WeakMap<AppDependencies["photoSource"], Map<SourceId, SourceMonitorChannel>>();
function channelsFor(photoSource: AppDependencies["photoSource"]) { let channels = sourceChannels.get(photoSource); if (!channels) { channels = new Map(); sourceChannels.set(photoSource, channels); } return channels; }
function channelFor(photoSource: AppDependencies["photoSource"], sourceId: SourceId) { const channels = channelsFor(photoSource); let channel = channels.get(sourceId); if (!channel) { channel = { listeners: new Set() }; channels.set(sourceId, channel); } return channel; }
export function startSharedScan(photoSource: AppDependencies["photoSource"], sourceId: SourceId) {
  const channels = channelsFor(photoSource);
  const channel = channelFor(photoSource, sourceId);
  if (channel.controller) return;
  const controller = new AbortController();
  channel.controller = controller;
  void (async () => {
    try {
      for await (const result of photoSource.scan(sourceId, controller.signal)) {
        if (!result.ok) {
          notifyScanFailure(channel, sourceId);
          break;
        }
        channel.listeners.forEach((listener) => listener(result.value.state));
      }
    } catch {
      notifyScanFailure(channel, sourceId);
    } finally {
      if (channel.controller === controller) channel.controller = undefined;
      if (!channel.controller && channel.listeners.size === 0) channels.delete(sourceId);
    }
  })();
}
export function stopSharedScan(photoSource: AppDependencies["photoSource"], sourceId: SourceId) { channelsFor(photoSource).get(sourceId)?.controller?.abort(); }
export function useSourceMonitor(photoSource: AppDependencies["photoSource"], sources: readonly SourceRecord[]) { const [states, setStates] = useState<Record<string, SourceRuntimeState>>({}); const sourceKey = sources.map((source) => source.id).join(","); const startScan = (sourceId: SourceId) => startSharedScan(photoSource, sourceId); useEffect(() => { let active = true; const channels = channelsFor(photoSource); const unsubscribers = sources.map((source) => { const channel = channelFor(photoSource, source.id); const listener: ScanListener = (state) => { if (active) setStates((current) => ({ ...current, [source.id]: state })); }; channel.listeners.add(listener); void photoSource.getSourceState(source.id).then((result) => { if (!active || !result.ok) return; setStates((current) => ({ ...current, [source.id]: result.value })); if (stateNeedsScan(result.value)) startSharedScan(photoSource, source.id); }); return () => { channel.listeners.delete(listener); if (!channel.controller && channel.listeners.size === 0) channels.delete(source.id); }; }); return () => { active = false; unsubscribers.forEach((unsubscribe) => unsubscribe()); }; }, [photoSource, sourceKey]); return { states, startScan }; }

function notifyScanFailure(scan: SourceMonitorChannel, sourceId: SourceId) {
  const failed = { ...initialRuntimeState(sourceId), status: "error" as const, errorMessage: "扫描失败，请重试。" };
  scan.listeners.forEach((listener) => listener(failed));
}
