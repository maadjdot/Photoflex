# Frame 首版实现记录

日期：2026-09-23

分支：`frame`（从 `develop` 的 `d02f146` 创建）

对应：[功能需求](./Frame_PRD.md) · [技术架构设计基线](./Frame_Technical_Architecture.md)

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
