# M1阶段改动意见03

> Legacy：这是 M1 期间的历史改动记录。文中 `Pool` 相关表述仅代表当时的 UI/迁移输入；当前产品以 Contact Sheet / Table / Sequence 为准。

## UI部分
- 严格按照 https://www.figma.com/design/L2BmAx9Nq31ecvATvwFZaO/M1_v2?node-id=1-490 的设计稿修改Contact Sheet的前端设计（D:\project\Photoflex\UIUX\M1_v2 中有PNG图片可供参考）；
- 左上角Photoflex字体使用Ancizar Serif，其他字体不变；
- Home页拖放project删除的部分增加垃圾桶图标(M1_v2 有PNG档案参考)
- 大图预览部分，照片会因改变尺寸显示全图而闪烁，修改这个错误，使大图预览时一开就能显示全图；
- 在Photoflex进行放缩时，会触发浏览器的放缩，修改这个错误，只触发photoflex的放缩；

## Contact Sheet性能优化

### 目标与采用原则

- 参考 [sweet-album](https://github.com/leuvi/sweet-album) 的性能设计，但不直接安装或替换；只借鉴滚动合帧、可见区域渲染、Resize 锚点、缩略图内存有界等机制；
- 不采用 sweet-album 的命令式 DOM 渲染器，继续使用 React；不引入 `takenAt`/EXIF 依赖，不改异步 `PreviewLease` 为同步 URL；
- sweet-album 的“十万张照片”结论不能直接当作验收结果，必须用自己的数据路径重新测试。

### 现状与范围

- 固定行高虚拟化、overscan、`ResizeObserver`、320px WebP、`PreviewLease` 引用计数、idle Object URL LRU 已经实现，本轮只需回归；
- 当前静态审查确认的首要瓶颈是 `findPhotoIssues` 每页串行检查 Missing（100 张 ≈ 100 次异步 FS）；缩略图首次生成、快速滚动时的并发解码和增量分页合并继续通过性能计数观察，不能提前断言只有一个瓶颈。

### 本轮改动

- 抽出纯 TS module（`contactSheetVirtualizer.ts`）：列数、卡片尺寸、总高度、可见范围、overscan 计算移出 `M1App.tsx`；纯计算不读 DOM，便于测试；
- `scroll` 把最新位置写入 ref，用 `requestAnimationFrame` 合帧为每帧最多一次计算；React state 保存可见起止范围而不是每个 `scrollTop`，范围不变则不重渲染；`onNearEnd` 仍读取滚动容器的实时位置；overscan 上下各 2 行、集中为可调参数；
- Pool 通过 `useMemo` 转为 `Set<PhotoId>`，用 `has()` 取代每张卡片的数组 `includes`，避免每次渲染重复创建 Set；
- Missing 脱钩前，先建立 `thumbnail` / `preview` 失败到 Contact Sheet 状态的回传路径；`photo-not-found` 才加入 `missingPhotoIds`，`permission-lost` 只提示重新授权，`preview-unavailable` 显示预览失败，三者不能混为 Missing；
- 错误回传接通后，再从 `listPhotos()` 的首屏和分页关键路径移除同步 `findPhotoIssues`，先返回照片索引并显示卡片；如果产品要求未滚动到的照片也要提前显示 Missing，再按基准增加并发上限 4、取消与增量回传的后台检查；
- Resize 锚点保持为「尽力而为」项，放最后、可延后；滚动时只更新内存锚点，停止后再持久化，不逐帧写 IndexedDB。

### 实施顺序

1. 先加性能计数与回归测试，分别记录索引读取、Missing 检查、缩略图首次生成、进行中缩略图任务和增量分页合并；
2. Pool 转 Set；
3. 抽纯虚拟化 module + rAF 合帧 + 相同范围跳过；
4. 接通 `thumbnail` / `preview` 错误回传，并测试 Missing、权限丢失和普通预览失败的分类；
5. 移除 `listPhotos()` 中阻塞显示的同步 Missing 检查；只有产品需要且基准支持时才加后台并发检查；
6. Resize 锚点最后、可延后；
7. 用 1,000 / 10,000 / 50,000 合成 `PhotoRef` 测试（50,000 只验证挂载数不随总数线性增长，不是目标规模）；只有基准证明 DOM 创建或缩略图规格是瓶颈，才评估节点池 / 多尺寸缓存。

### 测试与验收

- 纯 module 覆盖：0 张、1 行、多行、顶部/中部/底部、overscan 越界、容器宽度改变列数；
- 连续 scroll 时同一帧最多更新一次；卸载后不再更新 state；
- 照片总数 1,000 → 50,000 时，挂载 `PhotoTile` 与活跃 lease 只由视口与 overscan 决定；
- 快速滚动后离开 overscan 的 lease 释放，反复滚动不持续增加内存；
- 元数据快速路径的 `listPhotos()` 不访问照片文件，首批卡片不等待整页 Missing 检查；
- `thumbnail()` / `preview()` 返回 `photo-not-found` 时对应照片显示 Missing；返回 `permission-lost` 时只提示重新授权，不能误标 Missing；
- 如果启用后台检查，切换 Source 后旧结果不写入新页面；
- 保留 Space / Enter / 方向键 / Shift 连选 / 加入 Pool / Missing / 右侧 Pool 的现有行为。


# M1阶段改动意见02
- 增加删除project的功能，按住project方块拖入下方垃圾桶进行删除，在project部分Add photo folder旁边也增加删除project的按键；
- 照片大图预览部分依旧无法展示完整照片，可以参考prototype解决这一问题；
- 大图预览部分滚轮放大与上下冲突了，放大缩小变为Ctrl+滚轮；
- 导航栏放在网页正中间；
- 左侧栏收起时project字样像右侧栏收起时一样变为竖排；
- 需要更好适配不同尺寸的桌面窗口，不能只按 1440×1024 设计稿做固定比例放大；
- 建议以 1440px 作为主要内容最大宽度，宽屏时内容居中并保留稳定的左右留白，避免 1920px 以上页面被无限拉宽；
- 顶部导航使用 Grid 居中布局，不要使用随视口宽度变化的固定 `margin-left`；
- 左右侧栏使用统一的 `clamp` 尺寸 token，中间工作区使用 `minmax(0, 1fr)` 自适应；
- 空状态面板和主要内容高度使用 `clamp` / `vh` 适配不同桌面高度，同时保持 Figma 1440×1024 下的视觉比例；
- 响应式回归至少验证 1280×800、1440×1024、1920×1080、2560×1440 四种桌面尺寸；
- 预览大图无法完整显示的原因：当前 `fit` 与 `zoom` 使用两套尺寸规则，普通滚轮也会触发缩放；放大时又使用扫描阶段的 `photo.width` 计算图片宽度，没有使用图片实际加载后的尺寸，遇到不同方向或带 EXIF 旋转的照片时容易超出预览区域，最终只能看到被滚动容器裁掉的局部；
- 修改预览布局：`fit` 模式改为根据预览安全区域使用 `max-width: 100%`、`max-height: 100%`、`width: auto`、`height: auto` 和 `object-fit: contain`，确保横向、纵向、正方形照片都完整显示；
- 修改缩放交互：只有 `Ctrl + 滚轮` 才能放大/缩小，普通滚轮不改变缩放状态；保留 `Space` 适应画面，并增加明确的 Fit/Reset 入口和当前缩放比例提示；
- 图片加载后以 `naturalWidth` / `naturalHeight` 作为预览尺寸来源，并在读取尺寸时处理 EXIF 方向，避免使用未准备好或方向错误的元数据计算放大宽度；
- 放大模式使用可滚动容器承载超出视口的原图，适应画面模式禁止裁剪；预览切换照片或重新打开时默认恢复 Fit；
- 预览回归至少覆盖横向、纵向、正方形和带 EXIF 旋转的照片，并在 1280×800、1440×1024、1920×1080 三种桌面尺寸确认整张照片可见；


# M1阶段改动意见01
- UI没有按我的来做：严格按照 https://www.figma.com/design/VhqX4TvzZ1Dl6vDS9owRTD/Photoflex_frontend?m=auto&t=20gV9ELzUdYZLTij-6 的设计稿来做，不要用自己的东西做；除了交互说明里的，不要增加设计稿中没有的文字；不要增加设计稿中没有的模块
- 字体使用Ancizar Serif，背景颜色为#FFFFFF，主要颜色为#FFFCF9,黑色按钮#1C1814，框线颜色#D9D0C6；
- 离开/刷新网页无法重新读取照片（显示missing），refresh不成功
- 对于不同的显示比例，要如何适配使UI不会变形？；
- Project封面使用project里的第一张照片；
- contact Sheet滚动停下时时会强制回到照片最上方显示完整，移除这个设计，滚动停止就停在原地；
- 右侧pool栏并没有整栏收起来，只把照片收起来了;
- 变换project会丢失照片，使得要重新扫描；
- 大图预览部分面对不同尺寸的图片会裁剪，修复使得对于不同尺寸的照片都能够显示完整照片；
- 预览的图片在整个页面中心，覆盖左右侧栏
- Pool缺少大图预览功能
