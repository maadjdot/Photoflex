# Tauri 本机环境安装记录

本次已完成 Windows Spike 所需的本机环境安装：

- Rust stable MSVC：`rustc 1.98.0`；
- Cargo：`cargo 1.98.0`，随 Rust 安装；
- Rust target：`x86_64-pc-windows-msvc`；
- Visual Studio 2022 Build Tools：`17.14.39`；
- MSVC C++ 工具链与推荐 Windows SDK；
- WebView2 Runtime：环境锁中记录为 `151.0.4129.101`；
- ExifTool：`13.59`，安装在 `tools/exiftool/exiftool.exe`；
- Node/Corepack：项目原有 Node `24.18.0` 与 pnpm `10.15.1`。

验证结果：`cargo check` 通过，Tauri Windows release build 通过，并生成 MSI 与 NSIS 安装包。正式 T-01～T-06、DB-01、WB-01、soak 和 macOS 真机测试仍未执行。

Rustup 使用用户级安装。新开的终端会自动读取 PATH；当前已经打开的 IDE 终端可能仍看不到 `rustc` 和 `cargo`，可临时执行：

```powershell
$env:Path = 'C:\Users\Jeff Wu\.cargo\bin;' + $env:Path
rustc --version
cargo --version
```

不要使用 `cargo install tauri-cli` 覆盖项目内锁定的 Tauri CLI；Spike 使用 `@tauri-apps/cli 2.11.4` 和 Rust core `2.11.5`。验证命令：

```powershell
$env:Path = 'C:\Users\Jeff Wu\.cargo\bin;' + $env:Path
corepack pnpm --filter @photoflex/tauri-shell exec tauri info
corepack pnpm env:capture
corepack pnpm env:verify
```

ExifTool 使用 Spike 内置路径，避免修改系统 PATH；环境采集器会自动记录其版本和 SHA-256。`tools/exiftool/` 是下载的官方 Windows 64 位发行包，不应手工替换其中的运行时 DLL。
