---
tags:
  - PhotoFlex
  - Phase 0
  - Backlog
  - ADR
created: 2026-08-18
updated: 2026-08-18
status: ready_for_validation
version: 0.1
---

# PhotoFlex Phase 0 Backlog 与 ADR 清单

> 产品基线：[[PhotoFlex 产品需求文档 PRD]]  
> 实施节奏：[[PhotoFlex 开发流程与路线图]]  
> 决策记录：[[PhotoFlex 开发日志]]  
> 当前状态：Phase 0 — 用户问题与技术可行性验证；产品代码尚未开始。

---

## 0. 这份文件解决什么问题

本文件把已经确认的产品方向转成 Phase 0 可以执行、可以验收、可以停止的任务。它不是产品功能 backlog，也不是承诺的日历排期。

Phase 0 只回答两件事：

1. 真实摄影师是否真的需要“多序列版本 + A/B 比较 + 修改理由 + 上下文恢复”；
2. Tauri 2 + React/TypeScript 是否能以可接受的性能、安全和跨平台成本支撑这个闭环。

### 0.1 明确不做

- 不创建完整 PhotoFlex 产品代码；
- 不做 Lightroom 插件、Project Map、AI、实时协作、社区和支付；
- 不处理用户私人原片作为测试 fixture；
- 不把用户口头兴趣当作产品验证；
- 不因为某项技术 spike 方便就扩大 MVP 范围。

### 0.2 成功后的唯一结果

Phase 0 结束时必须拥有：

- 用户访谈和真实工作流观察记录；
- 序列/比较可点击原型；
- small / medium / large / edge fixture 及许可说明；
- 六项技术反转 benchmark；
- ADR-001～ADR-008；
- 确认后的 MVP backlog；
- 至少 3 位愿意使用真实项目参与 Alpha 的用户。

---

## 1. 已确认的产品方向

| 主题 | 当前共识 | 仍需验证 |
|---|---|---|
| 用户 | 艺术摄影、纪实摄影和个人长期项目摄影师 | 是否是最强痛点和首个付费角色 |
| 入口 | 文件夹只读引用，后台生成常见格式代理 | 用户是否能接受代理边界和手动选目录 |
| 核心 | 导入/浏览是入口，序列版本、A/B、理由和恢复是价值闭环 | A/B 是否显著优于现有 PPT/文件命名流程 |
| 数据 | 单用户、本地优先、项目包与原片分离 | 备份代理默认值和网络盘需求 |
| 平台 | Windows 优先，早期验证 macOS | Tauri 是否通过六项技术门 |
| 后续 | Lightroom、私密分享、导师反馈优先于 AI/社区 | P1 是否有足够真实需求 |

这些是产品方向选择，不是已经被市场证明的事实。用户研究和 spike 可以推翻它们。

---

## 2. 工作流与角色

### 2.1 角色

| 角色 | 职责 | 不应替代的职责 |
|---|---|---|
| 产品负责人 | 招募用户、主持访谈、做范围决策 | 不用主观偏好代替用户证据 |
| 实现负责人 | 准备 spike、benchmark、fixture 和安全测试 | 不在 spike 期间偷偷开始完整产品 |
| 研究参与者 | 展示真实项目并完成任务 | 不要求他们设计技术方案 |
| 记录人 | 保存原始观察、证据、决策和反例 | 不只记录支持产品的反馈 |

一人开发时可以由同一人承担多个角色，但每个产物仍需分别完成。

### 2.2 估算与节奏

- 建议周期：2–3 周；
- 目标：每周最多 3 个进行中的任务；
- 每周必须产生一个可展示结果；
- 任何任务超过预估两倍仍未有证据，应拆小、降级或停止；
- 本文件不把周数写成交付承诺，实际节奏写入开发日志。

---

## 3. Phase 0 Backlog

状态值：`todo` / `in_progress` / `blocked` / `done` / `discarded`。只有产物和验收证据都存在，才能标记 `done`。

