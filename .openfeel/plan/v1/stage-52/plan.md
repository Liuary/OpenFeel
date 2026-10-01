# v1.1.2-stage-52 — 反馈 09（可编排性/可观测性）+ 遗留项清账

> **版本**：v1.1.2（**继续，不新建版本**） | **创建日期**：2026-10-01 | **Planner**：独立 openfeel-planner
> **来源**：① 反馈原文 `docs/phase-5/09-openfeel-automation-feedback.md`（8 条）；② v1.1.2 遗留清单 L1~L8
> **用户重要指示（必须贯彻）**：「因为两边项目运行时间不一样，如果出现重复项仅标记后验证一下，未必还存在相同问题」→ 本计划对**每一条**（F1~F8 与 L1~L8）**均先在当前代码上实测验证**，给出「仍存在 / 已解决 / 部分存在」；**已解决的仅登记、不修**。

---

## 一、背景与动机

反馈 09 聚焦「**长时间、多阶段自动推进**」场景的三类缺口：**批量编排**（一次到位/批量校正）、**机器可读**（`--json`/UTF-8）、**自愈恢复**（`--fix`/空模板检测）。

本阶段在**当前代码**上逐条复核（下游基于较旧版本，多项已由 v1.1.2 主线修复），再决定纳入范围。**实测环境**：node v24 / win32（pwsh 7）/ 仓库 HEAD（stage-51 已归档）；门禁基线 **56 文件 / 869 用例**、`lint i18n` **649 键**、`lint kb` **0 过期**。

---

## 二、反馈 09 逐条验证（F1~F8）

| # | 反馈主张 | 实测结论 | 证据（当前代码） | 纳入本阶段 |
|:--:|----------|:--:|------------------|:--:|
| **F1** | 无 `--json` + 控制台中文乱码 | **部分存在** | `--json` **仅** `flow phases`（`src/commands/flow.ts:338`、`:356`）与 `instructions`（`src/commands/instructions.ts:19`）；`flow status/current/health/metrics/overview` **无** `--json`。`rg "NO_COLOR\|no-color\|setDefaultEncoding\|stdout.encoding\|chcp"` **0 命中**。乱码：实测 `powershell.exe`（5.1）`[Console]::OutputEncoding` = **gb2312**、`cmd /c chcp` = **936** → 环境条件成立；但 pwsh 7 下不可复现（见 **B7/B9**） | 是 → **B1**（`--json`）+ **B7/B9**（编码） |
| **F2** | 无状态批量校正 | **仍存在** | `advanceStagePhase`（`src/core/flow-manager.ts:1245-1250` 附近）只更新 flow.json 的 `stage.status`/`current`，**从不写 status.md**；status.md 仅由 `flow stage set`（`src/commands/stage.ts:207`、`:429`）写；`flow health` 仅 `--quick`（`flow.ts:1234-1236`），**无 `--fix`**；无 `flow sync`。实测本仓 `flow health` 一致 28/28（无存量） | 是 → **B2** |
| **F3** | 正常中间态误报错误 | **已解决** | `checkFlowJson` 在 `current.op` 为空时跳过（`flow-manager.ts:3034`）；`syncCurrentOp` 未命中置空（`:1141-1142`）、`addStage` 置 `op:''`（`:1313-1316`）。**附带发现（仍存在）**：`getCurrent()` 在 `op` 为空时返回 `null`（`:668-677`）→ `flow current` 显示「阶段: (无)」，与 flow.json 的 `current.stage` 不一致 | 仅登记；**附带发现** → **B8**（低） |
| **F4** | 中断后无恢复检测 | **仍存在** | 无 `flow ops` 命令；空模板固定 `- [ ] 待补充`（`src/core/plan/scheme.ts:46,49,52`）；`createScheme` 直接注册 `pending`（`:180-194`），无 draft 两阶段；`listSchemes` 返回 content 但 CLI 只打印 stage/opId/title（`src/commands/plan.ts:141`） | 是 → **B3** + **B4** |
| **F5** | 推进只能逐步调用 | **仍存在** | `advance` 用 `hasTransition` 单步判定（`flow.ts:629-646`），非法跳转 exit 1；`getValidTargets` 仅单步（`flow-manager.ts:1555-1566`）；`--dry-run` 仅打印单步（`flow.ts:690-695`） | 是 → **B5** |
| **F6** | op 标题无更新命令 | **仍存在** | `plan scheme` 仅 `create`/`list`/`remove`（`src/commands/plan.ts:109,127,147`），无 rename | 是 → **B6** |
| **F7** | op 文件名含中文（复发） | **已解决** | stage-51 N8：`scheme.ts:251` 固定 `${opIdOf(seq)}.md`，`safeTitle` 已删，标题写内容首行，`extractTitle`（`:77-95`）兼容历史命名。本仓现状：现代命名 + 历史命名共存（**不迁移**，A5 裁定） | 仅登记 |
| **F8** | 日志双布局（复发） | **已解决（按 A7 裁定）** | 未来写入唯一嵌套（`src/core/public-logger.ts:172-183`）；历史扁平目录只读不迁移（`:172-173`、`:300-302`），索引层说明共存 | 仅登记 |

> 结论：8 条中 **3 条已解决**（F3 主体 / F7 / F8）→ **仅登记不修**；**1 条部分存在**（F1）+ **4 条仍存在**（F2/F4/F5/F6）→ 纳入。

---

## 三、遗留清单逐条验证（L1~L8）

| # | 遗留项 | 实测结论 | 证据 | 纳入本阶段 |
|:--:|--------|:--:|------|:--:|
| **L1** | `view add` 下版本移除 | **仍存在（计划性移除）** | stage-51 已加弃用文案；命令仍在（`src/commands/view.ts:42-88`）。**用户裁定 A4：本阶段直接删除**（含 i18n/文档/测试清理 + CHANGELOG `Removed`）；`view` 组保留（`list`/`accept`，见 §5.6） | **是 → op-009** |
| **L2** | 覆盖缺口「7 族待补」 | **部分已解决**（**7 → 3 族**） | 实测 `src/commands`（16 族）vs `test/commands`（现含 config/flow/init/knowledge/lint/migrate/model/plan/roadmap/setup/stage/update/view + flow-migrate/init-error/shared-errors）→ **仅 `archive`/`instructions`/`project` 3 族无直接测试**（stage-50 R5 的另 4 族已补：`cli/*`、`knowledge`、`lint`、`roadmap`） | 是 → **op-010**（补 3 族） |
| **L3** | `lint --warn-only` 逃生阀 | **用户已裁定不加** | — | 否（登记） |
| **L4** | coverage 阈值 | **用户已裁定暂不设**（仅报告） | `package.json` 有 `@vitest/coverage-v8`；无阈值配置 | 否（登记） |
| **L5** | `console.warn` 中文文案待统一 | **仍存在** | 硬编码中文 warn 实测多处：`src/commands/flow.ts:673,727-729`、`src/core/flow-manager.ts:605,1469,1478,1500,2164`、`src/core/config.ts:287,320`、`src/core/update-infos.ts:165`、`src/core/workspace/identity.ts:161`（en 模式下泄漏） | 是 → **op-007**（低/中） |
| **L6** | 历史日志布局不迁移 | **既定裁定（登记）** | 同 F8；A7 用户裁定 | 否（登记） |
| **L7** | `flow health` 文件孤儿治理入口 | **仍存在（存量可复现）** | 实测 `node bin/openfeel.js flow health` → 「⚠️ 孤儿操作方案: 键孤儿 **0** 个、**文件孤儿 62 个**」；`flow repair --dry-run` 完整列出 62 条（`v1.0.0-stage-01.op-000` … `v1.1.1-stage-01.op-005`），且「待修复问题」**为空** → **A2 机制只报/只清「键孤儿」，文件孤儿（有文件无注册）无清理入口** | 是 → **op-008**（低） |
| **L8** | `kb-dedup` CRLF 去重失效根因 | **仍存在（严重，已量化复现）** | `src/utils/kb-dedup.ts:54` `content.split('\n')` 未归一化 CRLF → `:62` 行头正则 `...\)$/` 对残留 `\r` **不匹配** → 条目被静默跳过。**实测**：`patterns.md` `## [+]` 严格解析 **2** 条 vs 去 CR 后 **105** 条；`troubleshooting.md` **0** 条 vs **31** 条（本仓 `patterns.md` 含 **2800** 处 CRLF、`troubleshooting.md` **760** 处）→ **`openfeel knowledge dedup`（stage-51 A6 新增）对两文件几乎完全失效** | 是 → **op-008**（**高价值，与 A6 直接相关**） |

---

## 四、纳入本阶段工作项（B1~B9）与 op 划分

