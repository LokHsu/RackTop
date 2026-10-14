# Linux 支持手动提交教程

当前源码保存在 `/home/cxli/RackTop`，分支为 `feat/linux-ubuntu-support`，变更未暂存、未提交、未推送。
审核报告见 `docs/LINUX_REVIEW.md`，验证/构建命令见 `docs/LINUX.md`。

## 1. 检查代码及版本

```bash
cd /home/cxli/RackTop
git status --short
git diff --check
git diff
npm run test
npm run build
cargo test --locked --manifest-path src-tauri/Cargo.toml
```

工具安装产生的技能与缓存位于项目之外；项目里不新增开发助手配置或署名。
`node_modules`、`dist`、`src-tauri/target` 为忽略的本地构建产物，不上传 Git。
`AGENTS.md` 最小补齐三平台构建与发布规则。

## 2. 配置作者并提交

下面的姓名、邮箱替换为自己的真实 GitHub 提交信息，仅配置当前仓库：

```bash
git config user.name "你的姓名"
git config user.email "你的邮箱"
git add .github/workflows/build.yml README.md README_EN.md package.json package-lock.json
git add AGENTS.md src/App.tsx src/styles.css src/components/DesktopWindowControls.test.tsx
git add src/main.tsx src/utils/linuxWindowShape.ts src/utils/linuxWindowShape.test.ts
git add docs/VERSION_INFOS.md docs/Version_overview.md docs/LINUX.md docs/LINUX_REVIEW.md docs/LINUX_SUBMISSION.md
git add src/utils/platform.ts src/utils/platform.test.ts src/components/ServerForm.tsx
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs src-tauri/src/main.rs
git add src-tauri/tauri.conf.json src-tauri/tauri.linux.conf.json src-tauri/tests/linux_keyring.rs scripts/smoke-linux.sh
git diff --cached --check
git diff --cached --stat
git commit -m "v1.25.6 feat: add Ubuntu Linux desktop support"
```

提交前核对没有凭据、机器日志、截图、构建产物或额外工具配置；不要使用 `git add .` 自动加入无关文件。

## 3. 上传审核分支

有上游写入权限时：

```bash
gh auth login
gh auth setup-git
git push -u origin feat/linux-ubuntu-support
```

没有上游写入权限时，先在 GitHub 网页 Fork `Tongzh-SEU/RackTop`，保留原始 `origin`，增加自己的远程：

```bash
git remote add fork https://github.com/你的GitHub用户名/RackTop.git
git push -u fork feat/linux-ubuntu-support
```

如果本地已存在 `fork`，先用 `git remote -v` 核对地址，不重复添加。

## 4. 创建 Pull Request

在 GitHub 选择“Compare & pull request”，目标仓库 `Tongzh-SEU/RackTop`、目标分支 `main`，源分支 `feat/linux-ubuntu-support`。

建议标题：`v1.25.6 feat: add Ubuntu Linux desktop support`。

建议正文：

```markdown
增加 Ubuntu Linux 桌面支持及 DEB/AppImage 构建，复用 Windows 自定义窗口、Secret Service 密钥环和单实例启动。
修复 Linux 平台识别及本机 WebKitGTK 黑屏，增加 Ubuntu 22.04 CI 验证。

Ubuntu 24.04 本机：前端 303 项通过，Rust 107 项通过，密钥环集成 1 项通过，两个安装包构建成功；安装包提取启动及重复启动通过，自定义窗口和 Yaru 风格圆角正常显示。
真实 SSH/GPU 流程、完整桌面操作、托盘通知、22.04 CI、其他平台和生产升级仍需复验。
详细结果及复验步骤见 docs/LINUX_REVIEW.md。

本 PR 为审核版本，不更新稳定 Release 或 updater 清单。
```

检查 Linux CI 结果并下载其安装包，由主管审核后合并。合并前若上游已有更新，应重新评估版本号并同步四处版本字段、两个版本说明及安装包验证记录。
本次按要求保留 1.25.6。该标签和稳定 Release 已存在，新增 Linux 包应由维护人审核后附加到现有 Release，不移动已有标签、不覆盖 macOS/Windows 已发布附件；相同版本不会触发已安装 1.25.6 的自动升级。
正式发布、签名和稳定更新由维护人另行执行；此阶段不要创建版本标签或替换稳定更新清单。
