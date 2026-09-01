# PhotoFlex M2 — Sequence 页面交互说明

> 状态：交互设计稿 / 开发前确认版  
> 适用页面：`Sequence`、`Compare Sequence`、`Read`  
> 基准尺寸：1440 × 1024，需同时适配 1280 × 800、1920 × 1080 与 2560 × 1440  
> 参考画面：[Sequence Edit](../design-output/Sequence/Sequence.png) · [Compare Sequence](../design-output/Sequence/Compare_Sequence.png) · [Read Single](../design-output/Sequence/Read01.png) · [Read Spread](../design-output/Sequence/Read02.png)

## 1. 文档目的

Sequence 是摄影师把 Table 上的候选照片转化为精确阅读顺序，并通过章节、单双页节奏、版本与沉浸阅读反复检验叙事的编辑环境。

本页面负责：

- 精确调整一维照片顺序；
- 建立、命名和移动 Segment；
- 使用 `Single / Spread / Blank` 三种固定阅读模板；
- 生成非破坏性的 Shuffle Alternative；
- 比较两个命名版本，或比较 Current 与 Shuffle Alternative；
- 保存当前命名版本或另存为新版本；
- 在沉浸式 Read 中重放作者确定的节奏。

本页面不负责：

- 修改 Table placement、Group 或 Link；
- 根据 Contact Sheet 排序自动改变 Sequence；
- 自由摄影书排版、跨页大图或生产级 PDF；
- AI 自动排序或自动评价照片。

如果本文与 `PRD_Sequence.md` v0.2 的旧描述发生冲突，以本文在 2026-09-01 确认的 Sequence 交互决策为准，后续再同步 PRD。

## 2. 产品原则与不变量

1. Sequence Order 只能通过明确的 Sequence command 改变。
2. Table move、Group、Link、Contact Sheet 排序和筛选不能静默改变 Sequence。
3. Sequence 使用稳定 `SequenceItemId`；同一 `PhotoId` 可以通过不同 item 重复出现。
4. 一次完整拖拽只产生一个 command、一个 undo step 和一次 Working Draft 保存。
5. Shuffle 永远先产生临时 Alternative，不直接覆盖 Current。
6. Read 只重放当前 Working Draft，不修改顺序或阅读模板。
7. Missing 照片保留 item、Segment、Reading Unit 和版本中的位置。
8. 删除 Sequence item 只移除阅读引用，不删除 Table 照片、项目索引或原始文件。
9. Working Draft 自动恢复与命名版本保存是两个不同状态。
10. 所有核心功能在无网络、无 AI 时可用。

## 3. 术语

| 术语 | 定义 | 是否持久化 |
|---|---|:---:|
| Sequence Item | 一个照片引用或 Blank；使用稳定 item ID | 是 |
| Sequence Order | Sequence Items 的一维顺序 | 是 |
| Segment | 一段连续、可命名的 Sequence Items | 是 |
| Reading Unit | Single、Spread 或 Blank 阅读单元 | 是 |
| Working Draft | 自动恢复的当前编辑状态 | 是 |
| Named Version | 用户通过 Save / Save As 明确保存的版本 | 是 |
| Alternative | Shuffle 生成的临时候选方案 | 临时 |
| Current | Compare 左侧基准；Shuffle 时为生成 Alternative 前的不可变快照 | 临时或版本 |
| Selection | 当前编辑器中选中的 item IDs | 否 |
| Viewport | 中央编辑区缩放和滚动位置 | 可选恢复，不属于版本内容 |

## 4. 页面结构

### 4.1 一级导航

```text
Photoflex / Home / Project / Contact Sheet / Table / Sequence / Login
```

- Sequence 页面必须激活 `Sequence`，使用粗体和下划线。
- 现有设计图中 `Table` 仍保持激活属于设计稿错误，开发时必须修正。
- Read 进入沉浸模式后隐藏一级导航；退出后恢复 Sequence 页面。

### 4.2 Sequence 工具栏

统一工具栏：

```text
Sequence     Shuffle  Undo  Redo  Segment  Compare  Read  Save  Save As     − 75% +
```

