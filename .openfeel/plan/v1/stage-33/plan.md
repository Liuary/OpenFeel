# Plan — stage-33: Pantheogen 反馈规则落地 + decisions.md 框架化 + 版本 1.0.8

> **版本**：v1.0.0-stage-33
> **创建日期**：2026-08-15
> **Planner**：独立 Planner（推理模型 DeepSeek V4 Pro）
> **规模判定**：大规模（5 个 op、约 20 个文件变更、跨模块——Agent 模板体系 / AGENTS.md / core.md / init 管线 / 版本发布）
> **来源**：Pantheogen 项目调研实践反馈（外部项目，非本仓库文件）`C:\Users\Liuary\Dev\Mine\godot\Pantheogen\docs\04-openfeel-feedback.md`（Feel 总统领一手体验反馈，3 项反馈内容已摘录在计划正文）

---

## 知识库参考

| 条目 | 路径 | 相关性 |
|------|------|--------|
| AGENTS.md 模板同步模式 | kb/patterns.md #AGENTS.md 模板同步模式 | **高度相关**。改 AGENTS.md 必须同步 agents-md/{zh-CN,en}.md 模板源，否则新项目 init/update 拿不到改动 |
| 双语开发强制约束 | kb/patterns.md #双语开发强制约束（dev_core.md 硬性规则） | **必须遵循**。所有模板改动 zh-CN + en 同步，否则 `npm run build` 的模板一致性校验失败 |
| 多语言模板数据管线 | kb/architecture.md #多语言模板数据管线 | **必须遵循**。templates-data → build.js 注入 → template-loader.ts → init/update 部署三层结构 |
| 跨平台行尾归一化模式 | kb/patterns.md #跨平台行尾归一化模式 | core-instructions 模板 CRLF→LF 归一化后 Base64，改模板源须保证行尾一致 |
| 新增 Agent 全链路更新清单模式 | kb/patterns.md #新增 Agent 全链路更新清单模式 | 改 Agent 模板（feel/planner）须同步「部署产物与 zh-CN 源模板逐字符一致」约定 |
| 约束文件→指令文件迁移模式 | kb/patterns.md #约束文件→指令文件迁移模式 | decisions.md 作为新的持久存储，参照 dev_core.md/current.md 的模板生成模式落地 |
| 版本号语义管理与递增规范模式 | kb/patterns.md #版本号语义管理与递增规范模式 | 版本 1.0.7 → 1.0.8（W 级修订），AGENTS.md/agents-md 版本声明同步 |
| npm 发布与版本号管理 | dev_core.md #npm 发布与版本号管理 | CI 仅当 package.json version 变更时触发 npm publish |

---

## 背景与动机

Pantheogen 项目调研实践产生了反馈文档（位于外部项目 `C:\Users\Liuary\Dev\Mine\godot\Pantheogen\docs\04-openfeel-feedback.md`，非本仓库文件，3 项反馈内容已摘录在计划正文），其中 Feel 总统领提出 3 项高优先级规则改动（日志纪律、任务类型路由、轻量决策边界）。同时，用户在调研中产出的长期决策（如技术选型 C#）缺乏持久存储，需将 `decisions.md` 纳入框架标准。本次一并完成版本号 1.0.7 → 1.0.8 的同步发布。

**范围边界**：仅做 A（3 项规则改动）/ B（decisions.md 框架化）/ C（版本同步）三主题。plan 目录多级化问题已拆分到独立 stage-34，本次不涉及。

### 已确认决策（不可更改）

- 版本号 **1.0.8**（W 级修订，package.json 1.0.7 → 1.0.8）
- 阶段 ID **v1.0.0-stage-33**（flow.json phase=plan_pending）
- decisions.md 定为 `.openfeel/dev/decisions.md`（ADR 轻量格式：决策+理由+日期+状态），纳入框架标准（init 也生成）

---

## 工作阶段

