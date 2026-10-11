# 归档摘要 — v1.1.7-stage-75

- **归档时间**：2026-10-11
- **阶段名称**：v1.1.7-stage-75（模式命令面与交互 — v1.1.7 第二阶段）
- **阶段状态**：archiving → done
- **依赖阶段**：hard `v1.1.7-stage-74`（双模式引擎）；下游 stage-76（模板与 skills）/ stage-77（文档与版本收口）
- **归档人**：openfeel-archiver

## 阶段目标

把 stage-74 的引擎能力**暴露为命令面与交互**：阶段创建/设置模式（`plan stage add --workflow-mode` / `stage set --workflow-mode` 插入语义）、只读查询（新增 `flow mode`；`flow phases` 模式分节）、批量同步作用域（`config set --sync-stages --stage`）、wizard 首次选型与项目级记忆、op 骨架机械铺（`plan scheme create --from-tasks`）、`flow.json` 可选冗余字段，以及自举收尾 T9。

## 操作产出

| ID | 标题 | 状态 | Commit |
|----|------|------|--------|
| op-001 | 阶段创建/设置命令面与「插入」写函数（T1+T2 + 冗余写入点①②） | done | —（未提交） |
| op-002 | `flow mode` 只读查询与 `flow phases` 模式分节（T3+T3-附） | done | —（未提交） |
| op-003 | `config set --sync-stages` 作用域限定与 `inserted` 命令层落地（T5 + 冗余写入点③ + health） | done | —（未提交） |
| op-004 | op 骨架机械铺 + wizard 首次选型 + 自举 T9 + 门禁收口（T6+T4+T9+T8） | done | —（未提交） |

> 注：executor 按 `deps.yaml`「不 commit」约定，产出停留在工作区（HEAD `5607905`）；是否补提交由 Feel/用户裁定。

## 改动文件

- **源码**：`src/commands/{plan,stage,flow,config}.ts`、`src/core/plan/{stage,scheme}.ts`、`src/core/flow-manager.ts`、`src/core/i18n-data/{zh-CN,en}.ts`（21 新键 + 2 文本更新）
- **测试**：`test/core/plan/stage.test.ts`、`test/core/plan/scheme.test.ts`、`test/core/flow-manager.test.ts`、`test/commands/{plan,stage,flow,config}.test.ts`、`test/cli/output-encoding.test.ts`（E-2② 5→6）
- **工作区资产**：`.openfeel/plan/v1/stage-{74,75,76,77}/status.md`（各 +1 行「工作流模式」）+ `.openfeel/flow.json`（4 个 `stages.*.workflow_mode` 冗余字段 + `meta.revision`/`meta.updated` + 4 条 `log[].config_sync_stage`）——**唯一**经 T9 改写本仓真实文件的动作
- **报告**：`.openfeel/tmp/op-001~004-test-report.md`、`.openfeel/users/Liuary/log/exec-…-report-2026-10-11.md`、`test-…-report-2026-10-11.md`

## 审查记录

### 计划审查轮（plan_review → 复审通过）

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-75-001 | `flow phases` 模式分节整体缺失（含 `flow.ts:391` 静默错表） | closed | high（blocking） |
| REV-75-002 | 裁定 L 自举动作缺失；`--sync-stages` 作用域与「只补 74~77」不符 | closed | high（blocking） |
| REV-75-003 | T4/T7.6「非 TTY 不 exit 1」与既有守卫及测试 T39 冲突 | closed | high（blocking） |
| REV-75-004 | `--sync-stages` 新增 `inserted` 结果在命令层未落地 | closed | medium（blocking） |
| REV-75-005 | 插入语义失败码与批量语义不自洽；锚点缺失未定义 | closed | medium |
| REV-75-006 | REV-74-014 B 的收敛结论未登记 | closed | low |
| REV-75-007 | 行号基准更新与 1 处偏差 | closed | low |
| REV-75-008 | T6（op 骨架机械铺）未进入命令面契约表 | closed | low |

### 方案审查轮（rev009-014 → 复审通过）

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-75-009 | op-001 事实基准错误 —— `normalizeStageId` 未在 `commands/stage.ts` 导入 | closed | medium（blocking） |
| REV-75-010 | T9 核验 3 口径不可满足 —— 漏计 `meta.revision`/`meta.updated` | closed | medium（blocking） |
| REV-75-011 | T7.5「四源」偏差 —— 采纳「3 源 + profile 阴性断言」 | closed | low |
| REV-75-012 | T3-附「逐字一致」解读 —— 采纳「只增 2 行」 | closed | low |
| REV-75-013 | `est_ops` 与实拆分不一致（3→4） | closed | low |
| REV-75-014 | 少量落点微差与未声明变量 | closed | low |