| 操作 | 启用条件 | 行为 |
|---|---|---|
| Shuffle | 至少存在 2 个 photo items | 对选中 Segment 或整个 Sequence 生成 Alternative |
| Undo | Working Draft 有可撤销 command | 撤销最近一次 authoring command |
| Redo | 有已撤销 command | 重做最近一次撤销 |
| Segment | 选择连续的 1 个或多个 items，或选中完整 Segment | 创建 Segment；完整 Segment 选中时打开 Segment 操作 |
| Compare | 存在 Alternative，或至少存在两个命名版本 | 打开 Compare Sequence |
| Read | 至少存在一个 Reading Unit | 进入沉浸式阅读 |
| Save | 存在当前命名版本且 Working Draft 与其不同 | 覆盖当前命名版本 |
| Save As | Working Draft 非空 | 创建新命名版本并切换为当前版本 |
| `− / +` | 编辑器获得焦点 | 调整中央编辑区缩放，不触发浏览器缩放 |

- 不满足条件的操作显示 disabled。
- 工具栏操作不因横向空间不足而消失；窄屏可将 `Save As` 与版本相关状态收进明确的 Version menu，但不能改变语义。
- 当前缩放比例只影响编辑视图，不进入 Named Version。

### 4.3 中央节奏编辑区

中央区域承担主要编辑职责：

- 显示 Sequence Items 的真实顺序和原始宽高比；
- 显示 item number、选择状态、Segment 边界和 Reading Unit；
- 支持拖拽排序、Segment 整体移动和固定阅读模板编辑；
- 使用统一基线展示照片，使横向与纵向照片的节奏差异清楚；
- 超出可视区域时水平滚动，右侧不能直接裁掉最后一张照片；
- 提供 `Fit Sequence`，确保用户可以看到完整顺序概况。

中央区域不是 Table：不能自由保存 x/y，也不能用空间位置形成另一套顺序。

### 4.4 Sequence Order

底部固定顺序条只承担：

- 快速导航；
- 多选和范围选择；
- 精确的一维拖拽排序；
- 显示文件名、Sequence 编号、Missing 和 Reading Unit 状态；
- 收起或展开；
- 切换 Overview Grid。

底部拖拽与中央拖拽调用同一 Sequence command，不能形成两套顺序。

### 4.5 Overview Grid

点击 `Sequence Order` 标题旁的四格图标打开 Overview Grid：

- 显示全部 items 的等宽缩略图与 Sequence 编号；
- 保持原始宽高比，不裁切主体；
- 支持单选、多选和 Shift 连续选择；
- 单击 item 返回中央编辑区并滚动到对应位置；
- 可以对连续选择创建 Segment；
- 不允许在 Overview Grid 中拖拽排序，避免与底部顺序条重复；
- 再次点击四格图标或按 `Esc` 返回节奏编辑区。

## 5. 状态与视觉反馈

| 状态 | 中央编辑区 | Sequence Order |
|---|---|---|
| Default | 无外框 | 普通缩略图 |
| Hover | 细灰框或提高层级 | 轻微背景变化 |
| Selected | 2px 黑色外框 | 2px 黑色外框 |
| Multi-selected | 所有选择均显示黑框 | 对应缩略图同步显示 |
| Dragging | DragOverlay 跟随指针 | 原位置保留占位 |
| Drop target | 明确垂直插入线 | 明确垂直插入线 |
| In Segment | Segment 边界、名称和编号 | 小型 Segment 标记 |
| Missing | 固定尺寸 placeholder、文件名和 `MISSING` | placeholder，不移除编号 |
| Repeated photo | 正常照片并保留独立编号 | 各 item 独立显示 |

选择状态必须在中央与底部同步。当前选择、Hover 和 Drag Preview 不持久化。

## 6. 基础选择与排序

### 6.1 选择

