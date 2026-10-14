# 归档摘要 — v1.2.1-stage-86

- **归档时间**：2026-10-15
- **阶段名称**：v1.2.1-stage-86（**可观测性改造** — v1.2.1 首阶段 / 主题六）
- **阶段状态**：archiving → done
- **依赖阶段**：无（**v1.2.1 首阶段**；度量前置——设计 §8「本批提速举措若无埋点则无法度量」）
- **下游**：v1.2.1 后续七阶段（度量基线提供方）
- **基线**：HEAD `11f0bd2`（计划/方案期）→ 执行后 HEAD `7a56fa3`（**本阶段 3 commits**）
- **归档人**：openfeel-archiver

## 阶段目标

把 v1.2.1 的**度量底座**落地为四件套可观测性（P0）——① **T1 接线 `recordRun`**（零调用点死代码 → `flow metrics` 非空）；② **T2 CLI 运行日志补 3 字段**（`duration_ms`〔done 行〕/ `project` / `session_id`）+ **done 行必写加固**（异常/中断路径亦落行）；③ **T3 op 级 phase 埋点**（flow.json op **可选**时间字段，读侧宽容不注入）；④ **T4 活跃/闲置语义显式标注**（phase 转换标注是否跨会话恢复，替代分析层 >20min 启发式）。

## 操作产出

| ID | 标题 | 状态 | Commit |
|----|------|------|--------|
| op-001 | T1 `recordRun` 接线（命令层）+ `PHASE_AGENT_MAP` + `flow metrics` 口径注记（T1）+ 计划承接口径勘误（REV-86-001/004） | done | `aea0b41` |
| op-002 | T2 CLI 日志 3 字段 + done 行必写加固 + session 三级链（含新增 `src/core/session.ts`） | done | `dff7e68` |
| op-003 | T3 op 时间字段 + T4 跨会话标注 + T5 阶段门禁与终局报告（**阶段末 op**） | done | `7a56fa3` |

> 注：执行序 = `op-001 → op-002 → op-003`（严格串行；**收口 op-003 = 阶段末 op**）；**本阶段 executor 已 commit（3 commits）**，与 v1.2.0 各阶段「停留工作区」口径不同。审查：plan_review **pass**（0 阻塞 + 5 非阻塞）/ scheme_review **pass**（0 阻塞 + 3 非阻塞）/ code_review **pass**（0 阻塞 + 2 非阻塞）。验收 **通过 8/8、0 Bug**。

## 改动文件

- **`src/core/metrics.ts`**：`PHASE_AGENT_MAP` **单点常量**新增导出（10 键）+ `summary()` 追加口径注记行（有数据分支）；**core 零调用点**（防 import 环）。
- **`src/commands/flow.ts`**：advance 逐步推进循环内**接线 `recordRun`**（`mgr.save()` 之后；`--dry-run` 已提前 return）+ 新文件级 helper `findPhaseEnteredAtMs`（duration 基线回扫，上界 `logLenBefore`）+ 命令层 `MetricsStore.save()` 条件落盘。
- **`src/core/session.ts`**（**新增**）：会话标识三级链（env → project → proc）+ 来源值前缀 + memoize；叶子模块零 import 环。
- **`src/core/runtime-log.ts`**：`PROCESS_START_MS` + `logCliStart` / `logCliDone` / `installExitHooks` / `resetDoneFlagForTest`（`runtimeLog` 原语**零改动**；方括号键值对后缀）。
- **`src/cli/index.ts`**：`:197` → `logCliStart` / `:205` → `logCliDone`；`:196` 注释口径更新（**有意变更**）。
- **`bin/openfeel.js`**：`installRuntimeLog()` 之后追加 `installExitHooks()`（单一咽喉）。
- **`src/core/flow-manager.ts`**：`Op` 增**可选** `attempted_at?` / `completed_at?` + `recordAttempt` 三分支写值 + `computeResumed` + `advanceStagePhase` / `resetStagePhase` 审计 detail 追加可选 `session_id` / `resumed`。
- **`src/core/i18n-data/{zh-CN,en}.ts`**：+1 键 `metrics.summary.caliberNote`（双表成对，911 → **912**）。
- **测试**：`test/commands/flow.test.ts`（M1~M5）/ `test/core/metrics.test.ts` / **`test/core/session.test.ts`（新增，文件数 70→71）** / `test/core/runtime-log.test.ts`（断言同批修订 + done/exit/子进程 3 场景）/ `test/core/flow-manager.test.ts`（T3.1~T3.5 + T4.1~T4.6 + REV-86-006 golden 修订）。
- **方案层**：`.openfeel/plan/v1/stage-86/{plan.md,status.md,overview.md,ops/{deps.yaml,op-001~003.md}}`；临时报告 `.openfeel/tmp/stage-86-{metrics,log,final}-report.md`（不入版本管理）。
- **计划文档勘误（REV-86-001/004）**：`stage-86/plan.md` §七判据源更正 + A8 措辞 + §九 修订记录。

