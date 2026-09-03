---
tags:
  - PhotoFlex
  - M3
  - Versioning
  - Compare
created: 2026-09-01
updated: 2026-09-02
status: planned
version: 1.0
---

# PhotoFlex M3 Version / Compare 实施方案

> 本文是 M3 的产品与技术决策基线，当前只记录方案，不代表 Save、Save As、Version Compare 或 Shuffle 已经在 UI 中开放。

相关文档：[Sequence PRD](./PRD_Sequence.md) · [M2 Sequence 交互说明](./M2_Sequence_Interaction_Spec.md) · [系统架构方案](./PhotoFlex%20MVP%20系统架构方案.md) · [开发流程方案](./PhotoFlex%20MVP%20开发流程方案.md)

## 1. 范围与边界

M3 在现有 Working Draft、Table Pile Compare 和 Sequence Read 的基础上增加命名版本闭环：保存当前草稿、另存为新版本、打开历史版本副本以及两个版本的只读比较。Table Pile Compare 仍然是临时的照片集合比较；Version Compare 比较两个同一项目内的 `SequenceVersion`，两者不共享来源模型，也不互相改写。

本轮不实现逐项合并、在线协作、云同步、摄影书排版或完整版本时间线。Shuffle 是 M3 后置小阶段，不阻塞基础版本闭环。

## 2. M3.1 Versioning 深模块

Versioning 保持纯 TypeScript，不依赖 React、DOM、IndexedDB 或文件读取。核心接口：

```ts
interface CreateVersionSnapshotInput {
  readonly sequence: SequenceDocument;
  readonly versionId: VersionId;
  readonly sequenceId: SequenceId;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

createVersionSnapshot(input: CreateVersionSnapshotInput): Result<SequenceVersion, VersionError>;
compareVersions(left: SequenceVersion, right: SequenceVersion): VersionDiff;
openVersionAsDraft(version: SequenceVersion, draftId: string): SequenceDocument;
```

比较和复制均以 `SequenceItemId` 为身份，不以 `PhotoId` 去重。因此同一张照片的重复出现、Blank、Missing、Spread 以及 Segment 边界都必须保留并参与 Diff。

```ts
type VersionDiffKind =
  | "added"
  | "removed"
  | "moved"
  | "reading-unit-changed"
  | "segment-changed";

interface VersionDiffEntry {
  readonly kind: VersionDiffKind;
  readonly itemId?: SequenceItemId;
  readonly leftIndex?: number;
  readonly rightIndex?: number;
  readonly leftUnitId?: ReadingUnitId;
  readonly rightUnitId?: ReadingUnitId;
  readonly leftSegmentId?: SequenceSegmentId;
  readonly rightSegmentId?: SequenceSegmentId;
}

interface VersionDiff {
  readonly leftVersionId: VersionId;
  readonly rightVersionId: VersionId;
  readonly entries: readonly VersionDiffEntry[];
}
```

`Added`、`Removed`、`Moved` 使用稳定的 `SequenceItemId`；顺序比较使用 Map/Set 和最长递增子序列，目标复杂度不低于 O(n log n)。Reading Unit 比较覆盖 Single、Spread、Blank 的类型和成员变化；Segment 比较覆盖新增、删除、重命名、边界变化和整体移动。缺失文件只改变展示状态，不改变版本身份。

每个版本必须有 `createdAt` 和 `updatedAt`。读取旧记录时若缺少 `updatedAt`，迁移层使用 `createdAt` 补齐，不改变 VersionId 或快照内容。

## 3. M3.2 保存语义

### Save

- 覆盖当前 Named Version 的快照内容；
- 保留原 `VersionId` 和名称；
- 更新 `updatedAt`，不生成隐藏历史版本；
- Working Draft、Sequence revision 和版本快照在同一原子写入中保持一致。

### Save As

- 创建新的 `VersionId`；
- 名称在项目内必须唯一，冲突时要求用户修改名称；
- 新版本成为该 Sequence 的 `currentVersionId`；
- Working Draft 与新版本快照一致；
- 原版本保持不可变。

历史版本和 Compare 右侧版本都遵循同一流程：

```text
Open as Draft → 修改 → Save As
```

历史版本本身不可直接覆盖。`Keep Current` 只退出比较，不复制或修改任何版本。

## 4. M3.3 原子持久化与 CAS

在 `ProjectStore` 增加统一的版本保存接口，逻辑上覆盖 `projects + sequences + versions`：

