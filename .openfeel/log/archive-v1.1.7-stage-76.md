# 归档摘要 — v1.1.7-stage-76

- **归档时间**：2026-10-11
- **阶段名称**：v1.1.7-stage-76（模板与 skill 模式感知 — v1.1.7 第三阶段）
- **阶段状态**：archiving → done
- **依赖阶段**：hard `v1.1.7-stage-74`（双模式引擎）、`v1.1.7-stage-75`（模式命令面）；下游 stage-77（文档与版本收口）
- **归档人**：openfeel-archiver

## 阶段目标

实现「模式标记」的第 ② 位读者——**Agent 读 `status.md「工作流模式」`自知是否被调度/是否轻量化**：`feel.md`×4 调度纪律 + subagent 模板 ×24 模式感知 + 全局约束层 ×4 模式注记 + 中立共享 skills ×5 收口（含 build 双生成物重生成）+ **T7 fast 快线表修订（`plan_review` 必经）**。

## 操作产出

| ID | 标题 | 状态 | Commit |
|----|------|------|--------|
| op-005 | [需求变更 T7] fast 快线表修订（`plan_pending → plan_review` + 新增 `plan_review` 键；8→9 条目）+ 文案 5 处 + stage-74 断言 14 点位（执行序**最前**） | done | —（未提交） |
| op-001 | feel.md ×4 模式纪律（T1）+ 全局约束层模式注记 ×4（T6） | done | —（未提交） |
| op-002 | subagent 模板模式感知（T2，6 类 × 4 = 24 份） | done | —（未提交） |
| op-003 | skills 收口（T3，×5）+ build 重生成（T4-build，生成物 2 份） | done | —（未提交） |
| op-004 | 静态断言（T4，S1~S7）+ 门禁（T5） | done | —（未提交） |

> 注：executor 按 `deps.yaml`「不 commit」约定，产出停留在工作区（HEAD `9a3fe27`）；执行序 = `op-005 → op-001 → op-002 → op-003 → op-004`（严格按 `execution_order`）；是否补提交由 Feel/用户裁定。

## 改动文件（52 = src/ 43 + test/ 5 + 生成物计入）

- **源码（引擎 / 配置 / i18n）**：`src/core/flow-manager.ts`（`FAST_TRANSITIONS` **8→9 条目**）、`src/core/config.ts`（文案 3 处）、`src/core/i18n-data/{zh-CN,en}.ts`（文案 2 处，键数不变）
- **模板 / skill 源**：`src/core/templates-data/{opencode,claude}/agents/{zh-CN,en}/feel.md`（×4，**「工作流模式」新节 + 骨架日志行内注记**）、`agents-md/{zh-CN,en}.md`（×2）、`claude/constraint/{zh-CN,en}.md`（×2）、`{opencode,claude}/agents/{zh-CN,en}/openfeel-{planner,executor,reviewer,archiver,schemer,feel-tester}.md`（**24**）、`skills/openfeel-{cli-usage,get-stage-status,update-stage-status,wizard,recover}/SKILL.md`（×5）
- **build 生成物（禁手改）**：`src/core/template-loader.ts`（84 loader hunk）、`src/core/update.ts`（16 update hunk，`SKILL_DEFINITIONS`）——全部落 AUTO-GENERATED 锚点区（0 越界）
- **测试**：`test/core/{templates,template-loader,claude-adapter}.test.ts`（S1~S7）、`test/core/flow-manager.test.ts`（12 点位）、`test/commands/flow.test.ts`（2 点位）
- **报告**：`test-v1.1.7-stage-76-report-2026-10-11.md`（私域）

## 审查记录

