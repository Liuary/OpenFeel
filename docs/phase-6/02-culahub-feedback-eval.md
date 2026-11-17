# CulaHub 反馈逐条核实（v1.5.22）

> 对象：[01-culahub-usage-feedback.md](01-culahub-usage-feedback.md) 的 13 条反馈
> 方法：4 名只读核实员分工核对源码 + 主会话抽查关键证据（`aggregate.ts` / `dev-status.ts` / `flow-manager.ts` / `.gitignore` / `git ls-files`），全部结论以 `file:line` 为证
> 结论用词：**成立**（现象与原因都对）｜**部分成立**（现象真、归因或方案要改）｜**不成立**（误解）｜**已实现**（v1.5.22 已有）
> 日期：2026-11-17 ｜ 需求：REQ-040 ｜ 阶段：v1.5.23-stage-11

---

## 一、总表

| # | 反馈 | 核实结论 | 成本 | 建议 | 版本 |
|---|---|---|---|---|---|
| 1 | 每条 REQ 8 次调用 | 部分成立（下限 6–7；`claim` 可省） | M | 采纳，但先做 `add --claim --stage` 复合入参 | v1.5.24 |
| 2 | 门禁误伤 `git rm --cached` | 成立 | S–M | 采纳（附"索引操作后不自动提交"约束，需动 `flow-manager.ts:2168`） | v1.5.23 |
| 3 | `dev/current.md` 不更新 | 部分成立（自动块写的是 `dev_last.md`） | S–M | 改方案：不动 `current.md`，改 `recovery` 指向 + 删模板空承诺 | v1.5.24 |
| 4 | 运行态文件被跟踪 | 部分成立（真问题是 `.sync.json`，不是 guard-state） | S（最小）/ M（含清理与 `dev clean`） | 采纳，范围收窄 | v1.5.23 |
| 5 | docs-only 也要 review+verify | 成立 | M | 部分采纳：不做路径自动豁免，做需求级 `trivial` 显式标记 | v1.5.24 |
| 6 | `review_*` 的 `result` 是死字段 | 成立 | S | 采纳（删除），需兼容说明 | v1.5.23 |
| 7 | 阶段缺进度视图 | 成立 | S | 采纳，数据零成本可取 | v1.5.23 |
| 8 | cancelled/rejected 卡 done | 成立 | S | 采纳，但语义应为 `waive`（显式豁免）而非 `abandon` | v1.5.24 |
| 9 | `feel_next` 缺 goal | 成立（goal 属宿主侧） | S | 采纳，适配器注入 | v1.5.23 |
| 10 | 验收判据无一等公民 | 部分成立 | M | 分两步：先只读引用，再升级 done 门 | v1.5.25+ |
| 11 | 同一失败提示入 KB | 部分成立（数据源不支持） | S（但先要补失败原因） | 降级，先补 `attempt` 失败原因 | 候补 |
| 12 | 审查 `by` 需手填 | 部分成立（两条审查路径情况不同） | S | 采纳，`session.id` 回填 | v1.5.23 |
| 13 | 工具描述缺最小示例 | 成立 | S（低成本版）/ M（`feel_help`） | 采纳低成本版 | 候补 |

**一句话**：13 条里 **7 条完全成立**（#2 #5 #6 #7 #8 #9 #13）、**6 条部分成立**（#1 #3 #4 #10 #11 #12：现象真但归因或方案需要改）、0 条不成立、0 条已实现。性价比最高的是 #6 #7 #9 #12（纯 S），#2 #4 属"最小修复 S、做全 S–M"。

---

## 二、逐条核实

### 1. 每条 REQ 的固定开销

**现象核实**：部分成立——摩擦真实，数字要修正。当前最小合法序列是 **7 次**，`claim` 实际可省：

```
add → link → advance(scheduled) → advance(in_progress) → review → verify → advance(done)
```

