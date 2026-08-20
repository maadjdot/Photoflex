# PhotoFlex 核心工作流可点击原型

这是用于用户访谈的可丢弃原型，不是正式产品代码。方案 B 已被选为唯一方向，A/C 方案与切换器已经移除。

## 在线体验

- 真实测试入口：https://maadjdot.github.io/Photoflex/
- 快速演示入口：https://maadjdot.github.io/Photoflex/?demo=sequence

建议使用桌面版 Chrome 或 Edge。真实测试入口会先建立 Project，再允许连续添加多个本地 JPEG 资料夹作为独立 Source；照片仅通过浏览器本地 Object URL 展示，不会上传，刷新或关闭页面后本轮状态会清空。

它现在回答八个问题：

1. 新用户能否理解 Project、Source 和 Contact Sheet 的层级关系？
2. 用户能否连续添加多个 Source，并理解 Loading、Partial、Offline、Permission Lost 的状态与下一步出口？
3. 切换 Source 后，Project 共用的 Pool 是否仍能保留来自不同资料夹的照片？
4. 1200 张 JPEG 能否通过每页 60 张的增量渲染保持可操作，而不是让页面一次解码全部照片？
5. Contact/Pool 的“整图单击选择、按钮进入预览”是否比双击预览更清楚？
6. 用户能否在大图预览里直接选择或移除照片，并理解操作作用于哪个阶段？
7. 白板、Sequence 序列全景和完整比例大图是否支持连续判断与排序？
8. Compare 是否能直接选择任意两个版本，并通过版本全景完成判断？

## 启动

先确认终端位于项目根目录：

    cd D:\project\Photoflex
    python -m http.server 4173 --directory ".\prototypes\photoflex-core-prototype"

然后打开：

    http://localhost:4173/index.html

如果终端已经位于本原型目录，也可以直接运行：

    python -m http.server 4173

出现 favicon.ico 404 不影响原型。结束服务时按 Ctrl + C。

如果浏览器仍显示旧版本，先打开带验收参数的新地址：

    http://localhost:4173/index.html?demo=sequence&whiteboard=1

然后按 Ctrl + F5 强制刷新。原型入口已为 app.js 与 styles.css 增加版本参数，之后普通刷新也会加载 feedback-10 资源。

## 当前核心路径

1. 从“已有照片”或“核心问题”进入，输入名称并建立 Project；
2. 连续添加多个本地 JPEG 资料夹；每个 Source 独立显示名称、数量、Loading／Partial／Offline／Permission Lost 状态和恢复出口；
3. 点击一个 Source 进入它的 Contact Sheet；切换 Source 不会清空 Project 共用的 Pool、Sequence 与 Version；
4. 浏览器用 Object URL 为每个 Source 读取最多 1200 张；读取期间已有照片可先使用，Contact Sheet 每次只渲染 60 张；
5. 使用分页、全选本页或反选本页建立最多 60 张的跨 Source Pool；Pool 卡片标明照片来源；
6. 单击整张 Pool 照片加入或移出 Sequence；预览按钮不改变选择，移除照片后保持原来的滚动位置；
7. 在大图里直接选择或移除照片；Contact 操作本次选择，Pool/Sequence 操作当前 Sequence，Compare 历史版本只读；
8. 在 Sequence 对照片全选、反选或批量移除；拖曳改变顺序，拖四角改变单张照片尺寸；
9. 进入序列全景或 5200 × 3600 白板继续判断；三个横向/二维区域都会接管触控板 wheel；
10. 保存至少两个命名版本；在 Compare 标题右侧直接选择两个版本进行比较；
11. 点击 Compare 版本模块进入版本全景，再点击照片查看完整比例大图；
12. “清空本轮编辑”会清空 Pool、Sequence、版本与布局，但保留当前 Project 和所有 Source。

## 界面预览

| Contact Sheet | Sequence 横向 | 自由白板 | Compare |
|---|---|---|---|
| ![Contact Sheet](./visual.png) | ![Sequence 横向](./visual-sequence.png) | ![自由白板](./visual-immersive.png) | ![Compare](./visual-compare.png) |

| Sequence 网格 | Sequence 序列全景 | 单张大图预览 | Compare 版本序列全景 |
|---|---|---|---|
| ![Sequence 网格](./visual-grid.png) | ![Sequence 序列全景](./visual-panorama.png) | ![单张大图预览](./visual-preview.png) | ![Compare 版本序列全景](./visual-version-preview.png) |

预览中的 Sequence 与 Compare 使用验收预置数据；正常打开会先进入 Project 建立流程。

仅用于界面验收的预置状态：

