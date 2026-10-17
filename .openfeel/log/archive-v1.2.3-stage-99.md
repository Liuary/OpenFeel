# v1.2.3-stage-99 归档摘要 — v1.2.2 转出项收口（补丁版本）

- **阶段**：`v1.2.3-stage-99`（v1.2.3 单阶段 · 收口；工作流模式 **fast**，轻量归档）
- **归档人**：openfeel-archiver ｜ **归档时间**：2026-10-17 ｜ **上游**：`v1.2.2-stage-98`（done / 已归档）
- **关联需求**：无（`requirement: null`；本阶段为补丁收口）
- **基线**：HEAD `2ede21a` + 当前工作区；CLI 1.2.2 → **1.2.3**；测试 75 文件 / 1911 用例；契约 33 成功出口 / 34 注册选项
- **归档结论**：审查通过（REV-99-001~003 全闭环，0 blocking）；门禁全绿（G1~G8）；**阶段可置 done（phase 推进由 Feel 经 CLI 执行）**；**v1.2.3 版本级收口成立**。

## 一、阶段目标与达成（T1~T6）

| 任务 | 转出项来源 | 交付 | 结果 |
|:--:|------|------|:--:|
| T1 | REV-95-009 | 并发 JSON 退出机制统一：`handleConcurrentConflict` JSON 分支改为 `emitErrorEnvelope → process.exitCode=2 → return`（删除 `process.exit`）；非 JSON 分支逐字不变；`handleAddStageError` 返回类型 `never → void`；**10 个调用点**（直接 8 + 调用方 2）显式返回 / 核对 | ✅ |
| T2 | REV-98-003 第 6 项 | `flow advance --help --review-tier` 三载体同批订正（`flow.ts` 字面量 + i18n zh/en）：zh「缺省=full（零裁剪）」/ en「default = full (zero pruning)」；`flow advance` 缺省行为零改动；历史节不回溯改 | ✅ |
| T3 | REV-98-006① / REV-95-008 覆盖缺口 | 锁等待超时测试专用 env seam：`OPENFEEL_TEST_MODE=1` 门控 + `OPENFEEL_TEST_LOCK_TIMEOUT_MS` / `OPENFEEL_TEST_LOCK_STALE_MS`（函数体内读、正整数才生效、显式 options 优先、非法回落）；新增 `test/cli/lock-timeout.test.ts` E2E 断言 `INTERNAL_ERROR`/internal/3；生产默认 5000/3000ms 与算法零改动 | ✅ |
| T4 | REV-97-006 | `req show` 与 `req set --workflow-mode` 改用 `listLinkedStages`（第二处实测落点非 `req split`）；`src/commands/req.ts` 内联 `requirement_id` 过滤 **0 残留**；core 引擎层 `allLinkedStagesDone` / `hasLinked` 保留；`req split` / `splitRequirement` 零 diff | ✅ |
| T5 | 版本收口 | 版本 **1.2.3** 全链路 A/B/C/D/E：A 类 6 载体 / 8 文件 / 10 处残留 0；B 类双生成物 build 重生成；C 类 CHANGELOG `[1.2.3]` + README×3 / GETTING_STARTED / commands / json-contract（§14.1 钩子 + §14.2 已统一）/ manual / cli-usage skill 快照；D 类白名单；E 类零动作 | ✅ |
| T6 | 门禁与验收 | `npm test` **75 文件 / 1911 用例 / 0 failed / 0 skipped**；`tsc` 0；`lint i18n` 983；`lint kb` 0 过期 / 631 引用；build ×2 幂等；`--version` = 1.2.3；A 类残留 0；lock-timeout E2E 3 次稳定 | ✅ |

## 二、变更文件（`git diff 2ede21a --stat` = 29 文件 +347/−72 + 新增 1 文件）

**源码（业务面）**：`src/commands/shared/errors.ts`（T1 退出统一）、`src/commands/flow.ts`（调用点 return + help 字面量）、`src/commands/req.ts`（T4 单点化）、`src/core/fs/file-lock.ts`（T3 env seam）、`src/core/req/aggregate.ts`（单点边界头注）、`src/core/i18n-data/{zh-CN,en}.ts`（T2 文案）。`src/commands/stage.ts` 经实测无需改动（调用方为 catch 末语句）。

**版本载体（A 类，10 处）**：`package.json`、`package-lock.json`（仅 root 两处，禁 `npm install`）、`.openfeel/config.yaml`（单行）、`src/core/config.ts`（两处）、`templates-data/agents-md/{zh-CN,en}.md`、`templates-data/claude/constraint/{zh-CN,en}.md` 均为 `1.2.3`。

**生成物（B 类，禁手改）**：`src/core/template-loader.ts`、`src/core/update.ts`——`npm run build` 重生成。

**文档与传播（C 类）**：`CHANGELOG.md`（`## [1.2.3] - 2026-10-17`）、`README.md` / `README.zh-CN.md` / `README.en.md`、`docs/GETTING_STARTED.md`、`docs/commands.md`、`docs/json-contract.md`、`.openfeel/manual/{index.md,cli/commands.md,core/fs.md,core/json-contract.md,core/req.md}`、`src/core/templates-data/skills/openfeel-cli-usage/SKILL.md`。

