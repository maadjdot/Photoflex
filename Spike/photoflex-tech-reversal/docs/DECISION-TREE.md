# 单一最终决策树

正式裁决只读取同一 environment cohort 的 `results/comparison.json`。六项计数门仅为 T-01～T-06：失败 0～1 通过，≥2 失败。DB-01、文件安全、WB-01、必需平台 T-06 真机证据均为独立硬门。`blocked_timebox` 和 `needs_scope_change` 按失败；`blocked_device` 只能给临时结论；未解决版本漂移直接暂无结论。

```text
if 版本漂移未解决:
  暂无结论：重跑受影响项
else if 浏览器 WB-01 500 项失败:
  最多两天 renderer pivot
  if pivot 仍失败: 缩小白板承诺
else if Tauri macOS 证据缺失:
  仅输出 Windows 临时结论
else if Tauri 文件安全或 DB-01 失败:
  完整验证 Electron
  if Electron 全部硬门 + macOS + 计数门通过: 选择 Electron
  else: No-Go
else if Tauri WB-01 是共享 renderer 失败:
  renderer pivot；失败则缩小范围，通过则重跑 Tauri WB-01
else if Tauri WB-01 是壳特定失败:
  完整验证 Electron
  if Electron 全部通过: 选择 Electron
  else if Electron 也是共享失败: 缩小范围
  else: No-Go
else if Tauri 的 T-01～T-06 失败数 >= 2:
  完整验证 Electron
  if Electron macOS 缺失: Electron 临时候选
  else if Electron 任一硬门失败: No-Go 或缩小范围
  else if Electron 计数门也失败: 缩小产品承诺
  else: 选择 Electron
else if 必要 Gate 因整体时间盒未完成:
  暂无结论
else if Tauri 计数门失败数 == 1:
  选择 Tauri，并建立限制缓解任务
else:
  选择 Tauri
```

边界规则：WB-01 失败即使六项失败数为 0 也不能豁免；DB 或文件安全失败即使 T-01～T-06 全过也否决；探索档在 2000 项失败不影响 500 项 WB-01；MIX-01 只有崩溃、数据损坏或不可恢复时升级硬失败；两壳计数门均失败时不强行选框架。

代码中的唯一实现是 `packages/benchmark-core/src/decision.ts`，其组合边界由 `decision.test.ts` 固定。