```ts
interface SaveSequenceVersionInput {
  readonly projectId: ProjectId;
  readonly sequence: SequenceDocument;
  readonly version: SequenceVersion;
  readonly mode: "overwrite" | "save-as";
  readonly expectedWorkspaceRevision: WorkspaceRevision;
  readonly expectedSequenceRevision: SequenceRevision;
}

saveSequenceVersion(input: SaveSequenceVersionInput): Promise<Result<{
  readonly workspaceRevision: WorkspaceRevision;
  readonly sequenceRevision: SequenceRevision;
  readonly version: VersionSummary;
}, VersionSaveError>>;
```

IndexedDB adapter 必须在同一个 `readwrite` 事务中校验 Workspace revision 和 Sequence revision，再按 Save 或 Save As 写入。任一校验、唯一性检查或 request 失败，整个事务 abort；不能留下孤立版本、半更新的草稿或错误的 `currentVersionId`。Memory adapter 必须复用相同 CAS 和回滚语义，并通过同一契约测试。

冲突不能覆盖其他标签页的新内容。UI 保留本地 Working Draft，暂停保存队列并提示重新加载最新 Draft；不使用 last-write-wins，也不以旧 revision 盲目重试。新增字段不应无必要地改变 IndexedDB object store 结构，沿用当前数据库 v7、Workspace schema v6 的迁移边界。

## 5. M3.4 Version UI

Sequence 页面在当前工具栏基础上增加：`Versions`、`Save`、`Save As`、`Compare`、当前版本状态和 Version List。状态文案固定为：

- `Working Draft`
- `Unsaved to <version>`
- `Saved to <version>`
- `Save failed`

Version List 提供版本名称、更新时间、当前标记以及 `Open as Draft`、`Compare with…`。Save As 使用居中的 Dialog，提交前校验非空名称和项目内唯一性；取消不生成 command、版本或 revision。当前版本的 Save 按钮在没有有效 Named Version 时禁用，首次保存必须使用 Save As。

## 6. M3.5 Version Compare

新增独立路由：

```text
#/projects/:projectId/versions/compare/:leftVersionId/:rightVersionId
```

现有 Table Pile Compare 路由保持不变：

```text
#/projects/:projectId/sequences/compare/:leftSequenceId/:rightSequenceId
```

Version Compare 是只读双轨视图，显示 Added / Removed / Moved、Segment 变化和 Reading Unit 变化。操作包括：

- `Swap Sides`：交换左右版本，不创建版本；
- `Read Current` / `Read Right`：以只读 Read 模式查看对应版本；
- `Open Right as Draft`：复制右侧快照为 Working Draft，返回编辑页；
- `Keep Current`：退出 Compare，保持当前 Draft 不变。

本轮不支持逐项合并。Compare 输入只传 VersionId，按需加载快照；照片展示通过当前 Preview/缩略图能力完成。

## 7. M3.6 Shuffle（后置小阶段）

Shuffle 生成不持久化的临时 `Alternative`，不直接修改 Current，并自动进入 Version Compare。用户可以 `Try Again` 重新生成候选；`Apply Alternative` 作为一次 Sequence command 和一次 undo step，应用后仍必须显式 Save 或 Save As。Alternative 不写 IndexedDB，也不进入版本列表。

## 8. 测试与验收

- Versioning 单元测试覆盖重复 PhotoId、Blank、Missing、Spread、Reading Unit、Segment、Added/Removed/Moved 和 no-op；
- Save / Save As 测试覆盖名称唯一、VersionId 保持或新建、Working Draft 一致性和历史不可变；
- IndexedDB 故障注入验证 `projects + sequences + versions` 任一步失败都会回滚；CAS 双标签页冲突不覆盖；Memory/IndexedDB 结果一致；
- 旧版本缺失 `updatedAt` 时迁移为 `createdAt`，且不改变快照；
- React/E2E 覆盖 Version List、Save As Dialog、状态文案、Open as Draft、Compare 路由和只读约束；
- Version Compare 覆盖 Swap、Read、Open Right as Draft 和 Keep Current，不提供逐项合并入口；
- Shuffle 覆盖 Try Again、Apply 一次 command/undo、未应用不持久化；
- 目标 Chromium production build 中，两个 500-item 版本的 Diff p95 ≤ 200ms；保存事务和 Compare 打开不得阻塞照片解码主线程。

完成 M3 后，PRD、系统架构和开发流程中的“当前已实现”与“M3 计划”标记必须同步更新，再进入 M4 Alpha 稳定化与性能测量。
