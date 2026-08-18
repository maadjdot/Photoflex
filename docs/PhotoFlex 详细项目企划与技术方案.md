---
tags:
  - PhotoFlex
  - 产品企划
  - PRD
  - 技术方案
created: 2026-08-18
status: draft
version: 0.1
---

# PhotoFlex 详细项目企划与技术方案

> 上位文档：[[Photoflex-项目idea]]、[[Photoflex/PhotoFlex 项目企划评估与竞品分析]]  
> 配套文档：[[Photoflex/PhotoFlex 开发流程与路线图]]、[[Photoflex/PhotoFlex 开发日志]]  
> 本文定位：可执行的产品需求文档（PRD）与技术设计初稿  
> 最后更新：2026-08-18

## 0. 文档状态与前提

### 已确认的产品方向

> **PhotoFlex 是 Lightroom / Capture One 之后、InDesign 之前，面向长期摄影项目的本地优先视觉编辑工作台。**

它把问题、研究、照片、选择、序列、反思和版本连接为可回溯的创作过程；不修改原片，不替用户做艺术判断。

### 当前技术假设

- 首发平台：**Windows 10/11**。
- 第二平台：macOS；必须在 Alpha 末期前开始真机验证，不能等 Windows 完成后才移植。
- 产品形态：本地桌面应用，联网和 AI 均为可选能力。
- 初始用户：艺术/纪实/长期项目摄影师，以及与他们协作的导师或编辑。
- 用户通常已经在 Lightroom Classic / Capture One 中完成基础整理和调色。
- 实际代码仓库应建立在 Obsidian Vault 之外；本 Vault 只保存企划、决策与日志。

### 优先级定义

| 级别 | 含义 |
|---|---|
| P0 | MVP 缺少它就无法证明核心价值 |
| P1 | 核心成立后显著提高可用性或形成工作流闭环 |
| P2 | 商业化、规模化或长期差异化能力 |
| Out | 明确不在当前产品范围 |

## 1. 产品章程

### 1.1 用户问题

长期摄影项目通常分散在 Lightroom 收藏夹、硬盘文件夹、PPT/Milanote、纸质小样、PDF、聊天记录与个人笔记中。用户可以完成每个局部动作，却难以回答：

- 我有哪些不同的序列方案？它们具体差在哪里？
- 为什么当时加入或移除了这张照片？
- 当前问题是什么，下一次拍摄缺少什么？
- 两周或两个月后，我如何快速恢复到上次的思考状态？
- 导师的反馈针对哪个版本、哪张照片或哪个跨页？

### 1.2 核心价值主张

1. **Look Hard**：让用户更清楚地看见自己已经拥有的照片。
2. **Sequence Freely**：低摩擦建立、分支、比较多个照片序列。
3. **Remember Why**：把决定、memo、问题与对应照片/版本连接起来。
4. **Resume Quickly**：项目长时间暂停后，能在 60 秒内恢复上下文。
5. **Stay Non-destructive**：原片只读引用，项目数据与代理图独立保存。

### 1.3 北极星指标

> **活跃项目中，用户创建第二个序列版本并进行过版本比较的比例。**

这个指标比日活更接近产品价值：用户是否真的用 PhotoFlex 进行叙事探索，而不是把它当作另一个图库。

### 1.4 成功标准（MVP Beta）

- 70% 的测试用户能在 10 分钟内从文件夹建立第一个项目并创建序列。
- 50% 以上的活跃项目产生至少两个命名版本。
- 用户可在 5 分钟内完成两版序列的 A/B 比较与检查点记录。
- 暂停 7 天后，80% 测试用户可仅凭项目首页说明“上次做了什么、下一步是什么”。
- 全部测试期间原文件移动、覆盖或删除事件为 **0**。
- 10,000 张已索引照片的测试项目仍可流畅浏览；性能标准见第 12 节。

## 2. 用户与使用场景

### 2.1 核心用户 A：长期项目摄影师

- 持续拍摄 3 个月至数年。
- 用 Lightroom/Capture One 调色；用 PPT、Milanote、纸样或 InDesign 排序。
- 最痛苦的是版本分散、思考丢失和重新进入项目困难。

**要完成的工作（JTBD）**：

> 当我反复尝试一个摄影项目的叙事时，我希望快速建立和比较多个序列，并保留每次修改的理由，以便逐渐理解项目而不被工具打断。

### 2.2 核心用户 B：导师 / 摄影编辑

- 同时跟进多个摄影师与多个版本。
- 需要明确知道正在评论哪个版本、哪个跨页。
- 希望反馈能进入下一轮修改，而不是散落在聊天记录里。

导师协作是 P1；MVP 先通过本地导出和屏幕共看验证。

### 2.3 次要用户：摄影学生 / 工作坊

- 痛点强，但个人付费能力有限。
- 可通过院校、导师或课程席位进入。
- 需要更明确的项目模板和阶段提示，但不能把创作变成作业管理。

### 2.4 暂不服务

- 以高速交付和销售相册为主的婚礼工作室；
- 需要企业 DAM 权限、审批和品牌资产管理的大型团队；
- 需要 RAW 显影、修图或完整印前输出的用户。

## 3. 产品范围

### 3.1 MVP P0

1. 项目建立、打开、归档与备份；
2. 本地引用照片、缩略图缓存与断盘重连；
3. Photo Pool、Contact Sheet 和 Look Hard；
4. 选择、筛选与项目内标签；
5. 序列编辑：照片、空位、文字卡、单页/跨页/墙面视图；
6. 命名检查点、序列分支和 A/B 差异比较；
7. memo、问题、决定与对象关联；
8. 项目首页、会话记录与下次入口；
9. 基础 PDF dummy 和序列清单导出；
10. 设置、日志、崩溃恢复和手动备份。

### 3.2 P1

- Lightroom Classic 单向导入桥接；
- 类型化项目地图；
- 自由度有限的页面布局编辑；
- 研究资料、Markdown 笔记和带来源的 AI 研究助理；
- 私密版本分享与结构化反馈；
- 可选本地视觉搜索。

