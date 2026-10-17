# v1.2.2-stage-96 归档摘要 — 调度决策权威（`flow next` 与阶段调度属性）

- **阶段**：`v1.2.2-stage-96`（v1.2.2 四阶段之二 · 决策权威；工作流模式 full）
- **归档人**：openfeel-archiver ｜ **归档时间**：2026-10-17 ｜ **上游**：`v1.2.2-stage-95`（done / 已归档）
- **关联需求**：REQ-001（CLI 机器可读契约与调度决策下沉（DSH 适配器需求））
- **阶段定位**：把「当前阶段 + 相位 → 谁负责 → 合法下一相位 → 建议命令 → 守卫 → 阻塞项」收敛为 CLI 单点输出（`flow next`），并让 `flow status --json` 一次给出每阶段调度属性，消除适配器 N 次 `flow mode` 调用与 `PHASE_AGENT_MAP` 镜像。
- **归档结论**：测试通过（必验 8/8，Bug 0）；审查通过（REV-96-001~008 全闭环 / 转出登记）；门禁全绿。**阶段可置 done（phase 推进由 Feel 执行）**。

## 一、阶段目标

1. 新增只读命令 `flow next [--json]`：12 键固定序（`schemaVersion,stage,phase,phaseLabel,responsibleAgent,workflowMode,reviewTier,effectiveReviewTier,legalNextPhases,suggestedCommand,guards,blockingReviews`），零写盘（不 save / 不 appendLog / 不改 phase）。
2. `flow status --json.stages[]` 每元素追加 5 调度属性（既有 5 字段逐字不变）：`workflowMode` / `requirementId` / `reviewTier` / `effectiveReviewTier` / `opsSummary{total,byState}`。
3. `flow phases --json` 末位追加 `displayReviewTier` / `effectiveReviewTier`，显式区分「展示档位」与「生效档位」（既有 7 键逐字不变）。
4. 决策单源：`getResponsibleAgent`（委托 `mapPhaseToAgent`）/ `listStageBlockingOpenReviews`（阶段域谓词）/ `DEFAULT_EFFECTIVE_REVIEW_TIER`（生效档位常量）；命令层禁止第二份映射。
5. 契约同步：`flow next` 为**第 19 个成功 JSON 出口**（flow 12）；注册 `--json` 选项 **20**；`docs/json-contract.md` §5/§6/§7/§12 冻结。
6. 零回归：`flow status` / `flow status --verbose` / `flow phases` / `flow advance --help` 人类输出逐字不变（空 diff）；`flow --help` 仅新增 `next` 一行、`flow phases --help` 仅 `--json` 描述补两键名。

## 二、op 与执行序

执行序恒为 **op-001 → op-002 → op-003**（hard 依赖 + 文件互斥：`src/commands/flow.ts` / `docs/json-contract.md` / `test/commands/flow.test.ts` / `test/cli/json-contract.test.ts` / `src/core/i18n-data/{zh-CN,en}.ts` 由 op-001 与 op-002 共享 → 串行；op-003 恒末位）。`ops/deps.yaml` 声明完整。

| op | 主题 | 核心交付 | 结果 |
|:--:|------|----------|:--:|
| op-001 | 调度单点方法 + `flow next` | `DEFAULT_EFFECTIVE_REVIEW_TIER`（pipeline-schema）、`getResponsibleAgent` + `listStageBlockingOpenReviews`（flow-manager，纯增量）、`flow next`（命令层，12 键 + 空态 + guards 固定序 5 项）、契约 §5 #19 / §6.10 / §7 计数 19/20 / §12.1、15 phase 映射矩阵 + advance 接受集交叉断言 | done（13:10） |
| op-002 | `stages[]` 调度属性 + `phases` 档位消歧 | `summarizeOpStates` 单点 + `buildStatusJson` 追加 5 字段（10 键固定序）+ `flow phases --json` 末位 2 键（9 键）；`help.flow.phases.json` 文案同步（零键增删）；契约 §5 #1/#5、§6.11/6.12、§12.2/12.3；三处档位一致性断言 | done（13:18） |
| op-003 | i18n 收口、REV 处置登记、零回归取证与阶段门禁（阶段末 op） | 19 新键逐键列名（零死键）、契约计数复核、`flow status --verbose` 入快照矩阵（逐字空 diff）、REV 承接表与三分结论（0/5/2）、全量门禁 + 变更集白名单审计、终局报告 | done（13:24） |

