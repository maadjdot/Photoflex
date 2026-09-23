# PhotoFlex 画布 Frame 技术架构

日期：2026-09-20

状态：设计基线；首版实际模块、验证与差异见 [实现记录](./Frame_Implementation.md)。对应 [Frame 功能需求](./Frame_PRD.md)。

核对基线：本设计编写于 `frame` 分支开发前；当前 `frame` 分支从 `develop` 的 `d02f146` 创建。Layout 验证代码保存在原工作区的 Git stash，未进入本分支。

## 1. 架构决策

**将 Frame 作为 WorktableDraft 中的新对象类型，使用现有 Table 会话、命令历史和项目保存队列；页内排版采用局部页面坐标，共享 Layout 模板规则与图片几何计算。**

Frame 属于 Table，不新增独立路由、独立数据库集合或另一套编辑器历史。一个 Frame 嵌入一个页面模型，内部图像框引用 PhotoId。展示尺寸与物理排版尺寸分开保存。

页面外层使用现有 React DOM 定位。首版页面内部同样使用 DOM，并以独立的页面 pt 坐标层和 `overflow: hidden` 裁切照片；指针事件接入 Table 手势流。几何仍为纯函数，不依赖新画布库。原设计建议的 SVG `viewBox` 未采用。

## 2. 当前实现证据与接入点

| 文件或模块 | 已存在能力 | 本次需要增加的内容 |
|---|---|---|
| `src/contracts/worktable.ts` | placements、groups、links、Sequence piles、memos 与命令联合类型 | Frame 数据、命令和明确的失败类型 |
| `src/modules/worktable/worktableEditor.ts` | 纯命令处理、快照撤销重做、复制、层级和寻找空位 | Frame 命令分派；深复制；Frame 参与层级和避让 |
| `src/app/tableSession.ts` | Table 选择、剪贴板、commit 和 editSeq | Frame/图像框选择与 Frame 复制粘贴 |
| `src/app/TableCanvas.tsx` | DOM 世界坐标层、视口变换、图片可见性和画布键盘事件 | Frame 渲染、命中、快捷键范围、适应全部内容 |
| `src/app/useTableGestures.ts` | 卡片、Sequence pile、平移、框选、缩放与临时预览 | Frame 移动/显示缩放/图像框变换/裁切、照片投放 |
| `src/app/TablePage.tsx`、`TableContextToolbar.tsx` | 工作台组装与选择相关动作 | Frame 入口、模板面板、Frame 属性工具条 |
| 原工作区的 `src/modules/layout-l0/imagePlacement.ts` | 已验证 `resolveImagePlacement`、`moveImageByPixels`、Fit/Fill 与焦点约束；当前 `frame` 分支尚无该文件 | 从保存的验证实现提取纯几何逻辑，移入可被 Frame 和后续 Layout 共用的模块 |
| `src/app/PhotoThumb.tsx` | PhotoSource 预览加载、渐进清晰度、lease 释放 | 复用预览生命周期；SVG 消费 URL 与几何，不能仅套 object-fit |
| `src/app/projectWriteCoordinator.ts` | `saveWorktable`、顺序写入、revision 与恢复备份 | 接收包含 Frame 的完整 draft，检查层级及相等性处理 |
| `src/platform/projectStoreData.ts`、`projectBackup.ts` | 校验、迁移、备份解析、复制项目的 ID 映射 | 校验 Frame、深复制与 Frame/照片引用映射 |
| `src/platform/browser/indexedDbSchema.ts` | IndexedDB 升级和旧项目迁移 | 增加 Frame 数据归一化迁移 |
| `src/platform/cloudbase/CloudBackedProjectStore.ts` | 项目备份格式的整体云同步 | 兼容包含 Frame 的文档及版本，验证往返保真 |

现状限制：Layout 的五种模板已写入 PRD，但尚无正式共享模板生成器；`LayoutPrototype.tsx` 使用另一套展示模板，不应直接作为生产模板来源。`layout-l0` 是原工作区的验证代码，不代表正式 Layout 模块已经完成，当前分支需要先引入所需的纯几何实现。

## 3. 模块职责与调用方向

