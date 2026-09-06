# PhotoFlex：以 Table 为核心的工作台重构实施方案

## 1. 目标、基线与范围

进入项目后直接打开 Table，在右侧 Photo Sources 面板内完成来源管理、浏览、选片和拖入，在同一工作空间内完成分组、比较与序列整理。

实施分支为 codex/table-centered-workspace，项目目录：

C:/Users/Jeff Wu/.codex/worktrees/table-centered-workspace/MVP_Sequence/photoflex-MVP

以实施开始时该 worktree 的实际内容为基线。当前已有未提交的 Home、ProjectDialog、样式及测试改动，必须保留并适配，不覆盖为早期提交版本。

本轮包含：

- Table 核心导航与右侧来源面板。
- 来源面板的窄版、展开版和关闭状态。
- 来源选择、搜索、筛选、多选、预览、批量加入及拖入。
- 分组网格排列、组命名、整体移动、多选缩放。
- 上下文工具栏、双图比较、序列堆与底部序列带。
- 保存反馈、失败恢复、旧路由兼容和对应测试。

本轮不包含 Home 的重新视觉设计、PDF 导出、系统文件直接拖入、云端上传、多人协作及新增多图比较。

已确认的产品决策：

1. Project 和 Photos 的主要入口整合进 Table。
2. 保留 Link、Sequence Pile 和双图 Compare。
3. 创建 Group 时按 Grid 排列，支持命名和拖动组标题整体移动。
4. 移除 Source 保留编排和照片引用，允许重新连接。
5. 本轮拖入仅支持 Photo Sources 面板到 Table。

示例图用于视觉参考，不作为状态逻辑依据：已经在 Table 的照片不能再次作为新增照片加入；选中三张照片时 Compare 不可用。

## 2. 页面结构、导航和面板尺寸

### 2.1 导航

| 入口 | 行为 |
| --- | --- |
| 点击品牌或 Projects | 返回 Home |
| Home 打开项目 | 进入该项目 Table |
| 新建项目成功 | 进入空 Table，打开来源面板 |
| 顶部 Table | 返回当前项目 Table，恢复视口和面板 |
| 顶部 Sequence | 打开当前活动序列；否则打开最近有效序列；没有序列时留在 Table 并提示创建 |
| 项目名称 | 展开项目信息面板 |
| 设置按钮 | 打开同一项目信息面板 |

顶部移除独立的 Project、Photos 阶段按钮。项目内导航采用：

PhotoFlex / Projects / 项目名称　　Table / Sequence　　保存状态 / 设置

项目信息面板提供项目名称、Memo、封面预览和删除项目。复用现有项目保存与删除逻辑；来源管理统一放到 Photo Sources。

项目信息面板作为临时覆盖层，不卸载 Table。关闭后恢复原先焦点、选区和视口。

### 2.2 路由兼容

- 保留 #/projects/:projectId/table 作为 Table 标准地址。
- 旧 #/projects/:projectId 使用 replace 跳转到 Table。
- 旧 #/projects/:projectId/sources/:sourceId 跳转到 Table，同时展开来源面板并选中对应来源。
- Table 路由增加可选的 sourceId 与 sources 查询状态，用于旧链接转换和可分享的来源入口。
- 链接中的来源不存在或已断开时，显示明确状态，不退回 Home。
- 手动开关面板、选择来源、调整宽度不产生新的浏览历史记录。
- 保留现有 Sequence、Sequence Compare 和 Version Compare 地址。

Home 继续使用现有界面，只修改打开项目和新建成功后的目标路由。

### 2.3 面板状态与尺寸

~~~ts
type SourcesPanelMode = "closed" | "compact" | "expanded";
~~~

| 状态 | 尺寸与内容 |
| --- | --- |
| Closed | 宽度 0；Table 工具栏保留 Photo Sources 打开按钮 |
| Compact | 默认 320px，可调整为 300–420px；来源下拉框、搜索、筛选、两列缩略图 |
| Expanded | 默认窗口宽度的 42%；通常为 640–880px；内部左侧 180px 来源目录，右侧选片网格 |

布局规则：

- 桌面宽度 ≥1280px 时使用并排布局，Table 至少保留 640px。
- 1024–1279px 时，展开状态使用 560px 右侧覆盖面板；Compact 仍并排显示。
- 小于 1024px 时来源面板作为右侧覆盖层，宽度不超过窗口宽度；本轮不实现手机触摸桌面编辑。
- 窗口不足以维持三列照片时自动降为两列，不压缩文字或裁切照片。
- 拖动分隔线调整当前模式宽度；拖动结束保存尺寸。
- 分隔线支持键盘左右键调整，步长 16px。
- Expand 和 Compact 明确切换模式；关闭按钮仅关闭面板。

默认状态：

- 第一次进入项目：Compact。
- 无来源时：Compact，显示 Add Source 空状态。
- 有来源但桌面为空：保持 Compact，并显示选片引导。
- 后续进入项目：恢复该项目上次面板状态。

面板开关、展开或缩放时：

- 保持 Table 的世界坐标和缩放倍率。
- 保持原画布中心对应的内容在新画布中心。
- 不自动执行 Fit，不移动照片，不产生 Undo 记录。
- 保存选片网格首张可见照片及行内偏移，重新计算列数后恢复位置。

## 3. Photo Sources 的完整交互

### 3.1 来源目录

展开版目录包含：

- All Sources
- 当前项目的有效来源，按加入顺序排列。
- Disconnected 可折叠区，列出已断开的来源。
- Add Source

每个来源展示名称、已索引数量和状态。长名称截断并通过 tooltip 显示完整文本。

Compact 下拉框包含相同来源和状态。来源目录不出现在整个应用的左侧，只存在于右侧 Photo Sources 内部。

点击来源：

1. 更新当前来源范围。
2. 恢复该范围的搜索、筛选和滚动位置。
3. 继续保留其他来源中的临时选片。
4. 不修改 Table、Sequence 或浏览历史。

All Sources 聚合当前项目所有有效来源。排序固定为来源加入顺序，再按各来源 relativePath 顺序，避免异步返回顺序改变照片位置。

### 3.2 添加、刷新、断开与重连

#### Add Source

