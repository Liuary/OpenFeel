# 归档摘要 — v1.1.7-stage-74

- **归档时间**：2026-10-11
- **阶段名称**：v1.1.7-stage-74（双模式引擎 — v1.1.7 首阶段）
- **阶段状态**：archiving → done
- **依赖阶段**：无 hard 依赖（v1.1.7 首阶段）；下游 stage-75（命令面）/ stage-76（模板与 skills）/ stage-77（文档与版本收口）
- **归档人**：openfeel-archiver

## 阶段目标

为「快速迭代模式」落地**引擎层**：引入 `workflow_mode`（`full` | `fast`）配置键，实现双转移表（full 完整链路 / fast 快线 7 phase）、按 stage 派生 mode 的唯一取表点、四层级联解析，以及 `auto_advance` 部署级默认翻转（裁定 E：`disabled → enabled`）。

## 操作产出

| ID | 标题 | 状态 | Commit |
|----|------|------|--------|
| op-001 | 配置面四键与 auto_advance 翻转（T1+T6） | done | —（未提交） |
| op-002 | 双转移表与按 mode 取表访问器（T2+T5） | done | —（未提交） |
| op-003 | 级联「工作流模式」与带 stage 形参解析（T4+T3 解析层） | done | —（未提交） |
| op-004 | 单一取表点接入 + 既有测试对齐 + 全门禁（T3+T7+T8） | done | —（未提交） |

> 注：executor 按 op 边界与 `deps.yaml`「不 commit」约定，产出停留在工作区（HEAD `6a2b04f`）；是否补提交由 Feel/用户裁定。

## 改动文件

- **源码**：`src/core/config.ts`、`src/core/pipeline-schema.ts`、`src/core/flow-manager.ts`、`src/core/i18n-data/{zh-CN,en}.ts`
- **测试**：`test/core/{config,init,flow-manager}.test.ts`、`test/core/plan/stage.test.ts`、`test/commands/{config,flow,plan}.test.ts`
- **工作区资产**：`.openfeel/config.yaml`（+1 行 `workflow_mode: full`，自举基线裁定 L）
- **报告**：`.openfeel/tmp/op-001~004-test-report.md`、`stage-74-gate-report.md`、`stage-74-selftest-report.md`

## 审查记录

### 计划审查轮（plan_review → 复审通过）

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-74-001 | `resolveStageWorkflowMode(stageId)` 无法复用 buildCascadeConfig 级联 | closed | high（blocking） |
| REV-74-002 | 转移表「唯一读点」方法清单不实 — 漏 canAdvance 与 buildDownstreamPhases | closed | high（blocking） |
| REV-74-003 | 双表下访问器默认 mode 与 `flow phases --json` 契约未定义 | closed | medium（blocking） |
| REV-74-004 | 「full 表逐字不变」不变量与本仓 pipeline.yaml 覆盖语义未区分 | closed | medium |
| REV-74-005 | 验收 5（auto_advance → enabled [builtin]）未隔离 profile 层 | closed | medium |
| REV-74-006 | 源码核验行号系统性偏移；两项统计未复现 | closed | low |
| REV-74-007 | D7（resolveStageWorkflowMode 改 public）的依据事实错误 | resolved | low |
| REV-74-008 | 计划 T7.5 的 CLI 半段未在任何 op 的测试清单落地 | resolved | low |
| REV-74-009 | `fast_transitions: {}` 空对象语义未定义、未测 | resolved | low |
| REV-74-010 | 行号微偏登记（不影响执行） | resolved | low |

### 代码审查轮（review_pending → passed）

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-74-011 | `ConfigDefaultsSchema.auto_advance` 逐键默认翻转（复核为必要，要求补登记） | closed | low（非阻塞） |
| REV-74-012 | 三处基数/描述注释陈旧（受管键三→四；阶段级字段映射两→三） | closed | low（非阻塞） |
| REV-74-013 | 超范围测试改动 `test/commands/plan.test.ts > T6.8` | closed | low（非阻塞） |
| REV-74-014 | `resolveStageWorkflowMode` 公共化（接受）+ 四源判定链轻量重复 | closed | low（非阻塞） |
| REV-74-015 | 验收 3 引用的 `config effective --json` 在 CLI 中不存在 | closed | low（非阻塞） |