### 3.1 用户研究与产品验证

| ID | 优先级 | 状态 | 任务 | 依赖 | 产物 | 完成标准 |
|---|---|---|---|---|---|---|
| PH0-UX-01 | Must | todo | 招募长期项目摄影师 | 无 | 匿名参与者表 | 8–12 人；记录项目类型、设备、周期和许可 |
| PH0-UX-02 | Must | todo | 观察真实工作流 | UX-01 | 5 份观察记录 | 看到文件夹、Collection、PPT/纸样/聊天如何往返 |
| PH0-UX-03 | Must | todo | 整理序列 A/B/C 和修改理由模式 | UX-02 | 模式总结表 | 每个模式标记 observed/reported/inferred |
| PH0-UX-04 | Must | done | 制作 Contact Sheet → Pool → Sequence → Compare 原型 | 无 | prototypes/photoflex-core-prototype/ | 不写产品代码；已通过自动状态转换测试与三方案渲染检查 |
| PH0-UX-05 | Must | todo | 测试 500 张 → 30 张 Pool | UX-01、UX-04 | 任务记录 | 3 位用户完成；至少 2 位认为 Look Hard 改变了观看 |
| PH0-UX-06 | Must | todo | 测试两套真实序列 A/B | UX-02、UX-04 | 对照记录 | 5 位用户完成；至少 3 位能解释差异和理由 |
| PH0-UX-07 | Must | todo | 测试七天恢复 | UX-04 | 恢复测试记录 | 5 位用户参与；80% 在 60 秒内说出上次变化和下一步 |
| PH0-UX-08 | Must | todo | 验证 JPEG/代理图边界 | UX-01 | 代理接受度记录 | 明确 RAW 用户是否能提供可用代理；不能默认为支持 RAW |
| PH0-UX-09 | Must | todo | 招募 Alpha 候选人 | UX-05～08 | Alpha 候选名单 | 至少 3 位愿意使用真实项目并确认接触方式 |
| PH0-UX-10 | Should | todo | 记录现有流程的时间成本 | UX-02、UX-06 | 基线时间表 | 比较现有方式与原型，不用抽象购买意愿代替 |
| PH0-UX-11 | Should | todo | 验证导师反馈对象定位 | UX-06 | P1 需求记录 | 明确评论版本/照片/跨页的实际痛点 |

### 3.2 原型与交互验证

| ID | 优先级 | 状态 | 任务 | 依赖 | 产物 | 完成标准 |
|---|---|---|---|---|---|---|
| PH0-PROT-01 | Must | todo | 设计首次项目入口 | 无 | 入口原型 | 用户能选择“已有照片”或“核心问题”开始 |
| PH0-PROT-02 | Must | todo | 设计后台索引状态 | PROT-01 | 状态稿 | Loading、Partial、Offline、Permission Lost 均有出口 |
| PH0-PROT-03 | Must | todo | 设计 Look Hard 三种观看模式 | PROT-01 | Viewer 原型 | 单张、双张、Survey/墙面可切换，不显示评分污染 |
| PH0-PROT-04 | Must | todo | 设计 Sequence 三视图 | PROT-03 | Sequence 原型 | 单张流、Spread、墙面共享顺序和 selection |
| PH0-PROT-05 | Must | todo | 设计 Compare 三候选 | PROT-04 | Compare 原型 | 并排、对齐、差异列表都能测试；默认并排 |
| PH0-PROT-06 | Must | todo | 设计 Checkpoint 反思 | PROT-05 | Dialog 原型 | 版本名、目标、最大变化、仍缺什么均可跳过 |
| PH0-PROT-07 | Must | todo | 设计 Overview 恢复首屏 | PROT-06 | Overview 原型 | 能回答上次变化、最近版本、未决问题和下一步 |
| PH0-PROT-08 | Should | todo | 设计键盘路径和焦点 | PROT-03～07 | 快捷键表 | 看图、选择、排序、保存、比较均有键盘等价操作 |