- 复用 PhotoSource.chooseFolder()。
- 用户取消选择时关闭系统对话框，不显示错误。
- 来源记录保存成功后才开始扫描。
- 同一文件夹再次选择时复用已有 SourceId。
- 添加成功后切换至该来源，已扫描照片可以立即浏览。
- 文件支持范围沿用当前 JPEG 支持，不在此轮扩展格式。
- 文件夹已选择但项目记录保存失败时，保留本轮获得的 grant，提供 Retry，不重复弹出文件夹选择器。

#### Refresh

- 同一来源同时最多运行一个扫描。
- 展示扫描状态和已索引数量。
- 扫描过程中保留现有列表和可用缩略图。
- 完成后合并更新索引，不清空全部照片、选片或滚动位置。

#### Remove Source

界面使用确认对话框说明：将从当前项目断开来源，保留 Table、Sequence 与历史版本，原文件不删除。

确认后：

- 将 SourceRecord.removedAt 写入当前项目。
- 从普通来源目录移动到 Disconnected。
- 清除该来源的临时待加入选择。
- 保留照片索引、句柄、缓存、PhotoId、桌面位置、组关系及序列引用。
- 停止该来源当前扫描。
- 已有照片若缓存可显示则继续显示，附 Source disconnected 状态；不允许从该来源新增照片到 Table。
- 不调用现有会清理句柄和索引的 PhotoSource.removeSource()。

#### Reconnect

- 由用户点击触发 restoreFolder(sourceId)，获取所需读取权限。
- 成功后清除 removedAt，刷新索引并清除对应失联状态。
- 必要时允许重新选择文件夹，但必须通过现有句柄的 isSameEntry() 确认是同一个来源。
- 选择其他文件夹时不替换旧 SourceId，提示通过 Add Source 添加。
- 本轮不支持把任意新文件夹映射为旧来源。

### 3.3 搜索与筛选

搜索范围为当前选中的单一来源或 All Sources，匹配文件名及相对路径：

- 去除首尾空白。
- 不区分大小写。
- 输入防抖 150ms。
- 搜索覆盖完整已索引照片集合，不能只搜索当前加载的一页。

筛选项：

| 筛选 | 规则 |
| --- | --- |
| All | 当前来源范围内全部照片 |
| Not on Table | draft.placements[photoId] 不存在 |
| On Table | draft.placements[photoId] 存在 |

Table 成员状态从当前桌面草稿即时派生，不另存一份成员列表。

分页索引尚未读完时显示 Loading index…。此时搜索结果可以渐进出现，但不能提前显示确定的“No results”。

主动改变搜索或筛选时滚动到首行；因加入、移除、撤销导致结果变化时，保持当前首张可见照片，若其已消失则锚定原位置附近的下一张。

缩略图密度提供 Small、Medium、Large；默认 Medium。Compact 固定两列，Expanded 根据密度和可用宽度计算列数，1920px 示例布局默认三列。

### 3.4 选片

来源选择与 Table 选择使用独立状态，互不清空。

| 操作 | 行为 |
| --- | --- |
| 单击未在 Table 的照片 | 切换待加入选择 |
| Shift 单击 | 从上次锚点到当前照片追加范围选择 |
| Ctrl/Cmd 单击 | 与单击一致，切换当前照片 |
| Space | 网格照片获得焦点时切换选择 |
| 方向键 | 在当前网格中移动焦点 |
| Enter / View | 打开照片预览 |
| Clear | 清空当前项目全部临时待加入选择 |
| Ctrl/Cmd+A | 仅在来源网格获得焦点时，选择当前筛选结果中可加入的照片 |

补充规则：

- 切换来源、搜索、筛选和开关面板不清空临时选择。
- 底部显示总选择数量；有隐藏选择时附“当前显示 x 张”。
- 全选不选择尚未完成加载的索引结果；索引读取中禁用“选择全部结果”，显示原因。
- 已在 Table 的照片保留原色和 On Table 标记，不显示待加入复选框。
- 已在 Table 的照片提供 Locate on Table，定位并选中已有对象，不创建副本。
- 缺失或断开来源的照片可以查看现有缓存和状态，但不进入待加入选择。
- 来源网格以单击选择、View/Enter 预览为准，不绑定双击预览，避免双击触发两次选中切换。
- Table 保留现有双击预览。

### 3.5 大图预览

复用现有 PreviewOverlay 的图片租约、缩放、键盘及焦点管理，调整动作入口：

- 来源预览中，动作是 Select / Deselect。
- 已在桌面的照片显示 On Table 和 Locate on Table。
- 不在来源预览中提供隐式“再次点击就从 Table 移除”的开关。
- 左右箭头按照打开预览时的筛选结果浏览。
- 预览使用 PhotoId 定位；筛选变化不通过索引错位跳到其他照片。
- Escape 关闭并恢复原缩略图焦点和滚动位置。
- 图片保持完整比例；切换照片释放上张图片租约。

### 3.6 批量加入和拖入

#### 按钮加入

Add N to Table 中 N 为当前有效待加入数量。

点击后：

1. 重新检查照片所属项目、来源有效性及是否已在桌面。
2. 按来源顺序和相对路径顺序生成放置数据。
3. 在当前 Table 可见区域中心生成紧凑网格。
4. 一次操作加入全部有效照片。
5. Table 选中新加入的照片。
6. 来源面板清除成功加入的选择，保留未加入的选择及原因。
7. Table 视口不自动缩放，显示可点击的 Fit added photos 提示。

网格排列：

- 复用 worktableDisplaySize() 生成初始尺寸。
- 列数不超过 ceil(sqrt(N))，并受当前画布可用宽度限制。
- 间距默认 24 个世界坐标单位。
- 列宽、行高按照本批最大照片尺寸计算，保留原比例。
- 按钮加入优先尝试视口中心；如与现有对象重叠，以网格单元为步长搜索可见区域空位。
- 可见区域无容纳空间时放在现有对象整体右侧，提供定位提示，不移动原对象。

#### 拖入

- 拖动已选缩略图：携带全部待加入选择。
- 拖动未选缩略图：只携带当前照片，不清空原选择。
- 拖动起始记录本次照片 ID 和顺序；后续选择变化不改变此次载荷。
- 光标进入 Table 后显示批量预览和数量。
- 预览与最终放置使用同一布局计算函数。
- 单张照片以拖放点居中；多张照片网格以拖放点作为左上角锚点。
- 拖入允许用户主动放在已有照片上方，并提升新增照片层级。
- 放到照片或组区域仍作为普通 Table 放置，不自动加入组或序列。
- 放到工具栏、Sequence Order 或面板自身不执行加入。
- Escape、拖出窗口或拖放取消不写数据。
- 系统文件拖入不执行导入，并阻止浏览器意外打开文件。

