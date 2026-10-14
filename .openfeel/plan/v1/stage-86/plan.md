# v1.2.1-stage-86 计划 — 可观测性改造（主题六）

- **阶段**：`v1.2.1-stage-86`（七主题之六 · 可观测性改造）
- **依赖**：**无**（v1.2.1 首阶段；**度量前置**——设计 §8「本批提速举措若无埋点则无法度量」）
- **优先级**：P0
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-15 ｜ **修订轮**：初稿
- **基线**：**HEAD `11f0bd2`**（全表实测；文中行号均以该基线为准）
- **定位**：为 v1.2.1 后续七阶段建立**度量基线**——① 接线 `recordRun`（死代码 → `flow metrics` 非空）；② CLI 运行日志补 `duration_ms`（done 行）/`project`/`session_id` + **done 行必写加固**（异常路径）；③ op 级 phase 埋点（flow.json op **可选**时间字段，读侧宽容不注入）；④ 活跃/闲置语义显式标注（phase 转换标注是否跨会话恢复，替代分析层 >20min 启发式）。
- **范围**：`src/core/metrics.ts` / `src/commands/flow.ts` / `src/core/runtime-log.ts` / `src/core/session.ts`（**建议新增**小模块，方案期定稿）/ `src/cli/index.ts` / `bin/openfeel.js` / `src/core/flow-manager.ts`（最小追加）/ `src/core/i18n-data/{zh-CN,en}.ts` / `test/core/{metrics,runtime-log,flow-manager}.test.ts` / `test/commands/flow.test.ts`。
- **边界**：不改 phase 枚举（15）/ `advanceAccepted` / `checkpoint_mapping`；不建 dashboard、不做可视化；埋点字段一律**可选 + 读侧宽容**（存量 `load→save` 零注入）；不改四类日志文件布局（kb #四类日志边界）；不新增第三方依赖；不破坏 `--dry-run` 字节级零写盘契约；不改 `.openfeel/pipeline.yaml`；**metrics 接线落命令层**（`src/core/metrics.ts:10` 已 import `flow-manager` —— core 反向接线成 import 环）；manual 更新归归档轮（归档官）；本阶段**不改版本号**（归 stage-93）。

## KB 检索（`openfeel-check-kb`）

已加载 `.openfeel/kb/index.md`。**高度相关条目**：

- `kb/architecture.md #四类日志边界：CLI 进程运行日志 / 工作区审计 / 流水线状态审计 / 部署更新记录`（:650）→ 只补「CLI 进程运行日志」行内字段；四类载体边界不变。
- `kb/patterns.md #CLI 输出编码自适应「单一咽喉」模式` + `#库侧默认 no-op + 进程入口 install 的副作用隔离模式` → 新增运行日志钩子复用同款隔离（模块默认 no-op、仅 bin install、**不设 VITEST/env 守卫**）。
- `kb/patterns.md #顶层可选字段「读侧宽容不注入」模式` → op 时间字段 / 审计 detail 新增键的落法（不 load 补齐）。
- `kb/troubleshooting.md #可选字段「读侧补齐」的序列化副作用` + `#flow.json 内容增量核验必含 meta.revision/meta.updated` → 零注入断言与验收核验点口径。
- `kb/patterns.md #零回归取证范式（补丁前/后归一化快照 diff 空 + golden 内联 + 正控防假绿）` → 热点（`flow-manager` / `runtime-log`）改造取证。
- `kb/troubleshooting.md #默认开启写真实用户目录的副作用防护（VITEST 继承 + OPENFEEL_LOG=0）` → 新增钩子不得污染测试进程与真实 `~/.openfeel`。
- `kb/patterns.md #审计日志 action 命名与双轨语义模式` → 审计 detail 追加键的命名口径（不改既有 action / 键）。
- `kb/troubleshooting.md #Claude Code 实机验证方法（隔离 config + settings.json 派发 subagent）` → Q1 的 harness env 候选名**须实机实测**（不臆造）。
- `kb/patterns.md #全量审查的发现分类与流转裁定`（子条款：跨阶段承接 REV 与处置表）→ 本计划 §七。
- **无**「session_id 采集链 / phase→agent 归属 / done 行必写」既有条目 → 归档轮按既有分类补沉。

## 一、背景与实测证据（基线 HEAD `11f0bd2`）

