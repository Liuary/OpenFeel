# v1.1.7-stage-76 计划 — 模板与 skill 模式感知（标记双读者 ②）

- **阶段**：`v1.1.7-stage-76`
- **依赖**：**hard: `v1.1.7-stage-74` `v1.1.7-stage-75`**（标记语义与命令面均已定稿，模板才可引用）
- **优先级**：P0（**Agent 行为契约**面：决定 fast 下谁被调度、谁轻量化）
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-11
- **定位**：实现「标记双读者」的**第 ② 位读者**——Agent 读 `status.md「工作流模式」`自知是否被调度 / 是否轻量化产出。改造面 = **Agent 模板（2 harness × 2 语言对称）** + **中立共享 skills** + build 重生成。**不减任何落盘结构**（骨架全量铺由 CLI 保证，见 stage-75 T6）。
- **范围**：`src/core/templates-data/opencode/agents/{zh-CN,en}/{feel,openfeel-planner,openfeel-schemer,openfeel-executor,openfeel-reviewer,openfeel-feel-tester,openfeel-archiver}.md`、`src/core/templates-data/claude/agents/{zh-CN,en}/`（同名 7~9 份）、`src/core/templates-data/skills/{openfeel-cli-usage,openfeel-get-stage-status,openfeel-update-stage-status,openfeel-wizard,openfeel-recover}/SKILL.md`（按需）、`src/core/template-loader.ts`（**build 重生成，禁手改**）；`test/core/templates.test.ts`、`test/core/template-loader.test.ts`、`test/core/claude-adapter.test.ts`。
- **边界**：不改 CLI 代码（引擎/命令面冻结于 74/75）；不改 phase 枚举；不改 `agents-md` / `claude/constraint`（中立全局约束，**不含**模式纪律——模式纪律属 Agent 层）；不新增 skill；不改 CI；不新增依赖。

## KB 检索（`openfeel-check-kb`）

- 已加载。**高度相关条目**：
  - `kb/patterns.md #平台无关化「描述泛化」原则` → 模式纪律措辞须**能力名中立**（不绑定单一 harness 工具名）；涉及 harness 特化处用「`### opencode 适配器` / `### Claude Code 适配器`」双平台分节（v1.1.6-stage-70 既定模式）。
  - `kb/patterns.md #多 harness 版本载体清单扩展` + `kb/troubleshooting.md #双层模板源发散` → 模板改动须 `npm run build` 重生成 `template-loader.ts`；**2 harness × 2 语言共 4 份对称**，改后断言键集/关键串一致。
  - `kb/patterns.md #CLI 自描述集合的「存在视图 vs 推进白名单」区分` → 模板中的相位/流转描述必须**与 CLI 同一来源口径**（`flow mode` / `flow phases`），避免文案与实现分叉（历史 REV 教训）。
  - `kb/patterns.md #写策略按资产归属二分`（部署面）→ 本阶段不涉部署写入，仅内容源。
  - **无**「模式感知模板纪律」条目 → 归档时补沉 patterns。

## 一、背景与实测证据

| 事实 | 位置 | 结论 |
|------|------|------|
| Agent 模板面 = opencode 9×2 + claude 9×2（含 `feel`） | `templates-data/{opencode,claude}/agents/{zh-CN,en}/` | 模式纪律改动**必须 4 份对称**（feel.md 为调度中枢） |
| 现有相位叙述散点：`plan_review`/`scheme_*`/`test_*` 表、相位白名单串 | `opencode/agents/zh-CN/{feel,openfeel-archiver,openfeel-executor}.md`（claude 同构） | 需**并列**补 fast 链说明（**不得**删 full 说明） |
| skills 权威源 = 中立共享源 `templates-data/skills/**` | v1.1.6-stage-68 迁入 | 单一源改动，两 harness 同时获益 |
| `template-loader.ts` 为 build 生成段（禁手改） | `build.js` 8 步 + 既有断言 | 改模板后必须 `npm run build`（×2 幂等） |
| 模板测试面 | `test/core/templates.test.ts` / `template-loader.test.ts` / `claude-adapter.test.ts` | 静态断言为主（无行为级 E2E，沿用既有口径） |
| 既有 op 骨架/相位骨架日志说明 | `feel.md`「关键操作…自动创建骨架文件」 | fast 下 `test_pending` 不再出现 → 文案须防误导 |

---

## 二、目标语义（Agent 侧模式契约）

| 环节 | full（现状，逐字保留） | fast（新增说明） |
|------|------------------------|------------------|
| Feel 调度 | planner → plan_review（reviewer）→ schemer → executor → reviewer → tester → archiver | planner（**轻量**）→ executor → reviewer（**单轮**）→ archiver（**轻量**）；**不派发 schemer / tester** |
| planner | 完整计划文档 | **轻量**产出（口径见 Q4 定稿；**不得**省略任务表 / 依赖 / 验收要点） |
| reviewer | 计划审查 + 代码审查（多轮位点） | **单轮**（exec 后一次；`review_failed` 回环可重审 / 回执行修复）；**质量底线不变**（问题照记、阻断照留） |
| archiver | 归档全量清单 | **轻量**归档（口径见 Q4；**不得**省略状态记录 / 知识暂存判定） |
| 读取方式 | 读 `flow.json` / `status.md` | **读 `status.md「工作流模式」`**（缺失 → 视作按级联口径的回落值；Agent 侧以 CLI `flow mode` 为权威查询） |
| 骨架 | 全量 | **全量（不变）**；仅 Agent 接力环节减少 |