内部载荷只包含项目和照片 ID：

~~~ts
interface PhotoDragPayload {
  readonly version: 1;
  readonly projectId: ProjectId;
  readonly photoIds: readonly PhotoId[];
}
~~~

统一 MIME 为 application/x-photoflex-photos。拖入时只接受当前项目可解析的照片，不把路径、Blob URL 或图片内容写入载荷。

一次批量加入对应一次桌面历史记录；Undo 一次撤销本批，Redo 恢复同一布局。

## 4. Table 的交互细节

### 4.1 工具栏与上下文动作

顶部常驻：

- Undo、Redo。
- Arrange 菜单：Grid、Row、Align 六个方向。
- 桌面照片数、组数、序列堆数。
- Photo Sources 开关。

Fit、缩放比例、放大和缩小放在画布右下角，不随来源面板延伸。

选区附近显示上下文工具栏：

| 选中状态 | 可用动作 |
| --- | --- |
| 1 张照片 | Preview、Add to Sequence、More、Remove |
| 2 张照片 | Group、Compare、Add to Sequence、More、Remove |
| 3 张及以上 | Group、Add to Sequence、More、Remove；Compare 禁用并说明只支持两张 |
| 一个完整组 | Rename、Ungroup、Add to Sequence、More、Remove |
| 1 个序列堆 | Open Sequence、More、Delete Sequence |
| 2 个序列堆 | Compare Sequences、More、Delete Sequences |

Group 仅在所选照片都没有所属组、数量至少为 2 时可用。跨组选择不自动拆组或合并组。

More 保留：

- New Sequence。
- Link / Unlink，沿用 2–6 张限制。
- Add to Group、Leave Group。
- Bring to Front。
- Fit Selection。

工具栏使用屏幕坐标定位，不跟随画布缩放。优先位于选区上方；空间不足时放下方，并限制在 Table 区域内。拖动、缩放过程中隐藏，完成后恢复。

### 4.2 选择、移动与键盘

- 单击未选照片：选择它并清除其他 Table 对象选择。
- 单击已选照片：保留现有多选，便于整体拖动。
- Shift/Ctrl/Cmd 单击：切换该照片。
- 空白单击：清除 Table 选择。
- 空白拖动：框选；沿用照片至少 30% 面积相交的判断。
- Shift 框选：追加照片。
- 照片与序列堆互斥选择，本轮不增加混合变换。
- 拖动超过 4px 屏幕距离才进入移动状态。
- 拖动过程中仅更新临时变换，pointerup 提交一次编辑命令。
- Escape 或 pointercancel 恢复拖动前状态，不提交。

快捷键仅由当前聚焦区域处理：

| 快捷键 | Table 行为 |
| --- | --- |
| Space＋拖动 | 平移画布 |
| 右键拖动 | 保留现有平移方式 |
| Ctrl/Cmd+A | 选择桌面全部照片 |
| Ctrl/Cmd+Z | Table Undo |
| Ctrl/Cmd+Shift+Z、Ctrl+Y | Table Redo |
| Delete / Backspace | 从 Table 移除照片；序列堆进入删除确认 |
| S | 沿用现有创建序列入口 |
| Escape | 依次取消手势、关闭菜单、清除选区 |

输入框、命名框、对话框、来源网格和序列带聚焦时，不触发 Table 快捷键。失去窗口焦点时清除 Space 按下状态。

### 4.3 Group

创建组是一个原子编辑命令：

1. 确认至少两张照片且没有已有组归属。
2. 在所选照片包围盒左上角，按 Grid 排列。
3. 默认列数 ceil(sqrt(N))，复用 Grid 的尺寸和间距规则。
4. 创建组 ID、名称和成员关系。
5. 选中整个组，名称进入编辑状态。

命名规则：

- 默认 Group 01，依次递增。
- 去除首尾空白，长度 1–80 个字符。
- 允许重名，组 ID 才是身份。
- Enter 保存，Escape 取消，失焦提交合法名称。
- Escape 取消命名时保留新建组及默认名称。
- 双击组标题可再次重命名。

组行为：

- 标题显示名称和照片数。
- 边框由成员实际位置派生，四周 24 世界坐标单位留白。
- 拖动组标题整体移动成员，一次拖动对应一条历史记录。
- 单击组内照片仍选单张，单独移动不解除成员关系。
- 成员移动和缩放后边框自动更新，不自动重排。
- Add to Group 沿用单张加入，但本轮改为将目标组重新 Grid 排列，整个动作一条历史。
- Leave Group 只解除关系，不移动照片。
- Ungroup 只删除关系和边框，不删除照片。
- 成员不足两张时自动解散组，保留剩余照片。
- 创建组的 Grid 排列和关系建立可通过一次 Undo 一起撤销。

### 4.4 多选缩放与排列

选中一张或多张照片时提供共同包围框和四角手柄：

- 使用相对角为固定锚点，等比例缩放。
- 多选时照片尺寸与相对位置使用同一个倍率。
- 不改变纵横比，不裁切图片。
- 统一倍率受现有照片边长 72–1200 世界坐标单位约束；不能逐张独立夹紧，否则会破坏相对布局。
- 手柄保持固定屏幕尺寸和可点击范围。
- pointerup 提交一次，Escape 取消。

新增命令表达围绕锚点的几何变换：

~~~ts
type WorktableEditCommand =
  | ExistingWorktableCommands
  | {
      readonly type: "rename-group";
      readonly groupId: string;
      readonly name: string;
    }
  | {
      readonly type: "scale-selection";
      readonly photoIds: readonly PhotoId[];
      readonly anchor: WorktablePoint;
      readonly scale: number;
    };
~~~

几何计算：

~~~ts
next.x = anchor.x + (current.x - anchor.x) * scale;
next.y = anchor.y + (current.y - anchor.y) * scale;
next.width = current.width * scale;
next.height = current.height * scale;
~~~

