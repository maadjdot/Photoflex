# Frame 首版实现记录

日期：2026-09-23

分支：`frame`（从 `develop` 的 `d02f146` 创建）

对应：[功能需求](./Frame_PRD.md) · [技术架构设计基线](./Frame_Technical_Architecture.md)

## 2026-10-07 更新

- Canvas 与 Layout 的纯色内边框新增“细白边”开关，默认开启；关闭后边框直接贴合照片。设置随文档保存、撤销和复制，JPEG 与 PDF 导出使用相同白边设置。

## 2026-10-06 更新

- 所有当前可创建的模板默认使用 Pure White（纯白）纸张，包括 Gallery；模板预览同步显示纯白。
- 常规裁切与右键拖动裁切支持以鼠标位置为中心的滚轮缩放，范围仍为 100%–800%。裁切时滚轮不改变 Table 视口；Done/Enter 提交，Cancel/Esc 取消。
- Caption 保留文字、字体、字号、颜色和对齐设置，通过页面拖动定位；右侧栏移除 Caption 的 XYWH 输入。
- 右侧 Frame 设置加入 Export JPEG，将完整页面导出为一张高画质 JPEG，包含照片裁切、纸张材质、边框、圆角和 Caption。使用原始照片，按 300 dpi 渲染，长边最大 8192 像素；不包含 Table 工具、选框或空照片框提示。照片来源不可用时显示错误并允许重试。
- 修复指针捕获阻断照片框双击进入裁切的问题。
- 内边框随照片圆角变化，照片半径为零时保持直角；Fit 模式的裁切区域和内边框均跟随可见照片范围，JPEG 导出同步采用相同几何。
- 右侧设置栏统一使用黑白灰控件，并补齐模板、纸张、内外边框、说明文字、裁切及操作按钮的中文。照片、纸张和边框色板显示所选内容的实际颜色。
- Frame 样式由主入口统一加载，侧栏新样式直接定义在共享样式中，避免访问 Layout 后再次加载旧样式造成浮动圆角侧栏回退。

## 已落地范围

- Table 左侧新增 Frame 入口，使用 Layout 需求中的 Single、Diptych、Triptych、Quad Grid、Full Page 五种模板，以及 Frame 专用的 Square Nine Grid。九宫格创建 3×3 个正方形框并铺满正方形页面。选中的 Table 照片按空间顺序预填；超出容量时明确选择“仅使用前 M 张”。创建后视口定位到新页面。
- Frame 是 Table 画布对象，可以移动、改变显示比例、命名、置顶、复制、删除，并与现有 Table 历史和保存队列共用撤销、重做及持久化流程。
- Table 照片默认绘制在 Frame 页面之上，选中页面也不会盖过照片。对 Frame 主动执行 Front 才将它抬到照片之上；旧项目的 Frame 按同一默认规则显示，复制 Frame 后恢复默认层级。
- 页面支持 A4、A5、Letter、Square、Panoramic 和自定义物理尺寸，以及横竖方向。模板、方向、四边边距和间距一经修改即更新页面。Frame 设定栏位于画面右侧，选中 Frame 时取代 Photo Sources；选中图像框时在 Frame 设置下方展开该框的位置、尺寸、独立圆角和照片操作。页面背景可选黑或白，并支持出血辅助线；暂不提供 Export DPI 或 Caption。
- 照片可从 Table 卡片或素材浏览器拖入图像框；多张照片可投放到页面空白处按空位顺序填入。选中照片的左侧功能栏不显示“Place in Frame”。容量不足时整批拒绝，原 Table 卡片保持位置。
- 图像框支持独立增加、按钮或 Delete/Backspace 删除、选择、置顶、移动、八点缩放、Shift 等比缩放与数值定位；拖动时显示页面及其他图像框的对齐虚线。照片支持 Fit/Fill、焦点拖动、100%–800% 缩放、交换、替换和清空。Fill 照片可右键拖动调整裁切，松开提交一次；常规裁切在 Done/Enter 时提交，Esc 可取消。
- 照片首次放入图像框并完成加载时淡入、轻微缩放；偏好减少动态效果时不播放。预览资源按 Frame 中的 PhotoId 管理，图像框置顶不会释放已加载照片或使其回到 Loading。
- Table 框选在画布边缘自动平移时固定画布坐标中的起点，选区随画布移动并持续扩展；结束时仍包含平移前框住的照片。
- 页面数据包含真实图像框几何、PhotoId 引用与独立裁切参数。项目 Workspace schema 为 9，IndexedDB schema 为 11；旧项目、备份导入和项目复制都处理 Frame 数据，离线素材保留引用并显示缺图状态。

