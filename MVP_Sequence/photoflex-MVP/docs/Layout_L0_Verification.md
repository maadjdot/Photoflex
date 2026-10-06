# Layout L0 实施与验证记录

日期：2026-09-24
分支：`Layout-Develop`
范围：共用页面规则、Frame 回归、字体候选与中文 PDF 验证方案。不包含 LayoutDocument、编辑器或正式 PDF 导出。

## 1. 代码基线与实现

当前 Frame 的实际实现位于 `src/modules/worktable/frameLayout.ts`，依赖它的 Table 视图、命令和属性栏保持原有调用方式。L0 将页面 point/mm 换算、纸张预设、模板矩形、默认裁切、裁切参数验证和 Fit/Fill 焦点计算提取到 `src/modules/page-layout/pageGeometry.ts`。新模块不依赖 React、WorktableDraft、数据库或照片文件；Frame 的原接口继续提供这些规则。模板版本与修改状态留在 Frame 封装内，不进入共享几何输入。Table 专用 Square Nine Grid 继续存在；`LAYOUT_TEMPLATES` 明确只包含 PRD 的五种模板。

原技术计划提及 `Layout_Validation.md`，但当前工作区已不存在该文件，相关试验结论没有作为本次通过证据。现有 `LayoutPrototype.tsx` 是展示原型，也未当作生产实现。

## 2. 验证结果

| 检查 | 结果 |
|---|---|
| 五种 Layout 模板在 A4 物理页上的框数、范围和 Full Page 尺寸 | 新模块测试通过 |
| Fit 完整置入与 Fill 在焦点和 200% 缩放下覆盖框 | 新模块测试通过 |
| 现有 Frame 六模板、命令、撤销、裁切 | Frame 相关 7 项测试通过 |
| 全量单元/集成测试 | 60 个测试文件、314 项通过 |
| TypeScript 检查与生产构建 | 通过；构建仍有大 chunk 提示，本次未增加首屏依赖 |

执行：`corepack pnpm test src/modules/page-layout/pageGeometry.test.ts src/modules/worktable/frameCommands.test.ts --reporter=dot`（9 项通过），`corepack pnpm test`（314 项通过），`corepack pnpm typecheck`、`corepack pnpm build`（通过）。未生成或修改正式 Layout/PDF 文件。

## 3. 字体决定

首版中英文字体候选锁定 **Noto Sans SC Regular**。上游 [Noto CJK 仓库](https://github.com/notofonts/noto-cjk)提供简体中文版本；[Sans 授权信息](https://github.com/notofonts/noto-cjk/blob/main/Sans/README-third_party.md)列明 SIL Open Font License 1.1。L4 纳入项目时从上游取得版本固定的字体文件及对应许可证，并同时验证浏览器排版和 PDF 嵌入；不从操作系统目录复制字体作为应用分发资源。

本机安装的 Noto Sans SC Regular OTF 仅用于 L0 覆盖检查：所选样本没有缺字，字体 `fsType=0`，版本约 2.002。它不是项目依赖，也未打包。当前项目已有的 Ancizar Serif 用于界面，不能承担简体中文排版；Inter 也不作为中文缺字时的静默替代。

## 4. 固定中文 PDF 样本与目标阅读器

固定样本：

```text
摄影集：上海街景，人物与光影。
第二页 2026 / Café
```

后续正式导出至少制作两页：第一页放以上两行文字及一张经过 Fill 裁切的照片，第二页放相同文字的一部分和空白区域。样本覆盖简体中文、全角标点、拉丁字母、数字、重音字符、显式换行、照片与文字混排。页尺寸固定为 A4；测试字号、行距和文字框溢出前后变化。

**目标阅读器**：Chrome 和 Edge 的内置 PDF 阅读器，与项目当前浏览器支持及 Playwright 配置一致。L5 验收时在两者中核对：渲染无缺字；复制两行文字后与样本逐字一致；搜索“上海街景”和“Café”均定位；文字可独立于照片选择。另使用 PDF 文本提取工具作辅助诊断，但不以内部 ToUnicode 映射或仅能渲染代替阅读器验收。

L0 只确定字体、样本和阅读器，没有生成正式 PDF，也没有声称中文复制与搜索已经通过。这一风险仍是 L5 导出的上线门槛。
