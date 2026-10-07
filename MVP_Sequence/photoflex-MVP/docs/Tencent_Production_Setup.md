# PhotoFlex 腾讯云生产环境准备

更新日期：2026-10-07。本文记录正式上线资源和准备进度。

## 已确认资源

| 项目 | 配置或状态 |
| --- | --- |
| 正式主域名 | `photoflex.site` |
| 轻量服务器公网 IPv4 | `42.192.45.207` |
| 服务器应用镜像 | Hermes Agent 0.21.0；Ubuntu 24.04.4 LTS |
| 网站服务 | 已有 Caddy 2.11.4，占用 80；复用它部署 PhotoFlex |
| 生产源码分支 | `main`，当前发布基于 `406a618`，包含本次备案显示改动 |
| main 工作区 | `D:/project/Photoflex/MVP_Sequence/photoflex-MVP` |
| Vercel 自动部署 | 用户已确认暂停；旧站保留 |
| 旧站 | `https://photoflex-mvp.vercel.app/` |
| 旧用户项目迁移 | 本次不迁移，也不增加迁移入口 |
| CloudBase 生产环境 | 已创建：`photoflex-prod-d8g6nph8u08611400` |
| 网站发布进度 | 已发布到 `https://photoflex.site/`；main 自动发布流程待配置 |

## 生产环境创建要求

- 环境名称建议为 `photoflex-prod`。
- 数据库版本选 CloudBase PostgreSQL，与当前应用的 `app.rdb()` 接口及 SQL 权限模型一致。
- 当前客户端地域为 `ap-shanghai`（上海）；创建时核对地域，若选择其他地域需同步修改客户端配置。
- 套餐名称、费用、续费及正式域名支持，以实际控制台显示为准，购买前确认具体配置。
- 创建成功后记录环境 ID；当前代码仅需公开环境 ID，服务端密钥不属于前端配置。

生产环境 ID：`photoflex-prod-d8g6nph8u08611400`。

当前 main 的 `.env.development.local` 使用已有开发环境，仅供本地开发。main 的 `.env.production.local` 已设置独立生产环境 ID；项目表、登录方式及安全来源已初始化；已完成真实邮箱注册、登录态恢复、项目创建和修改保存，以及数据库角色模拟隔离验收。

## 创建环境后的配置顺序

1. 确认环境状态正常及 PostgreSQL 可用。
2. 在新环境中应用 `cloudbase/migrations/202609160001_create_projects.sql`，建立 `public.projects`、索引和四条本人数据 RLS 策略。该脚本不是重复执行脚本，先检查是否已有同名表。
3. 配置应用需要的邮箱验证和密码登录方式。
4. 将正式网站域名加入环境的安全来源，具体填写格式按控制台要求。
5. 将生产环境 ID 配置为生产构建的 `VITE_CLOUDBASE_ENV_ID`，重新构建。
6. 通过正式环境验证注册、登录、项目保存，以及不同账号的数据隔离。
7. 再进入轻量服务器的 Caddy、DNS、HTTPS 和 main 自动发布配置。

## 首次发布的现有验证

合并结果已通过 408 项测试、类型检查和生产构建；本地登录页已验证显示。生产环境的真实邮箱注册、项目创建和修改保存、登录态刷新恢复，以及数据库角色模拟权限检查已通过；正式域名下的密码登录、云端项目恢复与保存已通过；数据库隔离已用角色模拟验证，尚未做两个真实账号的浏览器切换测试。
## 购买前准备配置（历史报价）

2026-10-07 已登录腾讯云并进入实际创建页面，准备如下配置：

| 配置 | 页面所选值 |
| --- | --- |
| 名称 | `photoflex-prod` |
| 地域 | 上海 |
| 数据库 | PostgreSQL |
| 套餐 | 个人版 |
| 购买时长 | 1 个月 |
| 页面配置费用 | ¥19.90；以下单时实际金额为准 |
| 自动续费 | 关闭 |
| 超限按量 | 关闭；超限后限制用户访问 |

用户随后自行完成购买；新环境验收见下文。
## 生产环境创建验收

2026-10-07 用户完成购买，已通过控制台核对：

- 环境名称：`photoflex-prod`。
- 环境 ID：`photoflex-prod-d8g6nph8u08611400`。
- 套餐：个人版，控制台显示到期日为 2026-11-07。
- 数据库：PostgreSQL，数据编辑器可正常打开。
- 创建环境时 `public` Schema 暂无表；项目表随后已初始化，见后续配置验收。
- main 的生产构建配置已指向此环境；开发配置继续使用原开发环境。
- 下一步：创建项目表和本人数据权限，配置邮箱认证与正式域名安全来源。

前面的创建配置记录为购买前准备值，实际付款及计费设置以用户最终订单和控制台为准。
生产配置验证：2026-10-07 已通过类型检查和生产构建；构建产物包含生产环境 ID `photoflex-prod-d8g6nph8u08611400`，不包含原开发环境 ID。构建验收时尚未推送或部署；生产建表 SQL 后续已执行。

