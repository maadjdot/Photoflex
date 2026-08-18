---
tags:
  - PhotoFlex
  - 开发流程
  - 路线图
  - 项目管理
created: 2026-08-18
status: active
version: 0.1
---

# PhotoFlex 开发流程与路线图

> 产品与技术依据：[[Photoflex/PhotoFlex 详细项目企划与技术方案]]  
> 每次实际进度记录：[[Photoflex/PhotoFlex 开发日志]]  
> 当前阶段：**Phase 0 — 用户验证与技术可行性验证，尚未开始产品代码**

## 1. 开发原则

### 1.1 先证明核心闭环，再增加功能

每个阶段都要产生一个可操作的 vertical slice（垂直切片）：从界面、业务逻辑、数据库到错误处理都能走通，而不是先把所有页面画出来，再补后端。

PhotoFlex 的第一个完整切片是：

```text
创建项目
→ 引用 30 张测试照片
→ 建立序列
→ 保存两个版本
→ 显示差异
→ 重新打开仍可恢复
```

### 1.2 用退出条件控制阶段

“代码写完”不是阶段完成。只有用户流程、测试、错误处理、文档和性能门槛同时通过，才能进入下一阶段。

### 1.3 保持原片零写入

任何涉及照片文件的代码评审都要回答：

- 打开的文件模式是否只读？
- 路径是否位于用户授权 root 内？
- 是否可能执行 rename、remove、truncate 或覆盖？
- 测试是否比较了操作前后 hash？

### 1.4 不在 Obsidian Vault 中建立代码仓库

本 Vault 是项目知识与决策空间。代码仓库另建在外部开发目录，并在本日志中记录它的位置；不要在 Vault 内执行 `git init`。

### 1.5 AI 编码助手不能替代验证

AI 可以生成实现草案、测试和解释，但每次修改必须：

1. 先读相关文件；
2. 明确本次 issue 边界；
3. 查看 diff；
4. 运行对应测试；
5. 手动走一次用户流程；
6. 把结果写进开发日志。

## 2. 总体路线

### 时间估算前提

- 估算以 1 位开发者全职、会使用 AI 辅助、但仍在学习 Rust/Tauri 为基准。
- **可测试 Alpha：约 20–27 周。**
- **较稳定 MVP Beta：约 26–36 周。**
- 如果只能业余开发，按每周可投入工时换算，不要直接沿用日历周。
- 这是范围估算，不是交付承诺；技术反转、色彩、跨平台和真实用户反馈都可能改变计划。

| 阶段 | 估算 | 主要目标 | 依赖 |
|---|---:|---|---|
| Phase 0 | 2–3 周 | 用户问题与 Tauri 技术反转门 | 无 |
| Phase 1 | 2–3 周 | 工程骨架、项目包、DB、日志与安全边界 | Phase 0 |
| Phase 2 | 3–4 周 | 照片引用、索引、代理缓存、离线与重连 | Phase 1 |
| Phase 3 | 2–3 周 | Photo Pool、Contact Sheet、Look Hard | Phase 2 |
| Phase 4 | 4–5 周 | 序列编辑器与三种视图 | Phase 2–3 |
| Phase 5 | 3–4 周 | 版本、分支、A/B diff、memo | Phase 4 |
| Phase 6 | 2–3 周 | Overview、会话恢复、PDF 与备份 | Phase 5 |
| Phase 7 | 3–4 周 | Alpha 用户测试、性能、安全和恢复 | Phase 6 |
| Phase 8 | 3–5 周 | Beta 修正、安装签名、发布准备 | Phase 7 |
| P1 Track | MVP 后 | Lightroom、Map、AI、反馈 | 核心指标成立 |

## 3. Phase 0 — 用户验证与技术反转门

### 目标

在正式架构固定前，验证两件事：用户是否真的需要序列版本比较；Tauri 是否能支撑核心性能与本地能力。

### 产品验证任务