## 实际模块边界

`src/contracts/frame.ts` 定义页面、图像框及编辑命令。`src/modules/worktable/frameLayout.ts` 实现 pt/mm 换算、六种模板和 Fit/Fill 纯几何；`frameCommands.ts` 验证并原子更新 WorktableDraft。`TableFrames.tsx` 负责页面与图像框交互，`FrameSettingsPanel.tsx` 负责右侧上下文设定栏，`TableCanvas.tsx` 负责画布可见性、键盘层级和投放命中；项目存储继续使用原有 Table 写入链。

首版页面采用 DOM 物理坐标层与 CSS 裁切，没有采用架构草案中的 SVG `viewBox`。模板生成规则与 Layout 文档保持一致；目前尚未将这组几何函数接入未来正式 Layout 工作区。

## 验证

- TypeScript 检查与生产构建通过。
- Vitest：覆盖模板几何、独立增删图像框、编辑历史、照片拖入、右键裁切、框选边缘连续平移、迁移、备份和 Table 恢复。
- Playwright：Frame 场景在 Chrome 和 Edge 均通过，覆盖创建、即时模板切换、图像框增删、右侧设定栏、复制、刷新恢复、1280×800 面板边界与关闭方式；另有 Table 边缘自动平移框选回归，验证先前照片与后续照片同时入选。
- 全量 Playwright 中，Frame、Contact Sheet、Sequence UI、启动与本地化共 10 项通过；6 项旧用例因与 `develop` 当前界面不一致而失败：PDF 用例寻找已从 Sequence 页面移除的按钮，备份用例寻找已更名的首页标题和已移除的备份文件入口。这些测试在本分支前的 `develop` 源码中已有同样的界面差异。

## 后续验证

- 用真实照片目录做一次离线、重新连接及备份恢复的浏览器实测；现有自动化已验证数据结构与 MemoryPhotoSource 路径。
- 在目标设备上测量 50 个四图 Frame 的滚动与拖动性能。实现按可见范围挂载 Frame，预览 lease 在卸载时释放，但尚未记录设备耗时。

## 模板扩展（2026-10-06）

Frame 入口改为“类别 → 模板”的两级选择，共 17 个模板：Plain Page 保留原有 6 款；Instax 包含 mini、square、wide；Polaroid 包含 Classic 600、Square type、Land camera；Sheets 包含 4×3 方形印相、36 张 35mm 胶卷、30 张黑白印相、Portra 400 三联；Frames 包含 Gallery single。

右侧 Template 随当前类别显示相应二级选项。移除边距、间距和出血编辑项；复用 Layout 的 17 种纸张颜色及 6 种材质，增加整页 Cover/Contain、即时照片 Caption 和印相标签。Gallery 支持 10 种边框颜色，以深色为主，并支持自定义颜色。胶片模板包含边码、紧凑数据带、扫描颗粒及黑白照片效果。

新样式随 Frame 保存、复制和撤销；旧 Frame 的黑白背景继续兼容。跨类别切换使用目标模板的物理尺寸，并保留现有照片引用、自定义图像框、纸张和文字。24×30 英寸的 Gallery 页面使用 Frame 专用尺寸范围，Layout 的尺寸规则保持原样。纸张控件和样式抽取为共享组件。

## 外观设置更新（2026-10-06）

- 模板工具移除 Sheets／Contact Sheet 分类，当前提供 Plain Page、Instax、Polaroid、Frames 共 13 个模板。已有印相页面继续读取，创建入口不再提供印相模板。
- Instax 和 Polaroid 的所有预设默认使用 Pure White。Paper color 增加 Custom，支持拾色器及十六进制颜色；与 Layout 共享设置。
- 浅色纸张使用原始纹理亮度和 soft-light 混合，去掉用于增强纹理的亮度压低及 multiply 混合。Layout PDF 同步采用相同规则。
- Inner Edge 替代固定照片白色光晕：默认 None，也可使用颜色边缘或卡纸斜切，设置颜色与宽度。
- Gallery Frame Edge 支持外框宽度、平面／木纹／拉丝金属／立体斜切材质、阴影强度及照片浮起高度。
- Caption 支持所有普通、即时相纸和 Gallery 页面；复用 Layout 字体，设置位置与文本框尺寸、字号、颜色、粗体／斜体和对齐。画布拖动提交一次编辑；修改纸张尺寸或模板时按页面比例调整已设置的文字框位置。
- 内外边缘与 Caption 样式均随项目保存、复制及撤销恢复。字体样式移到共享样式文件，Table 无需先打开 Layout 即可使用同一字体。
