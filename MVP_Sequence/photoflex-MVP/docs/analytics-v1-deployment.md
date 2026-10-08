# PhotoFlex 首版行为分析：实施与部署准备

用户于 2026-10-08 要求部署。功能分支为 `codex/product-analytics`，基础提交为 `c941996fbcd2114f83d3f1bfe79c4332854b11c7`。部署前核对发现开发/生产 PostgreSQL 都是共享集群，没有可用 TCP 直连地址，因此运行服务采用官方 HTTP/RPC 访问。用户确认生产统计管理员为 `administrator`（`2107522617501024256`）与 Jeff（`2107527668122529792`）；此前提供的 `100052883805` 是腾讯云账号 UIN，不能作为应用管理员 ID。用户现有根应用 package/lock 修改及未跟踪文档保留，不纳入本功能提交。

## 实现位置与边界

- `src/platform/analytics/analytics.ts`：统一事件接口、随机访客和会话 ID、内存队列、三次发送上限、唯一事件 ID；最多缓存 100 个事件，每批 20 个，退出/切换账号清除旧队列并换会话与访客 ID，旧账号异步操作的晚到结果不记入新账号。访客 ID 留在 localStorage，不存账号令牌；会话在页面生命周期内有效，30 分钟无活动后更新。
- `instrumentDependencies.ts`：项目创建、初始序列持久化/后续保存、新来源扫描、拖入照片结果。自动重新打开/恢复来源扫描不重复记录导入。序列保存最多每 30 秒记录一次。
- `CloudBaseAccountSession.ts`：注册需认证成功；邮箱验证码未确认时无 `signup_completed`。退出和认证变更同步解除绑定，旧初始化结果不能覆盖较新的身份。
- 导出：Sequence PDF、Frame JPEG、Layout PDF，以及已有的序列文件夹导出。开始与完成用 `attempt_id` 关联。Layout 包含预检；预检阻塞、取消、生成异常分别记录失败。文件夹复制有部分失败时不记为完整生成成功。
- `cloudfunctions/analytics`：独立 CloudBase Web 云函数，Node 20.19，端口 9000，`POST /events`、`POST /stats`、`GET /health`。通过当前环境 `/auth/v1/user/me` 核验用户令牌，只保留认证 ID 与创建时间；后端通过三项受限 SQL RPC 访问分析表。请求的账号 ID、项目 ID、URL 和任意属性均不能进入事件。
- `#/admin/analytics`：私有统计页，支持管理员用户名或邮箱登录，常规用户页面继续使用邮箱登录。每个统计请求均需后端认证并命中管理员 ID 名单。普通账号不能读取事件、认证事实或统计。

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
- 管理员 ID 自动排除；其他测试账号和访客按服务端名单排除。已绑定该账号的匿名访问同时排除。当前管理员名单包含 administrator 与 Jeff；其他内部测试账号尚未指定。

注册事实来自认证服务 `created_at`，不按注册事件或按钮点击计数。服务首次看到已登录账号时记录这一事实，因此默认统计标注“已观察注册人数”，不会声称包含从未访问的注册账号。需要完整口径时，可从认证管理系统导出完整账号快照，并仅保留如下字段后运行服务端导入工具；不要把含邮箱等资料的原始导出存入仓库：

```json
[{"user_id":"账号ID","registered_at":"2026-10-08T00:00:00Z"}]
```

```powershell
# CLOUDBASE_ENV_ID 与 CLOUDBASE_ANALYTICS_API_KEY 仅在后端/安全终端中设置。
node cloudfunctions/analytics/import-auth-facts.mjs sanitized-facts.json 2026-10-08T00:00:00Z
```

第二个参数表示此完整认证快照的覆盖截止时间。它不修改认证系统，只向 analytics 事实表写入 ID 与注册时间。截止时间覆盖查询结束日时，统计才标注完整快照口径。

首版一次统计最多读取 100,000 个事件，超出明确返回 422，要求缩小时间范围；不返回截断后误导性的结果。统计是成功采集事件的观察值，网络失败仍可能造成少计。

## 数据库与权限变更

依序审查 `cloudfunctions/analytics/migrations/001_analytics.sql` 和 `002_cloudbase_rpc.sql`。001 在事务内新增四张独立表及索引：`analytics_events`、`analytics_session_accounts`、`analytics_auth_users`、`analytics_auth_coverage`；002 新增三项 SQL RPC。