**测试**：`test/cli/error-envelope.test.ts`（⑤ 改写 + ⑤b/⑤c 新增）、`test/commands/shared-errors.test.ts`、`test/core/fs/file-lock.test.ts`（gate / 合法值 / 非法值 / 显式优先）、`test/core/req.test.ts`、`test/core/templates.test.ts`（快照断言）、新增 `test/cli/lock-timeout.test.ts`。

**回填（归档轮）**：`.openfeel/roadmap/v1.2.3.md`、`.openfeel/plan/v1/v1.2.3/plan.md`、`.openfeel/plan/v1/stage-99/{status.md,overview.md}`、`.openfeel/tmp/stage-99/gate.md`。

## 三、门禁（`.openfeel/tmp/stage-99/gate.md`，三要素 CLI 1.2.3 / win32 Git Bash / Node v24.18.1）

| # | 门禁 | 实测 | 结论 |
|:-:|------|------|:--:|
| G1 | `npm test` | **75 文件 / 1911 用例 / 0 failed / 0 skipped**（+1 文件 +17 用例） | PASS |
| G2 | `npx tsc --noEmit` | 0 错误 | PASS |
| G3 | `lint i18n` | 983 键（zh/en 对称） | PASS |
| G4 | `lint kb` | 0 过期 / 631 引用（622→631 文档增量） | PASS |
| G5 | `npm run build` ×2 | `git status --porcelain src/` 无新增差异（幂等） | PASS |
| G6 | `--version` / `--version --json` | **1.2.3** | PASS |
| G7 | A 类版本残留 | 0 | PASS |
| G8 | `test/cli/lock-timeout.test.ts` | `status===3`、单文档 `INTERNAL_ERROR`/internal、stderr 无 envelope；**重复 3 次稳定** | PASS |

## 四、审查与 REV 闭环

| 轮次 | 结论 | 条目与处置 |
|------|:--:|------|
| 计划审查（fast 单轮，必经） | 通过 `plan_review → plan_passed` | REV-99-001（T1 调用点审计遗漏 `handleAddStageError` 2 个调用方，medium）→ 计划补 10 点枚举 + 实测豁免证据 **closed**；REV-99-002（不变量 5「唯一过滤」措辞过宽，low）→ 限定「命令层输出面 + 聚合投影」，core 领域逻辑保留 **closed** |
| 代码审查（fast 单轮） | 通过 `review_pending → review_passed` | 独立复跑全量测试（不采信 executor 报告）：T1 十点退出统一 + ⑤/⑤b/⑤c 测试矩阵；T2 双语文案 + 行为零 diff；T3 门控/优先级/生产默认；T4 单点化零残留 + core 边界；T5 版本全链路；REV-99-001/002 复核 **closed**；新开 REV-99-003（T6 实测值无载体，low，非阻塞）→ **归档轮补登 `tmp/stage-99/gate.md` 后 closed** |
| 正式验收 | fast 快线不含独立测试官轮（审查轮独立复跑代行） | 门禁 G1~G8 全绿；0 Bug；版本级收口成立 |

**REV 处置总表**：99-001 **closed** / 99-002 **closed** / 99-003 **closed**（归档轮补证）→ **0 blocking / 0 遗留条目**。

## 五、验收与外部项

- **验收**：门禁全绿 + 零回归清单（33 成功出口 / 34 注册选项键集键序不变；退出码 0/1/2 语义不变；非 JSON 并发文案逐字不变；`req show` / `req set` / `flow advance` 人类输出不变；存量 `flow.json` 零迁移零注入）。
- **OUT-1（仓库外 · 待 Feel 处理）**：OpenFeel-DSH 适配器跟进——① 退役 `PHASE_AGENT` 镜像（`dashboard.js:35/:38`，REV-98-006②），改为消费 `flow next --json`；② `errorFromResult` 透传 envelope 的 `kind` / `code` / `detail`；③ 更新 DSH 测试并跑 verify。**不纳入本仓阶段文件清单、不作为本阶段完成判据**；由 Feel 单独委派。
- **未做**：未 commit / 未 push / 未 publish；未直写 `flow.json`；未推进 phase（保持 `archiving`）。

## 六、版本级收口声明

- **v1.2.3 为补丁版本**：范围锁定为 v1.2.2 四项仓库内转出项（REV-95-009 / REV-98-003⑥ / REV-98-006① / REV-97-006）+ 版本收尾；**无新增功能 / 命令 / 字段 / 配置键 / 第三方依赖**。
- **兼容承诺成立**：退出码 `0/1/2` 语义不变（并发 JSON 仅改退出机制）；33 个成功 JSON 出口 / 34 个注册选项键集与键序不变；非 JSON 文案逐字不变；`flow advance` 缺省档位仍为 `full`（零裁剪）；phase 枚举 15 项 / 转移表不变；存量 `flow.json` 零迁移零注入。
- **v1.2.3 单阶段（stage-99）完成**：A 类残留 0；B 类双生成物幂等；`--version` = 1.2.3；`CHANGELOG [1.2.3]` 落地；文档多载体与 manual 同步。
- **后续动作（Feel）**：将阶段 phase 由 `archiving` 推进至 `done`；`v1.2.2` 已归档、`v1.2.3` 版本分片归档（`flow archive v1.2.3`）是否执行由 Feel 决定；OUT-1 单独委派。
