# v1.2.0-stage-84 计划 — Agent/skill 契约（双主题）

- **阶段**：`v1.2.0-stage-84`（双主题 · Agent 行为契约）
- **依赖**：**hard: v1.2.0-stage-82, v1.2.0-stage-83**（命令面与聚合语义定稿后方可落 Agent 契约；避免「文案先于实现」——v1.1.7 stage-76 同口径）
- **优先级**：P0（模式标记第 ② 位读者 = Agent；决定「Agent 接取后流转需求状态」与「归档由 CLI 控制」是否可被 Agent 正确执行）
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-11
- **定位**：把 v1.2.0 双主题语义落为 **Agent 行为契约与 skill 权威源**——① `feel.md`×4（2 harness × 2 语言）：需求流转纪律（接取 / 认领 / 关联 / 流转 / 完成）+ 归档纪律（归档由 CLI 控制、**不主动读归档文件**防上下文污染）；② `openfeel-planner.md`×4：需求感知（从需求产出计划、`plan.md` 关联 `requirement_id`）；③ 新 skill `openfeel-req`（需求流转用法，权威源单文件）；④ `openfeel-cli-usage` 补 `req` 与 `flow archive` 两节；⑤ build 重生成**双生成物** + 静态断言（含 **skills 17→18 计数翻转：7 处字面量 + 5 处派生总数 + `expectedSkills` 白名单枚举**，逐点见 §三 T4）。
- **范围**：`src/core/templates-data/opencode/agents/{zh-CN,en}/{feel,openfeel-planner}.md`、`src/core/templates-data/claude/agents/{zh-CN,en}/{feel,openfeel-planner}.md`（**8 份**）、`src/core/templates-data/skills/openfeel-req/SKILL.md`（新建）、`src/core/templates-data/skills/openfeel-cli-usage/SKILL.md`、`src/core/template-loader.ts` + `src/core/update.ts`（build 重生成，禁手改）、`test/core/{templates,template-loader,setup,update,templates-migration}.test.ts`。
- **边界**：**不改** 全局约束层（`agents-md/*` / `claude/constraint/*`）——路由与调度段如需注记由方案期判定（默认最小：仅在 feel/planner 模板内落纪律，**方案期复核**是否须约束层一行注记）；**不改** schemer/executor/reviewer/archiver 等其余 subagent 模板（如需一行注记，方案期定稿）；不改源码行为；不新增第三方依赖；不 `npm publish` / 不 `git push`；不直写 `flow.json`。

## KB 检索（`openfeel-check-kb`）

- 已加载。**高度相关条目**：
  - `kb/patterns.md #Agent 模板模式感知落法：节锚点插入 + 同语言跨 harness 逐字一致 + 按 harness 替换主语 + 术语消歧` → 需求/归档纪律一律**节锚点插入**（行号会因前序插入失效）；同语言跨 harness **逐字一致**（差异仅既有 harness 差异词）；无裸主语（claude=主会话 / opencode=Feel）。
  - `kb/patterns.md #CLI 用法 skill 化模式：权威源单文件 + build 双注入 + 自举 + 快照声明` → 新 skill 零代码改动（build 自动纳入）；**翻转清单须全仓扫描写死计数与白名单数组——`expectedSkills` 是白名单而非计数、必须手工追加**（该条原文「方案首版即漏此点」；REV-84-001 同类复发，逐点清单见 §三 T4）；快照声明「以 `openfeel req --help` 为准」。
  - `kb/patterns.md #部署型资产变更的多载体同步面清单` / `#多 harness 版本收口的 A 类载体清单扩展` → 契约改动面 = **8 份 agent 模板 + 2 份 skill**；改后必须 `npm run build` 重生成双生成物。
  - `kb/patterns.md #未来功能/未落地能力写入 skill 与文档须标注「提供版本」` → skill 引用 `openfeel req` / `flow archive` 须无歧义（本版提供，写 v1.2.0 起）；若涉及未实现细节（如 `req next` 排序口径）不写死。
  - `kb/patterns.md #全量审查的发现分类与流转裁定` → 上游 pending REV 逐条明写去处（§三「承接 REV 与处置表」，REV-84-002）。
  - `kb/troubleshooting.md #断言串与落文逐字核对纪律（markdown 粗体 ** 断串致 0 命中）` → 静态断言串与模板落文**逐字核对**（含 `**` 粗体边界）。
  - `kb/architecture.md #双模式转移表选择` + ADR-010 → 需求纪律与 `workflow_mode` **正交**（不得在模板中把需求流转与 full/fast 耦合）。
  - **无**「需求流转 Agent 契约」既有条目 → 归档时补沉 patterns。