所有表启用并强制 RLS，撤销 PUBLIC 和存在的 anon/authenticated 默认权限。RPC 为 SECURITY INVOKER，仅 service_role 可调用；分析表仅授予 service_role SELECT/INSERT，认证事实/覆盖表额外有 UPDATE，未授予分析事件 DELETE。普通用户与访客既不能直接访问表，也不能调用 RPC。

共享集群使用 CloudBase 后端 API Key，映射为 service_role 并具有 BYPASSRLS；它仍受表级权限控制，但现有 projects 已授予 service_role 权限，因此该密钥属于环境级管理员凭证，不应被描述为只能访问分析表。它只存采集云函数的后端环境变量，不进入浏览器、代码包、GitHub 变量或仓库。采集服务只调用固定的三项分析 RPC，无任意 SQL 或代理入口。没有重置数据库密码、升级集群、修改原 projects 授权或复制既有项目。

## 开发部署验收清单

1. 目标为 `photoflex-d0gh9kyug3b971e6d`。核对分析表尚不存在，以及管理员账号在此环境的身份。
2. 依序执行 001 与 002；创建专用后端 API Key，只放在当前环境采集函数。通过角色模拟和真实令牌再次验证普通账号/访客不能读写分析表或调用 RPC。
3. 单独部署名为 `photoflex-analytics` 的 **Web/HTTP 云函数**（不是普通事件函数），Node.js 20.19，9000 端口，关闭自动安装依赖。包仅含 server、handler、cloudbaseRepository、statistics、validation、package 和可执行 scf_bootstrap；无运行依赖。启动脚本使用 `/var/lang/node20/bin/node server.mjs`。PGlite 仅供测试，不进入运行包。
4. 使用实际 HTTP 触发器 URL。开放未登录 HTTP 访问供访客采集；管理员接口的身份核验在函数内完成，不依赖前端隐藏入口。不要为这个函数改写环境内其他云函数的安全规则。
5. 后端配置：`CLOUDBASE_ENV_ID`、`CLOUDBASE_ANALYTICS_API_KEY`、`ANALYTICS_ALLOWED_ORIGINS`、`ANALYTICS_ADMIN_IDS`（开发环境对应实际认证 ID）、`ANALYTICS_INTERNAL_USER_IDS`、`ANALYTICS_INTERNAL_VISITOR_IDS`。origin 逐个精确列出，不用 `*`。HTTP 仅使用官方 HTTPS 环境域名，不跳过证书验证。
6. 前端开发构建显式设置 `VITE_ANALYTICS_URL` 为触发器根 URL，继续使用开发 CloudBase 环境 ID。入口追加 `/events` 和 `/stats`；访问 `#/admin/analytics`。
7. 真实注册 OTP 未完成时确认没有注册完成事件；完成后核对服务端 ID/认证创建时间。依次创建项目、导入照片、创建和保存序列、生成 PDF/JPEG；取消与预检失败检查 attempt 关联及分类；同一事件重复发送检查一行。
8. 退出并切换两个测试账号，检查旧账号队列不使用新令牌发送、会话与访客 ID 已更新。无令牌的访问不创建匿名认证账号。普通账号直接请求 `/stats` 必须 403；伪造 body 的 user_id 必须 400；管理员应能读取统计。
9. 断网重试、超限载荷、跨 origin、访客和登录合并、午夜日期边界、成熟与未成熟留存都应符合本地测试。检查事件行没有任何照片或业务正文。

## 生产启用顺序（已授权）

待开发环境真实验收后审查：新增表/RPC SQL、Web 函数包与后端 API Key、管理员/内部测试名单、公开采集 URL、前端功能分支差异及 CI 结果。生产目标为 `photoflex-prod-d8g6nph8u08611400`，管理员 ID 为 `2107522617501024256,2107527668122529792`。用户已确认后端密钥、分析表/RPC 权限与公开访客采集接口，并明确允许 Jeff 访问统计。创建密钥、表/RPC 授权和公开采集接口须按浏览器操作规则取得执行时确认；普通发布已由用户“部署”请求授权。

先在生产新增独立表和函数，确认权限、认证和健康检查，再配置仓库公开变量 `VITE_ANALYTICS_URL`。现有 CI 新增函数 tests，并将该变量传入原有生产构建；空变量保持埋点关闭。main 合并仍会走现有完整检查并自动发布到腾讯云，不跳过验收，不恢复 Vercel 部署。

