# Linux 1.25.6 审核报告

日期：2026-10-14（UTC+08:00）。代码基线：`7b0f2b57663b48b7dce59ae5c96243014e6349a2`。
本地分支：`feat/linux-ubuntu-support`。本版本未提交、未推送、未创建 PR、标签或 Release。

## 修改范围

- Linux 专用 Tauri 配置：复用 Windows 自定义窗口按钮及拖动区域，DEB / AppImage 打包与运行依赖。
- Linux Secret Service 密钥环后端，保留已有密码错误反馈和会话内凭据逻辑。
- Linux 单实例启动：第二次启动聚焦已有窗口。
- 正确识别 Linux WebView，避免套用 macOS 窗口按钮空间；SSH 配置提示显示 Linux 终端。
- 启动前设置 WebKitGTK DMA-BUF 兼容选项，修复本机黑屏，用户环境变量优先。
- Ubuntu 22.04 CI：前端/Rust 测试、包构建、启动检查、SHA-256 及构建产物上传。
- 按要求保持版本 1.25.6，Linux 补充记录合并到同一版本；三平台 Actions 和发布规范同步补齐。

## 本机验证

环境：Ubuntu 24.04.5 LTS x86_64，GNOME Wayland，Node 22.16.0，Rust 1.99.0，GTK 3.24.41，WebKitGTK 2.52.6。

| 检查 | 结果 |
| --- | --- |
| `npm run test` | 67 个测试文件，303 项通过，包含窗口控制、Linux 圆角状态及跨平台隔离测试 |
| `npm run build` | TypeScript 和 Vite 生产构建通过 |
| `cargo test --locked --manifest-path src-tauri/Cargo.toml` | 107 项通过，3 项原有忽略项；密钥环集成默认忽略 |
| 密钥环集成 `--test linux_keyring -- --ignored` | 1 项通过；实际 Secret Service 写入、重读、删除 |
| `npm run bundle:linux`（关闭 updater 签名产物） | DEB / AppImage 成功生成 |
| DEB 内容与依赖检查 | amd64、版本 1.25.6、桌面入口/图标/可执行文件及运行依赖正常 |
| DEB 提取后的程序 smoke test | 启动存活、SQLite 创建、连续两次重复启动退出均通过 |
| AppImage 提取后的 AppRun smoke test | 启动存活、SQLite 创建、连续两次重复启动退出均通过 |
| 原生 X11 自定义窗口 | Xvfb + Openbox 下实际显示正常，无系统标题栏；自定义按钮最小化、最大化、还原、关闭通过 |
| 原生弹窗点击 | 隔离桌面中点击添加服务器，SSH 配置引导弹窗正常打开及关闭 |
| Linux 浮动圆角 | GNOME Wayland 实际截图确认四角透明，使用本机 Yaru 统一装饰窗口的 12px 半径 |
| Linux 最大化圆角 | Xvfb + Openbox 实际点击最大化按钮，窗口填满 1600×1000，截图确认四角恢复直角；全屏状态切换另有自动测试 |
| 跨平台改动审计 | 剔除仅 Linux 的 CSS 后，Windows/macOS 样式声明与 Git 基线完全一致；公共及 Windows Tauri 窗口配置与基线一致 |

首次原生显示出现黑屏，明确设置 `WEBKIT_DISABLE_DMABUF_RENDERER=1` 后恢复；已加入入口默认值并重新构建，最终启动无需外部设置。
首次打包与运行同一路径程序并行导致 `Text file busy`，停止程序后完整重建成功。
最新全量前端测试首次运行出现既有 `AppStartupUpdate` 异步任务在环境销毁后回调的问题，完整复跑 299 项通过；记录该偶发现象，不声称已修复。

现有警告：Vite 主包大小提示、Linux 未使用 macOS `shell_quote` 的 Rust dead-code 提示，均不影响构建。
`npm ci` 报告原有依赖存在 5 项审计问题；本次未升级无关依赖，正式发布前应另行评估。

## 安装包

本机包基于 Ubuntu 24.04 构建，仅声明验证该平台；Ubuntu 22.04 安装包应由 CI 构建。
文件位于 `src-tauri/target/release/bundle/`，属于本地构建产物，不提交 Git。

| 文件 | SHA-256 |
| --- | --- |
| `deb/RackTop_1.25.6_amd64.deb` | `e592e4e2ab56a0dc17ce8e6c5ca8399a88149a8a3c03934c5b95f362525260e9` |
| `appimage/RackTop_1.25.6_amd64.AppImage` | `5c363faf06eab1a7ec9e6d2b06115f6397a4d3e9c54bdbf90ddf0c63485e2217` |

## 验证边界

未连接真实 GPU 服务器，未声称已完成 SSH 认证、PTY 交互、项目同步、任务启动或远程硬件端到端验证。
本轮实际操作使用隔离 X11 桌面；Wayland 完整点击流程仍需人工复验。拖动及双击最大化复用了 Windows 实现，隔离桌面中未确认生效，需要在真实桌面复验。
没有可用的专用桌面操作技能，因此没有执行该技能要求的自动桌面操作验证。
托盘点击、通知弹出、生产自动升级、DEB 系统安装/卸载、AppImage FUSE 启动、Ubuntu 22.04 CI、macOS/Windows 回归均未验证。

## 人工复验

构建和自动化命令见 `docs/LINUX.md`。在本机可直接启动：

```bash
cd /home/cxli/RackTop
./src-tauri/target/release/racktop
```

1. 验证应用右上角自定义按钮最小化、最大化、关闭，顶栏拖动和双击；再次启动程序应恢复已有窗口。
2. 打开添加服务器，选择自己的授权服务器，确认指纹；检查 SSH Agent、私钥和密码连接。
3. 密码勾选保存后重启应用，确认重新连接；无可用密钥环时检查错误提示。
4. 查看 CPU/GPU、进程、历史；打开终端并验证输入、复制粘贴和窗口调整。
5. 使用临时项目目录验证同步、启动短任务、日志查看和停止；检查托盘与通知。
6. 安装 DEB 或运行 AppImage，再重复上述核心流程；保留原数据后升级确认数据可读。

完成未验证项并更新本报告后，再决定是否发布为稳定版。
本次保持 1.25.6，该版本的 macOS/Windows 稳定 Release 和标签已经存在；本地 Linux 补充不得被误报为重新发布成功，相同版本不触发现有客户端升级。

## 平台隔离

圆角裁切和透明背景只匹配 `data-platform="linux"`；窗口透明开关仅在 `tauri.linux.conf.json`。
监听尺寸并查询最大化/全屏状态仅在 Linux 桌面启动，测试覆盖 Windows、macOS、网页均不访问窗口 API 或修改 DOM。
上一轮共享按钮的点击触发已限定为 Linux，Windows 恢复基线的 `mousedown`、`preventDefault` 和停止冒泡行为；macOS 不渲染这些按钮。
Rust 密钥环依赖、渲染兼容环境设置只在 Linux 编译，Windows 单实例原有条件仍保留。发布配置及文档按要求涵盖三平台，不是 Linux 专属改动。
该审计为源码和自动测试验证，不代表已执行 macOS/Windows 实机验证。