| 工作项 | 来源 | 优先级 | op | 说明 |
|:--:|:--:|:--:|:--:|------|
| **B1** | F1 | **高** | op-001 | `flow status/current/health/metrics/overview` 增 `--json`，与 `flow phases --json` 口径对齐 |
| **B8** | F3 附带发现 | 低 | op-001 | `flow current` 在无 op 时显示改进（回退显示 `current.stage` + 「(无 op)」） |
| **B7** | F1 | 中 | op-002 | 输出编码保障（UTF-8 显式化）+ 尊重 `NO_COLOR`/`--no-color` |
| **B9** | F1（可选/待实测） | 低 | op-002 | 在**真实 Windows PowerShell 5.1** 交互终端复现以确认 A7/B7 必要性（若不可复现 → 按低优先或仅登记） |
| **B2** | F2 | **高** | op-003 | 状态对账/自愈：`flow health --fix`（以 flow.json 为权威回写 status.md **「状态」字段**）+ 可选 `flow sync` |
| **L7** | 遗留 | 低 | op-003 | files孤儿治理入口（文件孤儿 62 条；默认只报告已具备，须裁定是否加清理开关） |
| **B5** | F5 | 中 | op-004 | `advance --to` 沿 transitions 自动逐步 + `--dry-run` 打印完整路径 |
| **B3** | F4 | 中 | op-005 | `flow ops list [--stage]`（state + 模板填充度 + 空模板 warning） |
| **B4** | F4 | 中 | op-005 | `plan scheme create --draft` + `plan scheme publish`（draft → pending；空模板禁止发布） |
| **B6** | F6 | 中 | op-006 | `plan scheme rename <stage> <opId> --title "…"` |
| **L5** | 遗留 | 低/中 | op-007 | `console.warn` 中文文案 i18n 化（en 泄漏收敛） |
| **L8** | 遗留 | **高** | op-008 | `kb-dedup` CRLF 归一化修复（+ 与 `openfeel knowledge dedup` 的阈值噪声评估） |
| **L2** | 遗留 | 低 | op-010 | 补 3 族命令层测试（`archive`/`instructions`/`project`）+ 全量回归与门禁 |
| **A4** | L1（用户裁定） | 中（**破坏性**） | **op-009** | **移除 `view add`**（命令 + i18n + 文档 + 测试 + CHANGELOG `Removed`）；保留 `view list`/`accept` 与 `addReviewEntry` 单点 |
| **C1~C4** | 约束体系精简 + 硬编码阈值定性化（用户裁定 2026-10-01） | 中 | **op-011** | C1 「简洁约束」按精简草案改写（去硬编码/去重复/定性）；C2 B 组阈值定性化（保留 D 组工程阈值）；C3 根 `AGENTS.md` 对齐模板源（删多余 bullet + 括号）；C4 「14 个 Skill」计数漂移 → 17 |

**op 数 = 11**（op-001~011；op-009 = A4 移除 `view add`，op-010 = L2 补测 + 全量回归与门禁，op-011 = C1~C4 约束体系精简与阈值定性化）。

### 7.1 **op-011 逐处改动点（`文件:行号` → 原文 → 改后）**

#### C1 简洁约束改写（模板权威源 + 根 AGENTS.md 对齐）

| # | 文件:行号 | 原文（摘要） | 改后 | 依据 |
|:--:|-----------|--------------|------|------|
| C1-1 | `src/core/templates-data/agents-md/zh-CN.md:27-34` | `2. 设计应保持简洁…` + 4 个 bullet（含「新增或修改文件超过 3 个」）+「阈值自动降低」+ 代码/架构两层说明 | **单行**：`2. 设计应保持简洁，避免过度设计。引入无复用需求的抽象层、为单一功能引入第三方依赖、或为未确定的未来预留扩展点时，须先与用户确认。` | C1（用户采纳文案） |
| C1-2 | `src/core/templates-data/agents-md/en.md:27-34` | `2. Keep the design simple and avoid over-engineering.` + `- Adding or modifying more than 3 files` + `When the user explicitly requests a simple implementation, the above thresholds are automatically lowered.` + 两层说明 | **单行语义对等**：`2. Keep the design simple and avoid over-engineering. Confirm with the user before introducing an abstraction layer with no reuse need, adding a third-party dependency for a single feature, or reserving extension points for an undecided future.`（**不得**出现 `more than 3 files` / `thresholds are automatically lowered`） | C1 |
| C1-3 | `AGENTS.md:30-38` | 同 zh-CN 模板但**多**一条 bullet「计划中包含过多未来扩展点」，且第 2 条含括号「（基类、中间件、设计模式包装）」 | **逐字对齐 C1-1**（删多余 bullet ±括号） | C3（消除单侧未回灌漂移） |

> **C1/C3 行数一致性**：zh/en 各变为 **1 行**，`test/core/templates.test.ts:24-40` 的「图体行数一致」断言抽取的是 **lifecycle ASCII 块**（含 `pending/open`），**不受本段影响**（见 §十 翻转清单）。

#### C2 B 组定性化（逐处）

| # | 文件:行号 | 原文（摘要） | 改后（定性判据） |
|:--:|-----------|--------------|------------------|
| C2-1 | `templates-data/opencode/agents/{zh-CN,en}/feel.md:216-220` | 分档表：`单文件修改 ≤ 30 行` / `跨文件或 > 30 行` / `≥ 2 个阶段或 ≥ 5 个文件` | 行改为**定性档**：`微小改动（单文件、无跨文件影响）` / `跨文件改动` / `多阶段规模化改动（跨模块或需求边界不清）`；表头「规模」保留 |
| C2-2 | `.../{zh-CN,en}/feel.md:222`（en `:222`） | `> 满足行数或文件数任一阈值即升级到对应档位。` / `Meeting either the line count or file count threshold upgrades…` | 改为 `> 按改动的**波及面**选择档位（是否跨文件、是否跨阶段/跨模块）。` / `> Choose the level by the **blast radius** of the change (cross-file? cross-stage/module?).` |
| C2-3 | `.../{zh-CN,en}/openfeel-planner.md:20-22` | `≥ 2 个 stage`、`≥ 5 个文件变更`、`< 5 个文件`、`≤ 30 行修改` | 改为 `多阶段或跨模块架构变更`、`需求边界清晰但存量面较大`、`局部改动（单点/单模块、无需架构调整）` |
| C2-4 | `.../{zh-CN,en}/openfeel-planner.md:45-49` | 三档表：`单阶段、< 5 个文件` / `1 个阶段但 ≥ 5 个文件` / `≥ 2 个阶段` | 三档表判据改定性：`单模块、局部改动` / `单阶段但涉及面较广或需求模糊` / `多阶段或跨模块` |
| C2-5 | `.../{zh-CN,en}/openfeel-planner.md:61`（zh）/`:69`（en） | `轻微偏差（文件增减 ≤ 2、阶段描述微调）` / `Stage count change ≥ 2` | 改为 `轻微偏差（文件小幅增减、阶段描述微调）` / `material deviation (stages added/removed, objectives redefined)` |
| C2-6 | `.../{zh-CN,en}/openfeel-planner.md:109` | `仅在「大规模」场景下（≥ 2 阶段或跨模块架构变更）唤起` | 删去括号内数值 → `仅在「大规模」场景（多阶段或跨模块架构变更）唤起` |
| C2-7 | `.../{zh-CN,en}/openfeel-planner.md:28`（en）/ 对应 zh | `…or the scale thresholds above are reached.` | 改 `…or the change is clearly cross-module/cross-stage in nature.` |
| C2-8 | `.../{zh-CN,en}/feel.md:228`（en）/ 对应 zh | 同上「scale thresholds above are reached」 | 同 C2-7 定性化 |
| C2-9 | `templates-data/opencode/skills/openfeel-tool-usage/SKILL.md:15` | `若任务涉及「≥3 个独立步骤」…` | 改为 `若任务涉及多个独立步骤（多文件改动、需跨会话跟踪等）…` |
| C2-10 | `.../openfeel-tool-usage/SKILL.md:18` | `存在 ≥2 个同等合理方案…` | **观察项（可选）**：属「方案数」而非 C2 列举的四类；Planner 建议**一并定性化**为「存在多个同等合理方案」，若用户认为不必则保留 |
| C2-11 | `.openfeel/dev/dev_core.md:48/67/74/85` | 数值阈值（3 个以上独立任务 / 2 个同等合理 / 不超过 3 个选项 / 2~3 个 explore agent） | **保持历史不动**（该节为 `## [-] Agent 工具使用规范`，`dev_core.md:38`，已禁用条目） |
| C2-12 | `.../{zh-CN,en}/feel.md:401`（zh）/`:401`（en） | `审查是否完成？（单文件 ≤30 行且无跨文件影响可跳过审查，需记录理由）` | **Planner 裁定：定性化主判据 + 30 行降为括号参考值** → `审查是否完成？（微小改动：单文件、无跨文件影响，可跳过审查，需记录理由；参考：单文件 ≤30 行）`。理由：该处属**审查豁免判定**（同属规模域），与 C2 精神一致；保留 30 行作参考可维持可操作性、减少争议 |
| C2-13 | **保留 D 组**（不动） | `reviewer.md`/`feel-tester.md` 的 `<200 行 / ≥80% 覆盖率`、`≤3 层嵌套`、重试次数、日志 30 条、相似度阈值、`≤10 行摘要` | 工程阈值，不在 C2 范围 |