- `add` 只支持 `title/--target-version/--priority/--workflow-mode`，不能顺带认领或关联（`src/commands/req.ts:145-151`）。
- 状态链是 `draft→scheduled→in_progress→done` 单向，不能跳步；`requirement-ops.ts:411-417`。
- `claim` 只做占用校验，没有 owner 门（`req.ts:418-436`）——属于选做，不是必需。
- `split` 产生的子需求直入 `scheduled`（`requirement-ops.ts:324,369`），能再省一次 advance。

**so**：反馈说"8 次"偏多，真实痛点仍存在（6–7 次里 4 次是纯记账）。

**可做性**：`complete` 可行但要复用两处单点，否则会长出第二套完成门判据：

- 需求 done 门：`requirementDoneBlocker`（`requirement-ops.ts:184-192`）
- 状态写入：`applyStatusChange`（`requirement-ops.ts:428-441`，done 走 `canCompleteRequirement` 单点）

**成本 M**｜**风险**：`complete` 必须复用 `applyStatusChange` 与 `canCompleteRequirement` 单点，否则会长出第二套完成判据——这正是它比看起来贵的原因。

**建议顺序**：先加 `add --claim --stage`（一次开单+认领+关联，成本 S），再考虑 `complete`。

---

### 2. 写入门禁误伤 `git rm --cached`

**现象核实**：成立，且能定位到确切分支。

- `git rm` / `git mv` 一律判为"写目标"（`dsh/lib/guard.js:2298`），`--cached` 在 `:2212` 只被当作普通 flag 丢弃，**代码里没有"仅改索引"这个概念**。
- 目标命中受保护名单（`guard.js:685-688`：`guard-state.json` / `sessions.json` / `.preflight.json` / `guard-audit.jsonl`）→ 在 `:3509-3514` 以 `reason=shell-protected` 拒绝，与相位无关。
- `OPENFEEL_SHELL_ALLOW` 已有（`:131` 解析、`:3353` 出口），但只挂在第 4 类 undecidable 出口且要求整条命令全等，**触达不到 protected deny**，所以对这条命令无效。
- 反证：`git update-index` 已在只读白名单（`:2049`），同类"纯索引"操作本来就能过；单条 `git rm --cached .openfeel/dev/current.md` 因落在 `.openfeel` 内走 allInternal（`:2842`）也会放行。

**可做性**：成本 S——把 `--cached` 判为只读语义即可。

**风险（必须配套）**：阶段 done 时 `flow-manager.ts:2168` 会 `git add -A` 自动提交，索引被移除后这次提交就**真的把受保护文件从仓库历史里删掉**（工作区还在）。所以放行 `--cached` 的同时要约束"索引操作后不触发自动提交"，或只允许走显式 `openfeel dev clean`。

---

### 3. `dev/current.md` 不会自动维护

**现象核实**：现象为真，但**归因错了**——自动交接根本不是写到 `current.md`。

- 自动同步写的是 `.openfeel/users/{user}/dev_last.md` 的受管块（`src/core/dev-status.ts:65-67`），该路径被 `.gitignore:5` 忽略、且未跟踪。
- `dev/current.md` 只在 `init` 生成一次模板（`src/core/init.ts:220-223`），按 v1.5.6 / stage-53 的设计它是**团队文件**：仅个人提交时更新、只写整体信息、近期 5 条记录。
- 触发点是 `flow advance` 在节点相位（`exec_running/review_passed/archiving/done`）或 30 分钟到期时自动跑 `syncDevStatus`（`src/commands/flow.ts:1378-1379`）；`feel_status`/`feel_next` 只读。
- 本仓实证：`dev_last.md` 的 AUTO 块 `last_sync = 2026-11-17T14:34`，而 `dev/current.md` 末次提交是 10-31 且内容停在 v1.5.6 —— **和 CulaHub 观察到的现象完全一致，但机制不同**。
- 真正的缺口：`current.md` 模板自述"每次提交自动归档最旧一条"（`src/core/templates.ts:25`），**这条没有实现**；同时 `feel_status.recovery` 也没把 `dev_last` 的受管块摆到显眼位置，导致新会话不知道该看哪。