- 单击 item：仅选择该 item。
- `Ctrl/Cmd + Click`：增加或移除非连续选择。
- `Shift + Click`：从最近 anchor 到当前 item 连续选择。
- 单击空白：清除选择。
- `Ctrl/Cmd + A`：选择所有 items。
- `Esc`：清除选择、关闭 Overview，或退出临时模式。

### 6.2 拖拽排序

- 拖动未选中的 item：选择该 item 并移动。
- 拖动已选中的 item：如果选择连续则整体移动；非连续选择保持内部相对顺序后一起移动。
- 拖动过程中显示原位置占位和目标插入线。
- pointermove 只更新预览；pointerup 后提交一次 move command。
- drop 取消、超出有效区域或按 `Esc` 时恢复原顺序，不写 Working Draft。
- 拖到编辑区左右边缘时自动水平滚动。

### 6.3 删除与重复

- `Delete / Backspace` 从 Sequence 移除选中 items，不删除照片文件或 Table placement。
- 同一 `PhotoId` 可以再次加入 Sequence，但必须创建新的 `SequenceItemId`。
- 删除一个 repeated item 不能影响其他引用同一照片的 item。
- 删除操作是一个 command，可 Undo。

## 7. Reading Unit 与固定模板

MVP 只支持：

```text
Single / Spread / Blank
```

### 7.1 Single

- 引用一个 photo item。
- Read 时显示一个居中的白色页面和一张完整适应页面安全区的照片。
- 图片保持原始宽高比，不裁切，不允许页面内自由移动。

### 7.2 Spread

- 引用两个相邻 photo items。
- Read 时显示左、右两个页面，每页一张照片。
- 两张照片均完整适应各自页面安全区。
- 不支持跨页大图、左大右小或右大左小。

### 7.3 Blank

- Blank 本身是独立 Sequence Item 和 Reading Unit。
- Read 时显示一张没有照片的白色页面。
- Blank 参与普通移动、删除、Segment membership、版本保存和 diff。

### 7.4 模板操作入口

选中 item 后，在选区附近显示轻量 Context Bar：

- 选中一个 photo item：`Single`、`Insert Blank Before`、`Insert Blank After`。
- 选中两个相邻 photo items：`Create Spread`。
- 选中一个 Spread：`Split to Singles`。
- 选中 Blank：`Remove Blank`。

Context Bar 不是永久工具栏；选择变化或按 `Esc` 后消失。

### 7.5 删除后的模板修复

- 删除 Single 中的 photo：删除整个 Single unit。
- 删除 Spread 中一张 photo：剩余照片自动转为 Single。
- 删除 Blank：删除对应 Blank unit。
- 跨 Reading Unit 拖动 photo 后，受影响的 Spread 自动拆为 Singles；用户可重新选择两张建立 Spread。

以上自动修复与原删除或 move command 处于同一个 undo step。

## 8. Segment

### 8.1 语义

Segment 是 Sequence 中连续、可命名的章节范围。它用于表达叙事章节，不等同于 Table Group，也不包含自由空间坐标。

规则：

- Segment 成员必须连续；
- 一个 item 最多属于一个 Segment；
- Segment 不能嵌套；
- Segment 边界不能切断一个 Spread；
- Blank 可以属于 Segment；
- Sequence 可以包含不属于任何 Segment 的 items。

### 8.2 创建

1. 用户连续选择一个或多个完整 Reading Units。
2. 点击 `Segment`。
3. 输入名称；默认名称为 `Segment 01`、`Segment 02`。
4. 保存后显示 Segment 外框、标题和 item 数量。
5. 新 Segment 保持选中。

选择只覆盖 Spread 中一张照片时，`Segment` disabled，并提示选择完整 Spread。

### 8.3 操作

- 点击 Segment 标题：选择整个 Segment。
- 双击标题：重命名；`Enter` 保存，`Esc` 取消。
- 拖动标题：整体移动 Segment；成员内部顺序不变。
- 点击折叠箭头：中央只显示标题和 item 数量；底部缩略图不消失。
- Segment 内仍可单独移动 items。
- item 拖出边界后离开 Segment；拖入边界后加入 Segment。
- 完整 Segment 被选中时点击 Segment menu 可执行 `Rename / Ungroup Segment`。
- 解除 Segment 后保留成员当时顺序与 Reading Units。

