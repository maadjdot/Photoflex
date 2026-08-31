# PhotoFlex Sequence MVP

当前目录是 PhotoFlex M1：可创建和打开 Project，选择多个本地 JPEG Source，扫描并分页浏览照片，
预览大图，并把照片加入持久化 Project Pool。Sequence、Compare、排版、导出和账号仍不在本轮范围内。

在 PowerShell 中执行：

```powershell
cd D:\project\Photoflex\MVP_Sequence\photoflex-MVP
corepack pnpm install
corepack pnpm fixture:generate
```

网站打开方式：

1. 在 PowerShell 中执行：

   ```powershell
   cd D:\project\Photoflex\MVP_Sequence\photoflex-MVP
   .\node_modules\.bin\vite.cmd --host 127.0.0.1
   ```

2. 在本机浏览器中打开 `http://127.0.0.1:5173/`。
3. 如果终端显示了其他 Local 地址，以终端输出的地址为准。
4. 停止网站服务可在运行命令的终端按 `Ctrl + C`。

如果要让同一局域网中的其他设备访问，在 PowerShell 中改用：

```powershell
cd D:\project\Photoflex\MVP_Sequence\photoflex-MVP
.\node_modules\.bin\vite.cmd --host 0.0.0.0
```

然后运行 `ipconfig`，找到当前 Wi-Fi 或以太网适配器的 IPv4 地址，
在其他设备的浏览器打开 `http://你的IPv4地址:5173/`，例如 `http://192.168.1.20:5173/`。

构建后也可以使用本地预览服务打开：

```powershell
corepack pnpm build
corepack pnpm preview
```

然后访问 `http://127.0.0.1:4173/`。

质量检查（当前只覆盖 M1 核心路径）：

```powershell
corepack pnpm test
corepack pnpm typecheck
corepack pnpm build
corepack pnpm test:e2e
```