## 三、变更文件

**新增（0 源码文件）**：`flow next` 落 `src/commands/flow.ts`；无新文件、无新第三方依赖。

**修改（10 文件；`git diff 25ebc4e -- src test docs` = +1011 / −51）**：

| 文件 | 增量 | 内容 |
|------|------|------|
| `src/core/pipeline-schema.ts` | +8 | `DEFAULT_EFFECTIVE_REVIEW_TIER: ReviewTier = 'full'`（单源常量） |
| `src/core/flow-manager.ts` | +26 | 纯增量：`listStageBlockingOpenReviews` 纯函数 + `getResponsibleAgent` 公开包装 + 注释；`buildDownstreamPhases` / 两处 done 门 / `mapPhaseToAgent` 映射 / 转移表**零改动** |
| `src/commands/flow.ts` | +162 | `flow next` 命令；`assertNoBlockingOpenRev` 委托单点；`effTier` 引用常量；`summarizeOpStates`；`buildStatusJson` 5 字段；`phases --json` 2 键 |
| `src/core/i18n-data/{zh-CN,en}.ts` | +23 / +23 | 19 新键（17 `flow.next.*` + 2 `help.flow.next*`）+ `help.flow.phases.json` 文案更新 |
| `docs/json-contract.md` | +55 | 头部 19 出口 / §5 #1/#5/#19 / §6.10-12 / §7 19+20 / §12.1-12.3 |
| `test/core/flow-manager.test.ts` | +177 | 15 phase → agent 矩阵、`getAvailablePhases` 矩阵、谓词语义/顺序/空态、done 门等价性、`buildDownstreamPhases` 同源 |
| `test/commands/flow.test.ts` | +455 | `flow next` 七类分支（full/fast/无活跃/记录缺失/done·general/blocking/guards 序）、只读零写盘、`stages[]` 10 键、`phases` 9 键、人类输出 |
| `test/cli/json-contract.test.ts` | +123 | #1 `stages[]` 10 键、#5 `phases` 9 键、新增 #19 `flow next`（三态） |
| `test/cli/output-encoding.test.ts` | +10 | `flow phases --json` 7→9 键断言同步 |

**证据与产出**：`.openfeel/tmp/stage-96/**`（baseline / after / human-output-diff / gate.log / final-report）、`.openfeel/plan/v1/stage-96/ops/{op-001~003,deps.yaml}`（随阶段纳管）。

## 四、门禁实测值

| 门禁 | 实测值 | 结论 |
|------|--------|:--:|
| `npm test` | **74 文件 / 1809 用例 / 0 failed / 0 skipped**（基线 1779，**+30**） | PASS |
| `npx tsc --noEmit` | 0 错误 | PASS |
| `lint i18n` | **969 键一致**（基线 950，**+19**） | PASS |
| `lint kb` | **0 过期 / 604 引用**（阶段门禁值；归档轮新增 3 条知识后复跑 **0 过期 / 614 引用**） | PASS |
| `npm run build` ×2 | 两次 exit 0；`dist/**` SHA256 全量一致；`git status src/` 无新增条目；`template-loader.ts` / `update.ts` 零 diff | PASS |
| `--version` | `1.2.1`（版本收口归 stage-98） | PASS |
| 契约计数 | 成功 JSON 出口 **19**（flow 12 + req 5 + instructions 1 + setup 1）；注册 `--json` 选项 **20** | PASS |
| 人类输出零回归 | `flow status` / `flow status --verbose` / `flow phases` / `flow advance --help` / `flow mode` **EMPTY diff**（HEAD 代码 vs 新代码同数据对照）；`flow --help` 仅 +`next`；`flow phases --help` 仅描述补两键名 | PASS |
| `flow next` 只读 | 前后 `flow.json` / `flow.json.bak` / `log.md` / `metrics.json` / `day_index.md` SHA256 全不变；`save` spy 零调用 | PASS |
| 性能 | `flow status --json` 5 次中位数 < 1s（逐阶段 `resolveStageWorkflowMode`，本版不加缓存） | PASS |

