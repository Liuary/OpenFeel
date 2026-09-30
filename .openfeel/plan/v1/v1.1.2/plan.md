# OpenFeel v1.1.2 — CLI 工具链自描述、可纠错与状态正确性

> **版本**：v1.1.2（W 级递增） | **创建日期**：2026-09-28 | **Planner**：独立 openfeel-planner（推理模型）
> **规模判定**：中大型（3 个阶段、跨命令层/核心层/模板构建管线；含 1 项行为变更裁定与 1 项状态机行为变更）
> **定位**：以 Pantheogen 反馈为输入，修复「计划 → 流水线」落地环节的自描述、可纠错与状态正确性缺口，并将 CLI 操作文档 skill 化。**不引入新架构层**。
> **关系**：本计划引用 Feel 的逐条核实结论为**唯一事实基准**；反馈原文中不准确处已在第五节纠正。

---

## 一、知识库参考

| 条目 | 路径 | 相关性 |
|------|------|--------|
| CLI 错误诊断增强模式 | kb/patterns.md #CLI 错误诊断增强模式 | **直接命中**。#2/#3 的自描述能力须沿用「错误原因 + 当前状态 + 可用操作」三层诊断，而非另起风格 |
| CLI --dry-run 安全预览模式 | kb/patterns.md #CLI --dry-run 安全预览模式 | **必须遵循**。`flow stage remove` 须提供 `--dry-run`，与既有状态变更命令一致 |
| flow.json 乐观并发校验模式 | kb/patterns.md #flow.json 乐观并发校验模式 | **必须遵循**。新增/修改 flow.json 写入路径须复用并发冲突退出码 2 语义 |
| stageId 三格式解析 + plan 目录双向映射模式 | kb/patterns.md #stageId 三格式解析 + plan 目录双向映射模式 | **直接命中**。`path.ts` 是唯一权威；冲突检测须建立在其之上而非另立解析 |
| 点号分隔符锚定解析模式 | kb/patterns.md #点号分隔符锚定解析模式 | 参考。stageId 含版本号点号，冲突检测/建议名不得用朴素 split |
| 纯全局部署命令模式 | kb/patterns.md #纯全局部署命令模式 | 参考。命令职责分层（setup vs init）是本计划 #9 三入口分层的既有先例 |
| 模板单源架构：templates-data/opencode 唯一权威源 + 双注入对象 + 单源一致性断言 | kb/architecture.md #模板单源架构 | **高度相关**。新增 skill 必须走该单源管线（build 步骤 4/6 双注入 + 步骤 8 自举重生成） |
| 构建脚本多语言循环生成模式 | kb/patterns.md #构建脚本多语言循环生成模式 | **必须遵循**。build 步骤 6 按目录枚举，新增 skill 应自动纳入 |
| 控制区标记模式 / 部署传播内容哈希比对模式 | kb/patterns.md #控制区标记模式；#部署传播内容哈希比对模式 | **高度相关**。`update` 传播新 skill 走受管区三态；须确认哈希比对能识别新文件 |
| 新增 Agent 全链路更新清单模式 | kb/patterns.md #新增 Agent 全链路更新清单模式 | 参考。新增 skill 可类比该「全链路清单」思路逐项核对，但没有对应的 skill 专项清单，须自行列全 |
| 版本号语义管理与递增规范模式 | kb/patterns.md #版本号语义管理与递增规范模式 | **必须遵循**。版本 1.1.2 按 **§3.1 权威清单**收口（原「三处同步」表述已废弃） |
| kb 条目与规则升级同步时点模式 | kb/patterns.md #kb 条目与规则升级同步时点模式 | 必须遵循。规则在 exec 实施、kb 在 archiving 同步 |
| CLI 向导空状态交互式兜底模式 | kb/patterns.md #CLI 向导空状态交互式兜底模式 | 参考。`openfeel-wizard` 现状是「执行型向导」，与本计划新 skill 的「查询型参考」边界裁定相关 |
| 约束/操作分离模式 | kb/patterns.md #约束/操作分离模式 | **直接命中**。新 skill 属「操作步骤→skill」，须与交互式 wizard 明确区分 |
| 审查硬性纪律嵌入 Agent Prompt 模式 | kb/patterns.md #审查硬性纪律嵌入 Agent Prompt 模式 | 参考。#5 改模板文案涉及 agent 模板，须留意生成段与权威源同步 |
| Agent 模型配置 / 全局画像路径 | kb/patterns.md #全局跨项目用户画像 YAML 配置模式 | **高度相关**。#5 全局画像兜底须复用既有 `readProfile()` 与异常安全 |
| 手动 edit status.md 频繁失败 | kb/troubleshooting.md #手动 edit status.md 频繁失败 | 参考。`flow stage remove` 若涉及 status.md 处置须走原子/受控路径 |
| autoRepairInconsistency 干扰组合条件推进路径 | kb/troubleshooting.md #autoRepairInconsistency 干扰组合条件推进路径 | **高度相关**。#6 修改 `advanceStagePhase` 的 phase 同步须避免再次干扰组合条件推进 |

> ⚠️ 执行任务前，若知识库中有相关条目，务必参考。重复踩过的坑不可再犯。

**知识库缺口（须在本版本 archiving 阶段补沉淀）**：暂无「CLI 命令文档 skill 化模式」「移除/回滚阶段的安全校验模式」条目，归档时新增。

---

## 二、背景与动机

Pantheogen 项目使用 OpenFeel CLI 将正式计划落地为 `flow.json` 阶段时，暴露了一组「计划 → 流水线」落地环节的能力缺口。Feel 已逐条核实（结论见第三节/第五节），确认成立的问题集中在四类：

1. **工具不自描述**：`--help` 不含 phase 枚举与合法转移，Agent 被迫翻读全局安装包源码才拿到 `PIPELINE_PHASES`（15 个值），违反「工具自描述」原则。
2. **不可纠错**：误建阶段无移除命令，只能 `--force` 强推 `done` 退役，遗留永久 `done` 阶段与 `--force` 日志。
3. **声明断链**：核心 `addStage(projectPath, name, deps?)` 已支持 deps，但 CLI 未暴露；且 `deps.yaml` 不被 flow 引擎读取，依赖无法落地。
4. **口径与状态不一致**：`auto_advance` 全局画像/项目配置口径冲突且无「有效值+来源」出口；`pipeline.phase` 在 `targetPhase==='done'` 时仍恒置 `active`；关键 CLI 状态变更不写审计日志。

**追加需求**：把 CLI 命令清单、参数、phase 枚举、stageId 命名约定、典型场景沉淀为按需加载 skill，直接缓解 #2/#3 的痛苦。

---

## 三、已确认决策（来自用户，不可推翻）

| # | 决策 |
|---|------|
| **U1** | 版本 **v1.1.2**；版本号收口**留到收尾阶段（stage-43 op-003）统一执行**，中间阶段不单独发版。**收口清单以 §3.1 为准**（原「四处同步」表述不完整，已按 REV-41-001 扩充） |
| **U2** | 阶段数 **3 个**；stageId 命名 `v1.1.2-stage-NN`，series=`v1`，目录 `.openfeel/plan/v1/stage-NN/`；从 **stage-41** 起编号（series v1 已用至 stage-40） |
| **U3** | **全量处理**反馈中经核实成立的问题（#1~#7、#9）；**#8 经核实无需改动**，须显式记录 |
| **U4** | **追加必做需求**：新增 `openfeel-*` CLI 文档 skill，须遵循既有 skill 部署管线（唯一权威源 → build 双注入 → 自举重生成；**经核实：无 `NEW_SKILL_NAMES` 常量，无需同步**，见 §5 纠正表），并裁定与既有 `openfeel-wizard` 的职责边界 |
| **U5** | 计划制定期间**不修改 `flow.json`**；阶段注册由 Feel 执行 `openfeel plan stage add`；本次调用**不创建各 stage 目录与 plan.md**（注册完成后二次细化） |

### 3.1 版本收口清单（U1 权威清单，供 stage-43 op-003 逐条引用）

> 依据 **REV-v1.1.2-stage-41 REV-001**。以全仓 grep（排除 `node_modules`/`dist`/`.git`）实测为准。**2026-09-29 复核（REV-43 REV-003 / stage-43 op-005）**：A5/A6/A7 与 B 的行号因 stage-44/45 改动模板而漂移，已更新；A1~A4、A8、E 结论不变。

**A. 必改（当前版本号载体 → 期望值 `1.1.2`）**

| # | 文件:行号 | 当前值 | 期望值 | 备注 |
|:--:|-----------|--------|--------|------|
| A1 | `package.json:3` | `"version": "1.1.1"` | `1.1.2` | 版本权威源 |
| A2 | `.openfeel/config.yaml:7` | `version: 1.1.1` | `1.1.2` | **GBK/非 UTF-8 展示**，须仅增量替换该行，禁止整文件重写 |
| A3 | `src/core/config.ts:308` | `version: 1.1.1` | `1.1.2` | zh `CONFIG_TEMPLATE_ZH` 常量 |
| A4 | `src/core/config.ts:365` | `version: 1.1.1` | `1.1.2` | en `CONFIG_TEMPLATE_EN` 常量 |
| A5 | `src/core/templates-data/agents-md/zh-CN.md:141` | 「当前 v1.1.1」 | 「当前 v1.1.2」 | **权威源**（build 后传播至全局 AGENTS.md）；行号由 `:130` 更新（stage-45 改动） |
| A6 | `src/core/templates-data/agents-md/en.md:141` | 「currently v1.1.1」 | 「currently v1.1.2」 | **权威源**；行号由 `:130` 更新 |
| A7 | `AGENTS.md:145` | 「当前版本 v1.1.0」 | 「当前版本 v1.1.2」 | **修正既有漂移**；行号由 `:136` 更新（stage-45 改动） |
| A8 | `package-lock.json:3`、`:9` | `"version": "1.0.7"` | `1.1.2` | **既有漂移仍在**；建议 `npm install` 重生成，或手工同步 root version 字段 |

**B. 由 `npm run build` 自动重生成（禁手改）**

| 文件:行号 | 说明 |
|-----------|------|
| `src/core/template-loader.ts:2833`（en）、`:3286`（zh） | `AGENTS_MD_TEMPLATES` 生成段，随 A5/A6 权威源改动重生成（行号由 `:2798`/`:3240` 更新） |

**C. 发布与传播**

| 项 | 操作 |
|----|------|
| `CHANGELOG.md` | 追加 `## [1.1.2] - 2026-09-28`（Added/Changed/Fixed） |
| 全局部署 | `npm run build` 后执行 `openfeel setup`（或 `openfeel update`）重传播 `~/.config/opencode/AGENTS.md` 版本行 |

**D. 明确**不得**修改（历史沿革说明，非当前版本载体）**

`build.js:1022,1109`、`src/core/migrate.ts:69`、`src/core/init.ts:7,12,160,240,262`、`src/core/global-paths.ts:30,35`、`src/core/opencode-config.ts:23,111`（另 `:24`、`:112` 为 stage-45 泛化后新增行）、`src/core/setup.ts:2`、`src/core/update.ts:7,1453,1632`、`src/core/i18n-data/{zh-CN,en}.ts`（注释）、`.openfeel/manual/**`（各模块「变更历史」表）、`test/**`（注释）——均描述「v1.1.1 引入了什么」，属历史事实，改动会篡改审计链。另：`package-lock.json` 中**依赖自身版本**（如 `picocolors: 1.1.1`）不得修改。

> 说明：D 类**行号为示意**（stage-41~47 多次改动这些文件，行号可能已漂移）；禁改规则以「文件 + 内容特征（`v1.1.x` 历史注释）」为准，执行时按内容判定，勿依赖行号。

**E. 经核实无版本号载体**：`README.md`、`README.zh-CN.md`、`README.en.md`、`docs/**`——复核确认**无待改版本号载体**（实测命中项均为 **stage-id 示例**如 `v1.1.2-stage-41`（`docs/commands.md:219,226`）与 `docs/phase-5/**` 归档叙述，非版本号声明，不改）。

### 3.2 环境基线变更记录（非本版本交付内容）

> 依据 **REV-v1.1.2-stage-42 REV-001**。

- **变更事实**：规划完成后，用户明确决策将本项目执行模式改为「自动推进 + 启用正式测试阶段」。当前 `.openfeel/config.yaml` 实测为：`execution_mode: auto`（:18）、`auto_advance: enabled`（:22）、`test_enabled: true`（:26）；`~/.config/openfeel/profile.yaml` 的 `preferences.auto_advance` 亦为 `enabled`，**两者一致，无冲突**。
- **性质**：属**环境基线变更**，**不是 stage-42 的交付内容**，不得据此反向推断 stage-42 目标。
- **约束**：stage-42 各 op **不得覆写**本项目 `config.yaml` 的 `auto_advance` / `execution_mode` / `test_enabled` 三值（由用户基线决定）；如需验证非默认组合，一律在**测试 fixture / 临时 HOME** 中构造。
- **连带修正**：`.openfeel/config.yaml:13` 及其权威源 `src/core/config.ts:314`(zh)/`:371`(en) 的注释「部署模板默认 auto+enabled，仓库自身默认 manual+disabled」中「仓库自身默认 manual+disabled」已不再成立（仓库现值 auto+enabled），须在 stage-42 op-001 同步修正（仅改注释，不动三值）。

