# Layout 技术方案与架构评估

日期：2026-09-24
状态：`Layout-Develop` 开发设计基线；L0–L4 已实施
关联：[产品需求](./Layout_PRD.md) · [实施计划](./Layout_Implementation_Plan.md)

## 1. 现状和结论

Layout 可以在当前 React/TypeScript、IndexedDB、项目备份与云同步架构上增量实现，无需引入通用画布编辑器。主要工作量不在画一个页面，而在文档持久化、文字一致性、固定尺寸 PDF、导航保存屏障和跨项目生命周期。

| 当前证据 | 对 Layout 的意义 |
|---|---|
| `src/contracts/frame.ts`、`src/modules/worktable/frameLayout.ts` | Frame 保留原接口；页面预设、五种 Layout 模板、Fit/Fill 和焦点裁切已提取到 `src/modules/page-layout/pageGeometry.ts` |
| `src/app/TableFrames.tsx`、`FrameSettingsPanel.tsx` | 可参考手势和属性栏交互；Layout 页面不嵌入 Table 世界坐标 |
| `src/contracts/persistence.ts` 的 `PhotoSource` | 提供预览 lease、原片读取、缺图错误；Layout 只保存 `PhotoId` |
| `src/app/projectWriteCoordinator.ts`、`ProjectStore` | 已有顺序写入、修订号、失败恢复；必须增加 Layout 写入范围，而不是在组件内直接访问 IndexedDB |
| `src/platform/browser/exportSequencePdf.ts` | 可参考下载与资源释放；其页面尺寸随窗口变化且文字栅格化，不能充当 Layout 正式导出 |
| `docs/Layout_L0_Verification.md` | 本分支的几何测试、字体候选、固定中文样本和目标阅读器；PDF 复制与搜索仍由 L5 验收 |

早期架构草案选择 SVG；当前正式 Frame 使用页面内 DOM 与 CSS 裁切。Layout 首版沿用这一已落地的显示方式，加上独立的页面坐标变换和 Pointer Events。只有遇到经测量的正确性或性能缺口才更换渲染技术。

## 2. 模块与依赖方向

```text
SequenceOverlay ──> Layout 工作区 ──> Layout 编辑模块 ──> LayoutDocument
                         │                  │
                         │                  └──> 共享页面几何与模板规则
                         ├──> 阅读视图（同一页面呈现模型）
                         ├──> PDF 导出（固定快照）
                         └──> 项目写入协调器 ──> ProjectStore 各实现
                                     │
Sequence 照片条 ──> PhotoSource 预览 ──┘
```

建议的模块接口如下；类型名称是设计目标，落地时以仓库现有命名为准。

| 模块 | 对调用者暴露的接口 | 内部责任 |
|---|---|---|
| `layout-document` | `createFromSequence`、`apply(command, document)`、`validate(document)` | 稳定 ID、页面与对象约束、一次动作一次快照、模板替换和撤销所需结果；不碰 React、照片文件或数据库 |
| `page-geometry` | `templateRects(spec, template)`、`resolveImagePlacement(frame, photo, crop)`、单位转换 | 从现有 Frame 几何提取或复用纯规则；不包含 Table 世界坐标与 WorktableDraft |
| `layout-text` | `layoutText(text, style, box, fontMetrics)` 返回行、字形缺失和溢出 | 编辑、阅读、PDF 的共同排版结果；具体字体度量适配留在内部 |
| `layout-presentation` | `presentPage(document, pageId, resources)` | 页面内 DOM、框层级、裁切、手柄与阅读显示；编辑状态不写入文档 |
| `layout-export` | `preflight(snapshot, resourceInfo)`、`createPdf(snapshot, assets, signal, progress)` | 固定尺寸 PDF、预检、逐页资源使用；文件下载由浏览器 adapter 处理 |
| `layout-persistence` | `createLayout`、`loadLayout`、`saveLayout(expectedRevision)`、关联删除 | 本地原子写入、修订冲突、备份、云同步；通过现有项目写入协调器给 UI 使用 |

接口包含失败模式：未知页面/对象、非法几何、修订冲突、缺图、缺字、文字溢出、取消与 I/O 错误应有可辨识结果。只在确有第二种实现的接缝引入 adapter；例如 PhotoSource 与 ProjectStore 已有多种实现，值得沿用。不要为未来网页导出预先造通用插件系统。

## 3. 文档模型与核心不变量

建议新增独立 `LayoutDocument`：`id`、`projectId`、`sequenceId`、`revision`、`name`、`pageSpec`、有序 `pages`、创建/更新时间。每页含稳定 `pageId` 和有序对象；对象是 `imageFrame` 或 `textBox` 的判别联合。图像框存页面点坐标的矩形、`photoId | null`、Fit/Fill、相对缩放和归一化焦点。文本框存纯文本、同样的矩形与整框样式。只存持久内容，不存当前选择、浏览器缩放、Blob、Object URL、字体运行时对象和撤销栈。

不变量：文档至少一页；每个对象只属于一页；ID 在文档内唯一；矩形有限且宽高不低于 1mm；照片焦点在 0–1、缩放在 1–8；页尺寸创建后首版不可改；页面顺序改变不改变 `pageId`。所有内容动作经编辑模块提交，视图只展示临时手势结果，松开后一次提交。模板从共享规则生成普通框，Layout 不保存对模板的动态依赖。Table Frame 可保留自己的即时模板重排语义。

