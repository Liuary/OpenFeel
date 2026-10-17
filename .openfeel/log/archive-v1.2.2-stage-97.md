# v1.2.2-stage-97 归档摘要 — 读命令 `--json` 全量补全

- **阶段**：`v1.2.2-stage-97`（v1.2.2 四阶段之三 · 读命令补全；工作流模式 full）
- **归档人**：openfeel-archiver ｜ **归档时间**：2026-10-17 ｜ **上游**：`v1.2.2-stage-95` / `v1.2.2-stage-96`（均 done / 已归档）
- **关联需求**：REQ-001（CLI 机器可读契约与调度决策下沉（DSH 适配器需求））
- **阶段定位**：把 DSH 适配器仍需解析中文人类文本的 13 个读命令面一次性补齐 `--json`，并完成 `req list` 关联阶段 / 进度、`flow archive` 判据明细、阶段归档 JSON 三个扩展；全部失败路径接入 stage-95 错误 envelope。
- **归档结论**：测试通过（必验 8/8，Bug 0）；审查通过（REV-97-001~006 闭环）；门禁全绿。**阶段可置 done（phase 推进由 Feel 执行）**。

## 一、阶段目标与达成

| 目标 | 结果 |
|------|:----:|
| 13 个读命令面 + `archive <stage>` 新增 `--json` | ✅ **14 个新成功出口 #20~#33** |
| 成功出口计数 19 → **33** | ✅ |
| 注册 `--json` 选项 20 → **34** | ✅ |
| `req list --json` 关联阶段 / 进度 | ✅ `linkedStages` + `progress`（聚合单点） |
| `flow archive --dry-run --json` 判据明细 | ✅ `eligible` / `unfinishedStages` / `blockingReviews` |
| `archive <stage> --json` | ✅ 6 键 + `ARCHIVE_FAILED` / `INTERNAL_ERROR` |
| 契约单一权威（§5 / §6 / §7 / §13 / §14） | ✅ |
| 可执行冻结测试覆盖 33 出口 | ✅ `#1~#33` |
| 人类输出零回归 | ✅ 28/28 场景 diff 0 |
| REV-95-008 / 009 本阶段处置 | ✅ 契约登记 + 覆盖证据（009 机制改造转 stage-98） |
| i18n 969 → **983** | ✅ |
| 零新增第三方依赖 / 不改 phase 枚举 | ✅ |

## 二、op 与执行序

执行序恒为 **op-001 → op-002 → op-003 → op-004**（hard 依赖 + 文件互斥：`flow.ts` / `test/commands/flow.test.ts` 由 op-001 与 op-003 共享；i18n 双表由 op-001/002/003 共享；`test/cli/json-contract.test.ts` 由 op-003/004 共享 → 全部串行）。`ops/deps.yaml` 声明完整。

| op | 主题 | 核心交付 | 结果 |
|:--:|------|----------|:--:|
| op-001 | flow/stage 读命令（5 出口） | `stage status --json`（单阶段 7 规范键 + `fields.raw`、无参 `stages[]`；`STAGE_NOT_FOUND`）、`flow recover`（`initialized` + `RecoveryContext` + `stageStats`）、`flow checkpoint list`、`flow log`、`project overview`（`collectProjectOverview` + 双渲染）；5 个 help 键（i18n 969→974） | done（14:04） |
| op-002 | knowledge/config/view/plan 读命令（8 出口） | `knowledge search`（content 全文 + summary）/`list`/`index`/`dedup`（`readOnly:true`）、`config get`（项目/全局双形态）/`effective`、`view list`（`blocking` 缺省 `true`）、`plan scheme list`（`draft` + `fill`）；8 个 help 键（974→982） | done（14:11） |
| op-003 | `req list` 扩展 + `flow archive` 判据明细 + `archive <stage>` | `aggregate.ts` 新增 `listLinkedStages`（`computeRequirementAggregate` 内部复用）；`req list` 末位两键；`flow archive` gate-rejected 9 键（legacy 5 键序保留 + 三新键 + `errorKind` 末位）/ 成功 9 键；`archive <stage>` 6 键 + `ARCHIVE_FAILED`/`INTERNAL_ERROR`；i18n 982→983 | done（14:27） |
| op-004 | 契约登记、33 出口冻结测试、REV 覆盖与阶段门禁（阶段末 op） | `docs/json-contract.md` §5 33 出口 / §6 三项增量 / §7 33+34 / §13 读命令细则 / §14 REV 边界；`json-contract.test.ts` #20~#33 + legacy；`error-envelope.test.ts` ⑩a/⑩b/⑪；三处计数对齐审计；全量门禁 + 终局报告 | done（14:30） |