**可做性**：成本 S–M，三条路选一：

1. 让 `current.md` 也吃同一份 AUTO 块（两处真源，不推荐）；
2. `recovery` 增加 `handoff: {path, block}` 指向 `dev_last` 受管块（S，推荐）；
3. 由 CLI 在 `current.md` 上做轮换（补上模板承诺的实现，M）。

**风险**：不做 1 的话，"跨会话恢复靠 `current.md`"这个预期需要同步改文档——否则下个项目还会撞同样的墙。

---

### 4. 运行态文件被 git 跟踪

**现象核实**：部分成立，**范围比反馈说的小**，但确实有真问题。

- 反馈点名的四个受保护文件（`guard-state.json` / `sessions.json` / `.preflight.json` / `guard-audit.jsonl`）本仓**已 ignore 且确实未跟踪**（`.gitignore:14-20`）。
- 本仓 `git ls-files .openfeel/dev` 实际列出：`.sync.json`、`current.md`、`decisions.md`、`dev_core.md`、`task_claim.md`、`todo-current.md`、`current_archive/*`。
- **真问题**：`.openfeel/dev/.sync.json` **不在 `.gitignore`**，而它每次 `advance` 都写；阶段归档的 `git add -A`（`flow-manager.ts:2168`）会把它扫进提交 → 每次归档都带一条"无意义变更"。
- `current_archive/*` 是 v1.5.6 之前的旧轮换产物，属于历史包袱。
- `init` 不写 `.gitignore`、不碰索引（`src/core/init.ts` 全文）；全仓**没有** `health --fix-index`。

**可做性**：成本 S，三件事：① `.gitignore` 补 `.sync.json`；② 新项目 init 保证运行态不入索引；③ 提供一次性的 `openfeel dev clean`（受保护文件走"索引移除"而非"文件删除"）——这条正好和 #2 是同一个开关的两面。

---

### 5. docs-only 也要 review+verify

**现象核实**：成立，且比反馈描述的更"硬"。

- `review_tier` 只裁相位：full 不裁 / lean 裁 `scheme_review` / skip 再裁 `plan_review`，**三档恒保留 `review_pending` 与 test/archiving**（`src/core/pipeline-schema.ts:86-90`）。
- 它是 `flow advance` **每次调用的入参**，缺省恒 full，不落到 `status.md` 或阶段字段（`src/commands/flow.ts:1005,1044`；`flow-manager.ts:1878`）。
- 需求完成门**完全不看** `workflow_mode` / `review_tier`（`requirement-ops.ts:180,184-192`）——所以改一行文档照样要 review+verify。
- 全仓没有"改动文件清单"可用，做 trivial 判定需要新增 git 变更采集。

**可做性**：成本 M。不建议按路径自动豁免（`docs/**` 豁免会让"文档即契约"的项目失去审查），建议做**需求级显式标记**：`req set --trivial --reason=...` 或 `req review --trivial`，审计记 `trivial`，归档摘要标注，代码改动仍强制。

**风险**：任何放宽都要在 `requirementDoneBlocker` 上开口子，等于动"完成必审验"的承诺面——必须写在 CHANGELOG 的 Breaking 段。

---

### 6. `review_*` 的 `result` 是死字段

**现象核实**：成立，证据链完整。

- `dsh/lib/tools/index.js:503` 的描述原文就是"未使用，保留占位"。
- `review_add` 分支从不读 `args.result`（同文件 `:574-589`）。
- CLI `flow review add` 只有 `--op/--stage/--title/--auto-fix/--blocking`，**没有 `--result`**（`src/commands/flow.ts:1659-1667`）。
- `ReviewItem` 结构里根本没有该字段（`flow-manager.ts:75-97`）。

**可做性**：成本 S，直接删。

