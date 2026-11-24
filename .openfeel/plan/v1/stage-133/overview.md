# v1.7.0-stage-133

> 2026-11-24 修订（REV-P01…P10，针对独立审查 6 blocking + 4 major）：判据口径、任务与矩阵按需求正文重排；详见 `plan.md` §七。

## 目标

把 v1.6.0 遗留的「流程债」在一条发布链路上一次收口：发布从人工对话变成 `npm run release` 一条命令（REQ-061）；审后只改文档不再被迫 `--force` 回退执行相位（REQ-062）；需求生命周期补上真正的审查窗口与 `req --json` 错误码（REQ-063）；`req plan`/`req body --from`/`lint fill --fix-plan` 把「建需求即写实」的成本降下来，并修掉 `req body --text` 的多行截断（REQ-064）；测试夹具工厂 + dashboard 流程债面板让门禁不打穿、债可跟踪（REQ-065）；DSH 派发台账补成闭环并量化遵守率（REQ-066）；封掉 guard 的 wrapper 绕过面（REQ-067）。

判据口径：**判据编号 = 需求正文原编号**（正文已逐条登记 `A6x.1`…`A6x.4/5`），本阶段沿用不重排，共 **29 条**（A61.1—A61.4 / A62.1—A62.4 / A63.1—A63.4 / A64.1—A64.5 / A65.1—A65.4 / A66.1—A66.4 / A67.1—A67.4），详见 `plan.md` §一。（2026-11-24 修订，REV-P05：原稿「7 个需求各只登记一条 A1 / 共 28 条」与正文不符，已作废。）

## 关联需求

- **REQ-061**：发布链路一条命令——`npm run release` 串起版本校验/build/双包 publish/market/归档提交/tag；**默认不真发、真实发布只认 `--publish` 且 `whoami` 认证通过**，失败早停并打印 `npm login` 指引（不打印 token）；`--notes-only` 生成 CHANGELOG 草稿、人工确认才写入。（R1）
- **REQ-062**：文档类变更写白名单 + 统一 GateOverride 审计——`review_passed`/`test_passed` 可写 `docs/**`、根级 `*.md`、`test/fixtures/**`，`src/**` 仍拒；三处 `--force` 收敛为同一审计 schema（含 `from`/`to`）。（R2）
- **REQ-063**：需求审查相位 + `req` JSON 错误码——新增 `review_pending`（可回退、旧直连移除、`--force` 留痕）；`review_pending` 下 `--to done` 缺审/缺验分别 exit 1 并返回 `REQ_REVIEW_REQUIRED`/`REQ_VERIFY_REQUIRED`；`req claim/advance/complete` 补 `--json`。（R3）
- **REQ-064**：`req plan` + `req body --from` + `lint fill --fix-plan` + `--text` 多行保真——需求级计划与正文不再靠手写/多次调用；adapter 的 `feel_req action=body text=` 改走临时文件。（R4）
- **REQ-065**：测试夹具工厂 + dashboard 流程债面板——`test/fixtures/req-input.js` 为**共享字段口径**（同时被 `factories.ts` 与 `dsh/test/verify.js` import），工厂至少 3 处复用；空壳/缺计划/未盖章/dev 过期四类债进 dashboard。（R5）
- **REQ-066**：DSH 派发闭环 + 遵守率——`feel_dispatch action=finish` 写 `closing` 四键（按 `dispatchId` 幂等补写）；`feel_status.dispatch` 增 `open[]`/`closedRatio`，`missingRoles` 依据 `closing` 计算；四指标经 **`feel_verify action=adherence`** 输出。（R6）
- **REQ-067**：guard wrapper 静态分类——`pwsh -File`、`cmd /c`、`bash -c`、`node -e` 读脚本内容分类，命中 class 1/2 拒绝并审计；不可读/编码不明 → class 4 warn + 审计含 `wrapper`/`scriptPath`；≥6 用例含 UTF-16/GBK 编码混淆。（R7）

## 操作方案

七个需求按「发布链 → 门禁 → 需求生命周期 → 工具链 → DSH」五段推进，一个需求一个增量（R1~R7），每个增量内部再拆成可独立验收的步（共 13 步，见 `plan.md` §三）：

- 发布与门禁先行（R1/R2）：先让 v1.7.0 的发布动作可复现（`scripts/release.mjs` + `--dry-run`/`--notes-only`），再把「审后只改文档」与 `--force` 审计统一，避免后续增量自己撞门。
- 需求生命周期其次（R3/R4）：`review_pending` 与 `req --json` 是 R4/R5 的前置（同文件 `src/commands/req.ts` 串行，出口计数要先对齐 46/47 基线再加编号）。
- 工具链与 DSH 依次（R5/R6）：dashboard 流程债面板与 DSH 派发闭环**按序派单**（严格串行，不并行）。
- guard 最后加固（R7）：与 R2 同文件，必须等白名单改动（`:2929-2943`）合并后再动 wrapper 分类段（`:1498-1620`）。
- 收口（E13）：文档对账 + CHANGELOG 版本段 + 全量回归，作为 R1 的收尾步在末尾执行。

单写者文件清单、判据单点（`src/core/plan/filled.ts`、`src/core/plan/body-lint.ts`、`dsh/lib/guard.js` 的 `classifyShellCommand`、`requirementDoneBlocker`）与 `--force` 统一审计 schema 见 `plan.md` §2.0 与 §四。

## 开发节奏（R1 → R7，严格串行）