Grid、Row、Align 只作用于当前选择；没有足够选择时禁用。排列不修改 entryOrder，也不改变 Sequence 顺序。

### 4.5 缩放、平移和视口

- 沿用 25%–300% 范围。
- 普通滚轮/双指滑动平移。
- Ctrl/Cmd＋滚轮或触控板缩放以鼠标所在世界坐标为中心。
- Fit 包含桌面照片和序列堆，留出 64px 屏幕边距。
- Fit Selection 仅适配当前对象。
- 面板及底部序列带尺寸变化由 ResizeObserver 重新计算可见区域。
- 鼠标位于来源网格时滚动来源；位于序列带时滚动序列；只有位于画布时平移画布。
- 在 Chrome、Edge 验证区域边缘不会触发浏览器上一页/下一页。
- 本轮不增加磁吸、自动对齐参考线或小地图。

## 5. Sequence、Compare 与撤销范围

### 5.1 活动序列

底部序列带不再依赖“持续选中某个序列堆”才显示。

活动序列选择顺序：

1. 用户显式选中的序列。
2. 项目最近活动且仍有效的序列。
3. 项目内第一个序列。
4. 没有序列则显示空状态和 New Sequence。

点击序列堆将其设为活动序列；之后点击其他照片，底部仍保持该序列。序列带标题提供序列下拉切换。

创建序列仍生成：

- SequenceDocument。
- 初始版本。
- Table Sequence Pile。

三者使用现有原子创建接口，不产生只有序列却没有对应堆的中间状态。

### 5.2 加入序列

- 点击 Add to Sequence 打开目标选择对话框。
- 默认目标为当前活动序列，同时提供 New Sequence。
- 默认按 Table entryOrder 取本次照片顺序，并在确认区提供预览和调整。
- 追加到序列末尾，不移除桌面照片。
- Sequence 允许同一 PhotoId 以不同 SequenceItemId 重复出现，沿用现有数据能力。
- 一次添加超过现有 500 项上限时整体拒绝，说明剩余容量，不静默截断。
- 失败保留对话框、目标和本次选择，提供重试。

### 5.3 序列带

- 展开高度默认 160px，折叠高度 36px。
- 仅占左侧 Table 区域。
- 显示名称、照片数、项目数、序号和 Open Sequence。
- 照片使用缩略图；空白项继续显示 BLANK。
- 拖动序列项显示插入线，沿用 SequenceEditor 的 move 命令。
- 排序只改变序列，不改变 Table 布局、Group 或 Link。
- 接近水平边缘时在序列带内部自动滚动。
- 提供键盘左右移动焦点、Alt＋左右调整顺序。
- 单击选中序列项，Enter/View 打开预览。
- 不支持把来源面板照片直接拖到序列带，避免绕过当前 Table 工作流。

### 5.4 Compare 与删除

- 两张照片：打开双图 Compare，复用现有 Swap、完整比例预览和关闭行为。
- 两个序列堆：进入现有 Sequence Compare。
- 照片和序列堆不可混合比较。
- 三张及以上照片不启动 Compare。

普通照片的 Remove 只影响 Table，不删除源文件或序列引用。

序列堆的删除改用明确的 Delete Sequence 文案，确认框列出将删除序列及其版本；确认后调用现有原子删除接口。保持当前“删堆也删序列”的语义，不把它伪装为普通可撤销移除。

### 5.5 Undo / Redo

- 顶部 Undo/Redo 专属于 Table，包含放置、移动、缩放、排列、Group、Link 和普通照片移除。
- 序列带提供自己的 Undo/Redo，处理当前序列的添加和排序。
- 两者按焦点决定快捷键归属，不用 Table Undo 撤销 Sequence 操作。
- 项目名称、来源连接、面板宽度、筛选和视口不进入编辑 Undo。
- 序列创建/删除沿用结构性操作处理，成功后重置 Table 编辑历史，防止恢复出悬空序列堆。
- 从序列带进入 Sequence 页前等待该序列写入完成；目的页重新读取最新 revision，建立自己的编辑历史。
- 返回 Table 后重新读取序列内容并重置旧序列带历史，不复用可能过期的历史快照。

## 6. 代码组织与状态归属

### 6.1 当前实现中的关键事实

- TablePage.tsx 同时处理桌面手势、保存、序列堆、序列排序和对话框，需要拆分职责。
- ContactSheetPage.tsx 独立加载 workspace 并写 Table；直接嵌入会形成两个编辑和保存入口。
- VirtualPhotoGrid 已有虚拟化，但拖拽载荷仅支持单张，焦点查找使用全局 document 查询。
- useProjectWorkspace.save() 返回 Result，不能按 boolean 对象真值判断。
- 现有创建 Group 和 Add to Group 使用横向打包，需要改为已确认的 Grid。
- 现有 resize 仅改照片尺寸，不同步多选照片的相对位置。
- 现有 Source 删除会清理句柄和索引，不能用于“保留引用、以后重连”。

### 6.2 模块划分

本节不仅规定拆分文件，还规定每个模块独占的可变状态和唯一修改入口。所有跨模块状态必须通过只读快照和明确动作传递，禁止通过共享 ref、直接调用 store 或互相修改 React state 建立隐式写入通道。