#### C4 计数漂移修正（「14 个 Skill」→ 17）

| # | 文件:行号 | 原文 | 改后 |
|:--:|-----------|------|------|
| C4-1 | `src/core/templates-data/opencode/ADAPTER.zh-CN.md:3` | `包含 9 个 Agent 定义和 14 个 Skill` | `…和 17 个 Skill` |
| C4-2 | `.../ADAPTER.zh-CN.md:9` | `.opencode/skills/` — 14 个 Skill 定义（14 个名字，缺 cli-usage/tool-usage/workspace） | `17 个 Skill 定义` + 补齐 `openfeel-cli-usage`、`openfeel-tool-usage`、`openfeel-workspace` |
| C4-3 | `.../ADAPTER.en.md:3` | `9 Agent definitions and 14 Skills.` | `…and 17 Skills.` |
| C4-4 | `.../ADAPTER.en.md:9` | `.opencode/skills/` — `14 Skill definitions (…)` | `17 Skill definitions` + 补 3 名 |
| C4-5 | `.openfeel/manual/core/template-loader.md:25` | `列出全部 skill 名（14 个，均带 `openfeel-` 前缀）` | `（17 个…）` |
| C4-6 | **全仓扫描结论** | `rg "14 个 ?[Ss]kill\|14 skills\|14 个 Skill"` → 命中仅 **ADAPTER.zh-CN.md:3,9 / ADAPTER.en.md:3,9 / manual/core/template-loader.md:25**（+ 本计划自述） | 上述 5 处即全部；**「9 个 Agent / 9 Agent」均正确（无漂移）**；`docs/agent-tool-compatibility-fix.md:192/470/524` 为**历史文档**（不回改，符合「历史归档只读」） |

### 7.2 build 传播与部署说明

- **权威源改动 → `npm run build`** 重生成：`AGENTS_MD_TEMPLATES`（`template-loader.ts` 生成段）、`OPENCODE_CONFIG_TEMPLATES`（ADAPTER）、`AGENT_TEMPLATES`（feel/planner 双语）、`OPENCODE_SKILL_DEFINITIONS`（tool-usage），并重生成 `.opencode/agents|skills|ADAPTER.md` 自举副本（含生成标记）。**禁止手改生成段**。
- **根 `AGENTS.md`（C1-3）为手写主文档、无受管区** → 直接编辑，不涉 build。
- **`manual/core/template-loader.md`（C4-5）为内部模块手册** → 直接编辑。
- **部署产物 `~/.config/opencode/AGENTS.md`**：由 `openfeel setup` 更新；**本阶段不自动执行**（不触碰真实全局目录）→ **验收中说明**：用户需运行 `openfeel setup`（或由发布流程）才能让全局约束生效。

### 7.3 op-011 验收标准（含 `rg` 零残留）

1. `rg -n "超过 3 个" src/core/templates-data AGENTS.md` → **零命中**；
2. `rg -n "more than 3 files" src/core/templates-data AGENTS.md` → **零命中**；
3. `rg -n "阈值自动降低|thresholds are automatically lowered" src/core/templates-data AGENTS.md` → **零命中**；
4. `rg -n "计划中包含过多未来扩展点" AGENTS.md src/core/templates-data` → **零命中**；
5. `rg -n "14 个 ?[Ss]kill|14 skills|14 个 Skill" src/core/templates-data .openfeel/manual` → **零命中**；
6. C2 目标位点：B 组数值判据（`≥ ?2 个 ?stage|< ?5 个文件|≤ ?30 行|≥ ?3 个独立步骤`）在 `feel.md`/`planner.md`/`tool-usage` 中**仅余 C2-12 的「参考：单文件 ≤30 行」**（人工核对）；
7. `npm run build` 幂等（重跑零 diff）且模板一致性校验通过；`.opencode/**` 自举与权威源一致；
8. `zh-CN.md` 与 `en.md` 的 C1 段均为 **1 行**（图体行数断言不受影响）。

---

## 五、裁定要点（3 项核心 + 待裁定清单）

### 5.1 **B2 实现形态**（三选一裁定）

**裁定：采用 `flow health --fix`（批量）+ 不做 `advance` 自动写 status.md + 不新增 `flow sync`。**

理由：
1. **覆盖面**：反馈场景是「11 个阶段批量校正」→ `health --fix` 一次覆盖，正是诉求；`advance` 自动同步只能覆盖「未来每一次推进」，无法处理**既有存量**。
2. **副作用面**：`advance` 已写 flow.json（+ 可能 git commit）；再写 status.md 会扩大多文件写入面与失败中间态（部分成功），且需精确字段定位（风险高）。
3. **与 `flow stage set` 语义/测试无冲突**：不改 `advance` → 既有测试（`flow.test.ts` 等）不受影响；`--fix` 为**新增**路径。
4. **不新增 `flow sync`**：避免多命令面（`health --fix` 语义已自洽：「健康检查 + 修复」）。

**「以 flow.json 为权威」是否正确？→ 仅对「状态」字段成立**：
- status.md 的 `- **状态**：{value}` ↔ flow.json `stages[].status` 为**同一语义**（由 `mapPhaseToStageStatus` 派生）→ 以 flow.json 回写**正确**。
- status.md 的**执行模式 / 自动推进 / 当前任务 / 状态记录表**等字段 **独立于 flow.json**（分别来自 config.yaml 级联与人工/Agent 维护）→ **绝不可**由 `--fix` 覆盖。
- **约束**：`--fix` 仅回写「状态」字段（+ 可选追加一行「状态记录」，见待裁定 A2）；`--fix` 与 `--dry-run` 可组合（预览将修改的阶段与新旧值）。

### 5.2 **B4 schema 兼容**（`draft` 对 `op.state` 取值域的影响）

**裁定：引入 `draft`，采取「窄兼容」策略。**

- 现状 `op.state` 取值域：`pending` / `executing` / `done`（+ 极端场景 `skipped`）。新增 `draft` = **取值域扩大**（向后兼容：既有数据不变）。
- **窄兼容约束**：
  1. `flow health` 对 `draft` op **不报**「空模板」warning（draft 本就允许空）；
  2. `advance` / 完成度统计 / 归档**不计入** `draft`（视为「未发布」）；
  3. `flow ops list` 将 `draft` **单独分组**展示；
  4. 既有 70+ op（全为 `pending` 等）**零影响**；本仓存量实测无 `draft`；
  5. **（REV-52-002 补）`flow attempt` 对 `draft` op 拒绝**：exit 1 + i18n 提示「该 op 处于 `draft`（未发布），请先 `openfeel plan scheme publish <stage> <opId>`」——draft 未发布即记录执行结果（pass/fail、attempts 递增）语义矛盾。**实现位置**：命令层 `src/commands/flow.ts:675-702`（attempt action，在 `recordAttempt` 前守卫）+ core 层 `flow-manager.ts` `recordAttempt`（`:1791-1859`）加兜底守卫（双层，便于 API 调用方亦被拦截）。
- **发布路径**：`plan scheme publish <stage> <opId>`：校验模板非空（无 `- [ ] 待补充` 残留）→ 置 `pending`；空模板 → exit 1 并提示。

### 5.3 **B5 语义**（多步推进）

**裁定：「内部循环调用单步」+ 保留非法跳转拒绝 + 不做中间态回滚。**

- **实现**：`advance --to <phase>` 时，由 `getValidTargets` 沿 transitions **求唯一可达路径**（BFS，深度限制 ~8）；沿路径**逐步调用** `advanceStagePhase`（保留每步的校验/日志/checkpoint 语义），而非「一次跨多相」。
- **保留拒绝语义**：无路径 / 多义路径 → **exit 1** 并列出可达目标（与现状一致，反馈亦称「拒绝是正确的」）。
- **默认行为（待裁定 A3）**：建议「**仅当显式提供 `--to` 且存在唯一路径时**自动逐步」；未提供 `--to` 的既有单步调用**行为不变**。
- **中间态**：路径上的每一步都是**合法推进**（非事务）→ 失败时**不回滚**已完成步；`--dry-run` 打印**完整路径**（`A → B → C`）且不写盘。
- **日志**：每步各写一条 `advance_stage_phase` 日志（可读性优于合并为一条）。

