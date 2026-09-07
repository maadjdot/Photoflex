# PhotoFlex 质量与性能基线

记录日期：2026-09-08。运行环境：Windows、pnpm 10.15.1、Vitest 3.2.4、Vite 7.1.3。微基准会受机器负载影响，只用于比较趋势，不设置固定通过阈值。

## 自动化质量门禁

- 单元与集成：32 个测试文件、137 条测试通过；覆盖 Coordinator 作用域隔离/重试、持久化迁移与损坏数据、项目删除恢复、Table/Sequence 会话、虚拟化和键盘交互。
- 浏览器 E2E：Chrome 与 Edge 共 6 条通过；覆盖启动、Contact Sheet → Table、Sequence Reading Unit / Segment / Overview / Read / 单次保存拖拽。
- TypeScript：`tsc --noEmit` 通过。
- 生产构建：通过。

## Bundle 基线

路由拆包前主 JavaScript：425.79 kB，gzip 125.86 kB。

Sequence 与 Compare 按需加载后：

| 产物 | 原始大小 | gzip |
|---|---:|---:|
| 主 JavaScript | 388.05 kB | 115.21 kB |
| SequencePage | 30.94 kB | 10.38 kB |
| SequenceComparePages | 6.94 kB | 1.88 kB |
| versioning | 1.34 kB | 0.59 kB |

主包减少 37.74 kB，gzip 减少 10.65 kB。

## 大工作区微基准

运行 `corepack pnpm bench`，本次结果：

| 场景 | 本次均值 | 说明 |
|---|---:|---|
| 10,000 个 Table placement 的 1440×900 视口扫描 | 0.215 ms | Table 仅挂载视口、短期保留和选中卡片；扫描保持线性 |
| 构建 500 项 Sequence 的全部查询索引 | 0.058 ms | item、segment、reading unit 一次建表 |
| 通过索引解析 500 项全部关联 | 0.0003 ms | 单轮基准中的整批 Map 查询 |
| 保存并导出 200 个完整版本 × 500 项 | 346 ms | MemoryProjectStore 计算/序列化基线，不代表 IndexedDB I/O |

200×500 导出的 JSON 备份为 14,944,438 bytes（约 14.25 MiB）。当前完整快照方案在 MVP 上限内可接受；若真实 IndexedDB/浏览器基准显著恶化，再用独立 ADR 评估压缩或增量存储。

## 维护规则

- 修改持久化 schema 时必须增加迁移 fixture 和损坏/中断恢复测试。
- 修改 Coordinator 时必须验证 workspace 与多个 Sequence 作用域相互隔离。
- 修改虚拟化或预览加载时必须验证 DOM 挂载范围和 lease 释放。
- Bundle 或以上基准出现明显回退时先定位热点，不以拆小文件代替性能优化。
