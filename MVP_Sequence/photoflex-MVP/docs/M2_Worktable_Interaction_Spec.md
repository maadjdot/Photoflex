# PhotoFlex M2 — Worktable 页面交互说明

> 状态：交互设计稿 / 开发前确认版  
> 适用页面：`Table`  
> 基准尺寸：1440 × 1024，需同时适配 1280 × 800、1920 × 1080 与 2560 × 1440  
> 参考画面：[Group](../design-output/worktable-group-link-prototype/01-worktable-group.png) · [Link](../design-output/worktable-group-link-prototype/02-worktable-link.png)

## 1. 页面目的

Worktable 是摄影师把候选照片像实体照片一样铺在桌面上，进行空间整理、分组、建立关系、并置比较和初步排序的核心工作区。

页面职责：

- 自由摆放项目照片；
- 将照片组成 Group；
- 为照片建立 Link；
- 将两张照片 Juxtapose 并置比较；
- 将照片加入底部 Sequence Order；
- 在底部微调 Sequence 顺序。

Worktable 不负责全量照片浏览。全量浏览、过滤和 Pick / Reject 仍由 Contact Sheet 完成。

## 2. 核心概念

| 概念 | 含义 | 是否改变 Sequence |
|---|---|---|
| Table position | 照片在桌面上的 `x / y` 位置 | 否 |
| Group | 共同外框包围、可以整体移动的强关系 | 否 |
| Link | 照片之间有意义的弱关系 | 否 |
| Juxtapose | 临时将两张照片放大并排比较 | 否 |
| Sequence Order | 底部缩略图代表的阅读顺序 | 是 |
| Pin | 标记需要持续关注的照片 | 否 |

必须遵守以下不变量：

1. 移动桌面照片不能自动改变 Sequence Order。
2. Group 和 Link 只改变桌面布局及关系数据。
3. 从 Table 移除照片不能删除原始文件，也不能自动从 Sequence 移除。
4. 只有底部 Sequence Order 的拖拽，或明确的 Sequence 操作，才能改变阅读顺序。

## 3. 页面结构

### 3.1 主导航

顶部导航包含：

```text
Photoflex / Home / Project / Contact Sheet / Table / Sequence / Login
```

- 当前页面 `Table` 使用粗体和下划线表示激活。
- 点击其他导航项切换页面。
- 离开 Table 前，已经完成的桌面命令必须先写入本地持久化；选择框、Hover 和当前工具模式不需要保存。

### 3.2 Table 工具栏

工具栏包含：

```text
TABLE                         Sequence  Group  Link  Juxtapose   − 75% +
```

| 工具 | 启用条件 | 行为 |
|---|---|---|
| Sequence | 至少选择 1 张照片 | 将未进入 Sequence 的照片追加到底部 |
| Group | 选择至少 2 张未成组照片，或选中完整 Group | 创建 Group；选中完整 Group 时切换为解除 Group |
| Link | 选择 2～6 张照片 | 创建 Link，并把成员移动到相邻位置 |
| Juxtapose | 恰好选择 2 张照片 | 打开并置比较层 |
| `− / +` | Table 获得焦点 | 缩小或放大桌面 |

- 不满足条件的工具显示禁用状态，点击无反应。
- 当前操作模式使用下划线和粗体表示，不只依赖颜色。
- 执行一次性动作后回到默认选择模式；Group、Link 不是持续绘制工具。

### 3.3 桌面

- 桌面使用浅灰背景，照片保持原始宽高比。
- 桌面支持平移和缩放，但照片坐标保存为桌面坐标，不保存为屏幕像素位置。
- 照片允许横向和纵向尺寸混排。
- 默认不随机旋转照片，避免影响构图判断。
- Group 框、Link 线和选择边框位于照片上层，但不能遮挡照片主体。

### 3.4 Sequence Order

底部固定显示当前 Sequence：

- 标题显示 `Sequence Order`、照片数量和 `drag to reorder` 提示；
- 缩略图横向排列；
- 中间箭头用于收起或展开；
- 右侧箭头进入完整 Sequence 页面；
- 底部区域不随 Table 缩放；
- 收起后只保留标题栏和展开箭头。

## 4. 照片状态