### 概览

| op | 主题 | 变更目标 | 文件数 |
|----|------|----------|:--:|
| op-001 | A1 + A3(Feel 侧) | feel.md「日志记录纪律」解耦 + 「轻量决策边界」说明 | 5 |
| op-002 | A2 + A3(AGENTS 侧) | AGENTS.md 新增「任务类型路由」+「轻量决策边界」 | 3 |
| op-003 | A3(Planner 侧) | planner.md「轻量决策边界」说明 | 5 |
| op-004 | B | decisions.md 纳入框架标准（新建 + init + core.md 自检 + 写入规则） | 9 |
| op-005 | C | 版本号 1.0.8 同步（package/config/config.ts/changelog/AGENTS 声明） | 7 |

### op-001：Feel 角色定义 —— 日志纪律解耦 + 轻量决策边界

> **目标**：修复反馈问题 1（日志纪律错误豁免调研类委托）+ 问题 3 的 Feel 侧边界说明。
> **前置依赖**：无
> **规模**：5 文件（双层模板源各双语 + 部署实例，内容逐字符同步）

| # | 任务 | 描述 | 涉及文件 |
|---|------|------|----------|
| 1 | 日志纪律解耦（问题 1，update 路径 zh-CN） | 「日志记录纪律」节（实例 240-271 行）的「必须记录的事件」改为：**任意下游委托（含 general/explore/utility 等调研类 agent）都须落公域日志，不受任务类型豁免**。删除「委托 Executor / 事务官」的排他性表述，改为「委托任意下游 Agent」 | `templates-data/agents/zh-CN/feel.md` |
| 2 | 日志纪律解耦（update 路径 en） | 同上英文版，「Logging Discipline」节（实例 239-270 行） | `templates-data/agents/en/feel.md` |
| 3 | 双层模板源同步（init 路径） | ⚠️ Agent 模板存在**第二层模板源** `templates-data/opencode/agents/{zh-CN,en}/feel.md`（供 `init.ts deployOpencode()` 部署，OPENCODE_AGENT_TEMPLATES），与 `templates-data/agents/{zh-CN,en}/feel.md` 内容逐字符一致，须同改 | `templates-data/opencode/agents/zh-CN/feel.md`、`templates-data/opencode/agents/en/feel.md` |
| 4 | 部署实例同步 | 将上述改动同步到部署产物，与 zh-CN 模板源逐字符一致 | `.opencode/agents/feel.md` |
| 5 | 轻量决策边界（Feel 侧，问题 3） | 「小改 vs 大规模规划的阈值」节（202-212 行）补充「轻量决策」定义：对话式选型产出结论但不产出 plan.md → Feel 直接处理；仅「产出正式计划文档」才委托 Planner | 同上 5 文件（与任务 1-4 同批） |
| 6 | 决策归属区分（REV-006 联动） | 「决策追加」节（约 332-342 行）联动：明确「长期决策（技术选型、架构方向）归 `.openfeel/dev/decisions.md`（ADR），会话临时决策归 dev_last.md『决策历史』节」的区分 | 同上 5 文件（与任务 1-4 同批） |

> **验证**：改完后 `npm run build`（步骤 2 Agent 模板注入 + 步骤 4 opencode 模板注入 + 一致性校验 validateAgentDefinitions / validateOpencodeTemplates）须通过。

### op-002：AGENTS.md —— 任务类型路由 + 轻量决策边界

> **目标**：修复反馈问题 2（非编码任务一等公民）+ 问题 3 的跨 Agent 约束层边界。
> **前置依赖**：无
> **规模**：3 文件（agents-md 模板源双语 + 根目录实例）。⚠️ 根目录 AGENTS.md（141 行）与模板源 zh-CN.md（133 行）已不同步，须**两边分别适配**，不能简单复制。