### 5.3a **REV 阻塞复检语义（REV-52-001 补明确）——裁定：论证等价（主）+ 进入 done 前复检（防御性加固）**

**实测事实**：
- REV 阻塞检查**位于命令层且仅在 `--to done` 时**生效：`src/commands/flow.ts:658-667`（「REV 闭环（命令层兜底）：推进到 done 时检查 blocking REV」），过滤条件 `r.blocking !== false && r.status === 'open'`（`:664-666`）。
- 「中间步新增 blocking REV」的**唯一可能来源**是 `addAutoFixReview`（`flow-manager.ts:2145`），而它**只由** `addReviewEntry`（`src/core/view/entry.ts:168`，即 `flow review add --auto-fix`）调用；**`advance` 路径不创建任何 review**。
- **关键等价论证（主裁定）**：`addAutoFixReview` 在 `addReview` 之前**强制 `item.status = 'resolved'`**（`flow-manager.ts:2172`，注释「状态直接为 resolved，跳过 pending→fixing 流程」）→ 该条目**恒不满足**阻塞过滤的 `status === 'open'`，**不可能**成为 blocking open。故多步推进**不会被 `addAutoFixReview` 带入新 blocking 直达 done**。

**Planner 裁定**：**采纳选项②（论证等价）为主**；**并叠加选项① 的低成本加固**——把命令层现有 REV 复检（`flow.ts:658-680`）**抽取为本地函数 `assertNoBlockingOpenRev(mgr, stage, lang)`**，在多步循环**每一步完成后调用（至少进入 `done` 前一次）**；命中新增 blocking → **停止推进并报告剩余路径**。

理由：论证已证明**当前**等价，但语义依赖「`addAutoFixReview` 恒置 resolved」这一**实现细节**；将复检下沉到循环**成本极低**（复用既有检查逻辑，无新语义），可防未来语义漂移（如 autoFixReview 改为 open、或未来在推进路径引入 review 创建）导致的绕过。**单步 `advance` 行为不变**（既有 `--to done` 检查保持）。

- **实现位置**：`src/commands/flow.ts:658-680`（现有检查抽取）+ op-004 新增的多步循环内调用点。
- **验收标准**（两条组合覆盖，均须落地）：
  1. **存量 blocking 在多步下被拦截**：构造 stage 存在 `blocking:true, status:'open'` 的 REV 且路径通往 `done` → 多步 `advance --to done` → **exit 1** + 列出 REV + **不写盘**（`revision` 不变）；
  2. **等价性单测断言**：构造 `addReviewEntry({..., autoFixDetail})` → 断言产出条目 `canAutoFix===true && status==='resolved'`（**证明其不可能成为 blocking open**）；并断言 `advance` 路径不产生任何 review。
  > 说明：「中间步注入 blocking」在**当前实现下不可构造**（advance 不创建 review，且 autoFix 恒 resolved）→ 故以「存量拦截 + 等价性断言」组合替代，并在单测注释中说明该局限（诚实覆盖，不虚构 fixture）。

### 5.4 **B1 `--json` 口径**

**裁定：统一「顶层对象 + `schemaVersion`」，但不强行同构。**

- 新增 `--json` 命令输出**各自领域对象**（`status`/`current`/`health`/`metrics`/`overview`），均含 `schemaVersion: 1`。
- `flow phases --json` 现有结构 `{phases, transitions, advanceAccepted}`（stage-41 起）**保持不变**，仅**追加** `schemaVersion`（兼容增强）。
- **约束**：`--json` 输出**必须为纯 JSON 单文档**（无 ANSI、无前置提示行）；与人类可读输出**互斥**（`--json` 时不打印标题/彩色）。
- `lint i18n` 门禁不受影响；`--json` 文案入 i18n（help 文本）。

### 5.5 裁定表（**A1~A4 用户已裁定 2026-10-01**；A5~A7 按 Planner 建议/待实测）

| # | 条目 | 用户裁定 / 状态 | 兼容性影响 |
|:--:|------|----------------|-----------|
| **A1** | B4 `draft` | **用户裁定：引入 `draft`，窄兼容**（`scheme create --draft` → 填充后 `publish` 转 `pending`；health 不报 draft 空模板 / 归档不计入 / `ops list` 单独分组） | 取值域扩大（向后兼容）；存量 70+ op 零影响 |
| **A2** | B2 `--fix` 写入范围 | **用户裁定：仅回写 status.md 的「状态」字段**（以 flow.json 为权威） | 不触碰执行模式/自动推进/当前任务/状态记录（独立字段） |
| **A3** | B5 多步推进 | **用户裁定：支持自动逐步**（内部循环单步、保留非法目标拒绝、不回滚中间态、`--dry-run` 打印完整路径） | 改变「一次一相」直觉（`--to` 场景）；未提供 `--to` 的行为不变 |
| **A4** | L1 `view add` 移除时机 | **用户裁定：本阶段直接删除**（**与 Planner「下版本」建议相反**）→ 见 **§5.6**（删除范围裁定） | **破坏性变更**（命令面移除）；须 CHANGELOG `Removed` + 迁移指引 |
| **A5** | L8 CRLF 修复方式 | **按 Planner 建议执行**（归一化修复）**+ 显式标注**：解析量 2→105 / 0→31，**须连带评估阈值噪声** | 解析条目数显著上升；`knowledge dedup` 输出量上升 |
| **A6** | L7 文件孤儿 | **按 Planner 建议执行**（**不加清理入口**，仅完善报告 + manual 说明） | 非破坏（无删除行为） |
| **A7** | B7 编码方案 | **待实测**（B9：PS5.1/`chcp 936` 交互终端 vs 管道两场景）→ 实测后定案 | 影响方案选择；避免平台 hack |

### 5.6 **A4 删除范围裁定（`view add` 移除）**

**裁定：删除 `view add` 子命令；`view` 命令组保留（`list`/`accept`）；`addReviewEntry` 单点保留。**

理由（基于实测）：

| 决策 | 依据 |
|------|------|
| **删除 `view add`** | 用户裁定；stage-51 已加弃用文案（`view.ts:46`、运行时 `console.error(t('view.add.deprecated'))` `:53`） |
| **保留 `view` 组**（不废弃整组） | ① **`flow review` 无 `list`**（实测子命令：`add`(`flow.ts:824`)/`resolve`(`:881`)/`update`(`:904`)/`remove`(`:963`)）→ `view list` 是**唯一列出入口**；② **`view accept`（标记 `closed`）与 `flow review resolve`（标记 `resolved`）语义不同**（验收通过关闭 vs 修复完成待验收）→ 不可互替。【故「删除后组为空」不成立】 |
| **保留 `addReviewEntry`** | 单点实现，被 `flow review add` 独占使用（`flow.ts:837`；stage-50 T37 单点化）→ **不得破坏** |
| **移除 `view.ts` 的 `import { addReviewEntry }`** | 删除 `view add` 后仅该处使用（`view.ts:6`）；`list`/`accept` 用 `listReviews`/`acceptReview`；`normalizeAgentName`（`:7`）用途**实施时核对**（若仅 `view add` 用则一并移除） |

**连带清理清单（op-009 任务）**：

1. **代码**：`src/commands/view.ts:42-88`（`view add` 子命令全段，含 `:55-87` 的 action 体）；`:6` import 调整。
2. **i18n**（删除）：
   - 域键：`view.add.deprecated`（`zh-CN.ts:474`）、`view.add.errorInvalidPriorityTmpl`（`:475`）、`view.add.okTmpl`（`:476`）；
   - help 键：`help.view.add`（`:648`）、`help.view.add.op`（`:649`）、`help.view.add.title`（`:650`）、`help.view.add.priority`（`:651`）；
   - **保留**：`help.view.note`（`:647`，指引 `flow review add|update|remove` —— 删除后**更必要**）、`view.list.*`、`view.accept.*`。
   - **注意**：删除后须 `lint i18n` 通过（**R1 后失败非 0 退出**，649 键 → 减少 7 键）。
3. **文档**：`docs/commands.md` 删除 `### view add` 整节（实测 `:349-360` 附近）；`.openfeel/manual/cli/commands.md:73`（`view add` 已弃用条目）删除，`:89` 的「（`view add` 已 deprecated）」改为「（`view add` 已移除）」；`README.zh-CN.md:69`、`README.en.md:69` 的 `openfeel view` 行改为仅 `list / accept`。
4. **CHANGELOG**：**`Removed` 节显著标注**（破坏性变更）+ 迁移指引「改用 `openfeel flow review add`」。
5. **测试**：`test/commands/view.test.ts` 删除 `view add` 用例（实测 `:84`、`:89` 使用 `view add`；含弃用提示用例）→ 保留 `list`/`accept` 用例；确认 `flow review add` 覆盖等价行为（`test/commands/flow.test.ts`）；`rg "view\.add"` **零残留**（含 help 键与测试）。