| # | 事实（实测复核） | 位置 | 结论 |
|:-:|------|------|------|
| A1 | `recordRun` 定义于 `src/core/metrics.ts:79`；全仓仅自身命中（**零调用点 ＝ 死代码**）；`flow metrics`（`src/commands/flow.ts:374`）经 `MetricsStore.getInstance().load()` → `getSummaryData()` 读取；本仓 `.openfeel/metrics.json` **不存在** | 实测 | 接线须补「调用点 + agent 归属口径 + duration 口径」；目标 = `flow metrics` 输出真实数据（非空） |
| A1b | `src/core/metrics.ts:10` `import { normalizeAgentName } from './flow-manager.js'` | 实测 | **core 反向接线必成环** → `recordRun` 调用点落**命令层**（`src/commands/flow.ts`），core 层不动 |
| A2 | 运行日志行格式 `[ISO][LEVEL][pid] message`（`src/core/runtime-log.ts:108`）；**无** duration/project/session 字段；调用点 3 处：`src/cli/index.ts:186`（cli error）/ `:197`（cli start）/ `:205`（cli done exit=） | 实测 | `duration_ms` 落 done 行（`:205`）；`project`/`session_id` 须采集并注入（start/done 对称） |
| A2b | 行格式断言在位：`test/core/runtime-log.test.ts:60` 正则 `/^\[…\]\[INFO\]\[\d+\] cli start: …\n$/`（**结尾锚定**） | 实测 | 字段追加须**同批修订该断言**（§六 R-86-6） |
| A3 | `bin/openfeel.js` 进程入口 `installRuntimeLog()`（argv 就绪后安装 = 单一咽喉） | 实测 | 起始时间戳 / 钩子安装点 = bin（复用同款隔离，方案期定稿口径） |
| A4 | CLI 日志 **578/5371 条 start 无 done（10.8% 丢失）**——耗时永久丢失（进程被杀 / 中断 / 崩溃） | 分析 §7.3 / §8.2#6 | `duration_ms` 生效前置 = **done 行必写加固**（异常路径亦落行） |
| A5 | op 结构实测（本仓 flow.json 样例）= `{title,state,assignee,attempts,max_attempts,checkpoints}`，**无时间戳字段**；`assignee` 实测 = `openfeel-executor` | 实测 | op 级埋点 = 新增**可选**时间字段（读侧宽容不注入——kb #顶层可选字段模式） |
| A6 | `exec_running` 为**阶段级** phase（n=104 / 86 stage ≈1.2，不区分 op）；op state 值域 `pending/executing/done/failed/draft`，全仓**无赋 `'executing'` 的写入点**（仅比较） | 分析 §8.2#4 + 实测 | 「exec_running 细分到 op」须 op 级时间信号 → 落 `recordAttempt`（唯一状态变更点） |
| A7 | 活跃/闲置靠「phase 段 >20min」启发式（在分析脚本层，非 CLI） | 分析 §8.3#4 | 替代 = phase 转换**显式标注**是否跨会话恢复（依赖 A2 的 session 标识） |
| A8 | 上游账目：flow.json `reviews: 0`（CLI `ReviewItem[]` 台账空，非人工审查台账——承接口径见 §七）/ `requirements` 字段缺省（0 条）/ `archived_versions: 9`；`stages` **16**（8 活跃 + 8 新注册 v1.2.1）；本仓 `config.yaml`（:31）`defaults.workflow_mode: full` | 实测 | 承接 REV **空账**（§七）；本阶段以 `full` 运行（大计划裁定 B） |
| A9 | 门禁基线：**70 文件 / 1557 用例**（stage-85 登记值）；`lint i18n` **911** | 大计划 §基线 | 本阶段新增用例与 i18n 键 → 门禁显式登记**新基线** |

---

## 二、目标语义与不变量

| 维度 | 内容 |
|------|------|
| 度量接线 | `recordRun(agentName, durationMs, result, retries)` **至少一处真实调用**（phase 退出窗口）→ `.openfeel/metrics.json` 非空、`flow metrics` 展示真实数据（run 级耗时 + agent 归属） |
| 日志字段 | start/done 对称落 `project` / `session_id`；done 行落 `duration_ms`；异常 / 中断路径 done **必写**（一次性旗标防双写） |
| op 埋点 | op **可选**时间字段（`recordAttempt` 单点写）→ `exec_running` 可按 op 分段 |
| 语义标注 | `advance_stage_phase` 审计 detail 追加**可选** `session_id` / `resumed`（跨会话恢复标注） |
| 会话标识 | 三级链（env → 续接文件 → 进程 UUID），来源以值前缀显式标注（`env:` / `project:` / `proc:`） |

