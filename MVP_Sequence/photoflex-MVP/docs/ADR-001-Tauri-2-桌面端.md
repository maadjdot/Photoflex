---
tags:
  - PhotoFlex
  - ADR
  - Tauri
created: 2026-08-26
updated: 2026-08-26
status: accepted
version: 1.0
---

# ADR-001：桌面端选择 Tauri 2

## 状态

Accepted——产品负责人已决定未来桌面端使用 Tauri 2。当前阶段仍只开发网页。

## 背景

PhotoFlex 当前需要尽快验证“序列版本 + A/B Compare”的产品价值，同时希望网页成果能复用于未来桌面端。桌面端需要更稳定的文件夹授权、SQLite/WAL、代理图缓存和原片只读控制。

现有技术反转 Spike 已经实现 React/TypeScript 共享界面、窄宿主接口、Tauri 和 Electron 两套实验壳。Tauri 的 Windows 构建、打包和最小启动曾通过自动检查，但正式 renderer 性能、文件安全、数据库故障恢复和 macOS Gate 尚未全部完成。

## 决策

未来桌面端采用：

- Tauri 2 作为桌面壳；
- React + TypeScript + Vite 继续作为共享界面；
- Rust 只实现受控的本地能力，不承载序列和版本业务规则；
- SQLite/WAL 保存桌面项目数据；
- Tauri command 只暴露命名能力，不暴露任意路径读写、任意 invoke 或 shell 字符串；
- 当前网页阶段继续使用 BrowserPhotoSource 和 IndexedDbProjectStore；
- 网页 Alpha 完成后才建立 TauriPhotoSource 和 TauriSqliteProjectStore。

## 原因

- Tauri 能承载本地文件、SQLite 和代理缓存，同时复用现有 Web 前端；
- 较窄的 Rust 宿主有利于控制原片访问权限；
- 技术 Spike 已证明 Windows 构建链和最小壳可工作；
- 产品负责人接受当前尚未完成全部正式 Gate 的事实，并选择先固定方向、后补验证。

## 影响

### 正面影响

- 网页阶段可以围绕确定的平台接口设计，不再同时维护两套桌面假设；
- React 界面、Sequence、Versioning、Compare 和 Whiteboard Sort 核心逻辑可以直接复用；
- 桌面本地能力集中在少量 Tauri command，安全责任较清楚。

### 成本与风险

- 团队需要维护 Rust、Tauri 配置、签名和跨平台打包知识；
- Windows WebView2 与 macOS WebKit 的渲染、手势和色彩表现可能不同；
- 技术 Spike 的正式性能、安全、数据库恢复和 macOS 证据仍未完成；
- 若把大量业务规则放进 Rust，会造成网页与桌面逻辑分叉。

## 约束

1. 当前 M0–M5 网页阶段不引入 Tauri CLI、Rust crate 或桌面打包；
2. 共享业务模块不得直接调用 Tauri；
3. Tauri command 必须按能力命名，例如 `source_choose_folder`、`workspace_save`，禁止 `read(anyPath)` 和 `executeShell`；
4. 原片目录只读，代理、SQLite 和临时文件只写应用数据目录；
5. 网页和 Tauri 适配器必须通过同一套接口契约测试；
6. 桌面 Alpha 前完成 renderer、文件安全、SQLite 故障恢复、打包和 macOS Gate。

## 复议条件

只有出现以下情况之一才重新评估桌面框架：

- Tauri 在目标硬件上持续无法满足核心 Sequence/Whiteboard 输入延迟；
- WebView2 或 WebKit 导致核心照片显示、触控板操作无法可靠实现；
- SQLite 恢复或文件权限模型无法通过安全硬门；
- macOS 打包、签名或运行限制使目标用户无法使用；
- 所需 Rust 维护成本超过当前团队可承担范围。

出现问题时先缩小白板规模或非核心能力；只有核心序列版本闭环仍无法通过时，才重新比较其他桌面框架。

## 参考

- [开发技术架构方案](./PhotoFlex%20MVP%20开发技术架构方案.md)
- [系统架构方案](./PhotoFlex%20MVP%20系统架构方案.md)
- [技术反转 Spike](../../Spike/photoflex-tech-reversal/README.md)
- [技术反转当前结论](../../Spike/photoflex-tech-reversal/results/verdict.md)

