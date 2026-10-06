# Layout L1 验证记录

日期：2026-09-24
工作分支：`Layout-Develop`
范围：数据契约、持久化、备份、迁移、云端同步与失败恢复。编辑工作区属于 L2–L4。

## 已交付

- 独立 `LayoutDocument`：页面点坐标、图像框与纯文本框、稳定页面/对象 ID、修订号；文档命令和结构校验独立于 Table。
- `ProjectStore` 的创建、列表、读取、修订保存；同一 Sequence 只能创建一份 Layout。内存、IndexedDB 与云包装具有一致接口。
- IndexedDB 升级到 12，旧项目补空 `layoutIds`，新 Layout 使用独立对象仓与唯一 Sequence 索引。
- 项目备份升级到 4；旧版备份可导入。项目复制重映射 Layout、页面、对象、Sequence 和照片 ID；云端快照保留原 ID。
- 删除 Sequence 时在同一事务移除关联 Layout；删除项目及替换云端快照同步清理旧 Layout。
- 项目写入协调器支持 Layout 草稿、修订冲突、失败暂停与重试；恢复备份包含最新未保存 Layout 草稿。

## 验证

| 场景 | 结果 |
|---|---|
| 文档命令、几何校验、重复 ID 与末页保护 | 通过 |
| 内存和 IndexedDB：创建唯一性、修订冲突、刷新读取、备份复制与照片引用重映射 | 通过 |
| 内存和 IndexedDB：删除 Sequence/Project 的关联清理 | 通过 |
| 旧数据库 11→12、旧备份导入 | 通过 |
| 云端同步后在另一客户端读取 Layout 及其编辑 | 通过 |
| 保存失败后的最新草稿、恢复备份与重试 | 通过 |
| 全量 `pnpm test`、`pnpm typecheck`、`pnpm build` | 323 项测试通过；类型检查与构建通过 |

L1 未添加用户可见入口。L2 从 Sequence 进入 Layout 时可以直接调用写入协调器的 Layout 创建/读取接口。