## 生产数据库与认证配置验收

2026-10-07 已在生产环境 `photoflex-prod-d8g6nph8u08611400` 完成本步骤：

- 通过 SQL 编辑器，在事务内执行现有项目表迁移；控制台返回执行成功。
- `public.projects` 已创建，`owner_id` 类型为 `text`，有主键索引及 `projects_owner_updated_at_idx` 复合索引。
- 行级安全（RLS）已启用，SELECT / INSERT / UPDATE / DELETE 四条策略仅适用于 `authenticated`，且均按 `owner_id = (select auth.uid())` 限制为本人数据。
- 查询数据库实际权限：登录用户有项目表增删改查权限；`anon` 没有以上权限。管理员查询属于配置核对，不等同真实账号隔离验证。
- 执行前控制台给出的 Supabase 语法提示与数据库事实不一致；已查询确认 `auth.uid()` 返回 `text`，且 `anon`、`authenticated`、`service_role` 都存在，并与当前 CloudBase 官方 PostgreSQL 文档一致。
- 邮箱验证码登录已启用，发件方式为 CloudBase 内置邮件服务（控制台显示“代发”）；密码登录原本已启用。匿名登录保持关闭。
- 内置邮件服务页面显示每分钟最多 10 封；启用提示预计 5 分钟内生效。
- `photoflex.site` 已加入 HTTP 网关的跨域安全来源；页面提示预计约 10 分钟生效。
- main 生产构建本地预览：`http://localhost:8080/`。该页面使用生产环境，不同于 `http://127.0.0.1:5181/` 的开发预览。
- 配置完成时真实账号验收尚未进行；后续验收结果见下文。
- 本步骤未修改网站 DNS、部署服务器、推送 main，也未变更开发 CloudBase 数据。

官方权限文档：https://docs.cloudbase.net/database/postgresql/data-permission
官方 PG 认证说明：https://docs.cloudbase.net/authentication-v2/auth/auth-pg
## 真实账号与项目保存验收

2026-10-07 用户自行完成生产环境邮箱注册，浏览器进入该账号的工作区。已完成：

- 新建“上线验收项目 2026-10-07”，无需导入照片，验证真实登录用户的项目 INSERT。
- 修改项目便笺后，前端显示“已保存到云端”；生产数据库中查询到相同项目与修改后的便笺内容，验证真实用户的 UPDATE。
- 刷新生产预览页面后，账号登录状态和项目便笺均恢复，云端状态为已保存。
- 项目 ID：`2be5a521-5801-4a3d-8c50-ce8fc5c43c63`。验收项目保留在用户账号中。
- 在控制台使用 authenticated 角色模拟项目所有者：可读取 1 条项目记录。
- 使用另一测试用户身份 `photoflex-isolation-check-other-user`：读取 0 条，直接按项目 ID 更新也影响 0 条。
- 使用该其他身份并伪造 owner_id 创建项目：数据库按 RLS 拒绝，SQLSTATE 42501。测试置于事务中；之后管理视图确认被拒绝的测试项目不存在。
- 使用 anon 角色读取项目表：权限拒绝，SQLSTATE 42501。
- 角色模拟已结束，控制台恢复管理员视图。上述隔离证据是数据库角色与用户身份模拟，不是第二个真实账号的浏览器登录测试。
- 退出后的密码重新登录、完整双账号浏览器流程及正式 HTTPS 域名访问仍属于首次发布验收项。

本步骤未改动应用源码，未推送 main，未修改服务器、DNS 或 HTTPS。随后已检查服务器并完成 Caddy 发布目录与待启用配置，见下文。
## 轻量服务器检查与发布准备

2026-10-07 已检查实际实例 `lhins-e6gtva5g`（Hermes Agent-JaIx），公网 IP `42.192.45.207`：

- 地域：上海五区；4 核 CPU、4GB 内存、40GB 系统盘，检查时磁盘剩余约 26GB。
- 实际系统：Ubuntu 24.04.4 LTS。
- 原有网站服务：Caddy 2.11.4，服务用户 `caddy`，配置 `/etc/caddy/Caddyfile`，监听 80。2019 管理端口仅监听回环地址。
- 当前 Caddy 配置仅提供 `/usr/share/caddy` 的默认静态欢迎页，没有 Hermes 反向代理配置。
- 本步骤复用已有 Caddy。未安装 Nginx，没有更改 Hermes 或原有 Caddy 运行配置。
- 腾讯云防火墙现有规则为 TCP 22 和 ICMP；80/443 暂未放行。系统 UFW 未启用。本步骤没有更改防火墙。
- 服务器免密 OrcaTerm 和自动化助手可用；此次通过控制台自动化助手执行检查与准备，未创建 SSH 密钥或改动账号密码。

已在服务器建立以下目录，由 `ubuntu:ubuntu` 拥有，权限为 0755：