| 模块 | Interface（调用方需知道的内容） | 内部负责 |
|---|---|---|
| 页面几何 `page-layout` | 生成模板、解析图片放置、由拖动计算焦点 | 模板几何、单位、Fit/Fill、裁切约束；无 React、无持久化 |
| Worktable 编辑模块 | 原有 `execute / snapshot / undo / redo`，增加 Frame 命令 | 数据合法性、原子编辑、复制 ID、模板换图、完整历史 |
| Table 会话与手势 | 选择对象、提交命令、读取临时预览 | 选择层级、拖放目标、一次手势一次提交、取消回滚 |
| Frame 视图 | Frame 数据、照片预览、选中状态和操作回调 | SVG 页面渲染、控制点、弹出面板、属性输入 |
| 现有项目存储 | `saveWorktable(projectId, draft, expectedRevision)` | 本地保存、冲突处理、备份与云同步 |

调用链：用户操作 → Table 会话/手势 → Worktable 编辑命令 → 新 WorktableDraft → 既有 `onCommit` / `saveWorktable` → ProjectStore。视图读取会话快照；图片通过 PhotoSource 独立获取，不进入文档写入链。

关键 seam 位于 Worktable 命令 Interface：调用方提交用户意图，不自行拼装和修补多个 Frame 字段。模板切换、照片容量检查、复制 ID 和焦点重算集中在命令 implementation 内，测试也从同一 Interface 验证。

建议新增文件如下；这是实施落点，不是已创建的源码：

```text
src/contracts/frame.ts
src/modules/page-layout/templates.ts
src/modules/page-layout/imagePlacement.ts
src/modules/worktable/frameCommands.ts
src/app/TableFrames.tsx
src/app/FrameTemplatePopover.tsx
src/app/FrameContextToolbar.tsx
```

`frameCommands.ts` 是 Worktable 编辑模块内部实现，没有自己的 store 或 undo stack。参考原工作区 `layout-l0/imagePlacement.ts` 的验证结果，在本分支建立共享的纯几何模块；将来 Layout 接入时共用该模块。生产包不引入 L0 的字体和 PDF 验证代码。

## 4. 数据模型

以下 TypeScript 为拟议契约，字段名称可在实施时按仓库命名统一；所有尺寸及层级都需有验证规则。

```ts
type FrameId = string & { readonly __brand: 'FrameId' };
type FrameSlotId = string & { readonly __brand: 'FrameSlotId' };
type PageTemplateId = 'single' | 'diptych' | 'triptych' | 'quad-grid' | 'full-page' | 'square-nine-grid';

interface PageImageSlot {
  readonly id: FrameSlotId;
  readonly origin?: 'template' | 'manual'; // 旧数据缺省时视为模板框
  readonly rect: { readonly x: number; readonly y: number;
    readonly width: number; readonly height: number }; // pt
  readonly photoId: PhotoId | null;
  readonly cornerRadiusPt?: number; // 每个图像框独立设置
  readonly crop: {
    readonly mode: 'fit' | 'fill';
    readonly zoom: number; // 1..8，相对于 Fit/Fill 基准
    readonly focal: { readonly x: number; readonly y: number }; // 0..1
  };
}

interface WorktableFrame {
  readonly id: FrameId;
  readonly name: string;
  readonly x: number; // Table 世界坐标
  readonly y: number;
  readonly z: number; // 与卡片、Memo、pile 共用层级
  readonly frontOfPhotos?: boolean; // 显式 Front 后为 true；旧数据缺省为 false
  readonly displayScale: number; // 世界坐标单位 / pt
  readonly page: {
    readonly widthPt: number;
    readonly heightPt: number;
    readonly background?: 'white' | 'black';
    readonly cornerRadiusPt?: number; // 旧数据兼容；新编辑写入图像框
    readonly bleedPt?: number; // 编辑辅助线，不作为导出设置
    readonly templateSource: {
      readonly id: PageTemplateId;
      readonly version: number;
      readonly direction: 'horizontal' | 'vertical';
      readonly marginsPt: { readonly top: number; readonly right: number;
        readonly bottom: number; readonly left: number };
      readonly gapPt: number;
      readonly modified: boolean;
    };
    readonly slots: readonly PageImageSlot[]; // 数组顺序 = 槽位/绘制顺序
  };
}

// 扩展现有 WorktableDraft；经迁移后必有，旧文档在入口处补为空。
interface FrameDraftFields {
  readonly frameOrder: readonly FrameId[];
  readonly frames: Readonly<Record<FrameId, WorktableFrame>>;
}
```

设计约束：

