# CloudBase 第 1 步：邮箱认证与项目表

当前 PhotoFlex 开发环境 `photoflex-d0gh9kyug3b971e6d` 使用 CloudBase PostgreSQL。项目数据放在 `public.projects` 表，而不是文档型数据库集合。此文件记录最初的控制台配置；应用接入与自动保存验收状态见 [接入记录](CloudBase_Migration.md)。旧项目按当前决定不迁移。

## 已配置的数据库结构

[建表迁移](../cloudbase/migrations/202609160001_create_projects.sql) 已在该环境执行，文件留作部署记录。`projects` 包含：

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `id` | uuid | 新项目及云端项目在各浏览器共用同一 ID |
| `owner_id` | text | CloudBase 身份认证用户 ID，即 `auth.uid()` |
| `name` | text | 项目名称 |
| `document` | jsonb | 现有 `ProjectBackupV1` 快照，不含原图 |
| `schema_version` | integer | 快照 schema 版本 |
| `cloud_revision` | bigint | 云端并发版本，新建为 `0` |
| `created_at` | timestamptz | 创建时间 |
| `updated_at` | timestamptz | 最近云端更新时间 |

`(owner_id, updated_at DESC)` 索引用于按用户列出项目。表级权限仅授予已登录角色；四条 RLS 策略分别限制读取、新建、更新和删除自己的项目。更新策略同时校验更新前、更新后的归属，不能通过修改 `owner_id` 抢占他人项目。CloudBase 的 `auth.uid()` 返回 `text`，因此不能沿用 Supabase 的 `owner_id uuid` 设计。

## 身份认证状态与后续事项

2026-09-16 在 CloudBase「身份认证 / 登录方式」看到：邮箱验证码「已启用，代发」，用户名密码「已启用」，微信开放平台和 Google Web 端均未启用。本阶段没有改动这些登录开关。应用仅呈现邮箱登录，不增加微信或 Google 入口。

不要把服务端 API Key 或邮件服务凭据放进前端或提交到仓库。Web 应用实际部署域名应加入 CloudBase 的安全来源配置。当前体验版不支持添加本地跨域来源，改在默认测试域名联调。

## 验收

- 在 CloudBase 控制台确认 `public.projects` 已启用 RLS，且有四条 `TO authenticated` 的本人数据策略。
- 使用两个邮箱测试账号：A 可创建、读取、更新、删除自己的项目；B 不能访问 A 的项目。
- 匿名请求不能访问 `projects`；A 不能插入或更新成 B 的 `owner_id`。
- 以 `owner_id` 过滤并按 `updated_at` 降序列项目时，索引可用。

控制台已核对表、索引、RLS、四条策略和角色授权。控制台以管理员角色执行 SQL 不能验证跨账号访问；需通过登录后的客户端会话测试。迁移文件已手动应用到当前环境，但不会自动应用到其他环境，重复执行会因表已存在而报错。