| 增量 | 覆盖步 | 覆盖判据 | 内容 |
|------|--------|----------|------|
| **R1** | A1、A2、（收口）E13 | A61.1—A61.4 | `scripts/release.mjs` 六步链 + 默认不真发 + `--publish`/whoami + `--notes-only` 草稿；E13 文档对账与全量回归 |
| **R2** | B3、B4 | A62.1—A62.4 | guard 相位白名单（doc/fixture）+ `src/core/flow/gate-override.ts` 统一审计（含 `from`/`to`） |
| **R3** | B5、B6 | A63.1—A63.4 | `review_pending` 状态域与流转表 + `req claim/advance/complete --json` + 两码（缺审/缺验） |
| **R4** | C7（R4a + R4b） | A64.1—A64.5 | `req plan` 骨架生成 + `req body --from` + `lint fill --fix-plan` + `--text` 多行保真/adapter 临时文件 |
| **R5** | C8、C9 | A65.1—A65.4 | `test/fixtures/req-input.js` 共享口径 + `factories.ts` + dashboard `flowDebt` 四键 |
| **R6** | D10、D11 | A66.1—A66.4 | `finishDispatch` + `open[]`/`closedRatio` + `adherence.js`/`feel_verify action=adherence` |
| **R7** | D12 | A67.1—A67.4 | wrapper 脚本内容静态分类（同 `dsh/lib/guard.js`，必须排在 R2 之后） |

严格顺序：`A1 → A2 → B3 → B4 → B5 → B6 → C7 → C8 → C9 → D10 → D11 → D12 → E13`。**不设并行组**（2026-11-24 修订，REV-P10：原「可并行组」与严格串行自相矛盾，已删除）；单写者文件（`dsh/lib/guard.js`、`dsh/test/guard.js`、`dsh/test/verify.js`、`src/commands/req.ts`、`src/core/req/requirement-ops.ts`、`dsh/lib/tools/index.js`）按 `plan.md` §2.0 的顺序串行合入。

## 验收（阶段级）

- **阶段级判据**：`plan.md` §一 的 **29 条**（A61.1~A67.4/5，正文原编号）全部有命令级或单测级证据，缺一不算完成。
- **必跑全量**：`npm test`（0 fail，用例数 ≥ v1.6.0 基线 2400+）、`npm run build`、`cd dsh && node test/contract.js && node test/verify.js && node test/guard.js && node test/preflight.js`、`node bin/openfeel.js lint i18n`、`node bin/openfeel.js lint fill`（advisory，exit 0）。
- **发布链自证**：`npm run release -- --dry-run --json` exit 0 且六步全 `ok`；`npm run release -- 1.7.0 --notes-only --json` 只产草稿不改 `CHANGELOG.md`（真实 publish/push 由人类在发版窗口执行，不在本阶段验收面）。
- **文档一致**：`docs/commands.md`、`docs/json-contract.md`、`docs/VERSIONS.md`、`CHANGELOG.md`、`dsh/ADAPTER.md`、`dsh/README.md` 六处与实现同批更新。
- **JSON 出口计数锁（写死）**：**`release` 不登记 CLI `--json` 出口**（它是 `package.json` 脚本，不是 `openfeel` CLI 子命令，形状由 `test/scripts/release.test.ts` 锁）⇒ 基线 46 成功/47 注册 → 目标 **50 成功 / 51 注册**（新增 `req claim`#47/`req advance`#48/`req complete`#49/`req plan`#50）；`docs/json-contract.md` 头行、`test/commands/knowledge.test.ts:384-401`、`test/cli/json-contract.test.ts` 三处同批（REV-P09）。
- **块级门**：需求 `→done` 前须 `req review` + `req verify` 均 pass（`review_pending` 下缺一则 exit 1 并返回 `REQ_REVIEW_REQUIRED`/`REQ_VERIFY_REQUIRED`）；阶段 `archiving→done` 前 `feel_dev status` 的 `due=false`、无 blocking open REV。

## 风险

- **guard 白名单放松过头**：`test/**` 整体当夹具 = 审后放开测试代码改写。规避：只认 `test/fixtures/**`，用例含 `test/core/**` 仍拒的负例。
- **需求相位打穿状态机**：加 `review_pending` 时保留或放宽隐式 `--force` 直连。规避：流转表单点、穷举组合用例、`--force` 只经统一 GateOverride 留痕。
- **release 越权 commit / 误发版**：`done` 相位 `git commit` 被 guard 拒（`dsh/lib/guard.js:2292`），脚本必须由人类执行；**默认不真发**，真实 publish 只认 `--publish` 且过 whoami，`--dry-run` 与 `--publish` 互斥。
- **wrapper 分类误杀**：正常脚本被判写操作会让用户关掉门禁。规避：只认三类命中，保留只读反例，触顶/不可读/编码不明一律 `warn` + 审计（含 `wrapper`/`scriptPath`）。
- **计数锁漂移**：`req` 三命令 + `req plan` 四处新增出口，文档/计数测试/形状锁任一处漏改即 CI 红。规避：三处同批、先对齐基线再续编号；`release` 明确不进表。
- **`--text` 多行修复变静默降级**：修完仍把多行塞进 argv 或临时文件残留。规避：字节级相等断言 + adapter `finally` 清理 + reviewer `grep` 断言 `pushOption(argv,'--text'` 零命中。
- **两套写实判据**：`req plan`、dashboard、工厂任一另写「四节/40 字」规则都会与计划门打架。规避：单点 `src/core/plan/filled.ts` + `body-lint.ts`，reviewer 用 `grep` 断言无第二份。