- `PhotoId` 是素材身份；`WorktableItemId` 是 Table 卡片实例身份。Frame 持久化仅依赖前者，不能把 Table 卡片 ID 当 PhotoId 保存。
- `FrameId` 与 `FrameSlotId` 每次复制重新生成；照片引用保留，同一照片的裁切参数按槽位独立。
- 页面显示宽高从 `widthPt/heightPt × displayScale` 派生，不存第二组容易失步的 width/height。
- `frameOrder` 保存稳定枚举顺序。默认 Frame 的显示层级低于最低的 Table 照片层级，即使旧数据的 `z` 较高或 Frame 正被选中；显式 Front 设置 `frontOfPhotos` 后按共享 `z` 显示。复制出的 Frame 恢复默认层级。
- `templateSource` 为来源及下一次应用参数，恢复时直接使用 `slots` 的几何。`modified` 在手工变更图像框或页面规格后置 true，重新应用后置 false。
- Full Page 和 Square Nine Grid 忽略边距/间距；九宫格必须为正方形页面，模板应用时转换页面比例。
- 不保存 Blob、File、预览 URL、图像解码结果、DOM、选中状态、临时拖动偏移或未确认裁切。
- 背景仅存黑/白枚举；圆角存每个图像框，出血辅助线存页面数值。旧页面级圆角作为显示回退值，不引入背景对象或通用图层树。

## 5. 共享模板几何

建议 Interface：`generatePageTemplate(spec) -> Result<readonly SlotGeometry[], TemplateError>`。输入模板 ID、方向、页宽高、四边边距和间距；不接收项目、照片库、DOM 或存储。返回几何与默认 Fit/Fill，由编辑命令分配槽位 ID 和照片。

设页面为 W×H；左/右/上/下边距为 l/r/t/b；内容区 Cw=W−l−r，Ch=H−t−b；间距为 g。

| 模板 | 框的几何（页面 pt） |
|---|---|
| Single | `(l, t, Cw, Ch)` |
| Diptych 横向 | n=2，框宽 `(Cw−g)/2`，框高 Ch；x 按框宽+g 递增 |
| Triptych 横向 | n=3，框宽 `(Cw−2g)/3`，框高 Ch；x 按框宽+g 递增 |
| Diptych / Triptych 纵向 | n=2/3，框宽 Cw，框高 `(Ch−(n−1)g)/n`；y 递增 |
| Quad Grid | 框宽 `(Cw−g)/2`、框高 `(Ch−g)/2`，按行优先生成 |
| Full Page | `(0, 0, W, H)` |
| Square Nine Grid | W=H，九个 `(col×W/3, row×H/3, W/3, H/3)`，row/col 为 0..2 |

所有输入必须有限；页面尺寸符合 PRD 范围，边距和间距非负，每个生成框至少 1mm。无效输入返回明确错误，保留当前页面。保持浮点精度，仅显示输入值时四舍五入。

未来 Layout 消费同一生成器，不能复制一份公式。模板版本更新仅影响新应用；已保存几何不随版本重建。

## 6. 三层坐标和渲染

三个坐标空间：浏览器屏幕 CSS px、Table 世界坐标、页面 pt。毫米只在属性输入/显示时转换，`pt = mm × 72 / 25.4`。

已存在的 `screenToWorld` 计算：

```text
worldX = (screenX − stageLeft − viewport.originX) / viewport.zoom
worldY = (screenY − stageTop  − viewport.originY) / viewport.zoom
pageX  = (worldX − frame.x) / frame.displayScale
pageY  = (worldY − frame.y) / frame.displayScale
pageDelta = screenDelta / (viewport.zoom × frame.displayScale)
```

移动整个 Frame 使用 worldDelta；移动图像框与照片裁切使用 pageDelta。照片裁切增量交给共享 `moveImageByPixels` 时，图像框几何也必须使用同一 pt 单位，不能因为函数名称含 Pixels 就传屏幕增量。

外层 DOM 定位在 `(frame.x, frame.y)`，宽高为物理页尺寸乘 displayScale。当前实现的页面内部使用 DOM 与 CSS 裁切，先绘制黑或白背景，再按 slots 数组顺序绘制照片；整页与各图像框分别裁切，防止照片泄漏。出血辅助线仅显示于编辑视图。

使用 `resolveImagePlacement` 的 `drawn` 结果确定 SVG image 矩形，不能再额外使用 cover 导致二次裁切。图片元数据必须使用 PhotoSource 提供或确认的 EXIF 归一化宽高。工具条、名称和手柄以屏幕大小绘制，画布缩小不应把按钮一起缩到不可点击。

