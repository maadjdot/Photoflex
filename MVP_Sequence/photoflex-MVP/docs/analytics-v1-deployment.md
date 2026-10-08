# PhotoFlex 首版行为分析：实施与部署准备

本轮按用户选择仅做本地验收和部署准备。功能分支为 `codex/product-analytics`，基础提交为 `c941996fbcd2114f83d3f1bfe79c4332854b11c7`。未执行云端建表、云函数部署、生产启用或 main 合并。用户现有根应用 `package.json`、`pnpm-lock.yaml` 的 Vercel Analytics 修改及未跟踪文档保留，不纳入本功能提交。

## 实现位置与边界

- `src/platform/analytics/analytics.ts`：统一事件接口、随机访客和会话 ID、内存队列、三次发送上限、唯一事件 ID；最多缓存 100 个事件，每批 20 个，退出/切换账号清除旧队列并换会话与访客 ID，旧账号异步操作的晚到结果不记入新账号。访客 ID 留在 localStorage，不存账号令牌；会话在页面生命周期内有效，30 分钟无活动后更新。
- `instrumentDependencies.ts`：项目创建、初始序列持久化/后续保存、新来源扫描、拖入照片结果。自动重新打开/恢复来源扫描不重复记录导入。序列保存最多每 30 秒记录一次。
- `CloudBaseAccountSession.ts`：注册需认证成功；邮箱验证码未确认时无 `signup_completed`。退出和认证变更同步解除绑定，旧初始化结果不能覆盖较新的身份。
- 导出：Sequence PDF、Frame JPEG、Layout PDF，以及已有的序列文件夹导出。开始与完成用 `attempt_id` 关联。Layout 包含预检；预检阻塞、取消、生成异常分别记录失败。文件夹复制有部分失败时不记为完整生成成功。
- `cloudfunctions/analytics`：独立 CloudBase Web 云函数，Node 22+，端口 9000，`POST /events`、`POST /stats`、`GET /health`。通过当前环境 `/auth/v1/user/me` 核验用户令牌，只保留认证 ID 与创建时间。请求的账号 ID、项目 ID、URL 和任意属性均不能进入事件。
- `#/admin/analytics`：私有统计页。每个统计请求均需后端认证并命中管理员 ID 名单。普通账号不能读取事件、认证事实或统计。

不改变项目云同步、`public.projects`、认证账号、照片存放方式、Caddy、Hermes 或网站发布路径。未登录访客不启用 CloudBase 匿名登录。没有照片云上传或旧项目数据迁移。

## 事件契约

事件仅含 `event_id`、`visitor_id`、`session_id`、`occurred_at`、`name`、`feature`、`version` 和受限 `properties`。服务端附加核验后的 `user_id` 与 `received_at`。版本为构建 Git 提交的前 12 位；可用 `VITE_SITE_VERSION` 显式指定，本地无法读取 Git 时使用应用版本。

| 事件 | 实际触发点 |
|---|---|
| `page_view` | 登录页或已接受的 hash 路由进入；只记录规范化页面名 |
| `signup_completed` | 注册直接获得会话，或邮箱 OTP 验证成功 |
| `project_created` | 项目持久化返回成功 |
| `photo_import_started` | 新来源开始扫描，或处理拖入文件 |
| `photos_imported` | 完成且可用照片数大于 0；部分可用时携带失败数量 |
| `sequence_saved` | 初始序列创建或后续保存的本地持久化成功 |
| `export_started` | 接受的导出任务开始，Layout 包含预检 |
| `export_generated` | PDF/JPEG 生成并触发浏览器下载，或文件夹全部复制成功 |
| `operation_failed` | 上述动作失败、取消、空导入或预检阻塞 |

页面名限 `home/project/contact_sheet/table/sequence/frame/layout/compare/account/photo_import`，Frame 为 Table 内部工具。允许属性只有 `count`、`failed_count`、`duration_ms`、`attempt_id`、`format`、`error_kind`。错误仅分类为取消、权限、存储、冲突、不可用、空、部分失败或未分类，不保存异常正文。拖入照片的数量包括被成功识别并复用的照片。

采集请求最大 16 KiB，事件必须为 UUID v4，最多 20 个/批；数量最大 100 万，耗时最大一天，事件时间最多晚到 48 小时/超前 5 分钟。未知字段拒绝整批；数据库 `event_id` 主键去重，重试不改写已存事件。编辑、导入、保存和导出不等待采集请求。关闭页面为尽力发送；丢弃超限、切换账号或超过重试次数的事件是首版明确的数据损失边界。