| 状态 | 视觉表现 | 说明 |
|---|---|---|
| Default | 无外框 | 照片在 Table 上，未选中 |
| Hover | 细灰边框或轻微提高层级 | 表示可以选择或拖动 |
| Selected | 2px 黑色外框 | 当前操作对象 |
| Multi-selected | 多张照片均显示黑框 | 可以一起移动或执行工具操作 |
| Pinned | 右上角小圆点保持可见 | 与 Selected、Group、Link 独立 |
| In Sequence | 可显示小型 `S01` 编号 | 编号来自底部顺序；移动桌面不改变编号 |
| Missing | 保留原尺寸占位框和文件名 | 不能因文件缺失改变桌面或 Sequence 位置 |

Group 框和 Link 线不能代替 Selected 状态：用户仍需知道当前将被操作的是照片、Group 还是 Link。

## 5. 基础选择与桌面操作

### 5.1 选择

- 单击照片：仅选择该照片。
- `Shift + Click`：在当前选择中增加或移除照片。
- 在桌面空白处拖动：框选照片。
- 单击空白区域：清除选择。
- `Esc`：取消当前选择或退出 Juxtapose。
- `Ctrl/Cmd + A`：选择当前 Table 上的全部照片。

框选只选择与框选区域相交超过约 30% 的照片，避免轻微擦边导致误选。

### 5.2 移动

- 拖动未选中的照片：先选择该照片，再移动。
- 拖动已选中的照片：所有已选择照片临时一起移动，但不会自动形成 Group。
- 拖动结束时才提交一次位置命令；拖动过程不逐帧写 IndexedDB。
- 一次完整拖动只产生一个 undo step。
- 拖到视口边缘时，桌面缓慢自动平移。

### 5.3 平移和缩放

- `Space + Drag`：平移桌面。
- 触控板双指：平移。
- `Ctrl/Cmd + 滚轮`：以光标位置为中心缩放 Table，不触发浏览器页面缩放。
- 工具栏 `− / +`：以视口中心缩放。
- 建议缩放档位：25%、50%、75%、100%、125%、150%、200%。
- 普通滚轮不缩放 Table；存在垂直空间时用于滚动。

缩放和平移属于 View State，不进入 undo / redo；可以按项目记住最后视角。

## 6. Group 交互

### 6.1 Group 的语义

Group 表示“这些照片属于同一个工作集合”。它是强关系：照片有共同外框，拖动外框时所有成员一起移动。

一张照片在 MVP 中最多属于一个 Group。Group 不能嵌套 Group。

### 6.2 创建 Group

前置条件：选择 2 张或更多未成组照片。

执行流程：

1. 用户选择照片。
2. 点击工具栏 `Group`。
3. 系统保留照片当前大致的相对顺序，把照片紧凑排列到相邻位置。
4. 推荐排列规则：优先横向填充，空间不足时换行；照片间距 16px，外框内边距 22～28px。
5. 位置变化使用约 180～240ms 动画，让用户看见照片移动到了哪里。
6. 动画结束后显示共同外框。
7. Group 自动获得名称，例如 `GROUP 01`，并显示照片数量。
8. 新 Group 处于 Selected 状态。

Group 创建前后的桌面空间需要保持稳定：以最后选中的照片作为 anchor，尽量让该照片不移动，其余成员向它靠拢。如果右侧空间不足，则向左或下方排列。

### 6.3 操作 Group

- 单击外框空白处或标签：选择整个 Group。
- 拖动外框或 Group 标签：整体移动，所有成员保持相对位置。
- 拖动 Group 内单张照片：只改变该照片在 Group 内的位置，外框自动调整尺寸。
- 双击 Group 标签：编辑名称；按 `Enter` 保存，`Esc` 取消。
- 完整 Group 被选中时再次点击 `Group`：解除 Group。
- `Delete / Backspace` 删除 Group 关系，但不从 Table 移除照片；如果当前选中的是照片，则执行“Remove from Table”。

为了避免误操作，解除 Group 后保留成员当时的位置，不把它们恢复到成组前的位置。用户可以使用 Undo 恢复成组前状态。

### 6.4 Group 与其他关系

- Group 内的照片可以继续建立 Link。
- Group 整体移动时，成员照片的 Link 端点同步移动。
- 已经属于 Group 的单张照片不能直接加入另一个 Group；必须先解除原 Group 或将其移出原 Group。
- 创建 Sequence 时，可以选择整个 Group；加入顺序按 Group 内从左到右、从上到下计算，并在确认前显示编号预览。

## 7. Link 交互

### 7.1 Link 的语义

Link 表示照片之间存在某种观看关系，例如：

```text
Echo / Light / Gesture / Place / Memory / Contrast / Rhythm
```