## 7. 命令与手势事务

增加意图明确的 WorktableEditCommand 分支：

| 命令组 | 输入与行为 |
|---|---|
| `create-frame` | 模板参数、明确的 PhotoId 输入、位置；检查容量并一次创建 |
| `move-frame` / `scale-frame` | 目标 Frame 和世界坐标位移/显示比例 |
| `update-frame-page` / `rename-frame` | 白名单页面尺寸/名称修改，不接受任意整个对象覆盖 |
| `apply-frame-template` | 新模板及参数、预期槽位 ID；有效修改立即提交，重排模板框并保留手动框与已有照片裁切 |
| `add-frame-slot` / `remove-frame-slot` | 单独增删手动照片框，不受模板槽位数量限制 |
| `bring-frame-slot-to-front` | 将指定图像框移至绘制顺序末尾，重叠时显示在其他框之前 |
| `set-frame-slot-corner-radius` | 修改单个图像框圆角，其他框保持不变 |
| `set-frame-background` / `set-frame-bleed` | 只修改页面样式，验证黑白枚举与数值范围 |
| `fill-frame-slots` | PhotoId 列表，按空槽顺序全有或全无地写入 |
| `replace-frame-photo` / `clear-frame-photo` | 定位 Frame+slot；替换重置裁切，清空保留槽位 |
| `swap-frame-photos` | 两个槽位交换照片与 crop，并按目标几何重新约束 |
| `transform-frame-slot` / `set-frame-photo-crop` | 提交单槽位几何/完成裁切的参数 |
| `duplicate-frame` / `remove-frame` / `bring-frame-to-front` | 原子复制、删除或共享层级调整 |

命令错误至少区分：Frame/slot 不存在、容量不足、无效几何、无效裁切和模板预览过期。由应用层翻译错误文案。增加分支时必须显式处理；当前编辑器尾部有照片删除兜底逻辑，新命令不能误落入该路径。

指针开始保存基线与选择；move 仅更新临时预览；pointerup 提交一个命令；Esc/pointercancel 丢弃预览。无有效变化不产生历史。常规裁切在 Enter/完成时提交，Fill 照片右键拖动则在松开时提交一次。图像框拖动时使用纯几何吸附函数计算页面与其他框的边缘、中心线，并在页面坐标层绘制不接收事件的虚线。

照片投放与普通照片移动必须是同一手势的两种终点：命中 Frame 后提交填图/替换，并丢弃原卡片的临时位移；空位不足时不提交任何命令。多个重叠对象按统一 z 命中最上层实际可接收目标，不向被遮挡 Frame 穿透投放。Frame 内先命中图像框，再命中页面空白；未命中 Frame 时继续既有 Sequence 投放或普通移动规则。

用 Table 会话中的选择种类区分 `frame` 与 `frame-slot`，裁切为临时编辑状态；不用不同对象的多个独立 boolean 组合。为接入 Frame 可沿用现有照片/pile字段，但需保证互斥并同步清除 Memo 选择，不要求本次重构所有 Table 选择模型。

## 8. 数据持久化与兼容

当前常量为 Workspace schema 8、IndexedDB schema 10、Backup schema 3。建议本功能将 Workspace 升为 9，IndexedDB 升为 11；实际合入时若其他功能已占用版本号，顺延并按真实迁移顺序调整。

旧 Worktable 补 `frameOrder: []`、`frames: {}`。新版 `isWorktable` 校验 map/order 一致、Frame 和 slot ID 唯一、有限几何、页面范围、PhotoId 类型及裁切范围；图像框数量可与模板不同，旧框缺少 `origin` 时视为模板框。允许照片源暂不可用，不能以离线为理由删除引用。

迁移必须覆盖 IndexedDB、MemoryProjectStore 所接收的旧数据、备份导入、云端拉取；仅升级 IndexedDB 不足以支持旧云文档。未来版本返回“不支持的文档版本”，不按旧结构重新保存。

Backup 外层可继续为 3，因为仍是同一 project/sequences/versions/photoManifest 结构；**必须以 project.schemaVersion 分派迁移与兼容性校验**。当前 `projectBackup.ts` 对 `<8` 的判断需改为明确的迁移链，保证 Workspace 8 的现有备份可导入，新 Workspace 9 在旧应用中不会被静默降级。

需要逐项覆盖：

