# v1.2.2-stage-98 归档摘要 — 文档与版本收口（v1.2.2 收官）

- **阶段**：`v1.2.2-stage-98`（v1.2.2 四阶段之四 · 收官；工作流模式 full）
- **归档人**：openfeel-archiver ｜ **归档时间**：2026-10-17 ｜ **上游**：`v1.2.2-stage-95` / `stage-96` / `stage-97`（均 done / 已归档）
- **关联需求**：REQ-001（CLI 机器可读契约与调度决策下沉（DSH 适配器需求）；11 项 P0×3 / P1×4 / P2×4）
- **基线**：HEAD `cdef4ae`（stage-97 归档提交）+ 当前工作区；CLI 1.2.1 → **1.2.2**；测试 74 文件 / 1894 用例；`lint i18n` 983；`lint kb` 0 过期 / 622 引用；契约 33 成功出口 / 34 注册选项；本仓 21 阶段
- **归档结论**：审查通过（REV-98-001~006 闭环，0 blocking）；验收通过（必验 9/9、**Bug 0**、DSH 真实消费 48/48）；门禁全绿。**阶段可置 done（phase 推进由 Feel 执行）**；**v1.2.2 版本级收口成立**。

## 一、阶段目标与达成

| 目标 | 结果 |
|------|:----:|
| 文档多载体同步（README×3 / GETTING_STARTED / commands / json-contract 定稿 / manual×5 / cli-usage skill） | ✅ op-001 落地，活跃文档陈旧串 0 |
| `CHANGELOG [1.2.2]`（11 项需求逐项 + 退出码 0-3 + `errorKind` + `--project` + 33/34 口径 + REQ-001 L80 勘误留痕） | ✅ |
| 版本 1.2.2 全链路 A/B/C/D/E | ✅ A 类 10/10 残留 0；B 类 build ×4 幂等；C 类传播全载体；D 类 305 命中 / 0 未判类；E 类零动作 |
| DSH 端到端验收（33 出口 + 11 项需求映射 + 五矩阵 + 真实消费） | ✅ 41/41、11/11、4/4、15/15、5/5、5/5、适配器视角 39/39、**DSH verify.js 48/48 exit 0 @1.2.2** |
| roadmap / 版本计划回填 + 承接 REV 三分 | ✅ M52 / stage-98 = done；闭合 5 / 转出 3 / 保留 4 / 拆分 1（零灭失） |
| 全量门禁 | ✅ 74/1894 全绿、tsc 0、i18n 983、kb 0 过期 / 622 引用、build ×2 幂等、`--version` 1.2.2 |
| 收口期冻结（版本写入后零业务代码改动） | ✅ `src/**` 差异 ⊆ 版本载体 / 生成物 / 文档模板；`src/commands/flow.ts` 零 diff |

## 二、op 执行序

执行序恒为 **op-001 → op-002 → op-003**（hard 依赖 + 文件互斥；op-003 为收口，`no_downstream_after: op-003`）。

| op | 主题 | 核心交付 | 结果 |
|:--:|------|----------|:--:|
| op-001 | T1 文档多载体 + 同批 build | README×3 v1.2.2 节与横幅 / GETTING_STARTED 能力速览 / commands 新命令面（`flow next` / 全局 `--project` / 13 读命令 `--json` / 错误封装 / `--version --json` / `archive --json` / `reviewTier` 消歧）/ `docs/json-contract.md` 定稿（33 出口全表）/ manual×5 / `openfeel-cli-usage` SKILL.md v1.2.2 快照；`--review-tier` 文档面登记「缺省 full」；双生成物 `npm run build` 重生成 | ✅（15:04 起） |
| op-002 | T3 DSH 验收资产与预演 | 隔离 fixture（`os.tmpdir` + `OPENFEEL_LOG=0` + 临时 HOME）、33 出口契约矩阵 / 11 项映射 / 错误 / 决策 / 多项目 / 零回归脚本、适配器视角 `dsh-consumer.mjs`、DSH `verify.js` PATH shim 真实消费；CLI 1.2.1 预演 | ✅ |
| op-003 | T2 版本收口 + T3 最终验收 + T4 回填 + T5 门禁（**阶段最终 op**） | 顺序 3.1 CHANGELOG → 3.2 A 类 10 处 → 3.3 build ×2 → 3.4 版本验证 → 3.5 A/D 残留审计 → 3.6 DSH 1.2.2 复跑 → 3.7 roadmap/plan 回填 → 3.8 门禁 → 3.9 终局报告 → 3.10 `ops/**` 精确入管 | ✅ |

