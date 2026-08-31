# PhotoFlex 网页端方案讨论总结

> 本文整理自“网页端方案”开始的架构讨论，作为后续网页端设计的统一上下文。本文只记录方案和决策，不代表已经完成网页端实现，也不修改当前 Tauri Spike 的结论。

## 1. 结论摘要

PhotoFlex 建议采用“同一套共享核心、两套平台适配”的架构：

- 桌面端继续使用 Tauri 2 + React + TypeScript + Rust；
- 网页端使用 React + Vite + TypeScript；
- 白板、Sequence、状态模型和接口契约在两端共享；
- 本地文件、数据库、缓存、导出和权限能力由 Tauri 与网页端分别实现；
- 网页端正式项目不能只依赖浏览器本地存储，必须增加用户账户和服务端持久化；
- 网页端图片导入采用上传到云端的方式，而不是保存用户电脑上的绝对路径；
- 白板 500 项以内优先使用 DOM，超过 500 项再考虑 PixiJS/WebGL；
- MVP 先实现本地照片导入、项目保存和白板编辑，暂不优先实现多人协作和复杂云盘集成。

## 2. 网页端技术栈选择

### 2.1 推荐：React + Vite + TypeScript

这是当前 PhotoFlex MVP 最适合的网页技术栈：

- 启动和构建简单；
- 适合照片网格、Sequence、白板等高交互界面；
- 可以复用现有 React/TypeScript benchmark UI；
- Vite 构建结果是静态文件，可部署到静态托管服务。[Vite 构建文档](https://vite.dev/guide/build)、[Vite 静态部署文档](https://vite.dev/guide/static-deploy)

PhotoFlex 当前主要问题是照片处理和交互性能，不是 SEO 或服务端首屏渲染，因此 MVP 阶段不应为了服务端渲染引入不必要的复杂度。

### 2.2 可选：Next.js

Next.js 适合后续发展为云端 SaaS 的阶段，包括：

- 用户登录；
- 项目分享；
- 团队空间；
- 服务端 API；
- 云端缩略图；
- 权限和协作。

Next.js 也支持客户端 SPA 模式，并可以逐步加入服务端能力。[Next.js SPA 文档](https://nextjs.org/docs/app/guides/single-page-applications)

但白板编辑器仍然需要放在客户端组件中，因为它依赖 Canvas、Pointer Events、File API、IndexedDB 和 OPFS 等浏览器能力。[Next.js Client Components 文档](https://nextjs.org/docs/13/app/building-your-application/rendering/client-components)

### 2.3 选择结论

当前选择：

```text
MVP：React + Vite + TypeScript
云端产品成熟后：可以迁移或扩展为 Next.js
白板核心：不依赖 Vite 或 Next.js，保持纯 TypeScript 模块
```

## 3. Tauri 与网页端共享边界

建议把代码按“共享核心”和“平台适配”拆分：

```text
packages/
├── whiteboard-engine/   # 白板 reducer、选择、移动、缩放、顺序回写
├── sequence-engine/     # Sequence 排序、批量操作、undo
├── host-contract/       # 平台能力的统一窄接口
├── renderer-contract/   # DOM / Canvas / WebGL 统一渲染接口
└── benchmark-core/      # 性能采样与统计

apps/
├── tauri-shell/         # Tauri + Rust
├── web-app/             # React + Vite
└── benchmark-ui/        # 现有测试界面
```

适合共享的内容：

- `WhiteboardState`；
- `SequenceState`；
- reducer 和 action；
- 选择、移动、框选和排序规则；
- snapshot、revision 和 diff；
- 项目和素材的接口契约；
- 错误模型和任务状态。

不应强行共享的内容：

- Tauri Rust command；
- 本地绝对路径；
- SQLite 文件访问；
- 浏览器 IndexedDB/OPFS；
- 文件夹授权；
- 原生 PDF 导出；
- Tauri capability。

推荐的适配层：

```text
Tauri：tauri-source、tauri-storage、tauri-export
网页端：web-source、web-storage、web-upload
```

React UI 不应该直接知道 Rust command、IPC channel、Node API 或本地绝对路径。

## 4. 网页端项目保存方案

### 4.1 不能只依赖浏览器本地存储

IndexedDB 和 OPFS 适合用作：

- 离线编辑缓存；
- 缩略图缓存；
- 未上传修改的临时队列；
- 网络断开后的待同步状态。

它们不适合作为网页端正式项目的唯一存储，因为用户可能清理浏览器数据、更换浏览器、更换设备或遇到浏览器存储配额限制。OPFS 是浏览器私有存储，并且受安全环境和配额限制。[MDN OPFS 文档](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system)

### 4.2 推荐的云端持久化结构

```text
用户账户
   ↓
Project API
   ↓
PostgreSQL：项目、Sequence、白板、版本
   ↓
对象存储：原图、代理图、缩略图、PDF
```

数据库保存：

- 用户和权限；
- Project；
- Source；
- Photo 元数据；
- Sequence 顺序；
- Whiteboard 坐标；
- snapshot；
- revision；
- 保存时间和状态。

对象存储保存：

- 原始照片；
- 缩略图；
- 代理图；
- PDF 和导出文件。

### 4.3 项目和照片的数据关系

```ts
interface Asset {
  id: string;
  projectId: string;
  originalName: string;
  contentHash: string;
  originalUrl?: string;
  previewUrl: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  status: "uploading" | "ready" | "failed";
}

interface BoardItem {
  id: string;
  assetId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
}
```

白板保存的是 `assetId` 和布局信息，不应把图片二进制直接放入白板 JSON。

### 4.4 自动保存

推荐采用“本地立即更新、服务端延迟保存”的方式：

```text
用户移动照片
   ↓
界面立即更新
   ↓
IndexedDB 保存 pending 状态
   ↓
停止操作 1～2 秒
   ↓
上传项目快照
   ↓
服务器返回新 revision
   ↓
界面显示“已保存”
```

界面需要明确显示：

- 正在保存；
- 已保存；
- 离线，修改将在联网后同步；
- 保存失败，点击重试。

### 4.5 版本冲突

每次保存必须携带 revision，避免旧页面覆盖新页面：

```http
PUT /projects/project-001
If-Match: revision-12
```

服务器发现当前已经是 `revision-13` 时，应拒绝覆盖并提示冲突。MVP 阶段可以先不实现复杂自动合并，但必须实现版本检查。

## 5. 网页端图片导入方式

Miro 等产品的公开交互包括：

- 从电脑选择文件；
- 从桌面拖拽文件到白板；
- 复制粘贴图片；
- 通过 URL 添加；
- 从 Google Drive、Dropbox、Box、OneDrive 等服务导入。[Miro 内容添加方式](https://help.miro.com/hc/en-us/articles/360017731233-Ways-to-add-content)

Miro 的导入内容会存储在 Miro 的基础设施中，而不是只保留本地文件路径。[Miro 内容导入与存储](https://help.miro.com/hc/en-us/articles/18656338276626-Import-content-from-other-tools-to-Miro)

### 5.1 PhotoFlex 推荐的第一版入口

第一版只需要实现：

1. 上传图片按钮；
2. 桌面拖拽上传；
3. 批量选择图片；
4. 上传进度；
5. 缩略图生成；
6. 上传失败重试；
7. 白板通过 `assetId` 引用照片；
8. 项目自动保存。

暂时不必优先实现所有云盘集成。

### 5.2 批量导入流程

```text
选择文件夹
   ↓
读取 6000 张照片的元数据
   ↓
分批上传缩略图或代理图
   ↓
后台逐步处理
   ↓
素材库边上传边显示
```

界面需要显示：

```text
已发现 6000 张
已上传 420 张
正在处理 30 张
失败 2 张
```

建议同时上传 3～6 个文件，避免一次性占满浏览器和网络资源。

### 5.3 上传后的资源模型

```text
照片文件 → Asset
照片位置 → BoardItem
白板项目 → BoardItem 列表
```

照片移动、缩放和排序时，只修改布局数据，不重新上传照片。

## 6. 白板渲染方案

### 6.1 500 项以内：DOM

继续使用：

```text
React + absolute positioning + CSS transform
```

优点：

- 开发和调试简单；
- 选择和键盘操作方便；
- 可访问性更容易处理；
- 与当前 Tauri Spike 接近。

限制：

- DOM 节点必须限制在 500 个以内；
- 不应因 zoom 改变而错误地删除或增加逻辑项目；
- 视口裁剪只影响渲染节点，不影响白板状态中的项目数量。

### 6.2 超过 500 项：PixiJS/WebGL

如果需要稳定支持 1000～3000 张，建议引入 PixiJS 的 WebGL renderer。PixiJS 官方文档将 WebGL 作为稳定和推荐的路径，WebGPU 仍处于逐步成熟阶段。[PixiJS Renderer 文档](https://pixijs.com/8.x/guides/components/renderers)

```text
WhiteboardEngine
        ↓
计算坐标、选择、命中区域
        ↓
┌──────────────────────┐
│ WhiteboardDomRenderer │
│ WhiteboardPixiRenderer│
└──────────────────────┘
```

DOM 和 WebGL renderer 应共享：

- 坐标；
- 选择结果；
- 框选计算；
- 拖动结果；
- 缩放；
- zIndex；
- Sequence 顺序回写。

## 7. 本地项目、云端项目和混合项目

### 7.1 云端项目

```text
照片上传到对象存储
项目数据保存到数据库
任何设备登录后可以恢复
```

适合正式网页产品，但需要承担照片存储和上传成本。

### 7.2 本地项目

```text
项目数据：IndexedDB / OPFS
照片：用户本地目录
```

适合隐私优先和桌面端，但不能保证换设备后恢复，也不能把本地绝对路径当作网页端长期引用。

### 7.3 混合项目，推荐 MVP 使用

```text
项目数据：服务端保存
缩略图和代理图：上传到对象存储
原始照片：用户选择是否上传
```

这样可以让用户跨设备恢复布局和预览，同时减少第一阶段的原图上传压力。

但需要明确产品边界：如果原始照片只保存在用户电脑上，网页端只能保证项目布局被保存，不能保证换设备后还能显示原始照片。

## 8. 存储成本模型

### 8.1 成本组成

```text
月成本 =
基础服务费
+ 数据库容量
+ 照片对象存储
+ 缩略图和代理图
+ 下载流量
+ 图片处理
+ 备份
+ 日志和邮件
```

你当前约有 6000 张照片，原始数据约 5.84GB。项目元数据通常只有几十 MB，主要成本来自照片、代理图、备份和流量。

### 8.2 Cloudflare R2 估算

R2 Standard 当前公开价格为 $0.015/GB-month；每月包含 10GB 存储、100 万次 Class A 操作和 1000 万次 Class B 操作，直接从 R2 产生的外网流量不收费。[Cloudflare R2 价格](https://developers.cloudflare.com/r2/pricing/)

按当前测试集粗略估算：

| 存储内容 | 估计容量 | R2 月存储费用 |
|---|---:|---:|
| 仅原图 | 5.84GB | $0 |
| 原图 + 缩略图 | 约 7～8GB | $0 |
| 原图 + 代理图 + 缩略图 | 约 12～18GB | 约 $0.03～$0.12 |
| 加一份备份 | 约 24～36GB | 约 $0.21～$0.39 |

公式为：

```text
R2 存储费用 = max(0, 总 GB - 10) × 0.015 美元
```

实际生产预算不应只按原图容量计算，建议按原图的 2.3～2.7 倍预估，以覆盖代理图、缩略图和备份。

### 8.3 Supabase 估算

Supabase 当前公开价格为 Free $0/月，Pro $25/月。Pro 包含 8GB 数据库空间、100GB 文件存储和 250GB 网络流量。[Supabase 价格](https://supabase.com/pricing)

Supabase 适合同时提供：

- PostgreSQL；
- 用户登录；
- API；
- 权限控制；
- Realtime；
- 基础文件存储。

推荐的初期组合：

```text
开发阶段：Supabase Free + R2
正式 MVP：Supabase Pro + R2
```

如果后续用户规模较大，可以继续将数据库、对象存储和图片处理拆分，以便分别控制成本。

## 9. 推荐落地顺序

### 阶段 1：共享核心

- 抽取 `whiteboard-engine`；
- 抽取 `sequence-engine`；
- 定义 `PhotoAsset`、`Project` 和 `BoardItem`；
- 明确桌面端和网页端适配接口。

### 阶段 2：网页端本地 MVP

- 创建 `web-app`；
- 实现真实图片选择；
- 实现拖拽上传；
- 实现 60 张白板；
- 实现 500 张白板；
- IndexedDB 保存临时状态。

### 阶段 3：云端项目保存

- 用户登录；
- 创建项目；
- 保存 Whiteboard JSON；
- 保存 Sequence JSON；
- 上传缩略图和代理图；
- 自动保存和 revision 检查；
- 项目列表和重新打开。

### 阶段 4：高规模渲染

- 先验证 DOM 500 项；
- 如果 1000 项不稳定，再接入 PixiJS/WebGL；
- 复用同一个 `WhiteboardEngine`；
- 不重新实现白板业务逻辑。

### 阶段 5：云端扩展

- 原图上传策略；
- Google Drive、Dropbox 等云盘集成；
- 分享链接；
- 项目权限；
- 多人协作；
- 历史版本和回收站。

## 10. 最终推荐架构

```text
桌面端：Tauri 2 + React + TypeScript + Rust
网页端：React + Vite + TypeScript

共享：
  whiteboard-engine
  sequence-engine
  host-contract
  renderer-contract

网页端存储：
  PostgreSQL：项目和布局
  R2：原图、代理图、缩略图、PDF
  IndexedDB / OPFS：离线缓存和上传队列

白板渲染：
  500 项以内：DOM
  500 项以上：PixiJS/WebGL

桌面端文件策略：
  默认链接本地照片目录

网页端文件策略：
  默认上传照片或代理图到云端
```

这套方案可以让 Tauri 桌面端继续保留本地照片和低资源优势，同时让网页端拥有项目持久化、跨设备恢复和后续协作的扩展空间。

## 11. 尚未决定的事项

以下内容不在本次讨论中直接拍板：

- 是否上传原始照片；
- 是否只保存代理图；
- 首选云服务商；
- 数据存储区域和合规要求；
- 是否需要多人实时协作；
- 是否需要云盘导入；
- 是否允许匿名项目；
- 正式产品的容量和套餐限制。

这些事项应在网页 MVP 的真实上传和项目恢复流程验证后再决定。