| # | 任务 | 描述 | 涉及文件 |
|---|------|------|----------|
| 1 | 任务类型路由（问题 2） | 新增一节明文列出非编码任务路径：调研→research（general/explore agent）、编码→完整流水线、选型讨论→Feel+question。承认非编码任务是一等公民，flow.json 不必为所有任务空转 | `templates-data/agents-md/zh-CN.md` |
| 2 | 任务类型路由（en） | 同上英文版 | `templates-data/agents-md/en.md` |
| 3 | 任务类型路由（实例） | 根目录 AGENTS.md 独立适配（注意其较模板源多「模块手册」节、更详细知识约束/操作规范，插入位置与措辞需按根目录实际结构调整） | `AGENTS.md` |
| 4 | 轻量决策边界（问题 3） | 在「职责边界」或新增节中定义：轻量决策归 Feel 直接处理，仅产出正式计划文档才委托 Planner；消除「要么全亲为、要么全委托」极端 | 同上 3 文件（与任务 1-3 同批） |

> **建议插入位置**（Schemer 细化）：任务类型路由置于「行为准则」之后、「核心约束」之前或作为「核心约束」第 8 条；轻量决策边界置于「跨 Agent 工具使用约束 → 职责边界」附近。
> **验证**：改完后 `npm run build`（步骤 3 agents-md 注入 + validateAgentsMdTemplate 校验）须通过。

### op-003：Planner 角色定义 —— 轻量决策边界

> **目标**：问题 3 的 Planner 侧边界说明，与 op-001/op-002 的「轻量决策」定义保持语义一致。
> **前置依赖**：op-002（soft，语义依赖「轻量决策」概念定义，无文件重叠）
> **规模**：5 文件（双层模板源各双语 + 部署实例）

| # | 任务 | 描述 | 涉及文件 |
|---|------|------|----------|
| 1 | Planner 唤起条件边界（update 路径 zh-CN） | 「唤起条件」/「拒绝条件」节补充：轻量决策（对话式选型、不产出 plan.md）由 Feel 直接处理，不唤起 Planner；仅「产出正式计划文档」或达规模阈值才唤起 | `templates-data/agents/zh-CN/planner.md` |
| 2 | Planner 边界（update 路径 en） | 同上英文版 | `templates-data/agents/en/planner.md` |
| 3 | 双层模板源同步（init 路径） | ⚠️ 同 op-001，补 `templates-data/opencode/agents/{zh-CN,en}/planner.md`（OPENCODE_AGENT_TEMPLATES 第二层），与 `templates-data/agents/{zh-CN,en}/planner.md` 内容逐字符一致 | `templates-data/opencode/agents/zh-CN/planner.md`、`templates-data/opencode/agents/en/planner.md` |
| 4 | 部署实例同步 | 与 zh-CN 模板源逐字符一致 | `.opencode/agents/planner.md` |

> **验证**：改完后 `npm run build`（Agent 模板注入 + opencode 模板注入 + 一致性校验）通过。

### op-004：decisions.md 纳入框架标准

> **目标**：长期决策（技术选型 C# 等）获得独立持久存储 `.openfeel/dev/decisions.md`（ADR 轻量格式），并纳入框架标准（新项目 init 也生成）。
> **前置依赖**：无（完全独立）
> **规模**：9 文件（1 新增 + 8 修改）。跨 init 管线 + core.md 双层模板源。