## 关键不变量（设计裁定与实测）

| 不变量 | 内容 | 实证 |
|--------|------|------|
| **可选字段 + 读侧宽容** | 新增 flow.json 字段（op 时间戳 / 审计 detail 键）**不 load 补齐**；存量 `load→save` **零注入** | T3.5 / T4.6 golden 归一化逐字节等值 + 新键零出现 |
| **四类日志边界不变** | 只改「CLI 进程运行日志」行内字段；工作区审计 / `flow.json.log` / `update_infos` 布局零变 | kb #四类日志边界；`runtimeLog` 原语零改动 |
| **单一咽喉隔离** | 新增钩子（exit / session）仅 `bin/openfeel.js` 安装；库侧默认 no-op；**不设 VITEST/env 守卫** | 静态断言「源码不含 `process.env.VITEST`」保持通过 |
| **`--dry-run` 字节级零写盘** | 不写 flow.json、**不写 metrics.json**、不触发新增副作用 | M5（metrics.json 不生成 + flow.json 字节一致） |
| **core→core 零 import 环** | `flow-manager` 零 import `metrics`；`session.ts` 零 import runtime-log / flow-manager | `rg` 双向核对 + A1b 实测 |
| **零回归 + 有意变更登记** | phase 枚举 15 / `advanceAccepted` / 既有 `--json` 契约逐字不变；三项有意变更显式登记 | 门禁全绿 + 报告 ⑤ |
| **不改版本号** | `--version` 保持 `1.2.0`（版本收口归 stage-93） | 实测 |

## 审查记录

### 计划审查轮（plan_review，2026-10-15，结论 pass：0 阻塞 + 5 非阻塞）

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-86-001 | §七「承接空账」依据非上游审查台账权威源，REV-85-017 pending 未枚举 | **closed** | high（非阻塞） |
| REV-86-002 | T1 duration 口径「回扫最近一条转换条目」字面实现将得 ≈0 | **closed** | medium |
| REV-86-003 | T3 `recordAttempt` 行号 `:2433+` 与实测不符（实为 `:2427`） | **closed** | low |
| REV-86-004 | A8「`requirements: 0`」表述与实况不符（可选字段缺省） | **closed** | low |
| REV-86-005 | 范围含「建议新增 `src/core/session.ts`」但 `deps.yaml` `produces` 未列 | **closed** | low |

### 方案审查轮（scheme_review，2026-10-15，结论 pass：0 阻塞 + 3 非阻塞）

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-86-006 | op-003 T4 未登记既有 golden 失配（`GOLDEN_ADVANCE`/`GOLDEN_DEPRECATED` 须同批更新 + 会话值确定性控制） | **closed（执行期落实）** | medium |
| REV-86-007 | op-002 子进程用例未声明 `cwd` 隔离——env 命中即向真实仓库 `.openfeel/tmp/` 写 session 续接文件 | **closed（执行期落实）** | medium |
| REV-86-008 | `installExitHooks` 无条件注册信号钩子——REPL / 非 TTY SIGINT 语义变更未登记 | **closed（报告登记 + 注入式单测）** | low |

### 代码审查轮（code_review，2026-10-15，结论 pass：0 阻塞 + 2 非阻塞）

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-86-009 | T4.4 用例未命中 computeResumed「旧条目缺 session_id → null」分支（断言保护力弱） | **pending（转 v1.2.2）** | low |
| REV-86-010 | session env 命中即向进程 cwd 写 `.openfeel/tmp/session.json`（非项目目录亦落盘）——守卫缺位留后续版本 | **pending（转 v1.2.2）** | low |

> 结论：**passed（全 10 条：closed 8 / pending 2，0 blocking 遗留）**。归档官处置：REV-86-009/010 均 low 非阻塞，生产逻辑无缺陷 → **显式转 v1.2.2（或后续收口轮）跟踪**（去向留痕，防灭失）。**门禁独立复现全绿**（审查会话实测：`tsc` 0 / `lint i18n` 912 / `lint kb` 0（545 引用）/ `npm test` 71 文件 / 1591 用例 0 skipped / 0 failed）。

## 缺陷记录

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| — | 本阶段**无新增 Bug** | — | — |

> 测试官正式验收 **通过（8/8、0 Bug）**。

## 门禁

- `npm run build` ×2 → 幂等（`git status --porcelain src/` 快照 S2 === S1 + 双生成物 sha1 一致；本阶段零改 templates-data）
- `npm test` **71 文件 / 1591 用例 0 skipped / 0 failed**（基线 70 文件 / 1557 用例；+1 文件 / +34 用例）
- `npx tsc --noEmit` → exit 0
- `OPENFEEL_LOG=0 node bin/openfeel.js lint i18n` → **912**（+1 键 `metrics.summary.caliberNote`）
- `OPENFEEL_LOG=0 node bin/openfeel.js lint kb` → **0**（545 引用零过期）
- `node bin/openfeel.js --version` → **1.2.0**（不改版本，收口归 stage-93）
- `git status --porcelain src/` ⊆ 本阶段 `ops/deps.yaml` `produces` 清单
- HEAD `7a56fa3`（3 commits：`aea0b41` / `dff7e68` / `7a56fa3`）

