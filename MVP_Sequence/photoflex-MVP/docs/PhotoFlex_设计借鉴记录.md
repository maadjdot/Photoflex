# PhotoFlex 设计借鉴记录

> 调研记录日期：2026-08-31  
> 文档状态：working note  
> 适用范围：Contact Sheet / Table / Preview / Compare / Sequence / Read  
> 相关基线：[`PRD_Sequence.md`](./PRD_Sequence.md)、[`Worktable_Architecture_Interaction_Proposal.md`](./Worktable_Architecture_Interaction_Proposal.md)、[`Contact_Sheet_Sequence_React_TS_Resources.md`](./Contact_Sheet_Sequence_React_TS_Resources.md)

## 1. 文档目的

本文记录 PhotoFlex 从成熟摄影软件、开源画布和图片浏览项目中准备借鉴的产品与界面设计，并明确：

- 借鉴的是哪一条交互原则，而不是笼统模仿整个产品；
- 对应 PhotoFlex 的哪个页面或模式；
- 哪些内容不应引入，以免破坏 Contact Sheet / Table / Sequence 的边界；
- 哪些方案只需参考，哪些需要先做隔离 prototype，哪些可作为实现依赖评估。

本记录不自动把参考项目的功能变成 PhotoFlex 需求。正式实现仍以 PRD、确认后的前端设计稿和验收标准为准。

## 2. 采用等级

| 等级 | 含义 | 当前处理方式 |
|---|---|---|
| **A：产品原则借鉴** | 已确认与 PhotoFlex 核心工作流一致 | 写入设计稿或交互规范 |
| **B：视觉与交互参考** | 方向合适，但需按 PhotoFlex 状态模型重新设计 | 不复制源码，设计稿确认后实现 |
| **C：隔离 prototype** | 价值取决于坐标、性能或手势冲突验证 | 不接入生产代码，先做 spike |
| **D：实现依赖候选** | 职责窄、许可证清楚、与模块边界一致 | 实现阶段再锁定版本并评估 |
| **N：当前不采用** | 与产品边界冲突、过重或成熟度不足 | 仅保留调研结论 |

## 3. 总体结论

PhotoFlex 不应寻找一个“大而全”的开源项目替代自身产品模型。推荐组合是：

1. 从 darktable、digiKam 借鉴摄影师选片与比较工作流；
2. 从 Excalidraw 借鉴画布的 viewport、selection 和 gesture history 边界；
3. 从 Neiki Gallery 借鉴单图 Preview 的沉浸式界面；
4. 从 Book Builder 借鉴 Sequence Read 的书籍跨页阅读模型；
5. 从 Immich 借鉴大图库缩略图与虚拟化的性能经验；
6. Worktable 和 Compare 继续由 PhotoFlex 自己定义状态模型，不嵌入通用白板或完整画廊。

```text
Contact Sheet ──选片──> Table ──确认顺序──> Sequence
      │                  │                       │
   Preview            Compare                  Read
   单图检查           两图判断             单页 / 跨页阅读
```

## 4. Contact Sheet：darktable 与 digiKam

### 4.1 参考项目