| # | 任务 | 描述 | 涉及文件 |
|---|------|------|----------|
| 1 | 新建项目实例 | 新建 `.openfeel/dev/decisions.md`，含 ADR 模板骨架（决策+理由+日期+状态），并记录当前已知长期决策（如 C# 技术选型） | NEW: `.openfeel/dev/decisions.md` |
| 2 | 模板常量 | `templates.ts` 新增 `DECISIONS_TEMPLATE_ZH`/`DECISIONS_TEMPLATE_EN` + `getDecisionsTemplate(lang)`（参照 `getDevCoreTemplate`/`getCurrentTemplate` 模式） | `src/core/templates.ts` |
| 3 | init 生成 | `init.ts` 在 dev_core.md/current.md 生成逻辑（316-328 行）后新增 decisions.md 生成步（`writeTemplateIfMissing`），参照第 5/6 步模式 | `src/core/init.ts` |
| 4 | core.md 自检（zh-CN，update 路径） | 会话启动自检「公共域文件」列表加 `.openfeel/dev/decisions.md` | `templates-data/core-instructions/zh-CN.md` |
| 5 | core.md 自检（en，update 路径） | 同上英文版 | `templates-data/core-instructions/en.md` |
| 6 | core.md 自检（zh-CN，init 路径） | ⚠️ core.md 存在**第二个模板源** `opencode/instructions/{lang}.md`（供 `init.ts deployOpencode()` 部署），须同步加 decisions.md，否则 init 与 update 部署的 core.md 不一致 | `templates-data/opencode/instructions/zh-CN.md` |
| 7 | core.md 自检（en，init 路径） | 同上英文版 | `templates-data/opencode/instructions/en.md` |
| 8 | core.md 实例同步 | 部署产物「公共域文件」列表加 decisions.md | `.opencode/instructions/core.md` |
| 9 | 测试断言（必选） | init.test.ts 补充断言「init 生成 decisions.md」——**必选**，非可选 | `test/core/init.test.ts` |
| 10 | decisions.md 写入规则定义 | 在模板骨架中明确写入时机与维护责任：Feel 做出长期技术/架构决策（技术选型、架构方向等）时同步追加到 decisions.md（ADR 格式）；会话临时决策仍写 dev_last.md「决策历史」节。该规则须与 op-001 任务 6（feel.md「决策追加」节联动）语义一致 | `templates.ts`（DECISIONS_TEMPLATE 骨架含写入说明）+ `.openfeel/dev/decisions.md` |

> **验证**：改完后 `npm run build`（步骤 1 core-instructions 注入 + 步骤 4 opencode 注入 + 一致性校验）→ `npm test`（新增断言 + 无回归）。核心约束：decisions.md 是 dev/ 下文件，dev 目录已在 WORKSPACE_DIRS，**无需**改 structure.ts。

### op-005：版本号同步 1.0.8

> **目标**：版本号 1.0.7 → 1.0.8 全链路同步，触发 CI 发布。
> **前置依赖**：op-002（hard，AGENTS.md + agents-md 文件冲突域重叠，须串行，基于 op-002 产物改版本声明）
> **规模**：7 文件（含 config.ts 双语言模板常量）

| # | 任务 | 描述 | 涉及文件 |
|---|------|------|----------|
| 1 | package.json | `version` 1.0.7 → 1.0.8 | `package.json` |
| 2 | config.yaml | `meta.version` 1.0.0 → 1.0.8（方案 A：meta.version = OpenFeel 框架版本）。⚠️ 实测为 **UTF-8（无 BOM）编码**（严格校验通过，非任务背景所述 GBK），修改后须保留 UTF-8 编码 | `.openfeel/config.yaml` |
| 3 | config.ts 模板常量 | ⚠️ config.yaml 由 config.ts 硬编码模板生成：`CONFIG_TEMPLATE_ZH`（约 304 行）与 `CONFIG_TEMPLATE_EN`（约 361 行）的 `version: 1.0.0` → `1.0.8`，否则 init 新项目仍生成旧版本号 | `src/core/config.ts` |
| 4 | CHANGELOG.md | 新增 `## [1.0.8]` 条目（Keep a Changelog，含 Added/Changed 分类，概括 A/B 两主题） | `CHANGELOG.md` |
| 5 | AGENTS.md 版本声明 | 根目录 122 行「当前项目处于 v0 开发阶段，正式版 v1 待功能完备后发布」更新为 v1.0.x 已发布状态 | `AGENTS.md` |
| 6 | 模板源版本声明 | zh-CN.md 118 行 / en.md 118 行同步更新（注意措辞按根目录 vs 模板源分别适配，en 版为英文） | `templates-data/agents-md/zh-CN.md`、`templates-data/agents-md/en.md` |