### 计划审查轮（plan_review 首轮不通过 → 修订复审 pass）

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-76-001 | 全局约束层含与 fast 冲突的流水线链，计划排除理由与源码事实不符 | closed | high（blocking） |
| REV-76-002 | build 生成产物清单遗漏 `src/core/update.ts`（`SKILL_DEFINITIONS`） | closed | high（blocking） |
| REV-76-003 | cli-usage skill 收口覆盖不全（漏 stage-75 三处命令面） | closed | high（blocking） |
| REV-76-004 | phase 口径三重歧义（7 键 / 8 条目 / fast 子集） | closed | medium（blocking） |
| REV-76-005 | 「fast」术语冲突（workflow_mode=fast vs 快速通道/fast track） | closed | medium（blocking） |
| REV-76-006 | T2 的 6 类 subagent 模板无 4 份对称断言；plan_review 不可达未明写 | closed | medium（非阻塞） |
| REV-76-007 | i18n 新基线未写具体值（实测 796） | closed | low（非阻塞） |
| REV-76-008 | 范围措辞「claude/agents 同名 7~9 份」与实况不符 | closed | low（非阻塞） |

### 方案审查轮（REV-76-009~016 → 复审 pass，断言串 0 MISS）

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-76-009 | op-004 三处断言串与 op-001/002/003 落文不一致 → 断言必红（markdown 粗体 `**` 断串） | closed | high（blocking） |
| REV-76-010 | op-002 步骤 5/6 新增文本含裸主语 `Feel` | closed | medium（blocking） |
| REV-76-011 | op-004 `git status --porcelain src/` 期望 41 条与路径范围不符 | closed | medium（非阻塞） |
| REV-76-012 | `deps.yaml` `est_ops` 3 → 4 | closed | low（非阻塞） |
| REV-76-013 | op-003/op-004 缺行号免责句；插入后行号失效 | closed | low（非阻塞） |
| REV-76-014 | op-004 两处细节（`loadClaudeAgentTemplate` 未 import / fixture 注释不实） | closed | low（非阻塞） |
| REV-76-015 | `openfeel-recover` 未纳入 T3 | closed | low（非阻塞） |
| REV-76-016 | Q4-GATE 未定义再入路径 | closed | low（非阻塞） |

### 代码审查轮（review_pending → passed）

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-76-017 | op-003 §2.4 方案文本与 op-004 S4 阴性断言冲突（实现最小偏离规避） | closed（归档登记口径） | low（非阻塞） |
| REV-76-018 | S4 禁用串清单同义词缺口（未含 `相位缩减`） | closed（登记已知边界） | low（非阻塞） |
| REV-76-019 | 快线链串在 `review_failed` 处易被读作合法边 | closed（advisory 登记） | low（非阻塞） |
| REV-76-020 | lint kb 基线数值陈旧（408 vs 实测 417） | closed（登记口径） | low（非阻塞） |
| REV-76-021 | 旧口径残留超出 T7-f 点名范围（`8 条目/7 流转键`） | closed（**归档官 supersede**） | low（非阻塞） |
| REV-76-022 | 执行序偏差记录（流程卫生） | closed（主会话经 CLI 对齐，归档官不直写 flow.json） | low（非阻塞） |

> 结论：**passed**（全 22 条闭合，无 blocking 遗留）；NB-1/NB-2 两条跟踪项（`plan.md` 历史行 / T7-c 枚举，均「落文权威在 op-005」，历史不改写惯例）。

## 缺陷记录

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| — | 无新增缺陷（验收通过、0 Bug） | — | — |

## 门禁