**风险**：删掉后，原先"传了被静默忽略"的调用会变成"参数被拒"，需要一条兼容说明（CHANGELOG + 工具描述）。**不建议**改成"由 result 驱动 open/closed"——那会与 `review_accept` 的职责重叠，产生第二套关闭判据。

---

### 7. 阶段缺进度视图

**现象核实**：成立。

- `stage status` 只输出 `status.md` 字段（`src/commands/stage.ts:227`）、tasks（`:242`）、blockedBy（`:254`）；JSON 也只有 `{stageId,statusPath,fields,tasks,blockedBy}`（`:435-445`）。
- 反馈要的三样数据**都能零成本取到**：`stageRequirementIds`（`src/core/req/aggregate.ts:22,62`）、需求的 `status/claimed_at/updated_at`（`src/core/req/types.ts:87-91`）、`findPhaseEnteredAtMs`（`src/core/phase-entered.ts:92`，`process-health` 已在用）。

**可做性**：成本 S，直接加字段 + 人读行。

**风险**：`status.md` 与 `flow.json` 两源并行读会有"两套判断"，实现时明确以 `flow.json` 为权威（`status.md` 只取人写的备注类字段）。

---

### 8. cancelled/rejected 卡住阶段 done

**现象核实**：成立，且是**显式设计**而非遗漏。

- `describeStageDoneGate` 里 `if (!req || req.status !== 'done')` 即计入未完成，注释明写"cancelled / rejected 一律视为未完成——保守口径"（`flow-manager.ts:1927-1932`）。
- 该门**无 force 逃生口**（v1.5.8 起）。
- 现有等价手段只有解绑：`req link --stage X --requirement R --unlink`（`requirement-ops.ts:737-747`）；而 `req set --status cancelled` 保留关联，仍计数；`release-check` / `rollover` 都不解绑。

**可做性**：成本 S，但**语义要改**。反馈建议的 `abandon` 与 `cancelled` 高度重叠；更有价值的是 `waive`（主动豁免，记 `--reason --by --at`），阶段 done 门把"已 waive"视为已处置。这样审计里能回答"这单为什么不算完成、谁决定的"。

**风险**：直接把终态算作完成会掩盖真实放弃的工作；必须是显式记录 + 归档摘要展示。

---

### 9. `feel_next` 缺 goal / round

**现象核实**：成立，但**归属搞错了**。

- `flow next --json` 只有 11 个字段：`stage/phase/phaseLabel/responsibleAgent/workflowMode/reviewTier/effectiveReviewTier/legalNextPhases/suggestedCommand/guards/blockingReviews`（`src/commands/flow.ts:310-322`）。
- `feel_next` 返回 `planNextStep`（`dsh/lib/adapters/dashboard.js:414-434`）+ `recovery`/`dispatch`/`observability`，无 goal。
- OpenFeel 侧根本没有 goal 概念（全仓 goal 只出现在模板/文档和 `dispatch.js:17` 的占位符）；goal 是 DSH 宿主的能力（`dsh/lib/index.js:106` 提到 `dsh-tool-goal`）。

**可做性**：成本 S，但**只能在适配器侧**做（`dsh/lib/`）——CLI 侧无法自证。注入后 `feel_next` 顶层给 `goal: {id, round, maxRounds}`，取不到时省略而不是给 null（保持旧契约的字段存在性）。

---

### 10. 验收判据没有一等公民

**现象核实**：部分成立——有"半个载体"，没有注册表。

- `evidence` 是可选自由字符串（`src/core/req/types.ts:66`）；阶段验证记录只有 `result/kind/by/at/note/evidence` 六项且覆盖式写入（`flow-manager.ts:1986`）。
- done 硬门只校验 `result==='pass'`（`flow-manager.ts:1934`），**从不读 note/evidence 内容**；evidence 唯一被消费的地方是归档摘要的字符串渲染（`src/core/archive/merge.ts:184`）——即"记了但没人验"。
- `StageData` 没有 `criteria` 字段（`flow-manager.ts:149`），`DashboardData` 没有验收块（`src/core/dashboard/aggregate.ts:130`），`schemas/` 下没有 criteria schema。