> **验证**：改完后 `npm run build && npm test`。版本号变更仅当 commit+push master 后触发 CI npm publish（由 Feel 收尾，见 dev_core.md #npm 发布与版本号管理）。

---

## 约束与设计决策

| # | 约束 | 处理方式 |
|---|------|----------|
| 1 | 模板部署三层结构 | 改约束文档必须改模板源（templates-data），否则新项目 init/update 拿不到改动 |
| 2 | 双语硬性约束 | 所有模板改动 zh-CN + en 同步，否则 `npm run build` 一致性校验（validateAgentsMdTemplate / validateCoreInstructions / validateOpencodeTemplates）失败 |
| 3 | 根目录 vs 模板源不同步 | AGENTS.md（141 行）比 agents-md/zh-CN.md（133 行）多「模块手册」节、更详细知识约束/操作规范，两边分别适配，禁止简单复制 |
| 4 | core.md 双层模板源 | `core-instructions/{lang}.md`（update 部署）与 `opencode/instructions/{lang}.md`（init 部署）内容须保持一致，op-004 须两处同改 |
| 5 | agents 双层模板源 | `templates-data/agents/{lang}/`（update 部署，AGENT_TEMPLATES）与 `templates-data/opencode/agents/{lang}/`（init 部署，OPENCODE_AGENT_TEMPLATES）内容逐字符一致，op-001/op-003 改 feel/planner 须两处同改 |
| 6 | config.yaml 编码与语义 | 实测 UTF-8（无 BOM），非 GBK；修改后保留 UTF-8 避免乱码。meta.version 语义 = OpenFeel 框架版本（方案 A），由 config.ts 的 CONFIG_TEMPLATE_ZH/EN 硬编码，须三处同步（config.yaml 实例 + config.ts 双语言模板） |
| 7 | decisions.md 归属与写入规则 | 是 dev/ 下文件，dev 目录已在 WORKSPACE_DIRS，无需改 structure.ts。写入时机：长期技术/架构决策 → decisions.md（ADR）；临时决策 → dev_last.md「决策历史」节 |
| 8 | flow.json meta.version | 为 '1.0'（内部格式），与 config.yaml meta.version（1.0.0）是两个字段，本次只改 config.yaml 及 config.ts，不改 flow.json |
| 9 | 版本发布 | 仅 commit+push master 且 package.json version 变更才触发 npm publish，由 Feel 收尾统一提交 |

---

## 测试策略

| 验证点 | op | 方式 |
|--------|----|------|
| 模板一致性 | op-001/002/003/004 | `npm run build` 的 7 步注入 + 模板一致性校验（agents-md / core-instructions / opencode 三类） |
| init 生成 decisions.md | op-004 | 新增 init.test.ts 断言（**必选**）+ `npm test` 无回归 |
| 版本号 | op-005 | `npm run build && npm test`（现有 406 测试全通过）；确认无测试硬编码 1.0.7/1.0.0 断言（实测 init.test 断言的是 flow.json meta.version='1.0'，不受影响） |
| 全量回归 | 全部 | `npm run build && npm test`（406/406） |

> **关键测试确认**：test/core/init.test.ts 第 67 行断言 `flowData.meta.version === '1.0'`（flow.json 内部格式），与 config.yaml 的 meta.version 无关；config.test.ts 第 111 行为通用解析测试，不硬编码具体版本值。op-005 改 config.ts 的 CONFIG_TEMPLATE_ZH/EN 硬编码版本号后，须确认无测试断言该模板字符串中的 `version: 1.0.0`（若有则同步更新为 1.0.8）。

---

## 执行顺序

