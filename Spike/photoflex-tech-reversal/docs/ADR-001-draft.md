# ADR-001（草案）：PhotoFlex 桌面技术栈

- 状态：Draft / Awaiting Spike Evidence
- 日期：待正式 benchmark 完成
- 决策人：待填写

## Context

PhotoFlex 需要同时支持 10,000 项素材浏览、500 项线性 Sequence、自由白板、SQLite 崩溃恢复、ExifTool sidecar、后台 PDF、动态 Source 授权和 Windows/macOS 一致预览。候选为 Tauri 2 + React/TypeScript + Rust 与 Electron + React/TypeScript + Node.js。

## Decision Drivers

1. 文件安全和 SQLite 恢复是独立硬门；
2. 60/500 项自由白板是独立硬门；
3. T-01～T-06 中最多允许一项失败；
4. macOS 真机手势和色彩证据不可由 CI 替代；
5. 包体、内存、开发复杂度和自动化成熟度作为通过硬门后的比较项。

## Evidence

正式证据仅引用：

- `results/comparison.json`；
- `results/raw/` 原始 JSON；
- `environment-lock.json` 与 cohort 漂移记录；
- macOS 双人签署表；
- 截图、trace、故障注入日志和 fixture hash。

当前仅完成工程骨架和 smoke，不构成框架选择证据。

## Decision

待 `corepack pnpm benchmark:decision` 在 `readyForDecision=true` 后生成。允许的唯一结论：

- 选择 Tauri；
- 选择 Electron；
- 缩小范围；
- 暂无结论 / No-Go。

## Consequences

待正式结论后填写：选定方案收益、已知限制、缓解任务、放弃方案成本、白板安全规模、发布和跨平台维护责任。

## Guardrail

本 ADR 在正式 suite 完成前不得改为 Accepted，正式 PRD/Backlog 不得引用 smoke test 为已验证能力。