**不变量**：

1. **可选字段 + 读侧宽容**：所有新增 flow.json 字段（op 时间戳 / 审计 detail 键）**不 load 补齐**；存量文件 `load→save` **零注入**（字节级断言——kb #顶层可选字段模式 / #读侧补齐序列化副作用）。
2. **四类日志边界不变**：只改「CLI 进程运行日志」行内字段；工作区审计 / `flow.json.log` / `update_infos` 布局零变。
3. **单一咽喉隔离**：新增钩子（exit/session）仅在 `bin/openfeel.js` 安装；库侧默认 no-op；**不设 VITEST/env 守卫**；测试面与真实 `~/.openfeel` 零污染（kb 先例）。
4. **`--dry-run` 字节级零写盘**：`flow advance --dry-run` 不写 flow.json、**不写 metrics.json**、不触发任何新增副作用（接线须置于 dry-run 分支之外）。
5. **零回归 + 有意变更显式登记**：phase 枚举 15 / `advanceAccepted` / 既有 `--json` 契约逐字不变；**有意变更**逐条登记——① `src/cli/index.ts:196` 注释口径「--help/--version 不记 done」→ 经 exit 兜底后记 done；② `flow metrics` 人类输出追加口径注记行；③ `test/core/runtime-log.test.ts:60` 行格式断言同批修订。
6. **不改版本号**：`--version` 保持 `1.2.0`（版本收口归 stage-93）。

---

## 三、变更点清单（编号 T）

### T1 — 接线 `recordRun`（命令层；`flow metrics` 非空）

- **落点**（Q2 建议，方案期定稿）：`src/commands/flow.ts` advance 命令逐步推进循环内——`mgr.advanceStagePhase(stageArg, next, 'cli')` 成功 + `mgr.save()` **之后**，对**刚退出**的 `fromPhase` 记一条 run；`--dry-run` 分支已提前 return（天然排除）。
- **归属口径**：`PHASE_AGENT_MAP` **单点常量**（建议置 `src/core/metrics.ts` 导出，方案期定稿）：`plan_pending`/`plan_review`→`openfeel-planner`；`scheme_pending`/`scheme_review`→`openfeel-schemer`；`exec_running`→`openfeel-executor`；`review_pending`/`review_failed`→`openfeel-reviewer`；`test_pending`/`test_failed`→`openfeel-feel-tester`；`archiving`→`openfeel-archiver`；其余（`*_passed` / `done` / meta）**跳过不记**。
- **duration 口径**：被退出 phase 的**窗口耗时** = now − 「进入该 phase 的转换时间」（回扫 `mgr` 内存 `log` 中该 stage 最近一条 `register_stage` / `advance_stage_phase` / `reset_stage_phase` 条目 `time`）；**无基线 → 跳过并计数**（不写 0 值污染 avg）。
- **参数口径**：`result = 'success'`；`retries` 缺省 0（不挪用 `pipeline.retry`，防语义混淆——方案期可裁定）。
- **写盘**：`recordRun` 后命令层 `MetricsStore.getInstance().save()`（低并发非关键路径，既有单例按 cwd 缓存）。
- **`flow metrics` 口径注记**（裁定 N / R-8 缓解）：`summary()` 追加一行说明「耗时口径 = phase 窗口（含跨会话闲置/等待）」，i18n 双表成对（+1 键）；`--json` 契约**只增不改**。
- **未接入口登记（已知边界）**：`flow stage reset` / `flow attempt` 自动改道 / deprecated `advancePhase` 本阶段**不接**（口径一致但记录遗漏，登记留痕）。
- **单测**（`test/commands/flow.test.ts` + `test/core/metrics.test.ts`）：advance 实跑 → metrics.json 生成且非空；`flow metrics --json` 非空；无归属 phase 不记；无基线不记；`--dry-run` 零写盘（metrics.json 不生成）。

### T2 — CLI 日志 3 字段 + **done 行必写加固**

- **字段口径**（A2）：
  - `duration_ms`：进程起始时间戳在 `installRuntimeLog()`（bin 单一咽喉）内记录；done 行 = `Date.now() − 起始`（**口径登记**：含模块解析/加载，不含 node bootstrap）。
  - `project`：`process.cwd()`（含 `--log-file` 覆盖场景）。
  - `session_id`：**三级链**（Q1 建议，§四）——① harness env 探测 → ② 会话续接文件 → ③ 进程 UUID 兜底；来源以值前缀标注（`env:` / `project:` / `proc:`）。