- `npm test` **67 文件 / 1306 用例 0 skipped / 0 failed**（基线 1291，+15）
- `npx tsc --noEmit` → exit 0
- `node bin/openfeel.js lint i18n` → **796**（不变）
- `node bin/openfeel.js lint kb` → 0（417 引用无过期）
- `npm run build` ×2 → 幂等（`git hash-object` 前后一致；84 loader + 16 update hunk 全落 AUTO-GENERATED 锚点区）
- `node bin/openfeel.js --version` → **1.1.6**（本阶段不改版本，收口归 stage-77）
- `git status --porcelain src/ test/` → **48**（src/ 43 + test/ 5）
- 断言反证：改回 `plan_pending: ['plan_passed']` → `flow-manager.test.ts` **13 失败** → 复绿（393 用例）
- 全量扫描收口：旧口径串（`plan_pending: ['plan_passed']` / `8 条目|7 流转键` / `跳过计划审查` / `跳过上述环节|skip the above` / `plan review / scheme / test skipped` / `不等待 reviewer|without waiting for the reviewer`）全仓 **0 命中**
- CLI 实测：`flow phases --mode fast` → `plan_pending → [plan_review]`、`plan_review → [plan_passed, plan_pending]`；`--mode full` 零回归

## 知识沉淀

| 分类 | 标题 | 动作 |
|------|------|------|
| patterns | Agent 模板模式感知落法：节锚点插入 + 同语言跨 harness 逐字一致 + 按 harness 替换主语 + 无裸主语 | 新增 |
| patterns | 工作流快线必经计划审查：fast 表 8→9 条目（`plan_pending → plan_review`） | 新增 |
| troubleshooting | 断言串与落文逐字核对纪律：markdown 粗体 `**` 断串致 0 命中 | 新增 |
| troubleshooting | 改 templates-data 源须同批重生成的「双生成物」：template-loader.ts + update.ts | 新增 |
| (supersede) | `kb/architecture.md` #双模式转移表选择（7 键 → 9 条目）+ `kb/index.md`（2 处）+ `manual/core/flow-manager.md:163` + `manual/index.md` | supersede 更新 |

> 去重（`node bin/openfeel.js knowledge dedup`）：最高相似度 **5.9% / 3.0% / 1.8% / 5.9%** ≪ 80% → 4 条均判**新增**。
> 索引维护：`kb/index.md` 项目快速概览（最近更新 + 源文件 68 / Agent 9 核验一致）+ 分类概览（patterns 161→163 / troubleshooting 53→55）+ 各分类摘要表补入 stage-76 4 条 + 最近更新表补入 stage-74/75/76 三条；`code_review/index.md`（passed 46→47）。

## manual 更新

- `core/flow-manager.md`：内置 fast 快线表口径 **8 → 9 条目**（`plan_pending → plan_review` 必经）；双模式节标题加「fast 表口径于 v1.1.7-stage-76 T7 修订」
- `index.md`：模块树维护规则 flow-manager 行补 stage-76 检查点；`FAST_TRANSITIONS` 摘要行改 **9 条目** 口径
- （`core/config.md` / `cli/commands.md` 本阶段无 API / 命令面变更，未改动）

## ADR / 决策更新

- **ADR-010（`dev/decisions.md`）正文修订**：fast 链由「`plan_pending→plan_passed`（跳过 `plan_review`）共 7 个 phase / 8 条目」改为「含 `plan_review`、跳过 6 项 / **9 条目**」；原「[需求变更 2026-10-11 修订｜待改]」标记为「已落地」并注明实施归 stage-76 T7（op-005）、配套 supersede 清单。

## 遗留与下游

- ★ **flow 状态推进**：`v1.1.7-stage-76` → `done`（**由主会话** Feel 经 `openfeel flow advance --stage v1.1.7-stage-76 --to done` 执行；archiver 不直写 flow.json）；`REV-76-022` 的 `current.op` 对齐随该 advance 经 `syncCurrentOp` 完成。
- docs/README/CHANGELOG 与版本 1.1.6→1.1.7 收口 → **stage-77**。
- 后续版本收敛项：REV-76-018（阴性禁用串补同义变体）、REV-76-020（基线快照标注实测时点）、NB-1/NB-2（`plan.md` 历史行 / T7-c 枚举）。
- 未 commit / 未 push / 未 publish（op 显式边界，由 Feel/用户裁定）。

> 归档方式：手工生成摘要（沿用先例，未运行 `openfeel archive` CLI 以避免其副作用）。