- `/srv/photoflex/releases`：每次发布的静态网站文件。
- `/srv/photoflex/shared/assets`：保留各次发布的带哈希资源，让旧页面继续取得按需加载文件。
- `/srv/photoflex/incoming`：待解包的上传文件。

已准备域名配置：

- main 源文件：`deploy/tencent/photoflex-http.caddy`。
- 服务器待启用配置：`/etc/caddy/Caddyfile.photoflex.prepared`，包含当前默认站点及 PhotoFlex 的独立域名配置。
- PhotoFlex 主入口指向 `/srv/photoflex/current`；首次上传后创建该指向具体发布目录的链接。
- `/assets/*` 从共享资源目录读取，存在的资源使用长缓存；入口页和其他内容要求重新验证缓存。
- 配置已通过服务器 `caddy validate`，返回 `Valid configuration`，退出码 0；原 Caddy 服务仍为 active。
- 此配置目前使用 `http://photoflex.site`，仅作为首次上传后的准备配置；尚未启用，网站没有公开发布。

下一步：上传生产构建，检查域名解析与备案展示，配置 80/443 放行及正式 HTTPS，再准备 main 自动发布流程。

Caddy 静态文件服务说明：https://caddyserver.com/docs/caddyfile/directives/file_server
Caddy 配置验证说明：https://caddyserver.com/docs/command-line#caddy-validate
## 首次正式网站发布验收

2026-10-07 完成首次手动发布：

- 地址：`https://photoflex.site/`。
- 来源：main 工作区，基础合并提交 `406a618b0b8006084a42d05279149eec488ac2dd`，包括本次备案页脚补丁；原有 package.json / pnpm-lock.yaml 的 Analytics 版本修改继续保留，未被本次工作丢弃。
- 生产构建通过 471 项单元检查、类型检查与 Vite 构建；当前 main 的 Chrome / Edge 浏览器回归共 84 项通过。首次并行运行时一项 Layout 单元检查超时，降低并行负载后全套通过，没有改动该测试或放宽超时要求。
- 构建已核对包含生产 CloudBase 环境 ID，不包含开发环境 ID。
- 备案核对：网站 `photoflex.site`、云资源 `42.192.45.207` 状态正常。服务备案号 `京ICP备2026063985号-1` 已显示在登录页与首页，并链接 `https://beian.miit.gov.cn/`。
- DNSPod 新增两条默认线路 A 记录，`@` 和 `www` 都指向 `42.192.45.207`，TTL 600 秒；公共 DNS 查询已确认。
- 轻量服务器放行 TCP 80 与 TCP 443，原有 SSH / ICMP 规则保留。
- 经用户微信 MFA 验证后，通过 OrcaTerm 将生产包上传至 `/srv/photoflex/incoming`，控制台显示传输成功。
- 包文件：`photoflex-main-406a618-production.tar.gz`，100,203,614 字节。
- 包 SHA256：`881d0d62bc934507bae3f3770d770d797152d95c19c8c71b6883c35d6a9769eb`；服务器启用前核对一致。
- 发布目录：`/srv/photoflex/releases/20261007-406a618-production`，`/srv/photoflex/current` 已切换到该目录。
- 带哈希资源已复制到 `/srv/photoflex/shared/assets`。部署文件来自 dist，不包括项目源码、环境文件或服务端凭证。
- Caddy 已加载 `deploy/tencent/photoflex.caddy` 对应的正式配置；配置验证与重载成功，服务 active。
- 原 Caddy 配置备份：`/etc/caddy/Caddyfile.before-photoflex-20261007-406a618`。服务器上的配置候选：`/etc/caddy/Caddyfile.photoflex.live`。
- Caddy 已取得可正常验证的 HTTPS 证书；外部请求验证主站 HTTPS 返回 200，HTTP 返回 308 跳到 HTTPS，www HTTPS 返回 301 跳到主域名。
- 外部访问实际入口 JS 返回 200 和正确 JavaScript 类型；带哈希资源为 immutable 长缓存，入口 HTML 为 no-cache。
- 正式网站实际显示登录界面与备案链接。用户已使用生产账号完成密码登录；在新域名下恢复了此前的上线验收项目。
- 验收项目便笺修改为“正式域名验收通过：项目可恢复，修改已保存到腾讯云。”，云端保存成功，刷新后内容与登录态保留。

本次为手动首次发布。GitHub main 自动部署尚未配置，现有 Vercel 自动部署仍按用户已暂停的设置处理，旧用户本地项目不迁移。

后续 main 自动构建必须设置 `VITE_CLOUDBASE_ENV_ID=photoflex-prod-d8g6nph8u08611400` 与 `VITE_ICP_FILING_NUMBER=京ICP备2026063985号-1`，并将通过验证的 dist 发布到上述目录。

公安联网备案需另外办理，腾讯云控制台提示服务开通后 30 日内完成；本次未代为提交公安备案申请。
备案号悬挂说明：https://cloud.tencent.com/document/product/243/61412