**可做性**：成本 M，建议分两步走：

1. **只读引用**（S）：`stage verify --criteria a1,a2 --criteria-file path`，把判据 id 与结论写进 note/evidence 的结构化尾部，不改门禁；
2. **升级 done 门**（M）：`criteria` 注册表成为 `describeStageDoneGate` 的可选第二判据（`required-criteria 全 pass`），必须同时支持 `required/optional`，否则存量阶段历史数据会被新门一律拒绝。

**风险**：加 `flow.json` 一等字段要连带迁移、归档分片、merge 渲染、4 个适配器与 fixture 快照测试——最易碎的改动类型。另外 A1–A16 是 CulaHub 私有清单，**注册表落点应是独立 `.openfeel/criteria.json` 而非 `flow.json`**，否则每个项目都要背一份业务判据。

---

### 11. 同一失败提示入 KB

**现象核实**：部分成立，但**数据源不支持这个功能**。

- 失败有记录，但 `attempt_fail_retry` / `attempt_fail_exhausted` 的 detail 只有 `opId/attempts/maxAttempts`，**没有失败原因**（`flow-manager.ts:3152,3173`）。
- `flow.json.log` 只保留最近 200 条（`flow-manager.ts:108,3379`），跨阶段的历史会被截断。
- `metrics.json` **不能**用来统计失败：`failedRuns` 有字段（`src/core/metrics.ts:111`），但全仓唯一 `recordRun` 调用点传的是 `'success'`（`src/commands/flow.ts:1332`）——见第四节 A。
- KB 去重可复用：`findSimilarEntries`（`src/utils/kb-dedup.ts:160`，Jaccard 0.8）已由 CLI `knowledge dedup` 与 `feel_kb dedup` 暴露（`dsh/lib/tools/index.js:1308`）。

**可做性**：提示本身 S，但**没有可比的"同一失败"**——先给 `attempt` 补 `reason` 字段并落一条失败摘要，才谈得上"≥2 次同因"。

**建议**：降为候补。先做"op 失败两次时在 `feel_next` 附一行 `consider: feel_kb add`"，不做自动同因识别。

---

### 12. 审查 `by` 需手填

**现象核实**：部分成立，**两条审查路径情况不同**——反馈没说清是哪条。

- `req review` / `req verify` / `stage verify` **强制 `--by` 且无缺省**（`src/commands/req.ts:691,744`；`stage.ts:665`；`dsh/lib/tools/index.js:744,1033,1050`）→ 反馈说的"手填"在这里成立。
- `flow review add` **没有 by 入口**：CLI 只有 `--op/--stage/--title/--auto-fix/--blocking`（`src/commands/flow.ts:1659-1667`）；写入侧 `filed_by` 取自程序化入参 `filedBy`、缺省 `'cli'`（`src/core/view/entry.ts:102,192`），op 路径写死 `'openfeel-reviewer'`（`:64`）→ 不是"缺缺省值"，是"缺分发入口"。
- `independent` 是显式 flag（`req.ts:721`，落库 boolean，`types.ts:47`），没有自动判定。
- 可自动回填的现成上下文：会话 id（`dsh/lib/adapters/sessions.js:66`，`tools/index.js:366` 已持有 `exec.agent.session.id`）；**没有** agent 名或 dispatch id。

**可做性**：成本 S（只做 req/stage verify 的 `by` 缺省 = `session-id` 短哈希 + 可选 `--by` 覆盖）；若要连 `flow review add` 一起补 `by` 输入，成本升到 M（要动 ReviewItem 写入结构）。

---

### 13. 工具描述缺最小示例

**现象核实**：成立。

