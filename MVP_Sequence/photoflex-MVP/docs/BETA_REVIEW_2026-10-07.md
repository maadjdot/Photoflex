# PhotoFlex Beta 上线前审查

审查日期：2026-10-07。对象：当前工作区的 PhotoFlex MVP、仓库根目录的 CI 配置及本机生产构建配置。首次审查未修改业务源码、依赖或云端数据；执行了现有测试、构建、性能基准、依赖审计，以及使用隔离内存数据的故障复现。构建和浏览器测试会生成 dist、测试结果及部分设计截图。

**增量更新（2026-10-07，提交 `0f97585`）**：文末已追加 PNG / APNG / WebP、透明度、动画首帧及相邻显示选项的审查，新增 F13–F15。最新完整单元测试为 81 个文件、415 条通过，类型检查和生产构建通过；新增格式与外观的 Chrome / Edge 回归 18 条通过，另行复查的旧页码用例仍有 2 条失败。下方首次审查的结果保留为历史基线，最新结果与复现见文末。

**第一批修复更新（2026-10-07，当前工作区）**：F01、F02 已实现修复，并补充独立数据库连接与原生多标签页回归。最新全量测试 83 个文件、431 条通过（限制 4 个测试 worker），类型检查及生产构建通过；Chrome / Edge 的同步、启动、照片格式及外观回归 24 条通过。默认并发全量检查曾遇到既有 Layout 用例的 5 秒超时，详见文末修复记录。F03、F04 及其余问题仍待处理，不能据此认定整个 Beta 已完成上线验收。

**第二批修复更新（2026-10-07，当前工作区）**：F03 构建目标已改为核对过的独立生产环境，Beta 产物已生成；F04 默认检查与完整浏览器门禁已恢复。默认 `pnpm check` 的 84 个文件、442 条测试、类型检查、构建通过，Chrome / Edge 全量 70 条通过。补充并修复 F16（Sequence 遮挡草稿恢复操作）。生产配置已有真实注册 / 保存与角色模拟隔离的先前证据，本次只读复核了环境与权限；正式域名部署、双真实账号 / 双设备及远端 CI 尚未在本任务执行。

**第三批修复更新（2026-10-07，当前工作区）**：已处理 F05–F09：账号缓存优先恢复、云端项目按需加载、单项目错误与原始数据恢复下载、字体请求失败后重试、图片缓存 quota 降级及字体枚举校验。实施与验证范围见文末“第三批修复记录”。

**上线判断：建议先修复数据保存问题并恢复有效的浏览器上线门禁，再开放 Beta。** 项目的模块划分和基础测试已经较完整，主要风险集中在云端同步协调、故障恢复与发布配置。下面的 P1 表示建议上线前处理；P2 表示应纳入近期修复或优化。静态证据、隔离复现和外部环境尚待验证的事项分别注明，不将测试过期直接判定为产品缺陷。

**本次验证结果**

| 检查 | 结果 | 解读 |
| --- | --- | --- |
| 单元及集成测试 | 81 个文件、410 条全部通过 | 验证已有断言；未覆盖本文复现的跨实例同步竞态 |
| TypeScript 与生产构建 | 通过 | 存在大 chunk 提示，构建成功不能证明云端配置正确 |
| Chrome / Edge 浏览器回归 | 58 条中 48 条通过、10 条失败，约 4.1 分钟 | 两个浏览器均有相同的 5 类失败，详见 F04 |
| 10,000 张 Table 视口扫描 | 均值约 0.2514 ms | 纯逻辑微基准，不包含渲染、原图解码和持久化 |
| 500 项 Sequence 查询索引构建 | 均值约 0.0707 ms | 当前索引设计有效 |
| 200 个版本 × 500 项保存及备份 | 约 511 ms，备份 14,944,495 bytes，约 14.25 MiB | 使用 MemoryProjectStore；该场景只有 1 个采样，不能作为稳定 I/O 或网络基准 |
| 全部依赖漏洞审计 | 15 条公告命中：3 critical、5 high、5 moderate、2 low | 是公告条目数，含同一个包的多条公告 |
| 生产依赖漏洞审计 | 0 条登记漏洞命中 | 不代表运行权限、安全配置或所有依赖行为已验证 |

## 已确认问题及修复建议

### F01 · P1 · 多标签页同步竞态会造成新编辑丢失

**状态：第一批已修复，已通过本机隔离回归。** 下方保留原问题证据；实现、升级兼容与验证范围见文末“第一批修复记录”。

位置：`src/platform/cloudbase/CloudBackedProjectStore.ts:142`、`:160`、`:184`。

`generations`、`activeWrites` 和 `inFlight` 都是实例内状态，而 IndexedDB 与 localStorage 的 pending 标记被同账号的标签页共用。A 标签页导出快照并开始上传后，B 标签页可以提交更新。A 上传完成时仅检查自身的 generation，然后把共享 pending 清为 false，无法知道 B 已经写入了更新。

隔离复现直接执行现有 CloudBackedProjectStore，以共享本地存储模拟两个标签页：A 上传期间 B 保存成功，结果本地为 `Edit B`、云端为 `Edit A`，pending 为 false，B 的 `flushPending()` 返回 true；重新打开后本地变回 `Edit A`。这条路径会将实际未同步的新编辑误认为已同步，并在重开时覆盖。

建议：把待同步版本和已同步版本存入 IndexedDB，并与项目文档写入放在同一事务内。上传捕获持久化的本地版本，成功后只能确认该版本，不能清除更新版本的 pending。再用项目级 Web Locks 或统一后台协调器串行化同账号、同项目的跨标签页同步。广播状态可改善反馈，但单靠 BroadcastChannel 或实例内 generation 不足以修复数据一致性。

验收：延迟 A 的上传响应，期间让 B 修改同一项目或不同文档；B 的更新必须最终进入云端，或作为明确的冲突保留。任何返回“已保存”的状态都不能在刷新后丢失编辑。补充两个独立 IndexedDbProjectStore / CloudBackedProjectStore 实例共享数据库的回归测试。

### F02 · P1 · 云端冲突被隐藏，且缺少用户恢复入口

**状态：第一批已修复，已通过本机隔离回归。** 现在持续显示冲突，并提供下载、另存副本及保留副本后读取云端版本的入口；真实云端双设备验收仍需在最终环境完成。

位置：`src/app/CloudControls.tsx:57`、`:90`，`src/platform/cloudbase/CloudBackedProjectStore.ts:134`、`:155`，`src/app/M1App.tsx:39`。

CloudControls 和 CloudSaveStatus 都明确排除 `conflict` 的显示。同步器进入 conflict 后停止继续调度，但本地写入仍可以成功；应用的离开恢复面板由本地 coordinator 的失败触发，不会因云端冲突打开。用户可能继续编辑，却看不到云端已停止接收更新，也没有通过当前 UI 解决云端冲突的完整流程。

建议：持续显示明确的云端冲突状态，保留本地草稿，提供“下载恢复备份 / 另存为项目 / 读取云端版本”的操作；在保留本地内容后才允许丢弃或替换。Beta 可先提供另存副本和重新载入，不必立即实现自动合并。分别表达“本地已保存”和“云端已保存”，不要让本地保存状态覆盖冲突提示。

验收：两台设备同时修改，后写设备应看到冲突及恢复入口；刷新、退出登录和重新登录后，未同步内容仍可恢复，云端其他设备的内容不能被自动覆盖。

### F03 · P1 · 当前生产模式构建仍连接开发云环境

**状态：第二批已修复本工作区的构建目标与发布流程。** 独立生产环境及正式域名已从原有上线准备记录、当前控制台确认，生产 / Beta 配置已更新，真实目标 Beta 产物已生成。最终部署后的双真实账号 / 双设备验收仍待执行，不能认定整个上线验收已完成。操作见 [Beta 发布说明](BETA_RELEASE.md)。

证据：本机 `.env.production.local` 与 `.env.development.local` 的 CloudBase 环境 ID 相同；`docs/CloudBase_Migration.md` 明确将该环境标为开发与验收环境。`src/platform/cloudbase/client.ts:10` 和 `src/app/dependencies.ts:60` 直接使用构建时配置。

因此，如果本次生成的 dist 被作为 Beta 产物上传，用户会进入现有开发环境。另一个边界是未配置 CloudBase 时，应用会正常构建并回退到纯本地模式，没有针对公开 Beta 的构建失败检查。