---

## 一、背景与实测证据（大计划 §二 摘引；基线 = **HEAD `ab60cb6`**，全表「符号名 @ 行号」双锚——REV-84-001 修订轮逐点复核）

| 事实 | 位置 | 结论 |
|------|------|------|
| `feel.md` 现有调度段：`#### 工作流模式（workflow_mode）`（`:212-225`）等节锚点 | `src/core/templates-data/opencode/agents/zh-CN/feel.md:212-225`（4 份对称；claude 版语义一致） | 需求/归档纪律以**新节**插入（「核心职责」/「工作流模式」邻域，方案期定节锚点） |
| `openfeel-planner.md` 现有「工作流模式感知（fast 快线）」节（`:104-109`） | `src/core/templates-data/opencode/agents/zh-CN/openfeel-planner.md:104-109`（4 份） | 需求感知节插入其后 |
| 共享 skills **17 个**；计数翻转 **7 处字面量 + 5 处派生总数 + 1 处白名单枚举**（REV-84-001） | 实测 `src/core/templates-data/skills/`（17 目录）。**字面量（17→18）**：`test/core/setup.test.ts:65` / `:221`、`test/core/templates-migration.test.ts:32` / `:41` / `:42`、`test/core/update.test.ts:816`、**`test/core/template-loader.test.ts:112`**（本轮补漏）；**派生总数**：`test/core/setup.test.ts:89`（27→28） / `:241`（55→57）、`test/core/update.test.ts:274` / `:813` / `:875`（28→29）；**白名单枚举**：`test/core/update.test.ts:149-167`（`expectedSkills` 手工追加 `openfeel-req`） | **17→18 全量翻转**（新 skill `openfeel-req`）；逐点清单见 §三 T4；白名单非计数、必须手工追加（kb `#CLI 用法 skill 化模式` 第 6 条——「方案首版即漏此点」同类复发） |
| 同源计数口径（标题/注释/生成物；**非门禁断言**） | 标题/注释：`test/core/setup.test.ts:3` / `:55` / `:88` / `:210` / `:235` / `:240`、`test/core/templates-migration.test.ts:5` / `:6` / `:27` / `:38`、`test/core/template-loader.test.ts:110`、`test/core/update.test.ts:145` / `:264` / `:272` / `:810` / `:812` / `:870`。生成物字面量：`src/core/templates-data/skills/openfeel-cli-usage/SKILL.md:52`（→**18**；生成副本 `src/core/update.ts:471` / `src/core/template-loader.ts:7023` 随 build 重生成）。死资产：`src/core/templates-data/opencode/ADAPTER.{zh-CN,en}.md:3` / `:9`（不在部署路径） | 标题/注释随对应断言同步订正；SKILL.md:52 随 T3 订正（REV-84-005）；**死资产登记转 stage-85**（REV-84-004）；`src/core/setup.ts:3` / `:57` / `:106` / `:120` 注释与 `.openfeel/manual/**` 陈旧计数**登记**（本阶段零动作，随 stage-85 收口轮复核） |
| build 按目录自动纳入 skills（步骤 4 → `update.ts`；步骤 6 → `template-loader.ts`）；步骤 8 已移除 | `build.js:34-37` / `:183-215` / `:265-303`（`:1335` / `:1363`） | `build.js` **零改动**；生成物 2 份禁手改 |
| `template-loader.ts` 为 build 生成段（含 AUTO-GENERATED 锚点） | `src/core/template-loader.ts`（`:65` / `:104` 等生成内容） | 禁手改；改模板源后重生成 |
| 既有 cli-usage skill 快照结构与「提供版本」节 | `src/core/templates-data/skills/openfeel-cli-usage/SKILL.md`（199 行） | 补 `req` / `flow archive` 两节 + 快照版本声明更新 |
| 命令面（stage-82）与归档命令面（stage-79）已定稿 | 本版前置阶段 | 契约落文可直接引用命令与参数 |

