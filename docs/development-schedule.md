# PhotoFlex 开发日程

周期：2–3 周。

## 第 1 阶段：基础骨架与项目闭环

目标：可以创建并查看多个项目。

- 初始化 Vite、React、TypeScript
- 配置路由、测试和代码检查
- 建立领域模型
- 建立本地 Repository
- 建立示例数据
- 实现 Projects Overview
- 实现创建、打开和删除项目

验收：

- 能看到示例项目
- 能创建多个项目
- 刷新后数据仍存在
- 能删除示例项目
- UI 不直接操作 localStorage

## 第 2 阶段：工作区与项目记忆

目标：完整记录项目过程。

- 实现五阶段导航
- 实现阶段专属模板
- 实现自由正文、链接和图片占位
- 实现自动 Timeline
- 实现 Decision Log
- 实现 Research Library View
- 实现 JSON 导出和数据清除

验收：

- 可以在五个阶段之间自由切换
- 每个阶段有对应提示
- 记录保存后出现在 Timeline
- 决策可以创建并更新状态
- Research 内容可以聚合查看
- 数据可以导出并清除

## 第 3 阶段：AI、视觉和验收

目标：验证 AI 是否能利用项目记忆帮助反思。

- 建立 AIProvider 接口
- 实现 Mock Provider
- 实现 AI Assistant 侧栏
- 建立本地 AI Proxy
- 接入可配置真实模型
- 实现 Project Summary
- 优化桌面端布局
- 增加加载、错误和空状态
- 完成端到端验收
- 使用真实摄影项目连续自用验证

## 交付顺序

1. 项目初始化和测试基础设施
2. 领域类型与 Repository
3. 项目创建与项目总览
4. 阶段工作区与记录保存
5. Timeline
6. Decision Log
7. Research Library View
8. AI Provider 与 Mock Provider
9. 本地 AI Proxy
10. AI Assistant UI
11. Project Summary
12. JSON Export / Clear Data
13. 示例项目和视觉打磨
14. 端到端验收

