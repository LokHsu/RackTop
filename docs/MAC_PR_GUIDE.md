# 在 Mac 上传 Linux 支持并创建 PR

## 交付内容与边界

产品版本固定为 **1.25.6**。基线提交：`7b0f2b57663b48b7dce59ae5c96243014e6349a2`。
交付目录包含完整源码包、可应用的 Git 补丁、本指南、PR 正文和 SHA-256 校验文件。
源码包没有 `.git`、依赖目录、编译结果、机器日志、密码或额外开发工具配置。
原仓库已有 `AGENTS.md` 保留，本次只修改其中三平台发布规则。

推荐在 Mac 新建 Git 工作目录并应用补丁，而不是把整个源码覆盖到现有开发目录。
这样能保留上游 Git 历史，并让 PR 只显示本次改动。完整源码包用于查阅、备份或独立构建。

## 1. 将交付目录传到 Mac

使用 U 盘、局域网传输等方式，将整个 `RackTop-1.25.6-linux-review` 目录放到 Mac 的 `~/Downloads/`。
下面所有命令都在 Mac 的“终端”执行。路径不同请相应调整。

```bash
cd ~/Downloads/RackTop-1.25.6-linux-review
shasum -a 256 -c SHA256SUMS
```

所有文件应显示 `OK`。如果失败，重新传输对应文件，不继续应用。

## 2. 准备 Git 与 GitHub 登录

```bash
git --version
```

若 macOS 要求安装命令行工具，按系统提示安装，或执行 `xcode-select --install`。
GitHub CLI 可通过 Homebrew 安装；没有 Homebrew 时可从 https://cli.github.com 下载官方安装包。

```bash
brew install gh
gh auth login --hostname github.com --git-protocol https --web
gh auth status
gh auth setup-git
```

按提示在浏览器登录自己的 GitHub 账号。不要在源码或命令文件里填写 token、密码。
CLI 不是提交源码的运行依赖，只用于上传和创建 PR。

## 3. 克隆上游并创建分支

以下步骤使用新目录 `~/Projects/RackTop-linux-review`，若已存在请换一个新目录名。

```bash
mkdir -p ~/Projects
git clone https://github.com/Tongzh-SEU/RackTop.git ~/Projects/RackTop-linux-review
cd ~/Projects/RackTop-linux-review
git switch -c feat/linux-ubuntu-support 7b0f2b57663b48b7dce59ae5c96243014e6349a2
git apply --check ~/Downloads/RackTop-1.25.6-linux-review/linux-support.patch
git apply ~/Downloads/RackTop-1.25.6-linux-review/linux-support.patch
git status --short
git diff --check
git diff --stat
```

`git apply --check` 应无报错，应用后可查看完整差异：`git diff`。
从已验证的基线创建分支，使本次改动可精确复现；如果上游后来有新提交，按第 8 节处理。
不要执行 `git init` 或覆盖新克隆目录中的 `.git`。

## 4. 在 Mac 验证

需要 Node.js 22 和稳定 Rust。已有工具可直接复用。

```bash
node --version
cargo --version
npm ci
npm run test
npm run build
cargo test --locked --manifest-path src-tauri/Cargo.toml
```

如果工具未安装，可执行 `brew install node@22 rustup`，并按 Homebrew 输出配置 PATH、执行 `rustup default stable`。
Mac 验证不能替代 Ubuntu 验证；本机 Linux 结果在 `docs/LINUX_REVIEW.md`。
圆角状态、透明窗口和相关 API 调用限定在 Linux；Windows 保留原有按钮行为。
Mac 上的 Linux 密钥环集成测试不会运行，属于预期平台隔离。

## 5. 配置作者、暂存并提交

把下面姓名与邮箱替换为自己的信息。可使用 GitHub Settings → Emails 提供的 noreply 邮箱。

```bash
git config user.name "你的姓名"
git config user.email "你的邮箱"
git add -- .github/workflows/build.yml AGENTS.md README.md README_EN.md package.json
git add -- docs/VERSION_INFOS.md docs/Version_overview.md docs/LINUX.md docs/LINUX_REVIEW.md docs/LINUX_SUBMISSION.md docs/MAC_PR_GUIDE.md
git add -- src/App.tsx src/main.tsx src/styles.css src/components/ServerForm.tsx src/components/DesktopWindowControls.test.tsx
git add -- src/utils/platform.ts src/utils/platform.test.ts src/utils/linuxWindowShape.ts src/utils/linuxWindowShape.test.ts
git add -- src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs src-tauri/src/main.rs src-tauri/tauri.linux.conf.json src-tauri/tests/linux_keyring.rs scripts/smoke-linux.sh
git diff --cached --check
git diff --cached --stat
git diff --cached
git commit -m "v1.25.6 feat: add Ubuntu Linux desktop support"
```