---

## 二、目标语义与不变量

| 维度 | 内容 |
|------|------|
| feel 需求纪律 | 需求接取（`req list` / `next` 视图）→ 认领（`req claim`）→ 关联（`req link`）→ 流转（`req advance` / 阶段推进驱动聚合）→ 完成（聚合自动 done；`req board` 总览）；**需求 ≠ 计划**（需求是排期调度层；编排计划仍走既有流水线） |
| feel 归档纪律 | 版本收官后**提示**归档（`flow archive <version>` 由 CLI 执行）；**不主动读 `.openfeel/flow-archive/**`**（防上下文污染）；历史查询按需 `flow archive show <version>` |
| planner 需求感知 | 接到需求时读 `req show <REQ-NNN>`；产出 `plan.md` 标注关联需求；需求状态流转由主会话经 CLI 执行（planner 不写 flow.json） |
| 新 skill | `openfeel-req`：需求流转用法（生命周期 7 状态 / 10 子命令 / 认领协议 / 与计划的关系 / 与 workflow_mode 正交）；权威源单文件、中文单语、description 含触发词 |

**不变量**：

1. **4 份 feel.md 对称**：同语言跨 harness 逐字一致（差异仅既有 harness 差异词）；opencode 既有关键串**零回归**。
2. **正交落文**：需求纪律不与 `workflow_mode`（full/fast）耦合；归档纪律不与模式耦合。
3. **生成物禁手改**：`template-loader.ts` + `update.ts` 由 `npm run build` 重生成。
4. **计数一致**：skills 17→18（**7 处字面量 + 5 处派生总数**断言 + **`expectedSkills` 白名单手工追加 `openfeel-req`** + `OPENCODE_SKILL_DEFINITIONS` / `SKILL_DEFINITIONS` 键集一致；逐点清单见 §三 T4）。
5. **零行为耦合**：模板改动不引入新命令/新权限；只描述已实现能力。

---

## 三、变更点清单（编号 T）

### T1 — `feel.md` ×4：需求与归档纪律（节锚点插入）
- 新增「需求流转（requirement lifecycle）」节：核心口径（四层模型一句话 / 需求=排期与调度层 / 7 状态 / 认领协议 / 聚合由阶段驱动）+ Agent 动作表（接取→认领→关联→流转→完成；`req` 命令示例）+ 与「小改 vs 大规模规划阈值」的关系（需求产计划仍按既有阈值委托）。
- 新增「归档与历史读取」节（或并入既有状态节）：版本收官提示 `flow archive`；**不读归档文件**；按需 `flow archive show`。
- `workflow_mode` 正交注记一行（需求流转在 full/fast 下一致）。
- 4 份同步（opencode/claude × zh-CN/en）；节锚点插入（方案期定锚）；**同语言跨 harness diff = IDENTICAL**（除既有差异词）。

### T2 — `openfeel-planner.md` ×4：需求感知
- 「需求感知」节：从需求产出计划（`req show` 读取；`plan.md` 头部标注「关联需求：REQ-NNN」）；需求状态流转不在 planner 职责内（主会话经 CLI）；与「工作流模式感知」节并列。
- 4 份同步 + 逐字核对。