| 模块 | 独占状态 | 对外只提供的读取/修改入口 |
| --- | --- | --- |
| `ProjectWorkspaceProvider` | 项目会话生命周期、当前 `ProjectId`、加载代次，以及各子会话的创建和销毁 | 提供只读项目快照、`ProjectWriteCoordinator`、`TableSession` 和 `SequenceSession`；不暴露 `workspaceRef`、`setWorkspace` 或 ProjectStore |
| `ProjectWriteCoordinator` | 已加载/已落盘 workspace 快照、workspace revision、项目写入队列、保存状态、失败任务、Retry/flush 和结构性事务状态 | `updateProjectInfo()`、`saveTableDraft()`、`updateResumeContext()`、`addSource()`、`removeSource()`、`reconnectSource()`、`refreshSource()`、`createSequenceBundle()`、`deleteSequenceBundle()`、`retry()`、`flush()`；唯一允许调用 ProjectStore 的模块 |
| `TableWorkspace` / `TablePage` | 路由派生视图状态、面板组合和页面级临时覆盖层 | 组合子组件并转发动作；不持有桌面草稿、编辑器、保存队列，不直接协调数据写入 |
| `TableSession`（实现 hook 可命名为 `useTableSession`） | 当前本地桌面草稿、Table 选区、唯一 `WorktableEditor` 实例、桌面 Undo/Redo、编辑序号和待保存桌面变更 | `snapshot`、`selection`、`execute()`、`placePhotos()`、`undo()`、`redo()`、`clearSelection()`、`flush()`；通过协调模块登记保存，不直接调用 ProjectStore |
| `WorktableEditor` | 不拥有项目生命周期或持久化状态；只实现桌面命令、历史变换、Group/Link/排列/缩放和布局规则 | 输入命令，输出合法草稿或可判别错误；不得访问 React、ProjectStore、来源或序列状态 |
| `TableActionPolicy` | 无可变状态；集中定义选区到动作能力的派生规则 | `deriveTableActions(snapshot, selection)` 返回动作可用性和禁用原因；工具栏、快捷键和右键菜单共用，执行时仍由 Editor/Session 再验证 |
| `useTableGestures` | 当前指针手势、拖动偏移、缩放预览、框选框、指针捕获和取消状态 | 输出预览状态和一次性的 `onCommit`/`onCancel`；不得写项目快照、历史或保存队列 |
| `TableCanvas` | 可见照片集合、挂载集合、图片租约和清理计时器，以及画布展示所需的局部测量 | 根据 `TableSession.snapshot` 渲染并转交用户操作；不修改桌面草稿，不调用 ProjectStore |
| `PhotoSourcesPanel` | Compact/Expanded/Closed 的展示组合和面板局部 UI 状态 | 展示来源浏览状态并转发动作；不拥有索引、待加入选择或项目来源记录 |
| `SourceBrowser`（实现 hook 可命名为 `useSourceBrowser`） | 来源索引分页状态、搜索/筛选、当前来源、待加入 `PhotoId`、焦点和滚动锚点 | `setSource()`、`setSearch()`、`setFilter()`、`toggleSelection()`、`selectAll()`、`clearSelection()`、`openPreview()`；来源记录变化通过协调模块动作完成 |
| `SequenceSession` | 当前活动序列、序列草稿、序列 Undo/Redo、SequenceRevision 和序列内容保存进度 | `addItems()`、`moveItems()`、`undo()`、`redo()`、`flush()`；创建/删除序列必须调用 `createSequenceBundle()`/`deleteSequenceBundle()` 结构性事务 |
| `SequenceOrderPanel` | 序列带的局部展开/折叠、焦点和滚动状态 | 展示 `SequenceSession` 快照并转发排序、添加和打开动作；不维护第二份序列草稿 |
| `TableContextToolbar` | 工具栏屏幕定位和显示/隐藏状态 | 消费 `TableActionPolicy` 的结果并发出动作；不复制业务判断 |
| `ProjectInfoPanel` | 项目信息面板的编辑控件和临时输入值 | 提交时调用 `updateProjectInfo()`；不直接改 workspace |

必须满足以下依赖方向：`TablePage/TableWorkspace → Session/Coordinator → ProjectStore`，`TableCanvas/useTableGestures → TableSession`，`PhotoSourcesPanel → SourceBrowser/Coordinator`。布局组件不直接访问 ProjectStore；按钮不自行建立新的 `WorktableEditor`；任何一个动作只能有一个持久化入口。

codebase-design 的应用重点是让放置、历史、保存和结构性事务各有唯一边界，而不是把长文件机械拆成许多仍互相修改状态的小文件。

### 6.3 项目级共享状态

在项目路由外层挂载 ProjectWorkspaceProvider，以 ProjectId 为 key。Home 不挂载该 Provider。

- Provider 只负责项目会话的生命周期和依赖注入；workspace 加载、revision、队列和失败恢复由 `ProjectWriteCoordinator` 实现，不能把这些行为重新堆回 Provider 文件。
- 将现有 `useProjectWorkspace` 的加载代次、串行写入和 Result 适配迁移到协调模块；旧 hook 只可作为过渡适配层，最终不再向界面暴露 `workspaceRef` 或 `setWorkspace`。
- Table、来源面板、项目信息面板和 Sequence 页共用同一个项目会话、协调模块和对应子会话，不能各自加载 workspace 或建立独立的项目写入队列。
- Sequence 页也使用共享会话，避免其直接更新 revision 后其他模块仍持有旧值。
- 项目切换时清空前一个项目的临时选择和控制器；异步返回不得写入新项目。
- Table 会话在同一项目内切换至 Sequence 时保留，返回后协调刷新序列堆。

#### 6.3.1 本地草稿、已保存快照与写入结果

桌面编辑必须明确区分三种状态：

1. `ProjectWriteCoordinator` 持有最近一次成功加载或写入的已保存 workspace 快照及其 `workspaceRevision`。
2. `TableSession` 持有当前本地桌面草稿和 `latestLocalEditSeq`；Sources 的 `On Table`、桌面数量和工具栏状态均从这个草稿派生。
3. 协调模块持有每个写入任务的 `pending/succeeded/failed` 状态及 `savedEditSeq`。保存成功只代表对应任务成功，不能覆盖更晚的本地编辑。

每个桌面写入携带项目代次、基础 revision 和本地编辑序号。返回结果必须同时匹配当前项目会话和提交时的编辑序号；迟到的旧结果不得覆盖更新的本地草稿。失败时保留本地草稿和布局，暂停依赖该失败任务的后续写入；Retry 重放原任务并复用已有 ID，Reload latest 则由用户明确确认后丢弃本地未保存修改。

界面只能读取 `TableSession.snapshot`、`SequenceSession.snapshot` 和协调模块的只读保存状态，不能在 `workspace.worktableDraft` 与本地草稿之间自行选择。

#### 6.3.2 项目 UI 状态与临时状态

状态分为以下几类：

| 状态 | 存储位置 |
| --- | --- |
| 桌面草稿、组名、来源记录、序列、版本、项目资料 | 现有 IndexedDB |
| Table 视口、最近来源和活动序列 | 现有 ResumeContext 字段 |
| 面板模式/宽度、密度、每来源搜索筛选和滚动锚点 | 项目级 UI 状态，节流写入 sessionStorage |
| 临时待加入选择、手势、打开的菜单 | 内存，不写入项目数据 |