### 8.4 边界更新

- Segment 中最后一个 item 删除后，自动删除空 Segment。
- 移动成员后 Segment 始终保持连续；如果一次移动会制造两个不连续范围，则移动 item 离开 Segment，而不是拆成两个同名 Segment。
- Segment 整体移动、创建、重命名和解除均可 Undo / Redo。

## 9. Shuffle

### 9.1 作用范围

- 如果完整 Segment 处于选中状态，只 Shuffle 该 Segment。
- 否则 Shuffle 整个 Sequence。
- 不对任意非连续多选执行局部 Shuffle。
- 少于两个 photo items 时 disabled。

### 9.2 生成 Alternative

1. 点击 `Shuffle`。
2. 系统捕获当前 Working Draft 为不可变 Current baseline。
3. 保留所有 photo items，包括 Missing 和 repeated photo items。
4. 从 Shuffle 范围中移除 Blank。
5. 随机重排范围内的 photo items。
6. 重新自动分页：第一张为 Single；之后依序每两张组成 Spread；若尾部剩一张则为 Single。
7. 生成一个临时 Alternative，不写入 Named Version。
8. 自动打开 Compare Sequence。

Segment Shuffle 时不影响其他 Segment。全序列 Shuffle 时照片可以跨越原 Segment 重分配，但保留 Segment 名称、边界顺序和各 Segment 的 photo item 数量；原 Blank 不计入数量。

### 9.3 再次 Shuffle

- Compare 中提供 `Try Again`，使用同一 Current baseline 生成新的 Alternative。
- 新 Alternative 替换旧 Alternative；MVP 不保留临时 Alternative 历史。
- 关闭 Compare 且不 Apply 时，Current Working Draft 完全不变。

## 10. Compare Sequence

### 10.1 入口

- 点击工具栏 `Compare`；
- Shuffle 完成后自动进入；
- Compare disabled 条件：没有 Alternative，且少于两个命名版本。

### 10.2 Compare Source

显式 Compare 允许选择：

- 两个命名版本；
- Current baseline 与当前 Alternative。

普通未保存 Working Draft 不作为任意版本 Compare Source；Shuffle 会为它创建专用 Current baseline。

### 10.3 界面

使用两条水平对齐轨道，不使用无标签的上下散排：

```text
CURRENT · Draft 02
01  02  03  04  05

ALTERNATIVE · Shuffle 01
03  01  05  02  04
```

- 两条轨道显示名称、item 数量和保存时间或 Alternative 状态。
- 每个 item 显示轨道内编号和文件名。
- 相同 item 使用稳定 ID 对齐；repeated photo 按 item ID 而不是 photo ID 对齐。
- 差异类型：`added / removed / moved / layout changed`。
- Missing item 仍参与对齐和差异计算。
- 同一 item 在两条轨道间可使用弱连接线辅助追踪；连接线不能遮挡照片。

### 10.4 操作

| 操作 | 行为 |
|---|---|
| Keep Current | 关闭 Compare，不改变 Working Draft |
| Apply Alternative / Apply Right | 将右侧完整方案替换为 Working Draft |
| Try Again | 仅 Shuffle Compare 可用；重新生成 Alternative |
| Swap Sides | 仅改变观看方向，不修改来源 |
| Read Current / Read Alternative | 临时阅读对应轨道，不保存 |

MVP 不支持逐项合并。Apply 是一个原子 command 和一个 undo step；Apply 后仍需用户点击 Save 或 Save As 写入命名版本。

比较两个命名版本时，`Apply Right` 把右侧版本内容打开为 Working Draft，不修改该命名版本本身。

## 11. Working Draft、Save 与版本

### 11.1 Working Draft 自动恢复

以下成功 command 后自动保存 Working Draft：

- add / move / remove；
- Blank 与 Reading Unit 变更；
- Segment 创建、移动、重命名、成员变化和解除；
- Apply Alternative。

自动保存只保证崩溃或重启后恢复编辑现场，不等于更新 Named Version。