**不变量**：
1. **质量底线不可跳**：reviewer 在 fast 下**必跑一次**；`review_failed` 必须留痕（REV 条目照常）。
2. **full 文案逐字保留**：新增为**并列**描述，不得改写/删除 full 路径叙述（跨 harness diff 断言：opencode 关键串零回归）。
3. **端口中立**：模式纪律为中立表述；工具名差异走双平台分节。
4. **单一来源**：模板中相位/流转/模式取值口径必须与 CLI 输出一致（检索核对）。
5. **骨架全量**：任何模板**不得**写「fast 跳过 XX 文件/骨架」。

---

## 三、变更点清单（编号 T）

### T1 — `feel.md` × 4（调度中枢，最重）
- 新增「**工作流模式**」小节（置于自动推进决策纪律附近）：读取方式（`status.md` / `openfeel flow mode`）、fast 下的调度表（§二）、**不派发 schemer/tester**、reviewer 单轮、archiver/planner 轻量、`review_failed` 回环语义。
- 修正散点：相位骨架日志句（`test_pending` 在 fast 下不出现）、相位白名单枚举句（补「fast 子集」注记）。
- **4 份对称**：`opencode/{zh-CN,en}` + `claude/{zh-CN,en}`；仅工具名（`question`/`AskUserQuestion`）等既有 harness 差异保留。

### T2 — subagent 模板模式感知（按需最小改）
- `openfeel-planner`：fast 轻量产出边界（保留任务表/依赖/验收；Q4 定稿后落文）。
- `openfeel-executor`：fast 下相位路径（`plan_passed → exec_running`；`review_failed → exec_running` 回环）+ 相位白名单串补注记。
- `openfeel-reviewer`：fast 单轮纪律 + 失败回环留痕要求。
- `openfeel-archiver`：fast 轻量归档清单口径（Q4）。
- `openfeel-schemer` / `openfeel-feel-tester`：**不删职责**，补一行「fast 模式下本 Agent 不被调度（由 Feel 依据模式跳过）」——防误以为流程缺失。

### T3 — skills 收口（中立共享源）
- `openfeel-cli-usage`：15 phase 表 + **fast 快线链 7 键**并列、`workflow_mode` 三层载体与级联、新命令（`flow mode` / `plan stage add --workflow-mode` / `stage set --workflow-mode`）、`config effective` 四键。
- `openfeel-get-stage-status`：字段清单增「工作流模式」+ 模式分支建议（fast 下下一步建议不指向 scheme/test）。
- `openfeel-update-stage-status`：状态与模式字段的边界（模式字段**不由**状态更新覆盖）。
- `openfeel-wizard`：模式选型交互说明。
- 每处改动静默保 opencode 既有措辞（双平台分节/并列）。

### T4 — build 重生成与静态断言
- `npm run build` × 2（幂等；`template-loader.ts` **禁手改**；`git status --porcelain src/` 空）。
- **断言面**（加入既有模板测试文件）：
  1. 4 份 `feel.md` 均含模式小节关键句（fast 不派发 schemer/tester、reviewer 单轮）；
  2. opencode 既有关键串**零回归**（如自动推进决策纪律原文、相位骨架句原意）；
  3. 模板中**不出现**「fast 跳过骨架/文件」类表述；
  4. 模板相位口径与 `getDefaultPipelineConfig('fast')` 键集**一致**（含 `review_failed → exec_running`）；
  5. 失败留痕要求存在于 reviewer 模板（fast 单轮 + REV 照记）。

### T5 — 门禁
`npm run build` ×2 → `npm test`（0 skipped / 0 failed）→ `tsc` = 0 → `lint i18n` 新基线登记（模板非 i18n 键域，预期不变）→ `lint kb` = 0 → 跨 harness 对称 diff 报告（4 份 feel.md 人工 + 断言）。

---

## 四、验收要点（阶段级）

1. 4 份 `feel.md` 模式纪律对称；fast 调度表与 CLI 表口径一致（断言 4）。
2. full 叙述零回归；无「fast 跳过骨架」表述（断言 2/3）。
3. skills 权威源改动同步生效（`template-loader.ts` 重生成、`git status` 干净）。
4. 门禁全绿；模板静态断言全部通过。
5. Q4（轻量化口径）已与用户确认并落文（**未确认前不得自造约束**）。

## 五、风险

| # | 风险 | 缓解 |
|:-:|------|------|
| R-76-1 | 模板改动致调度错链（fast 漏跑 reviewer / 误跑 tester） | 断言 1/5 + full 零回归断言 |
| R-76-2 | full 文案被无意改写 | 关键串零回归断言 + 逐文件 diff 复核 |
| R-76-3 | 手改生成段被 build 覆盖（或反之漏重生成） | `git status --porcelain src/` 空断言 |
| R-76-4 | 轻量化口径自造 | Q4 须用户确认后落文 |

> 说明：op 级拆分（建议 op-001 T1、op-002 T2/T3、op-003 T4/T5）由 openfeel-schemer 定稿并落 `ops/deps.yaml`。
