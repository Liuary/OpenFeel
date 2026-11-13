# v1.5.18-stage-3 计划：产品默认 feel_mode 改为 disabled（开箱宽松）

> 用户确认：「希望默认宽松」。本阶段把产品**默认值**从 enabled 翻成 disabled，让全新安装/全新用户开箱即宽松；项目或全局显式 `feel_mode: enabled` 仍可钉死严格。当前仓库 `.openfeel/config.yaml` 已显式 enabled，行为不变。

## 现状与判据

- 1.5.17 已发布，默认链路：项目 `defaults.feel_mode` → 全局 `preferences.feel_mode` → builtin（现为 enabled）。
- 目标链路：builtin 改为 **disabled**；显式 enabled（项目或全局）仍优先且语义不变。
- 只改默认值，不改变任何一个层级/解析/门禁逻辑。

## 步骤

1. **默认翻转（CLI）**：`src/core/config.ts` 的 `DEFAULT_CONFIG.feel_mode` 'enabled' → 'disabled'；`ConfigDefaultsSchema` 的 `.default('enabled')` 同步；`FEEL_MODES` 与 `resolveFeelMode`/`readExplicitFeelMode` 注释同步；`CONFIG_TEMPLATE_ZH/EN` 注释改为 `# feel_mode: disabled` 并注明「显式 enabled 会永久覆盖全局宽松」。
2. **镜像（适配器）**：`dsh/lib/adapters/feel-mode.js` 回落值 'enabled' → 'disabled'（与 CLI 默认一致）；头注释同步。
3. **文案面**：`README.md`、`docs/commands.md`、`docs/json-contract.md`、`GETTING_STARTED*`、`dsh/README.md`、`dsh/ACTION-GUIDE.md`、`dsh/docs/compat/pipeline.md` 中「默认 enabled」表述；skill 快照三副本（`src/core/templates-data/skills/openfeel-cli-usage/SKILL.md`、`src/core/template-loader.ts`、`src/core/update.ts`）+ `test/core/templates.test.ts` 标记。
4. **测试**：`test/core/config.test.ts`（DEFAULT_CONFIG / resolveConfigDefaults / resolveFeelMode 默认用例）；`test/commands/config.test.ts`（内联快照与 effective 断言）；`test/core/preflight.test.ts`、`test/commands/preflight-gate.test.ts`（strict 用例改为项目显式 enabled 钉死，新增「默认 disabled 时 strict 降级 warn」用例）；`test/cli/json-contract.test.ts`（如有默认值断言）；`dsh/test/verify.js` 镜像默认矩阵（无声明 → disabled）。
5. **版本收口**：1.5.17 → 1.5.18：`package.json`、`package-lock.json`（根 + packages[""]）、`dsh/package.json`（version + requiresCli `>=1.5.18`）、`dsh/ADAPTER.md`、`README.md` 最新版本行、`docs/VERSIONS.md`（顶部条目 + 中文小节）、`CHANGELOG.md` [1.5.18]。
6. **验证**：`npx tsc --noEmit`、`npx vitest run`、`node bin/openfeel.js lint i18n`、`npm run build`、`node dsh/test/verify.js`、`node dsh/test/guard.js`。
7. **归档/发布**（用户确认后）：`feel_req release-check v1.5.18` → `feel_archive create v1.5.18` → push → npm。

## 验收

- [ ] 干净 HOME + 新项目：effective `disabled` / `builtin`
- [ ] 项目显式 `feel_mode: enabled`：effective `enabled` / `config.yaml`，strict 门禁与提示词行为不变
- [ ] 全局 `preferences.feel_mode: enabled` 可覆盖默认 disabled
- [ ] 全量测试 / i18n / 构建 / 适配器用例全绿
- [ ] 版本号 1.5.18 全链一致（CLI `--version`、package.json、lock、dsh、文档）

## 风险

- 原有 strict 用例未显式钉 enabled 会因默认翻转而失败 → 逐个确认期望值而不是放宽断言。
- 文档残留「默认 enabled」会造成行为误解 → grep 全仓文案面。
- 发布需用户确认；未确认前只到阶段 done，不归档、不 push。
