# PhotoFlex main 自动发布到腾讯云

更新日期：2026-10-08。

## 当前状态

- 首次上线提交 `a88a06e` 已推送到 `origin/main`，正式网站为 https://photoflex.site/。
- 自动发布流程、服务器接收脚本和发布检查已准备。
- 服务器已安装 `/usr/local/bin/photoflex-receive-release.py`，属于 root，权限 0755。
- 已在服务器的临时目录运行 6 项发布检查，全部通过，包括失败恢复、校验失败不切换、拒绝目录穿越和链接文件、拒绝普通 shell/SFTP 请求。
- GitHub 已建立 `tencent-production` 环境（ID `23695870575`），仅允许 main 分支，0 个 tag。现有 Vercel Production / Preview 环境保留。
- 用户已确认受限发布权限。专用 SSH 公钥已追加至服务器，私钥已保存于 `tencent-production` 的 `PHOTO_FLEX_SSH_KEY`，未进入仓库。
- 实际 SSH 连接已通过认证，普通会话被固定接收脚本拒绝。首次自动发布随本次流程推送触发；结果可由 Actions 及网站的 `release.json` 核对。
- 专用发布公钥指纹：`SHA256:qzlspMB+amXv8Ftfe0HXrVt5cW4o7cE74R3G6IKfciU`。

## 发布过程

1. 修改 PhotoFlex 应用或其 CI 配置并推送到 main，触发 `.github/workflows/photoflex-mvp-ci.yml`。
2. GitHub 使用 Ubuntu 24.04 / Node 24 / pnpm 10.15.1，从锁文件安装依赖，生成照片测试样本。
3. 运行部署检查、应用单元测试、类型检查和生产构建，以及 Chrome / Edge 完整浏览器回归。任一步失败都不发布。
4. 确认构建包含生产 CloudBase ID，且不包含开发 ID；打包 dist，并记录提交、工作流运行号和构建时间到 `release.json`。
5. 仅 main 使用 `tencent-production` 环境中的 `PHOTO_FLEX_SSH_KEY`。PR、其他分支及 Beta 构建不会部署生产网站。
6. 保留完整构建产物，上传前用正式域名 HTTPS HEAD 核对字体：仅当内容哈希文件名相同、大小相同且服务器声明 immutable 时，复用已有共享字体；新字体及无法确认的字体仍随包上传。随后经严格 SSH 主机公钥验证，将包传给固定服务器 `42.192.45.207`。如果 main 已有较新提交，跳过较旧构建。
7. 服务器核对包 SHA256、静态文件范围和发布信息，解包到 `/srv/photoflex/releases/github-运行号-提交前缀`；共享资源保留旧文件。
8. 原子切换 `/srv/photoflex/current`，经本机 HTTPS 核对 `release.json`。失败则自动恢复上一版入口。
9. GitHub 再从公网核对正式域名的提交与运行号。发布结果可在仓库 Actions 页面查看。

## 专用密钥的范围

- 新密钥仅用于此仓库的腾讯云自动发布，私钥只保存于 GitHub 的环境 Secret，不提交到代码库。
- 服务器只追加该密钥对应的一条公钥记录，保留现有登录方式。
- 公钥限制项为 `restrict,command="/usr/local/bin/photoflex-receive-release.py"`。
- 该密钥可以替换网站静态文件；禁止任意命令、交互式终端、SFTP 与端口转发。
- 接收脚本不执行上传的代码，不接触数据库、Hermes、系统服务配置或 sudo。
- GitHub 的 `tencent-production` 环境限定为 main，避免其他分支使用发布密钥。
- 服务器 SSH 主机公钥来自腾讯云已认证的控制台，不在发布时临时信任网络扫描结果。

## 配置与维护

生产构建固定为：

```
VITE_CLOUDBASE_ENV_ID=photoflex-prod-d8g6nph8u08611400
VITE_ICP_FILING_NUMBER=京ICP备2026063985号-1
```

这些是公开的客户端配置，不是数据库管理员凭证。现有 CI 的 Beta 构建入口继续保留，选择 `build_beta=true` 时不发布生产环境。

网站文件更新不需要重载 Caddy。接收脚本或 Caddy 配置的维护仍通过腾讯云控制台执行，不由受限发布密钥修改。

需要手动重发时，在 Actions 打开此工作流，选择 main 并保持 `build_beta=false`；重跑会使用新的 attempt 目录。

需要回滚时，从腾讯云控制台确认目标发布目录存在，将 `/srv/photoflex/current` 原子切换到已验证的旧目录，再访问正式网站验证。历史版本和共享资源暂不自动删除。

撤销自动发布权限时，可从 GitHub 删除 `PHOTO_FLEX_SSH_KEY`，并从服务器 `/home/ubuntu/.ssh/authorized_keys` 删除带 `photoflex-github-actions` 标记的专用记录。

本次不迁移旧用户本地数据，不变更 CloudBase 数据表，不恢复 Vercel 自动部署。

参考：

- GitHub 部署流程：https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments
- GitHub Secret：https://docs.github.com/en/actions/concepts/security/secrets
- SSH 固定命令与 restrict：https://man.openbsd.org/sshd.8

## 本次 GitHub CI 检查

推送 a88a06e 后，GitHub CI #59（https://github.com/maadjdot/Photoflex/actions/runs/37642791477）通过了单元检查与构建，浏览器回归 83 项通过、1 项失败。失败位于 Chrome 的 Contact Sheet 检查：1024px 下将侧栏从 expanded 切换到 compact，断言读取到了宽度恢复前的上一帧（主区域 463px，而最终应为 743px）。

TableWorkspace 在 mode 改变后的 effect 中恢复该模式的宽度。对应检查已改为等待最终布局，并同时核对主区 743px、侧栏 280px 和侧栏位置 744px；未修改产品布局或放宽预期尺寸。
修正后本地 Chrome / Edge 对应回归各通过 1 项（共 2 项）。检查修正提交 `ba794ed` 已推送到 main，其 GitHub 完整 CI 已通过：https://github.com/maadjdot/Photoflex/actions/runs/37650466978 。

首次自动发布检查（https://github.com/maadjdot/Photoflex/actions/runs/37652331258）在 Layout 历史记录单元检查中触发默认 5 秒超时，生产发布步骤被跳过。该检查连续执行 120 次页面编辑及 100 次撤销，现仅为此单项设置 15 秒上限，保留全部次数、断言及历史容量要求；本地对应文件 2 项检查均通过。

首次完整检查已全部通过，但 GitHub 到上海服务器的 SSH 传输在 4 分钟内仅增加约 8 MiB，96 MB 完整包无法在 15 分钟内完成，故停止该上传。服务器网站入口仍为原版本。现仅复用已核对的共享字体，避免每次重复传输；发布权限、服务器接收协议和健康检查不变。

复用检查 4 项全部通过：已有字体复用、缺失/长度不同/无 immutable 的字体正常上传、重定向保留、较小字体也可复用。使用现有完整 dist 副本对正式域名实测：72 个字体共 145,334,320 字节已复用，上传包为 1,829,828 字节（约 1.8 MB）；原 dist 和正式站点未被修改。