sessionStorage key 使用项目 ID 隔离。读不到、内容不合法或空间不足时回落到默认 UI，不影响项目保存状态。

更新 ResumeContext 必须字段合并，不能像当前部分页面那样用新的对象覆盖并丢掉其他页面的恢复信息。

### 6.4 统一放置入口

~~~ts
type TablePlacementTarget =
  | { readonly kind: "viewport-center" }
  | {
      readonly kind: "drop";
      readonly point: WorktablePoint;
    };

interface TablePlacementOutcome {
  readonly added: readonly PhotoId[];
  readonly alreadyPresent: readonly PhotoId[];
  readonly unavailable: readonly PhotoId[];
}

interface TablePlacementActions {
  placePhotos(
    photoIds: readonly PhotoId[],
    target: TablePlacementTarget,
  ): Promise<Result<TablePlacementOutcome, TablePlacementError>>;
}
~~~

其中 TablePlacementError 由工作区未准备好、项目不匹配、编辑命令错误和实际保存错误组成，全部为可判别联合类型。

按钮加入与拖入必须调用同一入口。该入口负责解析 PhotoRef、去重、计算布局、提交命令和反馈结果。

为让拖拽预览与最终位置一致，新增纯函数计算放置布局，并给 place 命令增加可选网格布局参数；已有调用不传参数时保持原默认行为。

UI 不能通过“先 place、再 arrange”产生两个历史记录。

#### 6.4.1 序列创建与其他结构性事务

创建序列不是 TablePage 的组合动作，而是 `ProjectWriteCoordinator.createSequenceBundle()` 的单一结构性事务入口。调用方只提交序列名称、照片顺序和 Table 堆的初始布局意图；协调模块在项目写入队列内部读取最新 workspace，原子生成 `SequenceDocument`、初始版本和 `Table Sequence Pile`，成功后同步项目快照、序列摘要并重置相关桌面历史。

删除序列同理由 `deleteSequenceBundle()` 完成。TablePage、SequenceSession 和对话框不得自行组合存储调用、等待队列后再写入，或手动同步 workspace、editor、draft 和序列摘要。

### 6.5 来源索引与虚拟网格

本轮保留 PhotoSource.listPhotos() 接口，不增加数据库查询语言。

useSourceBrowser：

- 按现有每批最多 100 条读取元数据。
- 单来源顺序读完游标；All Sources 最多同时读取两个来源。
- 只读取 PhotoRef，不主动读取图片文件。
- 支持渐进展示，维护每来源 loading / complete / error 状态。
- 每轮扫描以来源和扫描代次识别，不仅依赖 indexedCount；相同数量也可能发生替换。
- 重新扫描后合并元数据并保留仍有效的选择与锚点。
- 切换来源、关闭面板和卸载时用请求代次阻止迟到响应覆盖当前状态。
- 关闭面板停止新增分页读取，正在完成的安全结果可进入缓存；已启动的来源扫描由项目级监视器管理。

VirtualPhotoGrid 的改造：

- 增加可控目标缩略图宽度与间距。
- 增加 canSelect、拖拽回调及定位 Table 回调。
- 焦点查找限定在当前网格 ref 内，移除全局 document.querySelector。
- 增加按 PhotoId 和行内偏移恢复滚动的接口。
- 图片继续使用 PhotoThumb 与租约释放机制。
- 来源及序列缩略图使用 thumbnail；Table 继续使用已有 768→1536/2048 派生图策略。
- 仅打开大图预览时请求原图。

### 6.6 合并旧页面职责

- 从 ContactSheetPage 提取来源浏览和预览能力，旧页面退出主渲染路径。
- TablePreviewPanel 在新结构中不再使用，因为 Table 本身始终可见。
- 从 ProjectPage 提取来源管理与项目信息编辑能力，旧页面退出主渲染路径。
- 删除旧实现前确认无引用，并更新对应测试；不保留两套独立可写的选片实现。
- AppHeader 从项目级共享状态获取项目名和保存状态，取消独立 Photos 导航所需的重复加载。
- useAppNavigationState 的最近序列信息按 ProjectId 隔离，避免项目切换复用另一个项目的序列 ID。

## 7. 保存、失败恢复和数据兼容

### 7.1 保存队列

保留现有 revision 乐观并发控制，但由 `ProjectWriteCoordinator` 统一协调；`ProjectWorkspaceProvider` 只管理会话生命周期，不拥有第二套队列。

以下操作共用项目写入队列：

- 项目资料保存。
- 来源添加、断开和恢复。
- Table 草稿保存。
- ResumeContext 更新。
- 序列创建、删除等同时修改 workspace 的事务。

Sequence 内容保存按 SequenceId 串行，继续使用 SequenceRevision。Table 序列带和 Sequence 页不能同时对同一个序列启动独立写入流程。

创建和删除序列时：

1. 等待此前项目写入。
2. 在队列内部读取最新 revision 和桌面草稿。
3. 调用现有原子存储接口。
4. 同时更新 workspace、序列摘要和桌面会话。
5. 事务期间禁用新的结构编辑手势，允许浏览与平移。

不再使用“队列外 drain 一下，再在队列外写入”的方式，因为中间仍可能插入其他 workspace 保存。

### 7.2 保存状态

~~~ts
type WorkspaceSaveStatus =
  | { readonly kind: "saved" }
  | { readonly kind: "saving"; readonly pendingCount: number }
  | {
      readonly kind: "error";
      readonly message: string;
      readonly retryable: boolean;
    };
~~~

显示规则：

- 存在未落盘编辑或待处理写入：Saving…
- 全部写入完成，且不存在失败任务：All changes saved
- 失败：持续显示 Changes not saved 和具体原因。
- 不用定时消失的 toast 作为唯一失败提示。
- 所有调用方检查 result.ok，不对 Result 对象直接作 boolean 判断。

Table 编辑继续采用乐观反馈，但需要记录：

- 最新本地编辑序号。
- 已成功落盘的编辑序号。
- 失败位置及对应操作。

失败后：

- 保留本地草稿和已有布局。
- 停止继续发送依赖失败状态的后续写入，避免跳过失败任务后误报保存成功。
- 暂停新增内容编辑，允许浏览、平移、查看错误和重试。
- 普通存储错误重试原任务，保持已有 ID，不能重复生成来源、序列或版本。
- revision 冲突不自动覆盖，提供 Reload latest；用户确认放弃未保存修改后才能重新载入。
- 一次成功的视口保存不能清除之前内容保存失败的状态。

