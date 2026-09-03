# PhotoFlex Contact Sheet、Worktable 与 Sequence：React + TypeScript 技术建议

> 开源资源核对日期：2026-08-28  
> 产品方向更新：2026-09-02
> 当前工程：React 19.1 + TypeScript 5.9 + Vite 7.1，本地优先  
> 产品与模块真相来源：[`PRD_Sequence.md`](./PRD_Sequence.md) 与 [`Worktable_Architecture_Interaction_Proposal.md`](./Worktable_Architecture_Interaction_Proposal.md)

本文保留已完成的开源资源调查，但技术落点已按确认方向更新：Pool 与 Whiteboard 不再是用户界面；Table 是独立工作桌面；Sequence 只负责一维阅读顺序。

## 结论先行

PhotoFlex 不需要用一个大型画布框架重写现有 Contact Sheet，也不应该把 Table 和 Sequence 放进同一套拖拽模型。

1. **Table 使用原生 Pointer Events + React DOM + CSS transform。** 自由移动、框选、pan / zoom 和坐标转换由 PhotoFlex 自己控制；一次手势结束后生成一个 Worktable command。
2. **Sequence 当前采用 React DOM + Pointer Events。** 它只负责一维横向排序、明确插入线和键盘操作，不负责 Table 自由画布；dnd-kit 仍是可选参考，不是当前依赖。
3. **照片索引采用 exifr。** 必要 EXIF 在索引阶段解析，不在 React 渲染期间读取。
4. **保留现有 Contact Sheet 虚拟网格。** 只有 profiling 证明动态布局或维护成本成为问题时，再评估 TanStack Virtual。
5. **Preview 暂时保留现有实现。** 先把 Pick / Reject、ON TABLE 和 missing 行为接通；Pin 属于 project-wide 状态但当前 Table 工具栏不开放，再决定是否用 Yet Another React Lightbox 替换底层。
6. **MVP 不使用 React Flow。** Relationship View、AI 自动关系、真实物理碰撞和通用 Whiteboard 均不在当前范围。

## 1. 技术职责图

```text
PhotoSource
  ├── index / EXIF / thumbnail / preview lease
  └── missing / permission error

Contact Sheet
  ├── virtualized catalog view
  ├── filtering / sorting / selection
  └── Pick / Reject / Pin / Place on Table

WorktableEditor
  ├── membership / x / y / z
  ├── arrange / group / link / pile
  └── command history

TablePage
  ├── Pointer Events / marquee / gesture preview
  ├── viewport coordinate conversion
  └── Compare / Create Sequence entry actions

SequenceEditor
  ├── SequenceItem order
  ├── add / move / remove / undo / redo
  └── versions / Read
```

## 2. 开源资源清单

