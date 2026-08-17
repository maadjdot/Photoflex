# PhotoFlex 开发方案

## 总体技术方案

- Vite
- React
- TypeScript
- React Router
- 浏览器本地持久化
- 本地 Node.js AI API Proxy
- 可替换 AI Provider

第一版是桌面端 Web 原型，重点是完整走通一个项目，而不是提前建设云端基础设施。

## 建议目录结构

```text
src/
├── app/
├── components/
├── features/
│   ├── projects/
│   ├── workspace/
│   ├── timeline/
│   ├── decisions/
│   ├── research-library/
│   ├── ai-assistant/
│   └── settings/
├── domain/
├── repositories/
├── services/
└── test/
```

## 架构原则

- 领域模型不依赖 React。
- UI 不直接操作 localStorage。
- 持久化通过 `ProjectRepository` 抽象。
- AI 通过 `AIProvider` 抽象。
- 每个功能以垂直切片交付。
- 不为社区、云同步和多人协作提前引入复杂架构。

## Repository 接口

```ts
interface ProjectRepository {
  listProjects(): Promise<Project[]>
  getProject(id: string): Promise<Project | null>
  saveProject(project: Project): Promise<void>
  deleteProject(id: string): Promise<void>
  exportData(): Promise<ExportPayload>
  clearAll(): Promise<void>
}
```

## AI 接口

```ts
interface AIProvider {
  generateReflection(input: AIContext): Promise<AIResponse>
  generateProjectSummary(input: AIContext): Promise<ProjectSummary>
}
```

AI 默认读取当前项目全部已保存内容，包括阶段记录、Timeline、Decision Log、Research 内容和既有摘要。

## 工程工作法

使用 TDD、小步提交和垂直切片：

```text
明确用户行为
  ↓
定义领域规则
  ↓
先写失败测试
  ↓
实现最小代码
  ↓
运行测试
  ↓
重构
  ↓
完成 UI 集成
  ↓
真实流程验证
  ↓
小步提交
```

`improve-codebase-architecture` 在第一个垂直切片完成后、AI 接入前和 MVP 完成后使用。