## 三、变更文件（`git diff cdef4ae --stat` = 38 文件 / +1948 −170）

**版本载体（A 类，10 处 / 8 文件）**：`package.json:3`；`package-lock.json:3/:9`（仅 root 两处，禁 `npm install`）；`.openfeel/config.yaml:7`（单行 edit）；`src/core/config.ts:436/:493`；`templates-data/agents-md/{zh-CN,en}.md:135`；`templates-data/claude/constraint/{zh-CN,en}.md:138`。

**生成物（B 类，禁手改）**：`src/core/template-loader.ts`（+33/−）、`src/core/update.ts`（+25/−）——build 重生成，×4 次 exit 0 且幂等。

**文档与传播（C 类）**：`CHANGELOG.md`（+42，`## [1.2.2] - 2026-10-17`）；`README.md` / `README.zh-CN.md` / `README.en.md`；`docs/GETTING_STARTED.md`（+80）；`docs/commands.md`（+239）；`docs/json-contract.md`；`.openfeel/manual/{index.md,cli/commands.md,core/flow-manager.md,core/req.md,core/json-contract.md}`；`src/core/templates-data/skills/openfeel-cli-usage/SKILL.md`；`test/core/templates.test.ts`（仅 S5 快照断言改写，无新增用例）。

**回填**：`.openfeel/roadmap/v1.2.2.md`、`.openfeel/plan/v1/v1.2.2/plan.md`、`.openfeel/plan/v1/stage-98/{plan.md,status.md,overview.md}`、`ops/{op-001~003.md,deps.yaml}`。

**业务代码**：无（`src/commands/flow.ts` 零 diff；无新依赖；phase 枚举 15 / `advanceAccepted` / 人类输出零改动）。

## 四、门禁（收口 op 实测，`.openfeel/tmp/stage-98/gate.log`）

| 门禁 | 实测 | 结论 |
|------|------|:--:|
| `npm run build` ×2 | exit 0；`git status --porcelain src/` 两次逐行一致 | PASS（幂等） |
| `npm test` | **74 文件 / 1894 用例** passed，0 failed / 0 skipped | PASS |
| `npx tsc --noEmit` | 0 错误 | PASS |
| `lint i18n` | **983 键一致** | PASS |
| `lint kb` | **0 过期 / 622 引用** | PASS |
| `--version` | **1.2.2**；`--version --json` = `{schemaVersion:1,version:"1.2.2",node}` | PASS |
| A 类残留 | 非 lock 载体 `1.2.1` 命中 **0**；lock 仅 `prelude-ls`@:3101、`source-map-js`@:3264（D 白名单） | PASS |
| 契约 | **33 成功出口 / 34 注册选项**；源码 / 契约 §7 / 冻结测试三处对齐；`json-contract.test.ts` 44 用例全绿 | PASS |
| 人类输出零回归 | 15 命令快照 diff 空；21 / 15 / 15 计数不变 | PASS |
| 真实 `flow.json` | 哈希 `1a80fcf0…` 起点 = 终点（零注入） | PASS |

## 五、审查与 REV 闭环

| 轮次 | 结论 | 条目与处置 |
|------|:--:|------|
| 计划审查 | 通过 `plan_passed` | REV-98-001（基线登记陈旧，low）/ 002（既有 18 出口应为 19、验收改 33 全量，medium）/ 003（承接明细与 `--review-tier` 冲突裁定，medium）/ 004（DSH 降级路径，low）→ 计划修订 1 全吸收 **closed** |
| 方案审查 | 通过 `scheme_passed` | 001~004 复核闭环；新开 005（错误矩阵用例 ① 期望码 `PHASE_TRANSITION_ILLEGAL` 应为 `PHASE_PATH_NOT_FOUND`，low）→ 实现层 ①a/①b 双用例 **closed** |
| 代码审查 | 通过 `review_passed` | 独立复跑 74/1894 全绿、tsc 0、A 类 10 处 + 残留 0、CHANGELOG 11 项、D 类 305 命中零未判类、DSH 41/41 + 11/11 + 48/48、`flow.ts` 零 diff；**0 blocking**；新开 006（两项残差立册，low）|
| 正式验收 | 通过 `test_passed` | **必验 9/9、Bug 0**；33/33 出口、11/11 映射、DSH 48/48、版本级收口成立；5 项非阻塞观察（O-1 e2e 基线绑定点 / O-2 归档文件前向回填 / O-3 status.md 滞后 / O-4 health warn 既有 / O-5 `--review-tier` 源码文案） |