建议：确定 Beta 专用环境；在该环境应用迁移、配置认证和域名来源。发布流程明确注入目标环境，并验证产物中实际使用的环境 ID。保留本地开发模式，同时为 Beta 发布命令增加“必须配置目标云环境”的校验。记录产物对应的源码版本、构建模式与云环境，避免上传多个旧 zip 中的错误版本。

验收：使用最终部署产物完成两个测试账号的真实权限和同步验收；确认创建的测试项目位于预期 Beta 数据库。此项没有改动或验证已部署服务，结论仅针对本机当前配置和产物。

### F04 · P1 · 浏览器上线门禁失效，现有 CI 无法发现这些失败

**状态：第二批已修复旧夹具与断言，并更新完整浏览器门禁。** 默认单元测试并发已固定为 4；CI 在单元 / 类型 / 构建通过后执行 Chrome、Edge 全量 E2E。远端 Actions 尚未执行；本机完整验证及新增实际问题 F16 见文末第二批记录。

位置：`tests/e2e/contact-sheet-ui.spec.ts:23`、`tests/e2e/sequence-pdf.spec.ts:29`、`tests/e2e/workflow-backup.spec.ts:8`、`:80`、`tests/e2e/sequence-ui.spec.ts:656`，仓库根目录 `.github/workflows/photoflex-mvp-ci.yml`。

本次 Chrome 和 Edge 各失败 5 条：

- Contact Sheet 用例把 schemaVersion 9、缺少 layoutIds 的旧项目直接写入当前数据库，当前工作区 schemaVersion 为 10，随后进入数据无法读取页面。
- Sequence PDF 用例也使用旧项目结构，在导出行为之前已无法正确打开项目；当前路由使用 SequenceOverlay，导出入口的产品行为也需要重新对齐。
- 初次使用与备份往返用例寻找已移除的首页文案和备份入口。
- 双标签页恢复用例等待不存在的 `Project backup file`，30 秒超时，实际并发恢复链路没有被执行。
- Layout 文字用例期待旧的 `2–3 / 10`，当前封面与正文页码规则显示 `1–2 / 8`；文字断言此前已通过，应按现有页码规则核对。

上述结果主要证明测试与产品契约脱节，不能直接宣称 PDF 导出或 Layout 文字保存坏了。Layout PDF 等相关现有用例通过。

CI 已存在，会执行 fixture 生成及 `pnpm check`；但 check 仅包含单元测试、类型检查和构建，不含浏览器测试。E2E 使用 mode=e2e 的本地模式，也没有覆盖真实 CloudBase 账号和同步。

建议：使用共享 fixture 工厂和当前 schema 常量，迁移测试另设旧数据库版本；更新已改变的产品断言。在 CI 增加关键浏览器 smoke 测试，将新建、编辑、刷新、恢复与导出纳入发布门禁，并增加隔离的云端同步测试。不能靠删除失败测试或放宽所有断言恢复绿色。

验收：最终发布版本的相关浏览器测试全部通过，且并发、故障恢复用例确实进入所要验证的阶段。正式环境外部验收另见文末。

### F05 · P2 · 断网重开时，本地项目缓存无法使用

**状态：第三批已修复。** 已登记为当前账号云端项目的缓存可以在云服务不可用时立即读取和编辑，待同步版本继续持久化；未建立归属的旧本地项目保持隐藏。

位置：`src/platform/cloudbase/CloudBackedProjectStore.ts:50`、`:103`、`:212`、`:218`。

首次初始化必须成功执行 cloud.list 和所有 cloud.pull，之后 loadWorkspace 和 listProjects 才能读取本地缓存。隔离复现中，本地项目仍然存在，云端 list 暂不可用时，通过 CloudBackedProjectStore 读取却返回 unavailable。已初始化页面的断网重试行为通过，不等于断网后刷新或重新打开也能恢复。

建议：对已经建立账号归属的缓存项目允许离线恢复，并明确显示缓存和待同步状态；将后台云端核对与本地读取分离。必须保留账号隔离及旧本地项目“不自动导入云端”的现有规则。若 Beta 明确要求在线启动，应把这个限制写入产品行为，而不要以完整离线能力对外描述。

验收：账号有缓存项目时断网刷新，能打开已保存结构并保留待同步修改；恢复网络后继续同步。无缓存账号仍显示准确错误。

### F06 · P2 · 单个坏项目会使整个账号的项目列表不可用

**状态：第三批已修复。** 首页读取云端摘要并按需加载项目；损坏记录保持可定位，提供重试与原始数据下载，不再阻断其他项目。

位置：`src/platform/cloudbase/CloudBackedProjectStore.ts:50`、`:56`、`:80`；`src/platform/browser/IndexedDbProjectStore.ts:93`。

初始化串行下载每个云端项目，并对任何 pull / install 失败立即返回 false。本地 listProjects 同样在发现任意损坏记录时拒绝整个列表。隔离复现给云端增加一个不完整快照后，正常项目仍在缓存中，但项目列表整体变为 unavailable。项目数量增长时，串行全量初始化也会明显拖慢首页。

建议：项目列表读取摘要，按需加载当前项目；对坏项目隔离并显示可定位的错误及恢复操作，允许其他完整项目正常工作。故障降级不能把坏项目冒充为正常空项目，也不能静默删除数据。

验收：一个损坏或暂时不可用项目不会阻止打开另一个正常项目；首页首屏不需要下载全部历史版本和 Layout。

### F07 · P2 · 字体请求失败后不能恢复，Layout 文字持续不显示

**状态：第三批已修复。** 失败 Promise 被移除，文字框显示错误与重试；浏览器重试会重建失败字体对象，同一文字框可以恢复。

位置：`src/platform/browser/layoutFontAssets.ts:87`、`:95`，`src/app/LayoutTextView.tsx:15`、`:19`、`:34`。

字体加载 Promise 在请求发出后即缓存，失败时不移除。文字视图只等待成功，没有失败分支；ready=false 时不生成任何文字行。隔离复现中第一次请求失败、网络随后恢复，第二次 loadLayoutFont 仍失败，网络调用次数始终为 1。

建议：失败时移除对应 Promise 缓存，允许重试；对文字视图提供明确加载失败状态与重试。用于排版的正式测量应等待正确字体，但加载错误必须可见，不能让空白文字看起来像内容被删除。

验收：阻断字体请求后恢复网络，同一文本框无需整页刷新即可恢复；失败不能形成未处理的 Promise rejection。

### F08 · P2 · 缩略图缓存写入失败会阻断本来可用的预览

**状态：第三批已修复。** 缩略图与 768px 派生缓存均按 best effort 持久化；quota 失败优先回收派生缓存、再回收缩略图，生成的预览仍可显示。

位置：`src/platform/browser/BrowserPhotoSource.ts:856`、`:881`、`:949`。

generateThumbnail 将缓存持久化失败作为整个预览失败；generateDerivedPreview 已经将同类缓存写入做成 best effort。隔离模拟 QuotaExceededError 时，前者返回 preview-unavailable，后者仍成功。浏览器缓存空间不足时，Contact Sheet / 来源列表可能持续显示占位，而原文件和已生成图片本身仍可用。

建议：生成结果与可丢弃缓存的持久化结果分离；持久化失败仍可返回 lease。给缩略图及 768px 缓存增加可回收策略，空间不足时优先删除派生缓存，不能删除项目结构或原片。

验收：模拟缓存 quota 失败，图片仍能显示，项目保存错误仍被准确报告。

### F09 · P2 · 字体枚举校验接受 Object 原型属性

**状态：第三批已修复。** 字体枚举改为自有属性校验，备份导入与云端安装在写入前拒绝原型属性名；支持的字体与历史兼容字体继续通过。

位置：`src/modules/layout/layoutFonts.ts:37`，`src/modules/layout/layoutDocument.ts:38`。

`value in LAYOUT_FONT_BY_FAMILY` 接受继承属性。隔离复现中 `constructor` 和 `__proto__` 都被当作合法字体；把 fontFamily=constructor 放入文字框后，isLayoutDocument 也返回 true。后续 CSS 字体映射及导出资源解析会得到无效值。这是输入校验错误，本次没有发现它可以越权访问其他账号或执行代码。

建议：改为 Object.hasOwn 或显式枚举集合，并在备份导入和云端快照校验时拒绝非枚举字体。

验收：非法字体在接触存储或渲染前被返回为明确的无效文档；正常字体、历史字体兼容值继续通过。

## 性能及可扩展性

### F10 · P2 · 首页与 Layout 加载成本已显著增大