---

## 六、前置依赖与上下游衔接

- **hard 依赖 `v1.1.2-stage-51`**（已 `done`）：`flow-manager.ts`（`syncCurrentOp`/`advanceStagePhase`/`repair`/`healthCheck`）、`commands/flow.ts`、`commands/plan.ts`、`core/plan/scheme.ts` 均为 stage-51 已改文件 → 必须串行在其后；且 **B3/B4 建立在 stage-51 N8 的 op 命名与 N1 的 op 对账之上**。
- **soft 依赖 `stage-50`**（已 `done`）：`lint` 退出码（R1）已落地 → 本阶段门禁 `lint i18n` 失败非 0 退出。
- **下游**：无固定后继（v1.1.2 收尾）；**L1（`view add` 移除）按用户裁定 A4 在本阶段执行**（破坏性变更，见 §5.6）。
- **顺序**：`… → 50 → 51 → 52`。

---

## 七、op 级任务清单

| op | 主题 | 具体改动点（文件:行号） | 验收要点 |
|:--:|------|------------------------|----------|
| op-001 | **B1 结构化输出 + B8 current 显示** | `src/commands/flow.ts`：`status`（`:41`）、`current`（`:300`）、`health`（`:1234`）、`metrics`（`:325`）、`overview`（`:165`）各增 `--json`（顶层对象 + `schemaVersion:1`；纯 JSON 单文档、与人类可读互斥）；`flow phases`（`:338`）追加 `schemaVersion` 保持既有三键；`src/core/flow-manager.ts` 提供各命令所需结构化访问器（如 `getHealthReport()` 返回 items 数组、`getMetricsSummary()`）；`current` 无 op 时回退显示 `current.stage` + 「(无 op)」（`getCurrent()` `:668-677` 保持返回契约或在命令层回退）；i18n help 键 | `flow status/current/health/metrics/overview --json` 均输出可 `JSON.parse` 的纯 JSON 且含 `schemaVersion`；`--json` 无 ANSI/标题；`phases --json` 三键不变；无 op 时 `current` 可读到 stage |
| op-002 | **B7 编码保障 + B9 实测** | ① `src/cli/index.ts`（入口）与 `bin/openfeel.js`：尊重 `NO_COLOR` / 新增全局 `--no-color`；按 A7 裁定实现编码策略（**先完成 B9 实测**）；② **B9 实测**：在真实 `powershell.exe`（5.1，`chcp 936`）**交互终端**直接运行 `node bin/openfeel.js flow status`，判定是否乱码；同时区分 **TTY vs 管道/重定向**两种场景；③ 实测结论写入 plan §十二 与 manual；④ i18n help 键 | `NO_COLOR=1` 时无 ANSI 转义；`--no-color` 生效；B9 实测结论明确（乱码/不乱码 + 场景 + 依据）；若采纳编码策略则附实测前后对比 |
| op-003 | **B2 状态对账/自愈 + L7 孤儿报告** | ① `src/core/flow-manager.ts`：新增 `reconcileStatusMd({dryRun})`（遍历 stages，比对 flow.json `status` vs status.md「状态」字段，**仅回写差异项**）；`src/commands/flow.ts:1234` `health` 增 `--fix`（**仅「状态」字段**；`--dry-run` 预览；返回修复清单）；② L7：`healthCheck`/`repair` 的**文件孤儿**报告完善（`flow-manager.ts:2455+`）：`health` warn 已具备 → 补 `repair` 的**只读统计**与 manual 说明（按 A6 裁定不加清理）；③ i18n 键 | `health --fix` 将差异阶段回写为 flow.json 状态；**不改**执行模式/自动推进/当前任务/状态记录；`--fix --dry-run` 不写盘且列出差异；文件孤儿报告数量与 `health` 一致（62） |
| op-004 | **B5 多步推进与路径预览** | `src/core/flow-manager.ts`：新增 `findPhasePath(stageName, to)`（BFS，深度 ≤8，唯一路径判定，多义/null → 返回原因）；`src/commands/flow.ts:629-646`/`:690-695`：`advance --to` 在存在唯一路径时**逐步调用** `advanceStagePhase`（每步保留校验/日志/checkpoint）；无路径 → exit 1 + 可达目标；`--dry-run` 打印**完整路径**；**（REV-52-001）** 将 `:658-680` 的 REV 阻塞复检抽取为 `assertNoBlockingOpenRev(mgr, stage, lang)`，**多步循环每步后调用（至少进入 `done` 前）**，命中即停止并报告剩余路径；i18n 键 | 唯一路径时一次调用完成多步且**每步有日志**；多义/无路径 exit 1；`--dry-run` 打印 `A → B → C` 且不写盘；未提供 `--to` 的单步行为不变；**存量 blocking open REV 在多步到 done 时被拦截（exit 1 + 不写盘）**；`addAutoFixReview` 产出条目 `status==='resolved'` 单测断言 |
| op-005 | **B3 op 列表与空模板检测 + B4 draft 两阶段** | ① `src/commands/flow.ts` 新增 `flow ops list [--stage]`（state + **模板填充度**（扫描 op 文件 `- [ ] 待补充` 残留）+ 空模板 warning；`--json` 复用 op-001 口径）；② `src/core/plan/scheme.ts:180-194`：`createScheme(..., {draft})` → `state:'draft'`；新增 `publishScheme(...)`（校验模板非空 → `pending`；空 → 报错）；③ `src/commands/plan.ts:109` 增 `create --draft` 与 `scheme publish`；④ **窄兼容**（§5.2 五条）：`health` 跳过 draft 空模板 warning、`advance`/统计/归档不计入 draft、`ops list` 单独分组、**`flow attempt` 对 draft op 拒绝（`flow.ts:675-702` + `flow-manager.ts recordAttempt:1791-1859` 双层守卫，exit 1 + 提示先 `publish`）**；⑤ i18n 键 | `flow ops list` 显示 state/填充度并对空模板 warn；`create --draft` 生成 `draft`；`publish` 空模板 exit 1、非空转 `pending`；**`attempt --op <draft op>` → exit 1 + 提示**；既有 op 展示与统计不变 |
| op-006 | **B6 `plan scheme rename`** | `src/commands/plan.ts:109+` 新增 `scheme rename <stage> <opId> --title "…"`；`src/core/plan/scheme.ts` 新增 `renameScheme(...)`（改 `stages[].ops[opId].title` + **op 文件内容首行 `# opId：title`**；文件名为 `op-NNN.md` 不含标题，故无重命名文件需求）；appendLog；i18n 键 | rename 后 flow.json 标题与 op 文件首行一致；不存在 op → exit 1；日志留痕 |
| op-007 | **L5 `console.warn` 文案 i18n 化** | `src/commands/flow.ts:673,727-729`、`src/core/flow-manager.ts:605,1469,1478,1500,2164`、`src/core/config.ts:287,320`、`src/core/update-infos.ts:165`、`src/core/workspace/identity.ts:161` → 迁 i18n 键（zh/en 对称，`lint i18n` 门禁）；core 层无 lang 上下文处按现有模式传 `lang` 或使用**无语言前缀的稳定标记**（`[WARN]`） | en 模式下无中文泄漏（`rg` 断言目标位点已无硬编码中文）；`lint i18n` 通过；既有 warn 语义不变 |
| op-008 | **L8 `kb-dedup` CRLF 修复（高）** | `src/utils/kb-dedup.ts:53-54`：读取后统一归一化（`content.replace(/\r\n?/g,'\n')`）；核对 `:62` 行头正则与 `tokenize`（`:103-112`）在归一化后行为；**连带评估** `SIMILARITY_THRESHOLD`（`:31`，0.8）在解析量从 2→105 / 0→31 后的噪声（必要时按 A5 裁定调整或加 `--threshold` 文档）；补 `test/utils/kb-dedup.test.ts` 的 **CRLF 用例** | 归一化后 `patterns.md` 解析 **105** 条、`troubleshooting.md` **31** 条（与去 CR 计数一致）；新增 CRLF 单测通过；`openfeel knowledge dedup` 对两文件输出合理（非空且非噪声爆炸） |
| op-009 | **A4 移除 `view add`（破坏性）** | ① `src/commands/view.ts:42-88` 删除 `view add` 子命令全段；`:6` 调整 import（移除未用 `addReviewEntry`；`normalizeAgentName` `:7` 核对后按需移除）；**保留** `view list`（`:18-40`）/`view accept`（`:90+`）与组注册（`:11-15`）；② **i18n 删除 7 键**：`view.add.deprecated`（`zh-CN.ts:474`）、`view.add.errorInvalidPriorityTmpl`（`:475`）、`view.add.okTmpl`（`:476`）、`help.view.add`（`:648`）、`help.view.add.op`（`:649`）、`help.view.add.title`（`:650`）、`help.view.add.priority`（`:651`）（zh/en 双侧；**保留** `help.view.note:647`）；③ 文档：`docs/commands.md` 删 `### view add` 节（`:349-360`）、`.openfeel/manual/cli/commands.md:73` 删条目 + `:89` 措辞改「已移除」、`README.zh-CN.md:69`/`README.en.md:69` 改仅 `list / accept`；④ **CHANGELOG `Removed` 节显著标注** + 迁移指引（改用 `openfeel flow review add`）；⑤ 测试：`test/commands/view.test.ts` 删 `view add` 用例（`:84`、`:89` 及弃用提示用例），保留 `list`/`accept` | `node bin/openfeel.js view add` → `unknown command`（或 commander 未识别）且 `view list`/`view accept` 正常；`rg "view\.add"` src/test/i18n **零残留**；`rg "view add" docs README* manual` 零残留；`lint i18n` 通过（649→642 键）；CHANGELOG 含 `Removed` 条目；`flow review add` 等价行为测试通过 |
| op-010 | **L2 补 3 族测试 + 全量回归与门禁** | 新增 `test/commands/archive.test.ts`、`instructions.test.ts`、`project.test.ts`（命令层：参数解析/退出码/i18n 输出，复用现有 fixture 与隔离模式）；`npm run build && npm test`（基线 **56 文件 / 869 用例**，新增后 ≥）；`node bin/openfeel.js lint i18n`（**649 键** → op-009 后 **642 键**，失败非 0）；`lint kb`（0 过期）；环境隔离核验（hash+mtime 双快照零 diff） | 3 族有直接测试且通过；四门禁全绿；环境零污染 |
| op-011 | **C1~C4 约束体系精简与硬编码阈值定性化** | 见 **§7.1 逐处改动表**（C1 简洁约束改写 / C2 B 组定性化 / C3 根 AGENTS.md 对齐 / C4 计数漂移）+ **§7.2 build 传播** | 见 §7.1 末「验收标准」 |