> 2026-08-18（初版）：PH0-UX-04 的一次性核心原型已经覆盖 Contact Sheet → Pool → Sequence → v1/v2 → Compare，足以开始用户访谈。
>
> 2026-08-18（反馈迭代）：方案 B 被选为唯一界面方向；Pool 与 Sequence 合并，加入灰阶 Pool 状态、双向选片、拖曳排序、星标比较基准和双版本 Memo；Resume 从本轮原型移除。PROT-01～08 的完整状态、三视图、Checkpoint 字段、Resume 验证和键盘验收仍未完成，因此不提前标记完成。
>
> 2026-08-18（反馈迭代 2）：界面密度与主标题缩小；Sequence 默认横向单排并加入滚动条、左右箭头和可选网格视角；Pool 右栏缩窄；版本支持命名保存，所有已保存版本以 Compare 标题旁的版本包呈现，点击后切换与星标版本的比较对象。这些仍是待用户测试的设计假设。

> 2026-08-18（反馈迭代 3）：Sequence / Pool 可分别调整 X、Y、宽度和高度，Pool 内容在模块内独立滚动；单张 Sequence 照片尺寸与横向画布高度分离；新增只呈现照片序列的沉浸模式，以及支持界面箭头、键盘左右键和 Esc 的单图预览。这些交互已通过原型自动回归与 1440×1000 视觉检查，但大量真实照片、自由布局心智模型和跨会话保存仍待用户验证。

> 2026-08-19（反馈迭代 4）：删除布局滑杆与照片尺寸加减控件，Sequence / Pool 改为顶部把手移动和四角缩放；Pool 选择后保留滚动位置；照片支持 90° 旋转；沉浸模式升级为自由白板，照片可移动、四角缩放和旋转，退出时按从上到下、同一行从左到右回写 Sequence。直接操作与排序回写已通过自动回归和 1440×1000 视觉检查，画布缩放、多选、吸附、撤销和真实大数据性能仍待验证。

### 3.3 技术反转 Spike

| ID | 优先级 | 状态 | 任务 | 依赖 | 产物 | 完成标准 |
|---|---|---|---|---|---|---|
| PH0-TECH-01 | Must | todo | 建立一次性 Tauri 2 + React 验证仓库 | 无 | 外部 spike repo | 与 Obsidian Vault 分离；可启动并记录版本 |
| PH0-TECH-02 | Must | todo | 10,000 项代理图虚拟网格 | TECH-01 | benchmark + 视频/截图 | 可滚动、筛选、缩放；记录内存和帧率 |
| PH0-TECH-03 | Must | todo | 500 项拖拽与键盘排序 | TECH-01 | benchmark + failure log | 鼠标、键盘和批量移动稳定；单次 drop 一次提交 |
| PH0-TECH-04 | Must | todo | SQLite migration、WAL、snapshot、崩溃重开 | TECH-01 | fixture + 测试报告 | migration 可回滚；snapshot 不可变；强退可恢复 |
| PH0-TECH-05 | Must | todo | ExifTool sidecar 打包和元数据读取 | TECH-01 | Windows package test | 干净环境可运行；失败可报告；不写原片 |
| PH0-TECH-06 | Must | todo | 200 页 PDF 后台生成 | TECH-01 | benchmark + 取消测试 | 有进度、取消、重试和部分错误清单 |
| PH0-TECH-07 | Must | todo | Windows 文件夹动态授权和重启恢复 | TECH-01 | permission test | 授权 root 可恢复；`..`、symlink 和越界被拒绝 |
| PH0-TECH-08 | Must | todo | Windows/macOS 预览一致性 | TECH-01 | 两平台对照 | 核心代理方向和基本色彩差异可接受；否则记录 fallback |
| PH0-TECH-09 | Should | todo | Lightroom JPEG 代理方向/色彩对照 | TECH-05、TECH-08 | 色彩对照表 | 明确代理作为编辑顺序基准的限制 |
| PH0-TECH-10 | Should | todo | 建立可重复 benchmark harness | TECH-02～08 | benchmark script/readme | 相同 fixture 可重复运行并输出版本、硬件、结果 |