### T3 — skill：新建 `openfeel-req` + `openfeel-cli-usage` 补节
- `src/core/templates-data/skills/openfeel-req/SKILL.md`（新建）：frontmatter（description 含「需求 / requirement / REQ / req 命令」触发词）+ 正文（生命周期图 / 7 状态语义 / 10 子命令用法与参数 / 认领协议 / `REQ-NNN.md` 正文与权威源 / 与计划的关系 / 正交说明 / 快照声明）。
- `openfeel-cli-usage/SKILL.md`：新增 `req` 节（10 子命令）+ `flow archive` 节（三子命令 + 与顶层 `archive` 的区分）；快照版本声明更新（v1.2.0）；**同批订正 `:52` 陈旧计数**「`skills/`（**17 个**共享源）」→ **18**（REV-84-005）——build 重生成后其生成副本 `src/core/update.ts:471` / `src/core/template-loader.ts:7023` 随重生成同步（禁手改）。
- 命名按开放问题 Q7（默认 `openfeel-req`）。

### T4 — build 重生成与静态断言
- `npm run build` 重生成双生成物（`template-loader.ts` + `update.ts`）；`git status --porcelain src/` 空断言。
- 静态断言（`test/core/templates.test.ts` / `test/core/template-loader.test.ts` 补点；**不扩范围**——`claude-adapter.test.ts` 引用已删，REV-84-003）：
  - 8 份模板需求/归档节存在性 + **断言串与落文逐字核对**（含 `**` 粗体边界）；
  - 4 份 feel 对称 / 4 份 planner 对称（跨 harness diff）；
  - opencode 既有关键串零回归；阴性断言（不含旧口径 / 不耦合 workflow_mode 的表述）；
  - skills 计数 **17→18** 全量翻转（**7 处字面量 + 5 处派生总数 + `expectedSkills` 白名单**，逐点列全见下）+ `SKILL_DEFINITIONS` ≡ `OPENCODE_SKILL_DEFINITIONS` 键集一致（18）。
- **计数翻转逐点清单（REV-84-001；基线 HEAD `ab60cb6`）**：
  - **7 处字面量（17→18）**：① `test/core/setup.test.ts:65`；② `test/core/setup.test.ts:221`；③ `test/core/templates-migration.test.ts:32`；④ `test/core/templates-migration.test.ts:41`；⑤ `test/core/templates-migration.test.ts:42`；⑥ `test/core/update.test.ts:816`；⑦ **`test/core/template-loader.test.ts:112`**（本轮补漏点）。
  - **5 处派生总数**：① `test/core/setup.test.ts:89`（27→**28**）；② `test/core/setup.test.ts:241`（55→**57**）；③ `test/core/update.test.ts:274`（28→**29**）；④ `test/core/update.test.ts:813`（28→**29**）；⑤ `test/core/update.test.ts:875`（28→**29**）。
  - **1 处白名单枚举**：`test/core/update.test.ts:149-167` `expectedSkills` **手工追加 `openfeel-req`**（→18 名；白名单非计数——kb `#CLI 用法 skill 化模式` 第 6 条）。
  - **标题/注释口径同步（非断言）**：`test/core/setup.test.ts:3` / `:55` / `:88` / `:210` / `:235` / `:240`；`test/core/templates-migration.test.ts:5` / `:6` / `:27` / `:38`；`test/core/template-loader.test.ts:110`；`test/core/update.test.ts:145` / `:264` / `:272` / `:810` / `:812` / `:870`。
- `test/core/{setup,update,templates-migration,template-loader}.test.ts` 计数点更新（清单如上）；**缓解＝全仓扫 `17` 及总数常量 27/28/55**（含标题/注释/生成物/死资产，逐命中处置见 §一）。

### T5 — 门禁
`npm run build` ×2（幂等）→ `npm test`（0 skipped / 0 failed）→ `tsc` = 0 → `lint i18n` 新基线（技能/模板文案如含 --help 引用无新键；显式登记）→ `lint kb` = 0 → `git status --porcelain src/` 空。

### 承接 REV 与处置表（REV-83-009~018；REV-84-002）