**op 数 = 11**（op-001~011；op-009 = A4 移除 `view add`，op-010 = L2 补测 + 全量回归与门禁，op-011 = C1~C4 约束体系精简与阈值定性化）。

---

## 八、影响文件清单

| op | 新增 | 修改（预估） |
|:--:|------|--------------|
| op-001 | — | `src/commands/flow.ts`、`src/core/flow-manager.ts`、`src/core/i18n-data/{zh-CN,en}.ts` |
| op-002 | — | `src/cli/index.ts`、`bin/openfeel.js`、`.openfeel/manual/**`（编码建议/`NO_COLOR`）、`src/core/i18n-data/{zh-CN,en}.ts` |
| op-003 | — | `src/core/flow-manager.ts`、`src/commands/flow.ts`、`src/core/i18n-data/{zh-CN,en}.ts`、`.openfeel/manual/**`（文件孤儿说明） |
| op-004 | — | `src/core/flow-manager.ts`、`src/commands/flow.ts`、`src/core/i18n-data/{zh-CN,en}.ts` |
| op-005 | — | `src/commands/flow.ts`、`src/commands/plan.ts`、`src/core/plan/scheme.ts`、`src/core/flow-manager.ts`、`src/core/i18n-data/{zh-CN,en}.ts` |
| op-006 | — | `src/commands/plan.ts`、`src/core/plan/scheme.ts`、`src/core/i18n-data/{zh-CN,en}.ts` |
| op-007 | — | `src/commands/flow.ts`、`src/core/flow-manager.ts`、`src/core/config.ts`、`src/core/update-infos.ts`、`src/core/workspace/identity.ts`、`src/core/i18n-data/{zh-CN,en}.ts` |
| op-008 | — | `src/utils/kb-dedup.ts`、`test/utils/kb-dedup.test.ts`、`.openfeel/manual/**`（阈值/去重说明） |
| op-009 | — | `src/commands/view.ts`、`src/core/i18n-data/{zh-CN,en}.ts`（删 7 键）、`docs/commands.md`、`.openfeel/manual/cli/commands.md`、`README.zh-CN.md`、`README.en.md`、`CHANGELOG.md`、`test/commands/view.test.ts` |
| op-010 | `test/commands/archive.test.ts`、`instructions.test.ts`、`project.test.ts` | 既有测试（少量断言调整） |
| op-011 | — | `src/core/templates-data/agents-md/{zh-CN,en}.md`、`AGENTS.md`、`src/core/templates-data/opencode/agents/{zh-CN,en}/{feel,openfeel-planner}.md`、`src/core/templates-data/opencode/skills/openfeel-tool-usage/SKILL.md`、`src/core/templates-data/opencode/ADAPTER.{zh-CN,en}.md`、`.openfeel/manual/core/template-loader.md`；`npm run build` 重生成 `src/core/template-loader.ts`（生成段）+ `src/core/update.ts`（生成段）+ `.opencode/**` 自举 |

> 合计约 **22~27 个文件**（**1 个命令删除**：`view add`；无文件删除）；净增/改 **1050~1600 行**（含 6 个新命令/子命令与 `--json` 面；op-011 为等量文本替换，净行数略减）。

---

## 九、完成标准

1. **F1~F8 处置**：已解决的 F3/F7/F8 **仅登记不修**（并在 §二 留证）；F1/F2/F4/F5/F6 纳入并修复。
2. **L1~L8 处置**：**L1（`view add`）按用户裁定 A4 本阶段移除**（op-009，破坏性 + CHANGELOG `Removed`）；L2（3 族）/L5/L7/L8 修复或补测；L3/L4/L6（既定裁定）登记。
3. **门禁全绿**：`npm run build && npm test`（基线 **56 文件 / 869 用例**，≥ 该数）；`node bin/openfeel.js lint i18n`（op-009 后 **649 → 642 键**，**失败非 0 退出**）；`lint kb`（**0 过期**）。
4. **测试隔离硬要求**：`vi.mock('node:os')` / 临时 HOME；不触碰真实 `~/.openfeel/`、`~/.config/opencode/`、`~/.config/openfeel/` 与仓库 `.openfeel/config.yaml`；op-010 以 hash+mtime 双快照核验零 diff。
5. **L8 量化验收**：`patterns.md` 解析 **105** 条、`troubleshooting.md` **31** 条（当前 2 / 0）。
6. **`--json` 口径**：新命令均输出纯 JSON 单文档 + `schemaVersion`；`flow phases --json` 三键不变。
7. 行为变更项（A1 `draft` 取值域、A2 `--fix` 写入范围、A3 `--to` 自动逐步、**A4 移除 `view add`（破坏性）**、A5 CRLF 修复）在 `CHANGELOG.md` 与 manual 同步说明；**A4 须在 `Removed` 节显著标注 + 迁移指引**。
8. **A4 清理完整**：`rg "view\.add"`（src/test/i18n）与 `rg "view add"`（docs/README/manual）**零残留**；`view list`/`view accept` 与 `flow review add`（`addReviewEntry` 单点）均正常。
9. **op-011（C1~C4）**：`rg` 零残留 6 条（§7.3）全通过；C1 中文/英文新文案落地且 zh/en 段均 1 行；C2 B 组数值判据定性化（**D 组工程阈值保留**；C2-12 30 行降为参考）；C3 根 `AGENTS.md` 与模板源逐字一致；C4 「14 → 17」5 处修正；`npm run build` 幂等；**部署产物更新方式已在验收中说明**（用户运行 `openfeel setup`，本阶段不自动执行）。
10. **REV-52-001（B5 REV 复检）**：§5.3a 裁定落地——`assertNoBlockingOpenRev` 在多步循环内（至少 done 前）复检；**存量 blocking open REV 在多步 `--to done` 时被拦截（exit 1 + 不写盘）**；`addAutoFixReview` 产出 `status==='resolved'` 有单测断言。
11. **REV-52-002（draft 的 attempt）**：`flow attempt` 对 `draft` op **exit 1 + 提示先 `publish`**（命令层 + core 层双层守卫），有单测覆盖。
12. **REV-52-003（编辑残留）**：§5.6 后孤立 A7 表行已删除（A7 仅在 §5.5 裁定表呈现）。

---

## 十、测试策略与翻转清单