Sequence 是照片条的来源，Layout 是已排内容的来源。Sequence 变化只刷新可选素材；已排图像框的 `PhotoId` 保持，以便离线恢复。删除关联 Sequence 则在同一项目事务中删除 Layout。该模型也允许以后增加网页导出，而不把 HTML/CSS 混入编辑数据。

## 4. 保存、备份与云同步

项目当前 `ProjectStore` 仅管理 Workspace、Sequence 和 Version，备份格式也只包含这三类数据。实施时必须同步扩展：

1. 增加 Layout ID、修订号和 `ProjectStore` 的创建、列表/定位、读取、保存能力；一个 Sequence 最多一个 Layout 由存储层原子检查。新建成功才进入 Layout 路由。
2. 本地 IndexedDB 在一个事务内处理创建及 Sequence/Project 关联删除；升级 schema，迁移旧项目为空 Layout 列表。`MemoryProjectStore` 与云包装实现遵守同一接口。
3. 项目备份、导入、复制项目 ID 映射、云端整项目快照都包含 Layout；验证损坏数据时返回错误，不静默丢弃 Layout。兼容旧备份的无 Layout 情况。
4. `ProjectWriteCoordinator` 增加 Layout 写入 scope、待保存草稿和 flush/retry；保存失败保留内存数据。离开 Layout、项目切换、浏览器返回和账号切换沿用现有保存屏障。UI 分别显示本地提交与云同步状态。

若现有 CloudBackedProjectStore 的整项目备份同步不能原样覆盖新数据，先补齐备份模型和往返测试，再开放入口。不可先做独立浏览器键值存储，之后再补同步。

## 5. 页面呈现与文字

页面单位使用 point；毫米只用于用户输入换算。画布缩放只作用于页面外层变换，框、照片和文字以同一页面坐标决定位置。编辑和阅读共用页面呈现模型，阅读仅关闭编辑装饰。缩略图可使用较低分辨率，当前页面按需取得合适预览，卸载释放 lease。

文字需先锁定可嵌入、许可明确、覆盖目标中英文字符的字体。`layout-text` 的换行、行距、对齐、溢出结果由编辑、阅读与 PDF 消费。中文输入法组合输入期间不提交命令。字体尚未准备好时，页面不可把替代字体产生的结果保存为正式排版。

L0 选择 Noto Sans SC Regular 作为中英文字体候选，并固定中文 PDF 验证样本和 Chrome/Edge 阅读器，见 [L0 记录](./Layout_L0_Verification.md)。当前仅完成字体覆盖检查，尚未证明 PDF 复制或搜索。正式出口需要在目标 PDF 阅读器中验证中文显示、复制、搜索；若当前字体方案不能通过，调整字体/编码实现并重测，不降低 PRD 的文字承诺。

## 6. PDF 导出与未来网页输出

PDF 输入是点击导出时固定的 `LayoutDocument` 快照。先运行预检，逐页读取所需照片，按物理页尺寸写入图像与真实 PDF 文字；每页完成后释放解码资源。照片分辨率按框在目标阅读稿中的实际显示尺寸选择，低于需要时提示，不凭空放大原图。取消或失败时不启动下载；成功后由浏览器 adapter 创建文件并回收 URL。首版仅导出全部物理页，不做合并对页或印刷拼版。

互动网页作品集下一阶段可实现 `createWebBook(snapshot, assets)`，输出离线 `index.html` 和资源文件。它与 PDF 共享文档解释和素材解析，拥有独立的响应式阅读呈现；不要求 CSS 页面与 PDF 像素完全相同。文字须以文本节点输出，照片使用受控本地资源，避免把 Sequence 的旧 HTML 直接插入导出页。首版只保留这些清晰的数据接口，不实施网页导出或托管。

## 7. 开源项目判断

| 项目 | 取用方式 |
|---|---|
| [book-builder](https://github.com/GhostInTheBus/book-builder) | 参考照片条、模板和裁切交互；其 README 描述的 Canvas PDF 路线不能直接满足这里的可选取文字。仓库首页未显示许可证文件，复制代码前须核实授权 |
| [pdf-lib](https://github.com/Hopding/pdf-lib) | 项目已依赖，作为 PDF 编码基础；自定义字体需验证 `fontkit`、中文编码和目标阅读器行为 |
| [Paged.js](https://github.com/pagedjs/pagedjs) | 未来 HTML 分页阅读的参考；首版固定框编辑和 PDF 不为其重构 |
| [Fabric.js](https://github.com/fabricjs/fabric.js) | 当前矩形框需求已有项目内实现，不加入首版依赖；出现实测缺口再比较 |

## 8. 验证范围与风险关闭

优先验证跨接口的行为：模板生成后手改、页面排序后的对页/PDF 顺序、缺图后重连、一次手势一次历史、刷新恢复、备份导入、云同步、关联删除。使用 50 页和 500 张 Sequence 照片测首版操作和资源释放；200 页、单页 50 对象作为观察样本。正确性与恢复性先于帧率优化，具体阶段门槛见实施计划。
