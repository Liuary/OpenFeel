# v1.6.1-stage-134

> 阶段 ID 使用 **v1.6.1**（版本号纠正后新建）；上一阶段 `v1.7.0-stage-133` 作为**历史标识原样保留**（`flow.json` 禁手改）。
> 计划正文：`.openfeel/plan/v1/stage-134/plan.md`（v3，含审查 REJECT 修订 F1—F6）；需求级计划：`.openfeel/plan/reqs/REQ-068.plan.md`。

## 目标

把版本号从 **1.7.0 纠正为 1.6.1**（补丁版；`package.json` + `dsh/package.json` lockstep、`requiresCli >=1.6.1`），并把发布流程改成「**push 到 master 且版本与 npm 不同 → CI `publish` job 自动 `npm publish`**」——**tag/release 不触发**、不再手工发布、不需要 tag；同一条规则登记到开发规则文件（`.openfeel/dev/dev_core.md`）+ `src/core/templates.ts` 模板 + `docs/VERSIONS.md` §发布节奏；并把**版本号分级规则**写进提示词（`dsh/lib/surface/prompt.js` + 4 份副本），用**渲染态**预算测试守住 1200 字符 / 25 行。

## 关联需求

| 需求 | 标题 | 优先级 | 判据 |
|------|------|--------|------|
| **REQ-068** | 版本号纠正 1.7.0→1.6.1 + 发布改走 CI 自动发布并登记规则 | P1 | A68.1—A68.8 |

## 节奏

`fast` 模式，**严格串行**六步（同批文件被多任务触碰，不并行）：

| 步 | 任务 | 内容 | 写者 |
|----|------|------|------|
| S1 | T1 | 版本号 1.7.0 → 1.6.1（范围文件 55 文件命中；**7 行** `v1.7.0-stage-133` 保留）+ 发布说明重命名 `v1.7.0.md` → `v1.6.1.md` | executor-a |
| S2 | T2 | `scripts/release.mjs` 语义改 CI 交接（`publishMode:'ci'`，默认 market/archive-commit/tag 仍 skipped），`--publish` 降级应急，新增 `--push` | executor-c |
| S3 | T3 | 规则登记（`dev_core.md` + `src/core/templates.ts` DEV_CORE 模板 + `VERSIONS` §发布节奏） | executor-a |
| S4 | T5 | 提示词版本分级规则（源 + 4 副本 + `npm run build` 重生成）+ `dev_core` 追写 + 新建渲染态预算测试 | executor-a |
| S5 | T6 | 文档同步分级规则 + CI 流程（`docs/commands.md`、`CHANGELOG`、`docs/releases/v1.6.1.md`） | executor-a |
| S6 | T4 | 全量门禁（含 dsh 四测）+ 逐判据取证 | reviewer |

> 顺序：`T1 → T2 → T3 → T5 → T6 → T4`（`CHANGELOG`/`docs`/`README` 同文件串行；`dev_core.md` 由 T3、T5 串行；T6 必须晚于 T5 定稿）。

## 验收

- **A68.1** 两包 `1.6.1` + `requiresCli >=1.6.1` + `openfeel --version` = 1.6.1。
- **A68.2** `CHANGELOG.md` 首行 `## [1.6.1]`；`docs/VERSIONS.md`/`docs/releases/v1.6.1.md`/`docs/commands.md` 无 `1.7.0`；`v1.6.1.md` 存在、`v1.7.0.md` 不存在；CHANGELOG 历史段未动。
- **A68.3** 范围文件内 `1\.7\.0` 的**非 stage-id** 命中为 0（`git grep -P "1\.7\.0(?!-stage-133)"` 空）；残余仅 7 行 `v1.7.0-stage-133`。
- **A68.4** `node scripts/release.mjs --json`：默认 `version/build=ok`、`publish/market/archive-commit/tag=skipped`、`publishMode='ci'`、零真实 publish；`--with-market`/`--commit-archive`/`--tag`/`--push` 各控一步（`--dry-run` 下 planned）；`--publish` 仅兜底；既有 **13 条** release 用例零改动绿。
- **A68.5** `dev_core.md` 带日期 `[+]` 规则 + `src/core/templates.ts` DEV_CORE 模板同一条 + `docs/VERSIONS.md` 同义（一致性）。
- **A68.6** `npm run build`、`tsc --noEmit`、`npm test`、dsh 四套、`lint i18n`/`lint fill`、`market:index:check` 全绿；`node scripts/release.mjs --dry-run --skip-build` exit 0。
- **A68.7** 提示词分级规则（中文 补丁/minor/major；英文 patch/minor/major）；**渲染态**四组（zh/en × enabled/disabled）均 ≤1200 字符 / ≤25 行（基线 720/837、1027/1143；EN 补句 ≤50、ZH 补句 ≤60）；parity **5/5**；新建 `test/cli/feel-prompt-budget.test.ts` 绿。
- **A68.8** `docs/commands.md`、`CHANGELOG.md`、`docs/releases/v1.6.1.md` 各命中分级规则 + CI 流程两句。

## 风险

- **替换打穿测试/历史**：`dsh/test/**`、`test/**` 的 `v1.7.0` 文案与 stage id 混杂 → 只用 `1\.7\.0(?!-stage-133)` + 逐文件 diff；排除 `.openfeel/**`（除本阶段计划/需求正文）、`dist/**`、`docs/market/**`、CHANGELOG 历史段；A68.3 排除式验收。
- **打穿既有 13 条 release 用例**：冻结 status 词表、保留 `publish skipped` 子串、默认 market/archive-commit/tag 仍 skipped、`publishMode` 仅 `skipped→ci`。
- **误 push 触发 CI 发版**：push 到 master 且版本变化即自动发布（`dd73dfaf` 未 push）→ 本阶段**不 push、不打 tag、不 publish**；T4 验证阶段禁止 push；push 只在用户确认后由人类一次性执行。
- **EN 渲染预算超限**：en-disabled 1143 → 余量 57 → 英文补句 ≤50 字符；超了只压措辞，不抬预算、不删既有检查点。
- **规则文件写入受限**：`.openfeel/dev/dev_core.md` 不在 guard 的 PROTECTED 名单（`dsh/lib/guard.js:766-787`），但相位门可能仍拒 → 失败由 Feel/人类落盘并登记偏差。
- **parity 5 处分叉**：源改完必须逐字复制 4 份 `feel.md` parity 块 + `npm run build` 重生成 `template-loader.ts`，禁手改生成物。

## 操作方案

- **依赖**：无前置阶段（`v1.7.0-stage-133` 已 done）。
- **操作方案**：由 S1—S6 六步直接构成（每步一张派单，含 §一 判据编号与 §1.2 取证命令）；不另建 op 模板。
