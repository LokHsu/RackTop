# Contributing to RackTop

## Branches and Reviews

- Create a feature branch from the latest `develop` and open a PR targeting `develop`.
- A collaborator must approve the PR, and the contribution policy plus macOS, Windows and Linux checks must pass before merging.
- Repository administrators may develop directly on the latest `develop` and push normally without a feature PR. Each push runs all three platform builds; administrators must fix failing checks before promoting a version. This exception does not permit force pushes, branch deletion, publishing a release, or bypassing reviews on `main`.
- When a version is ready, maintainers open a reviewed `develop` to `main` PR. Only the same repository's `develop` can target `main`.
- After promotion, open a reviewed `main` to `develop` synchronization PR. Do not force-reset either branch.
- Keep `main`, `develop` and `updater`. The `updater` branch contains the update manifest and is separate from development.

## Versions and Releases

Do not change the application's version fields in npm, Cargo or Tauri files, or edit `docs/VERSION_INFOS.md` and `docs/Version_overview.md` in ordinary feature PRs. Dependency updates may change dependency versions in lockfiles.

Describe changes, motivation, validation and limitations in the PR. Maintainers assign the version and collect release notes during version preparation. A maintainer can add the `release-preparation` label to authorize version and release-note changes; this does not authorize publishing a release.

Merging a PR does not publish a release. Stable releases are explicitly approved by maintainers and built from verified `main` commits.

## 中文说明

从最新 `develop` 创建功能分支，提交 PR 到 `develop`；合作者审核和三平台 CI 通过后合并。整个版本完成后，通过 `develop` 到 `main` 的 PR 再次审核。合入后通过同步 PR 将 `main` 合回 `develop`，保持内容一致。

管理员可直接基于最新 `develop` 开发并正常推送，无需功能分支或功能 PR；每次推送自动运行三平台 CI。管理员须修复失败检查，再发起版本交付。此例外不允许强推、删除分支、发布版本或绕过 `main` 审核。

普通贡献不自行修改产品版本或正式版本记录，在 PR 中描述变化和测试结果。版本及发布由维护者统一管理，合并 PR 不代表自动发布。版本准备 PR 由维护者添加 `release-preparation` 标签。