### 11.2 状态文案

工具栏显示两层状态：

| 状态 | 含义 |
|---|---|
| `Draft saving…` | Working Draft 正在持久化 |
| `Draft recovered` | 重启后恢复未保存到版本的 Draft |
| `Unsaved to version` | Working Draft 与当前 Named Version 不同 |
| `Saved to <version name>` | Working Draft 与当前 Named Version 一致 |
| `Save failed` | Draft 或版本持久化失败，保留当前内存状态并允许重试 |

不要只显示含义不明的 `Saved`。

### 11.3 Save

- 当前存在 Named Version 时，点击 `Save` 显式覆盖该版本内容。
- Save 成功后保留相同 VersionId 和名称，更新内容与保存时间。
- 不保留覆盖前的隐藏版本历史。
- Save 失败时 Named Version 保持旧内容，Working Draft 保持可恢复状态。
- 当前没有 Named Version 时，`Save` disabled，引导使用 `Save As`。

### 11.4 Save As

1. 打开轻量 Dialog。
2. `Version name` 必填，项目内不能与现有版本重名。
3. `Memo` 可选。
4. 保存后创建新 VersionId，并将其设为当前 Named Version。
5. Working Draft 与新版本一致，状态变为 `Saved to <name>`。

关闭或刷新页面不能自动覆盖 Named Version。

## 12. Undo / Redo

进入 authoring history：

- add / move / remove；
- Blank 插入和删除；
- Single / Spread 切换；
- Segment 变更；
- Apply Alternative；
- 打开命名版本为 Working Draft。

不进入 authoring history：

- Selection / Hover；
- zoom、滚动和 Fit Sequence；
- Overview Grid 开关；
- Segment 折叠状态；
- Compare source、Swap Sides；
- Read 打开、翻页、背景选择；
- Save / Save As 本身。

Undo / Redo 改变 Working Draft 后，需要重新自动保存 Draft，但不会自动更新 Named Version。

## 13. Read

### 13.1 进入与退出

- 点击工具栏 `Read` 从第一个 Reading Unit 进入。
- 双击中央 item 或 Reading Unit，从对应位置进入。
- Read 使用沉浸全屏，隐藏一级导航、工具栏和 Sequence Order。
- 鼠标移动或键盘输入时显示控件；无操作约 2 秒后淡出。
- `Esc` 或 Close 退出，并恢复 Sequence 的缩放、滚动和选择状态。

### 13.2 导航

- `← / →`：上一/下一 Reading Unit。
- 点击画面左/右区域：上一/下一。
- `Home / End`：第一/最后 Reading Unit。
- 页面底部显示 `03–04 / 18` 等页码信息。
- 到达首尾时不循环，方向控件 disabled。

### 13.3 呈现

- Single：一个居中的白色页面和一张完整适应的照片。
- Spread：左右两个白色页面，每页一张完整适应的照片；中间保留明确 gutter。
- Blank：显示单个空白白页。
- 默认背景为深灰；用户可切换深色或白色阅读背景。
- `Fit` 始终完整显示页面；MVP 不提供页面内自由移动。
- 横向、纵向、正方形和 EXIF 旋转照片都必须完整显示。

### 13.4 Read 中允许的状态修改

- 可以 Pin / Unpin 当前 photo item 对应的项目照片。
- Pin 是 project-wide state，不属于 Sequence Version。
- Read 不允许重排、删除、创建 Segment 或修改模板。
- 临时 Read Alternative 时，退出返回 Compare，不改变 Working Draft。

## 14. Zoom、滚动与响应式

- 工具栏 `− / +` 与 `Ctrl/Cmd + 滚轮` 只缩放中央编辑区，不触发浏览器缩放。
- 普通滚轮用于页面或水平容器滚动，不改变缩放。
- 建议缩放档位：25%、50%、75%、100%、125%、150%、200%。
- `Fit Sequence` 根据当前 Segment 或完整 Sequence 自适应。
- 底部 Sequence Order 保持固定 UI 尺寸，不随中央缩放。
- 1280px 宽度下工具栏仍可完整操作；版本操作可收进 menu，但 Compare、Read、Undo、Redo 不应隐藏。
- 1920px 以上控制照片最大显示尺寸和间距，避免 Sequence 被无限拉散。