## 五、审查轮次与 REV 闭环

| 轮次 | 结论 | 条目与处置 |
|------|:--:|------|
| 计划审查 | 通过 `plan_passed` | REV-96-001（实测清单遗漏 `buildDownstreamPhases`/`DownstreamPhase` 消费点，medium）/ 002（基线陈旧 + 行号漂移）/ 003（§7 计数 18→19 未列 T5）/ 004（无活跃阶段分支部分字段未定稿）/ 005（承接表缺 REV-95-005/008/009 三行）→ 计划修订 1 全吸收 **closed** |
| 方案审查 | 通过 `scheme_passed` | 001~005 复核闭环；新开 006（`flow next` 分支读 `options.json` 偏离 stage-95 JSON 模式单点）/ 007（`deps.yaml` 互斥漏列 i18n-data + op-003 前提表述过时）→ 实现层 **closed** |
| 代码审查 | 通过 `review_passed` | 001~007 闭环复核；新开 008（`ops/op-003.md` 残留「17 阶段」，实况 21）→ 执行期已订正为「21 阶段（实测）」；残留「17 阶段量级」仅存 `op-002.md:11` / `plan.md:143` 的方案期规模论证 |
| 正式验收 | 通过 `test_passed` | 必验 8/8；**Bug 数 0**；4 项非阻塞观察（`PHASE_AGENT_MAP` 独立字面映射仍在 `metrics.ts`、`--review-tier` help 陈旧、`--dry-run` 多步接受集大于直接可达集、根级 `--json` envelope） |

## 六、REV 三分表（承接确认）

| REV | 级别 | 处置 | 落点 |
|-----|:--:|------|------|
| REV-96-001~005 | medium×1 / low×4 | **本阶段闭环**（计划修订 1 + 方案/代码证据） | stage-96 |
| REV-96-006 / 007 | low | **本阶段实现层闭环**（`isJsonMode()` 单点；deps.yaml 补 i18n-data；op-003 删除虚假遗留） | stage-96 |
| REV-96-008 | low | **本阶段闭环**（`ops/op-003.md` 已改「21 阶段（实测）」；不动产品行为） | stage-96 |
| REV-95-005（roadmap 旧口径） | low | **转出**：roadmap 文档收口 | **stage-98** |
| REV-95-008（锁等待超时归类 `INTERNAL_ERROR/internal/3` 契约边界） | low | **转出**：契约文档登记 | **stage-97** |
| REV-95-009（并发 envelope `process.exit(2)` 退出机制） | low | **转出**：并发 JSON 路径改造 | **stage-97** |
| REV-94-005 / 006 | low | **转出**：文档/入管核对 | **stage-98** |
| REV-92-006 / REV-92-002 | low | **台账保留**（本阶段不使用 `findPhasePath` / `est_ops=3` 已登记） | 台账 |

- **三分结论**：**处置 0／显式转出 5（REV-94-005/006、REV-95-005/008/009）／台账保留 2（REV-92-006、REV-92-002）→ 零灭失成立**。
- 与 `plan.md §七`（修订 1）及 `ops/op-003.md §5` 逐行一致（REV-96-005 闭环）。

## 七、验收结果