### 代码审查轮（review_pending → passed）

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-75-015 | 计划/概览「建议 op」拆分文本与 `ops/deps.yaml` 定稿不一致 | closed（归档官就地修正） | low（非阻塞） |
| REV-75-016 | 冗余字段写入逻辑分散三处（内部模式一致性） | closed（登记为后续版本收敛项） | low（非阻塞） |
| REV-75-017 | 两处 i18n 文案与实际行为微差 | closed（executor op-004 修复） | low（非阻塞） |
| REV-75-018 | `stage-75/status.md`「状态记录」未追加本轮修订行 | closed（归档官就地修正） | low（非阻塞） |

> 结论：**passed**（全 18 条闭合，无 blocking 遗留）；快速通道未命中（`src` + 测试合计 2452 插入 / 218 删除、31 文件）→ 完整 5 维度审查。

## 缺陷记录

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| — | 无新增缺陷（验收 9 项逐条通过、0 Bug；2 条非阻塞观察均为 HEAD 既有行为） | — | — |

## 门禁

- `npm test` **67 文件 / 1291 用例 0 skipped / 0 failed**（基线 67 文件 / 1239 用例，+52）
- `npx tsc --noEmit` → exit 0
- `node bin/openfeel.js lint i18n` → **796**（基线 775，+21 键）
- `node bin/openfeel.js lint kb` → 0（408 引用无过期）
- `npm run build` ×2 → 幂等（`src` 树 SHA256 前后一致；porcelain 仅本阶段 9 个有意文件）
- `node bin/openfeel.js --version` → **1.1.6**（本阶段不改版本，收口归 stage-77）
- 检索复核：`rg "getPipelineTransitions\(\)|getDefaultTransitions\(\)" src/` → **0**（src 内零无参访问器残留）
- 死键复核：6 新键（`syncSummaryTmpl`/`insertedTmpl`/`noAnchorTmpl`/`modeRememberedTmpl`/`fromTasks`/`titleRequiredTmpl`）每键均有调用点
- JSON 契约：`flow phases --json` **6 键**（既有五键逐字 + `workflowMode`）、`advanceAccepted` 15；`config effective` 四键格式逐字不变
- T9 自举四项核验全过（74~77 status.md 含字段 + `config effective` + porcelain 无未预期条目 + 重复执行幂等零写盘）

## 知识沉淀

| 分类 | 标题 | 动作 |
|------|------|------|
| patterns | 命令面模式感知：`flow phases` / `flow mode` 经 `resolveStageWorkflowMode` 派生 mode，禁止默认形参静默错表 | 新增 |
| patterns | status.md 缺失字段插入语义：新增 `insertStatusField`（锚点链 + 三态）与替换语义严格分离 | 新增 |
| patterns | 批量同步的作用域限定参数（`--sync-stages --stage`）：前置校验 + 组合守卫 + 不过滤阶段状态 | 新增 |
| troubleshooting | flow.json「内容增量」核验口径必含 `meta.revision`/`meta.updated` | 新增 |
| troubleshooting | 即席实测误在仓库 cwd 执行真实命令（**同类事故复发**，追加更新） | 更新 |

> 去重（`node bin/openfeel.js knowledge dedup`，CRLF 归一副本绕过）：最高相似度 **5.8%** ≪ 80% → 4 条判新增；1 条与既有条目同类（事故复发）→ 追加式更新。
> 索引维护：`kb/index.md` 项目快速概览（最近更新）+ 分类概览（architecture 33→35 / patterns 156→161 / troubleshooting 52→53，**并回填 stage-74 遗漏的 4 条摘要行**）+ 各分类摘要表补入 stage-74/75 条目。

## manual 更新

- `core/flow-manager.md`：`syncConfigFieldToStages(configKey, value, options?)` 三参 + `onlyStages`/`inserted`/`skipped-no-anchor`；新增 `insertStatusField`（三态 + 锚点链 + 替换语义零改动）；新增 `StageData.workflow_mode?`（冗余三写入点）；`healthCheck` 第 10 项 `checkWorkflowModeRedundancy`（仅 warn）
- `core/config.md`：`config set --sync-stages` 扩 `--stage` 作用域（前置校验 + 组合守卫 + `inserted`/`skipped-no-anchor` + 汇总行）
- `cli/commands.md`：`flow mode`（只读）新增；`flow phases --mode/--stage`（模式分节 + `--json` 增 `workflowMode`）；`plan stage add --workflow-mode`；`stage set --workflow-mode`（插入语义）；`config set --sync-stages --stage`；`plan scheme create --from-tasks`；wizard 模式选型；`config effective` 三→四键
- `index.md`：维护规则表补登 stage-75 检查点（flow-manager / config / 命令注册三行）

## 遗留与下游

- 模板与 skills（新建项目 `workflow_mode: fast` 模板、skills 分平台、未来功能标注）→ **stage-76**
- docs/README/CHANGELOG 与版本 1.1.6→1.1.7 收口 → **stage-77**
- **后续版本收敛项（REV-75-016）**：`flow.json` 冗余字段三写入点收敛为 `FlowManager` 单方法
- 未 commit / 未 push / 未 publish（op 显式边界，由 Feel/用户裁定）

> 归档方式：手工生成摘要（沿用先例，未运行 `openfeel archive` CLI 以避免其副作用）。