- [ ] 招募 8–12 位长期摄影项目用户；
- [ ] 至少观察 5 个真实项目的现有文件/软件流程；
- [ ] 记录他们如何保存序列 A/B/C 与修改理由；
- [ ] 用可点击原型测试 Contact Sheet → Sequence → Compare；
- [ ] 测试“并排比较 / 对齐比较 / 差异列表”三种方式；
- [ ] 询问已有工作流，而不是询问抽象购买意愿；
- [ ] 找出 3 位愿意带真实项目参与 Alpha 的用户。

### 技术 spike

- [ ] 建立一次性 Tauri + React 验证仓库；
- [ ] 虚拟化显示 10,000 个本地代理图项；
- [ ] 拖动和键盘排序 500 个 sequence item；
- [ ] SQLite migration、WAL、snapshot 和崩溃重开；
- [ ] 打包 ExifTool sidecar 并读取 5 种相机文件元数据；
- [ ] 生成 200 页测试 PDF，并支持进度/取消；
- [ ] Windows 文件夹动态授权与重启恢复；
- [ ] 在 macOS 真机跑同一前端和至少一个打包 build；
- [ ] 对 Lightroom JPEG 代理做基本色彩/方向对照。

### 技术反转规则

以下六项中任意两项不能在限定 spike 内稳定解决，改用 Electron：

1. 10,000 项虚拟网格；
2. 500 项排序；
3. sidecar 打包；
4. 后台 PDF；
5. 动态文件权限；
6. Windows/macOS 预览一致性。

改变框架不是失败；在产品代码开始前暴露不适配，正是 spike 的目的。

### 交付物

- 用户访谈记录与模式总结；
- 可点击交互原型；
- 技术 benchmark 表；
- ADR-001：Tauri 或 Electron 最终选择；
- 确认后的 P0 backlog；
- 3 位 Alpha 合作用户名单。

### 退出条件

- 至少 5 位用户能展示真实的多版本序列痛点；
- 至少 3 位愿意用真实项目试 Alpha；
- 框架选择通过书面 ADR；
- P0 功能没有未说明的高风险技术阻塞。

## 4. Phase 1 — 工程基础与项目生命周期

### 目标

建立以后不会轻易推翻的安全和数据地基。

### 功能任务

- [ ] Home / Recent Projects 空壳；
- [ ] 新建、打开、关闭 `.photoflex/` 项目目录；
- [ ] `manifest.json` 与 `project.db`；
- [ ] 初始 schema 与 migration runner；
- [ ] Rust command/repository/service 分层；
- [ ] 前端统一 error boundary 与保存状态；
- [ ] app/project 日志与隐私清理；
- [ ] 自动保存、强制退出和重开验证；
- [ ] 手动项目备份与恢复最小版本；
- [ ] Windows 开发 build 与未签名 installer 测试。

### 工程任务

- [ ] external Git repo、README、LICENSE 决策；
- [ ] pnpm lockfile、Rust toolchain pin；
- [ ] formatter、linter、typecheck、unit test；
- [ ] CI：Windows build + 前后端测试；
- [ ] fixture 目录与测试照片许可说明；
- [ ] ADR 模板、issue 与 PR 模板；
- [ ] dependency update 策略。

### 退出条件

- 创建项目 → 写一条测试记录 → 强制退出 → 重开数据仍在；
- migration 失败时数据库回滚，旧备份可恢复；
- CI 在干净环境通过；
- renderer 无任意路径读写 API；
- 项目包结构与 schema 写入文档。

## 5. Phase 2 — 资产索引与代理图

### 目标

安全、不中断 UI 地引用照片，为所有后续功能提供稳定资产 ID。

### 任务

- [ ] 用户选择一个或多个 Source；
- [ ] 动态只读权限与 canonical path 验证；
- [ ] 后台扫描 job、进度、取消和重试；
- [ ] ExifTool 批量元数据读取；
- [ ] JPEG/PNG/WebP/基础 TIFF 代理图；
- [ ] 256/1024/2048 分级缓存；
- [ ] 快速指纹、重复检测与稳定 `photo_id`；
- [ ] 文件损坏占位；
- [ ] Source offline 状态；
- [ ] Root relink 与误匹配确认；
- [ ] 缓存失效和重建；
- [ ] 原片 hash 前后不变测试。