### 3.4 安全、数据与恢复验证

| ID | 优先级 | 状态 | 任务 | 依赖 | 产物 | 完成标准 |
|---|---|---|---|---|---|---|
| PH0-SAFE-01 | Must | todo | 准备无私人作品 fixture | 无 | small/medium/large/edge | 图像来源有许可或自行生成；包含中文、emoji、损坏图 |
| PH0-SAFE-02 | Must | todo | 原片 hash 零变化测试 | SAFE-01、TECH-05 | hash report | 扫描、代理、导出前后路径、大小、mtime、hash 一致 |
| PH0-SAFE-03 | Must | todo | 路径越界和 symlink 测试 | TECH-07 | security test | 未授权路径永远不可读写 |
| PH0-SAFE-04 | Must | todo | 项目备份/恢复测试 | TECH-04 | restore report | 新目录恢复后版本、memo、关系和代理一致 |
| PH0-SAFE-05 | Must | todo | telemetry/隐私审查 | 无 | privacy checklist | analytics/AI 默认关闭；bundle 不含路径、memo、token |
| PH0-SAFE-06 | Should | todo | 低磁盘与外接盘断开测试 | SAFE-01、TECH-07 | recovery report | 不损坏 DB；Offline 状态可继续使用缓存 |

### 3.5 决策与文档

| ID | 优先级 | 状态 | 任务 | 依赖 | 产物 | 完成标准 |
|---|---|---|---|---|---|---|
| PH0-DEC-01 | Must | todo | 写 ADR-001：Tauri 或 Electron | TECH-02～08 | `docs/adr/ADR-001-*.md` | 记录六项结果、失败项、取舍和最终框架 |
| PH0-DEC-02 | Must | todo | 写 ADR-002：文件权限与原片安全 | SAFE-02、SAFE-03 | `docs/adr/ADR-002-*.md` | 明确 scope、canonical path、禁止命令和测试证据 |
| PH0-DEC-03 | Must | todo | 写 ADR-003：代理和格式边界 | UX-08、TECH-05、TECH-08 | `docs/adr/ADR-003-*.md` | 明确 JPEG/PNG/WebP/TIFF/RAW 的 P0/P1 行为 |
| PH0-DEC-04 | Must | todo | 写 ADR-004：snapshot、branch 和 diff | UX-06、TECH-04 | `docs/adr/ADR-004-*.md` | 明确 instance matching、LCS、不确定匹配和无 merge |
| PH0-DEC-05 | Must | todo | 写 ADR-005：项目包、代理和备份 | SAFE-04 | `docs/adr/ADR-005-*.md` | 明确目录结构、`.photoflexpkg`、默认内容和恢复策略 |
| PH0-DEC-06 | Should | todo | 写 ADR-006：Compare 交互默认值 | UX-06、PROT-05 | `docs/adr/ADR-006-*.md` | 解释并排/对齐/差异列表取舍和测试结果 |
| PH0-DEC-07 | Should | todo | 写 ADR-007：Overview 与 Session | UX-07、PROT-07 | `docs/adr/ADR-007-*.md` | 明确客观变化、用户摘要、Next Action 和视口恢复 |
| PH0-DEC-08 | Should | todo | 写 ADR-008：analytics 与 AI 隐私边界 | SAFE-05 | `docs/adr/ADR-008-*.md` | 明确 opt-in、可删除记录、代理上传和禁止采集 |
| PH0-DEC-09 | Must | todo | 更新 MVP backlog 和开发日志 | 所有 Must | PRD diff + 日志条目 | 只纳入证据通过的范围；已知限制可追踪 |