### 3.3 P2

- Lightroom 回写、Capture One 桥接；
- 摄影知识库与导师 review；
- IDML 等更深层交接；
- 院校/团队管理；
- 经过策展的公开项目档案。

### 3.4 明确排除

- RAW 显影、调色、蒙版和修图；
- 自动评判照片艺术质量或生成“最佳序列”；
- 完整通用无限白板；
- CMYK、专色、母版、印前检查和印厂下单；
- 开放社交 feed、点赞排名和推荐算法；
- 默认上传原片；
- 直接读写 Lightroom `.lrcat`。

## 4. 产品信息架构

```text
Home
├── Recent Projects
├── Create / Open / Restore
└── Settings

Project
├── Overview        项目问题、最近决定、活跃序列、下次入口
├── Photos          Sources / Pools / Contact Sheets / Look Hard
├── Sequences       Working Copies / Branches / Versions / Compare
├── Notes           Memo / Question / Decision / Research
├── Map             类型化项目关系图（P1）
├── Dummy           页面与翻页预览
├── Timeline        会话、检查点和事件
└── Export          PDF / Manifest / Backup Package
```

导航规则：

- 左侧只显示上述 6–8 个固定区，不允许任意增加复杂层级。
- 顶部始终显示项目名、当前工作对象、保存状态和检查点按钮。
- `Cmd/Ctrl + K` 打开命令面板；核心动作必须可键盘执行。
- 返回项目时恢复上次模块、滚动位置、选中对象和缩放比例。

## 5. 核心用户流程

### 5.1 从已有照片发现项目

```text
新建项目
→ 选择一个或多个照片文件夹
→ 后台索引与生成缩略图
→ 在 Contact Sheet / Look Hard 中浏览
→ 加入 Photo Pool / 做项目内标记
→ 创建序列 A
→ 保存 v1 检查点并写修改理由
→ 分支为序列 B
→ A/B 比较
→ 保存新版本 / 输出 PDF dummy
```

### 5.2 从问题出发拍摄

```text
新建项目并填写 Core Question
→ 写研究 memo / 待拍问题
→ 每次拍摄新增 Source 或 Shoot
→ 看图并把发现关联到问题
→ 更新下一次拍摄线索
→ 多轮拍摄、选择与序列
→ Dummy / Review
```

### 5.3 隔一段时间恢复项目

```text
打开项目
→ Overview 显示上次会话摘要、最近版本变化、未决问题
→ 点击“继续上次工作”
→ 恢复模块、序列、选择和视口
→ 开始本次会话
```

## 6. 功能详细设计

## 6.1 项目生命周期（P0）

### 用户功能

- 新建空白项目或从“已有照片 / 先有问题”模板开始；
- 设置项目名、核心问题、可选说明和封面；
- 打开最近项目、定位项目包、从备份恢复；
- 归档项目、复制项目结构、导出可移动备份；
- 查看项目大小、缓存大小、原片在线状态和 schema 版本。

### 交互规则

- 删除项目需要二次确认；默认只从最近列表移除，不删除磁盘内容。
- “清理缓存”不得删除项目数据库、memo、附件或原片。
- 打开旧 schema 时先制作数据库备份，再执行 migration（数据库迁移）。
- 项目名称与文件夹名称分离，改名不自动移动项目包。

### 实现方式

每个项目是一个可见目录包：

```text
Project Name.photoflex/
├── manifest.json            项目 ID、名称、schema、创建时间
├── project.db               SQLite 项目数据库
├── Cache/
│   ├── thumbnails/          256px 缩略图
│   └── previews/            1024/2048px 代理图
├── Attachments/             用户选择复制进项目的研究附件
├── Exports/
├── Backups/
└── Logs/
```

编辑时项目是目录而非单一 zip，避免每次修改都重打包。跨电脑移动时执行“导出项目包”，先完成 SQLite checkpoint 和一致性检查，再生成只包含项目数据/缓存/附件、不包含原片的 `.photoflexpkg`。

### 验收标准

- 强制退出后重新打开，不丢失已提交事务；
- 项目移动到另一路径后仍可打开；
- 导出备份再恢复，序列、版本、memo、关系和代理图一致；
- 缓存全部删除后可重新生成，不影响项目内容。

## 6.2 照片来源、索引与缓存（P0）

### 用户功能

- 添加多个 Source（来源文件夹）；
- 显示扫描进度、成功数、跳过数和错误文件；
- 来源可暂时离线，照片显示占位符但仍保留在序列中；
- 文件夹移动后可“重连根目录”；
- 手动刷新或可选监听文件夹变化；
- 查看照片的原始路径、尺寸、拍摄时间、基础 EXIF 和来源。

### 安全原则

- PhotoFlex 对用户选择的原片目录默认只申请 **read** 权限。
- 不提供移动、重命名、删除原片的命令。
- 项目内评分、标签和 memo 只写入 `project.db`；不写 XMP，除非未来提供明确的用户触发同步。

### 资产身份

一张照片在项目中的身份由以下信息组合：

- 内部 `photo_id`（UUID）；
- 规范化路径；
- 文件大小、修改时间；
- 快速指纹（文件头尾分块 hash）；
- 可选完整 hash；
- Lightroom UUID（来自插件时）；
- 原始文件名与拍摄时间。

路径变化时先匹配 Lightroom UUID，再匹配指纹，最后由用户确认。不能只以文件名判断，避免误连。

### 图像管线