| 验证点 | op | 方式 |
|--------|:--:|------|
| `--json` 全命令 | 001 | 各 `--json` 输出 `JSON.parse` 通过 + 含 `schemaVersion`；`--json` 时无 ANSI/标题；`phases --json` 三键不变 |
| `current` 无 op | 001 | 构造 `current.op=''` 的 flow.json → `flow current` 可读 stage 且标注无 op |
| `NO_COLOR`/`--no-color` | 002 | `NO_COLOR=1 node bin/openfeel.js flow status` 输出无 `\u001b[`；`--no-color` 同理 |
| B9 编码实测 | 002 | `powershell.exe`(5.1/936) 交互终端 + 管道两种场景分别记录结论 |
| `health --fix` | 003 | 构造 flow.json/status.md 状态不一致 → `--fix --dry-run` 列出差异不写盘；`--fix` 仅改「状态」字段（其余字段字节不变） |
| 文件孤儿报告（L7） | 003 | `flow health` warn 数 = `flow repair` 列出数（本仓 62）；**无清理行为**（按 A6） |
| 多步推进 | 004 | `advance --to exec_running`（从 `plan_pending`）一次完成且每步有日志；多义/无路径 exit 1 + 可达目标；`--dry-run` 打印完整路径不写盘 |
| **多步推进的 REV 复检（REV-52-001）** | 004 | ① 构造含 `blocking:true, status:'open'` REV 且路径通往 `done` → 多步 `advance --to done` → **exit 1 + 列出 REV + `revision` 不变**；② 单测：`addReviewEntry({..., autoFixDetail})` 产出条目 `canAutoFix===true && status==='resolved'`（等价论证）；③ 断言 `advance` 路径不产生新 review |
| `flow ops list` | 005 | 显示 state/填充度；空模板 op 有 warning；`--stage` 过滤生效 |
| `draft` 两阶段 | 005 | `create --draft` → state=draft 且 `ops list` 分组显示；`publish` 空模板 exit 1、非空转 pending；`health` 不对 draft 报空模板；**`attempt --op <draft op>` → exit 1 + 提示先 `publish`**（命令层 + core 层双层守卫） |
| `scheme rename` | 006 | flow.json 标题与 op 文件首行同步变更；不存在 → exit 1 |
| warn 文案 i18n（L5） | 007 | `rg` 断言目标位点无硬编码中文；en 模式运行相关路径无中文 |
| CRLF 修复（L8） | 008 | 单测：含 CRLF 的 fixture 解析条目数 === 去 CR 计数；实测 patterns=105 / troubleshooting=31 |
| 3 族命令层测试（L2） | 010 | 新增 3 测试文件通过（参数/退出码/i18n） |
| **移除 `view add`（A4）** | 009 | `node bin/openfeel.js view add …` 不再被识别（unknown command）；`view list`/`view accept` 正常；`rg "view\.add"`（src/test/i18n）与 `rg "view add"`（docs/README/manual）**零残留**；`lint i18n` 键数 **649 → 642**；CHANGELOG `Removed` 含条目 + 迁移指引 |
| `flow review add` 等价性 | 009 | 删除后 `flow review add`（`addReviewEntry` 单点）行为不变（既有 `test/commands/flow.test.ts` 通过） |
| 全量回归 + 隔离 | 010 | 四门禁 + 环境双快照零 diff |
| **C1/C3 简洁约束 + 根 AGENTS.md 对齐** | 011 | `rg` 断言 §7.3 第 1/2/3/4 条零残留；`diff` 根 `AGENTS.md:30-38` 与 `agents-md/zh-CN.md` 对应段（逐字一致）；zh/en C1 段均 1 行 |
| **C2 B 组定性化** | 011 | 人工核对 §7.1 C2-1~C2-12：B 组数值判据仅余 C2-12 参考值；**D 组（reviewer/feel-tester 等）未被改动**（`git diff` 限定文件范围核对） |
| **C4 计数漂移** | 011 | `rg "14 个 ?[Ss]kill\|14 skills\|14 个 Skill"` src/templates-data + manual **零命中**；ADAPTER 两语言枚举含 `openfeel-cli-usage`/`tool-usage`/`workspace`；`git diff` 确认 `docs/**` 历史文档未动 |
| build 传播 | 011 | `npm run build` 幂等（重跑零 diff）；生成段与权威源一致；`.opencode/**` 自举同步（`opencode-instance.test.ts` 通过） |

**翻转清单（既有断言受影响项）**：

| 文件 | 位置/内容 | 翻转原因 |
|------|-----------|----------|
| `test/core/plan/scheme.test.ts` | `createScheme` 返回/注册状态断言 | B4 新增 `{draft}` 参数（默认仍 `pending`，若断言覆盖面则补 draft 用例） |
| `test/commands/plan.test.ts` | `plan scheme create` 输出断言 | 新增 `--draft`/`publish`/`rename` 子命令（既有断言不变，补新断言） |
| `test/commands/flow.test.ts` | `flow status/current` 输出断言 | 新增 `--json`（人类可读输出**不应变化**；若断言含标题行则确认未被 `--json` 路径影响） |
| `test/core/flow-manager.test.ts` | `healthCheck` items 断言 | B2/B3 新增检查项（如 draft 跳过、文件孤儿统计）→ 断言计数可能变化 |
| `test/utils/kb-dedup.test.ts` | 条目数/相似度断言 | L8 归一化后解析条目数显著上升（2→105 / 0→31）→ 若有硬编码计数断言须更新 |
| `test/commands/stage.test.ts` | 状态字段写盘断言 | 若 `health --fix` 复用 `setStatusField` 语义则确认不变（预期无翻转） |
| **`test/commands/view.test.ts`** | `view add` 用例（实测 `:84`、`:89` 及弃用提示用例） | **A4 删除 `view add`** → 用例**删除**；保留 `list`/`accept` 用例；确认无引用 `view.add.*` 键 |
| **`test/core/templates.test.ts`** | `:24-40`「图体行数一致」 | **op-011 复核：预期无翻转** —— 该断言只抽取 **lifecycle ASCII 块**（含 `pending/open`），与 C1/C3 的「简洁约束」段无关 |
| **`test/core/setup.test.ts`** | `:71-76` `content toContain loadTemplate('zh-CN','agents-md')` | **op-011 复核：无翻转** —— 断言与**权威源自洽**（自比对），模板改动后仍通过；`:172` 权限段断言不受 C1/C3 影响 |
| **`test/core/opencode-instance.test.ts`** | `.opencode/**` vs 权威源（含 `ADAPTER.md`） | **op-011 复核：无翻转** —— build 重生成后自洽；无「14 skill」计数断言 |
| **`test/core/template-loader.test.ts`** | 生成段/模板断言 | **op-011 复核：无翻转** —— 无「简洁约束」文本断言、无 skill 计数断言 |
| 结论 | — | **op-011 预计零强制翻转**；§十 表内新增的 C1~C4 验证行为**新增断言**（若实施时补），非翻转既有断言 |

---

## 十一、风险与注意事项

| # | 风险 | 缓解 |
|---|------|------|
| R-1 | **热区冲突**：`flow-manager.ts`/`commands/flow.ts`/`plan.ts`/`scheme.ts` 多 op 共享 | **串行链**（§十二）；stage-51 已完成，无跨阶段并发 |
| R-2 | `health --fix` 误覆盖 status.md 独立字段（A2） | 严格限定「状态」字段；`--dry-run` 预览；单测断言其余字段字节不变 |
| R-3 | `draft` 引入后既有统计/归档口径漂移（A1） | 「窄兼容」四条约束；op-010 全量回归；本仓存量无 draft（零迁移） |
| R-4 | 多步推进破坏「拒绝非法跳转」语义（B5） | 保留无路径/多义 → exit 1；仅「唯一路径」自动逐步；`--dry-run` 先预览 |
| R-5 | **L8 修复后 `knowledge dedup` 输出量激增**（2→105 / 0→31）→ 噪声（A5） | 连带评估 `SIMILARITY_THRESHOLD`（0.8）与 `--threshold`；manual 说明；若噪声大按 A5 裁定调整阈值 |
| R-6 | L7 文件孤儿（62 条）若加清理会删历史文件（A6） | **裁定不加清理**；仅报告 + manual 说明；如需清理另立 |
| **R-11** | **A4 破坏性变更**：移除 `view add` 影响依赖它的脚本/文档/习惯用法 | ① CHANGELOG `Removed` **显著标注** + 迁移指引（改用 `openfeel flow review add`，行为等价且为单点实现）；② 文档/i18n/测试全量清理（`rg` 零残留）；③ **回滚**：`git revert` 该 op 即可恢复（纯代码/文案删除，无数据迁移） |
| **R-12** | **op-011 定性化降低判据客观性**：去数值后依赖 Agent 主观判断「是否跨模块/是否需确认」 | ① 保留**档位描述 + 后果**（各档对应的流程/角色），使判断有上下文；② **D 组工程阈值保留**（覆盖率/嵌套/重试/日志/相似度）作为硬约束兜底；③ C2-12 保留 30 行作参考值；④ 定性化仅在**模板/文档/规则**层，**不改任何运行时逻辑**（零行为变更）；⑤ 回滚 = `git revert` + `npm run build` |
| **R-13** | op-011 改动量大（20+ 文件含生成段/自举），可能漏改或误改 | ① 权威源 → `npm run build` 统一传播（禁手改生成段）；② §7.3 以 **6 条 `rg` 零残留**做机器可验证；③ `git diff` 限定文件范围（确认 `docs/**` 历史与 `dev_core.md` `[-]` 条目未动）；④ build 幂等零 diff 兜底 |
| **R-14**（REV-52-001） | 多步推进可能**绕过** REV 阻塞检查（中间步新增 blocking → 直达 done） | ① **等价论证**：`addAutoFixReview` 强制 `status='resolved'`（`flow-manager.ts:2172`）→ 恒非 blocking open；且 `advance` 路径不创建 review；② **防御性加固**：`assertNoBlockingOpenRev` 在多步循环每步后（至少 done 前）复检，命中即停并报告剩余路径；③ 验收含「存量 blocking 多步拦截」+「autoFix 等价性单测」 |
| **R-15**（REV-52-002） | `draft` op 被 `attempt` 记录执行结果 → 语义矛盾（未发布即视为执行） | `flow attempt` 双层守卫（命令层 `flow.ts:675-702` + core `recordAttempt:1791-1859`）→ exit 1 + 提示先 `publish`；单测覆盖 draft/正常两种 |
| R-7 | B7 编码方案选错（Node Windows TTY 可能本不乱码）（A7） | **B9 先实测**（TTY vs 管道）；避免平台 hack；优先 `--json` + `NO_COLOR` + 文档建议 |
| R-8 | 测试隔离缺口（历史事故） | 全部新增测试 `vi.mock('node:os')`/临时 HOME；op-010 双快照核验 |
| R-9 | i18n 键新增不对称（含 `--json`/warn 文案） | 同批补 `zh-CN.ts`/`en.ts`；`lint i18n` 门禁（R1 后失败非 0） |
| R-10 | `--json` 结构发散难维护 | 统一「顶层对象 + `schemaVersion`」；`phases` 保持既有三键 |