不采集照片字节、原图、文件名、本地路径、项目名/ID、便笺正文、邮箱、密码或完整项目 JSON。

## 统计口径

日期统一为 `Asia/Shanghai`，查询包含开始和结束自然日，最多 90 天。首次采集之前的行为不补造。

- 每日 PV、账号 UV、未关联访客 UV 与注册账号数。登录前事件仅在同一会话唯一绑定一个已核验账号时合并；多个账号共享会话时不任意归属访客。登录后账号跨会话按 ID 去重，访客跨会话按随机 ID 去重。浏览器退出/切换账号会换访客 ID；没有跨设备身份推断。
- 核心操作活跃人数分账号与访客，比例各自以所选日期发生任一核心操作的人数为分母。
- 激活漏斗以所选日期内注册的账号为分母，顺序为认证注册 → 创建项目 → 成功导入 → 保存序列；每个账号每阶段一次，结束日期为转化截止。显示占注册比例与上一步转换比例。
- 导出以开始事件为分母，按账号/访客身份和 `attempt_id` 匹配生成结果；按 PDF/JPEG/文件夹分组，展示次数、转换比例、开始/成功人数与失败分类。可匹配查询结束后 8 天内的结果；取消计入取消分类。缺少最终事件的开始不会被推断为成功或失败。
- D1/D7 为注册后第 1/7 个自然日完成任一核心操作。只有整个目标日结束后才成熟；未结束显示“未到期”，采集首次接收之前的目标日显示“未完整观测”。无注册分母时比例为 `—`。
- 管理员 ID 自动排除；其他测试账号和访客按服务端名单排除。已绑定该账号的匿名访问同时排除。上线前尚需补齐其他内部测试 ID。

注册事实来自认证服务 `created_at`，不按注册事件或按钮点击计数。服务首次看到已登录账号时记录这一事实，因此默认统计标注“已观察注册人数”，不会声称包含从未访问的注册账号。需要完整口径时，可从认证管理系统导出完整账号快照，并仅保留如下字段后运行服务端导入工具；不要把含邮箱等资料的原始导出存入仓库：

```json
[{"user_id":"账号ID","registered_at":"2026-10-08T00:00:00Z"}]
```

```powershell
# ANALYTICS_DATABASE_URL 仅在后端/安全终端中设置。
node cloudfunctions/analytics/import-auth-facts.mjs sanitized-facts.json 2026-10-08T00:00:00Z
```

第二个参数表示此完整认证快照的覆盖截止时间。它不修改认证系统，只向 analytics 事实表写入 ID 与注册时间。截止时间覆盖查询结束日时，统计才标注完整快照口径。

首版一次统计最多读取 100,000 个事件，超出明确返回 422，要求缩小时间范围；不返回截断后误导性的结果。统计是成功采集事件的观察值，网络失败仍可能造成少计。

## 数据库与权限变更

审查 `cloudfunctions/analytics/migrations/001_analytics.sql`。它在事务内新增四张独立表及索引：`analytics_events`、`analytics_session_accounts`、`analytics_auth_users`、`analytics_auth_coverage`，以及 `photoflex_analytics` NOLOGIN 权限组。

所有表启用并强制 RLS，撤销 PUBLIC 和存在的 anon/authenticated 默认权限。仅该后端权限组有 SELECT/INSERT 权限；认证事实/覆盖表额外有 UPDATE 权限。后端组没有 projects 权限，没有 analytics 删除权限。数据库超级管理员仍保有运维权限，不可拿该账号作为采集服务身份。

用数据库管理员在开发环境执行一次迁移，随后在控制台安全地创建专用登录角色 `analytics_runtime`（非 SUPERUSER、非 BYPASSRLS、非表所有者），授予其 `photoflex_analytics`。连接字符串密码只存云函数环境变量。若已有默认 PUBLIC projects 权限，先确认项目现有权限策略；不要因 analytics 授权扩大其权限。SQL 不包含密码，也不复制已有项目数据。

## 开发部署验收（尚未执行）