```
op-001 (feel.md)        [无依赖]
op-002 (AGENTS.md)      [无依赖]
op-003 (planner.md)     [soft 依赖 op-002 — 语义对齐，文件不重叠]
op-004 (decisions.md)   [无依赖 — 完全独立]
op-005 (版本号)          [hard 依赖 op-002 — AGENTS.md/agents-md 文件冲突域重叠，须串行]
```

建议执行批次：
- **批次 1**（可并行）：op-001、op-002、op-004（文件冲突域互不相交）
- **批次 2**：op-003（soft 依赖 op-002，语义对齐后可执行）
- **批次 3**：op-005（hard 依赖 op-002，须待 op-002 的 AGENTS.md/agents-md 改动落定后执行）

> 文件冲突域分析：
> - op-002 与 op-005 共享 AGENTS.md + agents-md/{zh-CN,en}.md → 必须串行
> - op-001（feel.md）、op-003（planner.md）、op-004（core 相关）互不重叠 → 可并行

---

## 预期产出

| 产出 | 路径 |
|------|------|
| 计划文档 | `.openfeel/plan/v1/stage-33/plan.md`（本文件） |
| 依赖声明 | `.openfeel/plan/v1/stage-33/deps.yaml` |
| 操作方案 | `.openfeel/plan/v1/stage-33/ops/op-{001..005}.md`（由 Schemer 细化） |
| Feel 模板 | `templates-data/agents/{zh-CN,en}/feel.md` + `templates-data/opencode/agents/{zh-CN,en}/feel.md` + `.opencode/agents/feel.md` |
| AGENTS 模板 | `templates-data/agents-md/{zh-CN,en}.md` + `AGENTS.md` |
| Planner 模板 | `templates-data/agents/{zh-CN,en}/planner.md` + `templates-data/opencode/agents/{zh-CN,en}/planner.md` + `.opencode/agents/planner.md` |
| 决策存储 | `.openfeel/dev/decisions.md`（新增） |
| init 管线 | `src/core/templates.ts` + `src/core/init.ts` |
| core 模板 | `templates-data/core-instructions/{zh-CN,en}.md` + `templates-data/opencode/instructions/{zh-CN,en}.md` + `.opencode/instructions/core.md` |
| 版本文件 | `package.json` + `.openfeel/config.yaml` + `src/core/config.ts` + `CHANGELOG.md` |

---

## 遗留风险

1. **双层模板源一致性**：core.md（core-instructions + opencode/instructions）与 Agent 模板（agents + opencode/agents）均存在双层模板源，已全部纳入 op 范围。Schemer 须分别确认 `deployOpencode()` 实际加载的模板键（`loadOpencodeConfigTemplate(lang, 'instructions')` / `loadOpencodeAgentTemplate(lang, agentId)`），确保两层同步。
2. **config.yaml 编码与 config.ts 同步**：任务背景标注 GBK，实测为 UTF-8（无 BOM）。op-005 须三处同步（config.yaml 实例 + config.ts CONFIG_TEMPLATE_ZH/EN），实施时以「修改前读字节确认编码，修改后保留原编码」为安全准则，避免误用 GBK 写回导致乱码。
3. **AGENTS.md 版本声明措辞**：根目录与模板源版本声明措辞（v0 开发阶段 → v1.0.x 已发布）需分别拟定，en 版为英文；建议由 Schemer 给出具体文案并经 Reviewer 校验双语对称。
4. **op-005 的 CHANGELOG 内容**：需概括 A/B 两主题（3 项规则改动 + decisions.md 框架化），具体条目措辞由 Schemer 拟定。
5. **decisions.md 写入规则落地**：REV-006 定义的写入时机（长期决策→decisions.md / 临时决策→dev_last.md）需在 decisions.md 骨架、feel.md「决策追加」节、core.md 会话自检三处语义一致，Schemer 须确保措辞对齐。