1. Rust 后台扫描扩展名，不阻塞 UI；
2. 批量只读提取元数据；ExifTool 支持大量 RAW 与常见格式，可作为首选辅助程序。[ExifTool 支持格式](https://exiftool.org/exiftool_pod2.html)
3. P0 直接支持 JPEG、PNG、WebP、基础 TIFF 代理图；
4. Lightroom 用户优先使用 Lightroom 渲染后的 JPEG 代理，保证调色结果一致；
5. P1 使用 LibRaw 提取 RAW 内嵌预览，不做显影；LibRaw 提供 RAW thumbnail/preview 读取能力。[LibRaw](https://www.libraw.org/download)
6. 生成 256、1024、2048 三档缓存，按视口选择；
7. 先写临时文件，完成后原子 rename，避免崩溃留下半张图；
8. 缓存文件名使用 `photo_id + edit_revision + size`，源文件变化时只失效对应照片。

### 色彩与方向

- 读取 EXIF Orientation 并在代理图中统一方向；
- Lightroom 代理图作为色彩基准；
- 直接文件管线需在技术验证阶段测试 sRGB、Adobe RGB、Display P3 与嵌入 ICC；
- 在未完成色彩验证前，界面明确标注“预览用于编辑顺序，不作为最终色彩输出依据”。

### 异常处理

- 权限丢失：保留资产记录并提示重新授权；
- 硬盘断开：不弹连续错误，用统一 Offline 状态；
- 文件损坏：显示错误占位、路径和重试按钮；
- 同名文件：以身份与指纹区分；
- 源文件发生变化：保留旧的项目引用历史，刷新代理并记录事件。

### 验收标准

- 扫描 10,000 个文件时 UI 可继续浏览和写 memo；
- 用户取消扫描后已完成项目仍有效；
- 原片断开再重连，序列位置不变化；
- 对测试目录进行文件哈希前后比较，PhotoFlex 使用后完全一致。

## 6.3 Photo Pool、Contact Sheet 与筛选（P0）

### 用户功能

- Source 是磁盘来源；Photo Pool 是项目内虚拟分组，不复制原片；
- 一张照片可进入多个 Pool；
- 网格大小连续调节；
- 按 Source、Pool、拍摄时间、方向、项目标签、是否入序列筛选；
- 用户可设置 Pick / Maybe / Hold / Exclude 四态；
- 多选后批量加入 Pool、序列或标签；
- 快捷键优先，支持 Shift 连选和 Cmd/Ctrl 多选。

### 实现方式

- 照片网格使用 TanStack Virtual，仅渲染视口附近项目；它支持纵向、横向与 grid-like virtualization，适合大图库。[TanStack Virtual](https://tanstack.com/virtual/latest/docs/api/virtualizer)
- 缩略图先显示低档缓存，停留/放大后异步替换高档代理；
- 当前选择 ID 独立存储，避免每次拖动或选择导致整个照片数组重新渲染；
- 筛选由 SQLite 查询完成，不把全部资产载入前端内存；
- Pool 只保存 `pool_id / photo_id / added_at / order_key`。

### 验收标准

- 10,000 张照片滚动时不一次创建 10,000 个 DOM 节点；
- 网格尺寸变化后保持用户所在位置；
- 批量选择 500 张并加入 Pool 的操作在一个事务中完成，可一次撤销；
- 删除 Pool 不删除照片资产记录或原片。

## 6.4 Look Hard 模式（P0）

### 目标

不是帮用户更快打分，而是提供不同观看条件，使用户重新认识照片。

### 用户功能

- 无边框全屏单张观看，隐藏评分、文件名和 AI 标签；
- 单张 / 双张对照 / 小组 Survey / 全墙四种观看模式；
- 按拍摄时间、来源、用户顺序或可复现随机种子观看；
- “长期未看”“从未入序列”“常被移除”等项目状态过滤；
- 暂时放入 Tray，不立即要求评价；
- 结束观看时询问是否保存 Tray 为 Pool 或记录 memo。

### 实现方式

- 使用独立 Viewer 状态，不修改资产原始顺序；
- 随机模式保存 seed，便于重现；
- 预取当前照片前后各 2–4 张的 2048 代理；
- 全屏时仍保留退出、方向键、放入 Tray 等最少快捷键。

### 验收标准

- 单张切换时已缓存照片无明显白屏；
- 隐藏元数据后界面不残留评级颜色；
- 随机观看不会写回排序；
- Tray 未保存离开时有明确提示，但可选择丢弃。

## 6.5 序列编辑器（P0，核心）

### 序列项目类型

- `Photo`：引用照片；
- `Blank`：有意留白或待补位置；
- `Text`：短文字、章节或提示；
- `Gap`：明确标为“尚缺照片”，可连接 Question；
- `Divider`：章节边界。

### 用户功能

- 从多个 Pool / Source 拖入同一序列；
- 拖拽、键盘、剪切粘贴和批量移动；
- 在任意位置插入空位、文字或缺口；
- 单张流、双页 spread、墙面总览三种同步视图；
- 设置开卷方向、首页单页/双页逻辑；
- 单张可重复出现，但界面必须提示重复；
- 每个项目可加只属于当前 working copy 的 memo；
- 创建新序列、复制、分支、重命名、归档。

### 拖拽实现

- React 使用 dnd-kit 的 sortable 能力；鼠标/触控与 Keyboard Sensor 都要启用，保证键盘可操作。[dnd kit React](https://dndkit.com/react/quickstart/)、[Keyboard Sensor](https://dndkit.com/react/guides/sensors/)
- 拖动过程中只更新前端 working state；drop 后一次性写数据库；
- `DragOverlay` 显示轻量代理，不拖动完整图片节点；
- 超过 300 项的墙面视图也要虚拟化；
- 文字输入区域标记为 `data-no-drag`，避免编辑文字时误拖。

### 顺序数据

- working copy 保存当前可变顺序；
- `sequence_item` 使用稳定 `instance_id`，即使同一照片出现两次也可区分；
- 顺序使用整数位置并在一次 drop 后批量重排；MVP 不必过早实现复杂 fractional index；
- 每次 drop、批量移动或插入被记录为一个可撤销 command 与一个归组事件。

### 双页规则

- 序列逻辑与布局逻辑分开：序列回答“先后与空位”，Dummy 回答“页面内如何放”；
- Spread View 用页槽表达阅读关系，不在 P0 中提供任意框体排版；
- 首页单页设置改变视觉配对，但不改变项目顺序。

### 验收标准

- 500 个序列项可拖拽、键盘移动和批量移动；
- 一次拖动只生成一个 undo 单元；
- 在三种视图间切换，顺序与选中项一致；
- Blank、Gap、Text 在版本保存、比较和 PDF 中不丢失；
- 误关闭窗口后 working copy 已自动保存。

## 6.6 版本、分支、比较与撤销（P0，核心）

### 概念区分

- **Undo/Redo**：当前会话中的短期操作回退；
- **Autosave**：当前 working copy 的持续保存；
- **Checkpoint / Version**：用户命名、不可静默改写的创作节点；
- **Branch**：从某版本开始另一条序列方向；
- **Project Backup**：灾难恢复，不等于创作版本。

### 保存版本

用户点击 `Save Checkpoint` 后：

1. 输入版本名或采用日期默认名；
2. 可写“这版想解决什么 / 与上一版最大变化 / 仍缺什么”；
3. 在一个 SQLite 事务中写入不可变 snapshot；
4. 记录 parent version、branch 和创建时间；
5. working copy 继续编辑，但已保存 snapshot 不被改变。

### 为什么使用完整 snapshot

序列通常只有几十到数百项；每个版本完整复制顺序和轻量元数据，比只存补丁更容易恢复、导出和测试。事件日志仍保存操作差异，用于解释变化。先用简单可靠的空间换复杂度。

### A/B 比较

- 选择任意两个版本；
- 显示并排序列、同步滚动与相同照片对齐；
- 标记 Added、Removed、Moved、Changed Type；
- 使用稳定 `instance_id`，再辅以 `photo_id` 匹配；
- 顺序差异可用 LCS（最长公共子序列）计算；
- 同一照片的重复实例无法自动确定对应关系时，显示“不确定匹配”而非猜测；
- 用户可对差异写决定 memo，但 MVP 不做自动 merge。

### 验收标准

- 已保存版本不可被普通编辑操作改变；
- 从任意版本分支后，原分支内容完全不变；
- 500 项版本差异在目标硬件 200ms 内完成；
- 版本恢复前自动保存当前 working copy；
- 删除版本需二次确认；若它有子分支，默认只允许归档。

## 6.7 Memo、Question、Decision 与关系（P0）

### 节点类型

- `Memo`：自由记录；
- `Question`：尚未解决的问题，可设 Open / Exploring / Resolved / Parked；
- `Decision`：明确选择及理由；
- `Session Note`：一次工作过程；
- `Research Source`：网页、PDF、书目或引用（P1 完整支持）。

### 用户功能

- 在照片、Pool、序列、版本、Gap、页面和项目级创建 memo；
- 一条 memo 可连接多个对象；
- Markdown 纯文本编辑与预览；
- 支持钉选为 Project Fact，但不能由 AI 自动钉选；
- Question 可连接到照片缺口或下一次拍摄；
- Decision 显示其依据和被哪个后续版本取代。

### 实现方式

- 内容存 Markdown，不先引入复杂富文本 JSON；
- `relation` 表统一保存 `from_id / to_id / relation_type`；
- 搜索使用 SQLite FTS5，FTS5 是 SQLite 的全文检索模块。[SQLite FTS5](https://www.sqlite.org/fts5.html)
- Markdown 预览必须禁用原始 HTML或进行严格 sanitization，避免脚本进入桌面权限环境；
- 自动保存采用 500–1000ms debounce，并显示明确的保存状态。

### 验收标准

- 删除关联对象时 memo 本身不被连带删除；关系变为可查看的 orphan 提示；
- 搜索能按文字、类型、关联对象与日期过滤；
- Markdown 导出后仍是可读纯文本；
- AI 生成文本与用户文本有明确作者标记。

## 6.8 项目首页与上下文恢复（P0）

### 项目首页组件

- Core Question / Project Brief；
- 当前活跃序列缩略图；
- 上次会话：时间、完成动作与退出位置；
- 最近三个 Decision / Checkpoint；
- Open Questions 与 Gap；
- 下次最小进入动作；
- 原片离线和索引错误摘要；
- `Continue Last Session` 按钮。

### 会话机制

- 打开项目产生 session，但 5 分钟内重复打开合并；
- 记录起止时间、访问模块、创建的版本和用户确认的摘要；
- 退出时可跳过反思；未填写不阻止关闭；
- P0 由系统列出客观变化，用户写主观总结；P1 才由 AI 草拟。

### 实现方式

- 页面数据来自事件聚合与用户钉选，不每次依赖 AI；
- `last_view_state` 保存模块、对象 ID、scroll anchor、zoom 和 selection；
- 恢复失败（对象已归档）时回到最近有效父对象并解释原因。

### 验收标准

- 正常关闭与强制退出后均能恢复到最近有效位置；
- 不使用 AI 也能生成“客观变化列表”；
- 首页查询在 10,000 张照片项目中 500ms 内返回首屏数据。

## 6.9 类型化项目地图（P1）

### 用户功能

- 放置 Photo、Memo、Question、Source、Shoot、Pool、Sequence 和 Checkpoint 卡；
- 建立 `supports / contradicts / inspired-by / responds-to / supersedes` 等关系；
- Pool/Sequence 默认显示摘要卡而非展开全部照片；
- 双击卡片进入对应专用编辑器；
- 可保存多个视图，不复制底层对象。

### 实现方式

- 使用 React Flow 创建 typed nodes 与 edges；
- 大型分组默认折叠，节点/函数 memoize，选择状态与完整 nodes 分离；React Flow 官方也建议在大图中减少无关重渲染与折叠节点。[React Flow 性能指南](https://reactflow.dev/learn/advanced-use/performance)
- 画布只保存布局坐标和可见状态，真实内容仍在统一对象表；
- 不允许自由 HTML、任意插件和 Figma 级别设计能力。

### 验收标准

- 500 个轻量节点仍可平移与缩放；
- 删除地图卡片默认只从该视图移除，不删除底层对象；
- 从地图进入序列再返回，视口不丢失。

## 6.10 Dummy 与页面预览（P0 基础，P1 编辑）

### P0

- 根据序列生成单张流或双页阅读预览；
- 白底、固定页边距、Fit / Fill 两种图片方式；
- 翻页、键盘前后、全墙总览；
- Text/Blank/Gap 能在 PDF 中表达；
- 输出屏幕预览用 PDF。

### P1

- 页面尺寸和开卷方向；
- 页面内多个 image frame；
- frame 使用归一化 `x/y/w/h`，便于尺寸切换；
- 图片在 frame 内 pan/zoom/crop；
- 基础对齐、留白、文字框和页码；
- 模板只包含布局，不复制照片。

### 实现方式

- P0 可使用 pdf-lib 从 JavaScript 创建页面、绘制图片与文字；它能在 JavaScript 环境创建 PDF 并嵌入图片/字体。[pdf-lib](https://pdf-lib.js.org/)
- 导出前估算文件大小；默认使用 2048 代理，用户明确选择时才读取更高分辨率；
- 长 PDF 在 Web Worker 或 Rust 后台任务生成，提供取消和进度；
- 最终印刷仍交给 InDesign，不承诺颜色和出血符合印厂要求。

### 验收标准

- 200 页 PDF 可生成、取消并在失败后重试；
- 缺失原片时可选择使用现有代理并在报告中列出；
- 翻页预览不改变序列或版本数据。

## 6.11 导出与交接（P0/P1）

### P0 导出

- PDF dummy；
- CSV/JSON 序列 manifest：顺序、类型、原路径、photo ID、版本信息；
- 联系表 PDF；
- Markdown 项目摘要；
- `.photoflexpkg` 项目备份。

### P1 导出

- 页面 frame 几何与源路径；
- 供 InDesign 脚本读取的 JSON；
- 私密网页 review 包或云端分享；
- 是否做 IDML 必须由 5 位以上真实用户验证，不预先承诺。

### 原则

- 导出是读取原片的唯一常见高权限动作，仍不修改原片；
- 文件名冲突要明确处理；
- 每次导出保存配置、结果与错误清单，便于重现。

## 6.12 Lightroom Classic 桥接（P1）

### 目标

让用户在 Lightroom 完成调色/初筛后，把选择与编辑后代理送入 PhotoFlex，不改变 Lightroom 的原工作流。

### 插件侧

- Lua 插件菜单：`Send Selected Photos to PhotoFlex`；
- 读取 UUID、路径、评分、Pick、颜色、时间、尺寸等元数据；
- 请求缩略图或通过 Export API 输出 JPEG 代理；
- 写入一次性 handoff job，不直接连接或修改 PhotoFlex 数据库。

Lightroom Classic SDK 官方支持 Lua 插件、导出/发布扩展与自定义元数据，可作为桥接基础。[Adobe Lightroom Classic SDK](https://developer.adobe.com/lightroom-classic)

### 建议的安全传输

```text
Lightroom Plugin
→ 写入 AppData/PhotoFlex/Handoff/{job-id}/
→ proxies/* + manifest.json.tmp
→ 完成后原子 rename 为 manifest.ready.json
→ PhotoFlex 监听 Handoff
→ 校验 schema / 路径 / 数量后导入
→ 写 receipt.json
```

这样不需要在本地开放 HTTP 端口。插件和应用都不能直接访问对方数据库。

### P2 回写

- PhotoFlex 产生 outbound manifest；
- 用户在 Lightroom 运行 `Sync from PhotoFlex`；
- 只创建/更新明确命名的 Collection 或自定义 metadata；
- 冲突显示预览，不静默覆盖 Lightroom 评分。

### 验收标准

- 1000 张选择导入中断后可重试，不产生重复资产；
- Lightroom UUID 相同的照片更新代理而非新建重复项；
- 插件卸载不影响 PhotoFlex 项目；
- 任何情况下不直接写 `.lrcat`。

## 6.13 AI 与长期记忆（P1/P2）

### 产品边界

AI 只能担当：研究助理、档案员、检索助手和提问者。不得默认排序、评分、删除或替用户确定主题。

### P1：文本与项目记忆

- 根据用户选择的项目对象回答，不自动读取整个图库；
- 为会话草拟摘要，用户确认后才进入项目事实；
- 查找相关 memo、Question、Decision 和版本；
- 研究结果必须带 URL、标题、访问时间和摘录范围；
- 所有 AI 内容标注模型、时间、输入对象和来源。

### P2：本地视觉检索

- 用小缩略图生成视觉 embedding；
- 自然语言搜照片与相似图；
- embedding 仅用于检索，不作为事实标签；
- 可使用 ONNX Runtime 在设备上运行跨平台模型；ONNX Runtime 支持跨平台推理，Web 版本可通过 JavaScript/WASM 运行模型。[ONNX Runtime](https://onnxruntime.ai/docs/)、[ONNX Runtime Web](https://onnxruntime.ai/docs/get-started/with-javascript/web.html)
- 正式选模型前做 Windows WebView2 与 macOS WebKit 性能/内存验证。

### 长期记忆实现

```text
用户当前选择
  + Canonical Project Brief
  + 相关对象与关系（SQL）
  + 文字检索结果（FTS5）
  + 相关历史摘要 / 版本差异
  + 用户明确选择的代理图
→ Context Builder
→ Provider Adapter
→ 带对象引用与来源的回答
```

- `Project Brief` 与 `Pinned Fact` 由用户控制；
- 原始事件不可被 AI 摘要覆盖；
- 向量检索负责相似，SQL 负责准确关系；
- 模型上下文只是一次调用的工作区，不作为持久数据库；
- provider 通过统一接口接入，避免项目被某一家模型锁死。

### 隐私

- AI 默认关闭；
- 每次首次上传图像显示将上传的数量、尺寸、提供商和预计成本；
- 原片不上传，只传用户确认的代理图；
- API key 存入操作系统安全凭据存储，不写项目数据库或日志；
- 用户可导出与删除 AI 记录；
- 云端失败不影响本地核心功能。

## 6.14 私密反馈（P1）

### 最小闭环

- 发布一个不可变的 sequence version，而非当前 working copy；
- reviewer 无需安装应用即可查看；
- 评论定位到整版、页、跨页或照片实例；
- 作者把反馈标为 `Accepted / Consider / Rejected / Resolved`；
- 从反馈创建 Question 或 Decision，并关联到下一版本。

### 技术方案

- 桌面端生成低清代理与只读 snapshot；
- 云端只保存发布版本、评论和权限，不保存项目数据库/原片；
- 分享 token 可撤销、可设置到期时间和密码；
- P1 先做单一后端服务，公开社区另立项目评审。

## 6.15 设置、可访问性与诊断（P0）

### 设置

- 缓存上限和位置；
- 代理图质量；
- 语言、主题与快捷键；
- AI 和网络总开关；
- 自动备份频率；
- 外部应用路径；
- 诊断日志级别。

### 可访问性

- 所有拖拽操作有键盘等价动作；
- 颜色状态同时显示文字/图标；
- 可见焦点、屏幕阅读器标签和可调 UI 缩放；
- 动画可关闭；
- 图片本身不强制生成审美描述，用户可添加个人说明。

### 诊断

- 日志包含时间、模块、错误码和 job ID；
- 默认不记录 memo 正文、文件完整路径、图片内容或 API key；
- 支持生成隐私清理后的 support bundle；
- 后台任务可查看、取消和重试。

## 7. 技术架构决策

## 7.1 Tauri 与 Electron 对比

| 项目 | Tauri 2 | Electron | 决策 |
|---|---|---|---|
| 包体与基础内存 | 使用系统 WebView，通常更轻 | 自带 Chromium，较大 | Tauri 更符合定位 |
| 本地后台处理 | Rust 类型/线程安全，适合索引 | Node 生态更熟悉 | Tauri 长期更稳 |
| 前端开发 | React/TS | React/TS | 相同 |
| 学习与调试 | 需要 Rust、跨 WebView | 全 TS，上手更快 | Electron 原型更快 |
| 渲染一致性 | 不同系统 WebView 有差异 | Chromium 一致 | Electron 占优 |
| 权限边界 | Capability / scope 细粒度 | 依赖 IPC 与 Electron 安全配置 | Tauri 占优 |
| 原生依赖打包 | 需要 Rust/sidecar 配置 | native modules 也需处理 | 都需技术验证 |

Tauri 使用系统 WebView、Rust 后端和 JS↔Rust `invoke`，并提供文件权限 scope 与 SQL plugin；这符合本地优先和最小权限设计。[Tauri 概览](https://v2.tauri.app/start/)、[File System plugin](https://v2.tauri.app/plugin/file-system/)、[SQL plugin](https://v2.tauri.app/plugin/sql/)

### 推荐

采用 **Tauri 2 + React + TypeScript**，但在开发第 0 阶段设置技术反转门。若以下任意两项无法在两周内稳定通过，则改用 Electron：

1. 10,000 张代理图的虚拟网格滚动；
2. 500 项序列拖拽与键盘排序；
3. ExifTool/LibRaw sidecar 在 Windows 打包后可运行；
4. 200 页 PDF 后台生成与取消；
5. 项目目录读权限动态授权、重启后恢复；
6. Windows/macOS 代理图色彩差异可接受。

Electron fallback 必须保持 renderer sandbox、context isolation 和受限 IPC；Electron 官方强调远程内容和 Node/文件权限的安全边界。[Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)

## 7.2 推荐技术栈

| 层 | 选择 | 用途 |
|---|---|---|
| Desktop shell | Tauri 2 | 窗口、权限、打包、更新 |
| Frontend | React + TypeScript + Vite | 产品 UI |
| UI state | Zustand | 选择、视口、working copy、undo 状态 |
| Large lists | TanStack Virtual | 照片网格、墙面与长序列 |
| Drag & drop | dnd-kit | 排序、跨 Pool 拖入、键盘拖动 |
| Project map | React Flow（P1） | 类型化节点/关系图 |
| Local DB | SQLite + migrations | 项目对象、版本、事件与检索 |
| Text search | SQLite FTS5 | memo、问题、来源全文检索 |
| Backend | Rust commands/services | 扫描、hash、文件权限、job、备份 |
| Metadata | ExifTool sidecar（只读） | 跨相机格式元数据 |
| RAW preview | LibRaw sidecar（P1） | 提取内嵌预览，不显影 |
| PDF | pdf-lib P0；性能不足再转 Rust | Dummy / Contact Sheet |
| Local ML | ONNX Runtime（P2） | 可选视觉 embedding |
| Test | Vitest + React Testing Library + Playwright + Rust tests | 单元、组件、流程和后端测试 |
| Package manager | pnpm | 前端依赖与 lockfile |

原则：依赖越少越好；每引入一个大型 UI/原生库，需要在 [[Photoflex/PhotoFlex 开发日志]] 中记录选择理由和退出方案。

## 7.3 高层架构

```text
┌──────────────── React / TypeScript UI ────────────────┐
│ Views │ Working State │ Commands │ Virtualized UI     │
└───────────────────────┬───────────────────────────────┘
                        │ typed invoke/events
┌───────────────────────▼───────────────────────────────┐
│                 Tauri / Rust Core                     │
│ Project Service │ Asset Indexer │ Cache │ Export Jobs │
│ Backup/Migrate  │ File Scope    │ Handoff │ Logging   │
└───────┬──────────────────┬───────────────────┬─────────┘
        │                  │                   │
  SQLite project.db   Project Cache      Sidecars/APIs
  FTS / snapshots     thumbnails         ExifTool/LibRaw
                                          AI provider
```

### 边界

- React 不直接接收任意文件系统能力；只调用窄而明确的 Rust command。
- Rust command 先验证 project ID、授权 root 和 canonical path。
- 后台长任务以 job ID 运行，通过事件报告进度；支持 cancel token。
- 数据库访问放在 repository/service 层，不在组件里散写 SQL。

## 7.4 建议代码结构

```text
photoflex/
├── apps/desktop/
│   ├── src/
│   │   ├── app/
│   │   ├── features/
│   │   │   ├── projects/
│   │   │   ├── assets/
│   │   │   ├── look-hard/
│   │   │   ├── sequences/
│   │   │   ├── versions/
│   │   │   ├── notes/
│   │   │   └── export/
│   │   ├── shared/
│   │   └── test/
│   └── src-tauri/
│       ├── src/
│       │   ├── commands/
│       │   ├── domain/
│       │   ├── services/
│       │   ├── repositories/
│       │   ├── jobs/
│       │   └── security/
│       └── migrations/
├── plugins/lightroom/            P1
├── packages/domain-types/        前后端共享生成类型
├── fixtures/photo-project-small/
├── fixtures/photo-project-large/
├── docs/adr/
└── scripts/
```

按 feature 垂直切片，避免建立一个所有功能都依赖的巨大 `utils` 或 `components` 目录。

## 8. 数据模型

### 8.1 主要实体

| 实体 | 关键字段 | 用途 |
|---|---|---|
| `project` | id, name, brief, status, created_at | 项目根对象 |
| `source` | id, root_path, permission_ref, status | 原片来源 |
| `photo_asset` | id, source_id, rel_path, fingerprint, lr_uuid, metadata_json | 照片引用 |
| `photo_state` | photo_id, pick_state, project_rating, labels | 项目内判断 |
| `pool` | id, name, type | 虚拟照片组 |
| `pool_item` | pool_id, photo_id, order_index | Pool 成员 |
| `sequence` | id, name, branch_name, archived_at | 序列身份 |
| `sequence_work_item` | instance_id, sequence_id, item_type, ref_id, order_index, payload | 当前工作顺序 |
| `sequence_version` | id, sequence_id, parent_id, name, rationale, created_at | 不可变版本 |
| `sequence_version_item` | version_id, instance_id, item_type, ref_id, order_index, payload | 版本 snapshot |
| `note` | id, type, markdown, author_type, status | Memo/Question/Decision |
| `relation` | from_id, to_id, relation_type | 跨对象关系 |
| `event` | id, session_id, event_type, object_ids, payload, created_at | 追加式历史 |
| `session` | id, started_at, ended_at, summary, next_action | 工作会话 |
| `view_state` | user_scope, module, object_id, state_json | 恢复位置 |
| `layout` | id, sequence_version_id, page_size | Dummy 配置 |
| `page/frame` | page_id, ref_id, x, y, w, h, crop_json | P1 页面布局 |
| `export_job` | id, config_json, status, result_path, error | 可重现导出 |
| `ai_record` | id, provider, model, input_refs, output, sources | AI 可审计记录 |

### 8.2 通用规则

- 所有 ID 使用 UUID，不以磁盘路径作为主键；
- 时间用 UTC 存储，UI 按本地时区显示；
- 用户文字和 AI 文字必须能区分作者；
- 版本表 append-only；
- event payload 有 schema version；
- 数据库 foreign key 开启；删除优先 soft delete / archive；
- 每个 migration 都有升级测试与旧项目 fixture。

### 8.3 SQLite 策略

- 使用事务保护导入、批量移动和版本保存；
- 桌面单机项目可使用 WAL 提高读写并行，但复制/备份前必须 checkpoint 并使用 Backup API，不能只复制打开中的 `.db`；SQLite 官方说明 WAL 还有配套 `-wal/-shm` 文件，分离复制可能丢失事务。[SQLite WAL](https://www2.sqlite.org/wal.html)、[SQLite Backup API](https://www.sqlite.org/backup.html)
- 缩略图不存 BLOB，避免数据库膨胀；只存 cache key 和状态；
- 数据库定期执行 integrity check；失败时进入只读恢复模式。

## 9. 状态、事件与撤销

### Command 模式

所有可撤销操作实现为 command：

```text
execute()
undo()
serializeForEvent()
```

典型 command：`MoveSequenceItems`、`AddToPool`、`SetPickState`、`AttachNote`、`InsertGap`。

### 事务边界

- 一次用户意图 = 一个事务 = 一个 undo 单元；
- 拖动过程不连续写数据库；drop 后提交；
- 文字编辑不把每个键盘输入写成事件，只记录阶段性保存；
- undo stack 默认保留当前会话最近 100 个 command；检查点跨会话长期保存。

### 事件用途

- 恢复客观变化；
- 生成时间线；
- AI 上下文；
- 调试用户报告；
- 不直接用 event sourcing 重建全部数据库，避免 MVP 复杂度。

## 10. 文件安全、隐私与威胁边界

### 必须遵守

1. 原片目录仅动态授予读取范围；
2. 不向 WebView 暴露通用 `read(anyPath)` / `write(anyPath)`；
3. canonicalize 后确认路径仍位于授权 root 内，防止 `..` 与 symlink 越界；
4. Tauri fs scope 使用 allow/deny 最小权限；其文件插件默认会阻止潜在危险命令，需要显式 capabilities。[Tauri FS 权限](https://v2.tauri.app/plugin/file-system/)、[Command Scopes](https://v2.tauri.app/security/scope/)
5. 网络来源不在带本地权限的 WebView 中直接执行；外链交给系统浏览器；
6. Markdown/网页摘录严格净化；
7. API key、分享 token 不进入日志；
8. 更新包必须签名；发布前建立密钥备份和轮换流程；
9. “删除缓存”“移除来源”“删除项目”必须是三种不同动作。

### 隐私默认值

- Analytics 默认关闭或首次明确选择；
- 错误报告去除完整路径、用户名和 memo 内容；
- AI 默认关闭；
- 项目包不包含原片，除非未来有明确的“打包副本”功能。

## 11. 错误处理与恢复

### 错误分级

| 级别 | 例子 | 行为 |
|---|---|---|
| Inline | 单张代理生成失败 | 占位符 + 重试，不打断工作 |
| Job | 扫描/导出部分失败 | 保留成功结果 + 错误清单 |
| Project | migration/integrity 失败 | 停止写入、打开备份/只读恢复 |
| Fatal | app core 崩溃 | 写最小崩溃日志，重启后恢复 autosave |

### 恢复原则

- 不把“重试”设计为从头清空；job 要幂等（重复执行不产生重复数据）；
- migration 前备份；
- 项目打不开时仍允许导出数据库和日志给支持；
- 任何自动修复先保留原文件副本并说明做了什么。

## 12. 非功能要求

### 性能基线

目标测试硬件：4 核 CPU、16GB RAM、SSD、集成显卡的中档 Windows 设备。

| 场景 | 目标 |
|---|---:|
| 暖启动打开已索引项目 | 5 秒内显示 Overview |
| 10,000 张照片查询首屏 | 2 秒内显示已有缩略图 |
| 已缓存单张前后切换 | 100ms 内进入绘制 |
| 网格滚动 | 主观无持续卡顿，目标接近 60fps |
| 500 项序列 drop 提交 | 100ms 内 UI 响应，DB 可异步确认 |
| 500 项 A/B diff | 200ms 内 |
| 自动保存 | 不阻塞交互，不超过 1 秒可见延迟 |
| 常规空闲内存 | 目标低于 500MB；以实测为准 |

### 稳定性

- 所有写操作事务化；
- 后台 job 可取消；
- 每日/每次重要 migration 前本地备份；
- Beta 发布前进行 24 小时大项目 soak test；
- P0 不依赖网络才能启动或打开项目。

### 兼容性

- 路径包含中文、空格、emoji、长文件名；
- Windows 盘符、外接盘；macOS volume；
- 大小写差异与 Unicode normalization；
- 软件升级后旧项目可迁移，不能要求用户重建索引。

## 13. 测试策略

### 单元测试

- 文件指纹与重连匹配；
- 序列命令 execute/undo；
- snapshot 不可变；
- LCS diff 与重复照片；
- spread pairing；
- 路径授权与越界拒绝；
- migration 与 schema validation。

### 组件测试

- 多选、筛选、拖拽和键盘排序；
- 缩略图 fallback；
- memo autosave 状态；
- A/B 标记；
- Offline 占位；
- 错误与恢复 UI。

### 集成测试

- 新建项目 → 导入 → Pool → 序列 → 版本 → PDF；
- 强制关闭 → 重启恢复；
- 移动 Source → 重连；
- 导出备份 → 新位置恢复；
- migration 旧 fixture；
- Lightroom handoff 幂等导入（P1）。

### 性能测试数据

- `small`：100 张、3 序列、10 memo；
- `medium`：2,000 张、10 序列、50 版本；
- `large`：10,000 张、500 项单序列、500 memo；
- `edge`：损坏图、离线盘、重复名、中文/emoji/超长路径、同图重复实例。

测试 fixture 使用有明确授权或自行生成的图片，不提交用户私人照片。

## 14. 发布与版本策略

- `0.x` 期间项目格式仍可能变化，但每次必须提供 migration；
- Alpha 只给 5–10 位受控测试者；
- Beta 扩至 30–50 位目标用户；
- Windows 安装包签名后发布；macOS 需要在 macOS 设备构建、签名和 notarization；
- 自动更新在数据备份和 rollback 策略完成前不开启；
- 每个版本发布 release notes：新增、修复、已知问题、schema 变化、备份建议。

## 15. 关键风险与缓解

| 风险 | 概率/影响 | 缓解 |
|---|---|---|
| 范围再次膨胀 | 高/高 | 每项功能先回答是否强化序列版本核心；P1 不提前 |
| Tauri/Rust 学习拖慢 | 中/中高 | 两周技术反转门；Rust command 保持窄接口 |
| 大图库卡顿 | 中/高 | 虚拟化、分级缓存、后台 job、large fixture 从第 2 阶段开始 |
| RAW 色彩/预览不一致 | 高/中 | P0 主推 Lightroom JPEG 代理；直读 RAW 延后 |
| 用户担心原片安全 | 中/高 | 只读权限、公开威胁模型、哈希验证、零删除命令 |
| 版本模型太复杂 | 中/高 | snapshot 优先、不做 merge、清楚区分 undo/version/backup |
| AI 引导创作过度 | 中/高 | AI 默认关、明确角色、对象引用、用户确认事实 |
| 用户不愿改变工作流 | 高/高 | 尽早用真实项目测试；Lightroom 桥接在核心验证后立刻做 |
| 艺术摄影市场太小 | 中高/高 | 同时验证导师/院校付费端，不用社区掩盖商业问题 |
| 跨平台打包/签名 | 中/中 | Alpha 前开始 macOS CI/真机；sidecar 逐平台验证 |

## 16. 待验证决策

以下内容不能仅靠企划决定，必须通过技术 spike 或用户测试：

1. Tauri 是否通过六项技术反转门；
2. 用户首版能否接受“JPEG/Lightroom 代理优先，RAW 内嵌预览稍后”；
3. 序列 A/B 比较是并排更好，还是叠加/差异列表更好；
4. 用户是否真的需要自由页面布局，还是双页预览已经足够；
5. Project Map 是否提升理解，还是重新制造白板复杂度；
6. 导师是否愿意在结构化反馈界面评论；
7. 本地 Core 应采用买断、年费还是两者并存；
8. AI 文本研究是否有足够使用频率支持独立收费。

每项验证结果写入 [[Photoflex/PhotoFlex 开发日志]]，影响架构的决定另建 ADR（Architecture Decision Record，架构决策记录）。

## 17. MVP 完成定义

MVP 不是“界面看起来完整”，而是以下闭环在真实项目上成立：

```text
引用真实照片
→ 流畅看图
→ 建立两个不同序列
→ 保存并比较版本
→ 记录为什么修改
→ 关闭七天后恢复上下文
→ 导出可阅读 dummy
→ 原片零改动
```

只有这个闭环通过 8–12 位目标用户测试，才进入 Lightroom 深度桥接、AI、页面自由排版和反馈系统。