- `dsh/lib/tools/index.js` 里"示例/例：/例如/e.g."**零命中**，全是长 prose（`feel_req` 描述最长，`:866`）。
- CLI 侧只有 Commander 原生 `--help` / `help <cmd>`（`bin/openfeel.js:14`，`src/cli/index.ts:135` 只换文案），全仓只有 `src/commands/view.ts:18` 用过 `addHelpText('after')`。
- REPL 的 `help/?` 只列顶层命令名+描述（`src/cli/repl.ts:65-72`）。
- 13 个 `feel_*` 工具里没有 `feel_help`（`:332-1566`）。

**可做性**：低成本版 S（在 `feel_next` 的 `suggestedCommand` 旁附一条"最小示例"，只覆盖当相位最常用的 1–2 个工具）；完整 `feel_help <topic>` 是 M，且需要跟 15 相位 / 命令树同步维护。

**风险**：示例漏更新比没有更糟——所以先做"随相位生成的单条示例"（数据源单一，不会漂）。

---

## 三、反馈里需要修正的三处认知

1. **`dev/current.md` 不是自动交接文件**。自动块在 `.openfeel/users/{user}/dev_last.md`，且它在工作（本仓实证 `last_sync=2026-11-17T14:34`）。CulaHub 看到的"模板原样"是真实现象，但根因是"看错了文件"+"模板里有一条没实现的承诺"（`templates.ts:25`）。所以第 3 条的正确修法是**让恢复路径指向受管块**，不是让 `current.md` 自动写。
2. **"8 次调用"实际下限是 6–7 次**，`claim` 可省。#1 的价值不在于"少 1 次"，而在于把"开单+认领+关联"合成 1 次、把"审验+收口"合成 1 次。
3. **"如果只改三件"的排序建议调整**。按真实成本：#4 的最小版（S，补一行 ignore）与 #2 的 guard 侧（S）比 #1（M）便宜得多，且 #3 的方案要换。**性价比前三应是「#4 最小版 / #2 guard 侧 / #7」——但前两项是同一个开关的两面，应合批做**。

---

## 四、顺带发现的四个问题（反馈未提及）

### A. `metrics.json` 的失败统计恒为 0

`src/core/metrics.ts:111` 有 `failedRuns` 计数，但全仓唯一 `recordRun` 调用点（`src/commands/flow.ts:1332`）传的是 `'success'`，`src/` 内没有任何 `'failure'` 实参。→ 任何基于 metrics 的失败率/健康度都是**静默误导**（读出来是 0，不是空）。修复 S。

### B. 聚合回写缺少复检（防御性缺口；当前调用点下不可达）

`flow-manager.ts:1904` 在阶段 done 分支调 `syncRequirementStatus`，而 `aggregate.ts:141-149` 对 `AUTO_DONE_PRECONDITION = ['scheduled','in_progress']` 的需求**直接写 `status='done'`**，不复查 `canCompleteRequirement`（审验门在 `requirement-ops.ts:428-441`）。

初看像"两条互斥的完成路径"，实测不成立：进入阶段 done 的硬门已要求关联需求**全部 done**（`flow-manager.ts:1818-1827`，无 force 逃生口）；正常推进走到 `:1904` 时，命中的需求都已是 done，写侧是 no-op。`link` 也不触发聚合回写（触发点只有 advance 的 done 分支与 reset 写入后，`aggregate.ts:133`）。

所以这是**冗余写侧 + 不变量未在写点自证**：一旦将来放宽阶段门，或新增"向已完成阶段补挂需求"的入口，就会静默产出未审验的 done。建议（S，非阻塞）：写侧复用 `canCompleteRequirement`，不满足则跳过并让 `feel_status` 报一行；或至少在注释里写明"此分支依赖阶段门已保证全部 done"。

### C. `.openfeel/dev/.sync.json` 未 ignore，且会被自动 `git add -A` 扫入

`.gitignore` 里 `sessions.json` / `.preflight.json` / `guard-state.json` / `guard-audit.jsonl` 都在，唯独 `.sync.json` 漏了（`.gitignore:14-20`）。它每次 advance 都写，阶段归档的 `git add -A`（`flow-manager.ts:2168`）会把它带进提交。这正是 CulaHub 说的"状态常年脏"在本仓的复现，也解释了为什么 `git status` 里长期挂着一个 `.sync.json`。修复 S。