- **行格式建议（方案期定稿）**：**前缀不变**（`[ISO][LEVEL][pid]`，保老解析器兼容）+ **方括号键值对后缀**（空格路径安全）：done 行形如 `cli done exit=0 [duration_ms=123] [project=<cwd>] [session=<id>]`；start 行落 `[project=…] [session=…]`（对称）。
- **done 必写加固**（A4；578/5371 丢失）：`process.on('exit')` **单源兜底**（覆盖 `process.exit` / 正常结束 / 未捕获异常退出）+ `SIGINT` / `SIGTERM` 监听（写 `exit=130/143` 后自行退出，保中断语义）；**一次性旗标**防双写（`:205` 正常路径已写则不重复）；安装点 = bin 单一咽喉；**不设 VITEST/env 守卫**（kb 先例）；异常路径亦落行。
- **测试面**（同批）：`test/core/runtime-log.test.ts:60` 行格式正则同步修订（后缀断言 + 负控）；新增「done 必写」用例（建议子进程 fixture 验证异常/中断路径；`freshModule` + 旗标隔离模块态）；确认 vitest 进程退出不受钩子干扰。
- **语义登记**：`--help` / `--version` 由「不记 done」→「经 exit 兜底记 done」= **有意变更**（计划 / 验收 / CHANGELOG〔93〕三处登记）。

### T3 — op 级 phase 埋点（可选时间字段，读侧宽容）

- **字段建议**（方案期定稿命名）：`Op` 增**可选** `attempted_at?: string`（最近一次 attempt 记录时间，ISO）+ `completed_at?: string`（进入 `done` / `failed` 终态时间）。
- **落点**：`src/core/flow-manager.ts` `recordAttempt`（:2433+）三处状态变更分支（pass / fail-retry / fail-exhausted）各追加一行；`draft` 拒绝分支**不写**。
- **语义**：`exec_running` 窗口按 op 分段 ≈（上一 op `attempted_at` | 阶段进入时间, 本 op `attempted_at` / `completed_at`]——无需 op 级 phase，不改 phase 枚举。
- **读侧宽容**：`load()` 不补齐（不注入）；旧文件 `load→save` 零注入（字节级断言）；消费方容缺。
- **单测**（`test/core/flow-manager.test.ts`）：三种结果分支各写字段；`draft` 不写；零注入断言（golden 补丁前/后快照 diff 空）。

### T4 — 活跃/闲置语义标注（跨会话恢复；依赖 T2 的 session 标识）

- **落点**：`advanceStagePhase` 的 `advance_stage_phase` 审计条目 detail **可选**追加 `session_id` 与 `resumed`（`reset_stage_phase` 同款可选，方案期定稿）。
- **`resumed` 语义**：本次转换所在会话 ≠ 该 stage 上一次 phase 转换（即进入被退出 phase 的那次）的会话 → `true`；同会话 → `false`；**任一侧 session 不可信/缺失 → 省略字段**（不臆断；`proc:` 级不得用于跨会话判定）。
- **计算**：flow-manager 内存内回扫 `this.data.log` 取该 stage 最近一条 advance/reset 条目的 `detail.session_id`，与当前 session 比对；session 取值经**单一来源**（T2 的 `getSessionId()`，建议独立小模块 `src/core/session.ts` 被 runtime-log 与 flow-manager 共同消费，零 IO、memoized——方案期定稿）。
- **消费**：分析脚本 / 后续度量按段读 `resumed` 区分跨会话段（替代 >20min 启发式）；与 T1 的 `flow metrics` 口径注记联合解释（R-86-1）。
- **约束**：不新增写盘点（与既有 `save()` 同事务）；不改控制流。
- **单测**：同会话 → `false`；异会话 → `true`；不可判定 → 字段缺省；旧 flow.json 零注入。

### T5 — i18n + 单测 + 门禁（承 v1.2.0 口径）

- **i18n**：新增键（`flow metrics` 口径注记；其余 CLI 文案如有）**双表成对** → `lint i18n` **新基线显式登记**（> 911）。
- **单测**：T1~T4 各项 + 零回归（既有命令 human 输出与 `--json` 逐字；有意变更逐条登记）。
- **门禁**：`npm run build` ×2 幂等（`git status --porcelain src/` 空）→ `npm test`（**0 skipped / 0 failed**；基线 70 文件 / 1557 用例 + 本阶段新增，显式登记）→ `npx tsc --noEmit` = 0 → `lint i18n` 新基线 → `lint kb` = 0 → 实跑验收（§五）。