Link 是弱关系：创建时照片自动靠近；创建后照片仍可以独立移动，连线持续存在并更新位置。Link 不产生共同外框，也不要求成员永久保持紧贴。

同一张照片可以属于多个 Link。

### 7.2 创建 Link

前置条件：选择 2～6 张照片。

执行流程：

1. 用户选择照片。
2. 点击工具栏 `Link`。
3. 系统以最后选中的照片作为 anchor，保持 anchor 位置。
4. 其他成员移动到 anchor 邻近区域，默认水平排列，间距 24～30px。
5. 空间不足时允许换行，但同一 Link 的成员应保持在同一视觉区域内。
6. 位置变化使用约 180～240ms 动画。
7. 两张照片时直接连接；三张以上时按重新排列后的空间顺序连接相邻成员，形成链条。
8. 端点显示空心圆节点，照片之间显示 1～1.5px 黑色连线。
9. 自动生成 `LINK 01`，可选择或输入关系标签。

Link 只负责建立关系，不将照片加入 Sequence。

### 7.3 操作 Link

- 单击连线或 Link 标签：选择 Link。
- 双击 Link 标签：修改关系名称。
- 拖动单张照片：照片独立移动，Link 线实时跟随；关系不会自动删除。
- 拖动 Link 标签：整体移动 Link 的全部成员，同时保留相对位置。
- `Delete / Backspace`：当前选中 Link 时只删除关系和连线，不删除照片。
- Link 成员距离过远时，连线仍保留；可以提供 `Bring linked photos together` 重新靠近的操作。

### 7.4 Link 与 Group

- 同一 Group 内可以建立 Link。
- Group 外框不应切断或遮挡 Link 线。
- Link 可以跨越不同 Group，但 MVP 的 Link 端点只能是照片，不能直接连接两个 Group 框。
- 解除 Group 不会删除成员之间的 Link。

## 8. Group 与 Link 的区别

| 行为 | Group | Link |
|---|---|---|
| 创建时自动靠近 | 是 | 是 |
| 共同外框 | 是 | 否 |
| 关系线 | 否 | 是 |
| 拖动单张照片 | 在 Group 内重新排布 | 可以自由离开，连线跟随 |
| 拖动标签或框 | 整体移动 | 整体移动 |
| 一张照片可加入多个 | 否 | 是 |
| 主要用途 | 工作集合、章节、批次 | 视觉回声、对比、记忆关系 |

## 9. Juxtapose 交互

前置条件：恰好选择 2 张照片。

1. 点击 `Juxtapose`。
2. 打开覆盖 Table 的并置比较层。
3. 两张照片以 A / B 并排显示，默认完整适应可用区域。
4. 支持交换左右、同步缩放、单独缩放、Pin、加入 Sequence。
5. `Esc` 或 Close 返回 Table。
6. 返回后恢复原来的 Table 位置、缩放、选择和 Sequence Order。

Juxtapose 是临时观看状态，不建立 Link。用户若希望保存两张照片的关系，需要返回 Table 后执行 Link。

## 10. Sequence 交互

### 10.1 加入 Sequence

1. 用户选择一张或多张照片或完整 Group。
2. 点击工具栏 `Sequence`。
3. 未在 Sequence 中的照片追加到底部末尾。
4. 已经存在的照片不重复加入；对应缩略图短暂高亮并滚动到可见区域。
5. Table 照片显示 `S01 / S02...` 编号，但位置不改变。

如果一次加入整个 Group，默认顺序为从左到右、从上到下；加入前应显示编号预览，用户确认后才提交。

### 10.2 调整 Sequence Order

- 拖动底部缩略图重排。
- 拖动过程中显示明确插入线。
- 一次 drop 生成一个 Sequence move command 和一个 undo step。
- 拖动取消时不改变顺序，不写入持久化。
- 桌面照片移动、Group、Link、Juxtapose 都不能改变底部顺序。

### 10.3 收起和进入 Sequence

- 点击中间箭头收起或展开底部 Sequence Order。
- 收起状态仍显示当前照片数量。
- 点击右侧箭头进入完整 Sequence 页面。
- 返回 Table 时恢复 Table 视角和选择；Sequence Order 使用最新保存状态。

## 11. Undo / Redo

以下操作进入 Worktable undo / redo：

- 照片移动；
- 多选移动；
- 创建、移动、重排、重命名或解除 Group；
- 创建、移动、重命名或删除 Link；
- 从 Table 加入或移除照片；
- 加入 Sequence 和 Sequence 重排。