## 15. 键盘快捷键

```text
← / →                 移动选择；Read 中翻页
Shift + Click          连续范围选择
Ctrl/Cmd + Click       非连续选择
Ctrl/Cmd + A           全选 items
Delete / Backspace     从 Sequence 移除选中 items
Ctrl/Cmd + Z           Undo
Ctrl/Cmd + Shift + Z   Redo
Ctrl/Cmd + S           Save 当前版本
Ctrl/Cmd + Shift + S   Save As
R                      Read
C                      Compare
O                      Overview Grid
Esc                    清除选择 / 关闭临时界面 / 退出 Read
+ / −                  调整编辑区 zoom
```

输入框、版本名称、Segment 名称或任何 `[contenteditable]` 获得焦点时，不触发页面快捷键。

## 16. 建议的数据契约扩展

本节记录实现所需方向，不在本轮修改 TypeScript。

```ts
type SequenceItem =
  | {
      readonly id: SequenceItemId;
      readonly kind: "photo";
      readonly photoId: PhotoId;
    }
  | {
      readonly id: SequenceItemId;
      readonly kind: "blank";
    };

interface SequenceSegment {
  readonly id: SequenceSegmentId;
  readonly name: string;
  readonly itemIds: readonly SequenceItemId[];
}

type ReadingUnit =
  | { readonly id: ReadingUnitId; readonly kind: "single"; readonly itemId: SequenceItemId }
  | {
      readonly id: ReadingUnitId;
      readonly kind: "spread";
      readonly leftItemId: SequenceItemId;
      readonly rightItemId: SequenceItemId;
    }
  | { readonly id: ReadingUnitId; readonly kind: "blank"; readonly itemId: SequenceItemId };

interface SequenceAlternative {
  readonly id: SequenceAlternativeId;
  readonly source: "shuffle-segment" | "shuffle-sequence";
  readonly baselineItems: readonly SequenceItem[];
  readonly items: readonly SequenceItem[];
  readonly segments: readonly SequenceSegment[];
  readonly readingUnits: readonly ReadingUnit[];
}
```

`SequenceDraft` 与 `SequenceVersion` 后续需要同时包含：

- ordered items；
- segments；
- readingUnits；
- 当前或来源 VersionId；
- Working Draft revision / updatedAt。

Versioning 后续需要支持：

- 覆盖当前命名版本；
- Save As 新命名版本；
- Version diff 的 `layoutChanged`；
- 把完整右侧版本或 Alternative 打开为 Working Draft。

建议新增的 command 类型：

- add / move / remove；
- addBlank / removeBlank；
- createSpread / splitSpread；
- createSegment / moveSegment / renameSegment / removeSegment；
- applyAlternative。

## 17. 持久化与失败恢复

- Working Draft 每次成功 command 后保存快照；拖拽预览期间不写 IndexedDB。
- Named Version 只在 Save / Save As 后改变。
- Alternative 保存在当前会话；关闭项目后可以丢弃，不参与迁移。
- 页面刷新时优先恢复 Working Draft，并显示它是否与当前 Named Version 不同。
- Source 权限丢失或索引缺失不能删除 Sequence item。
- Save 失败后不得把 UI 标成已保存；保留内存状态和上一次成功 Draft。
- stale revision command 必须失败并重新载入最新 Draft，不能覆盖较新状态。
- 达到现有 MVP item limit 时，add、Blank 插入和 Apply Alternative 必须失败并显示明确提示。

## 18. 动画与反馈