本次构建主 JavaScript 为 1,439.84 kB，gzip 397.14 kB；LayoutWorkspace 为 1,309.67 kB，gzip 558.30 kB；主 CSS 为 164.63 kB，gzip 29.29 kB。旧质量基线记录的主 JavaScript gzip 为 115.21 kB，但功能范围已扩大，不能把全部增长判为同条件性能回退。

内存构建的模块贡献分析显示，主包较大的模块包括 CloudBase SDK、React DOM，以及 SDK 引入的 bson 与 streams 相关代码。Layout chunk 最大贡献之一为 fontkit。`LayoutWorkspace.tsx:14` 静态导入 exportLayoutPdf，而该模块静态导入 PDF 与 fontkit，因此打开 Layout 即加载导出依赖。

字体产物中 Noto Serif SC 单个常规字重约 14.81 MB、粗体约 14.81 MB，另有 10–13 MB 的中文字体。loadLayoutFont 会在主字体之外同时加载中文 fallback。构建产物大小不等于所有字体都会在首页一起下载，但单次中文字体请求就具有明显慢网成本。

建议优先：

1. 在点击 PDF 导出时再动态加载导出模块；阅读翻页代码也可按首次阅读加载。
2. 分析 CloudBase SDK 的实际使用功能，评估其官方支持的模块化入口或延迟初始化，避免仅为降低数字拆文件而没有减少首屏执行与下载量。
3. 屏幕展示使用 WOFF2 / 合理的分片字体；PDF 需要的字体资源在导出时获取。根据实际文本决定中文 fallback 的加载时机，同时确保缺字和排版一致性。
4. 对最终生产站做慢网、冷缓存测试，记录登录页、Table、首次 Layout、首次导出的加载耗时，建立新基线。

### F11 · P2 · 每次同步上传整个项目，文档独立修订未延伸到云端

位置：`CloudBackedProjectStore.ts:150`，`IndexedDbProjectStore.ts:584`、`:595`，`cloudbase/migrations/202609160001_create_projects.sql`。

本地 Sequence / Layout 有独立修订号，但云端只有一个 projects.document JSON 快照和项目级 cloud_revision。每次同步都读取并序列化所有版本、序列、布局与照片清单。exportBackup 还对整个账号的 photo-index 执行 getAll 后过滤当前来源，因此一个小项目的保存成本会随账号所有照片数量增长。

当前 200×500 版本备份约 14.25 MiB。若按这个规模全量同步，在低速网络下传输成本明显，且两台设备编辑不同 Sequence / Layout 也会竞争同一个项目修订号。

建议分两步：Beta 先用照片 by-source-id 索引读取当前项目、合并短时间内同文档的可替换草稿写入，并测量真实云端快照大小、请求耗时及失败类型；随后按已确立的文档接口，将 Worktable / Sequence / Layout / Version 独立存储与同步。需要同时设计创建、删除、版本快照与恢复的一致性，不宜只在前端更换一个保存方法。

验收：增加“账号有大量照片、小项目频繁编辑”的真实 IndexedDB 基准；观察同步队列不会持续积压。确认服务端实际允许的请求大小及配额，本次未实测 CloudBase 上限。

### F12 · P2 · 长会话的历史与图片缓存缺少内存预算

位置：`worktableEditor.ts:81`、`:96`、`:833`，`sequenceEditor.ts:23`、`:47`，`LayoutWorkspace.tsx:103`，`BrowserPhotoSource.ts:94`、`:1090`、`:1110`。

三个编辑器均保留未设上限的撤销历史，Table snapshot 还会复制工作区内容。图片 URL 缓存按条数保留最多 72 个闲置项，可能包含原始图片 Blob；这不是按内存字节的上限，活跃 lease 也不会因达到条数限制被移除。

隔离复现创建 100 个 lease 后释放全部，仍保留 72 个缓存 URL，只有 28 个被 revoke。这是当前缓存策略的行为，不能据此直接宣称内存泄漏；风险在于大量大原片及长时间编辑的累计占用。

建议：为撤销历史设置条数或内存预算，对大文档保留结构共享或命令级记录；为原片与派生图分设缓存预算，原片用更小预算或释放即回收。Layout 的 PDF 导出控制器应在组件卸载时 abort，避免离开工作区后导出继续运行并触发下载。

验收：使用真实大 JPEG，连续编辑、撤销、浏览、切换项目和账号，记录长会话内存峰值、回收情况和交互延迟。当前微基准没有覆盖这一场景。

## 安全、运维及维护性

**权限设计有合理基础，但双真实账号隔离仍需验收。** CloudBase SQL 对 SELECT / INSERT / UPDATE / DELETE 各设置本人 owner_id 策略，UPDATE 同时约束修改前后归属，匿名角色未获得项目表权限；客户端更新和删除也带 cloud_revision 条件。原片来源读取与导出目标安全检查已分离，文本 HTML 转换会重建允许的节点而非直接保留任意输入。首次审查没有访问真实账号执行匿名、跨账号及服务端权限测试，也没有核验已部署环境是否实际应用了仓库中的 SQL。第二批已只读核对生产环境中的实际策略，并找回先前真实注册 / 保存及角色模拟验收记录，具体证据与边界见文末。