---

## 十二、op 执行顺序与依赖

```
【主串行链（共享 flow-manager.ts / commands/flow.ts / commands/plan.ts / core/plan/scheme.ts）】
  op-001（B1/B8 结构化输出）→ op-003（B2 对账 + L7 报告）
    → op-004（B5 多步推进 + REV 复检加固）→ op-005（B3/B4 op 生命周期）→ op-006（B6 rename）→ op-007（L5 warn i18n）

【并行（与主链文件不交叠）】
  op-002（B7/B9，`src/cli/index.ts` + `bin/openfeel.js`）
  op-008（L8，`src/utils/kb-dedup.ts` + 其单测）
  op-009（A4 移除 `view add`，`src/commands/view.ts` + docs/README + i18n 删键）
  op-011（C1~C4 模板/文档/计数，`templates-data/**` + `AGENTS.md` + `manual/**`；**无 src 逻辑改动**）

【收尾】
  op-010（L2 补 3 族测试 + 全量回归 + 门禁）
```

**建议顺序**：`op-001 → op-003 → op-004 → op-005 → op-006 → op-007` ∥ `op-002` ∥ `op-008` ∥ `op-009` ∥ `op-011` → **op-010**。

- op-002（编码）含 **B9 实测前置**：若实测结论影响方案，须在 op-002 内部先实测后实现。
- op-008（kb-dedup）与 stage-51 的 `openfeel knowledge dedup` 直接相关（A6），**建议优先（高价值）**，可与其他并行。
- **op-009（A4 移除 `view add`）文件不交叠**（`src/commands/view.ts`、docs/README、i18n 键），可并行；**但 i18n 文件与 op-001/003/004/005/006/007 共享**（`i18n-data/{zh-CN,en}.ts`）→ 若与主链并行须**串行合并 i18n 改动**，建议 **排在 op-007 之后**以简化冲突。
- **op-011（C1~C4）与主链及其他 op 文件不交叠**（`templates-data/**`、根 `AGENTS.md`、`manual/core/template-loader.md`）→ 可并行；**其 `npm run build` 与 op-008 的 build 须串行**（同工作区，建议合并为一次 build 或串行门控）。
- op-010 最后统一回归与门禁（**须在 op-009 之后**，其门禁依赖 `lint i18n` 键数变化 649→642）。

---

## 十三、修订记录

| 时间 | 修订人 | 依据 | 修订内容 |
|------|--------|------|----------|
| 2026-10-01 | openfeel-planner | 用户需求「v1.1.2-stage-52（反馈 09 + 遗留清账）」+ 用户指示「重复项先验证」 | 新建本阶段：**F1~F8 逐条实测验证**（3 条已解决仅登记：F3 主体/F7/F8；1 条部分存在 F1；4 条仍存在 F2/F4/F5/F6）；**L1~L8 逐条验证**（L2 由 7 族缩至 **3 族**；**L7 文件孤儿 62 条**与 **L8 CRLF（patterns 2→105 / troubleshooting 0→31）** 实测复现）；工作项 B1~B9 + op-001~009；3 项核心裁定（B2 实现形态 / B4 schema 窄兼容 / B5 内部循环单步）+ B1 `--json` 口径；待裁定 A1~A7（含 A7 依赖 B9 实测） |
| 2026-10-01 | openfeel-planner | **用户对 A1~A4 的裁定**（不可推翻） | **A1/A2/A3 与建议一致** → 计划 §5.1/§5.2/§5.3 裁定维持（`draft` 窄兼容、`--fix` 仅「状态」字段、`--to` 自动逐步）。**A4 与本计划建议相反** → 新增 **§5.6「A4 删除范围裁定」**（删除 `view add`；**保留 `view` 组**（`flow review` 无 `list`、`accept`≠`resolve`）；保留 `addReviewEntry` 单点）+ **新增 op-009（移除 `view add`，破坏性）**，含 i18n 删 7 键 / docs/README/manual 清理 / CHANGELOG `Removed` / 测试删除与 `rg` 零残留验收；原 op-009 顺延为 **op-010**；§三 L1 行、§四 工作项表、§六、§七 影响文件、§九 完成标准、§十 测试+翻转清单、§十一 新增 R-11（破坏性变更与回滚）、§十二 顺序同步；**A5/A6 按建议执行、A7 待 B9 实测** 标注 |
| 2026-10-01 | openfeel-planner | **用户裁定 C1~C4**（约束体系精简 + 硬编码阈值定性化，不可推翻） | 新增 **op-011**（含 **§7.1 逐处改动表**：C1 简洁约束 zh/en 改写为单行 + C3 根 AGENTS.md:30-38 逐字对齐并删多余 bullet/括号；C2 B 组 13 处定性化含裁定 C2-12「30 行降为参考」；C4 「14 个 Skill」5 处 → 17）；**§7.2 build 传播与部署说明**（含「本阶段不自动执行 setup、用户需运行」）；**§7.3 六条 rg 零残留验收**；§四 工作项表/**op 数 10 → 11**；§七 op-011 行；§八 影响文件（22~27 文件 / 1050~1600 行）；§九 完成标准 9；§十 新增 4 行验证 + **翻转清单补 4 项「预期无翻转」复核**；§十一 新增 R-12/R-13；§十二 顺序补 op-011 并行与 build 串行约束 |
| 2026-10-01 | openfeel-planner | **REV-v1.1.2-stage-52 REV-001（blocking, medium）** | 新增 **§5.3a「REV 阻塞复检语义」**：裁定 **②论证等价为主 + ①进入 done 前复检加固**——①实测 ddAutoFixReview（low-manager.ts:2145）**强制 item.status='resolved'**（:2172）→ 恒不满足阻塞过滤 status==='open'（low.ts:664-666），且 dvance 路径不创建 review；②将 low.ts:658-680 复检抽为 ssertNoBlockingOpenRev，多步循环每步后（至少 done 前）调用，命中即停并报告剩余路径；op-004 行、§九 完成标准 10、§十 测试（新增「多步 REV 复检」行）、§十一 **R-14** 同步；验收含「存量 blocking 多步拦截」+「autoFix 等价性单测」 |
| 2026-10-01 | openfeel-planner | **REV-v1.1.2-stage-52 REV-002（low）** | §5.2 窄兼容补**第 5 条**：low attempt 对 draft op **exit 1 + 提示先 plan scheme publish**（命令层 low.ts:675-702 + core ecordAttempt:1791-1859 双层守卫）；op-005 行、§九 完成标准 11、§十 测试（draft 行补断言）、§十一 **R-15** 同步 |
| 2026-10-01 | openfeel-planner | **REV-v1.1.2-stage-52 REV-003（low）** | 删除 §5.6 之后残留的孤立 \| **A7** \| … \| 表行（原 :216，编辑残留；A7 仅在 §5.5 裁定表呈现）；§九 完成标准 12 记录 |
