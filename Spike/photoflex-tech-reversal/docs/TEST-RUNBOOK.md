# PhotoFlex 技术反转执行手册

## 1. 不可跳过的测试前检查

测试负责人记录姓名、Git commit、供电模式、后台应用、显示器、分辨率、缩放和刷新率。随后依次运行：

```powershell
corepack pnpm fixture:generate
corepack pnpm env:capture
corepack pnpm check
```

正式采样使用 release build，关闭开发者工具、同步盘和非必要后台应用。每组前重启应用；每组先预热一次，预热不入样本。测试期间不安装依赖、不更新 lockfile、不切 commit。

`environment-lock.json` 记录 OS/build、CPU/RAM/GPU、显示配置、Edge/WebView2、Electron/Chromium、Node/pnpm、Rust/Cargo、Tauri、ExifTool、lockfile/fixture/source hash、Git commit、时间和时区。`sourceHash` 排除 node_modules、build、raw result 和截图，可在 Spike 尚未提交时检测实现漂移。采集器从 Electron 二进制自动读取 Chromium；显示配置必须通过 `PHOTOFLEX_DISPLAY_PROFILE` 补齐，无法自动读取的 Chromium 才使用 `PHOTOFLEX_ELECTRON_CHROMIUM` 覆盖。

以下时机运行 `corepack pnpm env:verify`：

- 每个阶段开始前；
- 每个正式 suite 开始前；
- macOS 结果导回 Windows 后；
- 系统更新、依赖安装或更新型重启后。

漂移时生成新 `environmentId`。WebView2/Edge 重跑 T-01、T-02、T-06、WB-01、MIX-01、SOAK；Electron/Chromium 重跑 Electron 对应项；GPU/显示重跑全部视觉项；Tauri core/plugin 重跑 contract、T-03、T-05、打包和受影响性能；Node/pnpm/lockfile 重跑前端与 Electron；Rust/Cargo 重跑 Rust、Tauri build、DB、PDF、sidecar；ExifTool 重跑 T-03/文件安全；OS build 重跑当前平台全部；fixture 只重跑使用它的场景。时间不足则结论为 `inconclusive_version_drift`。

## 2. 阶段 0：环境与 fixture（上限 1.5 天）

执行人：实现负责人。目标是生成可重复 fixture、环境锁和 Windows release build。

完成条件：

- `corepack pnpm fixture:generate` 的 hash 可重复；
- `corepack pnpm env:verify` 无漂移；
- 浏览器 build 可启动；
- Tauri/Electron 的缺失依赖均有原始日志。

超时即停止环境美化。Tauri 仍不能最小 release build 时记环境门失败并进入 Electron baseline，不把时间继续投入安装体验。

## 3. 阶段 1：共享逻辑与浏览器基线（上限 2 天）

执行人：实现负责人。先运行测试，再打开共享 UI：

```powershell
corepack pnpm test
corepack pnpm benchmark:browser
corepack pnpm dev
```

完成 T-01、T-02、WB-01 的浏览器正式采样。保留状态/排序/保存/放弃和 500 项压力；视觉 polish 可砍。DOM 白板 500 项失败且排除脚本、fixture 和明显单点 bug 后，进入额外最多 2 天 Canvas/WebGL pivot，只替换 renderer adapter，不改变 `WhiteboardEngine`。

## 4. 阶段 2：Tauri 完整验证（上限 5 天）

执行人：实现负责人；阶段末由 Mac 设备持有人协助。执行 T-01～T-06、DB-01、WB-01、PKG-01、Windows SOAK 和 MIX-01。

到 80% 时间时冻结新增功能，只修复阻止测量的问题。到上限仍未完成的 Gate 写为 `blocked_timebox` 并按失败处理，立即进入 Electron fallback。

## 5. 阶段 3：Electron fallback 与结论（上限 2.5 天）

先验证安全配置、adapter contract、打包/启动/内存、Source、sidecar、DB、PDF 和 WB-01 控制项。Tauri 触发反转后，Electron 扩为全部六项门和硬门；时间不足只能写 `provisional_electron`。

## 6. macOS 真机资源

- 实现负责人：准备 release build、fixture、自动脚本和本手册；
- Mac 设备持有人：使用物理触控板执行手势与人工色彩补充检查；
- 两人：共同签署 `MACOS-MANUAL-SIGNOFF.md`；
- 设备：用户提供的 macOS 真机；
- Tauri 窗口：阶段 2 最后两天连续 4 小时；
- Electron fallback：阶段 3 最后一天 2 小时；
- build 与 fixture：测试前一天完成传递。

设备缺席时 T-06/macOS WB-01 为 `blocked_device`，只能输出 Windows 临时结论。CI build 不能替代真机手势或色彩。

## 7. 采样步骤

延迟场景 5 个独立 run；每 run 至少 50 次，排序和白板移动 100 次。每 run 保存 p50/p95/max；最终取五个 run 的 p50 中位数和 p95 中位数，同时保存总体标准差、min/max、变异系数。离群值不删除。任一 run p95 超门标 `unstable` 并再跑一次确认。

启动/扫描/PDF 至少 7 次，保存中位数、nearest-rank p95、min/max、标准差；首次与后续启动分开。失败/取消/超时也计样本；一次非预期失败为 unstable，两次为 fail。

视觉场景预热一次后正式 5 × 60 秒。每帧间隔、long task、输入延迟和掉帧写入 raw JSON。正式通过要求 4/5 run 同时满足 median FPS ≥55、1% low ≥40、p95 frame time ≤25 ms、>50 ms 帧 <1%、最长停顿 ≤250 ms；剩余 run median 不低于 50 FPS。

内存每秒记录完整进程树 RSS、renderer heap、GPU process。启动空闲 2 分钟中位数为 baseline；保存峰值、结束值和空闲 5 分钟回落值。`<500 MB` 一律指完整进程树。

## 8. SOAK、MIX 与上限测试

SOAK 严格执行网格 10 分钟、Sequence 10 分钟、白板 20 分钟、Compare 往返 5 分钟，再空闲 5 分钟。每秒同时记录 RSS、heap、GPU、图片节点/缓存、listener、frame/long task、job/IPC 队列。排除前 5 分钟后做 RSS 线性回归：≤1 MB/min pass，1～3 warning 并重跑，>3 fail；最后稳定窗不得比首个稳定窗高 20%，空闲后不得高于 baseline +20%。崩溃、OOM、白屏、持续 1 秒无响应或结果丢失直接 fail。

MIX-01 在 benchmark split view 同时挂载 10,000 网格、500 Sequence、500 白板，5 次 × 5 分钟。每次交替网格滚动、白板平移、100 项组移动和 Sequence drop。性能不达标只记风险；崩溃、数据损坏或不可恢复才升级对应硬门。

探索上限按 500→1000→1500→2000→3000。每档加载、平移 60 秒、缩放 30 秒、框选/移动 100 项、保存重开。应用崩溃/白屏、单次无响应 >5 秒、RSS ≥1.5 GB、系统可用内存 <2 GB、保存重开失败时停止。结果只写 `highest_stable_count`、`first_degraded_count`、`failure_count`，不参与 WB-01。

## 9. 超时裁剪

11 个工作日 + 最多 2 天 renderer pivot 后必须输出临时结论。优先保留文件安全、DB-01、WB-01 60/500、T-01～T-06、macOS 真机、最终报告。依次可砍 UI polish、3000/2000 探索档、非失败项额外 Electron 对照、额外截图/trace。不可砍环境版本、原始结果和失败日志。