### D. `feel_req` 的工具描述把 done 门说过时了

`dsh/lib/tools/index.js:866`（以及随包的系统提示段）写的是"done 门：非 general 需求须**全部关联阶段 done**"；但实际判据是**关联阶段相位已进入 `exec_running` 及之后**即放行（`requirement-ops.ts:174-192`，`COMPLETION_READY_PHASES`），`allLinkedStagesDone` 只作聚合投影、已与完成门解耦（`:181`）。

实证：本次 REQ-040 就是在阶段仍 `exec_running` 时正常收口的，一次通过。

影响：使用者会以为"必须先把阶段推到 done 才能收需求"，于是要么拖着不收（CulaHub 那种"单阶段 + 46 条 REQ"的形态最容易这样），要么误判流程卡住。修复 S：改工具描述 + `dsh/lib/surface/prompt.js` + agents-md 里的同款表述。

---

## 五、建议的版本计划

### v1.5.23「低风险速赢」（8 项：6 项纯 S + 2 项需跨文件）

| 顺序 | 项 | 成本 | 改动面 | 验收 |
|---|---|---|---|---|
| 1a | C + #4 最小：`.gitignore` 补 `.openfeel/dev/.sync.json` | S | `.gitignore` | 归档提交不再带 `.sync.json` |
| 1b | #4 完整：`init` 保证运行态不入索引 + `openfeel dev clean` + 处置已跟踪的 `current_archive/*`（20 个）与 legacy `decisions/dev_core/task_claim/todo-current.md`（本仓共 26 个受跟踪文件） | M | `src/core/init.ts` / `src/commands/dev.ts` / 文档 | `git ls-files .openfeel/dev` 只剩 `current.md`；`dev clean` 对受保护文件走"索引移除"而非删文件 |
| 2 | #2：`git rm --cached` 判只读 + 索引操作后不自动提交 | S–M | `dsh/lib/guard.js` + `src/core/flow-manager.ts:2168`（自动 `git add -A` 需状态位/分支） | 单测：受保护文件带 `--cached` 放行、不带仍拒绝；`--cached` 之后不产生自动提交 |
| 3 | #7：`stage status` 加需求完成度 / 最老 in_progress / 最近相位变更 | S | `src/commands/stage.ts` | JSON 新增字段（向后兼容）+ 人读行 |
| 4 | #9：`feel_next` 注入 `goal` | S | `dsh/lib/tools/index.js`、`adapters/` | 有 goal 时出现、无 goal 时省略（不写 null） |
| 5 | #12：`by` 缺省 = session 标识 | S | `dsh/lib/tools/index.js` | `feel_req review` 不传 `by` 也能记（CLI 的 `--by` 是 `requiredOption`，是否一并放宽另行决定） |
| 6 | #6：删除 `result` 死字段 | S | `dsh/lib/tools/index.js` + 文档 | 传 `result` 报参数错误；CHANGELOG 记 Breaking |
| 7 | D：`feel_req` done 门描述改成"关联阶段已进入 exec_running 及之后" | S | `dsh/lib/tools/index.js` + `surface/prompt.js` + agents-md | 与 `requirement-ops.ts:186` 一致；用"阶段仍 exec_running 也能收需求"的用例断言 |

> 口径提醒：1b 与 2 是本节唯一两处跨文件/带状态位的改动。若要求"一轮交付"，可先做 1a + 2 的 guard 部分（真 S），把 `dev clean`、历史索引清理与自动提交约束放进下一轮——否则"一轮全 S"的口径会在第 1 项就破。

### v1.5.24「结构性改进」（4 条，M 成本，需要设计决策）