> 复发背景：REV-80-004 / REV-81-004 / REV-82-004 / REV-83-001 / 本条（REV-84-002）为**第 5 次**同类「承接零交代」→ 本表为 stage-84 承接基线（归档轮据此逐条核验零灭失）。来源：`.openfeel/users/Liuary/code_review/REV-83.md` 归档收口表——pending **10 条**（009~018；全部 `blocking:false`）。**本阶段触碰面**：`src/core/templates-data/**`（8 份 agent 模板 + 2 份 skill）+ `src/core/{template-loader,update}.ts`（build 生成物）+ 5 份 test/core；**不触碰** `src/core/req/**`、`src/core/flow-manager.ts`、`src/commands/**`。

| 条目 | 优先级 | 摘要 | 处置（写死） | 落点 / 依据 |
|------|:--:|------|------|------|
| **REV-83-016** | medium | 复位到「默认分支相位」后再次推进不回写 → 需求遗留漂移（非自愈；health `需求漂移` warn 可察） | **移交 stage-85 成文**（本表登记 + manual `core/requirement` / `cli/req` 节 + help 文案标注该残留路径）；**stage-84 零动作**（控制流冻结期不改守卫；「advance 命中 done 按聚合视图无条件重算」留待收口轮/后续版本评估） | 依据 `REV-83.md:290-306`（`flow-manager.ts:1523` / `:4381-4398`）；不改 `src/core/flow-manager.ts` |
| REV-83-015 | low | `deps.yaml` `invariants` 计数口径（实为 14 条、口径记 13） | **移交 stage-85 收口轮**（统一口径） | 本阶段对 `deps.yaml` 的修订**仅限** stage-84 `notes` / 契约条目 / 修订记录同批计数同步，**不动** `invariants` 段 |
| REV-83-017 | low | `aggregate.ts:127` 列表读取未复用 `getRequirements()` | **移交 stage-85 收口轮**（可选优化） | 本阶段零触碰 `src/core/req/**` |
| REV-83-018 | low | 静态禁令 `.every(` 覆盖全文件偏脆 | **移交 stage-85 收口轮**（收敛函数体/白名单） | 同上（`test/core/req.test.ts` 段 C 不在本阶段范围） |
| REV-83-009~014（×6） | medium/low | 计划复审 + 方案轮遗留：009 auto-done 前置集／010 deps「78 阶段」／011 契约滞后／012 op-003 依赖口径／013 reset 接入点漂移／014 fixture 双关联 | **台账保留**（均已落实核验——用户裁定维持前置集 `{scheduled, in_progress}` + 大计划/plan 同步；deps 改 8 + 注历史口径；契约补 `stageIds` + 零关联 `null`；op-003 hard→soft；reset 接入点主干约束 +「非 current 阶段 reset 仍回写」专测；fixture 明写双 `requirement_id`） | 销账随 stage-85 收口轮；依据 `REV-83.md:356-357` |

> 核验口径：上表 **10 条 = `REV-83.md` pending 全集（009~018，零灭失）**；本阶段**零条行为动作**（016 / 015 / 017 / 018 去向 stage-85；009~014 台账保留）；`deps.yaml` stage-84 `notes` 已同步承接声明（对齐 stage-80~83 惯例）。

---

## 四、验收要点（阶段级）

1. 8 份 agent 模板 + 2 份 skill 落文完成；4 份 feel 对称 / 4 份 planner 对称（diff 断言）。
2. 静态断言全绿（存在性 + 逐字串核对 + 零回归 + 阴性）。
3. skills 17→18 全量计数同步（**7 处字面量**：`setup.test.ts:65` / `:221`、`templates-migration.test.ts:32` / `:41` / `:42`、`update.test.ts:816`、`template-loader.test.ts:112`；**5 处派生总数**：`setup.test.ts:89`→28 / `:241`→57、`update.test.ts:274` / `:813` / `:875`→29；**白名单** `update.test.ts:149-167` 手工追加 `openfeel-req`；标题/注释口径同步）；双生成物由 build 重生成（禁手改验证）。
4. 需求纪律与 `workflow_mode` 正交（断言：模板中无耦合表述）。
5. 门禁全绿。
6. **承接闭环**（REV-84-002）：承接表 10 条（REV-83-009~018）逐条去向可核（016 / 015 / 017 / 018 → stage-85；009~014 台账保留）；本阶段动作仅限表列——**对本批条目零行为动作**。