---

## 四、Planner 新增决策（超出 U1~U5，供审查确认）

| # | 决策 | 理由 | 影响面 |
|---|------|------|--------|
| **P1** | **stage-41 承载 #1/#2/#3/#4/#9**（命令层自描述 + 可纠错 + 声明 + 收敛），**stage-42 承载 #5/#6/#7**（配置口径 + 状态正确性 + 审计），**stage-43 承载新 skill + 文档 + 版本收口**；**stage-44 承载权限模型修正**（`docs/phase-5/07-openfeel-permission-issue.md`），**stage-45 承载平台强限定内容描述泛化**（用户新增需求） | 按「**面向用户的能力**」与「**内部状态正确性**」切分基础；新增 44/45 为规划后追加的用户需求，各自独立立项（44 功能改动、45 纯描述泛化），但二者同改 agent 模板故强制串行；43 为版本终点（收口必须在最后） | 阶段划分 |
| **P2** | **#5 统一口径为「项目域优先、全局画像兜底」三级有效链**：`status.md 局部 > .openfeel/config.yaml defaults > ~/.config/openfeel/profile.yaml preferences > 内置默认 disabled` | ① `auto_advance` 本质是**项目流水线开关**，项目显式声明应高于跨项目用户偏好；② 全局画像作为「用户希望自动推进」的跨项目默认，仅在项目未声明时兜底，保留画像语义；③ 复用既有 `buildCascadeConfig` 三态结构（`configDefaults`/`statusOverrides`/`effective`，`flow-manager.ts:1375-1423`），仅增一层 `profileDefaults`，改动最小。**属行为变更**（此前 profile 从不参与级联），须审查确认 | flow-manager、config 命令、agent 模板文案 |
| **P2a** | **框架级「文档 vs 实现」不一致**（经 REV-42-001 更正）：模板/文案宣称「`auto_advance` 优先取全局画像」（`template-loader.ts:334`、`:1661`；权威源 `templates-data/opencode/agents/{zh-CN,en}/feel.md:324`），而 `buildCascadeConfig`（`flow-manager.ts:1375-1423`）**从不读全局画像**。**不涉本项目具体生效值**（本项目 `config.yaml` 现为 `execution_mode: auto`/`auto_advance: enabled`/`test_enabled: true`，与 profile 一致，无冲突；该基线由用户决策设定，非本版本交付内容，见 §3.2） | 修正方向与 P2 一致（项目优先、画像兜底）；消除「文档-实现」二次不一致 | 需 `config effective` 可验证（用隔离 fixture 构造组合场景） |
| **P3** | **#6 采用「全量 done 判定」**：在 `advanceStagePhase` 末尾将 `pipeline.phase` 置为 `所有 stage 均已 done ? 'done' : 'active'`（替代 `flow-manager.ts:1059` 的恒 `active`） | `pipeline.phase` 是**全局宏观状态**（`MetaPhase`），单阶段 done 不等于全局 done；若按「targetPhase==='done' 即置 done」，多阶段场景下会误置全局 done。判定式同时修复了「最后一个阶段 done 时全局不置 done」的真缺陷。**属状态机行为变更**，须审查裁定；备选 A（`targetPhase==='done'` 即置 done）见风险表 R3 | flow-manager、自测/回归测试 |
| **P3a** | **#6 不实施「current 自动回退首个非 done 阶段」** | Feel 核实：`current` 并**无回退逻辑**（反馈描述不准确），且 `advanceStagePhase:1053-1056` 确实无条件将 `current` 设为被推进阶段——这是**设计行为**而非缺陷。本版本修复的是 `:1059` 的 `pipeline.phase`，**不扩大范围**。显式记录以免审查误判遗漏 | 计划说明 |
| **P4** | **#9 不删除任何命令，改为「两层 + deprecated 提示 + 统一校验」**：<br>① **完整层**：`plan stage add`（唯一建目录入口，帮助文本明示「建目录 + overview/status + 注册 flow.json」）；<br>② **注册层**：`flow stage add`（仅 flow.json 注册，帮助文本明示「仅注册，不建目录；通常应使用 plan stage add」）；<br>③ `stage create` 标记 **deprecated**（运行时 stderr 提示「请改用 `openfeel flow stage add`」），功能保留至少一个 W 版本 | `stage create` 系 stage-30 为 Pantogen 兼容新增，物理删除会**回退既有兼容性**并破坏 `docs/commands.md:164-182`、`manual/cli/commands.md:62` 引用；`manual/cli/commands.md:62` 已明示 `stage create` 与 `flow stage add` 等价，故保留其一为推荐注册入口即可满足「明确区分」诉求 | flow/stage/plan 命令层、docs、manual |
| **P5** | **#3 冲突检测落在 `path.ts`（唯一权威）**：新增 `validateStageId` / `suggestStageId` / `findStageDirConflict`，检测 `(series, stageDir)` 冲突（如 `v4-stage-04` 与 `v4.0.0-stage-04` 映射同一目录）；`registerStage`/`addStage` 接入检测 | 延续 kb「stageId 三格式解析 + plan 目录双向映射模式」：解析与映射的权威只有一个模块；把冲突规则散落到 flow-manager 会重新制造双源 | path.ts、flow-manager、命令层 |
| **P6** | **`registerStage` 的「已存在则静默跳过」保留为幂等语义，但新增 (series, stageDir) 冲突检测**：同 stageId 重复 → 静默跳过（幂等，保持既有行为）；**不同 stageId 映射同目录 → 抛错/告警** | `flow-manager.ts:708-710` 的静默跳过是 `plan stage add` 幂等的前提，不应改为抛错；真正缺口是 `:1121-1123` 仅对完全相同 stageId 抛错的**短视** | flow-manager、plan/stage.ts |
| **P7** | **#7 审计日志作用域限定为「确实缺失的写路径」**：`registerStage`（← `plan stage add`）与 `plan/scheme.ts` 的 op 注册（← `plan scheme create`）补 `appendLog`；**不重构**已有 10 处调用（`flow-manager.ts:1062,1135,1554,1573,1591,1679,2330`、`archive/merge.ts:116`、`view/entry.ts:60,127`） | 反馈称「只有 advance 写日志」不准确（实有 10 处），故只补缺口，避免无谓改动（AGENTS.md 约束 3：控制修改范围） | flow-manager、plan/scheme.ts |
| **P8** | **新 skill 命名 `openfeel-cli-usage`**；定位为**查询型参考手册**（只读，不自执行），与 `openfeel-wizard`（**执行型交互向导**，跑 `flow wizard` 推进流水线）职责正交 | 反馈痛的根源是「Agent 被迫翻源码查静态知识」，属按需查阅场景；wizard 是交互执行场景。二者构成「查手册 vs 跑向导」的清晰边界 | 新 skill、wizard 帮助文本交叉引用 |
| **P9** | **`config effective` 采用新子命令而非改写 `config get`**：`openfeel config effective [key]` 输出「有效值 + 生效来源」（来源枚举：`status.md` / `config.yaml` / `profile.yaml` / `builtin default`） | ① 不改动 `config get` 既有语义（项目模式 key 必填、全局模式读 profile），避免破坏兼容；② 「有效值+来源」是级联解析结果，语义与 `config get` 的「原始值读取」不同，宜独立子命令（延续 kb「lint 子命令组扩展」的父命令组追加惯例） | config 命令、flow-manager（暴露级联解析） |
| **P10** | **`flow phases` 支持 `--json`**，输出 `{ phases: [...], transitions: {...} }`；默认人类可读（phase 列表 + 转移表） | 满足「工具自描述」的同时赋能自动化（Agent/skill 可解析），零额外成本 | flow 命令、flow-manager |
| **P11** | **`flow stage remove` 安全校验**：默认拒绝「`ops` 非空」或「为 `pipeline.current.stage`」的阶段；`--force` 可越过；`--dry-run` 预览不写盘；移除后若 `pipeline.current.stage` 指向被删阶段 → 兜底回退到「首个非 done 阶段」（无则清空为 `''`）；追加 `remove_stage` 审计日志 | 对齐反馈 #1 建议与本项目 `--dry-run`/`--force` 既有惯例；`current` 悬空必须兜底，否则下次 `advance` 解析 `current.stage` 会失败（`flow-manager.ts:1287`） | flow 命令、flow-manager |
| **P12** | **#4 依赖落点确认为 `flow.json`**：`plan stage add --deps` → `addStage(…, deps)` → `overview.md`「## 依赖」+ `registerStage(fullStageId, deps)` 写入 `flow.json.stages[].deps`；**不引入 `deps.yaml` 读取**（该文件不被 flow 引擎消费，属既有设计） | 对齐反馈 #4 核心函数已有能力，只补 CLI 缺失的参数透传；引入 deps.yaml 读取属新增抽象，违反「避免过度设计」 | plan 命令、plan/stage.ts |
| **P13** | **#2 的转移表来源统一为运行时 `pipelineConfig`**：新增 FlowManager 公共访问器（暴露 `phases`/`transitions`），`flow phases` 与 `advance` 诊断复用同一数据源 | 消除「schema 硬编码枚举（`pipeline-schema.ts:14-20`）」与「运行时 `.openfeel/pipeline.yaml` 转移表（`flow-manager.ts:2758-2776` 默认）」两处可能不一致的隐患——自描述命令必须展示**运行时实际生效**的转移表 | flow-manager |

---

## 五、核实结论与纠正（事实基准）

| # | 反馈 | 核实结论 | 处理 |
|:--:|------|----------|------|
| 1 | 缺移除阶段命令 | **属实** | stage-41 op-003 |
| 2 | `--help` 不自描述 phase/转移 | **属实** | stage-41 op-001 |
| 3 | stageId 命名/目录映射未文档化 | **部分属实**：规则已实现且有文档（`path.ts`、`manual/core/plan-path.md:19-28`）；真正缺口 = **唯一性/冲突校验**（`registerStage` 静默跳过 `:708-710`；`addStage` 仅对完全相同 stageId 抛错 `:1121-1123`） | stage-41 op-002 |
| 4 | `plan stage add` 不支持 `--deps` | **属实**（核心 `addStage` 已有 deps：`plan/stage.ts:26`；CLI `plan.ts:21-30` 未暴露） | stage-41 op-004 |
| 5 | `auto_advance` 口径冲突 | **部分属实，且实现与文档不符**：`buildCascadeConfig`（`flow-manager.ts:1375-1423`）只读项目 config + 当前 stage status.md，**全局画像从未接入**；模板文案却宣称「优先取全局画像」（`template-loader.ts:334`、`:1661`；权威源 `templates-data/opencode/agents/{zh-CN,en}/feel.md`） | stage-42 op-001/op-002 |
| 6 | `flow status` 的 `current` 不回退 | **反馈不属实**（无回退逻辑）；**真缺陷**：`advanceStagePhase:1059` 恒置 `pipeline.phase='active'`，`targetPhase==='done'` 也不置 `done` | stage-42 op-003（P3/P3a） |
| 7 | CLI 关键操作不写审计日志 | **部分属实**：确缺失的是 `plan stage add`（经 `registerStage`）与 `plan scheme create`（`plan/scheme.ts:87-146` 直接改 + save）；「只有 advance 写日志」不准确（实有 10 处） | stage-42 op-004（P7） |
| 8 | 非 git 仓库打印 `fatal:` | **不属实，无需改动**（`flow-manager.ts:1099-1110` 已 `stdio:'pipe'` + catch 降级；`flow.ts:511-525` 亦被 try/catch 包裹） | **本版本不改动**，显式记录 |
| 9 | `stage create` 与 `plan stage add` 职责重叠 | **属实（实为三入口）** | stage-41 op-005（P4） |

### 对第三节「新增需求」描述的两处纠正（须审查确认）

| 需求原文表述 | 核实结果 | 依据 |
|--------------|----------|------|
| 权威源 = `src/core/templates-data/opencode/skills/{lang}/...` | **实际为扁平单文件**：`src/core/templates-data/opencode/skills/{name}/SKILL.md`，**无 `{lang}` 子目录**；skills 为**中文单语**（非双语），因此「zh-CN 与 en 两份须一致」对 skill **不适用** | `build.js:33,36`（`SKILLS_DIR = TEMPLATE_OPENCODE_SKILLS_DIR = templates-data/opencode/skills`）；目录实测无语言子目录；`build.js:259-293` 按子目录枚举单一 `SKILL.md` |
| `NEW_SKILL_NAMES`（`src/core/update.ts`）需同步 | **该常量在现有代码中不存在**（全仓排除 `node_modules`/`dist` 后 grep 零匹配）。可能系与其他常量混淆 | 全仓 grep `NEW_SKILL_NAMES` = 0 匹配；实际注入对象为 `SKILL_DEFINITIONS`（`update.ts:100`）与 `OPENCODE_SKILL_DEFINITIONS`（`template-loader.ts:6254`） |
| 「build 校验断言键集与内容一致」 | **成立**：`build.js:670-691` 校验 `update.ts` 的 `SKILL_DEFINITIONS` 对照权威源目录；`build.js:814-837` 校验 `template-loader.ts` 的 `OPENCODE_SKILL_DEFINITIONS` 对照同一权威源；因两处源同（`:36`），键集/内容一致性被传递保证。新增 skill 目录会被**自动纳入**校验，无需改 `build.js` | `build.js:36,670-691,814-837` |