#1 `add --claim --stage` + `req complete`（必须复用 `applyStatusChange` / `canCompleteRequirement` 单点）｜#3 交接摘要（`recovery.handoff` 指向 `dev_last` 受管块 + 删 `templates.ts:25` 的空承诺）｜#5 需求级 `trivial` 标记｜#8 `waive`（显式豁免 + 归档可见）

### 候补 / 需先说清楚

- **#10 criteria 注册表**：分两步（只读引用 → 升级 done 门），且应落在 `.openfeel/criteria.json`。建议单独立一个版本，因为它会碰归档分片与 4 个适配器。
- **#11 KB 提示**：先给 `attempt` 补失败原因（否则"同一失败"无从判断），再谈提示。
- **#13 `feel_help`**：先做"随相位生成的单条示例"（S），完整 topic 表留到有稳定命令树之后。

---

## 六、证据索引

| 主题 | 证据 |
|---|---|
| req 入参与状态链 | `src/commands/req.ts:145-151`、`src/core/req/requirement-ops.ts:411-417` |
| 需求 done 门 | `src/core/req/requirement-ops.ts:184-192` |
| 需求状态写入单点 | `src/core/req/requirement-ops.ts:428-441`（`canCompleteRequirement` 于 `:434-435`） |
| 完成门判据（相位 + 审验） | `src/core/req/requirement-ops.ts:174-192`（`COMPLETION_READY_PHASES` 于 `:186`） |
| done 门描述过时 | `dsh/lib/tools/index.js:866` |
| 阶段 done 门（终态计未完成） | `src/core/flow-manager.ts:1927-1934` |
| 阶段 done 的入口硬门 | `src/core/flow-manager.ts:1818-1827` |
| 聚合回写（done 分支） | `src/core/flow-manager.ts:1904`、`src/core/req/aggregate.ts:141-149,133` |
| 聚合自动提交 | `src/core/flow-manager.ts:2168` |
| 门禁 git rm / --cached | `dsh/lib/guard.js:2298,2212,685-688,3509-3514` |
| 门禁白名单出口 | `dsh/lib/guard.js:131,3353,2049,2842` |
| dev sync 写 dev_last | `src/core/dev-status.ts:65-67`、`src/core/init.ts:220-223`、`src/core/templates.ts:25` |
| sync 触发点 | `src/commands/flow.ts:1378-1379` |
| 运行态文件跟踪 | `.gitignore:14-20`、`git ls-files .openfeel/dev` |
| review_tier 裁剪 | `src/core/pipeline-schema.ts:86-90`、`src/commands/flow.ts:1005,1044`、`src/core/flow-manager.ts:1878` |
| review result 死字段 | `dsh/lib/tools/index.js:503,574-589`、`src/commands/flow.ts:1659-1667`、`src/core/flow-manager.ts:75-97` |
| stage status 字段 | `src/commands/stage.ts:227,242,254,435-445` |
| 可取聚合数据 | `src/core/req/aggregate.ts:22,62`、`src/core/req/types.ts:79,87-91`、`src/core/phase-entered.ts:92` |
| flow next 字段 | `src/commands/flow.ts:310-322` |
| goal 属宿主 | `dsh/lib/index.js:106`（`dsh-tool-goal` 同手法；不属于 OpenFeel 状态） |
| 验证记录结构 | `src/core/flow-manager.ts:1986,1934,149`、`src/core/archive/merge.ts:184` |
| metrics 失败统计 | `src/core/metrics.ts:111`、`src/commands/flow.ts:1332` |
| op 失败 detail | `src/core/flow-manager.ts:3152,3173,108,3379` |
| kb 去重 | `src/utils/kb-dedup.ts:160`、`dsh/lib/tools/index.js:1308` |
| 审查 by / filed_by | `src/commands/req.ts:691,744,721`、`src/commands/stage.ts:665`、`src/core/view/entry.ts:64,192`、`dsh/lib/adapters/sessions.js:66` |
| 帮助能力 | `bin/openfeel.js:14`、`src/cli/index.ts:135`、`src/cli/repl.ts:65-72` |