**开发依赖需要升级。** 当前审计命中 Vite、Vitest、Playwright 等开发工具及其传递依赖，生产依赖审计为 0。官方公告说明相应漏洞有开发服务、UI / Browser Mode 或安装过程的触发条件，不能将审计的 critical 数量直接解释成静态网站存在远程执行漏洞。建议升级到消除当前公告命中的受支持版本，重新运行项目回归，并在 CI 定期审计锁文件。[Vitest 官方安全公告](https://github.com/vitest-dev/vitest/security/advisories/GHSA-5xrq-8626-4rwp)、[Vite 官方 Windows 路径访问公告](https://github.com/vitejs/vite/security/advisories/GHSA-93m4-6634-74q7)。

**生产错误诊断不足。** `dependencies.ts:89` 只在 DEV 中创建 console diagnostics，账号作用域依赖也未转交该诊断对象。云端许多错误归为 unavailable，并固定每 3 秒重试，难以区分认证失效、权限拒绝、请求超限和暂时网络故障。除 SourceBrowser 局部边界外，应用主要页面和 lazy 路由缺少可恢复的错误边界。建议记录最少的失败类别、文档范围、版本和耗时，并给不可重试错误提供准确行动提示；不要上传原片、邮件、备忘录或全文快照。对动态模块加载失败提供重试或安全刷新入口，保留可恢复草稿。

**现有模块边界值得保留。** contracts、纯编辑命令、平台适配器、持久化 coordinator、Table / Sequence session、图片 lease 和虚拟化的分工较明确，存储有迁移与原子事务测试。优先加强这些接口的实际保证，避免一次性重写项目。

扩展工作宜沿以下边界推进：

- 同步器封装持久 outbox、确认版本、跨标签页协调与故障状态；页面通过少量状态及恢复方法使用它。
- 为 Layout 提取类似 SequenceSession 的会话控制器，集中加载 generation、编辑历史、保存失败、重试及 dispose。当前 LayoutWorkspace 同时管理多种职责，复杂故障路径不容易独立验证。
- Worktable 独立保存接口已经存在，底层仍将 draft 存在 workspace。与云端文档拆分一起完成独立 Worktable 文档，避免仅增加一层转发。
- `CloudBackedProjectStore` 和 `CloudBaseProjectCloud` 引用 app/jsonSemanticEqual，可将这类无 UI 的共享工具移到平台无关的位置。旧 Supabase 适配器及旧 SequencePage 是否继续支持需要形成明确决定，避免维护看似有用却已不被当前路由使用的路径。

## 建议实施顺序及上线验收

| 阶段 | 工作 | 完成标准 |
| --- | --- | --- |
| 上线前第一批 · 已实现并完成本机回归 | F01 持久同步版本与跨标签页协调；F02 冲突提示与恢复 | 独立数据库连接、Chrome / Edge 原生多标签页及冲突恢复通过；最终云环境双设备验收待完成 |
| 上线前第二批 · 代码与本机门禁已完成 | F03 目标云环境；F04 有效浏览器门禁 | 独立环境已配置，Beta 构建与默认检查通过，Chrome / Edge 全量 70 条通过；部署后的真实账号 / 双设备验收待执行 |
| 第三批 · 代码与本机回归已完成 | F05/F06 离线和项目级隔离；F07/F08/F09 故障恢复与校验 | 456 条单元 / 集成、48 条相关 Chrome / Edge 回归通过，见第三批记录 |
| 第四批 · Beta 阶段优化与本机基线已完成 | F10 延迟导出与字体资源；F11 索引读取、草稿合并与上传指标；F12 历史与缓存预算 | 467 条单元 / 集成、54 条相关 Chrome / Edge 回归分批通过；F11 文档独立云同步及生产性能验收仍待完成，见第四批记录 |
| 持续维护 | 开发依赖更新、生产诊断、Layout session 与文档边界 | 故障可定位，新增功能不会扩大现有保存作用域 |

最终上线验收建议覆盖以下具体场景：

1. 两个真实邮箱账号分别创建、读取、更新、删除项目；匿名与另一账号不能访问，不能改 owner_id 抢占项目。
2. 两个标签页、两台设备同时编辑；包括编辑不同文档、上传响应延迟、云端已提交但响应丢失，以及未同步时刷新。
3. 断网、会话过期、存储 quota 失败、单个损坏快照；确认故障提示、保留草稿与恢复副本可用。
4. 新建项目 → 接入照片 → Table 编辑 → Sequence → Layout → 导出 → 刷新恢复，使用最终生产构建。
5. 若 Beta 对外支持 Safari / Firefox，补充这些浏览器的目录兼容模式、刷新重连、文字字体和导出验收。Chrome 与 Edge 同属 Chromium，当前 58 条测试不能证明跨浏览器引擎兼容性。
6. 1,000 / 10,000 张真实照片、较多历史版本和长时间编辑，测量冷启动、可见图片加载、编辑响应、云端上传大小和内存回收。

本次能够确认代码与本机验证中的上述问题；真实云端 RLS、认证邮件、生产托管配置、配额及真实设备性能仍缺验收证据。建议将这些记录与修复后的测试结果绑定到最终发布产物，而不要沿用旧的 QUALITY_BASELINE 数字作为本次 Beta 的通过证明。

## 新增功能增量审查 · 2026-10-07

本次以 `0f97585`（支持 PNG / WebP 和透明度，31 个文件变更）为主要范围，同时复核相邻提交 `e69f956` 的照片白色间隙与 Layout 页码开关。检查了文件夹扫描、文件拖入、缩略图及分档预览、Frame JPEG、Sequence PDF、Layout PDF、原文件复制，以及新增字段与保存、撤销和重开的衔接。以下 F13–F15 均有执行现有代码的隔离复现；F13 与 F15 是原有机制在新增功能中的耦合问题，并非断言它们由本次提交首次引入。

### 最新验证结果

| 检查 | 结果 | 范围及限制 |
| --- | --- | --- |
| 完整单元 / 集成测试、类型检查、生产构建 | 81 个文件、415 条通过；类型检查和构建通过 | 运行 `pnpm check`；构建仍有大 chunk 提示 |
| 新增图片格式及外观浏览器回归 | Chrome / Edge 共 18 条全部通过，约 1.5 分钟 | `photo-formats.spec.ts` 与 `layout-appearance.spec.ts`；覆盖透明度、两种动画首帧、四档 PDF、EXIF JPEG、原文件复制、撤销与刷新 |
| 原报告 F04 的 Layout 文字 / 页码流程复查 | Chrome / Edge 共 2 条仍失败 | 第 656 行仍期待 `2–3 / 10`，实际为 `1–2 / 8`；不是新的文字渲染缺陷 |
| 混合文件拖入、扩展名不匹配 | 已在隔离 Chrome 中复现 F13 / F14 | 使用临时 OPFS 文件及独立 IndexedDB，不使用真实原片、账号或云端 |
| 重复透明照片的 PDF 资源复用 | 已在隔离数据中复现 F15 | 使用 768 × 512 合成噪声 RGBA PNG；测量文件体积与资源数，不是实际照片性能承诺 |

没有重跑首次审查的全部浏览器套件、依赖审计或云端验收，因此不能将 18 条新增回归通过解释为整个 Beta 上线门禁已恢复。F04 的旧测试契约与 CI 覆盖仍需要处理。

### F13 · P2 · 一张损坏图片会中断整批拖入，并留下未返回给界面的部分导入

位置：[BrowserPhotoSource.ts:695](D:/project/User-Iteration-1/MVP_Sequence/photoflex-MVP/src/platform/browser/BrowserPhotoSource.ts:695)、[BrowserPhotoSource.ts:707](D:/project/User-Iteration-1/MVP_Sequence/photoflex-MVP/src/platform/browser/BrowserPhotoSource.ts:707)、[BrowserPhotoSource.ts:720](D:/project/User-Iteration-1/MVP_Sequence/photoflex-MVP/src/platform/browser/BrowserPhotoSource.ts:720)、[TablePage.tsx:224](D:/project/User-Iteration-1/MVP_Sequence/photoflex-MVP/src/app/TablePage.tsx:224)。

`ingestDroppedFiles` 将整批文件放在同一个 try / catch 中，但每个成功文件立即写入索引和句柄。只要某张受支持扩展名的图片解码失败，方法就返回整体 `io`，丢弃已经累积的成功结果，也不继续后续文件。TablePage 看到整体错误后直接返回，无法把已导入的正常图片放到桌面。文件夹扫描已有逐文件失败隔离，拖入路径的行为却不同。

隔离复现：按顺序拖入有效 `good.png`、损坏 `broken.png`、有效 `later.png`，返回 `{ ok: false, error: { kind: "io", retryable: true } }`；照片索引中已经存在 good.png，later.png 没有被处理。再次拖入同一批文件仍返回相同错误。用户只看到导入失败，实际存储已发生部分写入；首次拖入还可能已经创建了 External Imports 来源。

这是拖入批次处理与持久化、桌面放置的原有耦合，新增格式的扫描测试没有覆盖这一失败路径。建议按文件捕获不可读 / 解码失败，继续处理其余文件，并通过已有 `PhotoIssue` 的 `unreadable-file` 返回具体文件名和成功项；Table 将成功项正常放置并展示失败清单。若希望采用整批原子语义，则须先完成全批验证，再统一提交，不能保持当前“部分写入但整体只返回失败”的状态。单张图片的索引和句柄也应作为同一个提交单元，或在第二步失败时回滚第一步。

验收：将坏 PNG / WebP 分别放在批次首、中、尾，正常文件都能按约定导入，失败文件可被准确定位；重复拖入复用已成功项，不能产生重复照片或不可恢复的索引记录。目录扫描和拖入的失败反馈应保持一致。

### F14 · P2 · Sequence PDF 用扩展名决定编码，可能丢失实际 PNG / WebP 的透明度

位置：[exportSequencePdf.ts:73](D:/project/User-Iteration-1/MVP_Sequence/photoflex-MVP/src/platform/browser/exportSequencePdf.ts:73)、[exportSequencePdf.ts:98](D:/project/User-Iteration-1/MVP_Sequence/photoflex-MVP/src/platform/browser/exportSequencePdf.ts:98)，对照 [photoImage.ts:8](D:/project/User-Iteration-1/MVP_Sequence/photoflex-MVP/src/platform/browser/photoImage.ts:8)、[exportLayoutPdf.ts:156](D:/project/User-Iteration-1/MVP_Sequence/photoflex-MVP/src/platform/browser/exportLayoutPdf.ts:156)。

导入入口按扩展名筛选候选文件，随后公共解码器会识别实际容器。Frame 与 Layout 导出也使用实际容器决定编码，但 Sequence PDF 从 `relativePath` 推断 jpg / png。因而同一张已经被成功导入的图片，在不同出口会得到不同透明度。

隔离复现：将有效透明 PNG 命名为 `transparent.jpg`。导入成功，公共检查器识别为 png，派生预览透明像素的 alpha 为 0，Layout 原图档返回 png；Sequence PDF 却选择 JPEG、先填白再合成，最终 PDF 的透明遮罩数量为 0。预览看到的纸张 / 下层内容在此导出中被替换为白色。只有扩展名与实际编码不一致时触发，正常命名的 PNG / WebP 已通过新增回归。

建议把“候选文件扩展名”与“实际图像编码”明确分开：Sequence 使用公共检查器得到的实际格式，或让 PhotoSource 的派生图像接口携带实际编码 / 保留透明度的信息。当前所有浏览器派生预览都编码为 WebP，也可在 Sequence 统一转为透明 PNG 以保持结果，但需要评估 JPEG 内容的文件体积；优先复用实际源格式信息。不要让三种导出分别推断同一个照片属性。

验收：透明 PNG / WebP 使用正确扩展名及错误的 `.jpg` 扩展名，分别验证预览、Frame 合成、Sequence 和 Layout 输出一致；空 MIME 仍能工作，原文件夹复制保持原名及字节不变。

### F15 · P2 · Sequence PDF 不复用重复照片，透明 PNG 使导出成本显著放大

位置：[sequence-export/index.ts:31](D:/project/User-Iteration-1/MVP_Sequence/photoflex-MVP/src/modules/sequence-export/index.ts:31)、[sequence-export/index.ts:33](D:/project/User-Iteration-1/MVP_Sequence/photoflex-MVP/src/modules/sequence-export/index.ts:33)，对照 [layoutPdf.ts:66](D:/project/User-Iteration-1/MVP_Sequence/photoflex-MVP/src/modules/layout/layoutPdf.ts:66)。

Sequence 每遇到一个 photo item 都重新调用 `loadImage` 并嵌入新的 PDF 图像，即使 photoId 相同。派生预览缓存可以省去源图的重复缩放，却不能省去浏览器适配器再次解码、转换 PNG，以及 PDF 中重复存放 RGB 与透明遮罩。`pdf.flush()` 不会把这些重复资源自动合并。Layout 已通过 image key 复用同一资源。

隔离测量使用同一张 768 × 512 透明合成 PNG（1,391,515 bytes），将同一个 photoId 分别放入 1 个与 20 个位置：

| 输出 | 照片位置数 | 图像加载次数 | PDF 图像对象数（含透明遮罩） | PDF bytes |
| --- | --- | --- | --- | --- |
| Sequence | 1 | 1 | 2 | 1,183,983 |
| Sequence | 20 | 20 | 40 | 23,667,327 |
| Layout | 1 | 1 | 2 | 1,183,977 |
| Layout | 20 | 1 | 2 | 1,188,065 |

20 次重复在 Sequence 中产生约 22.57 MiB，而 Layout 约 1.13 MiB。合成噪声数据用于暴露资源重复，不能据此推断所有真实照片的压缩率，也没有测量浏览器峰值内存。资源数和加载次数已直接证明重复工作；无透明度的 JPEG 路径原本也存在这一机制，新增 PNG / WebP 到无损 PNG 的转换让它更值得处理。

建议在单次 Sequence PDF 导出内按 photoId 缓存已经嵌入的 PDFImage，后续位置只执行排版和 drawImage；每个阅读位置继续保留，进度仍按页更新。缓存只保存 PDF 资源引用，无需长期持有 canvas、ImageBitmap 或 preview lease。若后续加入按项滤镜、裁切或导出质量，应把影响编码结果的字段纳入 key，与 Layout 的做法保持一致。

验收：同一张透明照片出现 20 次，仍有 20 个阅读位置 / 对应页数，但只加载与嵌入一次图像资源；PDF 体积接近单资源加页面开销。同时验证取消、空白页、双页和不同照片不会因复用受到影响。

### 耦合检查结论及近期改进顺序

| 连接处 | 本次结论 | 建议 |
| --- | --- | --- |
| 格式筛选 → 解码 → 多种导出 | 已有公共 `photoImage` 解码器，Sequence 的格式判断尚未统一，见 F14 | 复用实际编码信息，不再从文件路径推断透明度 |
| 拖入 → 索引 / 句柄持久化 → Table 放置 | 存在部分写入与整体错误的语义冲突，见 F13 | 优先统一逐文件成功 / 失败结果，保证单文件提交完整 |
| 透明图片 → 白色间隙 / 阴影 / 纸张 | 新代码将 Layout PDF 白色间隙改为环形条带，阴影避开照片内部；新增测试验证 alpha 和纸张合成 | 保留现有共享边框规则，避免以后用整块白色矩形覆盖透明区 |
| 动画 → 各档预览 / 各种导出 / 原文件复制 | Chrome / Edge 下首帧冻结和透明度通过，复制保留完整原文件 | 将动画解码能力纳入原有跨浏览器验收；其他引擎尚未验证 |
| 白色间隙 / 页码开关 → 文档校验 / 撤销 / 保存 / 重开 | 可选布尔字段有校验，缺省值兼容旧文档；相关单元、持久化和浏览器测试通过 | 保留默认语义，继续复用 Frame 的边框计算与 Layout 的页码计算 |
| 重复照片 → Sequence / Layout PDF | 两条路径资源复用能力不同，见 F15 | 在 Sequence 导出中增加单次任务资源复用 |
| 新照片 → 现有备份 / 云同步 / 缓存 | 原文件字节仍通过只读接口访问，没有发现新增云端原片上传；新增格式没有修复 F01/F02/F08/F11/F12 | 保存、冲突、quota 与长会话风险继续按原优先级处理 |

近期先处理 F13 的批次失败反馈及部分写入，再统一 F14 的编码来源；F15 可作为同一导出优化批次的小范围改动。对于正常命名、可读的新增图片，本次没有发现会改变照片排序、修改原片或破坏白色间隙 / 页码保存的新问题。新增功能的主流程已验证，但原报告的上线前保存问题与浏览器门禁问题仍需解决。

## 第一批修复记录 · 2026-10-07

本批按上述实施顺序处理 F01、F02；以下是当前工作区的实现及验收记录，更新前文历史审查结论。

### F01：持久同步版本与跨标签页协调

- 新增 `src/platform/cloudSync.ts`，将本地版本、已确认版本、云端基准版本与冲突状态保存在 IndexedDB 的 `cloud-sync` 中。本地项目、Table、Sequence、版本及 Layout 的成功写入，与同步版本递增处于同一事务；拒绝的编辑不产生新版本，事务中止会一起回滚文档和同步记录。纯本地项目不自动注册为云端项目。
- `IndexedDbProjectStore.captureCloudSnapshot` 在同一个只读事务中捕获项目快照与对应同步版本。上传完成只确认捕获的版本；另一标签页后来提交的编辑继续保持待同步，不会被旧响应清除。
- `CloudBackedProjectStore` 使用按账号环境及项目区分的 Web Locks 串行化上传、初始化拉取及冲突恢复。普通本地编辑使用另一把写锁，因此仍能在网络上传期间保存。BroadcastChannel 更新其他标签页的同步状态；持久记录和锁共同保证一致性，广播不承担数据确认职责。
- 初始化及手动读取云端内容时，通过本地版本条件检查阻止旧快照覆盖新提交。替换云端文档后，项目、Sequence、Layout 的本地乐观版本不会倒退；旧页面草稿不能以恰好相同的旧版本号覆盖新内容。云端已提交但本地确认失败时，相同内容可以重新确认；不同内容保留为可见冲突。
- IndexedDB 结构从 12 升级为 13，工作区文档仍为 schema 10。升级仅增加同步存储，不重写已有项目；旧 localStorage 同步标记在账号项目初始化时迁入持久记录，提交成功后才移除。浏览器云端模式要求 Web Locks；缺少该能力时返回不可用，不降级为实例内锁。Chrome、Edge 已实测。

主要实现：`src/platform/cloudbase/CloudBackedProjectStore.ts`、`src/platform/browser/IndexedDbProjectStore.ts`、`src/platform/memory/MemoryProjectStore.ts`、`src/platform/cloudbase/projectSyncLock.ts`。无 UI 的语义比较工具移至 `src/platform/jsonSemanticEqual.ts`，原 app 路径保留转发，移除了同步适配器对 app 工具的依赖。

### F02：可见冲突与保留副本的恢复流程

- `CloudControls` 与 `CloudSaveStatus` 现在明确显示“已保存到本地 · 云端存在冲突”。新增 `CloudConflictRecovery`，在 Home 及项目页面持续提供恢复入口。
- “下载恢复备份”导出保留的本地内容；“另存副本并打开”创建独立项目，保留原项目冲突；“保留副本并读取云端版本”先把本地快照另存为项目，成功后才读取及安装云端版本。副本保存失败、读取失败或恢复过程中出现新本地提交，均不替换原项目的当前本地内容。
- 恢复动作先完成当前页面的本地保存屏障；云端替换后再次检查恢复期间新产生的页面草稿。若保存失败，保留页面并使用已有草稿恢复面板处理。成功恢复当前项目才重建其页面及保存协调器；恢复其他项目不会重置当前编辑中的项目。
- 冲突状态持久化，重新打开后仍能恢复。副本沿用当前备份导入机制，重新生成项目及文档引用；原照片文件不包含在结构备份中，打开副本后需要重新连接照片文件夹。中英文提示已补齐。

主要实现：`src/app/CloudConflictRecovery.tsx`、`src/app/M1App.tsx`、`src/app/CloudControls.tsx`。

### 验证结果及尚存边界

| 检查 | 结果 | 证据及范围 |
| --- | --- | --- |
| 完整单元 / 集成测试 | 83 个文件、431 条通过 | `pnpm exec vitest run --maxWorkers=4`，未放宽断言或测试超时 |
| 并发持久化回归 | 10 条通过 | `cloudSyncConcurrency.test.ts` 使用两个独立 IndexedDbProjectStore 连接共享数据库；覆盖上传期间新编辑、初始化旧拉取、原子写入与回滚、冲突重开、恢复副本失败、恢复期间新编辑、旧文档拒绝保存、确认失败重试及旧标记迁移 |
| 恢复 UI 回归 | 5 条通过 | `CloudConflictRecovery.test.tsx` 覆盖 Home 入口、实际备份内容、独立副本、保存屏障、失败及晚到草稿的页面保留；既有 CloudControls 4 条通过 |
| 数据升级与存储契约 | 通过 | IndexedDB 迁移 8 条，存储契约 14 条；新增 12 → 13 项目保留与空同步记录验证 |
| 原生浏览器回归 | Chrome / Edge 共 24 条通过 | 新增 `cloud-sync.spec.ts` 4 条验证原生 IndexedDB、Web Locks、BroadcastChannel、多标签页重开、实际下载及恢复副本；其余覆盖启动、PNG/APNG/WebP、透明度、动画首帧、PDF、白色间隙及页码开关 |
| TypeScript / 生产构建 | 通过 | `pnpm build`，现有大 chunk 提示仍在，属 F10 范围 |

默认 `pnpm check` 的全量并发运行先后在既有 `SequenceOverlay.test.tsx` 的“创建 Layout、保存页序并重开”用例遇到 5 秒超时。该文件单独运行 10 条全部通过，超时用例约 718 ms；限制 4 个 worker 后两次全量检查全部通过，最终包含新增草稿屏障用例共 431 条。此处如实记录运行并发敏感性，没有延长超时、删除测试或修改 CI；第二批 F04 仍应使默认发布门禁稳定可复现。

浏览器同步测试使用隔离的假云端 CAS 服务，实际执行生产同步器和浏览器存储 / 锁；未连接或改写真实 CloudBase 项目。正式云端账号权限、网络、会话过期及双设备行为需要在 F03 的最终环境中验收。本批未处理 F03–F15 的其余问题，也未宣称所有旧 E2E 已通过。

## 第二批修复记录 · 2026-10-07

### F03：独立 Beta 构建与可核对的发布产物

新增 `.env.beta.example`、`config/betaRelease.ts`、`build:beta` 与 `release:beta`。Beta 使用专用 `VITE_BETA_CLOUDBASE_ENV_ID`、`VITE_BETA_ORIGIN`，不沿用旧生产配置的通用云 ID。构建拒绝缺失 / 占位 ID、已知及当前配置的开发环境 ID，以及错误的 HTTPS 来源地址；没有配置时不能以纯本地模式冒充 Beta。

`vite.config.ts` 将确认的 Beta ID 编译到实际 CloudBase 配置，产物独立写入 `dist-beta/`，根目录生成 `release.json`，包含应用版本、mode、实际 envId、来源、源码提交、源码改动标记及构建时间。`release:beta` 先生成照片夹具，再完成默认全量检查与全部浏览器回归，最后生成 Beta 产物；中途失败不继续生成本次发布产物。普通 `dist/` 保留用于开发及构建检查。完整说明见 [BETA_RELEASE.md](BETA_RELEASE.md)。

新增 11 条配置回归通过；实际执行缺少配置的 Beta 构建得到预期拒绝。使用隔离假 envId 和 `.invalid` 来源完成编译，检查产物中的真实前端 JS 使用指定测试 ID、没有包含开发环境 ID，且 `release.json` 与编译目标一致。这验证构建注入与记录，不代表该假 ID 对应真实 CloudBase 环境；验证产物仅放在测试输出目录。

随后从用户原有“梳理腾讯云上线流程”任务和 `D:/project/Photoflex/MVP_Sequence/photoflex-MVP/docs/Tencent_Production_Setup.md` 找到已确认资源，并在当前控制台只读复核：目标为 `photoflex-prod-d8g6nph8u08611400`，正式域名 `photoflex.site`。该环境已有 `public.projects`，RLS 已启用，四条策略均仅适用于 `authenticated`、按 `owner_id = (select auth.uid())` 限制，UPDATE 的 USING / WITH CHECK 均正确；邮箱验证码和密码登录已启用，匿名登录关闭，正式域名安全来源已有配置。

根因是这份审查工作区的未提交环境文件仍指向开发环境，而 main 的另一份工作区已经配置生产环境。已修正本工作区 `.env.production.local`，并建立 `.env.beta.local`；后续 `pnpm build:beta` 使用真实生产目标成功，检查前端 JS 中有生产 ID、无开发 ID，`dist-beta/release.json` 记录的来源为 `https://photoflex.site`，源码提交为 `0f97585cbc7c63c09eafd5b099c5ff013063d2a6`、`sourceDirty=true`（包含本轮尚未提交的修复）。该产物尚未部署；应先保留 / 提交对应源码再用于正式发布。

原有上线准备记录包含真实邮箱注册、项目新建 / 修改 / 刷新恢复，以及管理员控制台对其他用户身份和匿名角色的隔离模拟。身份模拟不等同第二个真实账号的浏览器登录，本任务没有把这些历史证据冒充为新同步器的双设备验收。本任务未修改现有开发环境、云端项目或托管站点；正式 HTTPS 部署、两个真实测试账号的完整隔离与冲突恢复，仍需在最终产物发布后完成。

### F04：恢复有效浏览器门禁

- 使用 `tests/helpers/browserProjectFixture.ts`，通过当前项目工厂补齐 schema、Layout 列表与 Table 默认字段，并校验生成的工作区。所有直接写入项目行的浏览器夹具已切换，旧 schema 只留在迁移 / 备份兼容测试中。
- 更新 Contact Sheet 的当前控件尺寸、图片裁切和停靠侧栏规则；选择工具栏验证实际单行布局和可见边界。Layout 阅读页码按当前封面 / 正文规则精确断言，保留文字、刷新、历史与 PDF 内容检查。
- 首次使用 / 备份用例执行当前帮助入口、新建项目、照片重连、Contact Sheet、Table、Sequence、前进后退及刷新。已移除的日常备份按钮不再作为产品入口；备份往返通过生产持久化及下载接口验证，明确测试边界。
- Sequence 日常 PDF 按钮已移除，浏览器用例验证当前 photo reader，同时执行生产 PDF 适配器保留旧 spread / blank / repeat 的兼容契约。当前 Layout PDF 仍通过真实 UI 导出并检查文件内容；没有为测试重新加入过时入口。
- 双标签页草稿冲突用例现在实际执行相反编辑、拒绝覆盖、受保护导航、恢复备份下载及独立副本，检查原项目与恢复项目的照片顺序。由此复现并修复 F16。
- 云端延迟夹具改为共享假服务端闸门：任何获得 Web Lock 的标签页发起上传，都会被同一闸门延迟，消除了只在 A 标签页设置延迟、实际由 B 上传时的测试竞态。
- `vitest.config.ts` 固定 4 个 worker；默认 `pnpm check` 无需临时参数即可运行。E2E 服务器禁用热更新，并在固定端口占用时失败；设计截图改存每条测试 / 每个浏览器的独立输出路径，避免覆盖仓库设计产物或遭遇文件锁。
- CI 安装 Chrome / Edge 并执行完整 E2E；失败保留 HTML 报告、截图及 trace。手动 Beta 构建只在此前检查全部成功且显式选择构建时运行，并从仓库变量读取目标配置、保存按 SHA 命名的产物。工作流 YAML 已解析并检查执行顺序、浏览器渠道与配置传递；未运行远端 Actions。

### F16 · P1 · Sequence 覆盖层遮挡草稿恢复操作 · 已修复

恢复原双标签页测试后，B 的冲突草稿确实保留，受保护导航也打开了恢复面板，但面板是没有样式的普通 `div`，位于全屏 `sequence-overlay` 之下。实际点击“下载恢复备份”或“保存恢复副本”会被 Sequence 网格拦截。此前用例未越过过时入口，未检测到这一产品问题。

`M1App.tsx` 现在通过原生模态 `dialog.showModal()` 将草稿恢复操作置于浏览器顶层，明确保留“继续编辑 / 下载恢复备份 / 保存恢复副本”，并拦截其键盘事件，防止底层 Sequence 焦点管理抢回 Tab。`global.css` 复用冲突恢复样式。浏览器回归检查面板可见、初始焦点、Tab 到下载按钮、实际文件内容、副本内容以及原项目未被覆盖，已在 Chrome / Edge 中执行通过。

### 第二批最终验证

| 检查 | 结果 | 限制 |
| --- | --- | --- |
| 默认 `pnpm check` | 84 个文件、442 条测试全部通过；类型检查及构建通过 | 已使用配置中的默认 4 个 worker，无临时超时或重试放宽 |
| 默认 `pnpm test:e2e` | Chrome / Edge 全量 70 条通过，约 7.7 分钟 | 使用隔离数据和假云端；没有跳过原失败用例 |
| 真实目标 `pnpm build:beta` | 通过 | 编译使用独立生产 ID 与正式来源，未部署 |
| 构建目标与记录 | 生产 ID 存在，开发 ID 未混入，`release.json` 一致 | 源码尚有未提交修复，记录为 `sourceDirty=true` |
| CI 工作流 | YAML 解析、命令顺序、浏览器渠道与配置传递检查通过 | 当前工作区变更尚未触发远端 Actions；Beta job 需配置仓库变量 |
| 生产 CloudBase 只读核对 | 项目表、四条 RLS、邮箱 / 密码认证已核对 | 不替代两个真实账号在最终部署网站上的验证 |

本轮未延长测试超时或增加自动重试。中间一次全量运行发现假云端延迟只设于一个标签页的夹具竞态、运行中编辑夹具触发热更新，以及向旧设计截图文件写入失败；修正共享闸门、测试服务器设置和独立截图路径后重新完整执行，最终 70 条全部通过。F05–F15 的后续问题仍按原优先级保留。

## 第三批修复记录 · 2026-10-07

### F05 / F06：缓存优先、按需读取与单项目故障隔离

- `CloudBackedProjectStore` 从账号独立数据库恢复持久同步记录，包含已经确认的缓存与未上传的编辑。已建立归属的缓存无需等待云端 list；新账号没有缓存时，云端不可用仍返回明确错误。旧本地项目不因本次降级自动注册或上传，旧账号同步标记仍在成功迁入后才移除。
- 云端 list 只获取摘要，读取某个项目时才下载其 Sequence、Layout、版本和照片清单。缓存先返回，后台核对使用原有项目锁、持久同步版本与条件安装，继续阻止旧响应覆盖新提交。网络恢复事件、定时重试及待同步队列负责继续核对和上传。
- 增加“正在使用本地缓存 · 云端尚未核对”状态；待同步故障明确显示本地已保存与云端重试。其他标签页的持久确认广播也会更新当前页面的云端保存状态。
- IndexedDB / Memory 的项目列表为坏记录保留 ID、可读取的名称和损坏标记；`loadWorkspace` 仍返回 `corrupt-data`。云端坏快照单独返回错误，不安装为空项目，也不影响其他项目的摘要或加载。首页显示项目名称、ID、重试入口及数据异常标记，错误项目不显示“没有照片”的正常空项目页面。
- 损坏的本地行保持原样，读取不会顺便用云端版本替换。原始数据下载保留项目及所属文档；能读取到的无效云端快照也可下载。下载使用 `photoflex-project-recovery` 格式与独立文件名，供手工修复，不将损坏数据冒充可直接导入的正常备份。云端接口已拒绝返回的快照无法在前端提取原始内容。
- 首页原有待删除恢复逻辑会逐个加载全部项目，抵消按需下载；已将 `deletionPendingAt` 加入摘要，只读取明确标记待删除的项目。既有删除恢复回归继续通过。

### F07：字体失败可见、同页重试

失败字体 Promise 从缓存移除，成功字体与中文 fallback 保持复用；并发加载继续共享同一请求。原生 CSS FontFace 会保留失败结果，因此重试时通过原有字体资源创建新的 FontFace 并加入字体集合，沿用正确的原生字重 / 样式以保留合成粗体和斜体行为。

`LayoutTextView` 增加加载 / 失败状态和重试按钮，处理成功与失败两个 Promise 分支，取消挂载后不更新视图。正式文本测量仍在字体成功后执行；重试不更改文字文档，无需整页刷新。中英文提示及独立状态样式已补齐。

### F08：可丢弃图片缓存与预览结果分离

缩略图与 768px 派生预览共用 best effort 写入：失败不丢弃已生成 Blob / lease。遇到 quota，先清理派生图片缓存并重试，再清理缩略图并重试；仍失败则使用内存预览。缩略图复用已有内存 URL，避免持久缓存不可写时重复读取原片。回收只操作两个图片缓存存储，不删除项目结构、照片索引、句柄或原文件；项目保存仍沿用独立的错误返回。

### F09：严格字体枚举

`isLayoutFontFamily` 使用 `Object.hasOwn`。`constructor`、`__proto__`、`toString`、`hasOwnProperty`、`valueOf` 均不能通过文档校验；全部已登记字体，包括仅供历史文档兼容的 `zcool-kuaile`，保持有效。备份导入和云端快照安装复用该校验，在写入前返回 `invalid-backup`。

### 第三批验证范围

新增真实 IndexedDB 连接回归覆盖：离线重开 / 再编辑 / 再重开、恢复后上传、未完成的云端 list 不阻断缓存、旧本地项目隐藏、不同账号没有缓存、摘要零 pull、无效云端快照隔离与原始数据下载、损坏本地行保留、单项目暂时不可用后重试。字体资产 / 文字框、缓存 quota、首页错误、待删除摘要及备份字体校验也有针对性回归。

本轮不改变数据库结构版本或正常备份格式。云端浏览器回归使用隔离假服务端，实际执行生产同步器、原生 IndexedDB、Web Locks、BroadcastChannel 和下载；未连接或修改真实 CloudBase 数据。离线恢复指云服务不可用时的账号结构缓存，不新增完整离线安装 / Service Worker 能力；原片显示仍取决于已有本地文件授权。

| 检查 | 最终结果 | 范围 |
| --- | --- | --- |
| 默认 `pnpm check` | 86 个文件、456 条单元 / 集成测试通过；类型检查、生产构建通过 | 现有大 chunk 提示仍属 F10 范围 |
| 故障及云同步浏览器回归 | Chrome / Edge 共 12 条通过 | `beta-resilience.spec.ts`、`cloud-sync.spec.ts`；包含真实字体请求中断后同页重试、两档缓存 quota、云服务不可用后刷新 / 编辑 / 恢复上传、坏项目原始数据实际下载及既有跨标签页 / 冲突恢复 |
| Layout / 首页 / 备份浏览器回归 | Chrome / Edge 共 36 条通过 | `sequence-ui.spec.ts`、`workflow-backup.spec.ts`、`ui-surfaces.spec.ts`、`layout-appearance.spec.ts`；覆盖文字刷新、阅读排版、PDF、封面 / 纸张 / 页码、导航及双标签页草稿恢复 |
| 差异格式检查 | 通过 | 本轮修改范围；未延长测试超时、跳过失败测试或放宽断言 |

本批共执行 48 条相关浏览器回归，未把它们记为完整 E2E 全量门禁。新增 F05–F09 修复尚未在正式部署产物中执行两个真实账号 / 双设备验收；原有 F10–F15 与正式发布验收保持后续范围。

## 第四批修复记录 · 2026-10-07

本批实现 F10、F12 的代码修复与 F11 建议中的 Beta 第一阶段。上一批 F01–F09 已以 `078e58c790bf3349a788a050058ed982a093b9f2` 提交并推送至 `origin/develop`；以下构建比较以该提交为基线。原始测量记录见 [BETA_PERFORMANCE_2026-10-07.json](BETA_PERFORMANCE_2026-10-07.json)。

### F10：首次使用时加载 PDF / 阅读，压缩屏幕字体与 SDK

- `LayoutWorkspace` 在 PDF 预检 / 导出时动态导入导出模块，阅读器在首次 Read 时加载。原生浏览器检查打开 Layout 时没有 PDF、fontkit、阅读器 chunk 或 TTF 请求；点击导出才请求 PDF 模块与嵌入字体，点击 Read 才请求阅读器。
- CloudBase 改用 app 内核及 auth、mysql 模块注册，保留登录与关系数据库能力，减少未使用模块的首屏代码。遵循 [CloudBase 模块化初始化说明](https://docs.cloudbase.net/api-reference/webv3-pg/initialization)，函数名称以当前安装的 3.9.4 导出为准。该版本 app 入口的声明有类型缺陷，因此使用一个只提供 `auth` / `rdb` 的 JS 桥接与精确声明；没有升级 SDK、放宽 TypeScript 检查或关闭依赖声明检查。
- 35 个实际使用的屏幕字体改为 WOFF2，PDF 保留原有 TTF 并按导出需求获取。`scripts/build-layout-screen-fonts.py` 可从已登记的 TTF 重建 WOFF2 与字形覆盖元数据，生成时核对字形覆盖及水平度量一致，不裁剪字形。Noto Serif SC Regular 从 14,807,636 bytes 减至 5,720,660 bytes。
- 屏幕与 PDF 共用原生字重 / 样式选择规则，根据实际文字与该 face 的字形覆盖决定是否请求中文 fallback。纯英文 Courier Prime 不再额外下载 Noto Serif SC；中文字体自身能够显示的文字也不重复请求 fallback。字体失败可见、同页重试及成功后正式测量的 F07 行为保持。

同一 gzip 方法比较构建产物（kB 为 1,000 bytes，不含共享依赖的重复求和）：

| JavaScript chunk | 前一批 gzip kB | 本批 gzip kB | 变化 |
| --- | ---: | ---: | --- |
| 主入口 | 399.77 | 341.45 | 减少约 14.6% |
| LayoutWorkspace | 563.29 | 18.71 | 页面自身减少约 96.7%，PDF / 阅读移至按需模块 |
| PDF 导出 | 随 Layout 加载 | 517.97 | 首次导出才加载 |
| Layout 阅读器 | 随 Layout 加载 | 27.28 | 首次阅读才加载 |

上述是下载时机与依赖范围的改善。PDF 模块仍较大，构建仍报告大 chunk；不能将 Layout chunk 的降幅解释为完整应用总体资源同幅减少。

### F11：按来源捕获快照、合并可替换草稿、保留上传指标

- `IndexedDbProjectStore` 在原有单个只读快照事务中读取项目、同步版本及所属文档，随后按项目来源使用 `photo-index` 的 `by-source-id` 索引查询，避免读取整个账号的照片。结果保留原先主键排序，保持备份 / 云端快照兼容性；快照与持久同步版本仍来自同一事务。
- `ProjectWriteCoordinator` 合并尚未执行、连续排队、属于同一文档的完整草稿。正在执行的保存、函数式增量、不同文档、结构操作及 flush 屏障保持原顺序。合并后的所有调用等待实际提交，失败仍保留最新草稿并沿用恢复 / 重试流程；不以外部版本为本页旧草稿取得新的覆盖权限。
- `CloudBackedProjectStore.getLastUploadMetric(projectId)` 保留最近一次上传的 UTF-8 快照字节数、捕获 / 上传耗时、本地版本与结果类型。不可用错误可携带受限制的服务端请求码及 HTTP 状态，既有“云端已提交但响应丢失”的核对行为保持。指标仅在当前实例内保存，不记录文本、邮件、文件名或快照内容；字节数是 JSON 文档大小，不包含整个 HTTP 请求封套。
- 真实 IndexedDB 单元回归禁止账号级 `photo-index.getAll()`，覆盖多来源、无关照片与同步记录的同事务捕获。原生 Chrome / Edge 基准在账号增加 25,000 张无关照片后仍只捕获本项目 30 张照片；100 个同批可替换草稿最终保存文字 `99`，产生 1 次上传，flush 完成。

**F11 尚未完全关闭。** 云端仍存储完整项目 JSON，并使用项目级 CAS。Worktable / Sequence / Layout / Version 的独立云存储与同步属于报告建议的第二阶段，需要同时处理创建、删除、版本和恢复一致性；本批没有更改云表或 RLS。当前 [CloudBase PostgreSQL Data API](https://docs.cloudbase.net/http-api/pgdb/postgresql-restful-api) 使用 PostgREST，不能直接套用其他存储服务的上传大小限制。生产环境实际请求大小上限、配额与真实上传耗时尚未实测；新增指标为这项验收提供数据入口。

### F12：限制编辑历史，按字节回收图片，离开 Layout 时取消导出

- Table、Sequence 与 Layout 各保留最多 100 步撤销，继续使用内部不可变文档引用与结构共享；对外快照保留隔离。超过预算时移除最旧状态，撤销 / 重做与撤销后分支编辑仍有效。
- 图片 URL 的闲置缓存同时受原有 72 项及 16 MiB 限制，派生 Blob 缓存同时受 64 项及 24 MiB 限制。原片 URL 在最后一个 lease 释放时立即回收；多个调用共享的活跃 URL 不会被预算清理提前撤销。因此这些是缓存预算，不是整个浏览器或活跃图片的内存上限。
- `BrowserPhotoSource.close()` 先标记关闭，释放 URL、缓存、句柄与状态；迟到的读取 / 派生预览完成后不能重新创建 URL。Layout 卸载或切换文档时 abort 导出控制器，动态模块加载后再次检查取消信号，避免离开后触发下载。
- 三个编辑器均有历史上限 / 分支回归；图片回归覆盖活跃 lease、原片立即释放、字节预算与关闭后迟到结果；Layout 组件回归覆盖导出卸载取消。

### 本机性能基线与验收范围

新增 `beta-performance.spec.ts` 在两个原生浏览器执行 3 类基准。测试自行构建压缩后的本地模式页面及启用真实 CloudBase SDK 的登录页面，使用明确的隔离 envId，不依赖私有配置或旧 `dist`。登录测试只检查登录界面，不进行真实账号认证。Table / Layout 使用原生 IndexedDB 的隔离项目，不连接云端；同步基准使用生产同步器与假 CAS 云服务。

网络由 CDP 限制为 5 Mbps、40 ms 延迟并关闭 HTTP 缓存。登录页独立打开，随后本地项目按 Home → Table → Layout → PDF 顺序首次进入；同一页面中已经执行的模块仍存在内存中，因此 Table / Layout 数字不是每条路由独立全冷启动，也不是正式部署网站的性能承诺。逐次记录见 JSON。

| 基准 | Chrome | Edge |
| --- | ---: | ---: |
| 登录界面首次可见，单次本机采样 | 976 ms | 973 ms |
| 首次进入 Table，单次本机采样 | 103 ms | 84 ms |
| 首次进入 Layout 并显示排版文字，单次本机采样 | 930 ms | 913 ms |
| 首次 PDF 导出至下载事件，单次本机采样 | 1,249 ms | 1,205 ms |
| 30 张账号照片的项目快照，中位数 / 7 次 | 0.5 ms | 0.5 ms |
| 25,030 张账号照片的同一项目快照，中位数 / 7 次 | 0.5 ms | 0.5 ms |
| 两组备份大小 / 项目照片数 | 3,988 bytes / 30 | 3,988 bytes / 30 |
| 100 个同批草稿，云端上传次数 | 1 | 1 |

大图片基准使用 2560 × 1600、4,145,728 bytes 的有效 JPEG，内容是合成噪声；执行真实 `<img>.decode()`、30 次原片浏览、500 次编辑及 100 步撤销 / 重做，最后关闭照片来源。两个浏览器释放后的原片 URL 和关闭后的缓存 URL 均为 0。Chrome / Edge 采样 JS heap 峰值分别约 30.75 / 30.56 MB，显式 GC 后均约 6.36 MB；这些数值不包含浏览器进程、解码器或 GPU 的峰值，也不代表真实摄影图库 / 双设备长会话验收。来源关闭和晚到请求回归验证账号资源释放边界，尚未记录真实账号切换的端到端长会话峰值。

| 检查 | 最终结果 | 范围 |
| --- | --- | --- |
| 默认 `pnpm check` | 88 个文件、467 条单元 / 集成通过；类型检查、生产构建通过 | 未延长超时或跳过失败用例 |
| 最终 `pnpm typecheck` | 通过 | 包含最新浏览器性能夹具 |
| 相关 Chrome / Edge 浏览器回归 | 54 条不同用例分批通过 | 原有 48 条故障 / 云同步 / Layout / 首页 / 备份，加新增 6 条性能用例；不是完整 E2E 全量门禁 |
| 差异格式检查 | 通过 | 本批源码、测试及记录 |

正式站慢网冷缓存、真实图库的大项目 / 长会话、CloudBase 上传限额及真实账号 / 双设备仍需在最终部署产物上验收。本批未部署站点或写入真实云端数据；F13–F15 保持后续范围。
