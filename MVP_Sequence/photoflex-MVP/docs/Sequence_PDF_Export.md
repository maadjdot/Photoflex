# Sequence PDF 导出

Sequence 顶部工具栏的 `Read` 右侧提供 `Export PDF`。一次点击导出当前完整草稿，文件名为 Sequence 名称；导出时显示页数进度，可取消，照片读取失败时显示错误并允许重试。

## 输出规则

- 按 `readingUnits` 的顺序，每个阅读单元生成一张 PDF 页面。单张照片独占一页；Spread 左右并排保留在同一页；Blank 保持纯白。重复出现的照片保留每个位置。
- 只输出 Read 的白色纸面和照片，照片等比居中，每个纸面四边保留 6% 的内容区边距。无页码、标题、Pin、工具栏或外部背景。
- 使用 Read 同档的 2048px 派生预览。页面尺寸按点击导出时的窗口计算，与该窗口下 Read 的纸面比例一致；Spread 的 PDF 页面比 Single 宽。不是固定 A4 印刷版式。
- 点击时复制草稿和窗口尺寸，因此导出过程中继续编辑不影响已启动的任务。切换 Sequence 或离开页面会取消任务。任何照片失败都终止整份导出，不会静默遗漏照片。

## 模块职责

| 位置 | 职责 |
| --- | --- |
| `contracts/sequenceExport.ts` | 导出输入、进度与照片编码接口的唯一契约 |
| `modules/sequence/readingPresentation.ts` | Read 与导出共用的阅读单元展开、纸面尺寸和照片边距 |
| `modules/sequence-export` | `createSequencePdf`：顺序排版、空白和双页处理、PDF 编码，返回字节；不依赖 DOM 或持久化 |
| `platform/browser/exportSequencePdf.ts` | 经 PhotoSource 获取预览，解码并转换 JPEG，释放 preview lease / canvas，完成后发起下载并回收 URL |
| `app/SequencePdfExportButton.tsx` | 点击快照、进度、取消、失败提示和页面卸载生命周期 |

PDF 库 `pdf-lib` 随浏览器导出模块按需加载。照片逐张解码、嵌入并释放预览资源，避免同时解码整个 Sequence。导出不写 ProjectStore，也不改原片、版本或排序。

## 验证

单元测试覆盖空白 PDF、取消、读取失败、空序列、草稿快照、重复点击与重试。浏览器测试使用真实本地图片预览和下载，验证单页、双页、空白、重复照片、中文文件名，以及 1024 / 1280 / 1440px 工具栏布局。PDF 使用 Poppler 渲染后核对照片顺序、比例、留白与空白页。
