# PhotoFlex Table 重构 Review 与实施交接方案

日期：2026-09-06。基线：当前 `codex/table-centered-workspace` 工作区，包括尚未提交的 Table 重构；HEAD 为 `fd07b1d`。本轮交付审查文档、独立设计稿、截图和复现材料，未实施应用修改。

## 1. 结论与本轮设计决策

**建议先修复滚动崩溃及保存/删除风险，再按本方案调整工作台结构。现状不是简单的样式偏差：导航层级、来源浏览状态、工具栏归属与底部序列交互均有缺口。**

用户本轮文字要求优先于附图及历史文档中的描述。历史实施方案只用作比较材料，不视为本轮实施授权。具体消除以下歧义：

- 项目内顶层导航只保留 **Table / Sequence**。品牌可回 Home，项目名作为只读上下文；**Project details 入口放在右侧 Photo Sources 内**，不再由顶层 Project 标签或顶层项目名进入。
- **Contact Sheet 保留独立页面，但入口迁入右侧当前来源标题区**。本轮不沿用历史方案“把所有 Contact Sheet 旧地址重定向 Table”的决定，否则用户要求的 Contact Sheet 入口会失去意义。
- Photo Sources 展开态采用附图中的“左来源目录＋右照片网格”；顶部标题、项目入口、搜索/筛选与底部批量操作固定，仅目录和网格各自滚动。
- 底部 Sequence Order 是编辑区域：默认高 220px，缩略图完整显示，序号和文件名移到图片外。
- 图中的三张照片选中状态可以保留，但 **Compare 必须禁用并解释仅支持两张**。不能因为参考图画出了可用按钮就扩大比较功能。
- 收起态保留 48px 右侧入口条，同时在 Table 工具栏提供 Photo Sources 按钮。这是本轮针对“收起按钮不明显”的建议，比历史文档的 0px 关闭态更容易重新发现。
- 设计方向保持当前 Photoflex 的白色面板、衬线品牌、细线图标、浅灰点阵画布。不要改成另一套卡片仪表盘或重做 Home。

### 交付物

| 文件 | 用途 |
| --- | --- |
| [独立可点击设计稿](<C:/Users/Jeff Wu/.codex/worktrees/table-centered-workspace/MVP_Sequence/photoflex-MVP/design-output/table-review-2026-09-06/ui-prototype.html>) | 双击打开；底部小型审阅工具条切换 Expanded / Compact / Collapsed / Project / Error |
| [01：推荐展开态](<C:/Users/Jeff Wu/.codex/worktrees/table-centered-workspace/MVP_Sequence/photoflex-MVP/design-output/table-review-2026-09-06/01-proposed-expanded.png>) | 1672×941，主要视觉验收基准 |
| [02：窄栏态](<C:/Users/Jeff Wu/.codex/worktrees/table-centered-workspace/MVP_Sequence/photoflex-MVP/design-output/table-review-2026-09-06/02-proposed-compact.png>) | 1440×900，368px 双列来源栏 |
| [03：收起态](<C:/Users/Jeff Wu/.codex/worktrees/table-centered-workspace/MVP_Sequence/photoflex-MVP/design-output/table-review-2026-09-06/03-proposed-collapsed.png>) | 48px 入口条与明显的重新展开按钮 |
| [04：项目信息](<C:/Users/Jeff Wu/.codex/worktrees/table-centered-workspace/MVP_Sequence/photoflex-MVP/design-output/table-review-2026-09-06/04-proposed-project.png>) | 从来源栏进入项目信息，画布保持挂载 |
| [05：1280 宽布局](<C:/Users/Jeff Wu/.codex/worktrees/table-centered-workspace/MVP_Sequence/photoflex-MVP/design-output/table-review-2026-09-06/05-proposed-1280.png>) | 1280×800，下方 200px、右侧 560px |
| [06：局部错误态](<C:/Users/Jeff Wu/.codex/worktrees/table-centered-workspace/MVP_Sequence/photoflex-MVP/design-output/table-review-2026-09-06/06-proposed-error.png>) | 右侧失败时画布仍可使用 |
| [当前展开态截图](<C:/Users/Jeff Wu/.codex/worktrees/table-centered-workspace/MVP_Sequence/photoflex-MVP/design-output/table-review-2026-09-06/current-expanded-1672.png>) | 现有 UI 结构对照；使用隔离测试索引，照片可能显示占位 |
| [运行时证据](<C:/Users/Jeff Wu/.codex/worktrees/table-centered-workspace/MVP_Sequence/photoflex-MVP/design-output/table-review-2026-09-06/runtime-evidence.json>) | 白屏异常栈、滚动前后根节点与几何尺寸 |
| [设计稿检查结果](<C:/Users/Jeff Wu/.codex/worktrees/table-centered-workspace/MVP_Sequence/photoflex-MVP/design-output/table-review-2026-09-06/ui-visual-check.json>) | 六张设计稿无缺图、无页面/网格横向溢出、无 JS 异常 |

设计稿照片取自仓库既有参考资产，在本输出目录内复制使用；不代表用户真实项目数据。UI 中计数、文件名为示例。设计稿支持面板状态、临时选择、过滤、搜索、临时序列排序；文件夹选择、实际导航、保存和删除以提示演示，分隔线仅展示目标外观。**实施 agent 应依据下述行为规格实现，不能把演示代码当成生产组件复制进去。**

## 2. 审查发现（按处理优先级）

### R01 · P1 · 来源网格滚动会卸载整个应用【浏览器已复现】

位置：[SourceBrowser.tsx:210](<C:/Users/Jeff Wu/.codex/worktrees/table-centered-workspace/MVP_Sequence/photoflex-MVP/src/app/SourceBrowser.tsx:210>)。

现有代码：

```tsx
onScroll={(event) => setLayout((current) => ({
  ...current,
  scrollTop: event.currentTarget.scrollTop,
}))}
```

状态 updater 执行时重新访问了事件的 `currentTarget`。浏览器实际报错 `Cannot read properties of null (reading 'scrollTop')`；React `basicStateReducer → SourcePhotoGrid` 路径抛出渲染异常。滚动前 `#root.childElementCount = 1`，滚动后为 `0`，body 文本为空。应用树未提供可隔离此错误的 Error Boundary，导致整页变白。

复现：独立 Chrome、1672×941、160 条来源照片索引及 12 个序列项，进入 Table，在右侧网格滚动 620px。详见 [reproduce.cjs](<C:/Users/Jeff Wu/.codex/worktrees/table-centered-workspace/MVP_Sequence/photoflex-MVP/design-output/table-review-2026-09-06/reproduce.cjs>)。该脚本新建隔离浏览器上下文，不操作用户数据库；脚本中的 `5174` 是本轮 Vite 端口，重跑前按实际端口调整。