暂停采集：清空公开构建变量 `VITE_ANALYTICS_URL` 并走正常发布，或暂停独立采集函数。保留四张分析表及既有项目，不用 DROP TABLE 作为回滚。前端发布继续使用现有腾讯云发布/回滚流程。

## 2026-10-08 云端部署记录

- 开发和生产依次执行了 001 与 002，均成功。开发原有 5 个项目保留；开发真实重复事件验证结果为 1 行、四表 FORCE RLS 开启、authenticated 无事件 SELECT、anon 无统计 RPC EXECUTE。
- 两个环境各有一个 `photoflex-analytics-server` 专用后端密钥，90 天有效。开发到期为 2027-01-06 15:33:05，生产到期为 2027-01-06 16:06:24（Asia/Shanghai）。密钥值只在对应 HTTP 函数的后端环境变量中；到期前须通过云控制台更新该配置，否则采集和统计会返回不可用。
- 开发管理员为 `2100076493764820992,2100203806737317888`；生产为 `2107522617501024256,2107527668122529792`。这两个环境分别对应 administrator 与 Jeff，均自动排除统计。
- 开发采集地址：`https://photoflex-d0gh9kyug3b971e6d-1488161315.ap-shanghai.app.tcloudbase.com/analytics`，允许 origin 为 `http://127.0.0.1:4173,http://127.0.0.1:5173`。
- 生产采集地址：`https://photoflex-prod-d8g6nph8u08611400-1488161315.ap-shanghai.app.tcloudbase.com/analytics`，仅允许 `https://photoflex.site`。QA 访客 `a11a2b00-8cc4-4212-ab4c-b5e623bcaec0` 在后端排除名单中。
- HTTP 网关新增独立 `/analytics` 路由，关闭路径透传，跨域和统计认证由函数处理。函数正常，Node 20.19 / 256 MB / 30 秒 / 9000 端口，不安装运行依赖。
- 生产真实接口返回：健康 200、访客写入/重试 200、伪造 user_id 400、匿名统计 403、无效 JWT 401、其他 origin 403、浏览器预检 204。CloudBase 固定认证接口会以 400 返回格式错误 JWT，后端已将其分类为认证失败，并保留上游 5xx 为不可用。
- GitHub 公开变量 `VITE_ANALYTICS_URL` 已配置为上述生产地址。网站将在最终代码通过现有 CI 后发布，访问入口为 `https://photoflex.site/#/admin/analytics`。
- 不导入历史行为，不声称注册事实包含从未被观察的账号；尚未导入完整认证快照。保留页面的观察范围与留存成熟度说明。

## 本地验证

```powershell
npm ci --prefix cloudfunctions/analytics --ignore-scripts
npm test --prefix cloudfunctions/analytics
pnpm fixture:generate
pnpm check
pnpm test:e2e
```

函数测试使用内存 PostgreSQL（PGlite）执行实际 DDL、角色和 RLS、重复插入及数据库读写，不连接云端。认证边界测试使用官方响应结构的替身；它们不能代替开发环境真实令牌验收。新增 Chrome/Edge 流程使用实际浏览器 IndexedDB、照片扫描、序列存储和 PDF 下载，在采集发送失败时验证业务完成且事件中没有内容。

2026-10-08 本地结果：应用 92 个测试文件、484 项测试通过，TypeScript 与生产构建通过；函数 18 项测试通过（包含真实 PostgreSQL DDL/权限检查）；完整 Chrome/Edge 回归 86 项通过，最后身份生命周期调整后新增流程再跑两浏览器均通过。根应用 package/lock 文件哈希与开始工作时一致。最新管理员入口调整的 7 项定向测试通过。共享 PostgreSQL RPC 版本已通过 GitHub 完整检查（运行 37745698207）；最终认证错误分类修正等待新一轮 CI。真实管理员登录、注册 OTP 与普通账号令牌的线上验收尚未完成，不以替身测试代替。

官方接口依据：[认证当前用户信息](https://docs.cloudbase.net/http-api/auth/user-me)、[RPC 接口](https://docs.cloudbase.net/http-api/pgdb/rpc-call)、[PG 认证与 service_role](https://docs.cloudbase.net/authentication-v2/auth/auth-pg)、[HTTP 云函数客户端访问](https://docs.cloudbase.net/cloud-function/function-calls/httpclient)、[运行时路径](https://docs.cloudbase.net/cloud-function/runtime-support)。本实现采用 CloudBase HTTP 认证和 PostgreSQL RPC，不复用旧 Supabase 接口假设。