## 五、风险

| # | 风险 | 缓解 |
|:-:|------|------|
| R-84-1 | 模板改动作致**调度错链**（Agent 误以为需求可绕过流水线） | 需求纪律明确「需求≠计划、实现仍走流水线」+ 断言串逐字核对 + 审查重点 |
| R-84-2 | 断言串与落文不齐（粗体/标点） | kb 教训：逐字核对（T4） |
| R-84-3 | skills 计数翻转遗漏（字面量 7 + 派生总数 5 + 白名单） | T4 逐点清单 + 全仓扫 `17` 及总数常量（27/28/55）复核（含标题/注释/生成物/死资产）；白名单手工追加（kb `#CLI 用法 skill 化模式` 第 6 条） |
| R-84-4 | 生成物被手改 | build 重生成 + `git status --porcelain src/` 空断言 |

> 说明：op 级拆分建议——op-001（T1 feel×4）→ op-002（T2 planner×4 + T3 skills）→ op-003（T4 build 与断言 + T5 门禁，**收口 op 为最终 op**）；由 openfeel-schemer 定稿并落 `ops/deps.yaml`。

## 六、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-11 | openfeel-planner | 初稿（立项随批次落盘）：T1~T5；依据大计划 §三 表 B 裁定 J/G 与 §四 stage-84 行 + 核验 B22/B23。**只写计划文档，未改源码、未动 flow.json。** |
| 2026-10-12 | openfeel-planner | **REV-84-001 修订**（high）：计数翻转清单扩为 **7 处字面量 + 5 处派生总数 + 白名单枚举**——补 `test/core/template-loader.test.ts:112`（字面量）、`test/core/setup.test.ts:89` / `:241`、`test/core/update.test.ts:274` / `:813` / `:875`（派生总数）、`test/core/update.test.ts:145` / `:149-167`（标题 + `expectedSkills` 手工追加 `openfeel-req`）；§一 / §二不变量 4 / T4 / §四.3 逐点列全；缓解改「全仓扫 `17` 及总数常量 27/28/55」；`src/core/setup.ts` 注释与 manual 陈旧口径登记（非门禁）、ADAPTER 登记转 stage-85（同 REV-84-004）。 |
| 2026-10-12 | openfeel-planner | **REV-84-002 修订**（high）：新增 §三「承接 REV 与处置表」（REV-83-009~018 共 10 条逐条去向：**016 → 移交 stage-85 成文〔择一写死〕**；015/017/018 → 移交 stage-85 收口轮；009~014 台账保留〔已落实核验〕）；§四 新增「承接闭环」验收项；`deps.yaml` stage-84 `notes` 同步承接声明（对齐 stage-80~83 惯例）。 |
| 2026-10-12 | openfeel-planner | **REV-84-003 修订**（low）：T4 删除 `test/core/claude-adapter.test.ts` 引用（择「从 T4 删除」——补点归 `templates.test.ts` / `template-loader.test.ts`，与 stage-76 先例一致；§范围与 `produces_core` 不变）。 |
| 2026-10-12 | openfeel-planner | **REV-84-004 修订**（low）：死资产 `templates-data/opencode/ADAPTER.{zh-CN,en}.md`（`:3` / `:9` 计数陈旧、不在部署路径）**登记转 stage-85 收口**（本阶段零动作）。 |
| 2026-10-12 | openfeel-planner | **REV-84-005 修订**（low）：T3 显式登记 `openfeel-cli-usage/SKILL.md:52`「`skills/`（**17 个**共享源）」→ **18** + build 重生成副本（`update.ts:471` / `template-loader.ts:7023`）随重生成同步（禁手改）。 |

> 本轮修订依据基线 **HEAD `ab60cb6`** 逐点复核；仅动 `stage-84/plan.md` + `deps.yaml`（stage-84 `notes` / 契约条目 / 修订记录），**未改源码、未动 `flow.json`、未推进 phase**。
