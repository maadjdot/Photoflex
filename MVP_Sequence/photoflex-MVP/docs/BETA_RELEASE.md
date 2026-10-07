# Beta 构建与发布

Beta 使用独立 CloudBase 环境 `photoflex-prod-d8g6nph8u08611400`，目标来源为 `https://photoflex.site`。这些资源已在用户原有上线准备任务与当前控制台中核对；本工作区的生产 / Beta 配置已更新。开发环境 `photoflex-d0gh9kyug3b971e6d` 会被 Beta 构建拒绝。网站尚未在本任务中部署，正式 HTTPS 与双真实账号验收仍须在部署后完成。

## 目标环境

目标环境已有 `public.projects`、索引及四条本人数据 RLS 策略，邮箱验证码与密码登录已启用，匿名登录关闭，`photoflex.site` 已加入安全来源。本任务进行了只读复核，没有重新执行建表或改动云端项目。迁移来源为 [项目表 SQL](../cloudbase/migrations/202609160001_create_projects.sql)，以后新建其他环境时才需初始化；不能在已有表的环境重跑该脚本。

前端仅需要公开的环境 ID，不需要服务端 API Key。把 `.env.beta.example` 复制为不提交的 `.env.beta.local`，填写：

```dotenv
VITE_BETA_CLOUDBASE_ENV_ID=photoflex-prod-d8g6nph8u08611400
VITE_BETA_ORIGIN=https://photoflex.site
```

这两个专用变量避免读取旧 `.env.production.local` 时把开发环境带入 Beta。构建还会拒绝占位 ID、开发环境 ID，以及不合法的上线来源地址。`VITE_BETA_ORIGIN` 记录部署目标，不会代替 CloudBase 控制台的安全来源配置。

## 本地发布门禁

```text
pnpm release:beta
```

`release:beta` 按顺序生成照片测试夹具，再执行完整单元 / 集成测试、类型检查、普通构建、Chrome / Edge 全量浏览器回归，最后生成 `dist-beta/`。任一阶段失败都会停止，不会继续生成本次 Beta 产物。`pnpm build:beta` 可单独检查 Beta 构建，但不能代替发布门禁。

普通 `pnpm build` 的 `dist/` 使用 `.env.production.local`；本工作区现在也指向生产环境。开发联调应使用 development 模式及 `.env.development.local`。Beta 发布使用带构建记录的 `dist-beta/`，旧的 `dist-*.zip` 不能作为本次 Beta 产物。压缩包根目录应包含 `index.html`、`assets/`、`release.json`。

`release.json` 记录应用版本、构建模式、实际编译使用的 CloudBase envId、目标来源、源码提交、源码是否含未提交改动和构建时间。若 `sourceDirty=true`，提交号不足以还原该产物，需要保留对应工作区修改；正式 CI 产物以已提交源码生成。构建记录不包含账户、项目、原片或服务端凭据。

## CI

[工作流](../../../.github/workflows/photoflex-mvp-ci.yml) 在项目或工作流变更时运行 `pnpm check`，安装 Chrome / Edge，再执行全部浏览器回归。失败会保留报告、截图及 trace；没有通过测试的提交不会继续执行 Beta 构建。

需要生成 Beta 产物时，先配置 GitHub 仓库变量 `VITE_BETA_CLOUDBASE_ENV_ID` 与 `VITE_BETA_ORIGIN`，再手动运行工作流并选择 `build_beta`。缺少变量或指向开发环境时，构建会失败。成功产物名为 `photoflex-beta-<提交 SHA>`。该流程生成待部署产物，不自动修改 CloudBase、认证方式、安全来源或托管站点。

## 最终云端验收

部署后先读取站点根路径下的 `release.json`，确认模式、envId、目标来源与本次产物一致，再使用两个专用测试账号验证：

1. A 新建、编辑、刷新、重登、删除自己的临时项目，数据确实位于 Beta 的 `public.projects`。
2. B 与匿名客户端无法读取、更新或删除 A 的项目，也不能通过修改 `owner_id` 抢占项目。管理员 SQL 查询不能代替登录客户端的权限验证。
3. 两台设备同时编辑：后提交方看到冲突，下载备份与恢复副本保留其编辑；同账号两标签页上传期间的新编辑在刷新后仍存在。
4. 断网、会话过期及重登后，确认已保存的结构与待同步 / 冲突状态；换浏览器后重新连接照片文件夹，再查看和导出原片内容。

本机浏览器测试使用隔离假云端验证同步器和原生存储 / 锁，不能证明实际 Beta 环境的权限、认证邮件、来源设置及配额。以上云端验收应绑定最终环境和最终产物记录。

实现依据：[Vite 环境变量与构建模式](https://vite.dev/guide/env-and-mode)、[Playwright CI](https://playwright.dev/docs/ci)、[Chrome / Edge 浏览器渠道](https://playwright.dev/docs/browsers)。