## 三、变更文件

**新增（0 源码文件）**：无新文件、无新第三方依赖。

**修改（25 文件；`git diff 87df0b7 -- src test docs` = +2714 / −149）**：

| 文件 | 内容 |
|------|------|
| `src/commands/stage.ts` | `stage status --json`（单阶段/无参双形态、7 规范字段 + `raw`、`tasks` 三元组、`blockedBy`） |
| `src/commands/flow.ts` | `flow recover` / `checkpoint list` / `log` 新增 `--json`；`flow archive` 判据明细三键（legacy 键序保留） |
| `src/commands/project.ts` | `project overview` 重构为 `collectProjectOverview` + 双渲染 + `--json` |
| `src/commands/knowledge.ts` | `search` / `list` / `index` / `dedup` 新增 `--json` |
| `src/commands/config.ts` | `config get` / `effective` 新增 `--json` |
| `src/commands/view.ts` | `view list --json`（`blocking` 缺省 `true`、`canAutoFix` / `autoFixDetail`） |
| `src/commands/plan.ts` | `plan scheme list --json`（`draft` / `fill`） |
| `src/commands/req.ts` | `req list` 末位追加 `linkedStages` / `progress`（+13 行） |
| `src/commands/archive.ts` | `archive <stage> --json`（6 键；失败 envelope） |
| `src/core/req/aggregate.ts` | 新增导出 `listLinkedStages`；`computeRequirementAggregate` 内部复用 |
| `src/core/i18n-data/{zh-CN,en}.ts` | 14 个新 help 键（成对）+ `help.flow.archive.json` 文案 |
| `docs/json-contract.md` | 头部 / §5（33 行）/ §6（13/14/15）/ §7（33/34）/ §8 / §13 / §14 |
| `test/*`（13 文件） | 逐命令形状/空态/退出码/人类快照；`json-contract` #20~#33；`error-envelope` ⑩a/⑩b/⑪；`req` 聚合单点与一致性 |

**证据与产出**：`.openfeel/tmp/stage-97/**`（baseline / after / human-output-diff / gate.log / gate-lints.log / export-audit / final-report）、`.openfeel/plan/v1/stage-97/ops/{op-001~004,deps.yaml}`（随阶段纳管）。

## 四、门禁实测值

| 门禁 | 实测值 | 结论 |
|------|--------|:--:|
| `npm test` | **74 文件 / 1894 用例 / 0 failed / 0 skipped**（基线 1809，**+85**） | PASS |
| `npx tsc --noEmit` | 0 错误 | PASS |
| `lint i18n` | **983 键一致**（基线 969，**+14**） | PASS |
| `lint kb` | **0 过期 / 614 引用**（归档轮新增 3 条知识后复跑 **0 过期 / 622 引用**） | PASS |
| `npm run build` ×2 | 两次 exit 0；`dist/**` SHA256 全量一致；`src` 无 templates 写入 | PASS |
| `--version` | `1.2.1`（版本收口归 stage-98） | PASS |
| 契约计数 | 成功 JSON 出口 **33**（flow 15 + req 5 + instructions 1 + setup 1 + stage 1 + knowledge 4 + config 2 + view 1 + plan 1 + project 1 + archive 1）；注册 `--json` 选项 **34** | PASS |
| 计数三处对齐 | 源码 `grep "option('--json'"` 34 / 契约 §7 33+34 / 冻结测试 `#1~#33` | PASS |
| 人类输出零回归 | 28/28 受控场景（HEAD 源码构建 vs 当前构建、同数据）逐字 diff 空；op-002 26 快照重跑空；op-003 快照归一化后空 | PASS |
| `--dry-run` 零写盘 | 真实工作区 `flow.json` + `flow-archive/**` 共 10 文件 SHA256 前后一致；fixture 未生成 `flow-archive/` | PASS |
| 既有出口零回归 | 契约冻结测试 #1~#19 全绿；`req list` / `flow archive` 仅登记的有意增量 | PASS |