| 资源 | 能解决什么 | PhotoFlex 中的合适位置 | 许可证 / 风险 | 建议 |
|---|---|---|---|---|
| [clauderic/dnd-kit](https://github.com/clauderic/dnd-kit) | 鼠标、触控、键盘拖拽；sortable 与 DragOverlay | Sequence 横向编辑条的可选参考 | MIT；自由二维画布仍需自己设计 | **当前未引入** |
| [MikeKovarik/exifr](https://github.com/MikeKovarik/exifr) | 浏览器/Node 中读取 EXIF，支持按需解析标签 | 导入与索引 worker | MIT；HEIC / RAW 需真实样本测试 | **索引阶段采用** |
| [BetterTyped/react-zoom-pan-pinch](https://github.com/BetterTyped/react-zoom-pan-pinch) | DOM 内容的 zoom / pan / pinch | 仅作为 Table viewport spike 备选 | MIT；CSS transform 与 hit test 需要验证 | **先不用，遇到证据再 spike** |
| [igordanchenko/yet-another-react-lightbox](https://github.com/igordanchenko/yet-another-react-lightbox) | 键盘、触控、预加载、Zoom 插件 | Preview / Read 底层备选 | MIT；需重新接回本地 URL lease 与 PhotoFlex 状态 | **按需评估** |
| [TanStack/virtual](https://github.com/TanStack/virtual) | Headless 大列表/网格虚拟化 | Contact Sheet 性能瓶颈出现时 | MIT；DnD 与虚拟化并用复杂 | **保留现状** |
| [igordanchenko/react-photo-album](https://github.com/igordanchenko/react-photo-album) | Rows / Columns / Masonry | 非编辑 Overview 或公开浏览页 | MIT；不能表达接触印样或编辑语义 | **不用于核心编辑器** |
| [xyflow/xyflow](https://github.com/xyflow/xyflow) | 节点、连线、图编辑 | 未来 Relationship View | MIT；对当前 Worktable 明显过重 | **MVP 不采用** |
| [GhostInTheBus/book-builder](https://github.com/GhostInTheBus/book-builder) | 照片拖放、版面与导出参考 | 参考跨区域交互 | 仓库许可不清晰时不能复制代码 | **只参考交互** |
| [hugoxxxx/GT23_Workflow](https://github.com/hugoxxxx/GT23_Workflow) | 胶片规格、齿孔、边码、EXIF 呈现 | Contact Sheet analog skin 参考 | MIT；Python GUI 不直接移植 | **参考视觉规则** |
| [fabiodalez-dev/Cimaise](https://github.com/fabiodalez-dev/Cimaise) | 水平胶片条与 scroll-snap | Sequence Read 视觉参考 | GPL-3.0；不要复制实现 | **仅视觉参考** |
| [leuvi/sweet-album](https://github.com/leuvi/sweet-album) | 虚拟滚动、选择、全屏 | 比较网格抽象方式 | MIT；项目成熟度有限 | **研究参考** |

上线前仍应锁定具体版本、保留第三方 notice 并复核许可证。仓库没有 LICENSE 或 README 与 LICENSE 不一致时，不复制源码或资源文件。

## 3. Contact Sheet 建议

### 3.1 顺序必须分开

```ts
type ProjectOrdering = {
  sourceOrder: PhotoId[];          // 导入时的稳定顺序
  contactViewOrder: PhotoId[];     // 当前筛选/排序的派生结果
  tableEntryOrder: PhotoId[];      // 加入 Table 的稳定先后
  sequenceOrder: SequenceItemId[]; // 明确保存的阅读顺序
};
```

关键规则：

- Contact Sheet 排序与过滤只计算 `contactViewOrder`。
- `Place on Table` 只改变 Worktable membership / entryOrder。
- 只有明确的 Sequence command 能改变 `sequenceOrder`。
- Table 的 x/y 不能回写任何上述顺序。

### 3.2 照片状态不要混成一个字段

```ts
type PhotoDecision = "unrated" | "pick" | "reject";

type ContactPhotoPresentation = {
  selected: boolean; // 当前页面临时状态
  decision: PhotoDecision;
  pinned: boolean;
  inTable: boolean;  // 从 placement 是否存在推导
  missing: boolean;  // 从 PhotoSource 读取结果推导
};
```

- `decision`、`pinned` 持久化为 project-wide photo state。
- `selected` 不持久化。
- `inTable` 不单独保存 boolean，避免双写。
- `missing` 不删除 Table placement 或 Sequence item。

### 3.3 交互调整

- 原 `Add to Pool` 改为 `Place on Table`。
- 原 `IN POOL` 标记改为 `ON TABLE`。
- Project 与 Contact Sheet 右侧 Pool panel 删除，不改名成 Table tray。
- Preview 接回 Pick / Reject 和 Place on Table；Pin 仍是独立 project-wide 状态。
- Contact Sheet 保留全量目录身份，不显示可自由拖动的桌面坐标。

### 3.4 性能顺序

1. 索引阶段读取基本信息和必要 EXIF。
2. 缩略图与全尺寸 preview 分开。
3. 集中管理并释放 `URL.createObjectURL` lease。
4. 保留现有虚拟网格，用 1k、5k、20k 真实比例数据 profiling。
5. 只有实际瓶颈出现时再迁移虚拟化依赖。

## 4. Worktable 建议

### 4.1 自由画布不用 dnd-kit

Table 的核心问题不是列表重排，而是 world/screen 坐标、选择集合和完整 pointer gesture。推荐流程：

```text
pointerdown
  → 记录 activePointer、世界坐标起点、选中 IDs 和原 placements
pointermove × N
  → 只更新 transient CSS transform preview
pointerup
  → 计算一次 world delta
  → WorktableEditor.execute(move command)
  → save Workspace snapshot
```

使用 pointer capture 让指针移出卡片后仍能完成或取消手势。`pointercancel` 和 `Escape` 只恢复预览，不生成 command。

### 4.2 viewport 数学集中处理

必须只有一处负责：

- `screenToWorld`；
- `worldToScreen`；
- 以当前指针为锚点的 zoom；
- screen-space marquee 到 world-space rect；
- Fit all 的 bounds 计算。

不要在 React event handlers 中散落 `clientX / zoom + offset` 公式。Worktable placement 只存 world-space x/y/z，不存屏幕像素。

### 4.3 DOM 与渲染

- 每张照片使用普通 DOM card。
- 使用 `transform: translate3d(...)` 放置，避免持续改 layout properties。
- viewport pan / zoom 放在统一父层 transform。
- M2.1 先用真实 200–500 张 Table 数据 profiling；没有证据前不做 canvas/WebGL 重写。
- missing placeholder 与普通卡片共享相同 placement key。

### 4.4 Group、Link 与 Pile

- Group：成员一起移动，照片仍全部可见。
- Link：保存两张或多张照片的 Table-only 关系，不改变 Sequence。
- Pile：记录一组照片及其桌面位置，可打开对应 Sequence。
- Group / Link / Pile 都不是 Sequence order，也不自动驱动 Sequence。

### 4.5 Compare 与 Pin

- Table Compare 由当前显式选择的两张照片进入。
- Compare A / B 是临时 session 状态，不持久化。
- 退出 Compare 后保持 Table placements 和 selection。
- Pin 是 project-wide 持久化 annotation，不限制只能 Pin 两张；当前 Table 工具栏不提供 Pin。
- Pin 与 Compare slot、Pick / Reject、Table membership 分离。

## 5. Sequence 建议

### 5.1 dnd-kit 只作为一维编辑的可选参考

```text
pointer / keyboard drag
  → 若未来引入 dnd-kit，则由它提供 active / over / DragOverlay
drop
  → 计算明确插入位置
  → SequenceEditor.execute(add or move command)
  → 一个 undo step
  → persist SequenceDocument Working Draft
```

Sequence strip 应优先使用单行横向布局和明确插入线。MVP 数量较小时可以不虚拟化，避免 sortable 与 virtualization 同时增加复杂度。

### 5.2 Create Sequence 必须确认顺序

从 Table 发起时：

1. 获取当前显式选择。
2. 打开横向顺序确认条。
3. 初始顺序使用 `tableEntryOrder` 中的选中子序列。
4. 用户可在确认条中重排。
5. 确认后为每项生成新的稳定 `SequenceItemId`。

禁止按 Table x/y 自动生成 Sequence。未来若支持“按桌面阅读路径生成”，必须是显式命名动作并先预览结果。

### 5.3 阅读单元

后续 Sequence 可以演进为判别联合：

```ts
type SequenceItem =
  | { id: SequenceItemId; kind: "photo"; photoId: PhotoId }
  | { id: SequenceItemId; kind: "blank"; width: "half" | "full" }
  | { id: SequenceItemId; kind: "memo"; text: string };
```

即使第一版只有 photo，也建议先保留 `kind: "photo"`，降低未来 workspace migration 成本。

### 5.4 版本差异

不需要先引入通用 JSON diff。以稳定 SequenceItemId 比较两个版本即可得到：

- added；
- removed；
- moved；
- 后续 item 内容变化。

## 6. 推荐实现顺序

### M2.0：术语与数据地基（已完成）

- Worktable contracts / editor / interface tests；
- workspace schema migration；
- 旧 `poolPhotoIds` 自动转换为确定性 Grid 和 `tableEntryOrder`；
- 删除旧 Pool 双写与 Whiteboard contract（历史迁移记录）；
- 新 Table / Sequence route 和独立 page 文件。

### M2.1：Table 基础（已完成）

- Contact Sheet Place on Table；
- Pointer Events 拖动、selection、marquee；
- pan / zoom、Grid / Row / Align；
- remove、undo / redo、save / reload；
- missing placeholder。

### M2.2：Table 关系与 Sequence 核心（已完成）

- Group / Link / Pile；
- 两张照片 Compare；
- Create/Open Sequence；
- Sequence 排序、Reading Unit、Segment、Overview、Read 和 Working Draft 自动保存。

### M3：Named Version / Save / Compare（计划）

- Versioning 深模块与完整快照；
- Save、Save As、Open as Draft；
- Version Compare 与冲突处理；
- Shuffle 临时 Alternative。

### M2.3：延伸表达（后续）

- Table snapshot；
- memo / paper note；
- 手工 relationship label；
- print-size simulation。

## 7. 原型参考的当前定位

`design-output/contact-sequence-react-ts-prototype/` 是一次性视觉研究，不是生产代码：

- Contact Sheet 的胶片语言、Pick / Reject / Pin 可继续参考。
- Sequence horizontal strip 可继续参考。
- 原 Pool tray 只作为历史构图参考，产品中不再保留。
- 原 Map / Whiteboard 画面只参考空间密度与 Pin 视觉，不保留“由 Map 改写 Sequence”的语义。

前端设计稿确认后，应以设计稿与两份正式基线文档为准，不从 throwaway prototype 复制状态模型或交互实现。

## 8. 实现检查清单

- Contact Sheet sort/filter 不改变 Worktable 或 Sequence。
- Place on Table 幂等，不出现重复 placement。
- Table move 不改变 `tableEntryOrder` 或 Sequence。
- 一次完整拖拽只产生一个 command、undo step 和 snapshot save。
- Remove from Table 不删除原片、Pick、Pin 或 Sequence 引用。
- Missing 文件保留 Table 与 Sequence 位置。
- Pin 跨重启持久化，并与 Compare slot 分离。
- Create Sequence 始终经过顺序确认条，不读取 x/y。
- Compare 不建立独立持久化集合。
- dnd-kit 不进入 Table 自由画布；当前 Sequence 也未引入新拖拽依赖。
