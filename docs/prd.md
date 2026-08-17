# PhotoFlex MVP PRD

## 产品目标

让摄影创作者能够在一个项目工作区中记录研究、拍摄、反思、编辑和输出过程，并在之后理解项目如何演化。

## MVP 范围

- 多个摄影项目
- 项目总览
- Research、Field Work、Reflection、Editing、Output 五阶段工作区
- 阶段记录
- Timeline
- Decision Log
- 项目内 Research 聚合视图
- AI Reflection Assistant
- AI Project Summary
- JSON 导出与本地数据清除
- 可删除示例项目

## 不在 MVP 范围

- 账号和登录
- 云端数据库
- 真实图片上传与图片管理
- Feedback Link
- 社区、评论和协作
- 公开 Archive
- Lightroom / Capture One 集成

## 用户故事

### 项目

- 作为摄影师，我可以创建一个项目并写下标题和一句话意图。
- 作为摄影师，我可以查看多个项目及其当前阶段。
- 作为摄影师，我可以删除示例项目或自己的项目。

### 阶段记录

- 作为摄影师，我可以在不同阶段自由切换。
- 作为摄影师，我可以根据阶段提示记录内容。
- 作为摄影师，我可以保留自由正文、参考链接和图片占位。
- 作为摄影师，我可以回到过去的阶段补充内容。

### 项目记忆

- 作为摄影师，我可以查看项目 Timeline。
- 作为摄影师，我可以记录创作决定及其理由。
- 作为摄影师，我可以回顾项目方向发生变化的原因。
- 作为摄影师，我可以在 Research Library View 中汇总项目研究内容。

### AI

- 作为摄影师，我可以让 AI 基于项目全部内容提出反思问题。
- 作为摄影师，我可以主动生成项目摘要。
- 作为摄影师，我可以知道 AI 的回答基于哪些项目上下文。
- 作为摄影师，我的项目内容不会被 AI 自动修改。

## 阶段字段

### Research

- 我正在研究什么？
- 当前问题是什么？
- 我参考了什么？
- 我暂时相信什么？

### Field Work

- 我在哪里、何时进行拍摄？
- 我观察到了什么？
- 哪些事情偏离了计划？
- 有什么意外发现？

### Reflection

- 这次发现了什么？
- 它与原计划有什么不同？
- 哪些决定需要重新考虑？
- 下一步想探索什么？

### Editing

- 我正在如何选择和组织素材？
- 哪些图像或方向被舍弃？
- 当前编辑逻辑是什么？

### Output

- 项目最终想表达什么？
- 项目发生了哪些变化？
- 如何向别人介绍这个项目？

## 项目创建

创建项目只要求：

- 标题
- 一句话创作意图

其他内容在工作区中逐步补充。

## 数据模型

```ts
type ProjectStage =
  | "research"
  | "field-work"
  | "reflection"
  | "editing"
  | "output"

interface Project {
  id: string
  title: string
  intention: string
  currentStage: ProjectStage
  status: "active" | "archived"
  createdAt: string
  updatedAt: string
  isDemo?: boolean
}

interface StageRecord {
  id: string
  projectId: string
  stage: ProjectStage
  title: string
  prompts: Record<string, string>
  body: string
  tags: string[]
  references: Reference[]
  imagePlaceholders: ImagePlaceholder[]
  createdAt: string
  updatedAt: string
}

interface Decision {
  id: string
  projectId: string
  title: string
  rationale: string
  evidence: string
  impact: string
  status: "active" | "revisited" | "abandoned"
  stage: ProjectStage
  createdAt: string
  updatedAt: string
}
```

## 验收标准

- 用户可以创建多个项目。
- 用户可以完整走通五个阶段。
- 记录刷新后仍然存在。
- 记录、决定和阶段变化可以在 Timeline 中回顾。
- Research Library View 可以聚合项目内研究内容。
- AI 可以读取项目全部已保存内容。
- AI 不会自动修改项目内容。
- 用户可以主动生成项目摘要。
- 用户可以导出 JSON 并清除本地数据。
- API key 不会暴露在浏览器端。

