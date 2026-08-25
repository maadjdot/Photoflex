# PhotoFlex 非 macOS 自动测试报告

本报告是一次独立测试批次的结果，不修改 README、TEST-RUNBOOK、GATES、DECISION-TREE、ADR 或现有 comparison 文档。测试平台为 Windows；macOS 真机手势、色彩和人工验收按要求全部排除。

## 执行批次

- 开始时间：2026-08-24 12:34（Asia/Shanghai）
- 结束时间：2026-08-24 12:54（Asia/Shanghai）
- Environment ID：`7648de8c1236581b`
- Git commit：`5a0f487cf42be8e81630cc60c2f209a1403cb782`
- 环境快照：[automated-test-run-2026-08-24-environment.json](./automated-test-run-2026-08-24-environment.json)
- 原始结果目录：[`results/raw/`](./raw/)

本批次使用 Rust 安装完成后的新 cohort，没有混用安装前结果。原有 `environment-lock.json` 未被本次测试覆盖。

## 总结

| 类别 | 结果 | 说明 |
|---|---|---|
| 共享 TypeScript 测试 | PASS | 8 个 suite，25/25 |
| TypeScript 类型检查 | PASS | `tsc --noEmit` |
| 浏览器纯引擎基线 | PASS | T-02/WB-01 reducer 基线，不是 renderer Gate |
| 白板纯状态功能 | PASS | 60 项确定性 20/20 |
| 白板纯状态压力 | PASS | 500/1000/1500/2000/3000 各 5 次一致 |
| 混合纯状态循环 | PASS | Sequence + Whiteboard 5/5 一致 |
| Tauri Rust | PASS | fmt、check、cargo test |
| Tauri Windows bundle | PASS | release exe、MSI、NSIS |
| Tauri Windows smoke | PASS | release exe 运行 5 秒未退出 |
| Electron package | PASS | Electron 43.4.1 unpacked package |
| Electron Windows smoke | PASS | packaged exe 运行 5 秒未退出 |
| macOS T-06/WB-01 | EXCLUDED | 本次按要求不执行 |

## 已执行的自动测试

### 1. 共享逻辑与浏览器纯引擎

执行命令：

```powershell
corepack pnpm test
corepack pnpm typecheck
$env:PHOTOFLEX_ENVIRONMENT_FILE = 'results/automated-test-run-2026-08-24-environment.json'
corepack pnpm benchmark:browser
```

结果：

- `25/25` 测试通过；
- `T-02-pure-engine`：5 个 run、500 个样本，median-of-p50 `0.0353 ms`，median-of-p95 `0.0722 ms`，unstable=false；
- `WB-01-pure-engine`：5 个 run、500 个样本，median-of-p50 `2.6706 ms`，median-of-p95 `3.0908 ms`，unstable=false；
- 原始结果：[browser-engine-1787547230630.json](./raw/browser-engine-1787547230630.json)。

这些数据只代表 Node/纯状态引擎，不代表 DOM、WebView2、Electron Chromium 或 Tauri renderer 的帧率和输入延迟。

### 2. 白板规模、混合和探索协议级测试

执行脚本：[run-automated-nonmac.ts](../benchmarks/run-automated-nonmac.ts)

结果：

- 60 项功能确定性：20/20；
- 保存/放弃状态一致：20/20；
- 500、1000、1500、2000、3000 项：每档 5 次，item 数量、顺序回写和 state hash 全部一致；
- 纯状态 MIX-01：5/5 一致；
- 探索协议状态层：500～3000 全部 `stable`；
- 原始结果：[automated-nonmac-1787547233237.json](./raw/automated-nonmac-1787547233237.json)。

各档纯状态操作最大耗时：500 项 `16.08 ms`、1000 项 `33.72 ms`、1500 项 `75.93 ms`、2000 项 `94.30 ms`、3000 项 `147.62 ms`。这些不是 WB-01 正式输入延迟，因为没有包含真实 DOM、图片解码、GPU、WebView 或宿主进程内存。