`package-lock.json` 和公共 `tauri.conf.json` 未修改，不需要暂存。
如果 Rust/Tauri 验证生成 schema 的权限或内容变化，不把这些生成变化加入本次提交。
提交清单不包含依赖、安装包、截图、校验交付目录或本地 `.git`。安装包应由 Actions 产出，供主管下载检查。

## 6. 推送：优先使用 Fork

Fork 不要求你拥有上游仓库写入权限，适合提交给主管审核。

```bash
gh repo fork Tongzh-SEU/RackTop --remote --remote-name fork
git remote -v
git push -u fork feat/linux-ubuntu-support
```

确认 `origin` 仍指向 `Tongzh-SEU/RackTop`，`fork` 指向自己的 GitHub 仓库。
若 CLI 提示 Fork 已存在，直接添加远程（将用户名替换为自己）：

```bash
git remote add fork https://github.com/你的GitHub用户名/RackTop.git
git push -u fork feat/linux-ubuntu-support
```

若 `fork` 远程也已存在，用 `git remote -v` 核对后直接推送，不重复添加。
有上游写入权限时，也可以 `git push -u origin feat/linux-ubuntu-support`，但不要直接推送 `main`。

## 7. 创建 PR

Fork 推送后执行（把用户名替换为自己的）：

```bash
gh pr create --repo Tongzh-SEU/RackTop --base main \
  --head 你的GitHub用户名:feat/linux-ubuntu-support \
  --title "v1.25.6 feat: add Ubuntu Linux desktop support" \
  --body-file ~/Downloads/RackTop-1.25.6-linux-review/PR_BODY.md
```

若直接推送到上游，用 `--head feat/linux-ubuntu-support`。
也可网页创建：打开自己的 Fork → Compare & pull request；base repository 选择 `Tongzh-SEU/RackTop`、base 选择 `main`，head 选择自己的 Fork、compare 选择 `feat/linux-ubuntu-support`。
正文复制交付包的 `PR_BODY.md`，检查 Files changed 后创建 PR。

创建后把 PR URL 发给主管，并在 Reviewers 选择主管账号（需要对应权限）。不要自行合并。
PR 内 Linux job 应运行，完成后在 Actions 对应运行的 Artifacts 中下载 DEB / AppImage。
Fork 首次 Actions 运行可能等待维护人批准；PR 构建不读取生产签名密钥。
macOS 和 Windows job 在标签或手动运行时构建；PR 不自动触发这两个发布 job。
维护人可在 Actions → Build RackTop → Run workflow 中选择审核分支及三个平台，执行签名构建；该操作需要仓库权限和已有签名 secrets。
工作流只上传 Artifact，不自动创建 Release。Artifact ZIP 是下载容器，内部文件才是安装包。

## 8. 上游更新、修改和常见错误

PR 提示冲突或主管要求跟进最新 main 时，先确认已提交自己的改动：

```bash
git fetch origin
git merge origin/main
```

有冲突时编辑冲突文件，保留主管确认的行为，`git add` 后完成合并提交；重新测试再推送同一分支。
如果上游版本已经变化，停止并请主管确认版本策略，不盲目将上游版本回退成 1.25.6。
主管要求修订时，在同一分支修改、测试、提交、`git push`，原 PR 自动更新，无需再创建 PR。

- `Permission denied` / 403：检查 `gh auth status`，确认推送的是自己的 Fork；不要直接推送上游 main。
- `git apply` 失败：确认从指定基线创建的新工作目录，且尚未应用过补丁；不要用强制覆盖掩盖冲突。
- Actions 失败：查看失败步骤日志，修复后再次提交；不能以本机测试成功代替 CI 通过。
- 标签已存在：不要删除或移动 `v1.25.6`，也不要强制推送标签。

## 9. 版本与正式发布注意事项

按要求保持 **1.25.6**，已有 macOS/Windows 的 `v1.25.6` 标签及 Release 不改变。
PR 只添加源码支持、文档和三平台构建流程；本交付没有提交、推送、创建 PR 或发布。
Linux 包合并审核后由主管决定是否附加到现有 Release。不要覆盖既有 macOS/Windows 已发布附件。
同版本不会触发现有 1.25.6 客户端升级；正式更新的签名、下载地址与 updater 清单应由维护人按 `AGENTS.md` 处理。
上线前仍需真实 SSH/GPU、托盘通知、完整桌面流程和跨平台实机验证。