---

## 4. 六项技术反转门

任意两项在限定 spike 内无法稳定解决，必须切换 Electron 或缩小产品承诺；不能带着未说明的高风险进入 Phase 1。

| 门 | 验证对象 | 最小测试 | 通过证据 |
|---|---|---|---|
| T-01 | 大型虚拟网格 | 10,000 项、筛选、滚动、缩放 | benchmark、内存、帧率、录屏 |
| T-02 | 序列排序 | 500 项拖拽、键盘、批量移动 | benchmark、失败日志、undo 结果 |
| T-03 | 原生 sidecar | ExifTool 在 Windows 干净环境运行 | 打包安装测试、错误处理、许可记录 |
| T-04 | 后台 PDF | 200 页生成、取消、重试 | job 状态、进度、临时文件清理报告 |
| T-05 | 动态权限 | root scope、重启、symlink/越界 | 安全测试、权限恢复截图 |
| T-06 | 跨平台预览 | Windows/macOS 同 fixture | 方向、代理、基本色彩对照 |

### 4.1 Benchmark 记录模板

```markdown
## Spike ID / 日期

### 环境
- OS / 版本：
- CPU / RAM / GPU：
- 框架 / 依赖版本：
- fixture commit：

### 操作步骤

### 结果
- 首屏时间：
- 交互延迟：
- 内存峰值：
- 错误 / 取消行为：

### 结论
- pass / fail / needs_scope_change：
- 影响的 PRD ID：
- 下一步：
```

---

## 5. 用户访谈与任务脚本

### 5.1 访谈顺序

1. 请展示一个正在进行或最近完成的长期项目；
2. 请展示第二、第三套序列如何保存；
3. 请展示最近一次修改，并说明为什么移动/移除/加入照片；
4. 请展示暂停后重新进入项目时如何找回上下文；
5. 再展示 PhotoFlex 原型，不先解释产品理念；
6. 让用户完成 Pool、A/B、Resume 三个任务；
7. 询问哪些内容愿意交给本地工具、哪些内容不能离开电脑；
8. 记录实际行为和时间，再记录口头评价。

### 5.2 访谈记录字段

| 字段 | 规则 |
|---|---|
| participant_id | 匿名 ID，不记录真实姓名 |
| project_type | 艺术/纪实/个人/其他 |
| current_tools | 真实使用的软件和文件形式 |
| observed_workflow | 观察事实，不能混入解释 |
| reported_pain | 用户原话或准确转述 |
| time_baseline | 当前流程的实际时间区间 |
| prototype_result | 任务完成/失败、停顿和替代路径 |
| evidence_type | observed / reported / inferred |
| affected_prd_ids | 影响的 OBJ、REQ、DEC 或 GATE |
| next_action | 访谈后要验证或修改什么 |

### 5.3 研究停止条件

- 5 位用户无法展示多版本序列痛点；
- 没有 3 位用户愿意使用真实项目；
- A/B 原型无法比现有方式更快解释差异；
- 多数目标用户无法提供可接受的代理图；
- 用户认为产品只是另一个图库，且 Look Hard/Sequence 没有改变判断；
- 研究连续两周没有产生新的可行动证据。

停止不是失败，而是避免继续堆叠功能的决策。

---

## 6. ADR 清单与完成标准

### 6.1 ADR 状态

所有 ADR 在 Phase 0 开始时为 `proposed`；只有证据、决策、替代方案和重看条件齐全才能变为 `accepted`。被推翻的 ADR 不删除，改为 `superseded` 并链接新 ADR。

### 6.2 ADR-001～ADR-008