## 知识沉淀

| 分类 | 标题 | 动作 |
|------|------|------|
| architecture | 可观测性埋点架构：recordRun 命令层接线 + phase→agent 归属 + 日志 3 字段 + 会话标识三级链 | 新增 |
| patterns | 死代码接线的落点判据：core 反向 import 成环 → 落命令层 + duration 基线按 `detail.to` 回扫 | 新增 |
| patterns | CLI 进程日志行格式向后兼容扩展：前缀不变 + 方括号键值对后缀 + 进程完成行必写加固 | 新增 |
| patterns | 进程级会话标识三级链 + 来源值前缀标注 + 跨会话恢复显式标注（替代时间启发式） | 新增 |
| troubleshooting | 回扫「最近一条」转换条目求 phase 窗口耗时得 ≈0：`appendLog` 已把本次转换压入 log 末尾 | 新增 |
| troubleshooting | 子进程测试未设 `cwd` 致向真实仓库写入：`spawnSync` 缺省继承 cwd | 新增 |

> 去重（`node bin/openfeel.js knowledge dedup --category patterns`）：6 条候选最高相似度 **5.1%**（跨会话恢复 vs ValidationResult errors/warnings 分离）≪ **80%** → **全部判「新增」**（无一触发更新）。kb 分类计数：architecture 42→**43**、patterns 180→**183**、troubleshooting 61→**63**、setup 6（不变）。

## manual 更新

- **`manual/core/session.md`（新建）**：会话标识三级链（env / project / proc）+ 来源值前缀 + 设计边界（失败静默 / proc 不落盘 / 禁止 TTL 猜测 / memoize / REV-86-010 已知副作用）+ 消费方。
- **`manual/core/metrics.md`（新建）**：`MetricsStore` / `recordRun` + `PHASE_AGENT_MAP`（10 键）+ 接线落命令层（core 反向 import 成环）+ duration 口径 + 口径注记 i18n 键。
- **`manual/core/runtime-log.md`（更新）**：核心 API 增补 4 导出 + 行格式后缀扩展 + done 行必写加固节 + 会话标识节 + error 边界（`--help`/`--version` 记 done）+ 变更历史。
- **`manual/core/flow-manager.md`（更新）**：新增「op 时间字段与跨会话恢复标注（v1.2.1-stage-86）」节（`Op` 可选字段表 + 三分支 + 审计 detail 两键）+ 审计 action 一览补 bullet。
- **`manual/cli/commands.md`（更新）**：`flow metrics` 口径注记行（人类输出注记 + `--json` 契约逐字不变）。
- **`manual/index.md`（更新）**：模块树补 `core/session.md` / `core/metrics.md`（+ `core/runtime-log.md` 摘要）；维护规则表补两新增模块行 + 扩展 flow-manager / runtime-log 两行。

## 遗留与下游

- ★ **flow 状态推进**：`v1.2.1-stage-86` → `done`（**由主会话** Feel 经 `openfeel flow advance --stage v1.2.1-stage-86 --to done` 执行；archiver **不直写 flow.json**）。`archive_stage` 由该 advance 补记。
- **REV 遗留（2 条 pending 非阻塞，0 blocking）**：**REV-86-009**（T4.4 用例覆盖缺口）/ **REV-86-010**（session 写路径项目域守卫缺位）——**均转 v1.2.2**（or 后续收口轮）。承接上游：v1.2.0-stage-85 上游 pending REV-85-017 已由上游显式转 v1.3.0 → **本阶段承接实质为空**（零灭失）。
- **Bug 遗留**：无。
- **已知边界（登记留痕）**：① `recordRun` **未接入口**——`flow stage reset` / `flow attempt` 自动改道 / deprecated `advancePhase`（口径一致但记录遗漏）；② phase 窗口耗时**含跨会话闲置/等待**，非 agent 纯执行时长（`flow metrics` 注记 + `resumed` 标注联合解释）。
- **兼容承诺**：本阶段所有新增 flow.json 字段**可选 + 读侧宽容**（旧 flow.json `load→save` 字节级零注入）；`--json` 契约只增不改；四类日志边界不变；`--dry-run` 字节级零写盘不破。
- **版本事实**：`--version` == **1.2.0**（本阶段不改版本）。
- **未 push / 未 publish**（由 Feel/用户执行）。

> 归档方式：手工生成摘要（沿用先例，**未运行 `openfeel archive <stage>` CLI** 以避免其副作用；`archive_stage` 由 Feel 的 `flow advance --to done` 补记）。
