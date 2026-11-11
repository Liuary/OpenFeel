# v1.5.17-stage-2 计划：v1.5.17 发布收口

> 用户已确认「发布」。本阶段只做版本发布收口，不新增功能（功能见 stage-1 / REQ-031）。

## 目标

把 v1.5.17 以 1.5.17 版本发出去：版本号与文档一致 → 构建/测试绿 → 版本归档 → push master 触发 CI `npm publish`。

## 步骤

1. **版本号**：`package.json`、`package-lock.json`（根 `version` 与 `packages[""] .version` 两处）1.5.16 → 1.5.17；`dsh/package.json`（`version` + `openfeel.requiresCli`）→ 1.5.17 / `>=1.5.17`；`dsh/ADAPTER.md` requiresCli。
2. **文档**：`README.md` 最新版本行 → v1.5.17（一句话概括 feel_mode + ID 修复）；`docs/VERSIONS.md` 顶部列表 + 版本小节；`openfeel-cli-usage` skill 快照（`SKILL.md` 与 `src/core/template-loader.ts` / `src/core/update.ts` 内嵌副本三处同步；`test/core/templates.test.ts` 快照标记同步）。
3. **构建/验证**：`npm run build`（重生成 AUTO-GENERATED + 单源一致性）、`node bin/openfeel.js --version` == `package.json.version`、`lint i18n`、`vitest` 全量、`dsh/test/verify.js`、`dsh/test/guard.js`。
4. **归档**：`feel_req release-check`（已过：无未完成需求）→ `feel_archive create v1.5.17` → `git push origin master`（CI 仅在版本变化时 publish）。

## 验收

- [ ] 仓库内**当前行为**描述无残留 1.5.16（历史 CHANGELOG 段保留）
- [ ] `node bin/openfeel.js --version` 输出 `1.5.17`
- [ ] 构建 / i18n / 全量测试 / 适配器用例全绿
- [ ] `flow-archive/v1.5.17.json` 生成，`flow.json` 中该版本阶段移除
- [ ] `git push` 成功（CI 发布由 push 触发）

## 风险

- 版本号漏改任一处会被 CI「Version consistency guard」拦下（`--version` vs package.json）→ 发布前本地先跑同一检查。
- skill 快照三处不同步会让 `npm run build` 的单源一致性校验失败。
- push 需要网络与凭据；失败则保留提交并告知用户手动 push。