### 退出条件

- 10,000 个 fixture 文件扫描时 UI 不冻结；
- 取消后可继续扫描且不重复；
- 重启后不重新处理未变化文件；
- 移动整个 Source 后可一次根目录重连；
- 原片 hash 零变化。

## 6. Phase 3 — Photo Pool、Contact Sheet 与 Look Hard

### 目标

先让“看自己的照片”比普通文件浏览明显更好。

### 任务

- [ ] 虚拟化照片网格；
- [ ] 缩略图大小、筛选、排序和滚动恢复；
- [ ] Pick / Maybe / Hold / Exclude；
- [ ] 多选、范围选择和批量 Pool 操作；
- [ ] Pool 新建、重命名、归档和删除语义；
- [ ] 全屏单张、双张、Survey、墙面模式；
- [ ] 隐藏评级/元数据；
- [ ] 可复现随机观看；
- [ ] Tray 与观看后 memo；
- [ ] 快捷键帮助层。

### 用户测试

让 3 位 Alpha 用户完成：

1. 从 500 张中建立一个 30 张 Pool；
2. 在隐藏评分模式重新浏览；
3. 说明 PhotoFlex 是否帮助他们发现之前忽略的照片。

### 退出条件

- 大项目滚动达到性能基线；
- 用户可仅用键盘完成主要选择；
- Pool 操作可撤销且不影响 Source；
- 至少 2/3 用户认为 Look Hard 不是普通图库换皮。

## 7. Phase 4 — 序列编辑器

### 目标

完成产品最重要的创作界面。

### 建议拆成三个迭代

#### 4A：线性序列

- [ ] 新建/复制/归档序列；
- [ ] 从 Pool 拖入；
- [ ] 单项和批量移动；
- [ ] Blank / Text / Gap / Divider；
- [ ] autosave 与 command undo/redo；
- [ ] 500 项性能测试。

#### 4B：阅读视图

- [ ] 单张流；
- [ ] 双页 spread 与首页规则；
- [ ] 墙面总览；
- [ ] 三视图 selection/scroll 同步；
- [ ] 预取和代理图切换。

#### 4C：细节与可靠性

- [ ] 键盘排序；
- [ ] 跨 Pool / Sequence copy；
- [ ] 重复照片提示；
- [ ] 拖动中断与失败恢复；
- [ ] 缺失原片的序列占位；
- [ ] sequence item memo 入口。

### 退出条件

- Alpha 用户能不看说明创建、调整并浏览一个 50 张序列；
- 500 项拖拽和键盘操作稳定；
- 关闭/崩溃后 working copy 恢复；
- 三种 item 类型完整进入后续版本模型。

## 8. Phase 5 — 版本、比较、memo 与决定

### 目标

证明 PhotoFlex 相对 Lightroom + PPT/Milanote 的核心差异。

### 任务

- [ ] Checkpoint dialog 与反思提示；
- [ ] 不可变完整 snapshot；
- [ ] parent/branch 数据；
- [ ] 从版本创建分支；
- [ ] A/B 并排与同步滚动；
- [ ] Added/Removed/Moved/Changed diff；
- [ ] LCS 与重复照片不确定匹配；
- [ ] Memo / Question / Decision；
- [ ] 多对象 relation；
- [ ] FTS5 检索；
- [ ] Timeline 基础；
- [ ] 版本归档/删除安全规则。

### 核心用户测试

让用户带两套现有序列，在 PhotoFlex 中：

1. 建立 v1 与 v2；
2. 解释最重要差异；
3. 写一条 Decision；
4. 从 v1 创建第三方向；
5. 与他们原有 PPT/文件命名方式比较时间与理解成本。

### 退出条件

- 已保存 snapshot 的不可变测试通过；
- A/B diff 对 500 项达到性能目标；
- 真实用户能清楚说明哪个版本为何变化；
- 至少 3/5 用户愿意把下一个真实版本继续放在 PhotoFlex。