- [darktable](https://github.com/darktable-org/darktable)
- [darktable Culling 文档](https://docs.darktable.org/usermanual/development/en/lighttable/lighttable-modes/culling/)
- [darktable Import & Review 工作流](https://docs.darktable.org/usermanual/development/en/overview/workflow/import-review/)
- [digiKam](https://github.com/KDE/digikam)
- [digiKam Light Table 操作文档](https://docs.digikam.org/zh_CN/light_table/lighttable_operation.html)

### 4.2 借鉴内容

采用等级：**A：产品原则借鉴**。

- 全量目录中快速 Rating、Pick、Reject，而不是先把照片加入临时集合才能判断；
- 键盘优先的连续选片节奏；
- 大图审阅时仍能前后移动，并保持当前筛选上下文；
- 按需显示 Overlay / Metadata，不让信息永久遮挡照片；
- Compare 默认同步缩放和平移，同时允许临时只操作某一张；
- 候选条或当前筛选结果作为导航上下文。

### 4.3 PhotoFlex 落点

- Contact Sheet 保持全量照片目录身份；
- Preview 中提供 Pick / Reject、Pin、Place on Table；
- Contact Sheet 的过滤、排序、selection 和 zoom 只属于当前 view；
- 上述操作不得修改已有 Sequence 顺序。

### 4.4 不借鉴

- 不复制 darktable 的 C/Gtk 或 digiKam 的 Qt/C++ 实现；
- 不把 Light Table 变成 PhotoFlex 的第三套持久集合；
- 不把评分、Pin、Table membership 合并成一个状态。

## 5. Table：Excalidraw 与窄交互库

### 5.1 参考项目

- [Excalidraw](https://github.com/excalidraw/excalidraw)
- [Selecto](https://github.com/daybrush/selecto)
- [react-zoom-pan-pinch](https://github.com/BetterTyped/react-zoom-pan-pinch)
- [use-gesture](https://github.com/pmndrs/use-gesture)

### 5.2 借鉴内容

采用等级：Excalidraw 为 **A/B**；其余为 **C：隔离 prototype**。

从 Excalidraw 借鉴：

- viewport 与场景对象分离；
- selection、hover、marquee、dragging、panning 是互斥或明确组合的交互状态；
- pointer gesture 期间只维护 transient preview；
- `pointerup` 后一次提交 command；
- 一次完整拖拽只形成一个 undo step；
- pan / zoom 不进入内容编排的 undo history。

Selecto 可用于验证 transformed viewport 下的 marquee；`react-zoom-pan-pinch` 和 `use-gesture` 只用于验证触摸、pinch 与卡片拖动的手势所有权。

### 5.3 PhotoFlex 落点

- Worktable 保存 world-space 的 x / y / z、membership、group 和 stack；
- Table Page 负责 Pointer Events、viewport 转换和 transient gesture；
- viewport 坐标转换集中处理；
- Table 移动不改变 `entryOrder`，更不改变 Sequence；
- 退出 Compare 后恢复 Table 的坐标和 selection。

### 5.4 不借鉴

- 不嵌入 Excalidraw 或 tldraw 作为 Table；
- 不引入画笔、箭头、任意图形和通用 Whiteboard 工具；
- 不让第三方手势库拥有 Worktable domain state；
- 不使用 Table 的 x/y 自动推导 Sequence 顺序。

## 6. Preview：Neiki Gallery

### 6.1 参考项目

- [neikiri/neiki-gallery](https://github.com/neikiri/neiki-gallery)

调研时仓库为 Vanilla JavaScript + CSS、MIT license、零依赖。项目规模和测试证据有限，因此不把它视为 PhotoFlex 的核心基础设施。

### 6.2 借鉴内容

采用等级：**B：视觉与交互参考**。

- 深色全屏 Lightbox，让照片占据最大视觉面积；
- 稀疏的顶部和底部控制区；
- 当前序号 / 总数；
- 左右键、Escape、Fullscreen；
- Fit、100% 和以鼠标位置为中心的缩放；
- 底部 thumbnail strip；
- 可展开的 Info / EXIF panel；
- 当前照片前后各预加载少量资源；
- 从缩略图到大图的轻量过渡可作为视觉连续性参考。

### 6.3 PhotoFlex 落点

Preview 是 Contact Sheet 或 Table 中的临时单图检查模式：

- 导航集合来自进入 Preview 时的当前上下文；
- 保留现有 `PhotoSource.preview()` lease / release；
- 照片切换时释放不再需要的大型 Blob URL；
- 操作栏提供 Pick / Reject、Pin、Place on Table；
- 缺失文件显示 placeholder，而不是从导航集合消失。

### 6.4 不借鉴

- Neiki 的 before/after comparison slider 不等于 PhotoFlex 的两图选片 Compare；
- 不采用其 Favorites 代替 Pin 或 Pick；
- 不采用它面向普通网页画廊的 virtual scroll 作为万级 Contact Sheet 方案；
- 不直接嵌入其 DOM 状态机，避免与 React、PhotoSource lease 和项目状态形成双重所有权；
- 自带 EXIF 解析不替代经过独立评估的 `exifr`。

## 7. Compare：digiKam 为主，Neiki 为辅

### 7.1 两种不同的 Compare

| 模式 | 目的 | 参考 |
|---|---|---|
| **Photo Compare** | 判断两张不同照片谁更合适 | digiKam Light Table |
| **Before / After** | 比较同一照片的两个处理版本 | Neiki comparison slider，可作为未来扩展 |

当前 MVP 只实现第一种。

### 7.2 借鉴内容

采用等级：**A：产品原则借鉴**。

- 左右两个固定槽位；
- 明确标出 active pane；
- 默认同步 pan / zoom；
- 可临时解除同步，单独检查一侧；
- 两侧分别显示必要 Metadata；
- 可在 Compare 中修改 Pick / Reject / Pin；
- 退出时保留进入前的 Table placement 和 selection。

### 7.3 不借鉴

- Compare 不创建独立持久照片集合；
- A / B slot 不持久化；
- Compare 中的左右位置不定义 Sequence 顺序；
- 不在 M2.2 引入修图版本、像素差异或滑杆叠图。

## 8. Sequence Read：Book Builder

### 8.1 参考项目

- [GhostInTheBus/book-builder](https://github.com/GhostInTheBus/book-builder)
- [SpreadView 源码](https://github.com/GhostInTheBus/book-builder/blob/main/app/src/designer/SpreadView.tsx)
- [BookDesigner 源码](https://github.com/GhostInTheBus/book-builder/blob/main/app/src/designer/BookDesigner.tsx)
- [Design Principles](https://github.com/GhostInTheBus/book-builder/blob/main/DESIGN_PRINCIPLES.md)

调研时该仓库只有一次提交，且根目录未发现明确的 LICENSE。它适合作为界面研究样例，不应复制源码、样式或设计资产。

### 8.2 借鉴内容

采用等级：**B：视觉与交互参考**。

- 深色、低干扰背景；
- 中央展示一个 book spread；
- Cover 作为单独页面；
- 后续照片按左右页配对；
- gutter 与内侧阴影表达实体书结构；
- 左右翻页按钮；
- 底部 scrubber；
- 同时显示左右页码、当前 spread 和总 spread；
- 翻页使用轻微 fade / scale，不做复杂仿真翻书动画；
- Single Page 与 Spread 两种阅读方式。

### 8.3 PhotoFlex 落点

Read 是 `Sequence.itemIds` 的无编辑投影：

```ts
type ReadPresentation = {
  mode: "single" | "spread";
  currentIndex: number;
  fit: "page" | "width";
};
```

- `ArrowLeft / ArrowRight`：前后阅读；
- `Home / End`：开头和结尾；
- `Esc`：退出并回到原 Sequence 位置；
- `F`：Fullscreen；
- 工具栏在静止时隐藏，输入后短暂出现；
- 预加载当前阅读单元前后各一个单元；
- 缺失照片保留原位置并显示 placeholder；
- MVP 默认完整显示原构图，使用 `object-fit: contain`。

### 8.4 不借鉴

- 不把 Book Builder 的左侧 Page Navigator、右侧 Layout Inspector 和底部 Library 放入 Read；
- Read 中不拖动排序、不更换 layout、不编辑 crop；
- 不引入页面模板、文字槽、PDF 导出和印刷尺寸；
- 不把 Sequence 扩展成摄影书排版器；
- `Single / Spread` 只改变展示，不产生第二套顺序。

复杂摄影书排版与生产级 PDF 仍属于 MVP 非目标。未来若单独建立 Book / Print 模块，应重新定义数据模型和验收标准。

## 9. 性能：Immich、TanStack Virtual、exifr 与 pica

### 9.1 参考项目

- [Immich](https://github.com/immich-app/immich)
- [Immich FAQ](https://github.com/immich-app/immich/blob/main/docs/docs/FAQ.mdx)
- [Immich 大型 timeline 高度问题](https://github.com/immich-app/immich/issues/30061)
- [Immich 虚拟时间线布局问题](https://github.com/immich-app/immich/issues/28861)
- [TanStack Virtual](https://github.com/TanStack/virtual)
- [exifr](https://github.com/MikeKovarik/exifr)
- [pica](https://github.com/nodeca/pica)

### 9.2 借鉴内容

采用等级：Immich 为 **A：架构经验**；其余为 **C/D**。

- 原图、Preview 和 Thumbnail 必须是不同资源层级；
- 大图库虚拟化不仅要限制 DOM 数量，也要限制单帧同步布局计算量；
- 避免构造超过浏览器极限的单个超高 scroll container；
- 元数据解析、排序、分桶和缩略图生成应可分块或移入 Worker；
- EXIF 只解析产品需要的字段；
- Object URL 必须集中管理和释放。

### 9.3 当前决策

- 保留现有 Contact Sheet virtualizer，不因存在成熟库而立即迁移；
- profiling 证明动态测量或维护成本成为瓶颈后，再评估 TanStack Virtual；
- `exifr` 是元数据解析候选；
- `pica` 只用于浏览缩略图候选，不用于色彩关键的最终导出；
- Preview / Read 预加载必须有明确上限。

## 10. 实现依赖候选清单

此表记录技术方向，不代表已经批准安装依赖。

| 候选 | 目标位置 | 当前结论 |
|---|---|---|
| [dnd-kit](https://github.com/clauderic/dnd-kit) | Sequence 横向排序 | **优先候选**；不用于 Table 自由拖动 |
| [exifr](https://github.com/MikeKovarik/exifr) | 导入与照片索引 | **优先候选**；按需字段、Worker 验证 |
| [Selecto](https://github.com/daybrush/selecto) | Table marquee | **先做 prototype**；验证 zoom / pan 后命中准确性 |
| [TanStack Virtual](https://github.com/TanStack/virtual) | Contact Sheet | **暂不迁移**；性能证据出现后再评估 |
| [pica](https://github.com/nodeca/pica) | Thumbnail pipeline | **按 profile 决定**；不处理最终输出 |
| [Yet Another React Lightbox](https://github.com/igordanchenko/yet-another-react-lightbox) | Preview / Read 底层 | **按需评估**；必须接入 PhotoSource lease |

## 11. 设计稿确认后的验证项

### 11.1 Table prototype

- 200 / 500 张照片；
- zoom 为 0.5 / 1 / 2；
- pan 后 marquee 命中准确；
- Shift / Ctrl/Cmd 增减选择；
- 卡片拖动、框选和画布平移不争抢 Pointer；
- 一次 gesture 只生成一个 command；
- viewport 外对象处理规则明确。

### 11.2 Compare prototype

- 两张不同宽高比照片并排；
- Fit、100%、同步 zoom / pan；
- 临时解除同步；
- 切换 Pick / Reject / Pin；
- 退出后恢复 Table 状态；
- Preview lease 无泄漏。

### 11.3 Read prototype

- Cover、偶数项、奇数项和 missing item；
- Single / Spread 切换不改变 Sequence；
- 横图、竖图和不同宽高比完整显示；
- 键盘导航、Fullscreen、scrubber；
- 当前单元前后有限预加载；
- 退出 Read 后恢复原 Sequence anchor。

## 12. 当前明确不采用

- Pool、Table、Whiteboard 三套并存；
- 通用 Whiteboard 作为摄影师 Table；
- tldraw / Excalidraw 整体嵌入；
- React Flow 作为 MVP Table；
- Table 几何位置自动决定 Sequence；
- Neiki before/after slider 代替两图选片 Compare；
- Book Builder 页面模板、PDF 输出或编辑器侧栏进入 Read；
- 没有明确许可证的仓库源码或设计资产复制；
- 没有 profiling 证据时重写为 Canvas / WebGL。

## 13. 决策摘要

| PhotoFlex 区域 | 主要参考 | 最终边界 |
|---|---|---|
| Contact Sheet | darktable、digiKam | 全量目录；过滤排序不改 Sequence |
| Table | Excalidraw 的交互边界 | 自有 Worktable domain；不做通用白板 |
| Preview | Neiki Gallery | 单图检查；继续使用 PhotoSource lease |
| Compare | digiKam Light Table | 两图临时工具；不创建持久集合 |
| Sequence | dnd-kit 的排序能力 | 只保存明确一维顺序 |
| Read | Book Builder SpreadView | Sequence 的无编辑 Single / Spread 投影 |
| 性能 | Immich、TanStack Virtual、exifr、pica | 先 profile，再引入窄依赖 |

