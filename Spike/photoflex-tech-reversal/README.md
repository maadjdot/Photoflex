# PhotoFlex 技术反转 Spike

本工作区把技术反转方案落成了可操作的共享 benchmark UI、纯状态引擎、窄桌面能力契约、Electron/Tauri 两套壳、环境 cohort 锁、fixture 生成器和 Gate 判定逻辑。它是一次性证据工程，不是正式产品代码；在正式 benchmark 完成前，不修改 PhotoFlex PRD、Backlog 或 ADR 状态。

## 当前真实状态

| 部分 | 状态 | 已有证据 | 不能据此声称 |
|---|---|---|---|
| 公共功能 | 已实现 | Library、Sequence、Whiteboard、Mixed、PDF 和 Results 均有入口 | UI 性能已通过 |
| 真实照片 | 已接入 | 浏览器目录选择；Electron/Tauri 受控目录授权、恢复和代理缓存 | 全部格式和色彩管理已通过 |
| Electron | 最新功能代码已实现 | SQLite/WAL、目录代理、后台 PDF、ExifTool/文件安全脚本 | 最新改动已重新打包或正式 Gate 已通过 |
| Tauri | 最新功能代码已实现 | SQLite/WAL、目录代理、后台 PDF、动态目录选择 | 最新改动已重新打包或正式 Gate 已通过 |
| macOS | 未执行 | runbook 和签署表已准备 | 跨平台结论可得 |
| 最终决策 | 暂无结论 | `results/comparison.json` 阻止提前裁决 | Tauri 或 Electron 已胜出 |

2026-08-24 的功能完善阶段按要求停止继续测试。此前已有的历史证据仍保留，但最新的缩略图代理、Tauri SourceLibrary 和交互改动没有重新执行测试或打包，不能把“功能已写完”解释为 Gate 已通过。

## 只运行功能（推荐先用 Electron）

从本目录运行：

```powershell
corepack pnpm install
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$env:PHOTOFLEX_TEST_SOURCE='D:\project\Photoflex\Spike\test'
corepack pnpm dev:electron
```

设置 `PHOTOFLEX_TEST_SOURCE` 后会自动加载该目录；也可以不设置，在窗口右上角点击“选择照片目录”。Electron/Tauri 只把低分辨率代理写入各自的应用缓存，不修改 Source 原片。双击任意缩略图会打开原图预览。

SourceLibrary 会递归读取 `D:\project\Photoflex\Spike\test` 的受支持照片；如果只想使用其中一个子目录，把上面的路径改成对应子目录即可。

Tauri 功能入口：

```powershell
corepack pnpm dev:tauri
```

Tauri 启动后点击“选择照片目录”。目录授权会保存，下一次可点击“恢复上次目录”。

只看共享网页也可以运行：

```powershell
corepack pnpm dev
```

浏览器 UI 默认位于 `http://127.0.0.1:5173`，点击“选择照片目录”后由浏览器直接读取所选照片；浏览器模式不能验证桌面目录授权、SQLite、sidecar 或后台 job。

## 页面如何操作

- `Library T-01`：显示 10,000 项虚拟网格；单击选择，Ctrl/Cmd+单击增减选择，双击预览真实照片。
- `Sequence T-02`：固定生成 500 项；拖到另一张照片前排序；Ctrl/Cmd 多选后可整体拖动或移到末尾；方向键移动当前选中项；`Undo` 撤销上一次事务。
- `Whiteboard WB-01`：可切换 60/500/1000/1500/2000/3000；空白处拖动框选，Shift/Ctrl/Cmd 追加选择，拖动任一选中照片进行组移动；选中照片后拖四角圆点缩放；右键拖动画布，滚动条/触控板平移，Ctrl+滚轮或滑杆缩放；支持删除、保存、放弃和重开布局。
- `Mixed MIX-01`：同时挂载网格、Sequence 和 500 项白板，用于组合场景操作。
- `PDF T-04`：桌面壳可运行“宿主后台生成 200 页”，也可运行 Renderer 对照；支持取消、重试以及打开/保存生成的 PDF。
- `Results`：集中显示本次会话记录并导出 JSON。

## 正式测试（本次未继续执行）

需要恢复正式 Spike 时，再依次运行：

```powershell
corepack pnpm fixture:generate
corepack pnpm env:capture
corepack pnpm env:verify
corepack pnpm check
corepack pnpm benchmark:host
```

退出码 `2` 表示 cohort 漂移。此时保留旧结果，按输出的 `requiredReruns` 重跑，禁止混合前后样本。

## 模块边界

```text
apps/benchmark-ui       共享 React renderer 与可视化状态
apps/electron-shell     main/preload 与命名 IPC adapter
apps/tauri-shell        Rust commands 与最小 capability
packages/host-contract  ProjectWorkspace / SourceLibrary / ExportQueue
packages/sequence-engine  排序、undo、snapshot、diff
packages/whiteboard-engine 白板 reducer、commit/discard、顺序回写、裁剪
packages/benchmark-core  统计、Gate 判定、单一决策树
packages/fixture-tools   10,000 项 fixture 与环境锁/漂移
```

renderer 不接收绝对路径，也没有 `read(anyPath)`、`write(anyPath)`、任意 `invoke` 或 shell 字符串入口。Electron 和 Tauri 都通过命名命令访问 Source、SQLite/WAL workspace 和后台 PDF job；Source 始终只读，代理、数据库和临时导出只写应用数据目录。功能已实现不等于 DB-01、文件安全或性能门已通过。

## 正式执行入口

- [阶段与时间盒](docs/TEST-RUNBOOK.md)
- [Gate、手势与统计标准](docs/GATES.md)
- [唯一决策树](docs/DECISION-TREE.md)
- [ADR-001 草案](docs/ADR-001-draft.md)
- [当前证据状态](results/comparison.json)

`corepack pnpm benchmark:browser` 只测纯引擎延迟并保存原始 JSON，不代替浏览器 renderer 的正式帧率测试。UI 中的 60 秒、MIX 和 SOAK 采样按钮只是执行入口，只有按 Gate 口径完成全部 run 后才能形成结论。