## 9. Phase 6 — 上下文恢复、Dummy、导出与备份

### 目标

闭合“暂停项目—重新进入—输出讨论”的完整流程。

### 任务

- [ ] Overview 聚合查询；
- [ ] session 起止、客观变化与用户摘要；
- [ ] `Continue Last Session`；
- [ ] Open Questions、Gap 和下一动作；
- [ ] 基础单双页翻页预览；
- [ ] PDF dummy；
- [ ] CSV/JSON manifest；
- [ ] Markdown 项目摘要；
- [ ] backup package、restore 与 integrity check；
- [ ] 大 PDF 进度、取消和部分错误报告。

### 七天恢复测试

- 让 Alpha 用户完成一次序列工作并写检查点；
- 七天不提醒；
- 再打开后仅使用 Overview 回答：上次做了什么、最大改变、未决问题、下一步；
- 记录恢复所需时间和错误理解。

### 退出条件

- 80% 测试者在 60 秒内恢复核心上下文；
- 200 页 PDF 可完成/取消/重试；
- backup 在另一目录恢复后内容一致；
- 原片离线时仍可用代理生成带警告的讨论 PDF。

## 10. Phase 7 — Alpha 稳定化

### 范围

此阶段原则上不加新功能，只处理真实项目暴露的问题。

### 任务

- [ ] 5–10 位 Alpha 用户、至少 4 周真实使用；
- [ ] 每周访谈和屏幕观察；
- [ ] 崩溃、数据丢失、原片风险优先级最高；
- [ ] large/edge fixture 回归；
- [ ] 24 小时 soak test；
- [ ] Windows 长路径、中文、emoji、外接盘；
- [ ] macOS 主流程真机；
- [ ] 数据库 migration 演练；
- [ ] support bundle 与隐私检查；
- [ ] 安装/卸载不影响项目；
- [ ] 缓存空间和低磁盘处理。

### Bug 优先级

| 级别 | 定义 | 处理 |
|---|---|---|
| S0 | 原片或项目数据损坏、安全漏洞 | 停止测试，立即修复 |
| S1 | 核心流程无法继续、频繁崩溃 | 当前迭代处理 |
| S2 | 有替代路径但明显影响工作 | 下个迭代处理 |
| S3 | 视觉、小摩擦、低频问题 | 排入 backlog |

### 退出条件

- 4 周无 S0；
- 连续 2 周无未解决 S1；
- Alpha 用户完成至少 10 个真实 sequence checkpoint；
- 已知限制有文档；
- 数据备份与恢复由非开发者成功演练。

## 11. Phase 8 — MVP Beta 与发布准备

### 任务

- [ ] onboarding 和 demo project；
- [ ] Windows code signing；
- [ ] macOS signing/notarization；
- [ ] 版本升级与 rollback；
- [ ] 隐私政策、EULA 和第三方许可；
- [ ] ExifTool/LibRaw/字体/模型 license 审核；
- [ ] release notes；
- [ ] 30–50 位 Beta 用户支持渠道；
- [ ] 崩溃报告 opt-in；
- [ ] 定价实验，不先实现复杂支付体系；
- [ ] 数据格式与备份说明。

### MVP 出口判断

只有以下数据成立，才开始 P1：

- 活跃项目中 50% 创建第二版本；
- 30% 以上做过 A/B compare；
- 7 天恢复成功率达到 80%；
- 原片误写为 0；
- 至少 5 位用户明确愿意付费继续使用。

## 12. P1 的推荐顺序

不要同时做 Lightroom、AI、Map、排版和社区。根据 MVP 数据按以下顺序判断：

1. **Lightroom 单向桥接**：降低进入成本，最接近现有用户工作流；
2. **结构化私密反馈**：验证导师/编辑是否是付费端；
3. **文本研究与 AI 会话摘要**：不触碰艺术判断；
4. **项目地图**：只有用户确实需要关系视图才做；
5. **自由页面布局**：只有双页预览不足才做；
6. **本地视觉搜索**：图库规模和检索痛点成立后做；
7. **公开社区**：另做商业和冷启动评审。