- Project / Source 状态：http://localhost:4173/index.html?demo=project
- Sequence + Pool：http://localhost:4173/index.html?demo=sequence
- Sequence 网格：http://localhost:4173/index.html?demo=sequence&view=grid
- Sequence 序列全景：http://localhost:4173/index.html?demo=sequence&panorama=1
- 自由白板：http://localhost:4173/index.html?demo=sequence&whiteboard=1
- 单张大图预览：http://localhost:4173/index.html?demo=sequence&preview=P03
- Compare：http://localhost:4173/index.html?demo=compare
- Compare 版本序列全景：http://localhost:4173/index.html?demo=compare&version=v1

## 建议访谈脚本

先不要解释 Pool、Sequence 或 Compare 选择规则，让受试者边操作边说：

1. “请选择你想从照片开始，还是从一个核心问题开始。”
2. “请建立一个 Project，并连续添加至少两个照片资料夹。”
3. “请告诉我这些资料夹之间是什么关系，以及每个状态意味着什么。”
4. “请点进一个资料夹，从照片中选出一部分放进 Pool；再切换另一个资料夹继续选择。”
5. “请确认 Pool 是否同时保留了两个资料夹的照片，并建立任意长度的序列。”
6. “请点开一张大图，在大图中选择或移除它，再确认列表里的状态是否同步。”
7. “请试试全选、反选和批量移除，再确认序列是否符合你的想法。”
8. “请从 Sequence 标题右侧进入序列全景，再点开一张竖图查看完整大图。”
9. “请进入白板，框选多张照片并一起移动，然后尝试批量移除。”
10. “请先放弃一次白板改动，再重新进入并保留一次改动。”
11. “请给当前序列起一个名字并保存，再改变序列并保存另一个版本。”
12. “请点击一个版本进入序列全景，再点开其中一张照片。”
13. “请记录两个版本各自的判断，并直接选择你想比较的两个版本。”
14. “请打开另一个版本继续调整，再回到比较。”

观察并记录：

- 用户是否能说清 Project 包含多个 Source，而 Contact Sheet 只显示当前 Source；
- 用户是否理解 Loading、Partial、Offline、Permission Lost，并能找到继续或重新选择资料夹的出口；
- 用户从第二个 Source 选片后，是否会确认 Pool 中的照片仍属于同一个 Project；
- 用户是否理解灰阶照片已经进入 Pool；
- 用户是否理解单击整张照片是选择，而“预览大图”不会改变选择；
- 用户是否理解大图中的选择/移除会同步回当前 Contact 或 Sequence；
- 用户是否自然尝试拖曳，以及放置位置是否符合预期；
- 用户是否理解横向/网格是同一 Sequence 的两种视角；
- 滚动条和左右箭头哪个先被发现，是否需要同时保留；
- 用户是否把 Sequence 照片拖曳理解为排序、把四角拖曳理解为缩放；
- Pool 有很多照片时，用户是否能发现模块内部滚动；
- Pool 勾选后滚动位置保持不变，是否减少寻找上下文的成本；
- 用户是否把白板理解为自由空间，能否发现框选、成组移动和批量移除；
- 用户是否理解“保留排序退出”和“放弃改动退出”的差异；
- 用户是否能通过分页处理 1200 张照片，并理解全选只作用于当前页且受 60 张上限约束；
- 用户是否把序列全景理解为连续观看入口，而不是另一个编辑界面；
- 用户点击照片后是否自然使用界面箭头或键盘方向键连续观看；
- 用户保存前是否自然理解版本名称输入框；
- 用户是否理解需要直接选择两个版本进行比较；
- 用户是否把 Memo 写成版本目标、判断理由或待办事项；
- 用户是否理解标题右侧版本包只是选择比较对象，不会打开或覆盖版本；
- 用户是否能取消一个版本并换选另一个版本；
- 用户是否理解“打开版本”创建工作副本而不是覆盖历史。

## 原型边界

- Project、Source 与全部编辑状态都在浏览器内存中，刷新即清空；
- Pool 模块位置与尺寸、照片大小、白板位置和批量选择同样只保留在当前内存；
- 本地导入只接受 JPEG；每个 Source 使用独立浏览器 Object URL 引用，不上传、不生成代理图、不保存数据库；
- 未导入文件夹时，缩略图仍使用 CSS 生成的抽象占位图；
- 1200 张图库采用每页 60 张的原型级分页，不是正式产品的虚拟滚动实现；
- Sequence 排序使用浏览器原生拖放；Pool 模块调整、白板框选/移动与四角缩放使用 Pointer Events，仅验证桌面鼠标心智模型；
- 原型结论应回写 PRD/ADR；不要直接把这份代码升级为生产实现。

## 本地验证

运行以下命令可复查 comment.md 中要求的状态转换：

    node prototypes/photoflex-core-prototype/smoke-test.js