> 结论：**passed**（无 blocking 遗留）；快速通道未命中（`src` +166 行、`test` +555 行 ≥ 200，12 文件 ≥ 5）→ 完整 5 维度审查。
> REV-74-011~015 由归档官就地收口：011/012 于本阶段修正（补注释口径 + 计划登记），013/015 为计划措辞一致性（文档级），014 为「接受 + 后续建议」，均无代码动作。

## 缺陷记录

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| — | 无新增缺陷（验收 5 大重点逐项通过、0 Bug） | — | — |

## 门禁

- `npm test` **67 文件 / 1239 用例 0 skipped / 0 failed**（基线 67 文件 / 1206 用例）
- `npx tsc --noEmit` → exit 0
- `node bin/openfeel.js lint i18n` → **775**（+1 键 `manager.fastTransitionsInvalid`）
- `node bin/openfeel.js lint kb` → 0（396 引用无过期）
- `npm run build` ×2 → 幂等（`git status --porcelain src/` 两次快照逐字相同，`template-loader.ts` 未变）
- `node bin/openfeel.js --version` → **1.1.6**（本阶段不改版本，收口归 stage-77）
- `git diff .openfeel/config.yaml` → **仅 +1 行** `workflow_mode: full`；`git diff .openfeel/pipeline.yaml` → 空
- `config effective` → 四行，`workflow_mode：full [config.yaml]`
- `flow phases --json` → 既有键逐字；`transitionsDiff.missing=['review_passed|test_passed']`；`advanceAccepted` 15

## 知识沉淀

| 分类 | 标题 | 动作 |
|------|------|------|
| architecture | 双模式转移表选择：`getValidTargets` 单一取表点 + stage→mode→表 三元解析 | 新增 |
| architecture | 部署级默认翻转的单一权威：`DEFAULT_CONFIG` 与 schema 逐键默认同键值 | 新增 |
| patterns | 模式标记三层载体与记忆语义：config.yaml defaults → status.md → flow.json 不冗余 | 新增 |
| patterns | 带 stage 形参的级联解析：避免 `current.stage` 硬编码陷阱 | 新增 |

> 去重：4 条候选最高相似度 7.7% ≪ 80% → 全判新增。

## manual 更新

- `core/config.md`：受管键三→**四**（`workflow_mode`）、`DEFAULT_CONFIG` 四键、`STAGE_FIELD_BY_CONFIG_KEY` 三键、`auto_advance` 默认翻转 `enabled`
- `core/flow-manager.md`：`EFFECTIVE_CONFIG_KEYS` 四键、`resolveStageWorkflowMode` 公共化、`buildCascadeConfig(stageId?)` 带 stage 形参、`getValidTargets(fromPhase, mode)` **mode 必传**、`getPipelineTransitions/getDefaultTransitions(mode='full')`、`FAST_TRANSITIONS`/`fast_transitions`
- `index.md`：维护规则表补登 stage-74 检查点

## 遗留与下游

- 命令面（`flow mode` / `flow phases --mode|--stage` / `stage set --workflow-mode` / `--workflow-mode` / wizard 选型 / `--sync-stages` 插入语义 / 骨架「工作流模式」行）→ **stage-75**
- 模板与 skills（含新建项目 `workflow_mode: fast` 模板、skills 分平台）→ **stage-76**
- docs/README/CHANGELOG 与版本 1.1.6→1.1.7 收口 → **stage-77**
- 未 commit / 未 push（op 显式边界，由 Feel/用户裁定）

> 归档方式：手工生成摘要（沿用先例，未运行 `openfeel archive` CLI 以避免其副作用）。
