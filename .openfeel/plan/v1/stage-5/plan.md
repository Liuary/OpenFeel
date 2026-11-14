# v1.5.19-stage-5 计划：v1.5.19 发布收口（术语定名 + 市场索引）

> 用户确认：推送 + 发布 1.5.19 + 开启 Pages + 加 topics。Pages 已开启，索引 URL 已 200。

## 步骤

1. 版本号 1.5.18 → 1.5.19：`package.json` / `package-lock.json`（两处）/ `dsh/package.json`（version + requiresCli）/ `dsh/ADAPTER.md` / README 最新版本行。
2. 文档：`CHANGELOG.md` [1.5.19]（术语定名 + README 重订 + DSH 市场索引）；`docs/VERSIONS.md` v1.5.19 小节；skill 快照三副本（`SKILL.md` / `template-loader.ts` / `update.ts`）加 `## v1.5.19（stage-4）` 与快照标记，`test/core/templates.test.ts` 同步。
3. 构建/测试：`npm run build`、`tsc`、`vitest`、`lint i18n`、`dsh verify`、`guard`。
4. 提交版本收口 → **重生成市场索引**（必须指向含 1.5.19 的 commit）→ `market:index:check` → 提交 index。
5. 归档：`feel_archive create v1.5.19`；阶段 done。
6. push master → CI publish；验证 npm `1.5.19` 与 Pages 索引（条目版本 1.5.19）。
7. topics：无 GitHub 写权限时给出精确操作（仓库 Settings/About），或等用户提供 token。

## 验收

- [ ] `node bin/openfeel.js --version` = 1.5.19，package/lock/dsh 全链一致
- [ ] `docs/market/index.json` 条目 = 1.5.19，commit 内含该版本，校验通过
- [ ] 全量测试 / 构建 / 适配器用例绿
- [ ] `git push` 后 CI 发布 npm 1.5.19
- [ ] Pages index URL 返回 200 且版本为 1.5.19

## 风险

- 索引必须从「已包含 1.5.19 的 commit」生成：先提交版本收口，再 `npm run market:index`。
- skill 三副本不同步会导致 build 单源一致性失败。
- topics 需仓库管理权限（无 token 时只能人工点）。