## 13. Backlog 与 Issue 结构

### 层级

```text
Epic        一个产品能力，如 Sequence Versioning
└── Story   一个可被用户感知的结果
    ├── Task   具体实现
    ├── Test   验收/自动化测试
    └── Doc    文档/日志
```

### 类型

- `feature`：用户功能；
- `bug`：行为不符合预期；
- `spike`：限时调查，输出决定而非生产代码；
- `chore`：工具、依赖、构建；
- `security`：权限、隐私、数据安全；
- `performance`：需有测量前后数据；
- `adr`：影响长期架构的决定。

### Story 模板

```markdown
## 用户结果
作为……我希望……以便……

## 范围
- 包含：
- 不包含：

## 交互 / 数据
- 正常路径：
- 空状态：
- 错误状态：
- 数据写入：

## 验收标准
- [ ] Given / When / Then

## 风险
- 原片：
- migration：
- 性能：
- 隐私：

## 测试
- 单元：
- 集成：
- 手动：
```

## 14. 日常开发流程

### 开始一次开发会话

1. 查看 [[Photoflex/PhotoFlex 开发日志]] 的“下一步”；
2. 选择一个足够小的 issue；
3. 写清成功标准与不做什么；
4. 从最新 `main` 创建分支；
5. 先运行相关测试，确认基线是绿的；
6. 在日志开一条 `in_progress` 会话。

### 分支建议

```text
main
feat/<issue>-short-name
fix/<issue>-short-name
spike/<issue>-short-name
chore/<issue>-short-name
```

不建立长期 `develop` 分支；保持 main 可发布，短分支尽快合并。

### 编码过程

1. 先写/更新失败测试或最小验收脚本；
2. 做最小实现；
3. 不顺手重构无关模块；
4. 检查保存失败、空数据、离线、权限拒绝和取消；
5. 记录新依赖与数据迁移；
6. 反复运行最窄测试，完成后跑完整质量门。

### 预期质量命令

仓库建立后以实际 `package.json`/Cargo 配置为准，目标门槛包括：

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test
pnpm tauri build
```

不是每个小 commit 都需要打 installer，但合并 main 和阶段出口必须在干净环境 build。

### Diff review

逐项检查：

- 是否修改了 issue 之外的文件？
- 是否新增依赖？为什么？
- 是否出现绝对路径、API key 或私人照片？
- 是否存在 `unwrap`/未处理 Promise/静默 catch？
- 是否有数据库写入却没有事务？
- 是否可能修改原片？
- 是否为新错误状态提供了用户说明？
- migration 是否有备份与升级测试？

### 完成后

1. 手动走验收流程；
2. 截图或记录 benchmark；
3. 更新 issue 与文档；
4. 写开发日志：完成内容、测试、决定、已知问题、下一步；
5. 创建 PR；
6. CI 通过并 review diff 后合并；
7. 删除短分支。

## 15. Commit 与 PR 规范

### Commit

采用 Conventional Commits 的简化形式：

```text
feat(sequence): support blank items
fix(indexer): keep offline assets in sequences
test(version): cover duplicate-photo diff
docs(adr): choose Tauri after spike
chore(ci): add Windows Rust cache
```

一个 commit 表达一个原因清楚的变化；不要使用 `update`、`misc changes` 等无法追溯的说明。

### PR 大小

- 推荐 100–400 行实质改动；
- 超过 800 行应说明为何无法拆分；
- 生成文件和 lockfile 单独说明；
- UI PR 提供 before/after；
- 性能 PR 提供相同 fixture 的前后数据；
- migration PR 必须附恢复测试。

### PR 模板

```markdown
## Outcome

## Why this approach

## Not included

## Data / file safety

## Tests run

## Manual verification

## Screenshots / benchmark