---

## 四、开放问题建议（Q1 / Q2 —— 本计划给建议，方案期定稿）

### Q1：`session_id` 采集链与「人工 / 自动化」区分口径

- **三级链（优先级降序）**：
  1. **harness env 探测**：Claude Code / opencode 两侧候选环境变量名清单，**须在隔离环境实机实测确认存在性与稳定性**（方法照 kb #Claude Code 实机验证方法）；**未实测命中的名字不入代码**（不臆造）。
  2. **会话续接文件**：`.openfeel/tmp/session.json`（`{session_id, source, started_at}`）——env 未命中时由 CLI 读取复用；**写入与轮换规则方案期定稿**（建议：仅在文件缺失或显式会话开始时生成；**禁止 TTL 猜测**——避免把 20min 启发式换个载体）。
  3. **进程 UUID 兜底**：`randomUUID()` 短前缀，语义 = **单进程**（自动化 / 测试调用天然落此级）。
- **来源标注**：值前缀 `env:` / `project:` / `proc:` → 机器可判「人工（交互会话）」vs「自动化（单进程）」；`proc:` 级不参与 T4 的跨会话判定。
- **验收**：隔离环境实跑三种来源各一例；日志行 `session=` 非空且前缀正确。

### Q2：`recordRun` 接线落点与 duration / 归属口径

- **建议：阶段推进触发 + phase→agent 映射，且接线在命令层**（理由见 A1b；明细见 T1）。
- **为何不选「attempt 触发 + 命令时长」**：① duration 无现成来源（CLI 命令时长中位 19ms 无意义；op 窗口须依赖 T3 字段、仅覆盖 T3 之后数据）；② attempt 触发频率低于 advance；③ 会把 `recordRun` 上线绑死 T3 顺序。→ 登记为**后续可选增强**（本版不实施）。
- **口径警示（R-86-1）**：phase 窗口**含跨会话闲置**——`flow metrics` 注记 + 与 T4 标注联合解释；**不得**把该数值表述为「agent 纯执行时长」。

---

## 五、验收要点（阶段级）

1. **度量（T1）**：隔离临时项目 + 本仓复核——跑一轮真实 `flow advance` 后 `.openfeel/metrics.json` **非空**、`flow metrics` 展示真实数据（run 级耗时 + agent 归属）；无归属 / 无基线不记；`--dry-run` 零写盘。
2. **日志（T2）**：CLI 日志行含 `duration_ms`（done 行）/ `project` / `session_id`（start/done 对称）；done 行覆盖加固生效（异常 / 中断路径亦落行、一次性防双写）；老前缀兼容。
3. **op 埋点（T3）**：flow.json op 含可选时间字段；旧 flow.json `load→save` **零注入**（字节级断言）。
4. **语义标注（T4）**：跨界转换条目含 `session_id` / `resumed`，跨会话恢复**可显式分辨**（不再依赖 >20min 启发式）。
5. **零回归**：phase 枚举 15 / `advanceAccepted` / 既有 `--json` 契约逐字不变；有意变更（done 语义扩展、metrics 注记、行格式断言）逐条登记；build ×2 幂等。
6. **门禁（T5）**：`npm test` 0 skipped / 0 failed（登记新基线）；`tsc` 0；`lint i18n` 新基线登记；`lint kb` 0。

## 六、风险