- `createEmptyWorktable` 初始化新集合；`copyDraft` 深复制 Frame、page、templateSource、margins、slots、rect、crop 和 focal，避免撤销快照共享嵌套对象。
- 项目导出、保存失败恢复备份、云备份整体包含新字段。查看相等性比较是否覆盖 Frame，禁止只比较旧字段而跳过保存。
- `projectBackup.ts` 的复制恢复逻辑新增 FrameId/FrameSlotId 映射，更新 frameOrder 和 map key；PhotoId 继续使用已有项目级映射器。
- Memory/IndexedDB 当前 photoManifest 均按项目 sourceId 收集照片，并非只扫描 Table 卡片，因此不需要新建 Frame 专属清单。验证仅在 Frame 中使用、已无 Table 卡片的照片仍包含在备份；删除来源后则保留页面引用并按缺图规则恢复，不承诺备份包含原片。
- Frame 使用共享层级：编辑器 `maximumZ`、创建 Sequence pile 所用 `maximumWorktableZ`、渲染层级和命中排序同步纳入 Frame。
- 创建避让和“适应全部内容”的包围盒加入 Frame；同一页面内部对象不作为独立 Table 障碍物。
- 现有删除卡片、删除 Sequence、结构性 draft 替换和 `resetCommittedDraft` 都要保留 Frame 字段；删除 Project 则随工作区清除。

沿用 `projectWriteCoordinator.saveWorktable` 和 expected revision 保存；不在 Frame 控件中直接写 IndexedDB，不新增自动保存计时器。不能用迟到的旧保存回执覆盖更新的 Frame 会话状态。

## 9. 照片预览与性能

延用 PhotoSource/PreviewLease：按 PhotoId 与需要的清晰度申请预览，异步结果过期和视图卸载均释放 lease；同图多次使用依赖已有 PhotoSource 缓存，不创建第二套图片缓存。

`PhotoThumb` 当前仅暴露 fit，并不满足 SVG 自定义 crop。实施时可从其已有逻辑提取一个共享预览 hook，供 PhotoThumb 和 Frame SVG 消费；不要复制一整套加载逻辑。Frame 渲染所需元数据也经现有 PhotoSource 获取。

按 Frame 外部包围盒实施可见性裁剪：世界坐标视口扩展既有屏幕 overscan，只挂载可见 Frame 的图片。正在拖动、选中或裁切的页面保留挂载，避免手势中消失；页面轮廓可保留轻量占位。

画布交互使用派生几何和临时状态，数据库只在完整命令后写入。当前撤销为整份 draft 快照，首版不新建增量历史；以现有大工作区基线加 50×4 Frame 压测快照成本，测到实际问题后再决定优化。

## 10. 验证策略与实施顺序

| 阶段 | 工作 | 必须证明 |
|---|---|---|
| 1 数据及几何 | 新契约、共享模板/裁切函数、迁移、Frame 编辑命令 | 六模板几何；非法参数不写入；旧项目可读；复制与撤销无嵌套共享 |
| 2 页面接入 | Frame 按钮与模板面板、渲染、显示缩放、选择与键盘 | 在现有 Table 中创建和恢复；页面坐标不随显示缩放变化 |
| 3 照片编辑 | 拖放、替换、换位、裁切、框变换与模板预览 | 容量不足原子失败；原卡片不移动；手势取消恢复；模板切换一次撤销 |
| 4 保存和回归 | 备份/云、缺图恢复、结构性动作及可见性 | Frame-only 照片可恢复；云往返不丢字段；旧功能与性能基线可接受 |

纯模块测试通过公开编辑 Interface 验证最终数据与撤销结果；模板几何测试直接验证页内关系和尺寸，不只比较同一生成函数的输出。坐标测试覆盖 Table zoom 0.25/1/3 与多种 displayScale 的组合，验证相同页面增量得到相同结果。

存储契约测试覆盖 Memory 与 IndexedDB；备份测试覆盖现有 schema 8 文档迁移、当前文档复制恢复及仅 Frame 引用照片。云同步测试沿用现有替身证明结构往返，无需为文档工作连接或修改真实云项目。

端到端重点覆盖：选中两张照片创建 Diptych → 替换一张 → 裁切 → 复制 → 更换模板 → 撤销 → 刷新恢复；另测 Frame 与 Sequence 重叠时的投放和原卡片复位。浏览器范围沿用现有 Chrome/Edge。

实现后执行与修改相关的测试、类型检查和构建，再运行 Table 关键端到端回归。本次只交付文档，未修改生产代码、迁移数据或运行上述功能测试。