- 必验 **8/8**：`flow next` 12 键与语义（含空态三类）、advance 接受集交叉、`stages[]` 10 键 + `opsSummary` 同源、`phases` 9 键 + 三模式档位、零回归/扩展优先、契约计数与键序、REV-96-008 意见、门禁独立复跑。
- **Bug 数 0**（未新增 Bug 文件；`.openfeel/users/Liuary/bugs/cli/` 编号未占用）。
- 关键实证：本仓 `flow next --json` 在 `test_pending` 时输出 `legalNextPhases=[test_failed,test_passed]`、`suggestedCommand` 可执行；21 阶段逐元素 `opsSummary.total === Object.keys(ops).length` 且 `ΣbyState === total`；三处档位一致（`next`/`status.stages[]`/`phases` 均 `reviewTier=display`、`effectiveReviewTier='full'`）。

## 八、计划回填与文档同步

- `.openfeel/plan/v1/v1.2.2/plan.md`：阶段执行进度表 **M50 = done（2026-10-17）** + 归档链接。
- `.openfeel/roadmap/v1.2.2.md`：进度表 **M50 / stage-96 = done**（含归档链接）；版本状态更新为 stage-95/96 已归档、stage-97~98 待执行。
- `.openfeel/plan/v1/stage-96/overview.md`：目标 / 依赖 / op 状态 / 门禁 / 归档链接回填。
- manual：`cli/commands.md`（`flow next`、`stages[]` 新字段、`phases --json` 档位字段、出口计数 19/20）、`core/flow-manager.md`（`getResponsibleAgent` / `listStageBlockingOpenReviews` / `DEFAULT_EFFECTIVE_REVIEW_TIER` 单点）、`index.md`（模块树注记 + 维护规则两行）。
- 知识库：architecture **1** 条 / patterns **2** 条（去重最高相似度 **4.0%** ≪ 80%，均新增）；`kb/index.md` 分类计数与摘要同步。

## 九、遗留项

1. **REV-95-008 / 009 → stage-97**（非阻塞）：锁等待超时归类的契约边界登记；并发 JSON 分支 `process.exit(2)` 退出机制统一。
2. **REV-95-005 + `--review-tier` help 陈旧 → stage-98**：`flow advance --help` 的 `--review-tier` 描述仍写「缺省=按模式派生」（实际缺省 `full`，与 `effectiveReviewTier` 口径不符）——本阶段零回归纪律下未改该帮助文本，随 stage-98 文档多载体收口一并订正；roadmap 文档面收口同批。
3. **文档面 low（不阻塞）**：`ops/op-002.md:11` 与 `plan.md:143` 仍写「17 阶段量级」（方案期规模论证语，非当前计数断言）；`ops/` 不随 CLI 发布、运行时不读取；随 `ops/` 纳管时改为「阶段数量级」即可。
4. **观察项（非本阶段引入）**：`PHASE_AGENT_MAP`（`src/core/metrics.ts`）为既有独立 phase→agent 字面映射（9 项，与 `getResponsibleAgent` 当前一致），是单源纪律的后续收敛点，待后续阶段评估。
5. `--version` 仍为 `1.2.1`（版本收口归 stage-98）；不新增第三方依赖、不改 CI。

## 十、承接声明

- stage-97（读命令 `--json` 全量补全）复用本阶段冻结的 `flow next` / `stages[]` / `phases` 调度属性字段与三处档位口径；失败路径接入 stage-95 错误层，并承接 REV-95-008/009 的契约登记。
- stage-98（文档与版本收口）按本阶段「19 个成功出口 / 20 注册选项」计数做 DSH 端到端契约验收，并订正 `--review-tier` 帮助文案与 roadmap 文档面。
- 既有 18 个成功出口契约、`flow status` / `flow phases` 人类输出、phase 枚举 15 项、full/fast 转移行为均保持兼容；本阶段能力均为扩展。
- 阶段最终 `phase=done` 由 Feel 经 CLI 推进；归档官未改源码 / 测试 / flow.json，未 commit / push。