应用内离开项目或切换需要卸载编辑会话的页面前调用明确的 flush()。它必须报告此前失败，不能用一个成功的 no-op save 代表所有历史保存成功。

有未保存内容时启用 beforeunload 提示；不依赖关闭标签页瞬间完成异步 IndexedDB 写入。

### 7.3 数据兼容

本轮无需新增 IndexedDB object store。

- WorktableGroup 已有 name，新增命名命令不改变存储形状。
- 多选缩放只改变现有 placement 数值。
- SourceRecord 已有 removedAt，用于断开记录。
- 面板偏好写 sessionStorage，不进入项目 schema。
- 保留当前 workspace schema 6、IndexedDB schema 8 和备份格式。
- 旧项目缺少 UI 偏好时按默认值打开。
- 旧项目、旧备份中的 group、link、pile 和序列顺序原样读取。
- 对本轮之后断开的来源支持同 ID 重连；已经被旧版硬删除索引和句柄的来源不承诺自动恢复。

失联状态由项目来源记录和照片解析结果共同派生。重新连接后需刷新 PhotoThumb 请求：增加轻量 refreshKey，由来源刷新代次驱动，避免同 PhotoId 的失败占位永久不再加载。

## 8. 实施顺序与交付拆分

先完成桌面会话、手势和写入边界，再接入 Photo Sources。每阶段都保持可运行，并先沿用现有行为和测试，再增加该阶段的新交互；在右侧来源面板接入前，必须通过第 9.5 节的架构边界验收。

| 阶段 | 内容 | 完成条件 |
| --- | --- | --- |
| 1. 桌面会话与规则 | 从 TablePage 提取 `TableSession`、唯一 `WorktableEditor`、桌面历史、选区和 `TableActionPolicy`；保持现有 Group/Link/Pile 行为 | TablePage 不再持有编辑器和桌面历史；Group、Link、Undo/Redo 现有测试通过 |
| 2. 手势与画布边界 | 提取 `useTableGestures` 和 `TableCanvas`；隔离拖动/框选/缩放预览、图片租约和可见性管理 | 手势取消不写数据，pointerup 只提交一次命令，画布局部更新不污染项目会话 |
| 3. 项目写入与序列事务 | 建立 `ProjectWorkspaceProvider` + `ProjectWriteCoordinator`；迁移 revision、队列、失败暂停、Retry、flush；定义 `SequenceSession` 和结构性事务接口，并将创建/删除序列收拢到协调模块 | Table、Sequence、项目资料共用一个写入协调器；不存在页面级 ProjectStore 调用或独立项目队列 |
| 4. Table 页面结构 | 建立 `TableWorkspace`，统一页面组合、项目信息覆盖层、Table/Sequence 活动区域和旧路由兼容；删除重复 workspace 加载 | Home、新建项目和旧 Project/Photos 链接进入正确的 Table 状态 |
| 5. Table 操作完善 | 接入上下文工具栏、统一动作规则、Group Grid、命名、整体移动和多选缩放 | 工具栏、快捷键和右键菜单使用同一动作派生结果；主要操作有确定反馈 |
| 6. 序列衔接 | 落地 `SequenceSession`、活动序列、`SequenceOrderPanel`、序列局部历史、切页 flush 和返回刷新 | Table 与 Sequence 历史互不污染，返回 Table 显示最新序列 |
| 7. Photo Sources 浏览 | 在架构边界稳定后接入 `SourceBrowser`、Compact/Expanded/Closed 面板、索引聚合、搜索筛选、多选、预览和来源断开重连 | 单来源及 All Sources 可连续选片，刷新不丢上下文；Sources 不修改 Table 内部状态 |
| 8. 来源到桌面、清理与验收 | 通过 `TableSession.placePhotos()` 接入按钮加入和批量拖入；移除旧页面重复实现，完成兼容、交互、存储竞态、浏览器和截图核验 | 拖入与按钮结果一致，一次 Undo 撤销一批；完整检查通过并记录实际限制 |

### 8.1 当前重构进度（2026-09-06）

- 阶段 1、2 已完成：`TableSession`、`TableActionPolicy`、`useTableGestures` 和 `TableCanvas` 已从 `TablePage` 提取；取消手势、单次提交、渐进图片读取和视觉回归已有测试覆盖。
- 阶段 3 已完成：新增 `ProjectWorkspaceProvider`、`ProjectWriteCoordinator` 和 `SequenceSession`。TablePage、SequencePage、ProjectPage、ContactSheetPage 的项目写入已通过共享 coordinator/session；序列草稿、排序、追加、Retry/flush 和序列创建 bundle 均不再建立页面级保存队列。创建 bundle 由 coordinator 统一提交 Sequence、初始 Version、Table Pile 和 workspace revision；`updateResumeContext()` 统一合并恢复信息，避免页面覆盖其他恢复字段。
- 阶段 4、5 已完成：新增 `TableWorkspace`、`TableContextToolbar`、`ProjectInfoPanel` 布局接缝，Table 页面保留单一 `TableSession` 和 `TableActionPolicy`；TablePage 不直接访问 ProjectStore、不持有 WorktableEditor；ContactSheet 的 Place on Table 也复用 `TableSession.placePhotos()`。
- 阶段 6 已完成：Sequence 页使用 `SequenceSession`，`SequenceOrderPanel` 使用自己的局部 UI 状态并复用活动序列会话；Table 的 Add to Sequence 对话框也通过目标 `SequenceSession` 执行追加，序列编辑历史和桌面编辑历史分离，切换到 Sequence 前 flush，序列页创建新序列使用 coordinator 的结构性 bundle 入口。
- 阶段 7、8 已完成：`SourceBrowser` 支持 All Sources、来源索引聚合、搜索、Not on Table、多选、未上桌照片预览、Compact/Expanded/Closed 局部模式、sessionStorage 上下文恢复、按钮加入和从来源面板拖入 Table。来源网格使用虚拟化，只渲染可见窗口；拖入与按钮加入均最终调用 `TableSession.placePhotos()`。
- 来源生命周期已补齐第一版：ProjectPage 的 Remove Source 改为软断开，保留 SourceRecord 及其 PhotoRef/桌面/序列引用；Reconnect 成功后恢复记录并重新扫描。原文件不受影响。
- 项目入口和 Photo Sources 视觉接缝已补齐：从 Home、顶部 Project 和项目侧栏进入项目默认打开 Table；Table 页面在共享 Provider 跨页切换时先 flush 并重新载入最新 workspace；Photo Sources Closed 会收缩布局列并可恢复；来源照片缩略图使用 contain 保持完整比例。
- 浏览器验收已完成：Chrome 与 Edge 均覆盖 1920×1080、1440×900、1280×800 和 1024×800 截图，并验证项目入口、来源栏收起/恢复、完整比例缩略图、搜索、加入 Table 和刷新持久化。浏览器级断开/重连无法在无真实文件系统授权变化的自动化夹具中可靠制造，仍由 `BrowserPhotoSource` 存储测试和项目页软断开逻辑覆盖；真实授权失效需在手工验收中确认。
- 当前自动化基线：`pnpm check` 已通过（23 个测试文件、102 个测试、类型检查和生产构建）；Playwright `tests/e2e/contact-sheet-ui.spec.ts` 已在 Chrome/Edge 串行通过（2 个测试项目，每个包含四个视口截图）。