| ADR | 标题 | 必须回答 | 依赖 | 默认重看条件 |
|---|---|---|---|---|
| ADR-001 | Tauri 2 或 Electron | 六项技术门、学习成本、权限、渲染一致性和 fallback | T-01～T-06 | 任两项技术门失败 |
| ADR-002 | 文件权限与原片安全 | read scope、canonical path、symlink、禁止写命令和 hash 证据 | SAFE-02/03、T-05 | 任何越界或原片变化 |
| ADR-003 | 代理与格式边界 | P0 格式、RAW 行为、TIFF 失败、色彩和方向限制 | UX-08、T-03/T-06 | 用户无法提供可用代理 |
| ADR-004 | Snapshot、Branch 与 Diff | instance ID、LCS、重复项、不确定匹配和不做 merge | UX-06、T-02/T-04 | 版本量导致空间/性能不可接受 |
| ADR-005 | 项目包、备份与代理 | 目录结构、`.photoflexpkg`、是否含代理、恢复和冲突 | SAFE-04 | 非开发者无法恢复或包体不可接受 |
| ADR-006 | Compare 默认交互 | 并排、同步滚动、对齐、差异列表和用户任务结果 | UX-06、PROT-05 | 并排无法支持真实长序列 |
| ADR-007 | Overview 与 Session | 客观事件、用户摘要、Next Action、视口和 60 秒恢复 | UX-07、PROT-07 | 用户不能在 60 秒恢复 |
| ADR-008 | Analytics 与 AI 隐私 | opt-in、禁止采集、代理上传、记录删除和离线核心 | SAFE-05 | 隐私评审不通过或用户拒绝 |

### 6.3 ADR 模板

```markdown
# ADR-NNN：标题

状态：proposed / accepted / superseded / rejected  
日期：YYYY-MM-DD  
关联 PRD：

## 背景

## 决策

## 证据

## 备选方案

## 影响与取舍

## 安全 / 数据 / 隐私影响

## 重看条件

## 后续任务
```

---

## 7. Phase 0 退出清单

### Product Gate

- [ ] PH0-UX-01～08 有记录；
- [ ] 至少 5 位用户展示真实多版本序列问题；
- [ ] 至少 3 位用户同意真实项目 Alpha；
- [ ] 原型完成 Pool、A/B、Resume 三项任务；
- [ ] P0 范围没有未说明的高风险阻塞。

### Technical Gate

- [ ] T-01～T-06 有可重复 benchmark；
- [ ] ADR-001 已明确 Tauri/Electron；
- [ ] migration/WAL/snapshot/崩溃恢复通过；
- [ ] 10,000 网格和 500 排序达到目标或明确缩小范围；
- [ ] Windows 权限和 macOS 早期验证有结果；
- [ ] 200 页 PDF 可完成/取消/重试。

### Safety Gate

- [ ] 原片 hash、路径、大小和 mtime 零变化；
- [ ] `..`、symlink、未授权 root 越界被拒绝；
- [ ] 项目备份在新目录由非开发者恢复；
- [ ] support bundle 不含路径、memo、图片、token 或 API key；
- [ ] AI、网络和 analytics 默认关闭。

### Handoff Gate

- [ ] ADR-001～ADR-008 按状态归档；
- [ ] PRD 的 DEC 状态和 backlog 一致；
- [ ] 确认的 MVP backlog 有依赖和验收标准；
- [ ] 未完成项和停止原因写入开发日志；
- [ ] Phase 1 只从已通过的切片开始，不从愿望清单开始。

---

## 8. Phase 1 入口建议

只有 Phase 0 通过后，才开始以下顺序：

1. 工程仓库、锁文件、CI、fixture 许可和 ADR 目录；
2. 项目包、SQLite migration、日志和权限最小边界；
3. 30 张 fixture 的 SLICE-01/02/03；
4. snapshot、Compare 和 Decision 的 SLICE-04；
5. Overview、PDF 和恢复的 SLICE-05；
6. 才把 2,000 / 10,000 张 fixture 纳入持续性能回归。

禁止因为“已经有 backlog”就跳过 Phase 0 的退出门。