| # | 风险 | 影响 | 缓解 |
|:-:|------|------|------|
| R-86-1 | metrics 语义误导（phase 窗口含跨会话闲置） | 中 | `flow metrics` 口径注记（T1）+ T4 标注联合解释 + 归档轮文档明示（裁定 N / 大计划 R-8） |
| R-86-2 | done 钩子与测试进程互扰（退出码 / vitest 生命周期） | 中 | 安装点 bin 单一咽喉 + 一次性旗标 + `freshModule` 隔离 + 子进程用例；钩子异常全吞（best-effort 既有语义） |
| R-86-3 | session 名臆造（env 候选未实测） | 中 | 候选名**实机实测先行**；三级链降级 + 值前缀如实标注；不可判定不臆断（T4 省略字段） |
| R-86-4 | 存量 flow.json 被注入（load→save / 读侧补齐） | 高 | 可选字段 + 读侧宽容（不 load 补齐）+ 零注入字节级断言（kb 两先例） |
| R-86-5 | 热点触碰回归（`flow-manager` 推进路径 / `runtime-log` 咽喉 / `bin`） | 中 | 最小追加 + 零回归取证范式（补丁前/后归一化快照 diff 空）+ `--dry-run` 零写盘 + 单点安装 |
| R-86-6 | 行格式变更致既有断言 / 分析脚本漂移 | 中 | 后缀式设计（前缀不变）+ 同批修订断言（`runtime-log.test.ts:60`）+ 有意变更登记（CHANGELOG 归 93） |
| R-86-7 | `recordRun` 落点误置 core 致 import 环 | 中 | 落命令层（A1b 实测依据）；审查确认 `src/core/flow-manager.ts` 零 import `metrics` |

## 七、承接 REV 与处置表（REV-85-002 固化口径）

- 上游 = v1.2.0-stage-85 收口；**承接判据源更正（REV-86-001）**：上游 pending REV 权威台账 = `.openfeel/users/Liuary/code_review/REV-85.md`（**非** `flow.json.reviews`——该字段为 CLI `ReviewItem[]` 台账，非各阶段人工审查台账）。实测上游私有台账 pending **1 条** = **REV-85-017**（low / 非阻塞）→ 上游归档轮已**显式转 v1.3.0**（验收记录「保留 pending」）→ **非本版本承接**；其余条目全部 closed。→ 本阶段承接**实质为空**（处置 / 转后续 / 销账三分皆空），**零灭失**成立（判据 = 上游台账逐条去向）。
- 大计划 §五已声明同口径；`deps.yaml`（`.openfeel/plan/v1/v1.2.1/deps.yaml`）`v1.2.1-stage-86.notes` 已含来源与边界声明（实测在位）；如 Feel 要求显式承接行，可补「upstream pending REV 空账」一句（本计划**不代改 deps.yaml**）。

## 八、op 拆分建议（供 openfeel-schemer 定稿；`est_ops = 3`）

| op | 内容 | 文件（实际名） | 依赖 |
|:--:|------|------|------|
| `op-001` | T1 recordRun 接线（命令层）+ `PHASE_AGENT_MAP` + `flow metrics` 口径注记 + i18n + 单测 | `src/commands/flow.ts` / `src/core/metrics.ts` / `src/core/i18n-data/{zh-CN,en}.ts` / `test/commands/flow.test.ts` / `test/core/metrics.test.ts` | — |
| `op-002` | T2 CLI 日志 3 字段 + done 必写加固 + session 三级链 + bin 安装 + 断言同批修订 + 单测 | `src/core/runtime-log.ts`（+ 建议新增 `src/core/session.ts`）/ `src/cli/index.ts` / `bin/openfeel.js` / `test/core/runtime-log.test.ts` | soft: op-001 |
| `op-003` | T3 op 时间字段 + T4 跨会话标注 + 单测 + **T5 门禁**（与末 op 同批＝既有收口惯例） | `src/core/flow-manager.ts` / `test/core/flow-manager.test.ts` + 门禁全量 | hard: op-002（T4 依赖 session 标识） |

> op 级依赖与文件清单由 openfeel-schemer 落 `ops/deps.yaml`（hard / soft / mutual_exclusion，声明实际文件名）。

## 九、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-15 | openfeel-planner | 初稿：依据大计划 `.openfeel/plan/v1/v1.2.1/plan.md`（附录 A「stage-86 可观测性改造」+ §二 表 A + §三 裁定 N）+ 设计 §8 + 分析 §7.3/§8；源码复核 A1~A9（新增实测 A1b import 环 / A2b 行格式断言 / A8 上游账目 / A9 门禁基线）；T1~T5；**Q1 / Q2 方案建议**（§四）；风险 R-86-1~7；承接表（空账）。**只写计划文档，未改源码、未直写 flow.json、未推进 phase、未改 deps.yaml、未写其它阶段文件。** |
| 2026-10-15 | openfeel-executor（op-001 §1.1；方案期定稿文本） | 勘误：§七承接判据源更正（REV-86-001——判据 = 上游私有台账 REV-85.md 逐条去向；REV-85-017 显式转 v1.3.0，非本版本承接）；A8 「requirements: 0」→「字段缺省（0 条）」（REV-86-004）。 |