不引入新的状态管理库、拖拽库或画布库。使用现有 React、Pointer Events、原生 Drag and Drop、虚拟化和 ProjectStore 接口完成。

## 9. 测试与验收标准

### 9.1 纯逻辑测试

- 创建 Group 按 Grid 排列，命名、Ungroup、Leave 和不足两成员处理正确。
- 一次 Undo 同时撤销创建组和排列。
- 多选缩放保持比例、相对位置、统一尺寸上下限和固定锚点。
- 放置预览与最终位置一致；不同缩放及侧栏宽度下坐标转换正确。
- 重复 PhotoId 不新增，不改变原对象位置。
- 同文件名、不同 SourceId 的照片不被错误合并。
- 筛选依赖最新桌面草稿，Undo/Redo 后 On Table 状态同步。
- 无效拖拽、跨项目拖拽和取消手势不写数据。

### 9.2 React 交互测试

- Home、新建项目、旧 Project 链接均进入 Table。
- 旧 Photos 链接展开右侧并定位指定来源。
- Compact、Expanded、Closed 切换保留视口、选片和滚动锚点。
- 搜索能找到第 100 条之后的照片。
- All Sources 聚合次序稳定，延迟返回不混入错误来源。
- 来源选择与 Table 选择互不干扰。
- 批量加入一条历史、一次桌面写入，不修改 Sequence。
- Group 标题拖动整体移动；成员单独移动保留关系。
- 三张照片 Compare 禁用，两张照片可比较。
- 未选中序列堆时活动序列带仍保留。
- 输入组名时 Delete、Space、S、Ctrl+A 不触发画布操作。
- 来源断开后编排不变，重新连接恢复显示。
- 加入失败保留本地状态和重试信息。

### 9.3 存储与竞态测试

同时验证 MemoryProjectStore 和 IndexedDB：

- 拖入、修改项目名、保存视口连续发生时，不互相覆盖。
- 创建序列与 Table 写入连续发生时 revision 正确。
- Sequence 保存使用独立 SequenceRevision。
- quota、unavailable、conflict 失败不能显示 saved。
- 失败后 Retry 不重复生成照片 placement、序列、版本和来源。
- 项目切换后迟到请求不污染新项目。
- 断开来源保留 handle、PhotoRef、placement、group、sequence 和 version。
- 旧 schema 项目和备份正常打开。
- 删除序列堆清理相关序列及版本，并避免 Undo 恢复悬空堆。

### 9.4 浏览器验收

在 Chrome 与 Edge 的桌面环境检查：

- 1920×1080、1440×900、1280×800，以及 1024px 宽度的覆盖面板。
- 原生跨面板拖入、取消、指针捕获和多选缩放。
- 三个区域滚动互不干扰，边缘手势不触发浏览器返回。
- 竖图、横图、极宽照片均保持完整比例。
- 工具栏不越过画布进入来源面板或遮住输入控件。
- 无来源、扫描中、空文件夹、无搜索结果、断开、授权丢失和缺失照片状态。
- 来源数至少 3 个、照片索引至少 1200 张、Table 至少 300 张、Sequence 接近 500 项时保持可操作。
- 来源 DOM 数量受可见行和 overscan 限制，滚动浏览不批量请求原图。
- 拖动期间不连续写 IndexedDB；结束时只有一次内容编辑提交。

运行现有 pnpm check，补充并运行与本轮相关的 Playwright 用例。性能结论记录实际测试环境与观察结果，不预先承诺未经测量的帧率。

### 9.5 架构边界验收

不以 TablePage 行数作为主要指标，而以状态所有权和入口是否唯一作为验收标准：

- 修改 Group 排列，只需修改 `WorktableEditor`/桌面规则及对应纯逻辑测试，不需要修改来源浏览或页面写入协调。
- 修改来源搜索、筛选或分页，不需要修改 TablePage、TableSession 或 WorktableEditor。
- 新增任何一种加入桌面的入口，必须复用 `TableSession.placePhotos()`，不得复制布局、去重和历史逻辑。
- 创建序列失败、保存冲突、Retry 和 flush 可以在不渲染整页的情况下通过协调模块测试。
- `TablePage/TableWorkspace` 不直接调用 ProjectStore、不持有 WorktableEditor、不维护项目或序列保存队列。
- `ProjectWorkspaceProvider` 不暴露 `workspaceRef`、`setWorkspace` 等绕过协调模块的可变句柄。
- `TableSession` 的本地草稿、已保存 workspace 快照和保存结果有明确来源；迟到结果不能覆盖更新的本地编辑。
- `useTableGestures` 的移动/缩放/框选预览只存在于手势生命周期内，取消不写数据，结束时最多提交一条编辑命令。
- 工具栏、快捷键和右键菜单消费同一个动作派生结果；执行入口仍执行最终规则校验。
- SourceBrowser、SequenceSession 和 TableSession 不各自保存同一份项目草稿；跨模块修改只能通过已声明的 coordinator/session 动作完成。

最终交付包含可运行实现、交互测试、Compact/Expanded/空状态截图，以及与本方案不一致的实际限制说明。