> ⚠️ 纠正项须由 openfeel-reviewer 复核；若复核推翻（如英文 skill 存在于其他路径），stage-43 op-001 需追加双语同步。

---

## 六、阶段概览

| 阶段 | 名称 | 定位 | 优先级 | 依赖 | 预估规模 |
|------|------|------|:--:|------|:--:|
| [stage-41](#stage-41cli-自描述与可纠错能力) | CLI 自描述与可纠错能力 | `flow phases` + `flow stage remove` + stageId 校验/冲突检测 + `--deps` + 三入口收敛 | P0 | 无 | 2 新增命令 + ~6 修改 + 3 测试 |
| [stage-42](#stage-42配置口径与流水线状态正确性) | 配置口径与流水线状态正确性 | `auto_advance` 统一 + `config effective` + `pipeline.phase` 修正 + 审计日志 | P1 | soft: stage-41 | ~5 修改 + 1 新增测试场景 + 模板文案 |
| [stage-44](#stage-44权限模型修正) | 权限模型修正 | agent 模板 permission 补 `external_directory` + 覆盖语义文档化（O1~O5） | P1 | 无（与 45 串行） | 18 agent 模板 + 文档 + 测试 |
| [stage-45](#stage-45平台强限定内容描述泛化) | 平台强限定内容「描述泛化」 | 模板/规则/注释/文档/手册去「唯一 harness」表述（零行为变更） | P1 | hard: stage-44 | ~20 文件文案 + 文档 + 回归 |
| [stage-46](#stage-46部署覆盖前自动备份) | 部署覆盖前自动备份 | 写前备份到 `~/.openfeel/backup/{ts}/` + `update_infos.md` 新增「备份」类 + `feel.md` 检查规则（B1~B9） | P1 | hard: stage-45 | 1 新增源码 + ~5 修改 + 文档 + 测试 |
| [stage-47](#stage-47已登记缺陷集中清理) | 已登记缺陷集中清理 | 14 项已登记缺陷逐条裁定（11 修）+ 翻转清单 + 强隔离回归 | P0 | hard: stage-46 | ~13 源码/模板 + ~2 文档 + ~8 测试 |
| [stage-43](#stage-43cli-文档-skill-化与版本收口) | CLI 文档 skill 化与版本收口 | 新 skill + 文档 + 版本 1.1.2 + 全量回归 | P0 | hard: stage-41、stage-47；soft: stage-42、stage-44、stage-45、stage-46 | 1 新增 skill + ~6 文档 + 版本 8 处 |
| [stage-48](#stage-48事件加固--遗留问题修复) | 事件加固 + 遗留问题修复 | 三大事件机制加固（审查纪律/测试隔离+CI 守卫/执行口径+版本门禁）+ 13 项遗留清理 | P1 | hard: stage-43 | ~12 文件 + CI + manual/kb + 测试 |
| [stage-49](#stage-49整仓全量审查) | 整仓全量审查 | 8 单元 × 6 维度全仓审查 → 报告 + REV + 修复流转（纯审查，默认不改源码） | P1 | hard: stage-48 | 8 报告 + 8 REV + 汇总（9 op） |
| [stage-50](#stage-50全量审查-non-blocking-集中清理第二批) | 全量审查 non-blocking 集中清理（第二批） | T1~T57（6 批次 A~F）一致性/门禁/死代码/i18n/测试/模板口径集中收敛 | P1 | hard: stage-49 | ~28 源码 + ~6 测试 + ~10 模板/文档 |
| [stage-51](#stage-51流水线状态维护与-cli-可维护性反馈二) | 流水线状态维护与 CLI 可维护性（反馈二） | N1~N11（3 批次 H1~H3）纠正/清理侧 CLI 补齐：孤儿 op 回收/结构字段 CLI/注册语义/`current.op` 生命周期/stage set 幂等与字段/op 文件名/**新增 `openfeel knowledge dedup` 子命令**/日志布局（仅未来）/git 降噪 | P1 | hard: stage-50 | ~22~27 文件 + 900~1300 行 |

### 依赖图

```
stage-41（自描述 + 可纠错）  ──soft──→  stage-42（口径 + 状态正确性）
       │                                      │
     hard                                   soft
       │                                      │
       │      stage-44（权限模型）──hard──→ stage-45（描述泛化）──hard──→ stage-46（部署前备份）
       │                    （44→45 强制串行）        （45→46 同改 init/setup/update，强制串行）
       │                                                                         │
       │                                                                       hard
       │                                                                         ▼
       │                                                          stage-47（缺陷集中清理）
       │                                                                         │
       └───────────────── hard ──────────────────────────────────────── soft ────┴─→ stage-43（版本终点）
                                                                                       │
                                                                                     hard
                                                                                       ▼
                                                                        stage-48（事件加固 + 遗留修复）
                                                                                       │
                                                                                     hard
                                                                                       ▼
                                                                        stage-49（整仓全量审查）
                                                                                       │
                                                                                     hard
                                                                                       ▼
                                                          stage-50（non-blocking 集中清理 · 第二批）
                                                                                        │
                                                                                      hard
                                                                                        ▼
                                                          stage-51（流水线状态维护与 CLI 可维护性 · 反馈二 · 收尾）
```

### 推荐执行顺序

**stage-41 → stage-42 → stage-44 → stage-45 → stage-46 → stage-47 → stage-43 → stage-48 → stage-49 → stage-50 → stage-51**。

**理由**：
- stage-41 与 stage-42 均修改 `src/core/flow-manager.ts` 与 `src/i18n-data/{zh-CN,en}.ts`，顺序执行避免同文件冲突。
- **stage-44 → 45 → 46 → 47 强制串行**：44/45 均改 `src/core/templates-data/opencode/agents/**`；45/46 均改 `src/core/{init,setup,update}.ts` 与 `global-paths.ts`；46/47 均改 `src/core/init.ts` 与 `flow-manager.ts`。串行避免同文件写冲突。
- **stage-47 先于 stage-43**：缺陷清理须在版本收口前完成，使发布无遗留脏点。
- **stage-43 为版本终点**（版本收口），**用户决定继续 v1.1.2**（不新建版本）→ 在 43 之后追加 **48（事件加固 + 遗留修复）→ 49（整仓全量审查）**；49 为收尾（纯审查），其非阻塞修复项按流转归后续补丁阶段或归档官。

---

## stage-41：CLI 自描述与可纠错能力

> **硬性前置**：无。**对应反馈**：#1、#2、#3（缺口部分）、#4、#9。
> **详细计划**：待 Feel 注册后二次细化为 `.openfeel/plan/v1/stage-41/plan.md`。

### 任务清单（op 级）

| op | 主题 | 说明 | 涉及文件 |
|----|------|------|----------|
| op-001 | `flow phases` 子命令（#2, P10, P13） | ① FlowManager 增加公共访问器暴露运行时 `phases` + `transitions`（由 `pipelineConfig` 提供，缺省回退 `getDefaultPipelineConfig()`）；② `flow.ts` 新增 `flow phases` 子命令：默认输出 15 个 phase（`PIPELINE_PHASES`, `pipeline-schema.ts:14-20`）+ 转移表（key `→` targets，组合 key 保留 `\|` 展示）；`--json` 输出 `{phases, transitions}`；③ 在 `flow advance --help` 选项描述中提示「查看合法 phase 与转移表请运行 `openfeel flow phases`」 | `src/core/flow-manager.ts`、`src/commands/flow.ts`、`src/core/i18n-data/{zh-CN,en}.ts` |
| op-002 | stageId 校验 + 建议名 + 冲突检测（#3, P5, P6） | ① `path.ts` 新增：`validateStageId(input)`（格式校验，非法返回 `{ok:false, reason}`）、`suggestStageId(projectPath, input)`（非法时给建议名，如输入 `v0.0.1` → `v0.0.1-stage-{下一个可用 NN}`，NN 扫描 `flow.json.stages` + `plan/{series}/` 目录取 max+1）、`findStageDirConflict(projectPath, stageId)`（返回映射同一 `(series, stageDir)` 的**其它** stageId）；② `FlowManager.addStage`（`:1117-1141`）在写入前调用 `findStageDirConflict`，冲突抛错；`registerStage`（`:704-718`）保留同 stageId 静默跳过（幂等），但冲突时抛错；③ 三入口命令层统一接入 `validateStageId` + 建议名输出 | `src/core/plan/path.ts`、`src/core/flow-manager.ts`、`src/commands/plan.ts`、`src/commands/flow.ts`、`src/commands/stage.ts` |
| op-003 | `flow stage remove <stageId>`（#1, P11） | ① `FlowManager.removeStage(stageId, options)`：`ops` 非空或为 `pipeline.current.stage` 时默认拒绝，`--force` 越过；移除后若 `current.stage` 指向被删阶段 → 回退「首个非 done 阶段」（按 stages 插入序），无则清空；追加 `appendLog({action:'remove_stage', agent:'cli'})`；② `flow.ts` 新增子命令：`--force`、`--dry-run`、并发冲突退出码 2（复用 `isFlowConcurrentError`）；③ 是否同时清理 `plan/{series}/{stageDir}/` 目录 → **默认仅移除 flow.json 注册，不删目录**（避免误删计划产物）；`--purge` 显式删除目录并二次确认（非 TTY 拒绝，须配合 `--force`） | `src/core/flow-manager.ts`、`src/commands/flow.ts`、`src/core/i18n-data/{zh-CN,en}.ts` |
| op-004 | `plan stage add --deps <ids...>`（#4, P12） | `plan.ts:20-30` 增加 `.option('--deps <ids...>')`，透传 `addStage(projectPath, name, deps)`；deps 已由 `addStage` 写入 `overview.md`「## 依赖」并经 `registerStage` 落 `flow.json.stages[].deps`（`plan/stage.ts:26,45,103`）；帮助文本示例 `openfeel plan stage add v1.1.2-stage-41 --deps v1.1.2-stage-40` | `src/commands/plan.ts`、`src/core/i18n-data/{zh-CN,en}.ts` |
| op-005 | 三入口职责收敛（#9, P4） | ① 明确分层帮助文本：`plan stage add`（完整入口）、`flow stage add`（仅注册）、`stage create`（deprecated）；② `stage create` 运行时输出 deprecated 提示（stderr，非 TTY 静默）；③ 三入口统一 stageId 校验（复用 op-002）；④ 更新 `docs/commands.md:160-182`、`.openfeel/manual/cli/commands.md:56-67` 的三入口关系表与推荐用法 | `src/commands/{plan,flow,stage}.ts`、`docs/commands.md`、`.openfeel/manual/cli/commands.md`、`src/core/i18n-data/{zh-CN,en}.ts` |

### 完成标准

- `openfeel flow phases` 输出 15 个 phase 与运行时转移表；`--json` 可被程序解析；`flow advance --help` 指向该命令
- 非法 stageId（如 `v0.0.1`、`foo`）在三个入口均给出格式错误原因 + **建议名**；`v4-stage-04` 与 `v4.0.0-stage-04` 冲突被检出并阻止
- `openfeel flow stage remove <id>` 对「`ops` 非空」「当前活跃阶段」默认拒绝，`--force` 可越过，`--dry-run` 不写盘；移除当前阶段后 `pipeline.current.stage` 不悬空
- `openfeel plan stage add x --deps a,b` 后 `flow.json.stages[x].deps == ['a','b']` 且 `overview.md` 列出依赖
- 三入口 help 文本互相交叉引用、职责清晰；`stage create` 有 deprecated 提示
- `npm run build && npm test` 全绿（新测试覆盖 op-001~op-004 各一条主路径 + 冲突/拒绝路径）

### 风险

- **`flow phases` 数据源不一致**：若访问器直接读 `PIPELINE_PHASES` 而运行时有 `.openfeel/pipeline.yaml`，展示可能与 `advance` 实际转移表不符 → **必须走 `pipelineConfig`**（P13）。
- **建议名的 NN 推导跨 series**：不同 series 的 NN 空间独立，推导须限定在目标 `series` 内，避免跨系列串号。
- **`stage create` deprecated 非 TTY 静默**：CI 场景不得因提示污染输出（对齐 kb「init/update 重启提醒对称输出模式」）。

---

## stage-42：配置口径与流水线状态正确性

> **硬性前置**：无。**软前置**：stage-41（同改 `flow-manager.ts`/i18n）。**对应反馈**：#5、#6、#7。
> **详细计划**：待 Feel 注册后二次细化。

### 任务清单（op 级）

| op | 主题 | 说明 | 涉及文件 |
|----|------|------|----------|
| op-001 | `auto_advance` 口径统一（#5, P2/P2a） | ① `buildCascadeConfig`（`flow-manager.ts:1375-1423`）新增 `profileDefaults` 层：经 `readProfile()`（`config.ts`，`~/.config/openfeel/profile.yaml`，路径见 `global-paths.ts`）读取 `preferences.auto_advance` 等，优先级 `statusOverrides > configDefaults > profileDefaults`；返回类型 `CascadeConfig` 增加 `profileDefaults` 字段（`flow status --verbose` 一并展示）；② 修正模板文案：`templates-data/opencode/agents/{zh-CN,en}/feel.md` 中「`auto_advance` 优先使用全局画像」→「项目 `config.yaml` 优先、全局画像兜底」，并重生成生成段（`template-loader.ts:334`、`:1661` 对应段）；③ 同步全局 AGENTS.md 中的同名表述（若存在）；④ **连带修正陈旧的默认值注释**：`.openfeel/config.yaml:13` 及其权威源 `src/core/config.ts:314`(zh)/`:371`(en) 的「部署模板默认 auto+enabled，仓库自身默认 manual+disabled」中「仓库自身默认 manual+disabled」已不成立，须与实际一致（仅改注释，**不动三值**，见 §3.2） | `src/core/flow-manager.ts`、`src/core/templates-data/opencode/agents/{zh-CN,en}/feel.md`、`src/core/template-loader.ts`（生成段）、`AGENTS.md`、`.openfeel/config.yaml`、`src/core/config.ts` |
| op-002 | `openfeel config effective [key]`（#5, P9） | ① 暴露级联解析：将 `buildCascadeConfig`（或抽出的纯函数）供命令层复用，返回 `{ value, source }`（source ∈ `status.md`/`config.yaml`/`profile.yaml`/`builtin`）；② `config.ts` 新增子命令，默认输出四个键的有效值+来源表，给 key 时输出单键；③ i18n 键（`config.effective.*`）双语对称 | `src/core/flow-manager.ts`、`src/core/config.ts`、`src/commands/config.ts`、`src/core/i18n-data/{zh-CN,en}.ts` |
| op-003 | `pipeline.phase` done 修正（#6, P3） | 将 `flow-manager.ts:1059` 的恒 `'active'` 改为「所有 stage 均 done ? `'done'` : `'active'`」；确认 `validate()`（`:1769-1785`）对 `done` 的 `MetaPhaseSchema` 校验通过；确认不改动 `current` 逻辑（P3a）；评估对既有 `flow.json` 历史数据（阶段/日志/checkpoint 计数**以实施时实盘为准**；撰写时实测 44 阶段 / 431 条日志）的影响（**不迁移历史数据**，仅影响后续推进） | `src/core/flow-manager.ts`、`test/core/flow-manager.test.ts` |
| op-004 | 审计日志补齐（#7, P7） | ① `registerStage`（`:704-718`）成功注册后 `appendLog({action:'register_stage', agent:'cli', detail:{stageName, deps}})`；② `plan/scheme.ts` `syncToFlowJson`（`:87-146`）成功注册 op 后 `appendLog({action:'register_op', agent:'cli', detail:{stageName, opId}})`；③ 确认不重复写；④ **双轨日志说明**（`add_stage`=仅注册层 vs `register_stage`=完整层）；⑤ **接入 scheme.ts 自动注册兜底路径的冲突检测**（REV-41-003，`scheme.ts:107-115` 不经过 `registerStage`） | `src/core/flow-manager.ts`、`src/core/plan/scheme.ts` |

### 完成标准

- `openfeel config effective` 输出有效值 + 来源；**验收基于隔离 fixture / 临时 HOME 构造的组合场景**（覆盖率见测试策略），**禁止依赖或写死本项目真实配置值**
- 模板文案与实际级联一致（Grep 无「优先使用全局画像」残留）
- 最后一个阶段推进到 `done` 后 `flow.json.pipeline.phase === 'done'`；多阶段未全 done 时推进任一阶段仍为 `active`
- `plan stage add` 与 `plan scheme create` 各产生一条 `flow.json.log` 记录（`agent='cli'`）；`advance` 路径日志数量不因本阶段增加
- `npm test` 全绿（新增：级联来源断言、`config effective` 输出、`pipeline.phase` 两场景、审计日志断言）

### 风险

- **行为变更（P2）**：接入 profile 层改变既有级联结果。缓解：不改 `status.md`/`config.yaml` 层优先级，仅**新增最低优先级兜底**，对已显式声明 `auto_advance` 的项目实际值不变。
- **行为变更（P3）**：`pipeline.phase` 语义变化可能影响 `getPhase()` 消费方（wizard/health/status）。缓解：`done` 仅在「全量 done」时出现，正常推进过程行为不变；须在测试中覆盖 wizard/health 不回归。
- **循环依赖**：`flow-manager` → `config.ts`（`readProfile`）——`config.ts` 已导入 `global-paths.ts`，未见反向依赖 `flow-manager`，须实测确认无环。
- **i18n 键对称**：新增键须同时补 `zh-CN.ts`/`en.ts`，否则 `openfeel lint i18n` 失败。

---

## stage-44：权限模型修正

> **硬性前置**：无（与 stage-45 强制串行）。**需求来源**：`docs/phase-5/07-openfeel-permission-issue.md`。
> **详细计划**：`.openfeel/plan/v1/stage-44/plan.md`。
> **定位**：9 个 agent 模板 `permission:` 块补 `external_directory`，修正 `utility` 的 `write`→`edit`（待实测），文档化「agent 级 permission 覆盖/优先于顶层」语义。**范围仅限权限模型，不做平台抽象层**。

### 关键裁定（O1~O5）

- **O1**：**保留** `permission` 块 + 补 `external_directory`（不移除）。依据：内置默认 `*:allow` 使多数块等价，移除收益小；`feel-tester` 的 `webfetch:deny` 与各 agent 最小权限意图依赖内联块；补键对「覆盖/合并」两种语义均有效。
- **O2**：`external_directory` 默认取 **`allow`**。依据：agent 已 `bash: allow`（shell 本可越界），`ask` 非真实安全边界；契合「自动化流水线」定位；用户可在项目 `opencode.jsonc` 收紧。
- **O3**：**不新增 CLI 入口**，仅文档化 opencode 原生 `agent.<name>.permission`（避免重复造轮子/过度设计）。
- **O4**：`setup`/`update` 保留用户自定义**已覆盖**（`writeManagedFile` frontmatter 合并 + 受管区替换 + 无标记只追加），仅文档化「自定义写受管区外」。
- **O5**：**不采纳**「只读放行/写入询问」——opencode `external_directory` 为单一键，无 read/write 粒度。

### 既有事实核实（要点）

- 9 agent 均**缺** `external_directory`：`templates-data/opencode/agents/{zh-CN,en}/*.md`（feel `:6-14`、archiver `:6-10`、executor `:7-12`、feel-tester `:6-13`、planner `:6-10`、reviewer `:7-11`、schemer `:6-10`、utility `:7-12`、vision `:7-11`）。
- `external_directory` **是合法 permission 键、默认 `ask`**：实测本机 `opencode-ai@1.18.33` 二进制 schema（`Struct({read,edit,glob,grep,list,bash,task,external_directory,todowrite,question,webfetch,websearch,lsp,doom_loop,skill}, Record(String,...))`）与默认 `external_directory:{"*":"ask",...}`。**顶层 vs agent 覆盖/合并语义待实测**（op-000）。
- 项目/全局 opencode.jsonc 模板**均不写** `permission`（`opencode-config.ts:28-30` / `:14-25`）。
- `.opencode/agents/*.md` 为 build 步骤 8 产物（`build.js:1077-1083`），禁手改。

### 任务清单（op 级）

| op | 主题 | 说明 | 涉及文件 |
|----|------|------|----------|
| op-000 | 权限语义实测（硬性前置） | 隔离 HOME + 临时项目，`opencode debug config` 确证：顶层 vs agent 覆盖/合并、`external_directory` 默认值、`write` 键是否被识别、项目 jsonc 与 frontmatter 优先级 | 实测记录 |
| op-001 | agent 模板补键 | 9×2=18 文件 `permission:` 末尾加 `external_directory: "allow"`；`utility` 的 `write`→`edit`（待 op-000 确认） | `templates-data/opencode/agents/{zh-CN,en}/*.md`（18） |
| op-002 | build 重生成 + 一致性 | `npm run build` 重生成 `template-loader.ts` 生成段与 `.opencode/agents/*.md` | `template-loader.ts`（生成段）、`.opencode/agents/*.md` |
| op-003 | 文档化覆盖语义 | agents-md 模板（→全局 AGENTS.md）+ `AGENTS.md` + manual：覆盖语义/`external_directory` 默认/收紧入口/受管区边界 | `templates-data/agents-md/{zh-CN,en}.md`、`AGENTS.md`、`.openfeel/manual/**` |
| op-004 | 测试 | 断言每 agent 含 `external_directory`、zh/en 键集一致、utility 键对齐、生成段一致 | `test/core/{template-loader,opencode-instance,update}.test.ts` |

### 完成标准

- 9 agent × zh/en `permission:` 均含 `external_directory`；`build` 通过且单一源一致；文档含覆盖语义与收紧入口；`npm test` 全绿；op-000 实测记录留存。

### 风险

- opencode 覆盖/合并语义未确证（op-000 兜底；补键双语义有效）；`allow` 偏宽松（备选 `ask`）；与 stage-45 同改 agent 模板（**强制串行 44→45**）。

---

## stage-45：平台强限定内容「描述泛化」

> **硬性前置**：stage-44（二者同改 `templates-data/opencode/agents/**`，强制串行）。**需求来源**：用户指令（去 opencode 唯一 harness 表述）。
> **详细计划**：`.openfeel/plan/v1/stage-45/plan.md`。
> **定位**：**仅描述泛化**——模板/规则/注释/帮助/文档/手册去「唯一 harness」表述；opencode 具体路径仅在适配器实现语境保留并标注。**零行为变更**。

### 用户裁定边界（不可推翻）

- 泛化描述性内容；opencode 路径在适配器语境保留并显式标注。
- **不做**：`global-paths.ts` 路径参数化、适配器抽象层、`templates-data/opencode/` 目录树改名、`$schema` 改动、历史归档回改。

### 任务清单（op 级）

| op | 主题 | 说明 | 涉及文件 |
|----|------|------|----------|
| op-001 | 源码/命令/i18n 文案泛化（零行为变更） | 注释/帮助/日志/错误文案去平台限定，路径逻辑不变；适配器实现语境加标注 | `src/core/{global-paths,opencode-config,model-config,init,setup,migrate}.ts`、`src/commands/{init,setup,migrate,project}.ts`、`src/core/i18n-data/{zh-CN,en}.ts` |
| op-002 | 模板权威源泛化 + build（双语） | agents-md `:3` 部署路径表述；feel/archiver/utility 与 3 个 model 系 skill 标注适配器；`npm run build` 重生成 | `templates-data/agents-md/{zh-CN,en}.md`、`templates-data/opencode/agents/{zh-CN,en}/{feel,openfeel-archiver,openfeel-utility}.md`、3 个 skill、`template-loader.ts`（生成段） |
| op-003 | 规则/文档/手册泛化 | `AGENTS.md:82`（用户点名）+ dev_core 陈旧项 + adapters/README + README×3 + docs/commands.md:369 + manual | 见文件清单 |
| op-004 | 测试核对 + 全量回归 | `global-paths.test.ts` 等路径断言**不改**（未改逻辑，须说明理由）；全量回归 | `test/core/*.test.ts`、`test/commands/*.test.ts` |

### 完成标准

- A 类范围描述去「唯一 harness」；保留的 opencode 细节均标注；**零行为变更**（路径解析不变）；build/双语/单一源一致；`AGENTS.md:82` 已泛化；`npm test` + `lint i18n`/`lint kb` 全绿；B 类与历史归档未动。

### 风险

- 误改逻辑（严格限注释/文案 + 断言路径不变）；过度泛化致适配器指令失真（语境保留）；行号漂移（以实施复核为准）；与 44 同文件（串行）。

---

## stage-46：部署覆盖前自动备份

> **硬性前置**：stage-45（同改 `src/core/{init,setup,update}.ts` 与 `global-paths.ts`，强制串行 45→46）。**需求**：用户「如果部署时已有文件，则将原始文件备份，并在全局状态文件中提示 agent 检查」。
> **详细计划**：`.openfeel/plan/v1/stage-46/plan.md`。
> **定位**：为部署**覆盖写入**增加写前备份（全局根 `~/.openfeel/backup/{ts}/`）+ `update_infos.md` 新增「备份」类条目 + `feel.md` 检查规则扩展。**不含**还原/回滚命令。

### 关键裁定（B1~B9，经 REV-001~006 修订）

- **B1 目录结构**：保留层级，`global/<HOME 相对>` 与 `project/<basename>-<hash8>/<项目相对>` 分区 + `manifest.json`（source→backup 映射）。
- **B2 timestamp**：每次命令一个 `{ts}`（`yyyyMMddTHHmmssSSS`，进程内缓存复用；撞名加 `-2`/`-3`），**绝不覆盖**既有备份；`{ts}` 生成 + manifest 读改写**全程在 backup 锁临界区内**（REV-005）。
- **B3 时机/原子性**：**写前备份**；经 `atomicWriteFileSync` + `globalLockPath('backup')`；**备份失败 → 跳过该文件写入**（`writeManagedFile` 返回 `'skipped'`）+ 记**可区分**异常（不静默覆盖，REV-004）；仅「已存在且内容将改变」触发。
- **B4 条目格式**：`update_infos.md` **新增第三类「备份」**（`kind='backed'`），含源路径 + 备份相对路径 + 时间 + 来源命令 ∈ **`setup/update/init/migrate`**（REV-002）；字段「必填 + null」（REV-006②）；正则**向后兼容**；**读侧 `loadUpdateInfos:95-98` 须同步识别「## 备份」节**（REV-003）。
- **B5 检查规则**：扩展 `feel.md`（zh/en 权威源 `:349-360`）处理「备份」类（含 `backupRel` 存在性检查，REV-006④）+ 扩展「异常」分支区分成因（REV-004）；落模板权威源 + `npm run build`；双语同步。
- **B6 非 TTY**：条目**始终落盘**；控制台提示**仅 TTY**，非 TTY 静默。
- **B7 与 migrate 关系**：项目内备份**不合并**（服务可回滚事务）；**migrate 全局部署写纳入**（`migrate.ts:487-501` 经 `deployGlobalAsset` + `:512-524` 全局 jsonc，REV-002）。
- **B8 范围**：**不做** `openfeel backup list/restore`（保留层级 + manifest 已可人工还原；避免过度设计）。
- **B9 覆盖写路径全景与豁免（REV-001/002/006）**：纳入 = 全局资产 / 全局 opencode.jsonc / **项目 `.openfeel/config.yaml`（`writeDefaultConfig` `config.ts:420-425` 无条件覆盖）** / 项目 `package.json`；不纳入 = `flow.json`（`initFlow` 守卫）/ 项目 `opencode.jsonc`（仅缺失写）；**豁免** = `.info.json`、`update_state.json`、`update_infos.md`（框架状态文件）。

### 既有事实（要点）

- 写入咽喉 `writeManagedFile`（`update.ts:1299-1363`）三态：`created`（不备份）/`updated`（`:1330`）/`adopt`（`:1346`）/`appended`（`:1351`，均需备份）/`malformed`（不写盘）。
- 全局 opencode.jsonc 写：`setup.ts:60-74`、`update.ts:1488-1502`、**`migrate.ts:512-524`**；项目 opencode.jsonc **仅缺失时写**（无覆盖）；**`.openfeel/config.yaml` 无条件覆盖**（`config.ts:420-425`，`init.ts:174-182`）；`init.ts:291` 改写既有 `package.json`（需备份）。
- `update_infos.ts`：`kind` `:15`、`SECTION_TITLES` `:35-38`、结构 `:18-25`、行格式 `:62`、正则 `:71`、**读侧节识别 `:95-98`（硬编码，须同步）**；路径函数在 `global-paths.ts:45-48`（**新增** `getGlobalBackupRootPath`）。
- 检查规则仅在 `feel.md`（zh/en `:349-360`）；`agents-md`/项目 `AGENTS.md` 无。

### 任务清单（op 级）

| op | 主题 | 说明 | 涉及文件 |
|----|------|------|----------|
| op-001 | 备份基础设施 | NEW `src/core/backup.ts`（`backupFileBeforeWrite`/`beginBackupSet`/manifest，锁临界区）+ `global-paths.ts` 新增 `getGlobalBackupRootPath()` | `backup.ts`(新)、`global-paths.ts` |
| op-002 | `update_infos` 扩展「备份」类 | `kind` + 节标题 + 条目字段（`backupRel`/`command`，必填+null）+ 序列化/解析向后兼容 + **读侧 `:95-98` 节识别** + 文件头说明 | `update-infos.ts` |
| op-003 | 四链路写入接入 | `writeManagedFile` 三分支写前备份（失败→`skipped`）；全局 jsonc（`setup.ts`/`update.ts`/**`migrate.ts`**）；**`init.ts` config.yaml（REV-001）** + package.json；`command` 透传 | `update.ts`、`setup.ts`、`init.ts`、`migrate.ts` |
| op-004 | agent 检查规则扩展 | `feel.md`（zh/en）「备份」类处理（含存在性检查）+ 扩展异常分支 + 非 TTY 说明 + build 重生成 | `templates-data/.../feel.md`、`template-loader.ts`（生成段） |
| op-005 | 测试 | NEW `backup.test.ts`（含并发）+ `update-infos`（往返 kind）/`update`/`setup`（失败→未写入）/`init`（config.yaml 备份）/`global-paths` + N4 隔离声明 | 测试文件 |

### 完成标准

- 四链路（setup/update/init/migrate）覆盖写入前均备份（保留层级，B1）；`created` 与「已存在不覆盖」不备份；每次命令一个 `{ts}` 目录不覆盖既有；`manifest.json` 记录映射；锁临界区并发安全。
- `update_infos.md` 含「备份」类条目（源/备份/时间/命令），**读侧往返 `kind` 正确**，旧文件仍可解析。
- `feel.md` 三类检查规则生效（含存在性检查与失败重跑分支，zh/en + build）；非 TTY 静默。
- 备份失败跳过写入（返回 `'skipped'`）+ 记可区分异常；`migrate` 项目内备份未动、全局写已纳入；无还原命令。
- `npm test` + `lint i18n`/`lint kb` 全绿。

### 风险

- 备份累积（本阶段不做清理，manual 说明）；格式变更需向后兼容；与 45 同文件（**强制串行**）；两套备份目录混淆（manual 说明）。

---

## stage-47：已登记缺陷集中清理

> **硬性前置**：stage-46（同改 `src/core/init.ts`/`flow-manager.ts`，且 `config/BUG-002` 语义修复与 46 备份接入点交互）。**下游**：stage-43。**定位**：发布前集中清理测试/审查登记的缺陷；**不新增功能、不做平台抽象层、不改版本号**。
> **详细计划**：`.openfeel/plan/v1/stage-47/plan.md`。

### 缺陷清单裁定（14 项）

| 裁定 | 项 |
|------|----|
| **修（11）** | `cli/BUG-001`（`flow phases` 与 `advance` 集合不一致 → 方案 B 边界说明 + `--json.advanceAccepted`）；`cli/BUG-002`（冲突错误 i18n + 死键 → 结构化 `StageDirConflictError`）；`archive/BUG-001`（缺 `deps` TypeError → `merge.ts:85` 守卫）；`config/BUG-003`（无 profile 时来源 → 仅文件存在且显式设置才填 profile 层）；**`config/BUG-002`（high：`init` 无条件覆盖 `config.yaml` → 本阶段收口语义修复，存在即不覆盖）**；`templates/BUG-002`（`agents-md:112` 泛化）；`REV-41 REV-008`（`save()` 缺 meta 守卫）；`REV-41 REV-009`（`--purge` 移到 save 成功后）；`REV-46 REV-011`（**混合裁定**：setup/update 补 try/catch 对齐 B3，migrate 保留 fail-fast + 文档化）；`REV-43 REV-003`（2 处版本清单文本残留）；`lint kb` 过期引用（`architecture.md:497`） |
| **不修（归属已定）** | `REV-44 REV-001` 已 closed；`REV-44 REV-002`→stage-43；`REV-44 REV-003`→归档官；`.openfeel/dev/current.md`、`plan/index.md`、`day_index.md`/`log.md` 陈旧→归档官 |
| **已修复待关闭** | `config/BUG-001`（commander `config set lang` 已用连字符命令，缺陷不存在）→ 建议 feel-tester 复核后 closed |

### 任务清单（op 级）

| op | 主题 | 说明 | 涉及文件 |
|----|------|------|----------|
| op-001 | CLI 边界 + 冲突 i18n | `phases` 边界说明 + `--json.advanceAccepted`；`StageDirConflictError` + 命令层分流渲染 | `commands/{flow,plan,stage}.ts`、`core/flow-manager.ts`、`i18n-data/*` |
| op-002 | 存量数据鲁棒性 | `archive/merge.ts:85` deps 守卫；`save()` meta 守卫 | `core/archive/merge.ts`、`core/flow-manager.ts` |
| op-003 | config 语义与来源 | `init` 不再覆盖已存在 `config.yaml`（**并删除 stage-46 对该文件的备份接入块** + 同步 `manual/core/backup.md`）；profile 来源修正 | `core/init.ts`、`core/config.ts`、`core/flow-manager.ts`、`.openfeel/manual/core/backup.md` |
| op-004 | 事务顺序与失败一致性 | `--purge` 移到 save 后；jsonc 备份失败混合裁定 | `core/flow-manager.ts`、`commands/flow.ts`、`core/{setup,update}.ts`、manual |
| op-005 | 模板泛化补漏 | `agents-md/{zh-CN,en}.md:112` + build | 模板权威源、生成段 |
| op-006 | 文档残留清理 | kb 过期引用 + 2 处版本清单文本 | `kb/architecture.md`、版本级/ stage-43 计划 |
| op-007 | 测试与回归 | 翻转清单 + 隔离 HOME + 全量 | 测试文件 |

### 完成标准

- 11 项修复验收通过；归属项记录在案；`config/BUG-002` 语义修复后 `init` 重跑不覆盖用户 `config.yaml`。
- 翻转清单（`init.test.ts:165/:191`、`flow-manager.test.ts` builtin 断言等）全部同步。
- `npm run build && npm test` 全绿（≥ 41 文件 / 685 用例）；`lint i18n` + `lint kb` 零错误；测试隔离 HOME。

---

## stage-43：CLI 文档 skill 化与版本收口

> **硬性前置**：stage-41（须文档化其新命令）。**软前置**：stage-42（文档化 `config effective`）。**对应需求**：第三节新增需求（U4）。
> **详细计划**：待 Feel 注册后二次细化。

### 关键裁定

- **skill 名**：`openfeel-cli-usage`（P8）。
- **职责边界**（P8）：`openfeel-cli-usage` = **查询型参考**（命令清单/参数/phase 枚举/stageId 约定/典型场景，只读不自执行）；`openfeel-wizard` = **执行型交互向导**（跑 `openfeel flow wizard`）。二者在描述与正文中互相交叉引用，避免 Agent 误用。
- **部署管线**（核实见第五节）：唯一权威源 = `src/core/templates-data/opencode/skills/openfeel-cli-usage/SKILL.md`（**扁平单文件、中文**）；build 步骤 4（`build.js:177-205` → `src/core/update.ts` 的 `SKILL_DEFINITIONS`）与步骤 6（`build.js:259-293` → `src/core/template-loader.ts` 的 `OPENCODE_SKILL_DEFINITIONS`）**自动按目录枚举纳入**，无需改 `build.js`；步骤 8（`build.js:1085-1092`）重生成 `.opencode/skills/` 自举实例；`NEW_SKILL_NAMES` **不存在**，无需同步（若评审推翻，须补）。

### 任务清单（op 级）

| op | 主题 | 说明 | 涉及文件 |
|----|------|------|----------|
| op-001 | 新增 `openfeel-cli-usage` skill | ① 新建权威源 `SKILL.md`：frontmatter（`name` + `description`，description 用于自动发现，须含"CLI 命令用法/phase/stageId 约定"触发词）；正文含：命令清单（含 stage-41 新增 `flow phases`/`flow stage remove`/`plan stage add --deps` 与 stage-42 的 `config effective`）、phase 枚举 15 项与转移表、stageId 三格式与目录映射约定（引用 `manual/core/plan-path.md`）、典型场景（落地阶段/声明依赖/纠错移除/查询有效配置）、与 `openfeel-wizard` 边界说明；② 运行 `npm run build` 重生成生成段与 `.opencode/skills/` 自举实例；③ 确认 build 一致性断言通过、`.opencode/skills/openfeel-cli-usage/SKILL.md` 为构建产物（含生成标记，禁止手改） | NEW `src/core/templates-data/opencode/skills/openfeel-cli-usage/SKILL.md`、`src/core/update.ts`（生成段）、`src/core/template-loader.ts`（生成段）、`.opencode/skills/openfeel-cli-usage/SKILL.md`（产物） |
| op-002 | 文档与交叉引用同步 | ① `docs/commands.md` 补 `flow phases` / `flow stage remove` / `plan stage add --deps` / `config effective`，并加三入口关系表；② `.openfeel/manual/cli/commands.md` 同步；③ `.openfeel/manual/core/plan-path.md` 补「冲突检测/建议名」API；④ 全局 `AGENTS.md`（约束层）若列举命令/技能，同步 skill 名；⑤ `openfeel-wizard` skill 正文加交叉引用「静态命令参考见 `openfeel-cli-usage`」 | `docs/commands.md`、`.openfeel/manual/cli/commands.md`、`.openfeel/manual/core/plan-path.md`、`AGENTS.md`、`src/core/templates-data/opencode/skills/openfeel-wizard/SKILL.md` |
| op-003 | 版本 1.1.2 收口 + 全量回归 | ① **版本收口按 §3.1 权威清单执行**（A1~A8 必改 + B 生成段 + C 全局传播 + D 禁改 + E 无载体；**行号已按 stage-41~47 实盘更新**：A5/A6=`:141`、A7=`:145`、B=`:2833/:3286`）；② `CHANGELOG.md` 追加 `## [1.1.2] - <发布日>`；③ `npm run build && npm test` 全绿；④ `openfeel lint i18n` / `openfeel lint kb` 零错误；⑤ `manual` 引用一致性抽查 | `package.json`、`.openfeel/config.yaml`、`src/core/config.ts`、`src/core/templates-data/agents-md/{zh-CN,en}.md`、`src/core/template-loader.ts`（生成段）、`AGENTS.md`、`package-lock.json`、`CHANGELOG.md` |
| op-004 | 测试隔离缺口修复（`config/BUG-004`） | `test/core/workspace/identity.test.ts` 加 `vi.mock('node:os')`（N4 单点）+ 删除保存/恢复直写逻辑 + 新增隔离守护用例（`importActual` 记录真实 `~/.openfeel/config.json` mtime/hash，运行前后断言不变）；455 条死映射**不自动清理**，仅文档化安全步骤 | `test/core/workspace/identity.test.ts`、`.openfeel/manual/core/global-paths.md`（或 kb） |
| op-005 | 版本清单复核收口 + 文本残留闭环 | §3.1 行号复核更新（已落地）；收口 `v1.1.2/plan.md:24` 文本；`REV-43 REV-003` 闭环登记（`resolved`，不改状态）；`REV-46 REV-007` 复核（状态行 `pending` vs 验收 `closed` → 归 openfeel-reviewer 同步） | `.openfeel/plan/v1/v1.1.2/plan.md`、`REV-v1.1.2-stage-43.md`（处理记录） |

### 完成标准

- `openfeel setup`/`openfeel update` 后全局 `~/.config/opencode/skills/openfeel-cli-usage/SKILL.md` 存在且内容与权威源一致；`update` 幂等
- `listOpencodeSkillNames()`（`template-loader.ts:7502`）包含 `openfeel-cli-usage`；`SKILL_DEFINITIONS` 键集包含之
- 新 skill 描述含明确触发词，Agent 可在需要 CLI 用法时自动加载
- 版本号收口按 **§3.1 权威清单**（A1~A8 + B/C/D/E）执行；`npm test` 全绿；`lint i18n`/`lint kb` 零错误
- `docs/commands.md` 与 `manual/cli/commands.md` 与 CLI 实际行为一致（抽查新命令）

### 风险

- **生成段手工编辑风险**：`update.ts`/`template-loader.ts` 的生成段禁止手改，只能经 `npm run build` 生成（kb「模板单源架构」）。
- **`.opencode/skills/` 是构建产物**：不得手工新增 skill 目录，否则 build 步骤 8 会清空重生成而丢失。
- **skill 描述触发词不足**：若 description 未含「CLI 命令/phase/stageId」等词，Agent 不会在需要时加载。
- **版本常量遗漏**：`config.ts` 有两处（`:308`、`:365`），须一并改。

---

## stage-48：事件加固 + 遗留问题修复

> **硬性前置**：stage-43（已 done；本阶段修改其创建的 skill 权威源与已收口版本号，**不改版本号**）。**下游**：stage-49。
> **详细计划**：`.openfeel/plan/v1/stage-48/plan.md`。
> **定位**：三大过程事件机制加固 + 13 项遗留清理。

### 关键裁定（H1~H11）

- **H1/H2**：审查纪律**入 reviewer agent 模板**（双语），四条——①工具异常即中止并如实报告；②可疑历史结论不得继承、须独立取证；③关键事实以命令行取证为准；④结论须「命令 + 版本 + 环境」第三方可复现。
- **H3**：REV「可信度声明」规范入 manual + kb，**保留原文不删**。
- **H4**：Feel 侧**审查会话健康探测**建议纳入（首轮最小工具自检，异常即重开会话）。
- **H5**：`flow.test.ts`/`plan.test.ts` 补 `vi.mock('node:os')` + **CI 环境哈希守卫** + kb/patterns 反例。
- **H6**：`ensureGlobalConfig` **不加** `NODE_ENV==='test'` 类守卫（生产代码不分支测试环境）——仅评估。
- **H7/H8**：执行型指引统一 `node bin/openfeel.js <cmd>`（查询型保留 `openfeel` + 加注）；CI 增版本一致性断言 + `lint i18n`。
- **H9**：`bin/openfeel.js` 全局旧版告警**判定不做**（可选增强，理由见 stage-48 §六 R5）。
- **H10**：455 条死映射**执行清理**（脚本 + 隔离副本验证 + 备份 + 复核）。
- **H11**：REV 状态滞后项**仅提请审查官同步**（planner 不自行改状态）。

### 任务清单（op 级）

| op | 主题 | 说明 | 涉及文件 |
|----|------|------|----------|
| op-001 | 事件 A：审查纪律 + 可信度规范 | reviewer/feel 模板双语新增纪律节 + manual/kb 规范 + build | `agents/{zh-CN,en}/{openfeel-reviewer,feel}.md`、`template-loader.ts`、`.opencode/agents/*`、manual、kb |
| op-002 | 事件 B：隔离 + CI 守卫 | 两测试补 `vi.mock('node:os')`；ci.yml 环境快照守卫；kb 反例；H6 结论 | `test/commands/{flow,plan}.test.ts`、`.github/workflows/ci.yml`、kb |
| op-003 | 事件 C：口径 + 版本门禁 | 执行型指引统一；ci.yml 版本一致性 + `lint i18n`；H9 结论 | skill 权威源、`AGENTS.md`、`manual/cli/*`、ci.yml |
| op-004 | 遗留批：i18n + 措辞 + REV 提请 | `flow phases --json` help 文案（i18n 真源）；`agents-md:115`/`AGENTS.md:122` 补「平台默认 ask」限定；5 处 REV 状态提请 | `i18n-data/*`、`commands/flow.ts`、`agents-md/*`、`AGENTS.md`、REV 文件（不改状态） |
| op-005 | profile.yaml 健壮性 | 子 Schema `.passthrough()`（#7）；非法 YAML 不覆盖 + 记异常（#8） | `src/core/config.ts` |
| op-006 | 455 条死映射清理（#13） | 一次性脚本 + 隔离副本验证 + 备份 + 执行 + 复核 | `.openfeel/tmp/*.mjs`、真实 `~/.openfeel/config.json` |
| op-007 | 测试与全量回归 | 新增/调整测试 + 隔离 HOME + 全量 | 测试文件 |

### 完成标准

- 事件 A/B/C 加固落地（模板纪律双语、隔离补齐 + CI 守卫、口径统一 + 版本门禁），H6/H9 结论记录。
- 13 项遗留按分派处置；455 死映射清零且有备份；REV 状态行由审查官同步（本阶段仅提请）。
- `npm run build && npm test` 全绿；`lint i18n`/`lint kb` 零错误；全程隔离 HOME。

---

## stage-49：整仓全量审查

> **硬性前置**：stage-48。**定位**：**纯审查阶段**（默认不改源码），范围**不限 v1.1.2**。
> **详细计划**：`.openfeel/plan/v1/stage-49/plan.md`。

### 审查分区（8 单元 + 汇总）

| 单元 | 领域 | 核心必查 |
|:--:|------|----------|
| U1 | 核心流水线 `flow-manager` | 状态机/并发/存量数据健壮性/日志覆盖 |
| U2 | CLI 命令层 | help vs 行为/退出码/dry-run·force 一致性/i18n 覆盖/三入口 |
| U3 | 配置与画像 | 级联来源正确性/profile 读写安全/全局状态文件锁 |
| U4 | 模板·agent·skill | 单源与双注入断言/双语/frontmatter vs schema/受管区 |
| U5 | 测试体系 | **全量逐一**核对隔离/伪隔离反例/断言有效性 |
| U6 | 文档·手册·kb | 文档-实现对齐/kb 时效与 `lint kb`/历史归档只读 |
| U7 | 构建与发布 | build 幂等/CI 充分性/pack 内容/依赖一致性 |
| — | 汇总（op-008） | 报告 + REV 索引 + **修复流转裁定** |

### 审查总则（要点）

- 六维度：正确性 / 一致性 / 文档-实现对齐 / 边界与健壮性 / 安全面 / 过度设计。
- 取证：`命令 + 工具版本 + 环境` 三要素；命令行取证优先（H2）。
- 隔离：任何实测不得触碰真实全局目录与仓库 `config.yaml`。
- 流转：`blocking` → 当阶段修；其余 → 后续补丁阶段 / 归档官；历史归档只读。

### 完成标准

- 8 单元报告 + REV 全覆盖；汇总报告 + 公共摘要 `code_review/stage-49.md`；**8 个单元 REV 已登记 `code_review/index.md`**；`blocking` 项有明确去处（本阶段修复或论证改判）。
- 审查过程环境哈希前后一致；未回改历史归档；全量回归保持全绿。

---

## stage-50：全量审查 non-blocking 集中清理（第二批）

> **硬性前置**：stage-49（已 done/归档；本阶段清单全部来自其总报告 §五 流转裁定）。**定位**：v1.1.2 收尾的清零批次。
> **详细计划**：`.openfeel/plan/v1/stage-50/plan.md`。

### 待修清单（T1~T57 · 6 批次）

| 批次 | 主题 | 条目 | op |
|:--:|------|------|:--:|
| **A** | 内部模式一致性 | T1~T16（current.op 悬空/缺 ops 守卫/`indexOf` 分割/fuzzy 唯一性/logMilestone 丢字段/paused 覆盖/instruction-loader 复制/单例固化/checkpoint 死键/REV ID 竞态/zombie 无锚/shell 拼接） | op-001 |
| **B** | 门禁与 CI 失效面 | T17~T21（`lint` 退出码★/CI 守卫窗口+覆盖+coverage★/transitions 差异显式化/`.gitignore` tmp/`.gitattributes`） | op-002 |
| **C** | 死代码与配置面 | T22~T37（`utils/path.ts` 删除/`atomicWriteJson`/`setup` skipped/`update_infos` 清理★/`computeBackupRel` 越界/backup homedir/profile 深拷贝/级联 Zod/原型链/projects 校验/盘符大小写/profile 读静默/knowledge `\|`/config description/`config set` 对称★/双入口★） | op-003 |
| **D** | i18n 与命令体验 | T38~T42（arguments 泄漏/并发文案/wizard 非 TTY/REPL/init·roadmap try-catch/catch 复制） | op-004 |
| **E** | 测试质量与覆盖 | T43~T52（环境依赖测试/静默 skip/弱断言/覆盖缺口★/anomaly 去重/migrate 失败语义/backup ts 撞名/jsonc 降级/state 无锁/rollback cwd） | op-005 |
| **F** | 模板与文档口径 | T53~T57（**`templates/BUG-003` 部署型 skill 34 行/5 skill**/`agents-md/en.md:438`/`cli-usage` 枚举/`build.js` 注释/CHANGELOG） | op-006 |
| — | 回归收口 | 四门禁 + 环境双快照 | op-007 |

> ★ = 待裁定项（R1~R6，涉行为变更/策略选择）；详见 stage-50 plan §三。

### 完成标准

- T1~T57 全部处置（52 修 / 6 待裁定按用户裁定或建议实施 / 3 不修 + 归档与已闭环显式记录）。
- 门禁全绿：`npm run build && npm test`（基线 **41 文件 / 716 用例**）；`lint i18n`（**533 键**）；`lint kb`（**0 过期**）。
- 测试隔离硬要求（hash+mtime 双快照零 diff）；`templates/BUG-003` 满足关闭条件；生成段/自举经 build 同步且幂等。

---

## stage-51：流水线状态维护与 CLI 可维护性（反馈二）

> **硬性前置**：stage-50（热区串行 + T1↔N4 协同 + T8↔N9 协同）。**来源**：`docs/phase-5/08-openfeel-workflow-feedback.md`。
> **详细计划**：`.openfeel/plan/v1/stage-51/plan.md`。
> **定位**：补齐「纠正/清理」侧 CLI（创建侧齐备、纠正侧空白）。

### 编号化清单（N1~N11 · 3 批次）

| 批次 | 主题 | 条目 | op |
|:--:|------|------|:--:|
| **H1** | 纠正/清理能力骨架 | **N1** 孤儿 op 回收与检测（`plan scheme remove` + `flow repair` 对账 + `flow health` warn）／**N2** 结构字段 CLI（`flow stage set --deps`、reviews update/remove）／**N3** `scheme create` 注册语义统一（隐式注册时补 overview/status 骨架） | op-001~003 |
| **H2** | 状态维护可用性 | **N4** `flow attempt` 同步 `current.op`（**与 stage-50 T1 共用 `syncCurrentOp`**）／**N5** `stage set` 幂等化 + 按需备份／**N6** `stage task --add`、`plan stage add --tasks`／**N7** `stage set` 字段扩展（`--exec-mode/--auto-advance/--review-agent`）／**N8** op 文件名固定 `op-NNN.md`（读取端兼容回退） | op-004~006 |
| **H3** | 布局与噪声 | **N9** knowledge index 宽容解析 + **新增 `openfeel knowledge dedup` 子命令**（A6 用户裁定：暴露而非删除）／**N10** 日志布局**仅统一未来写入 + 索引共存说明（不迁移历史）**（A7 用户裁定）／**N11** git 脏区警告降噪（`--quiet` / 仅 done 提示） | op-007~008 |
| — | 回归收口 | 四门禁 + 环境双快照 | op-009 |

### 协同约束（跨阶段）

- **T1 ↔ N4**：`current.op` 生命周期必须**单一 owner**（新增 `syncCurrentOp(stageName)`，被 `advanceStagePhase` 与 `recordAttempt` 共用）；任一侧先实施须在另一侧登记。
- **T8 ↔ N9**：**stage-50 T8 的 `basePath` 参数化是 N9「新增 `openfeel knowledge dedup` 子命令」的基础（A6 用户裁定后 T8 不再作废）**；子命令须复用 T8 的 `basePath`，两侧禁各自实现路径解析。
- **不纳入**：反馈 #6 的 `config set` 白名单（归 stage-50 T36/R3）；#3(b) 报错回显（已修）。

### 裁定项（**用户已裁定 2026-09-30**）

**A1** `scheme create` 补骨架（零破坏）／**A2 孤儿 op 默认只报告 + `--prune-orphans`**／A3 `stage set` 同值 no-op／A4 `stage set` 字段白名单／**A5 op 文件名改 `op-NNN.md` 且不做迁移命令**／**A6 暴露 `openfeel knowledge dedup` 子命令（不删除；T8 为其基础）**／**A7 仅统一未来写入 + 不新增历史迁移命令 + 索引共存说明**／A8 git 警告默认仅 `--to done` + `--quiet`。**A2/A5 与 Planner 建议一致；A6/A7 与建议相反，已按用户裁定落地**（详见 `plan/v1/stage-51/plan.md` §五）。

### 拆阶段结论

**建议不拆**（单 stage-51 / 9 op）；可选拆分点：若认为过大，将 **H3（N9/N10/N11）** 拆为 stage-52（含新增公开子命令与布局/索引约定，原「历史数据迁移」已按 A7 裁定取消）。

### 完成标准

- N1~N11 处置完毕（10 条按建议 + A2/A5/A6/A7 按用户裁定）；门禁全绿（716 用例 / 533 键 / kb 0 过期）；测试隔离零污染；`current.op` 单一 owner 落地。

---

## 七、测试策略

| 验证点 | 阶段 | 方式 |
|--------|:--:|------|
| `flow phases` 输出完整性 | 41 | 单元测试断言输出含全部 15 phase 与转移表；`--json` 可 `JSON.parse`；数据源 = 运行时 `pipelineConfig`（构造自定义 `pipeline.yaml` fixture 验证优先于硬编码默认） |
| stageId 校验/建议名 | 41 | `path.test.ts` 新增：合法/非法格式；`v0.0.1` → 建议名；短名规范化 |
| (series, stageDir) 冲突检测 | 41 | 构造 `v4-stage-04` 已存在再添加 `v4.0.0-stage-04` → 断言抛错；同 stageId 重复 → 幂等跳过不抛错 |
| `flow stage remove` 安全校验 | 41 | `ops` 非空拒绝；当前活跃阶段拒绝；`--force` 越过；`--dry-run` 不写盘；移除 current 后回退到首个非 done；并发冲突退出码 2 |
| `plan stage add --deps` | 41 | `flow.json.stages[x].deps` 与 `overview.md`「## 依赖」断言；`plan.test.ts` 扩展 |
| 三入口收敛 | 41 | `stage create` 输出 deprecated 提示（TTY）；三入口非法 id 均报错+建议名 |
| `auto_advance` 级联来源 | 42 | `flow-manager.test.ts`：构造 profile + config + status.md 三级不同值 → 断言有效值与 `source`；仅 profile 时取 profile；全无时 builtin |
| `config effective` 输出 | 42 | `config.test.ts`：**隔离 fixture / 临时 HOME** 构造组合——「画像 enabled + 项目 disabled」→ `disabled`/`config.yaml`；「项目 enabled + 画像 disabled」→ `enabled`/`config.yaml`；「仅画像」→ `profile.yaml`；「全无」→ `disabled`/`builtin`；「status.md 覆盖」→ `status.md`。**不依赖本项目真实配置值** |
| `pipeline.phase=done` | 42 | 单阶段推进到 done → `done`；多阶段仅一个 done → `active`；`validate()` 通过 |
| 审计日志补齐 | 42 | `plan stage add` / `plan scheme create` 后 `flow.json.log` 末条 action 断言；`advance` 路径日志数不增 |
| 模板文案一致性 | 42 | Grep 断言无「优先使用全局画像」残留；生成段与权威源一致 |
| 新 skill 全链路 | 43 | `template-loader.test.ts`：`listOpencodeSkillNames()` 含新名；`update.test.ts`/`setup.test.ts`：全局部署含新 skill；`opencode-instance.test.ts`：`.opencode/skills/` 自举含新 skill |
| 权限键补齐 | 44 | 断言 9 agent × zh/en frontmatter 含 `external_directory`；zh/en permission 键集一致；utility 键与 schema 对齐（op-000 确认后）；生成段与权威源一致 |
| 权限语义实测 | 44 | op-000 隔离 HOME + `opencode debug config`：覆盖/合并语义、默认值、`write` 是否识别、项目 jsonc 优先级（无法构件外部访问时以 effective ruleset 为准并标注局限） |
| 描述泛化零行为变更 | 45 | `global-paths.test.ts:31-64`（路径硬断言）**不改**且全绿；Grep 断言无「唯一 harness」残留；`AGENTS.md:82` 已泛化；B 类内容未动 |
| 部署前备份 | 46 | NEW `backup.test.ts`：不存在不备份 / 已存在备份成功 / 备份失败可识别 / manifest 记录 / `{ts}` 目录不复用；`update`/`setup` 覆盖写产生备份且 `created` 不备份；`init` package.json 改写前备份 |
| `update_infos` 备份类 | 46 | `backed` 类写入与读取；旧格式文件向后兼容解析；`- [ ]`→`- [x]` 勾选；非 TTY 静默 |
| 缺陷集中清理 | 47 | `flow phases` 自定义 phase 边界说明 + `--json.advanceAccepted`；冲突错误 en 文案；archive 缺 deps 不崩；`save()` 缺 meta 不崩；`init` 重跑 `config.yaml` 字节不变；无 profile 时 `config effective` source=`builtin`；`--purge` 无中间态；setup/update jsonc 备份失败走 skip+anomaly（migrate fail-fast）；`agents-md:112` 泛化；`lint kb` 零过期引用 |
| 版本同步 | 43 | 按 §3.1 断言 A1~A8 均为 `1.1.2`（含 agents-md 权威源与 `package-lock`） |
| 全量回归 | 47 / 43 | `npm run build && npm test`（stage-47 为发布前最后一次全量回归）；`openfeel lint i18n` / `openfeel lint kb` |

**现有测试需同步/扩展**（调研）：

- `test/core/plan/path.test.ts`（新增校验/冲突/建议名）
- `test/core/plan/stage.test.ts`、`test/commands/plan.test.ts`（`--deps` 透传）
- `test/core/flow-manager.test.ts`（`pipeline.phase`、级联、`removeStage`、审计日志）
- `test/core/config.test.ts`（`config effective`）
- `test/core/template-loader.test.ts`、`test/core/update.test.ts`、`test/core/setup.test.ts`、`test/core/opencode-instance.test.ts`（新 skill 全链路 + stage-44 权限键断言）
- `test/core/plan/scheme.test.ts`、`test/core/plan/stage.test.ts`（stage-42 scheme 兜底冲突检测 / 审计日志）
- `test/core/global-paths.test.ts`（**stage-45 不改**：未改路径逻辑，硬断言仍成立 —— 须在 op-004 说明理由）
- `test/core/i18n.test.ts`（键对称，随新增/改动键自动校验）
- **stage-47 翻转清单**（`test/core/init.test.ts:165/:191` stage-46「备份后仍覆盖」→ 新语义「存在即跳过」；`flow-manager.test.ts` builtin 来源断言；archive 缺 deps 正向用例；setup/update jsonc 失败跳过用例）

---

## 八、风险点与回滚

| # | 风险 | 影响 | 缓解 |
|---|------|------|------|
| R1 | `flow phases` 展示的转移表与实际 `advance` 不符 | 中（自描述名不副实） | 统一走运行时 `pipelineConfig`（P13）；fixture 测试 |
| R2 | `flow stage remove --purge` 误删计划产物 | 高（数据丢失） | 默认不删目录；`--purge` 需显式 + 非 TTY 拒绝；建议先 `--dry-run` |
| R3 | `pipeline.phase` 语义裁定偏差（P3 全量判定 vs 备选 A 即时置 done） | 中（状态机行为） | 计划提交审查裁定；若审查选 A，改动缩小为单行三元表达式；测试覆盖两场景 |
| R4 | 接入 profile 层改变既有级联（P2 行为变更） | 中 | 仅作最低优先级兜底；已显式声明 `auto_advance` 的项目值不变；`config effective` 可即时验证 |
| R5 | `flow-manager` → `config.ts` 循环依赖 | 中（构建/运行失败） | 实施前 `madge`/tsc 实测；若成环，改由命令层注入 profile 值 |
| R6 | 新 skill 未自动纳入 build 校验 | 中（部署缺失） | 实施后实测 `listOpencodeSkillNames()` 与全局部署；断言自动枚举（`build.js:36,259-293`） |
| R7 | 隐藏英文 skill 路径（第三节纠正被推翻） | 低 | 评审复核；若存在 en 源，追加同内容英文版并核对 |
| R8 | `stage create` deprecated 破坏存量脚本 | 低 | 保留功能不删；仅输出提示 |
| R9 | i18n 键不对称导致 `lint i18n` 失败 | 低 | 新增键同时补 `zh-CN.ts`/`en.ts` |
| R10 | opencode 权限覆盖/合并语义未确证，权限修正可能不生效 | 中 | stage-44 op-000 硬性前置实测；补键方案对覆盖/合并两种语义均有效；无法确证项标注局限 |
| R11 | `external_directory: allow` 被审查认为过于宽松 | 中 | O2 已列备选（`ask` + 文档化放行）；依据「bash:allow 已等价」论证 |
| R12 | stage-45 泛化误改路径逻辑 / 与 stage-44 写冲突 | 中 | 严格限注释/文案 + `global-paths.test.ts` 断言不变；44→45 强制串行 |
| R13 | stage-46 备份累积膨胀 `~/.openfeel/backup` | 低 | 本阶段不做清理（避免过度设计），manual 说明可手工清理；后续可单独立项 |
| R14 | `update_infos.md` 格式变更致旧文件解析失败 | 中 | 正则向后兼容（尾部段可选）+ 单测覆盖旧格式 |
| R15 | 备份失败仍写入 → 数据丢失 | 高 | B3：备份失败**跳过该文件写入** + 记异常 |
| R16 | stage-46 与 stage-45 同改 `init/setup/update.ts` | 中 | **hard 串行 45 → 46** |

**回滚方案**：

- 各 stage 独立提交，可按 stage `git revert`。
- 纯增量修复，无数据迁移；`flow.json` 历史数据不因本版本改写（`pipeline.phase` 变更仅影响后续推进）。
- 新 skill 为纯新增文件，回滚删除权威源并 `npm run build` 即可；全局已部署的 skill 可由用户手动清理（`update` 不主动删非框架文件）。
- 权限修正（stage-44）为模板文案级改动，回滚 `git revert` 后 `npm run build` 重生成即可；不涉运行时数据。
- 描述泛化（stage-45）为零行为变更文案改动，回滚无副作用。
- 部署前备份（stage-46）为纯新增能力 + 新增提示类；回滚 `git revert` 后既有部署行为不受影响（已产生的 `~/.openfeel/backup/` 数据可保留）。
- 版本号仅在 stage-43 变更，未发布前回滚无外部影响。

---

## 九、里程碑与交付物

| 里程碑 | 阶段 | 交付物 |
|--------|:--:|------|
| M1 自描述与可纠错 | stage-41 done | `flow phases`（含 `--json`）、`flow stage remove`（安全校验）、stageId 校验/建议名/冲突检测、`plan stage add --deps`、三入口分层 |
| M2 状态与口径正确 | stage-42 done | `auto_advance` 四级有效链 + `config effective`、`pipeline.phase=done` 修正、`register_stage`/`register_op` 审计日志 |
| M2.5 权限模型修正 | stage-44 done | 9 agent × 双语补 `external_directory`；覆盖语义文档化；op-000 实测记录 |
| M2.6 平台描述泛化 | stage-45 done | 模板/规则/注释/文档/手册去「唯一 harness」表述（零行为变更）；`AGENTS.md:82` 泛化 |
| M2.7 部署前备份 | stage-46 done | 写前备份到 `~/.openfeel/backup/{ts}/`；`update_infos.md`「备份」类；`feel.md` 检查规则 |
| M2.8 缺陷集中清理 | stage-47 done | 11 项已登记缺陷修复（含 `config/BUG-002` high 语义修复）+ 翻转清单同步 + 发布前全量回归绿 |
| M3 skill 化与发布 | stage-43 done | `openfeel-cli-usage` skill（全局可部署）、文档/手册同步、版本 1.1.2 **全部载体一致（清单见 §3.1）**、`config/BUG-004` 测试隔离修复、`npm test` 全绿 |
| M4 事件加固与遗留清零 | stage-48 done | 审查纪律/可信度规范入模板；测试隔离补齐 + CI 环境守卫；执行口径统一 + CI 版本门禁；13 项遗留清零（含 455 死映射） |
| M5 整仓审查 | stage-49 done | 8 单元审查报告 + REV + 汇总；blocking 项闭合；基线全绿 |
| M6 非阻塞清零 | stage-50 done | T1~T57 处置完毕（52 修 + 6 裁定 + 3 不修留痕）；四门禁全绿；环境零污染 |
| M7 纠正侧 CLI 补齐 | stage-51 done | N1~N11：孤儿 op 回收 / 结构字段 CLI / 注册语义 / `current.op` 单一 owner / stage set 幂等与字段 / op 文件名 / knowledge / 日志布局 / git 降噪 |
| **v1.1.2 发布** | 全部 done | `npm publish` 就绪 + `CHANGELOG.md` 更新 |

---

## 十、变更汇总

| 类别 | 预估数量 | 说明 |
|------|:--:|------|
| 新增命令 | 3 | `openfeel flow phases`、`openfeel flow stage remove`、`openfeel config effective` |
| 新增选项 | 1 | `openfeel plan stage add --deps` |
| 新增源码/函数 | ~4 | `path.ts` 三函数（`validateStageId`/`suggestStageId`/`findStageDirConflict`）；`flow-manager` 访问器与 `removeStage`；**NEW `src/core/backup.ts`**（46）+ `global-paths.getGlobalBackupRootPath()` |
| 修改源码 | ~13 | `flow-manager.ts`、`path.ts`、`plan/stage.ts`、`plan/scheme.ts`、`commands/{flow,plan,stage,config}.ts`、`config.ts`（stage-45 另涉 `{global-paths,opencode-config,model-config,init,setup,migrate}.ts` + `commands/{init,setup,migrate,project}.ts` 的**注释/文案**）；**stage-46 逻辑改动：`update.ts`（`writeManagedFile`）、`setup.ts`、`init.ts`、`update-infos.ts`、`global-paths.ts`** |
| 新增 skill | 1 | `openfeel-cli-usage`（权威源 + 生成段 + 自举产物） |
| 模板/文案 | 3 组 | ① `agents/{zh-CN,en}/feel.md` 的 `auto_advance` 表述（42）；② **9 agent × zh/en 的 `permission.external_directory`（44）**；③ agents-md / feel / archiver / utility / 3 个 model 系 skill 的平台表述泛化（45） |
| 文档/手册 | ~6 | `docs/commands.md`、`manual/cli/commands.md`、`manual/core/plan-path.md`、`AGENTS.md`、`.openfeel/dev/dev_core.md`、`.openfeel/adapters/README.md`、`README{,.zh-CN,.en}.md`、`CHANGELOG.md`、`.openfeel/manual/**` |
| i18n 键 | ~15 新增 + ~14 文案泛化 | 三个新命令 + 校验提示 + deprecated 提示（42/41）；i18n 平台表述泛化（45，zh `:438,442,573,634,636,653,654` / en `:418,421,540,601,603,620,621`） |
| 测试 | ~12 文件 | path/stage/flow-manager/config/template-loader/update/setup/opencode-instance/global-paths + **NEW `backup.test.ts`**（46）+ `update-infos.test.ts`（46）+ **stage-47 翻转清单**（`init.test.ts:165/:191` 等） |
| 版本 | **8 处必改 + 生成段 + 传播** | 见 §3.1（A5/A6=`agents-md/{zh-CN,en}.md:141`、A7=`AGENTS.md:145`、B=`template-loader.ts:2833/:3286`；A8 `package-lock` 1.0.7 漂移仍在）；`npm run build` 重生成；`openfeel setup/update` 重传播全局 AGENTS.md |
| 阶段 48 加固/遗留 | 7 op（13 项遗留编号化清单见 stage-48 §一） | 模板纪律（reviewer/feel 双语）+ manual/kb 规范；测试隔离补齐 + CI 环境守卫；执行型口径统一 + CI 版本门禁 + `lint i18n`；i18n help 文案 + 权限措辞精化 + 5 处 REV 状态提请；profile.yaml 子 Schema passthrough + 非法 YAML 不覆盖；455 死映射清理（脚本+备份） |
| 阶段 49 审查 | 9 op | 8 单元审查报告 + 8 REV + 汇总报告 + 公共摘要 + index 登记；修复流转裁定 |
| 阶段 50 清理 | 7 op | T1~T57 六批次（A 一致性 / B 门禁 / C 死代码与配置 / D i18n / E 测试 / F 模板口径）≈ 35~40 文件、600~900 行；含 `templates/BUG-003` 关闭 |
| 阶段 51 纠正侧 | 9 op | N1~N11 三批次（H1 纠正/清理骨架 / H2 状态维护可用性 / H3 布局与噪声）≈ 20~25 文件、800~1200 行；含 3~4 新命令/子命令；T1↔N4 单一 owner |

> 本计划引用知识库多条既有条目；完成后须由 openfeel-archiver 沉淀：「CLI 命令文档 skill 化模式」「阶段移除的安全校验与 current 兜底模式」「配置级联有效值与来源暴露模式」，并更新 `manual/cli/commands.md` + `manual/core/plan-path.md`。

---

## 十一、修订记录

| 时间 | 修订人 | 依据 REV | 修订内容 |
|------|--------|----------|----------|
| 2026-09-28 | openfeel-planner | REV-v1.1.2-stage-41 REV-001 | U1 版本收口由「四处同步」扩充为 **§3.1 权威清单**（8 处必改 + 生成段 + 传播 + 不得修改清单）；新增 §3.2 环境基线变更记录 |
| 2026-09-28 | openfeel-planner | REV-v1.1.2-stage-42 REV-001 | P2a 由「本项目 profile vs config 冲突（有效值 disabled）」更正为 **框架级「文档 vs 实现」不一致**；删除项目具体值断言，改为隔离 fixture 验收；新增「不得覆写本项目三值」约束；op-001 增加陈旧注释连带修正 |
| 2026-09-28 | openfeel-planner | REV-v1.1.2-stage-41 REV-002 | 数字漂移修正：`428 条日志/41 阶段` → 「以实施时实盘为准（撰写时 44 阶段 / 431 条日志）」 |
| 2026-09-28 | openfeel-planner | REV-v1.1.2-stage-41 REV-003 | `scheme.ts` 自动注册兜底路径的冲突检测并入 stage-42 op-004（见该阶段计划） |
| 2026-09-28 | openfeel-planner | REV-v1.1.2-stage-42 REV-002 | 审计日志双轨说明（`add_stage` vs `register_stage`）补入 stage-42 op-004 |
| 2026-09-28 | openfeel-planner | REV-v1.1.2-stage-42 REV-003 | 依赖图修正（op-003/op-004 与 op-001 并列）；既有 `pipeline.phase` 断言翻转补入风险栏 |
| 2026-09-28 | openfeel-planner | 用户新增需求一（`docs/phase-5/07-openfeel-permission-issue.md`） | **新增 stage-44（权限模型修正）**：O1~O5 裁定 + op-000~op-004；新增 `plan/v1/stage-44/plan.md` 与 overview 依赖 |
| 2026-09-28 | openfeel-planner | 用户新增需求二（平台强限定内容泛化） | **新增 stage-45（描述泛化）**：op-001~op-004；新增 `plan/v1/stage-45/plan.md` 与 overview 依赖 |
| 2026-09-28 | openfeel-planner | 阶段顺序调整（44/45 与 agent 模板冲突） | 阶段概览/依赖图/里程碑/执行顺序更新为 **41 → 42 → 44 → 45 → 43**；44→45 强制串行；45 先于版本收口 |
| 2026-09-28 | openfeel-planner | 用户新增需求（部署覆盖前备份 + 全局状态提示） | **新增 stage-46（部署覆盖前自动备份）**：B1~B8 裁定 + op-001~op-005；新增 `plan/v1/stage-46/plan.md` 与 overview 依赖；执行顺序更新为 **41 → 42 → 44 → 45 → 46 → 43**（45→46 同改 init/setup/update，强制串行） |
| 2026-09-29 | openfeel-planner | REV-v1.1.2-stage-46 REV-001~006 | stage-46 节更新：**B9 覆盖写路径全景与豁免**（`.openfeel/config.yaml` 纳入，REV-001）；B7 改为「项目内不合并 + 全局写纳入」（REV-002）；B4 `command` 枚举扩 `migrate`、读侧 `:95-98` 同步（REV-003）；B3 失败返回 `'skipped'` + 可区分异常、B5 扩展异常分支（REV-004）；B2 锁临界区（REV-005）；B4 字段风格、`backupRel` 存在性检查（REV-006）；任务清单/完成标准同步 |
| 2026-09-29 | openfeel-planner | 用户需求「stage-47 已登记缺陷集中清理」 | **新增 stage-47**：14 项缺陷逐条裁定（11 修 / 归属 / 已修复待关闭）+ op-001~007 + 翻转清单；阶段概览/依赖图/执行顺序更新为 **41 → 42 → 44 → 45 → 46 → 47 → 43**；里程碑 M2.8；测试策略新增缺陷清理行 |
| 2026-09-29 | openfeel-planner | REV-v1.1.2-stage-47 REV-001~003 | stage-47 节 op-003 补「删除 stage-46 的 `config.yaml` 备份接入块 + 同步 manual」（REV-002）；计划 §九 并行组更正、op-006 行号更正 `:438`、`flow-manager.test.ts:2786` 翻转为 `toBeUndefined()`（REV-001/003） |
| 2026-09-29 | openfeel-planner | 用户新增需求（`config/BUG-004` 纳入 stage-43；复核 §3.1 清单与 REV 状态） | **§3.1 行号复核更新**（A5/A6 `:130`→`:141`、A7 `:136`→`:145`、B `:2798/:3240`→`:2833/:3286`；A8 漂移仍在；D 行号改「示意/按内容判定」；E 澄清为「无版本号载体」）；`:24` 文本改为 §3.1 引用；stage-43 节新增 op-004（BUG-004）/op-005（复核闭环）；里程碑 M3 同步 |
| 2026-09-29 | openfeel-planner | 用户需求「v1.1.2 追加 stage-48/49（继续 v1.1.2，不新建版本）」 | 阶段概览新增 stage-48（事件加固 + 13 项遗留）/ stage-49（整仓全量审查）；依赖图与执行顺序追加 `43 → 48 → 49`；新增两节摘要（H1~H11 裁定、7 审查单元）；里程碑 M4/M5；变更汇总补两行 |

> 三处核心裁定保持不变：① #5 全局画像仅作最低优先级兜底；② #6 只修 `pipeline.phase` 全量 done 判定、不做 `current` 回退；③ 技能源为扁平单文件（16 个 `{name}/SKILL.md`）、无 `{lang}`、无 `NEW_SKILL_NAMES`。

| 2026-09-29 | openfeel-planner | REV-v1.1.2-stage-48/49 计划审查（REV-001~003/001~003） | **stage-48**：13 项遗留**编号化清单**入 §一（#1~#13 ↔ op）；op-006 匹配式改**末段匹配** + 断言删除数 455/剩余 0；基线 693→**694**；CI 版本断言明确**两 job**；新增 **H12「可疑会话产出降级」**；op-003 ① 改**全仓扫描式**；op-005 ② **定案**用 parseError+跳过写回（不引入 update-infos 依赖）。**stage-49**：**新增 U8「部署与更新链路」**（MECE 补缺）+ 覆盖矩阵 + U5/U8 边界；op 扩为 001~008 单元 + 009 汇总；新增 index 登记与「先广度后深挖」分层策略 |
| 2026-09-30 | openfeel-planner | 用户需求「v1.1.2-stage-50：全量审查 non-blocking 集中清理（第二批）」 | 阶段概览新增 stage-50；依赖图与执行顺序追加 49 → 50；新增 stage-50 摘要节（T1~T57 六批次 + 待裁定 R1~R6）；里程碑 M6；变更汇总补一行 |
| 2026-09-30 | openfeel-planner | 用户需求「v1.1.2-stage-51（反馈二：流水线状态维护与 CLI 可维护性）」 | 阶段概览新增 stage-51；依赖图与执行顺序追加「50 → 51」；新增 stage-51 摘要节（N1~N11 三批次 + 协同约束 T1↔N4 / T8↔N9 + 裁定项 A1~A8 + 拆阶段结论「不拆」）；里程碑 M7；变更汇总补一行 |
| 2026-09-30 | openfeel-planner | **用户对 A1~A8 的裁定**（不可推翻） | A2/A5 与建议一致；**A6 改为「暴露 `openfeel knowledge dedup` 子命令（不删除）」→ T8 由「或将作废」改为「N9 的基础」**；**A7 改为「仅统一未来写入 + 不新增迁移命令 + 索引共存」→ 删除历史迁移内容**。stage-51 摘要节（H3 行、裁定项、协同约束、拆阶段结论）与阶段概览规模估算（`~22~27 文件 + 900~1300 行`）同步更新 |