## Risks and rollback
```

## 16. Definition of Ready / Done

### Ready

- 用户结果和验收标准清楚；
- 范围与非范围清楚；
- 依赖完成；
- 数据与文件安全已考虑；
- 设计有正常、空、错误和 loading 状态；
- 未解决的产品决定已经提出，而不是藏在实现中。

### Done

- 功能在目标平台可用；
- 验收标准全部通过；
- 单元/集成/手动测试完成；
- 无新增 lint/type/clippy 警告；
- 数据迁移和 rollback 已测试；
- 无原片写入；
- 可访问性有键盘路径；
- 错误有可理解提示；
- 文档、issue 和开发日志更新；
- CI 通过并已合并 main。

“差不多可用”“之后再补测试”不算 Done。

## 17. 调试流程

### 1. 保存证据

- 完整错误信息、时间、job ID；
- 最小复现步骤；
- 项目 schema / app 版本；
- 是否只发生在某种路径、格式或平台；
- 不复制用户私人图片，优先创建脱敏 fixture。

### 2. 缩小范围

- UI 状态、Rust command、DB、文件系统、sidecar、平台打包分别隔离；
- 先复现，再修改；
- 新增一个能失败的测试或脚本。

### 3. 修根因

- 不用吞掉错误或无限重试掩盖；
- 数据问题先备份；
- 原片安全问题按 S0 处理；
- 修复后运行同类边界测试。

### 4. 写预防措施

- 测试；
- 更清楚的错误码/日志；
- 更新开发文档；
- 若是架构原因，写 ADR。

## 18. Vibe coding 安全守则

### 可以让 AI 做

- 根据既有模式生成小组件/测试草案；
- 解释 Rust、SQL、React 代码；
- 提出实现方案和 trade-off；
- 根据明确 schema 写 migration 草案；
- 总结 diff 与生成 release note 草稿。

### 不应直接接受

- 未读现有代码就重写整个模块；
- 一次生成数千行“完整应用”；
- 为修一个 bug 升级全部依赖；
- 直接操作用户真实原片做测试；
- 没有备份就执行 migration；
- 把 API key 写入示例代码；
- 用 `any`、静默 catch、删除测试来“让构建通过”；
- 声称性能或安全已通过但没有运行验证。

### 给 AI 的推荐任务格式

```text
目标：
现有文件：
只允许修改：
不可修改：
验收标准：
要运行的测试：
请先解释方案，再修改；完成后总结 diff、测试和风险。
```

## 19. 每周项目节奏

### 周初

- 选择一个可演示的用户结果；
- 最多 3 个 in-progress issue；
- 明确本周不会做什么；
- 检查上周遗留 S0/S1。

### 周中

- 至少一次真实 build；
- 使用 medium/large fixture；
- 有用户原型测试时优先观察，不急着解释产品。

### 周末评审

- 演示完整流程而非代码文件；
- 更新 benchmark 与 bug 趋势；
- 检查范围是否膨胀；
- 更新 [[Photoflex/PhotoFlex 开发日志]]；
- 确定下一周唯一最重要结果。

## 20. 开发日志条目模板

实际记录统一放在 [[Photoflex/PhotoFlex 开发日志]]，最新条目放最上方。

```markdown
## YYYY-MM-DD · Session XXX · 简短标题

**阶段**：Phase X  
**状态**：in_progress / completed / blocked  
**关联 Issue/PR**：

### 本次目标

### 开始前
- 为什么现在做：
- 成功标准：
- 明确不做：

### 实际过程
- 完成：
- 修改文件：
- 遇到的问题：
- 根因与修复：

### 验证
- 自动测试：
- 手动流程：
- 性能/安全：

### 决策与权衡
- 决定：
- 原因：
- 未选方案：
- 以后何时重看：

### 结果
- 已完成：
- 未完成/已知问题：
- 下一步：
```

## 21. 当前下一步

1. 不急着建立完整产品仓库；先安排 Phase 0 的用户访谈与原型。
2. 准备不含私人作品的 100 / 2,000 / 10,000 张测试 fixture。
3. 建立外部 Tauri 技术 spike 仓库。
4. 完成六项技术反转门并记录 benchmark。
5. 写 ADR-001 后才开始 Phase 1 产品代码。