## 五、审查轮次与 REV 闭环

| 轮次 | 结论 | 条目与处置 |
|------|:--:|------|
| 计划审查 | 通过 `plan_passed` | REV-97-001（基线陈旧 + 行号漂移，low）/ 002（新出口计数矛盾 12/13 vs 14、既有 18 应为 19、缺目标 33/34，medium）/ 003（承接表未落实 REV-95-008/009 + REV-96-008，medium）→ 计划修订 1 全吸收 **closed** |
| 方案审查 | 通过 `scheme_passed` | 001~003 复核闭环；新开 004（op-004 §1「既有 32 出口」笔误，应为 19，low）/ 005（成功分支判定双轨 `options.json` vs `isJsonMode()` 未登记例外，low）→ 实现层 **closed**（004 未落入文档；005 选择「契约 §13 登记例外」路径） |
| 代码审查 | 通过 `review_passed` | 001~005 复核闭环；新开 006（`req show`/`req split` 既有内联 `requirement_id` 过滤未纳入单点，op-003 自测表述过强，low）→ **登记闭环**（不改既有代码；纯等价重构转 stage-98/后续） |
| 正式验收 | 通过 `test_passed` | 必验 8/8；**Bug 数 0**；3 项非阻塞观察（`knowledge index.recentUpdates` category/title 空串、`flow log --last 0` 取默认 10、`stage status` 无参同短名多版本重复行，均为既有口径） |

## 六、REV 三分表（承接确认）

| REV | 级别 | 处置 | 落点 |
|-----|:--:|------|------|
| REV-97-001~005 | medium×2 / low×3 | **本阶段闭环**（计划修订 1 + 方案/实现层证据） | stage-97 |
| REV-97-006 | low | **登记闭环**：单点覆盖 = `req list + aggregate`；`req show`/`req split` 既有内联过滤零改动 | stage-97（重构转后续） |
| REV-95-008（锁等待超时归类 `INTERNAL_ERROR/internal/3` 契约边界） | low | **本阶段处置**：契约 §14.1（归类 + 消息特征 + `flow archive` save 异常 legacy 例外）+ `error-envelope` ⑩a（真实 `withFileLock` 超时）/⑩b（命令级 save 抛错 → `INTERNAL_ERROR`/3） | stage-97 |
| REV-95-009（并发 envelope `process.exit(2)` 退出机制不一致） | low | **本阶段处置（仅登记 + 错误矩阵复核；实现零改动）**；退出机制改造显式**转 stage-98** | stage-97 / **stage-98** |
| REV-96-008（`ops/op-003.md` 残留「17 阶段」陈旧计数） | low | **转出**：随 ops 归档订正为 21 阶段 | **stage-98** |
| REV-94-005 / 006 | low | **转出**：文档 / 入管核对 | **stage-98** |
| REV-92-006 / REV-94-007 | low | **台账保留**（非本阶段面 / 部署侧留存） | 台账 |

- **三分结论**：**处置 2（REV-95-008、REV-95-009）／显式转出 3（REV-94-005/006、REV-96-008）／台账保留 2（REV-92-006、REV-94-007）→ 零灭失成立**。
- 与 `plan.md §七`（修订 1）、`final-report §五` 逐行一致。

## 七、验收结果