**承接三分（`rev-handoff.md`）**：本阶段闭合 **5**（REV-92-005 / 94-006 / 95-005 / 95-008 / 96-008）／显式转出 **3**（REV-94-005 → 主会话 CLI 面；REV-95-009 → v1.2.3；`--review-tier` 源码 help 订正 → v1.2.3）／台账保留 **4**（REV-92-006 / 94-007 / 97-006 / REV-86 家族）／拆分处置 **1**（`--review-tier` 文档面本阶段闭合：`docs/commands.md:239` + `manual/cli/commands.md` 登记「缺省 full」）→ **零灭失成立**。

## 六、验收（`.openfeel/users/Liuary/log/2026-10-17-stage-98-test-report.md`）

- **必验 9/9 通过，Bug 数 0**（未新增 Bug 文件；编号未占用）。
- 契约 **41/41**（33 出口 + 6 形态变体 + `--version --json`）；11 项需求映射 **11/11**（33 全量口径，无「18+11」缝隙）。
- 错误矩阵 **4/4**（①a `PHASE_PATH_NOT_FOUND` / ①b `PHASE_TRANSITION_ILLEGAL` / ② legacy `gate-rejected`+`errorKind` / ④ `NO_INIT` / ⑤ 并发 exit 2 / ⑥ internal exit 3；⑥b 锁超时如实登记）；决策 **15/15**；多项目 **5/5**；零回归 **3/5 复跑 + 逐行核对成立**（2 项失败均为流水线状态漂移，非产品面，记 O-1）。
- 适配器视角 **39/39**；**DSH 真实消费 `verify.js` 48/48 / exit 0 @CLI 1.2.2**；DSH 仓库 11 文件 SHA-1 **0 changed**。
- 测试官独立复跑全量门禁：74/1894 全绿、tsc 0、i18n 983、kb 0/622、build ×2 SHA256 一致、`--version` 1.2.2。

## 七、v1.2.2 版本收官

### 7.1 四阶段交付（95~98 全 done）

| 阶段 | 主题 | 状态 | 归档 | 交付要点 |
|:--:|------|:--:|------|------|
| stage-95 | 基础设施 | done | [archive-v1.2.2-stage-95.md](archive-v1.2.2-stage-95.md) | JSON 契约冻结（18 既有出口）+ 错误封装（12 行 `code→kind→exitCode`；退出码 0/1/2 零改 + 3 新增）+ `--version --json` + 全局 `--project` |
| stage-96 | 决策权威 | done | [archive-v1.2.2-stage-96.md](archive-v1.2.2-stage-96.md) | `flow next [--json]`（12 键只读、第 19 出口）+ `stages[]` 5 调度属性 + `phases` 展示/生效档位消歧 + 决策三单点 |
| stage-97 | 读命令补全 | done | [archive-v1.2.2-stage-97.md](archive-v1.2.2-stage-97.md) | 13 读命令面 + `archive <stage>` = 14 新出口（#20~#33）；`req list` 末位 `linkedStages`/`progress`；`flow archive` 判据明细；契约 33/34 |
| stage-98 | 收口 | **done** | 本文件 | 文档多载体 + `CHANGELOG [1.2.2]` + 版本 1.2.2 全链路 + DSH 端到端验收 + 回填 + 门禁 |

### 7.2 11 项需求全部有出口与证据

| 需求 | 出口 / 命令 | 证据 |
|------|------------|------|
| P0-1 `flow next [--json]` | #19（12 键） | 决策矩阵 15/15；`legalNextPhases ⊆ advanceAccepted` |
| P0-2 读命令 `--json` | #20~#32（13 命令面） | 契约矩阵 41/41 |
| P0-3 机器可读错误封装 | 失败出口（envelope + legacy） | 错误矩阵 4/4；`code`/`kind`/退出码 0-3 |
| P1-1 `flow status --json.stages[]` 调度属性 | #1（21 × 10 键） | `opsSummary` 自洽；五属性在位 |
| P1-2 全局 `--project <path>` | 跨切面 | 多项目 5/5（三形态 / 非法 / 缺值 / 语言 / 日志 cwd） |
| P1-3 `req list --json` | #13（`linkedStages`/`progress`） | REQ-001 4 阶段 / progress 3→4 |
| P1-4 `flow archive --dry-run --json` | #8（判据明细，零写盘） | 拒绝/合格双形态 + 哈希不变 |
| P2-1 稳定键序与类型 | 33 出口全量 | 首键 `schemaVersion=1`；单文档 |
| P2-2 `reviewTier` 语义消歧 | #5 / #1 / #19 | 三处一致（展示 full ≡ 生效 full） |
| P2-3 `--version --json` | 单列（三键） | `version=1.2.2` |
| P2-4 `archive <stage> --json` | #33（6 键 + 失败码） | 成功/失败双形态 |