修改要求：同步提取数字，再进入 updater；不要用 `persist()` 或可选链把错误掩盖成 0。

```tsx
const onScroll = (event: React.UIEvent<HTMLDivElement>) => {
  const scrollTop = event.currentTarget.scrollTop;
  setLayout(current => current.scrollTop === scrollTop
    ? current
    : { ...current, scrollTop });
};
```

可沿用现有 [VirtualPhotoGrid.tsx:90](<C:/Users/Jeff Wu/.codex/worktrees/table-centered-workspace/MVP_Sequence/photoflex-MVP/src/app/VirtualPhotoGrid.tsx:90>) 的同步取值＋rAF 合并思路。若采用 rAF，只保存数值或稳定 ref，卸载时取消帧任务。虚拟范围不变时不重复发布网格状态。

在保持 SourceBrowser 上层浏览状态的前提下，为网格内容增加局部 Error Boundary，Retry 仅重建网格；Table/Sequence 状态不能跟着丢失。异步读取的 Result 错误仍走正常错误 UI，Error Boundary 不代替异步错误处理。React 事件语义见 [React 官方文档](https://react.dev/reference/react-dom/components/common#react-event-object)。

### R02 · P1 · “Remove”会直接删除 Sequence 和版本，且无法 Undo【代码及现有测试确认】

位置：[TablePage.tsx:160](<C:/Users/Jeff Wu/.codex/worktrees/table-centered-workspace/MVP_Sequence/photoflex-MVP/src/app/TablePage.tsx:160>)、[TableContextToolbar.tsx:57](<C:/Users/Jeff Wu/.codex/worktrees/table-centered-workspace/MVP_Sequence/photoflex-MVP/src/app/TableContextToolbar.tsx:57>)、[TableCanvas.tsx:262](<C:/Users/Jeff Wu/.codex/worktrees/table-centered-workspace/MVP_Sequence/photoflex-MVP/src/app/TableCanvas.tsx:262>)。

选中 Sequence pile 后点 Remove 或按 Delete，直接调用 `deleteSequences()`，并重置 Table 历史。现有 TablePage 测试还明确断言整个 Sequence 被删除。这里不能只把危险按钮改成红色：普通照片的“移离桌面”和“永久删除序列及版本”共用模糊标签，容易误操作。

保留现有“删除 pile 同时删除序列”的模型，但入口改为 **Delete Sequence…**，键盘也进入同一确认框。正文列出名称、版本数量和无法 Undo；默认焦点为 Cancel；执行中禁用重复提交；成功才更新 pile、摘要、活动序列和历史。取消不能改变任何编排。不要擅自新增“隐藏 pile”存储模型来回避此问题。

### R03 · P1 · 断开来源清掉索引、授权和缓存，重连无法保留原引用【代码确认；可达旧流程】

路径：右侧 Add Source → ProjectPage → Remove source。位置：[ProjectPage.tsx:115](<C:/Users/Jeff Wu/.codex/worktrees/table-centered-workspace/MVP_Sequence/photoflex-MVP/src/app/ProjectPage.tsx:115>) 调用 [BrowserPhotoSource.ts:231](<C:/Users/Jeff Wu/.codex/worktrees/table-centered-workspace/MVP_Sequence/photoflex-MVP/src/platform/browser/BrowserPhotoSource.ts:231>)。

该 adapter 方法删除 source-grants、photo-index、thumbnail 和 derived-preview，随后才写 `removedAt`。因此已有 Table/Sequence 还持有 PhotoId，但索引和缓存已被清除。若后续 workspace 保存失败，还可能出现界面仍显示连接、实际数据已清除的不一致。重连函数要求选择文件夹返回同一 SourceId；授权记录删除后 `chooseFolder()` 无旧 handle 可执行 `isSameEntry()`，通常新建 ID，重连被静默放弃。

此路径不一定是本次新引入，但它仍从新的工作台可达，必须随来源管理迁移一起修正。

断开应是项目级软断开：先成功保存 `removedAt`，再停止扫描、清除该来源的临时待加入选择；保留索引、句柄、缓存及编排。侧栏 Disconnected 列出可重连项。重连成功后清除 `removedAt` 并扫描；选择其他文件夹不能替换旧 SourceId。物理清理接口继续留给既有真正清理流程，不要全局重定义其语义。

### R04 · P1 · 保存失败缺少可操作恢复；离开页面可丢失可见编辑【代码确认】

位置：[TablePage.tsx:39](<C:/Users/Jeff Wu/.codex/worktrees/table-centered-workspace/MVP_Sequence/photoflex-MVP/src/app/TablePage.tsx:39>)、[TablePage.tsx:89](<C:/Users/Jeff Wu/.codex/worktrees/table-centered-workspace/MVP_Sequence/photoflex-MVP/src/app/TablePage.tsx:89>)、[sequenceSession.ts:111](<C:/Users/Jeff Wu/.codex/worktrees/table-centered-workspace/MVP_Sequence/photoflex-MVP/src/app/sequenceSession.ts:111>)、[SequenceOrderPanel.tsx:75](<C:/Users/Jeff Wu/.codex/worktrees/table-centered-workspace/MVP_Sequence/photoflex-MVP/src/app/SequenceOrderPanel.tsx:75>)、[projectWriteCoordinator.ts:294](<C:/Users/Jeff Wu/.codex/worktrees/table-centered-workspace/MVP_Sequence/photoflex-MVP/src/app/projectWriteCoordinator.ts:294>)。

- Table 保存失败只显示约 3.2 秒 notice；coordinator 会暂停写入，页面没有稳定可见的 Retry 入口。
- Sequence Order 没有渲染 `saveState/error/retry`。其 `flush(): Promise<void>` 丢弃 coordinator 的失败 Result，`Open Sequence` 随后仍导航。用户可能看到排序成功，进入 Sequence 后却加载旧版本。
- 连续 A/B 编辑时，失败队列仅保留某个失败 task；Sequence retry 声明了 `failedDraft`，却只重试 coordinator 旧 task 后重新读取。不能把“重试成功”直接等同“最新可见草稿已保存”。

要求：项目头部显示 Saving… / All changes saved / Changes not saved · Retry；失败状态常驻。把当前未落盘草稿与最近落盘草稿区分开。`flush` 返回明确成功/失败；只有成功后执行导航、切换活动序列或关闭可能丢失本地草稿的面板。失败允许继续查看，但修改类按钮暂停，直到恢复。可重试错误应最终提交最新待保存草稿；revision conflict 则进入明确的重新加载/保留本地处理流程，不能盲目覆盖新 revision。Table 视口计时器也应在离开前提交最后值，不能只清除定时器。

### R05 · P2 · Project/Contact Sheet 仍在顶层，Add Source 会离开工作台【代码＋截图确认】

位置：[AppHeader.tsx:19](<C:/Users/Jeff Wu/.codex/worktrees/table-centered-workspace/MVP_Sequence/photoflex-MVP/src/app/AppHeader.tsx:19>)、[TablePage.tsx:177](<C:/Users/Jeff Wu/.codex/worktrees/table-centered-workspace/MVP_Sequence/photoflex-MVP/src/app/TablePage.tsx:177>)、[M1App.tsx:23](<C:/Users/Jeff Wu/.codex/worktrees/table-centered-workspace/MVP_Sequence/photoflex-MVP/src/app/M1App.tsx:23>)。

顶层 Home / Project / Photos / Table / Sequence 仍存在；Project 标签点击却打开 Table，与标签及激活条件不一致。SourceBrowser 不提供 Project details 和 Contact Sheet；Add Source 导航到 ProjectPage。修改按第 1、4 节执行，不只是隐藏顶层按钮。

### R06 · P2 · 展开态仍纵向堆叠，缺少尺寸调节与明确收起入口【截图＋代码确认】

位置：[SourceBrowser.tsx:120](<C:/Users/Jeff Wu/.codex/worktrees/table-centered-workspace/MVP_Sequence/photoflex-MVP/src/app/SourceBrowser.tsx:120>)、[global.css:249](<C:/Users/Jeff Wu/.codex/worktrees/table-centered-workspace/MVP_Sequence/photoflex-MVP/src/styles/global.css:249>)。展开态目录出现在搜索上方，下面还重复来源 select；不是双区布局。关闭是无边框小号 `×`，收起后文字竖排在中间，缺少上部稳定入口。当前无 resize separator，切换模式也不保存首张可见照片锚点。

### R07 · P2 · 虚拟网格以外框宽度计算卡片，产生横向溢出【实测】

位置：[SourceBrowser.tsx:173](<C:/Users/Jeff Wu/.codex/worktrees/table-centered-workspace/MVP_Sequence/photoflex-MVP/src/app/SourceBrowser.tsx:173>)、[SourceBrowser.tsx:194](<C:/Users/Jeff Wu/.codex/worktrees/table-centered-workspace/MVP_Sequence/photoflex-MVP/src/app/SourceBrowser.tsx:194>)、[global.css:274](<C:/Users/Jeff Wu/.codex/worktrees/table-centered-workspace/MVP_Sequence/photoflex-MVP/src/styles/global.css:274>)。`viewport.clientWidth` 包含左右 padding，却被直接用于 tileWidth；绝对定位项又从内容区起排。实测网格 `clientWidth=359`、`scrollWidth=373`，多出 14px。

应测量可用内容宽度，扣除左右 padding，或把 padding 放到外层并让内层无 padding。列宽、列距、图片高度、文件名高度和总行高使用同一份 geometry。不能只 `overflow-x:hidden` 裁掉越界卡片。当前虚拟器使用 0.75 比例而来源图 CSS 为 1.32 比例，也应统一。

### R08 · P2 · 扫描完成不刷新照片列表，首次扫描可能空白或缺照片【代码路径确认】

位置：[SourceBrowser.tsx:58](<C:/Users/Jeff Wu/.codex/worktrees/table-centered-workspace/MVP_Sequence/photoflex-MVP/src/app/SourceBrowser.tsx:58>)、[ProjectSourceMonitor.ts:12](<C:/Users/Jeff Wu/.codex/worktrees/table-centered-workspace/MVP_Sequence/photoflex-MVP/src/app/ProjectSourceMonitor.ts:12>)。加载 effect 只依赖 photoSource/sourceId/sources；扫描状态的 indexedCount/status 变化不会触发读索引。首次在扫描完成前读到空页，后续没有来源切换时可能继续显示空列表。All Sources 等所有批次读取完才统一展示，部分可用数据也被等待拖住。

需要按来源监听扫描进度/完成，节流合并可用索引；禁止扫描每推进一张就清空、重读所有来源。首次页可以先显示，后续页追加；请求 generation 隔离旧来源结果；错误区分部分失败与无匹配。选择、锚点不随进度清空。

### R09 · P2 · 选择、过滤、按钮和拖拽载荷不一致【代码确认】

位置：[SourceBrowser.tsx:62](<C:/Users/Jeff Wu/.codex/worktrees/table-centered-workspace/MVP_Sequence/photoflex-MVP/src/app/SourceBrowser.tsx:62>)、[SourceBrowser.tsx:102](<C:/Users/Jeff Wu/.codex/worktrees/table-centered-workspace/MVP_Sequence/photoflex-MVP/src/app/SourceBrowser.tsx:102>)、[SourceBrowser.tsx:148](<C:/Users/Jeff Wu/.codex/worktrees/table-centered-workspace/MVP_Sequence/photoflex-MVP/src/app/SourceBrowser.tsx:148>)。

- 切来源重置全部 selection；筛选则保留隐藏 selection。
- 按钮加入 `selectedVisible`，拖拽却携带整个 `selected`；同一选区因入口不同加入不同照片。可能出现“3 selected / Add 0 to Table”。
- On Table 图片仍可以进入待加入 selection。底层 `place()` 会正确去重，但通知使用传入数组长度，可能宣称放入 N 张而实际 0 张。此问题不是会重复创建 PhotoId，而是 UI 反馈及待加入语义错误。
- 缺少 Clear、On Table 筛选、范围选择、虚拟网格方向键导航和明确 selected 语义。

统一成“项目内待加入 ID 集合”。隐藏项保留且标记隐藏数量；按钮和多选拖拽调用同一个 `resolveEligibleSelection()`，过滤已在桌面/断开/失联项；成功只清除实际提交项，失败保留。新照片单击切换、Shift 范围选择，未选图片拖拽只带自身。已在桌面的单击可定位，不计入待加入。批量通知使用实际新增数量。

### R10 · P2 · Sequence Order 视觉过小且裁剪原图【截图＋计算样式确认】

位置：[global.css:388](<C:/Users/Jeff Wu/.codex/worktrees/table-centered-workspace/MVP_Sequence/photoflex-MVP/src/styles/global.css:388>)、[global.css:401](<C:/Users/Jeff Wu/.codex/worktrees/table-centered-workspace/MVP_Sequence/photoflex-MVP/src/styles/global.css:401>)。高度 134px，标题 9px，图框 140×76，`object-fit:cover`；数字盖在图片右下。它与主 UI 的阅读密度、原图比例不一致。见第 6 节尺寸和图片规则。

### R11 · P2 · 序列拖拽不能放到最后；无插入线/边缘滚动/键盘替代【代码确认】

位置：[SequenceOrderPanel.tsx:69](<C:/Users/Jeff Wu/.codex/worktrees/table-centered-workspace/MVP_Sequence/photoflex-MVP/src/app/SequenceOrderPanel.tsx:69>)、[SequenceOrderPanel.tsx:79](<C:/Users/Jeff Wu/.codex/worktrees/table-centered-workspace/MVP_Sequence/photoflex-MVP/src/app/SequenceOrderPanel.tsx:79>)；算法语义见 [sequenceEditor.ts:111](<C:/Users/Jeff Wu/.codex/worktrees/table-centered-workspace/MVP_Sequence/photoflex-MVP/src/modules/sequence/sequenceEditor.ts:111>)。

当前卡片 drop 一律 `move(index)`，含义是“放在目标之前”。例如 `[A,B,C]` 把 A 拖到 C，得到 `[B,A,C]`，无法通过尾部空白放成 `[B,C,A]`。没有 after-last 命中区。不要擅自改 domain move 的 `to` 语义；应在 UI 根据指针与卡片中线、scrollLeft、leading padding 算出 0…N 的 insertionIndex，复用 `sequenceStripInsertionIndex` 并让它接受统一的卡片尺寸参数。

同时显示 2px 插入线、首尾落点，边缘 32px 区域自动滚动。拖完提交一次；Escape/pointercancel 不提交。序列带焦点内提供 Undo/Redo 和键盘移动，不能让顶层 Table Undo 撤销错误的状态域。

### R12 · P2 · 工具栏未按选区收敛，Group 和手势缺少关键操作【代码确认】

位置：[TableContextToolbar.tsx:59](<C:/Users/Jeff Wu/.codex/worktrees/table-centered-workspace/MVP_Sequence/photoflex-MVP/src/app/TableContextToolbar.tsx:59>)、[TableCanvas.tsx:315](<C:/Users/Jeff Wu/.codex/worktrees/table-centered-workspace/MVP_Sequence/photoflex-MVP/src/app/TableCanvas.tsx:315>)、[useTableGestures.ts:165](<C:/Users/Jeff Wu/.codex/worktrees/table-centered-workspace/MVP_Sequence/photoflex-MVP/src/app/useTableGestures.ts:165>)。

所有命令塞在 38px 顶栏，未形成图中贴近选区的上下文工具栏。Group 框 `pointer-events:none`，标题没有命名/整体移动入口；已有 group 创建算法会网格排布，应保留，不必重写。Space＋拖动未实现，右键才平移；Escape 只清选区，没有取消进行中的 gesture，松手仍可能提交；框选只命中照片，不包含 pile；多选 resize 当前仅单图提供手柄。

按第 5 节拆出全局工具/上下文动作，用现有 action policy 保持逻辑一致。补齐焦点域和手势取消。组命名如需 domain 支持，应给 WorktableEditCommand 增加明确 rename-group 命令及一个原子 Undo，而不是直接改 draft。

### R13 · P2 · 来源预览和比较对话框缺少完整键盘关闭/焦点恢复【代码确认】

位置：[SourceBrowser.tsx:229](<C:/Users/Jeff Wu/.codex/worktrees/table-centered-workspace/MVP_Sequence/photoflex-MVP/src/app/SourceBrowser.tsx:229>)、[TablePage.tsx:226](<C:/Users/Jeff Wu/.codex/worktrees/table-centered-workspace/MVP_Sequence/photoflex-MVP/src/app/TablePage.tsx:226>)。SourcePreview 未处理 Escape/焦点圈定；Table 的 Preview 有 Escape，但 Compare 没有同等行为，关闭按钮也不一致。复用一个现有或轻量的对话框壳：名称、初始焦点、Tab 圈定、Escape、关闭后回触发项（虚拟项离屏则回网格）。不要全局注册会同时关闭无关层的快捷键。

### R14 · P2 · 现有验收对真实交互和数据失败覆盖不足【测试确认】

本轮 `tsc --noEmit` 通过；SourceBrowser、TablePage、tableSession、sequenceSession、projectWriteCoordinator 五个测试文件共 **15/15 通过**。SourceBrowser 单测只有两张照片，未覆盖滚动；现有 e2e 主要截图与点击，缺少 pageerror 及根节点存活断言。现有删除测试直接认可无确认删除，应按新交互改为“确认后删除、取消无变化”。测试通过不能作为本轮 UI/滚动验收通过。

## 3. 设计参考及采用方式

Figma 将画布与导航、工具、属性面板分开，侧栏根据当前上下文显示相关内容。这里借鉴固定面板框架、层级分区、明确当前对象和不打断画布的操作；不照搬其属性检查器，也不宣称本方案像素尺寸来自 Figma。[Figma 官方侧栏说明](https://help.figma.com/hc/en-us/articles/360039832014-Design-prototype-and-explore-layer-properties-in-the-right-sidebar)、[Figma UI3 设计说明](https://www.figma.com/blog/our-approach-to-designing-ui3/)。

Milanote 的 Unsorted 是每个 board 自带的临时整理区，可以从右上入口展开，并拖出内容到 board。这里借鉴“素材待整理区→画布”的工作方式和稳定的重新打开入口，不引入其共享机制，也不把 Photo Sources 变成选中照片的属性面板。[Milanote Unsorted 官方说明](https://help.milanote.com/en/articles/111399-unsorted-notes)。

## 4. 页面结构与右栏：可实施规格

### 4.1 组件树和布局归属

```text
ProjectWorkspaceProvider / ProjectWriteCoordinator
└─ TableWorkspaceShell
   ├─ ProjectWorkspaceHeader                 顶部 64px：品牌 / 只读项目名 / Table·Sequence / 保存状态
   └─ TableWorkspace                         Grid，余下视口高度
      ├─ Main                               min-width:0; min-height:0
      │  ├─ TableGlobalToolbar              48px
      │  ├─ TableCanvas                     minmax(0,1fr)，包含浮动 ContextToolbar
      │  └─ SequenceOrderPanel              220px，可调高度
      └─ SourcesPanel                       640px 默认展开示例
         ├─ SourcesPanelHeader              48px
         ├─ ProjectContextRow               68px，Project details 入口
         ├─ SourcesBody / ProjectInfoBody   余高
         │  ├─ SourceDirectory              164px，仅 Expanded
         │  └─ BrowserContent               来源标题、搜索、筛选固定，网格独立滚动
         └─ SourceSelectionFooter           56px，正常布局行，不覆盖网格
```

顶部不放 Projects/Photos 阶段标签。项目名超长以 ellipsis 显示，title 给全名。品牌的返回行为与保存离开保护共用导航路径。Table/Sequence 激活下划线宽度跟随文字，中心对齐整页，不随右栏宽度漂移。现有 Home 可继续用既有 header 尺寸和布局，通过项目工作区 variant 区分，避免用全局 `.topbar` 覆盖 Home。

TableGlobalToolbar 应移入 main 列。右栏从顶层 header 下面即 y=64 开始，不再排在整页工具栏下面；它的 header 与 Table 工具栏同高。这是实现附图层级的关键 DOM 改动。

### 4.2 参考像素坐标与响应规则

在 **1672×941、浏览器 100%、DPR 1** 下，以 01 图为准：

| 区域 | x / y | 宽 / 高 |
| --- | --- | --- |
| 顶部栏 | 0 / 0 | 1672 / 64 |
| Table 工具栏 | 0 / 64 | 1032 / 48 |
| 画布 | 0 / 112 | 1032 / 609 |
| Sequence Order | 0 / 721 | 1032 / 220 |
| SourcesPanel | 1032 / 64 | 640 / 877 |
| SourcesPanel header | 1032 / 64 | 640 / 48 |
| ProjectContextRow | 1032 / 112 | 640 / 68 |
| Directory + Browser | 1032 / 180 | 640 / 705 |
| Selection footer | 1032 / 885 | 640 / 56 |

边框纳入 border-box，可有 1px 栅格差异；字体栅格不要求逐像素一致。照片世界坐标来自项目，不应为了对齐示例图片强制自动排列。

| 屏宽 | Compact | Expanded | Sequence Order |
| --- | --- | --- | --- |
| ≥1440 | 默认368，允许320–420 | 默认 `clamp(560, round(W×0.383), 880)`，但需保留 main≥640 | 默认220，可调180–320，且画布高≥300 |
| 1280–1439 | 同上 | 默认560，可调上限 `W−640`，下限560 | 默认200，可调180–280 |
| 1024–1279 | 368 并排 | 560px 右侧覆盖层，main 不随覆盖层缩小 | 默认200 |
| <1024 | 右侧覆盖层，宽 `min(368,W)` | 覆盖层宽 `min(560,W)` | 保留可用编辑区域；本轮不新增手机手势体系 |

初次进入：≥1440 推荐 Expanded 以接近用户图；较窄屏为 Compact；无来源时为 Compact 空状态。已有项目恢复上次用户选择，不能覆盖已保存设置。Closed 为 48px rail，记住 lastOpenMode 与每种模式最后宽度。初始值与历史方案不同，实施以本节为准。

分隔条：1px 可见边线，8px 可拖命中区，中部 26px 双线握柄；hover 蓝色浅底；`role=separator`、方向、数值范围、tabIndex；左右键16px，Shift＋左右键32px，Home/End 到上下限。面板内控件不随拖动被压到不足最小宽度。

切宽/收起不重置 zoom、不 Fit、不改变照片世界坐标、不增加 Undo。若旧/新画布像素尺寸为 `(w0,h0)/(w1,h1)`，保持中心世界点：`originX += (w1-w0)/2; originY += (h1-h0)/2`。在一次受控布局调整中应用一次，避免 ResizeObserver 回写循环。网格以首张可见 PhotoId＋行内偏移恢复锚点，不能仅复用旧 scrollTop。

### 4.3 Token 与组件细节

| Token/元素 | 值 |
| --- | --- |
| 文字 / 次文字 / 边框 | `#20201e` / `#73736e` / `#deded9` |
| 面板 / 画布 / 图片留白底 | `#ffffff` / `#f4f3f0` / `#f1f0ec` |
| 选区 / hover / active | `#4569b2` / `#eeede9` / `#e5e4e0` |
| 品牌 / 正文 | 既有 Ancizar Serif 25px bold / Arial、Helvetica Neue、sans-serif |
| 面板标题 / 常规按钮 / 文件名 | 13px 600 / 12px 400 / 11px 400，行高至少1.35 |
| 次级统计 / 小状态徽标 | 10–11px / 9–10px；不能把主要操作压到9px |
| 标准按钮 / 图标按钮 | 高32px / 32×32px；菜单条目高36px |
| 图标 | 16×16px，1.5px stroke；复用 `src/assets/icons/table-*.svg`，缺少的用同规范 SVG |
| 圆角 | 普通按钮5px、面板内卡片2px、浮动工具栏7px |
| 键盘焦点 | 2px `#4569b2` outline＋2px offset，不能只靠 hover |
| 点阵 | 间距16px，点半径约0.65px，颜色 `#cfcfc5` |

不要继续使用 `▣ / ⌕ / ＋ / ×` 字符充当各自风格不同的图标，也不要给每个中性动作永久红色。删除项在危险菜单/确认框用危险色，桌面 Remove 保持正常动作外观。

面板头：左 Photo Sources；右 Add Source、Expand/Compact、带边框 Collapse。Expanded 显示 Collapse 文案；Compact 可仅显示 32×32 图标，但必须有 `aria-label` 和 hover tooltip。Closed 的 48px rail 顶部放展开图标＋Photo Sources 竖排标签，同时 Table 工具栏右侧出现带边框 Photo Sources 按钮。不能把唯一展开入口放在屏幕中部。

Project row：左右16px内边距；36×36 文件夹图标底；左两行 PROJECT 与项目名，右 Project details →。点击后在右栏内容区显示名称、封面、Memo、Delete project…，有 Back to Photo Sources。不要把现有 `.workspace-main` 整页样式原样嵌入右栏，应给 ProjectInfoPanel 添加 sidebar 变体或抽出字段区。字段失焦提交，Memo防抖；保存状态走同一 coordinator。Project视图底部替换为项目保存状态与Back to sources，不显示照片批量加入按钮。关闭/返回恢复来源筛选、选择、scroll anchor，且不卸载 TableCanvas。

### 4.4 来源目录和照片浏览区

Expanded 目录宽164px（1280级别144px），右边框1px，内边距8px，行高36px。每行 folder16、名称12px、右侧等宽数字10px；选中底 `#e9e9e4`。长名称 ellipsis＋title。Disconnected 分组显示数量，展开后每项提供 Reconnect。目录自己滚动，不推动上方标题。

Compact 不显示目录，把来源名称改成可点击下拉，选项含 All Sources、有效来源、Disconnected。当前来源标题旁始终提供 **Contact Sheet**（grid图标＋文字）和更多菜单。对 All Sources，Contact Sheet 先弹来源选择器，选中具体来源后跳转；不能悄悄用项目第一个来源。

来源标题区：上/左右16px、下10px；标题15px，下面 `124 photos · 18 on Table` 11px。Contact Sheet 按钮高30px。更多菜单包括 Refresh、Reconnect（条件出现）、Disconnect source…。Add Source 调用现有 chooseFolder 流程，保留当前 Table；用户取消时没有错误提示。来源记录保存后开始扫描，新索引逐步出现。

搜索：高34px，左右外边距16px，边框1px，圆角4px，图标16px，文字12px，输入防抖150ms，作用域只限当前来源范围。筛选行高36px，三等分 **All / Not on Table / On Table**，选中底部2px墨色线；实现 tab 语义时需要完整键盘左右切换，否则使用普通筛选按钮组加 aria-pressed，不要仅写 tablist。

照片网格按**完整内容宽度**布局：左右padding 16/12，gapX=12、gapY=15；Expanded≥408px可用内容宽时3列，否则2列；更宽时4列条件为每格至少132px。Compact固定2列。计算 `tileWidth=(contentWidth-gapX×(cols-1))/cols`，所有计算使用同一个 contentWidth。

图片区域为 tileWidth×tileWidth×0.75；外框固定4:3，图片居中 contain，纵图左右留白、横幅上下留白。图片绝对定位在明确高度的 well 中，避免 flex min-content 把竖图撑高。文件名单独一行，高16px、距图片7px；行高=`imageHeight+7+16+15`，虚拟位置与CSS一致。源图404显示同尺寸占位与重试提示，不能改变行高。

卡片不因选中从1px边框变2px边框而挤压图片；用外部2px outline或预留透明border。选中为蓝框＋右上18px黑底白勾；On Table 是左上浅底9px文字徽标，不遮住大片内容。文件名不要绝对定位覆盖照片。

滚动容器 `flex:1; min-height:0; overflow-y:auto; overflow-x:hidden; overscroll-behavior:contain; scrollbar-gutter:stable`，**先修正尺寸，再禁止横向滚动**。其全部祖先明确 min-height:0。Footer是独立56px grid row，取消目前absolute footer＋70px底部补丁，不遮最后一行。空列表显示居中“No photos match this view”与Clear filters；无来源显示 Add Source；扫描中显示已索引计数及稳定骨架；权限丢失显示来源状态＋Reconnect，而不是“没有匹配照片”。

### 4.5 选择、拖放、导航状态

建议在 SourceBrowser 的稳定父层持有以下 UI 状态，按 projectId 分区；resize宽度/展开态放 sessionStorage，待加入选择仅内存即可：

```ts
type SourcesUi = {
  mode: 'compact' | 'expanded' | 'closed';
  lastOpenMode: 'compact' | 'expanded';
  widths: { compact: number; expanded: number };
  view: 'sources' | 'project';
  activeSourceId: SourceId | 'all';
  contexts: Record<string, {
    query: string; filter: 'all' | 'not-on-table' | 'on-table';
    anchor?: { photoId: PhotoId; offsetY: number };
  }>;
  pendingPhotoIds: ReadonlySet<PhotoId>;
};
```

`pendingPhotoIds` 与 Table selection、Sequence item selection 三者分离。切换来源或搜索后保留待加入集合，footer显示“3 selected · 1 hidden”；Clear清整个集合。按钮和拖拽同一 resolved eligible ID list，顺序固定为来源加入顺序、relativePath顺序。未选图片拖拽仅自身；选中图片拖拽当前待加入集合。开始拖拽时显示 count ghost，不让 DOM 虚拟卸载改变载荷。drop用屏幕坐标转换世界坐标，并一次提交整批；已在桌面、断开的项排除，实际0新增不显示成功。

来源网格键盘：方向键跨行/列，虚拟项先scrollIntoView范围后聚焦；Space选片、Shift范围选择、Enter预览、Escape关预览。双击预览不要经过两次 toggle 使已有selection被反转；需明确 click/doubleClick冲突处理，拖拽阈值4px以内不算拖动。

Contact Sheet跳转：先成功flush，在导航前记录来源UI上下文＋Table viewport，打开当前sourceId对应页面，返回Table时恢复。同样保存保护应覆盖品牌回Home、顶层Sequence、pile双击和浏览器回退；不要仅修复Open Sequence按钮。来源栏开关、搜索、改宽使用replace或session状态，不污染浏览历史。旧Project地址可replace到Table并打开Project details；旧Contact Sheet地址继续正常访问。

## 5. 画布与交互按钮：可实施规格

### 5.1 全局工具和上下文工具分离

全局48px行仅放 Undo / Redo、Arrange下拉、Grid、Row、Align，以及右侧照片/组数。不要把Preview、Link、Leave、Add to Group、Front等所有状态按钮常驻顶栏。较窄main优先隐藏计数，再把Grid/Row/Align收进Arrange，不通过9px字体或横向工具栏滚动解决。

上下文工具栏锚定 Table 当前选区屏幕包围盒，宽度由内容决定，padding5px、按钮32px高、整体约44px高、1px边框、7px圆角、轻阴影。优先放在包围盒上方18px，居中；离画布边缘最少12px；上方放不下时置下，仍不放得下时固定画布顶部内部。不能盖住选中照片或伸入Photo Sources。工具栏pointer事件不开始框选或拖图，缩放画布时工具栏字号/高度不缩放。

| 选区 | 主要动作 | 更多菜单 |
| --- | --- | --- |
| 无 | 不显示上下文栏 | 画布菜单按既有范围处理 |
| 1张普通照片 | Preview、Add to Sequence、Remove from Table | Add to Group（可用时）、Front、New Sequence… |
| 2张照片 | Group、Compare、Add to Sequence、Remove | Link/Unlink、Front、New Sequence… |
| ≥3张照片 | Group、禁用Compare、Add to Sequence、Remove | Link（2–6有效）、Front、New Sequence… |
| 完整Group | Ungroup、Add to Sequence、Remove | Rename Group、Link（适用时）、Front |
| 单个组内成员 | Preview、Add to Sequence | Leave Group、Remove from Table、Front |
| 1个Sequence pile | Open Sequence、Delete Sequence… | Rename（如已有可用流程）、Front |
| 2个Sequence piles | Compare Sequences、Delete Sequences… | Front |

动作可用性仍由 `deriveTableActions` 统一给出。没有目标序列时 Add to Sequence 进入包含 New Sequence… 的目标选择，不画一个无解释死按钮。删除Group中的照片仍是桌面移除语义，原文件和已有Sequence引用不删。菜单包含被移走的既有命令，不能以“简洁UI”为由丢功能。

### 5.2 组与手势

Group框1px `#d4d4cd`，标签位于左上边线上，11px字＋画布色底，内边距横5/纵3。单击标题选择整组；拖标题带全部成员移动，保留成员相对位置；双击标题内联命名，Enter提交、Escape取消，失焦提交非空名称。命名输入禁止触发画布快捷键。

照片保持真实长宽比，画布缩放通过world transform。多选边界用1px蓝色线＋四角7px白底蓝边手柄，底部显示11px selected badge。多选缩放按共同包围盒同比缩放位置与尺寸，pointerup一次command；不要分别提交每个photo造成多个Undo。

Space按下时手形光标，Space＋左键拖动优先pan，keyup/blur清状态；右键拖动继续可用。Escape取消当前gesture，恢复开始前临时变换后释放pointer capture；下一层才关闭菜单或清selection。Ctrl/Cmd+Z、Shift+Z与Ctrl+Y按聚焦域处理；Table/Source/Sequence三域不能互相撤销。Delete/Backspace仅在Table域且非输入元素时执行，pile先确认。

框选支持照片和pile的明确策略：本轮继续不允许混合对象操作，可允许同类框选，命中混合时显示选择类型或统一优先规则，不能画了框却悄悄忽略所有pile。建议普通框选选择照片，Alt框选pile并提供可见提示；若要改为混合选择，需要单独扩展action policy与domain验收，不作为默认实现。保留现有30%相交阈值，测试边界，不改造成不透明的新选择规则。

## 6. Sequence Order：可实施规格

容器位于main底部，只横跨main，不延伸到右栏。默认220px，参考图截图中是134px，应删除/覆盖旧min-height规则。顶部48px标题行，下面可滚动条带；上边缘8px resize命中区，中间32×3浅灰握柄。向上拖增加高度；收起后48px，重新打开恢复上次高度；拖动不写入Sequence和Undo。

标题左“Sequence Order”13px 600，后为活动序列下拉12px和“6 photos”；右侧低优先级Drag to reorder、Open Sequence→、32px折叠按钮。活动序列下拉列出项目可用sequence；无序列显示“Select photos on Table to create a sequence”与New Sequence…，不假装还在Loading。加载失败显示“Could not load sequence · Retry”。

卡片标准宽148px，横间距16px；图片区112px高，浅灰留白，contain；上方留10px，左/右24px，图片与文字间8px。序号左、文件名右，11px；不盖在图上。横图、竖图、方图、超宽图都完整显示；不去强求每张的可视图像宽度相同。Blank项使用同尺寸well和“Blank”居中样式，不受 `.sequence-strip-item span` 的全局绝对定位影响。

高度改变时，图片框高 `clamp(96, panelHeight−108, 192)`；标准220对应112px。卡片宽默认148px，若大高度允许更宽，则geometry同时使用明确的itemWidth参数；不能仅在CSS改宽而保留虚拟器140px常量。为了本轮可控，推荐保持148px宽，增高时增加原图显示高度，保持序列节奏。

位置计算统一为stride=`148+16=164`，trackWidth=`N×164−16`，外部左右padding不重复计入。现有 `sequenceStripVirtualizer` 同时被SequencePage使用，增加可选geometry参数并保留旧默认；Table传148/16，避免悄悄改变SequencePage布局。

拖拽用前述0…N插入位；插入线2px蓝色、顶部6px圆点，源项opacity .45，落点带序号提示。FLIP动画160–220ms，prefers-reduced-motion时关闭。自动滚动只作用于strip，按距离边缘控制速度，不移动页面或画布。拖拽结束更新真实Sequence并同步pile摘要，失败保留草稿且常驻错误提示。

补齐键盘等价操作：条带内左右键切当前项，Alt＋左右键移动一位，Home/End导航，Ctrl/Cmd+Z与Redo只作用SequenceSession，Esc取消拖拽/菜单；提供Move to start/end菜单用于长序列。隐藏未加载的DOM项不能让键盘停住。切换活动序列前成功flush；选择/滚动位置按sequenceId记忆。

## 7. 实施顺序与代码落点

下表是后续 agent 的工作包，不代表本轮已经执行。先完成A/B再做外观，避免在不可保存或易误删的状态上加交互。

| 包 | 工作内容 | 主要代码落点 | 完成门槛 |
| --- | --- | --- | --- |
| A 稳定性 | R01、R07，同步滚动值、正确内容宽度、局部错误恢复 | SourceBrowser、VirtualPhotoGrid参考、contactSheetVirtualizer、M1App局部边界 | 真浏览器反复滚动无pageerror，左右不溢出 |
| B 数据反馈与危险操作 | R02/03/04，明确flush结果、最新草稿重试、删除确认、来源软断开 | projectWriteCoordinator、tableSession、sequenceSession、TablePage、ProjectPage、useProjectWorkspace、导航入口 | quota失败/恢复、连续编辑重试、取消删除均有行为测试 |
| C 工作台框架 | 顶部只Table/Sequence；来源栏从y64开始；Project/Contact Sheet新入口；尺寸与模式 | AppHeader、M1App、TableWorkspace、SourceBrowser、ProjectInfoPanel、router、useAppNavigationState | 1672、1440、1280、1024结构符合规格且返回保持上下文 |
| D 来源体验 | 双区来源列表、三筛选、统一待加入集合、扫描更新、独立滚动 | SourceBrowser，可拆SourcePhotoGrid/SourceDirectory，ProjectSourceMonitor、既有Source管理动作 | 快速切来源/扫描/过滤不丢选择，批量加入与拖拽相同 |
| E 画布动作 | 全局与上下文工具栏、Group命名/整体移动、Space与Escape | TableContextToolbar、TableCanvas、useTableGestures、tableActionPolicy、worktable contracts/editor | 每个手势一次Undo，输入/模态不触发画布命令 |
| F 序列带 | 高度与contain、序列选择、插入位、尾部drop、键盘与保存状态 | SequenceOrderPanel、sequenceStripVirtualizer、sequenceSession、相关摘要同步 | 三项首移尾/尾移首正确，1000项能到首尾，刷新后顺序一致 |
| G 合并验收 | 修正已有测试入口，浏览器截图与回归 | SourceBrowser.test、TablePage.test、coordinator/session tests、tests/e2e | 下节矩阵全部完成，提交交付截图 |

保持既有模块边界：TableSession负责Table草稿和历史，SequenceSession负责序列编辑历史，Coordinator负责写入顺序及结构事务；PhotoSource负责文件/索引/preview lease。SourceBrowser不能直接写存储或复制一份Sequence状态。ProjectInfo只发项目意图，TablePage不再组合大量存储细节。

不要为了布局引入新UI框架、状态库或第二套虚拟列表依赖。优先复用既有纯geometry与SVG图标。全局样式按Table根类作用域整理，只删除确定被替代的规则；不要一边保留旧134px/140×76常量一边叠加新!important。先记录当前工作区未提交修改，后续实施只改必要文件，不还原用户已删除的旧设计稿。

## 8. 验收矩阵（不是截图看起来接近就通过）

### 8.1 自动/浏览器功能验收

| 编号 | 操作与数据 | 必须断言 |
| --- | --- | --- |
| T01 | StrictMode真Chrome/Edge；160、1000、3000来源索引，滚轮向下/上、拖scrollbar、PageDown到尾部 | 无pageerror；#root和Table存在；最后照片可见；来源scrollTop变化，画布不动；渲染项数量随视口而非总数线性增长 |
| T02 | 深处滚动后切All/Not on Table/On Table，搜索仅剩1张，再清除搜索 | 无越界/空洞/白屏；正确重算范围；锚点或明确复位规则一致 |
| T03 | 展开/窄栏/收起/拖分隔条，改变浏览器尺寸 | 按模式恢复宽度、选区、来源和首图锚点；世界坐标/zoom不改，画布中心保持；不产生Undo |
| T04 | 2个来源慢速增量扫描、一个读取失败、快速切换A→B→A | 正确来源数据逐步出现，无旧请求覆盖，无无限Loading；错误独立；现有选区不清空 |
| T05 | 跨来源选3张，过滤隐藏1张，分别点击Add与从已选项拖入 | 两条路径同样3个eligible ID；隐藏数量说明准确；已On Table项不计入；成功只清提交项 |
| T06 | 同一批次加入后再次点击、快速连击、来源照片失联 | 不重复添加；通知为实际新增数；loading禁重入，失败保持待加入 |
| T07 | 写入quota错误；之后恢复；A编辑失败后产生B待保存状态再Retry | 错误常驻；B不被A旧任务覆盖；最后存储快照与屏幕一致；失败flush不得导航 |
| T08 | 序列[A,B,C]：A放C右半/末尾，C放A左半，拖出取消 | 依次[B,C,A]与[C,A,B]（各自从初始fixture开始）；取消不提交；一次有效操作一条Undo |
| T09 | 1000序列项，拖到左右边缘、键盘移动到首尾 | 自动滚动正确，0/N落点有效，虚拟范围更新，刷新后顺序一致 |
| T10 | 选pile按Delete；取消/确认；双击重复确认 | 取消保留Sequence和版本；确认仅执行一次事务；成功后活动序列有效、无悬空pile |
| T11 | 断开来源、刷新页面、同文件夹重连；模拟workspace保存失败 | 缓存/索引/PhotoId/编排保留；断开保存失败不清数据；重连复用ID；其他文件夹不覆盖旧引用 |
| T12 | Space拖动、Esc取消图拖动、Esc取消缩放；编辑组名时按S/Delete | 正确pan；取消无提交；文本输入不触发Table命令；Ctrl+Y正常 |
| T13 | 从右侧进入Project details/Contact Sheet再返回，带未保存状态 | 无顶层Project/Photos标签；入口语义正确；Project编辑不卸载画布；Contact返回恢复上下文；失败提示可处理 |
| T14 | 来源预览/Compare/删除框，仅键盘操作 | 标题可读、焦点不逃逸、Escape关闭、焦点回原项、不会同时清Table选区 |
| T15 | 注入一次网格渲染异常与一次异步列表错误 | 前者侧栏fallback可重试，Table仍可选/缩放；后者显示来源读取错误，不能白屏或当成空数据 |

不要把截图生成脚本当作T01通过。当前复现脚本的目的恰好是记录失败；修复后应转成带断言的e2e，并用独立context准备数据。现有e2e使用的Home heading locator也应与实际可访问名称对齐后再运行，不能因前置等待失败而漏跑Table。

### 8.2 视觉验收

- 1672×941：主列1032、右列640；顶部64、工具48、底部220；与01图并排比较。1440×900 Compact右列368；1280×800 Expanded右列560、底部200；1024×800 Expanded覆盖不把main压扁。
- 必须用包含3:2横图、2:3竖图、1:1方图、3:1横幅的fixture。图片边缘标记均完整可见，不能只测`objectFit==='contain'`而忽略父容器裁剪。
- 文件名和序号在图外；源图等高well，不因竖图撑高虚拟行；横向仅Sequence条带允许滚动。
- 第一屏同时可见Project details、Contact Sheet、Add Source、Collapse。来源网格滚到底时这些入口和footer仍在原位。
- 选区3张时Compare禁用且可解释；按钮32px、图标16px；截图检查正常/hover/focus/disabled/selected/dragging/error六类关键状态。
- 展开/收起时没有照片尺寸或世界坐标突变；画布选择工具栏不被源面板遮挡，不超出画布。
- 截图至少交付：展开、窄栏、收起、项目编辑、来源菜单、扫描/重连、选区工具栏、序列拖拽插入线、保存失败、删除确认、1280和1024。

### 8.3 本轮已获得的证据

已有5个相关测试文件15项通过，TypeScript检查通过；真实Chrome滚动白屏和14px横向溢出已复现。其余标注“代码确认”的问题来自可达代码及明确的状态/算法推导，不宣称都经过浏览器故障注入。六个设计稿状态已渲染检查，无缺图与横向溢出，关键截图已视觉查看。

## 9. 可复制给实施 agent 的任务说明

> 以当前worktree为基线，按本目录REVIEW.md及01–06设计稿修复PhotoFlex Table。先完成R01–R04，再按工作包C–F实现UI；保留用户已有未提交修改和Home布局。用户最新要求是Project与Contact Sheet入口进入右侧Photo Sources，顶部只有Table/Sequence，Contact Sheet页面仍保留。不要照旧文档重定向掉Contact Sheet，也不要照参考图启用三图Compare。实现来源双区展开态、明确收起/展开入口、220px完整构图Sequence Order、上下文工具栏和文档中的状态/保存/删除行为。所有尺寸和虚拟geometry要一致；不用新框架。以第8节矩阵验收并交付对应截图。设计稿是独立示意，未实现文件系统、持久化或真实导航，不可原样视为生产实现。