以下操作不进入 undo / redo：

- Hover；
- 选择与取消选择；
- 工具栏启用状态；
- 桌面缩放和平移；
- Sequence Order 收起或展开；
- 打开或关闭 Juxtapose。

快捷键：

```text
Ctrl/Cmd + Z         Undo
Ctrl/Cmd + Shift + Z Redo
Esc                  清除选择 / 退出临时模式
G                    Group
L                    Link
J                    Juxtapose
S                    Add to Sequence
Delete / Backspace   根据当前选择删除关系或从 Table 移除
```

输入框或可编辑标签获得焦点时，不触发以上页面快捷键。

## 12. 持久化边界

需要按项目持久化：

- 哪些照片在 Table 上；
- 每张照片的 `x / y / zIndex / displaySize`；
- Group ID、名称、成员和成员相对位置；
- Link ID、标签、成员及连接顺序；
- Pin 状态；
- Sequence Order；
- 最后的 Table zoom / pan（可选，但建议保存）。

仅保留在当前会话：

- Hover；
- 当前选择；
- 框选区域；
- 当前工具栏模式；
- Juxtapose 是否打开。

位置命令在 pointer up 后提交；持久化可以短暂 debounce，但 UI 状态必须立即更新。

## 13. 异常与边界情况

- 文件 Missing：保留照片占位、Group 成员、Link 端点和 Sequence 位置。
- 从 Table 移除照片：删除该照片的 Table placement、Group membership 和 Link membership；不删除项目照片，不自动删除 Sequence item。
- Link 删除到只剩一个成员：自动删除该 Link。
- Group 删除到只剩一个成员：自动解除 Group，保留剩余照片位置。
- 照片被多个命令同时更新：按最新项目 revision 拒绝 stale command，并提示重新执行操作。
- 自动排列可能超出当前视口：完成后平滑调整 viewport，使新 Group 或 Link 完整可见。
- 视口尺寸改变：保存桌面坐标，不按窗口比例永久改写照片位置；只改变当前 viewport transform。

## 14. 动画与反馈

- 照片自动靠近：180～240ms ease-out。
- Group 外框：成员完成移动后淡入，避免框先出现但照片尚未到位。
- Link 线：照片到达相邻位置后绘制；移动时实时跟随。
- Sequence 加入成功：底部缩略图高亮约 600ms。
- 不允许的操作：工具保持 disabled，不使用弹窗打断。
- 操作失败：在工具栏下方显示简短、可关闭的 inline notice，不改变当前选择。

## 15. 无障碍与键盘操作

- 照片、Group 框、Link 线和 Sequence 缩略图都必须可以获得键盘焦点。
- `aria-selected` 表示照片选择状态。
- Group / Link 工具使用 `aria-pressed` 或清楚的当前模式说明。
- 选择、Group、Link、Pin 不能只依赖颜色区分。
- 键盘移动照片时使用方向键；`Shift + 方向键` 使用较大步长。
- 屏幕阅读器需要读出照片文件名、是否在 Group、Link 数量、Pin 和 Sequence 编号。

## 16. MVP 验收场景

### 场景 A：创建并移动 Group

1. 选择 5 张分散照片。
2. 点击 Group。
3. 照片在 240ms 内移动到相邻位置。
4. 外框完整包住所有成员。
5. 拖动外框 100px，所有成员移动相同距离。
6. Sequence Order 保持不变。
7. Undo 后恢复成组前位置和状态。

### 场景 B：创建并编辑 Link

1. 选择 2 张距离较远的照片。
2. 点击 Link。
3. 最后选中的照片保持位置，另一张移动到其附近。
4. 显示节点、连线和 Link 标签。
5. 单独拖走其中一张，连线实时变长，Link 仍然存在。
6. 删除 Link 后照片保留在 Table。
7. Sequence Order 保持不变。

### 场景 C：从 Table 建立 Sequence

1. 选择 3 张照片。
2. 点击 Sequence。
3. 三张照片追加到底部，已存在的照片不重复。
4. 拖动底部缩略图改变顺序。
5. 桌面上的照片位置不变化。
6. 重新打开项目后，桌面位置、Group、Link 和 Sequence 均恢复。

## 17. 本轮不做

- Group 嵌套；
- Link 自动 AI 推断；
- 真实物理碰撞和惯性；
- 多人实时协作；
- 根据 Table 的空间位置自动持续同步 Sequence；
- Group 或 Link 自动跨项目共享；
- 3 张以上的 Juxtapose。