1. 目标为 `photoflex-d0gh9kyug3b971e6d`。核对实际 PostgreSQL 连接地址、专用角色权限与管理员账号在此环境的身份。
2. 执行新增表迁移，配置专用数据库角色，通过真实连接再次验证普通账号/访客读取被拒绝、后端不能访问 projects。
3. 从 `cloudfunctions/analytics` 单独部署名为 `photoflex-analytics` 的 **Web/HTTP 云函数**（不是普通事件函数），Node 22+，启动命令 `npm start`。运行依赖使用 `npm ci --omit=dev --ignore-scripts`；PGlite 仅供本地/CI 测试，不进入函数运行包。
4. 使用实际 HTTP 触发器 URL。开放未登录 HTTP 访问供访客采集；管理员接口的身份核验在函数内完成，不依赖前端隐藏入口。不要为这个函数改写环境内其他云函数的安全规则。
5. 后端配置：`CLOUDBASE_ENV_ID`、`ANALYTICS_DATABASE_URL`、`ANALYTICS_ALLOWED_ORIGINS`、`ANALYTICS_ADMIN_IDS=100052883805`、`ANALYTICS_INTERNAL_USER_IDS`、`ANALYTICS_INTERNAL_VISITOR_IDS`。origin 逐个精确列出，不用 `*`。SQL 连接启用证书验证，使用 CloudBase 控制台提供的有效参数。
6. 前端开发构建显式设置 `VITE_ANALYTICS_URL` 为触发器根 URL，继续使用开发 CloudBase 环境 ID。入口追加 `/events` 和 `/stats`；访问 `#/admin/analytics`。
7. 真实注册 OTP 未完成时确认没有注册完成事件；完成后核对服务端 ID/认证创建时间。依次创建项目、导入照片、创建和保存序列、生成 PDF/JPEG；取消与预检失败检查 attempt 关联及分类；同一事件重复发送检查一行。
8. 退出并切换两个测试账号，检查旧账号队列不使用新令牌发送、会话与访客 ID 已更新。无令牌的访问不创建匿名认证账号。普通账号直接请求 `/stats` 必须 403；伪造 body 的 user_id 必须 400；管理员应能读取统计。
9. 断网重试、超限载荷、跨 origin、访客和登录合并、午夜日期边界、成熟与未成熟留存都应符合本地测试。检查事件行没有任何照片或业务正文。

## 生产启用的审查顺序（尚未授权执行）

待开发环境真实验收后提交具体变更审查：新增表 SQL、专用角色授权、Web 函数包与环境变量名称、管理员/内部测试名单、公开采集 URL、前端功能分支差异及 CI 结果。生产目标为 `photoflex-prod-d8g6nph8u08611400`。

先在生产新增独立表和函数，确认权限、认证和健康检查，再配置仓库公开变量 `VITE_ANALYTICS_URL`。现有 CI 新增函数 tests，并将该变量传入原有生产构建；空变量保持埋点关闭。main 合并仍会走现有完整检查并自动发布到腾讯云，不跳过验收，不恢复 Vercel 部署。

暂停采集：清空公开构建变量 `VITE_ANALYTICS_URL` 并走正常发布，或暂停独立采集函数。保留四张分析表及既有项目，不用 DROP TABLE 作为回滚。前端发布继续使用现有腾讯云发布/回滚流程。

## 本地验证

```powershell
npm ci --prefix cloudfunctions/analytics --ignore-scripts
npm test --prefix cloudfunctions/analytics
pnpm fixture:generate
pnpm check
pnpm test:e2e
```

函数测试使用内存 PostgreSQL（PGlite）执行实际 DDL、角色和 RLS、重复插入及数据库读写，不连接云端。认证边界测试使用官方响应结构的替身；它们不能代替开发环境真实令牌验收。新增 Chrome/Edge 流程使用实际浏览器 IndexedDB、照片扫描、序列存储和 PDF 下载，在采集发送失败时验证业务完成且事件中没有内容。

2026-10-08 本地结果：应用 92 个测试文件、482 项测试通过，TypeScript 与生产构建通过；函数 16 项测试通过（包含真实 PostgreSQL DDL/权限检查）；完整 Chrome/Edge 回归 86 项通过，最后身份生命周期调整后新增流程再跑两浏览器均通过。根应用 package/lock 文件哈希与开始工作时一致。尚无开发或生产 CloudBase 部署/令牌验收结果。

官方接口依据：[认证当前用户信息](https://docs.cloudbase.net/http-api/auth/user-me)、[PostgreSQL 连接方式](https://docs.cloudbase.net/database/postgresql/connecting-to-postgresql)、[HTTP 云函数客户端访问](https://docs.cloudbase.net/cloud-function/function-calls/httpclient)、[Web 云函数端口与启动方式](https://docs.cloudbase.net/recipes/connect-openai-api-cloud-function)。本实现采用 CloudBase HTTP 认证和原生 PostgreSQL 连接，不复用旧 Supabase 方案。
