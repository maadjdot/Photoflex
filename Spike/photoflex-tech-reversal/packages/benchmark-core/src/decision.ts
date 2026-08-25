export type HardGate = "pass" | "fail" | "blocked_timebox" | "needs_scope_change";
export type WhiteboardGate = HardGate | "fail_shared_renderer" | "fail_tauri_specific";
export type MacEvidence = "pass" | "blocked_device";

export interface FrameworkEvidence {
  fileSafety: HardGate;
  database: HardGate;
  whiteboard: WhiteboardGate;
  gateFailures: number;
  macosEvidence: MacEvidence;
  validation?: "complete" | "minimal" | "not_run";
}

export interface DecisionInput {
  versionDrift: "resolved" | "unresolved";
  browserWhiteboard: "pass" | "fail";
  pivotWhiteboard: "pass" | "fail" | "not_run";
  timebox: "within" | "overrun_with_unfinished_mandatory_gate";
  tauri: FrameworkEvidence;
  electron: FrameworkEvidence;
}

export type DecisionCode =
  | "choose_tauri"
  | "choose_tauri_with_limit"
  | "choose_electron"
  | "provisional_electron"
  | "provisional_windows"
  | "inconclusive_version_drift"
  | "inconclusive_timebox"
  | "needs_scope_change"
  | "no_go";

export interface Decision {
  code: DecisionCode;
  label: string;
  reasons: string[];
}

const failed = (gate: HardGate | WhiteboardGate) => gate !== "pass";
const completeElectronPass = (evidence: FrameworkEvidence) => evidence.validation === "complete"
  && !failed(evidence.fileSafety)
  && !failed(evidence.database)
  && evidence.whiteboard === "pass"
  && evidence.gateFailures <= 1
  && evidence.macosEvidence === "pass";

export function decideFramework(input: DecisionInput): Decision {
  if (input.versionDrift === "unresolved") {
    return { code: "inconclusive_version_drift", label: "暂无结论：版本漂移", reasons: ["受影响项目尚未在同一 environment cohort 重跑"] };
  }
  if (input.browserWhiteboard === "fail" && input.pivotWhiteboard !== "pass") {
    return { code: "needs_scope_change", label: "缩小范围：共享白板 renderer 未通过", reasons: ["500 项浏览器基线失败，且两天 pivot 未证明可行"] };
  }
  if (input.tauri.macosEvidence === "blocked_device") {
    return { code: "provisional_windows", label: "Windows 临时结论", reasons: ["缺少 macOS 真机手势和色彩证据"] };
  }

  const tauriHardFailures = [input.tauri.fileSafety, input.tauri.database].filter(failed);
  const tauriWhiteboardFailed = input.tauri.whiteboard !== "pass";
  if (tauriHardFailures.length > 0 || tauriWhiteboardFailed) {
    if (completeElectronPass(input.electron)) {
      return { code: "choose_electron", label: "选择 Electron", reasons: [
        tauriHardFailures.length ? "Tauri 独立硬门失败" : "WB-01 仅在 Tauri 失败",
        "Electron 已完成全部验证并通过硬门"
      ] };
    }
    if (input.electron.validation !== "complete") {
      return { code: "provisional_electron", label: "Electron 临时候选", reasons: ["Tauri 硬门失败", "Electron 完整 fallback 尚未结束"] };
    }
    if (tauriWhiteboardFailed && input.electron.whiteboard === "fail_shared_renderer") {
      return { code: "needs_scope_change", label: "缩小范围：两套壳均未支持当前白板承诺", reasons: ["共享 renderer 需要独立研究"] };
    }
    return { code: "no_go", label: "No-Go", reasons: ["没有框架通过全部独立硬门"] };
  }

  if (input.tauri.gateFailures >= 2) {
    if (input.electron.validation !== "complete") {
      return { code: "provisional_electron", label: "Electron 临时候选", reasons: ["Tauri 六项反转门失败至少两项", "Electron 完整验证未结束"] };
    }
    if (input.electron.macosEvidence === "blocked_device") {
      return { code: "provisional_electron", label: "Electron 临时候选", reasons: ["等待 Electron macOS 真机证据"] };
    }
    if (failed(input.electron.fileSafety) || failed(input.electron.database) || input.electron.whiteboard !== "pass") {
      return { code: "no_go", label: "No-Go 或缩小范围", reasons: ["Electron 未通过独立硬门"] };
    }
    if (input.electron.gateFailures >= 2) {
      return { code: "needs_scope_change", label: "缩小产品承诺", reasons: ["Tauri 与 Electron 均未通过框架计数门"] };
    }
    return { code: "choose_electron", label: "选择 Electron", reasons: ["Tauri 六项门失败至少两项", "Electron 完整验证通过"] };
  }

  if (input.timebox === "overrun_with_unfinished_mandatory_gate") {
    return { code: "inconclusive_timebox", label: "暂无结论：必要 Gate 超时", reasons: ["不能把未完成验证当作通过"] };
  }
  if (input.tauri.gateFailures === 1) {
    return { code: "choose_tauri_with_limit", label: "选择 Tauri（附带限制）", reasons: ["硬门全部通过", "六项门仅一项失败，需建立缓解任务"] };
  }
  return { code: "choose_tauri", label: "选择 Tauri", reasons: ["独立硬门全部通过", "六项反转门全部通过"] };
}