- 必验 **8/8**：14 新出口单文档/首键/键序/空态；`req list` 两键一致性与无 N+1；`flow archive` 判据明细 + legacy 并存 + 零写盘；`archive <stage>` 三路径；计数 34/33/#1~#33；零回归/扩展优先；REV-95-008/009/97-006；门禁独立复跑。
- **Bug 数 0**（未新增 Bug 文件；`.openfeel/users/Liuary/bugs/cli/` 编号未占用）。
- 关键实证：本仓 `v1.2.2` `flow archive --dry-run --json` 判据拒绝 9 键固定序（`unfinishedStages` 含 stage-97/98），exit 1；REQ-001 `linkedStages` 4 项 + `progress={done:2,total:4}` 与 flow.json 一致；`archive --json` 内部异常以 `.openfeel/log` 占位文件独立复现 `INTERNAL_ERROR`/3。

## 八、计划回填与文档同步

- `.openfeel/plan/v1/v1.2.2/plan.md`：阶段执行进度表 **M51 = done（2026-10-17）** + 归档链接。
- `.openfeel/roadmap/v1.2.2.md`：进度表 **M51 / stage-97 = done**（含归档链接）；版本状态更新为 stage-95/96/97 已归档、stage-98 待执行。
- `.openfeel/plan/v1/stage-97/overview.md`：目标 / 依赖 / op 状态 / 门禁 / 归档链接回填。
- `.openfeel/plan/v1/stage-97/status.md`：状态 `archiving` + 责任 Agent `openfeel-archiver` + 全阶段状态记录（经 `openfeel stage set` + 表内追加）。
- manual：`cli/commands.md`（33/34 计数、新增「读命令 `--json` 全量补全与判据扩展」节、`req list` / `flow archive` 增量）、`core/flow-manager.md`（读命令 JSON 投影消费点）、`core/req.md`（`listLinkedStages` + `req list` 两键 + 已知边界）、`index.md`（模块树与维护规则回填）。
- 知识库：architecture **1** 条 / patterns **2** 条（去重最高相似度 **7.5%** ≪ 80%，均新增）；`kb/index.md` 分类计数（architecture 54→55 / patterns 201→203）、摘要行与最近更新同步。

## 九、遗留项

1. **REV-97-006 → stage-98 / 后续**：`req show`（stages）与 `req split` 仍有既有内联 `requirement_id` 过滤；纯等价重构改用 `listLinkedStages`，当前语义等价、非缺陷。
2. **REV-95-009 → stage-98**：并发 envelope `process.exit(2)` 与「置码返回」的退出机制统一（本阶段仅契约 §14.2 登记 + 错误矩阵复核，实现零改动）。
3. **REV-96-008 → stage-98**：`ops/op-003.md` 的「17 阶段」陈旧计数随 `ops/` 归档订正为 21 阶段（当前仅方案期规模论证语，非运行时读取）。
4. **`plan scheme list.draft` 跨阶段同名 opId 全局匹配风险 → stage-98**：已登记契约 §13.5；阶段域精确匹配属行为变更，转下阶段评估。
5. **已登记边界（不阻塞）**：`view list` 人类模式内部异常保持 exit 1（JSON 为 3）；`flow archive` 非 dry-run `save()` 异常保持 legacy stderr + exit 1（契约 §14.1 例外）；`knowledge index.recentUpdates` 的 `category/title` 解析受索引表头影响（人类输出同形）。
6. `--version` 仍为 `1.2.1`（版本收口归 stage-98）；不新增第三方依赖、不改 CI。

## 十、承接声明

- stage-98（文档与版本收口）按本阶段 **33 个成功出口 / 34 注册选项** 做 DSH 端到端契约验收，并订正 `--review-tier` 帮助文案、roadmap 文档面与 `ops/` 陈旧计数；承接 REV-95-009 退出机制改造评估与 `plan scheme list.draft` 阶段域匹配评估。
- 既有 19 个成功出口契约、13 个读命令的人类输出、phase 枚举 15 项、full/fast 转移行为与 `flow.json` 读写语义均保持兼容；本阶段能力均为扩展。
- 阶段最终 `phase=done` 由 Feel 经 CLI 推进；归档官未改源码 / 测试 / flow.json，未 commit / push。