- 拖拽照片：跟手移动，drop 后 120～180ms settle。
- 插入线：在有效目标出现，无效区域隐藏。
- Segment 创建或移动：成员和边界一起移动，180～240ms ease-out。
- Shuffle：只显示短暂计算状态，完成后直接进入 Compare；不在 Current 上播放随机跳动。
- Apply Alternative：Compare 关闭后中央编辑区以 180～240ms 过渡到新顺序。
- Draft save：工具栏状态变化，不使用阻断式弹窗。
- Save / Save As 失败：显示可关闭 inline notice 和 Retry。
- Read 控件：约 150ms 淡入淡出，不能遮挡照片主体。

## 19. 无障碍

- 每个 Sequence item、Segment 标题、Reading Unit、底部缩略图和 Compare item 都可获得键盘焦点。
- 使用 `aria-selected` 表示 item 选择；Segment 折叠使用 `aria-expanded`。
- Overview Grid 按 grid / gridcell 语义实现。
- Compare 需要读出版本名称、轨道位置和差异类型。
- Read 的上一页、下一页、退出和背景选择提供可访问名称。
- Selected、Missing、Moved、Added、Removed 和 Layout Changed 不能只依赖颜色。
- 动画遵守 `prefers-reduced-motion`。

## 20. MVP 验收场景

### 场景 A：精确排序与撤销

1. 在中央或底部拖动 3 个连续 items。
2. 拖动期间只显示预览。
3. Drop 后只生成一次 move command、一次 Draft save 和一个 undo step。
4. Undo 恢复完整原顺序，Redo 恢复移动后顺序。
5. Table placement 保持不变。

### 场景 B：Segment

1. 连续选择 5 个完整 Reading Units。
2. 创建并命名 Segment。
3. 折叠后中央隐藏成员，但底部缩略图仍存在。
4. 拖动 Segment 标题整体移动，内部顺序不变。
5. 拖出一个 item 后 Segment 仍保持连续。
6. Undo 恢复移动或成员变化。

### 场景 C：Shuffle 与 Compare

1. 选择一个 Segment 并点击 Shuffle。
2. Current Working Draft 保持不变。
3. Alternative 移除范围内 Blank、随机重排照片并重新组成 Single / Spread。
4. Compare 标记 moved 和 layout changed。
5. Keep Current 后 Draft 不变。
6. 再次 Shuffle 并 Apply Alternative，完整结果作为一个 command 进入 Draft。
7. Undo 恢复 Apply 前状态。

### 场景 D：命名版本

1. Working Draft 自动恢复成功，但显示 `Unsaved to version`。
2. Save 覆盖当前版本后显示 `Saved to <name>`。
3. 修改 Draft 后 Save As 创建新的 VersionId 和名称。
4. 两个版本可以进入 Compare。
5. Save 失败时旧版本未改变，Draft 仍可恢复。

### 场景 E：Read

1. Sequence 包含 Single、Spread 和 Blank。
2. Read 全屏隐藏导航和编辑工具。
3. 方向键依次重放三种 Reading Unit。
4. 横向、纵向和 EXIF 旋转照片均完整显示。
5. Blank 显示空白页。
6. `Esc` 返回原编辑位置，Sequence 内容不变。

### 场景 F：Missing 与重复照片

1. 同一 PhotoId 以两个不同 item IDs 出现在 Sequence。
2. 删除其中一个不影响另一个。
3. 照片文件 Missing 后两个引用各自保留编号和位置。
4. Missing item 仍参与 Segment、Shuffle、Compare 和版本保存。
5. 重新授权后原位置恢复照片预览。

### 场景 G：Overview Grid

1. 点击四格图标进入 Overview。
2. 选择 item 并返回中央，编辑器滚动到正确位置。
3. Shift 多选可用于创建 Segment。
4. Overview 内无法拖拽改变顺序。
5. 打开和关闭 Overview 不生成 command，也不改变 Draft。

## 21. 本轮不做

- memo / text page；
- 页面内自由拖动或任意缩放；
- 跨页大图和复杂不对称模板；
- Compare 逐项合并；
- 临时 Alternative 历史；
- AI 自动排序或艺术判断；
- 多人实时协作；
- 生产级摄影书排版和 PDF 输出；
- 根据 Table x/y 自动持续同步 Sequence；
- 保存命名版本覆盖前的隐藏历史。