### 3. Tauri Windows

执行并通过：

```powershell
cargo fmt --check
cargo check
cargo test
corepack pnpm --filter @photoflex/tauri-shell build
```

结果：

- Rust 单元测试：1 passed，0 failed；
- release exe 生成成功；
- MSI 生成成功：[PhotoFlex Tech Reversal_0.1.0_x64_en-US.msi](../apps/tauri-shell/src-tauri/target/release/bundle/msi/PhotoFlex%20Tech%20Reversal_0.1.0_x64_en-US.msi)；
- NSIS 生成成功：[PhotoFlex Tech Reversal_0.1.0_x64-setup.exe](../apps/tauri-shell/src-tauri/target/release/bundle/nsis/PhotoFlex%20Tech%20Reversal_0.1.0_x64-setup.exe)；
- release exe 运行 5 秒未退出。

这证明 Windows 构建链和最小壳可用，不代表 T-01～T-06 或 WB-01 已通过。

### 4. Electron Windows

执行并通过：

```powershell
corepack pnpm --filter @photoflex/electron-shell package
```

结果：

- Electron 43.4.1 unpacked package 成功；
- packaged exe 运行 5 秒未退出；
- host contract 测试包含 workspace 原子 autosave、revision conflict 和 Source 路径越界检查，已在共享 25 项测试中通过。

这证明 Electron 壳可打包并启动，不代表 Electron 的正式性能 Gate 已通过。

## 未执行或不能判定为通过的 Gate

| Gate/场景 | 状态 | 原因 |
|---|---|---|
| T-01 正式 renderer | NOT RUN | 当前只有纯状态/构建检查，没有 5×60 秒 FPS/RSS 采集器 |
| T-02 正式 UI 操作 | NOT RUN | 已测纯引擎，未测真实 DOM/WebView 输入延迟 |
| DB-01 | NOT RUN | 当前 adapter contract 不是 SQLite/WAL 故障注入 |
| T-03 | NOT RUN | ExifTool 已安装，但当前 fixture 没有完成 20 个真实 metadata fixture 读取套件 |
| T-04 | NOT RUN | PDF queue 当前是 shell stub，没有 200 页/取消/重试正式套件 |
| T-05 | PARTIAL | 已测路径 predicate/contract，未做 20 次真实授权、重启恢复和 symlink 套件 |
| T-06 | EXCLUDED | macOS 真机按本次请求排除 |
| WB-01 正式性能 | NOT RUN | 已测纯 reducer 和状态正确性，未测真实帧率、输入延迟、DOM 上限和进程 RSS |
| MIX-01 正式 | NOT RUN | 已测纯状态混合循环，未做 5×5 分钟双模块真实挂载 |
| SOAK 正式 | NOT RUN | 未运行 45 分钟真实桌面进程 RSS/heap/GPU soak |
| WB-LIMIT 正式 | NOT RUN | 已做纯状态探索，未做真实 renderer 1000/1500/2000/3000 档 |

因此本报告不是 Tauri/Electron 最终反转结论。它是 Windows 自动化基础、构建能力和共享状态层的第一批证据；下午人工测试应重点补齐上表中的真实 UI/宿主层项目。

## 下午人工对比建议

1. 首先确认设备仍使用同一 `environmentId=7648de8c1236581b`；如果版本或显示配置变化，记录新的 cohort。
2. 在 Tauri 和 Electron 中分别执行真实 WB-01 60/500 项、MIX-01 和 SOAK。
3. 记录完整进程树 RSS、renderer heap、GPU 内存、FPS、输入 p95 和 long task。
4. macOS 真机执行 T-06 和手势验收表。
5. 将人工原始证据放入新的结果目录或另建报告，不覆盖本文件。

本批次没有修改现有文档或最终决策状态。
