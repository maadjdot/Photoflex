# PhotoFlex Sequence MVP

当前目录是 PhotoFlex M1：可创建和打开 Project，选择多个本地 JPEG Source，扫描并分页浏览照片，
预览大图，并把照片加入持久化 Project Pool。Sequence、Compare、排版、导出和账号仍不在本轮范围内。

```powershell
corepack pnpm install
corepack pnpm fixture:generate
corepack pnpm dev
```

质量检查（当前只覆盖 M1 核心路径）：

```powershell
corepack pnpm test
corepack pnpm typecheck
corepack pnpm build
corepack pnpm test:e2e
```