### 7.3 计数口径与 REQ-001 收口

- **33 成功出口**（19 既有 + 14 本版新增）/ **34 注册选项**（33 + `flow advance --json` 错误模式开关）/ `--version --json` **单列**（不计入 33/34）；本仓 **21 阶段**；phase 枚举 **15**、`advanceAccepted` **15**。
- **REQ-001 自动收口说明**：需求的 4 个关联阶段（95/96/97/98）在 stage-98 置 done 后全部完成，`syncRequirementStatus` / `AUTO_DONE_PRECONDITION` 于 done 分支单点自动把 REQ-001 由 `in_progress`（`progress=3/4`，stage-98=archiving 现状）置 **done**——**无需人工 `req set/advance`**；本归档轮不改 `flow.json`，该收口由 Feel 推进 stage-98 `done` 时同事务发生（机读权威恒为 `flow.json`）。
- 版本事实源：`package.json` `version=1.2.2`、`.openfeel/config.yaml meta.version=1.2.2`、`--version`/`--version --json.version` 同源。
- `flow archive v1.2.2`（版本分片归档）前置：本阶段 done 后由 Feel 执行（当前 `archived_versions` 尚未含 v1.2.2，属计划内）。

## 八、遗留项（均转出 v1.2.3 / 台账，不阻塞收官）

1. **REV-95-009**：并发 envelope `process.exit(2)` 退出机制统一改造 → **v1.2.3 评估**（收口期冻结，`handleConcurrentConflict` 保持现状，并发错误矩阵 exit 2 实测不变）。
2. **`--review-tier` 源码 help 文案**（`src/commands/flow.ts:899`「缺省=按模式派生」实际缺省 `full`）→ **v1.2.3 首个规划阶段**订正；本阶段仅文档面登记实际语义。
3. **DSH 镜像退役 / `errorFromResult`**：DSH `dashboard.js:35/:38` 仍持 `PHASE_AGENT` 镜像且未消费 `flow next --json`；`errorFromResult` 未透传 `code`/`kind`/`detail` → **DSH 侧改造项（v1.2.3）**，CLI 侧已提供权威面。
4. **REV-98-006 两项残差**：① 锁等待超时 E2E 注入（`staleMs=3000 < timeoutMs=5000` 致不可稳定触发，现由 `error-envelope.test.ts` ⑩ 单元级覆盖）→ v1.2.3 评估测试钩子或接受单元级为唯一覆盖面；② DSH `errorFromResult`（同上）。
5. **REV-92-006 / REV-94-007 / REV-97-006 / REV-86 家族**：台账保留（非本版范围）。
6. **O-1 测试资产提示**：`.openfeel/tmp/stage-98/e2e/run-zero-regression.mjs` 人类输出基线绑定阶段起点状态，阶段推进后复跑必然 2 项误报——临时资产不入产品面，已记入 kb/troubleshooting。

## 九、承接声明

- v1.2.2（四阶段 95~98）交付面、文档面、版本面、验收面全部闭环；REQ-001 11 项需求全部有出口、映射与证据；**版本级收口成立**。
- 既有 19 个成功出口契约、人类输出、phase 枚举 15 项、`advanceAccepted`、full/fast 转移行为与存量 `flow.json` 零迁移/零注入均保持兼容。
- 下一版本（v1.2.3）承接：REV-95-009 退出机制、`--review-tier` 源码 help、DSH 镜像退役与 `errorFromResult`、锁超时 E2E 钩子、台账保留项。
- 阶段最终 `phase=done` 与 `flow archive v1.2.2` 由 Feel 经 CLI 推进；归档官未修改源码 / 测试 / flow.json，未 commit / push。
