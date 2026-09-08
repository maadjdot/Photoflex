# PhotoFlex MVP

PhotoFlex 是本地优先的摄影工作流原型，包含 Home、Project、Contact Sheet、Table、Sequence、Named Version 与 Compare。项目结构保存在 IndexedDB；用户选择的原片目录保持只读，预览 URL 采用显式 lease 并在视图卸载时释放。

## 本地运行

```powershell
corepack pnpm install
corepack pnpm dev
```

默认地址为 `http://127.0.0.1:5173/`。生产构建与本地预览：

```powershell
corepack pnpm build
corepack pnpm preview
```

## 质量检查

```powershell
corepack pnpm test
corepack pnpm typecheck
corepack pnpm build
corepack pnpm test:e2e
corepack pnpm bench
```

`test:e2e` 同时使用本机 Chrome 与 Edge。`bench` 覆盖 500 项 Sequence、10,000 张 Table 和 200×500 完整版本快照；结果是本机趋势基线，不作为固定 CI 时间阈值。当前数据见 [质量与性能基线](./docs/QUALITY_BASELINE.md)。

架构与持久化约束见 [系统架构方案](./docs/PhotoFlex%20MVP%20系统架构方案.md) 和 [ADR-002](./docs/ADR-002-本地持久化并发事务与迁移.md)。

Sequence 页面可从 Read 旁的 `Export PDF` 导出白底照片阅读稿，保留双页和空白页；模块划分与输出规则见 [Sequence PDF 导出](./docs/Sequence_PDF_Export.md)。
