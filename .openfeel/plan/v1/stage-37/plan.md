# Plan — stage-37: 全局部署架构

> **版本**：v1.1.0-stage-37
> **创建日期**：2026-09-25
> **Planner**：独立 Planner（推理模型）
> **规模判定**：架构级（跨模块——init/update 部署管线、全局路径、opencode.jsonc schema、框架约束落地、测试隔离）
> **定位**：v1.1 改造第三阶段（v1.1 大计划 P0）。**D1 全量落地 + P2 框架约束 instructions 落地**，是 stage-38 控制区标记、stage-39 存量迁移、stage-40 模型接口的共同前提。
> **来源**：`.openfeel/plan/v1/v1.1/plan.md`（stage-37 章节 + D1 / P2）+ 本计划调研复核（源码行号、模板现状、测试现状）。

---

## 一、知识库参考

| 条目 | 路径 | 相关性 |
|------|------|--------|
| opencode 全局/项目 agent 与 skill 合并语义 | kb/architecture.md #opencode 全局/项目 agent 与 skill 合并语义 | **直接命中**。全局部署后项目不屏蔽全局 agent/skill，是本阶段部署目标的前提 |
| 模板单源架构 | kb/architecture.md #模板单源架构 | **直接命中**。`templates-data/opencode/` 是唯一权威源，本阶段在其上改部署目标 |
| 跨进程并发保护架构 | kb/architecture.md #跨进程并发保护架构 | 必须遵循。全局 opencode.jsonc / update_state 写入复用 stage-35 fs 工具 |
| 全局跨项目用户画像 YAML 配置模式 | kb/patterns.md #全局跨项目用户画像 YAML 配置模式 | 参考。`~/.config/{tool}/` 全局路径约定，与 `~/.config/opencode/` 比照 |
| 向后兼容可选配置字段模式 | kb/patterns.md #向后兼容的可选配置字段模式 | 必须遵循。全局 opencode.jsonc 深度合并须保留用户自定义字段 |
| YAML Document API 增量修改模式 | kb/patterns.md #YAML Document API 增量修改模式 | 参考。JSONC 深度合并与 YAML 增量修改同思路 |
| update 增量部署哈希追踪 + 冲突标记三态模式 | kb/patterns.md #update 增量部署哈希追踪 + 冲突标记三态模式 | **高度相关**。update_state 全局/项目拆分的新部署侧 |
| update_state.json 降级风险排查 | kb/troubleshooting.md #update_state.json 降级风险排查 | **直接命中**。全局 state 首次加载降级须避免全量覆盖 |
| 原子写 / 建议性文件锁模式 | kb/patterns.md #原子写模式 / #建议性文件锁模式 | 必须遵循。全局文件写入复用 fs 工具 |
| CLI 原子管理模式 | kb/patterns.md #CLI 原子管理模式 | 参考。Planner 不直写 flow.json |

> ⚠️ 执行任务前，若知识库中有相关条目，务必参考。重复踩过的坑不可再犯。

---

## 二、背景与动机

当前 OpenFeel 将框架全部资产（9 agent、14 skill、core 约束、opencode.jsonc、AGENTS.md）**逐项目部署**到每个项目的 `.opencode/` 与项目根目录（见 `init.ts` `deployOpencode` L194-249、`update.ts` `updateProject` L1554-1743）。这带来：

1. **升级成本高**：框架改进（agent/skill/约束）无法一次惠及全部项目，每个项目须单独 `openfeel update`。
2. **项目目录臃肿**：`.opencode/`（25 文件）被复制进每个项目，与项目自有资产混杂。
3. **配置字段非法**：模板 `opencode.jsonc` 的 `skills` 为 `{name:path}` 映射，与现行 schema `{paths: string[], urls: string[]}`（`additionalProperties: false`）不符；`update.ts` 的 `$schema` 硬编码为 `https://opencode.openfeel/config.json`（拼写错误，正确为 `https://opencode.ai/config.json`）。
4. **框架级约束与项目约束混杂**：core 约束逐项目部署，框架约束更新须逐项目传播。

本阶段将框架资产部署目标从「项目内」切换到「全局 `~/.config/opencode/`」，项目仅保留 `.openfeel/` 工作区 + 项目 `AGENTS.md`（项目级约束）+ 项目 `opencode.jsonc`（模型/语言覆盖）。同时修正 opencode.jsonc schema 非法字段与 `$schema` URL，并通过 instructions 机制落地全局框架约束。

---

## 三、已确认决策（继承 v1.1 大计划，不可推翻）

### D1：部署架构全量通用化

- 框架 + 框架级约束 + 通用 agent/skill → 全局 `~/.config/opencode/`
- 项目目录只保留：`.openfeel/` 工作区 + 项目 `AGENTS.md`（项目级约束）+ 项目 `opencode.jsonc`（模型 / 语言覆盖）

### P2：框架约束走 `instructions`（REV-001 修订）

- 框架 core 约束部署到 `~/.config/opencode/openfeel/core.md`
- 全局 `opencode.jsonc` 的 `instructions` 引用 `["~/.config/opencode/openfeel/core.md"]`
- 项目 `opencode.jsonc` **完全不写 `instructions` 字段**（继承全局）
- 项目级约束仍走项目 `AGENTS.md`（opencode 约定自动加载，无需列入 `instructions`）
- 源码已证 opencode `mergeConfigConcatArrays()` 对 `instructions` 执行「拼接 + 去重」；为防未来版本变更，采用稳健设计（项目不声明 `instructions`）。**依赖 op-000 实测兜底确认**。

### 调研确认事实（本计划复核）

| 项 | 结论 | 证据 |
|----|------|------|
| 部署入口 | `deployOpencode`（init.ts L194-249）、`updateProject`（update.ts L1554-1743）、`buildUpdatedJsonc`（L1349）、`replaceSkillsFieldInJsonc`（L1418）、`getIncomingContent`（L1783） | 源码 |
| `$schema` 拼写错误 | `update.ts` L1361、L1515 硬编码 `https://opencode.openfeel/config.json`（**待改**）；模板 `templates-data/opencode/opencode.jsonc` L2 与 `template-loader.ts` L6698/6744 已正确为 `https://opencode.ai/config.json` | 源码 grep |
| `skills` 非法字段 | 模板 `opencode.jsonc` `"skills": "SKILLS_PLACEHOLDER"` → build 展开为 `{name:path}` 映射；现行 schema 为 `{paths,urls}` + `additionalProperties:false` | 模板 + 大计划 |
| `agent_manager_tool` | 模板 L17-19 含 `experimental.agent_manager_tool: true`，现行 schema 未定义该字段 | 模板 |
| 全局现状 | `~/.config/opencode/opencode.jsonc` 已存在（仅 `$schema`）；`~/.openfeel/config.json`、`~/.config/openfeel/profile.yaml` 已存在 | 大计划 |
| 全局路径现状 | `homedir()` 分散于 4 处：config.ts（`.config/openfeel/profile.yaml`）、identity.ts（`.openfeel/config.json`）、file-lock.ts（`.openfeel/locks`）、resolver.ts（`.openfeel/schemas`） | grep |
| 测试隔离先例 | `global-config.test.ts` 用 `vi.mock('node:os', { homedir })` 隔离全局路径；init/update 测试现断言项目内 `.opencode/` | 测试源码 |
| update_state 现状 | 单一项目级 `.openfeel/update_state.json`（update-state.ts `getStatePath` 用 `resolve(projectPath, ...)`）；P4 拆分属 stage-39 | 源码 |

---

## 四、Planner 新增判断（超出 D1/P2，供审查 / Schemer 确认）

| # | 判断 | 理由 | 状态 |
|---|------|------|------|
| **N1** | **「项目精简」仅针对 `openfeel init` 部署到的新项目**；OpenFeel **仓库自身** `.opencode/` 仍保留为「构建产物 / 自举实例」（stage-36 已定性，build.js 步骤 8 重生成），本阶段**不**删除仓库 `.opencode/`，也不改 build.js 步骤 8。仓库自身迁移属 stage-39 | 避免执行者误删仓库自举实例；仓库开发仍需本机加载这些 agent/skill | 待确认 |
| **N2** | **全局框架资产增量更新 hash 追踪走全局 state** `~/.openfeel/update_state.json`（新部署侧）；项目资产（`AGENTS.md` / 项目 `opencode.jsonc`）继续走项目 `.openfeel/update_state.json`。这**不是** P4 的存量拆分迁移——存量旧 state 里混合框架资产条目的重键迁移仍属 stage-39 | op-001 已列全局 state 路径；全局文件无法用项目相对路径追踪，须独立 state。避免把 stage-39 迁移提前 | 待确认 |
| **N3** | **`agent_manager_tool` 实测处置**（三选一）：fetch 现行 schema `https://opencode.ai/config.json` 检查 `experimental` 下是否定义；并在 op-000 隔离环境用 `opencode debug config` 实测加载含该字段的全局 opencode.jsonc 是否报错/警告。**判定**：schema 已定义或运行时识别 → **保留**；schema 未定义但运行时静默接受 → 记录依据后**保留**（保守）或**移除**；运行时报错 → **移除** | 实测优先于猜测（AGENTS.md 第 6 条）；处置须留依据记录（对应大计划 REV-004） | 待确认 |
| **N4** | **隔离 HOME 方案**：沿用 `global-config.test.ts` 的 `vi.mock('node:os', { homedir: () => mockHome })` 模式；op-001 `global-paths.ts` 集中封装 `homedir()` 调用（仅此模块 import `homedir`），其余模块经 `global-paths` 取路径 → 测试只需 mock `node:os` 一处即隔离全部全局路径 | 现有先例成熟；跨平台（Windows `USERPROFILE`）可靠，不依赖环境变量 | 待确认 |
| **N5** | **op-000 降级兜底**：若开发/CI 环境无 `opencode` CLI 可执行，op-000 降级为「源码证据静态确认（REV-001 已证拼接+去重）+ P2 稳健设计兜底」，**不阻塞流水线**。实测为「锦上添花」而非硬门禁 | P2 稳健设计已保证「项目不写 instructions 则全局约束不丢失」，实测确认非必要前置 | 待确认 |
| **N6** | **全局 skill 走自动发现，`skills` 字段不再写 `{name:path}`**：全局 `~/.config/opencode/skills/` 自动发现（大计划已证），故全局 opencode.jsonc **省略 `skills` 字段**（或空 `{paths:[]}`）；项目 opencode.jsonc **不写 `skills`** | 消除非法映射；自动发现免维护 | 待确认 |
| **N7** | **全局 opencode.jsonc 与项目 opencode.jsonc 分工**：全局 = 框架级（`$schema` + `default_agent: feel` + `instructions` 引用全局 core.md + `agent.{vision,reviewer}.model` 框架默认模型 + agent_manager_tool 处置结果）；项目 = 覆盖级（`$schema` + 用户自定义 `agent.<name>.model`，**不写** instructions / skills / default_agent） | D1「项目留模型/语言覆盖」+ P2「不写 instructions」的落点 | 待确认 |
| **N8** | **legacy 布局识别 + 提示**：`update` 检测到项目内遗留 `.opencode/agents|skills|instructions`（legacy 布局）时，输出提示「检测到项目内旧布局，请运行 `openfeel migrate`（stage-39 提供）」**而非静默迁移/删除**。本阶段只识别+提示，迁移留 stage-39 | P6 既定；避免不可逆清理提前发生 | 既定 |

### 交 Schemer 评估的议题

- **D37-1**：`global-paths.ts` 是否同时收纳既有 4 处 `homedir()` 路径（profile.yaml / config.json / locks / schemas）？本计划**默认只新增 opencode 相关路径**（避免扩大范围、过度设计）；若 Schemer 判定「统一收纳收益 > 改动成本」，可在 op-001 一并迁入并同步改 4 个调用点。
- **D37-2**：`agent_manager_tool` 若「移除」，是否同步删除 `templates-data/opencode/opencode.jsonc` 的 `experimental` 块与 `buildUpdatedJsonc`/`buildJsoncFromObject` 中保留 experimental 的逻辑？需在 op-003 方案中明确取舍。

---

## 五、工作阶段（op 级）

### 概览

| op | 主题 | 变更目标 | 文件数 |
|----|------|----------|:--:|
| op-000 | instructions 合并语义前置验证 | 隔离 HOME 实测全局+项目两级 instructions；结论回填 P2 | ~2 |
| op-001 | 全局路径模块 | NEW `global-paths.ts` 集中解析 opencode 全局路径 | ~2 |
| op-002 | init 改造 | deployOpencode 部署到全局；项目精简为 `.openfeel/`+AGENTS.md+opencode.jsonc | ~4 |
| op-003 | update 改造 + schema/URL 修正 | updateProject 部署到全局；深度合并；修正 skills/$schema/agent_manager_tool | ~5 |
| op-004 | 全局框架约束落地（P2） | core.md 部署到全局 + 全局 instructions 引用 + 项目不写 instructions | ~4 |
| op-005 | 测试改造 | 隔离 HOME 断言全局路径 + schema 校验 + 不写 instructions 断言 | ~6 |

### 依赖图

```
op-000（instructions 实测验证）──────────────┐
                                             │ soft（结论须在 op-004 定稿前）
op-001（全局路径模块）                        ▼
  ├── hard ──→ op-002（init 改造）────────┐
  ├── hard ──→ op-003（update 改造）───────┤
  └── hard ──→ op-004（框架约束落地）──────┤
                                          hard
                                           ▼
                                    op-005（测试改造）
```

- op-001 是 op-002 / op-003 / op-004 的 **hard** 前置（路径基础）。
- op-000 是 op-004 的 **soft** 前置：结论须在 op-004 定稿前得出；若降级兜底（N5）则不阻塞。
- op-005 硬依赖 op-002 / op-003 / op-004（断言其全局路径行为）。
- op-002 与 op-003 无 hard 互斥（init.ts 与 update.ts 分属不同文件），可并行，但**均须先有 op-001**。

---

### op-000：instructions 合并语义前置验证

> **目标**：实测 opencode 对全局 + 项目两级 `opencode.jsonc` 的 `instructions` 合并语义（拼接+去重 vs 替换），回填 P2，作为 op-004 定稿依据。
> **前置依赖**：无（独立；可用 op-001 路径函数，也可直接字符串构造）
> **规模**：~2 文件
> **含 N5（降级兜底）**

| # | 任务 | 描述 | 涉及文件 |
|---|------|------|----------|
| 1 | 构造隔离 HOME | 临时目录作 HOME；写 `~/.config/opencode/opencode.jsonc`（`instructions: ["~/.config/opencode/openfeel/core.md"]`）+ 项目 `opencode.jsonc`（`instructions: ["project-local.md"]`） | 临时 fixture |
| 2 | 实测解析 | 项目目录下运行 `opencode debug config`（或等价命令），导出最终生效 `instructions` | 脚本 / 手工 |
| 3 | 结论回填 | 断言全局条目是否保留；结论写入 P2 与 op-004 依据；**若 CLI 不可用 → 降级为源码证据静态确认 + 稳健设计兜底（N5）** | 结论记录 |

> **验证**：实测结果与源码证据（拼接+去重）一致；或已走降级兜底并记录依据。
> **注意**：本 op 是验证/调研性质，产出结论而非源码变更；不得因 op-000 阻塞后续 op。

### op-001：全局路径模块

> **目标**：集中解析 opencode 全局路径，作为 op-002/003/004 的路径基础。
> **前置依赖**：无
> **规模**：~2 文件
> **含 N4（homedir 封装）**

| # | 任务 | 描述 | 涉及文件 |
|---|------|------|----------|
| 1 | 新建路径模块 | NEW `src/core/global-paths.ts`：`getOpencodeGlobalDir()` → `~/.config/opencode`；`getGlobalAgentsDir()` → `~/.config/opencode/agents`；`getGlobalSkillsDir()` → `~/.config/opencode/skills`；`getGlobalOpencodeJsoncPath()` → `~/.config/opencode/opencode.jsonc`；`getGlobalCoreMdPath()` → `~/.config/opencode/openfeel/core.md`；`getGlobalUpdateStatePath()` → `~/.openfeel/update_state.json`；`getGlobalUpdateInfosPath()` → `~/.openfeel/update_infos.md`。内部统一 `homedir()` 调用（仅此模块 import `node:os` homedir） | NEW `src/core/global-paths.ts` |
| 2 | 单元测试 | 断言各路径拼接正确（mock `node:os` homedir 后） | NEW `test/core/global-paths.test.ts` |

> **验证**：`npm test` 中 global-paths 测试通过；各路径含正确分隔符与目录名。
> **注意**：`update_infos.md` 仅解析路径，读写逻辑属 stage-38，本阶段不实现。默认不收纳既有 4 处 `homedir()` 路径（D37-1）。

### op-002：init 改造

> **目标**：`deployOpencode` 部署目标从项目 `.opencode/` 切换到全局 `~/.config/opencode/`；项目仅生成 `.openfeel/` + `AGENTS.md` + 项目 `opencode.jsonc` 覆盖。
> **前置依赖**：op-001（hard）
> **规模**：~4 文件
> **含 D1、N1、N6、N7**

| # | 任务 | 描述 | 涉及文件 |
|---|------|------|----------|
| 1 | deployOpencode 全局化 | agent → `getGlobalAgentsDir()`；skill → `getGlobalSkillsDir()`；core.md → `getGlobalCoreMdPath()`；不再向项目写 `.opencode/{ADAPTER,.gitignore,instructions}`；「已存在不覆盖」原则保留 | `src/core/init.ts`（`deployOpencode`） |
| 2 | 全局 opencode.jsonc 首次写入 | 全局 opencode.jsonc 不存在时写入框架级内容（N7）：`$schema` + `default_agent: feel` + `instructions: ["~/.config/opencode/openfeel/core.md"]` + `agent.{vision,reviewer}.model` + agent_manager_tool 处置结果；已存在则跳过/合并（合并细节归 op-003 复用） | `src/core/init.ts` + 模板 |
| 3 | 项目 opencode.jsonc 最小覆盖 | 项目仅写 `$schema` + 用户自定义 `agent.<name>.model`（init 时可为最小 `{ "$schema": ... }`）；**不写** instructions / skills / default_agent（N6/N7） | `src/core/init.ts` + 模板 |
| 4 | 项目精简 | `initProject` 不再产生项目 `.opencode/`；保留 `.openfeel/` + `AGENTS.md` + 项目 opencode.jsonc；重启提醒文案更新（全局部署语义） | `src/core/init.ts`（`initProject`） |

> **验证**：全新 `openfeel init` 后，项目目录**无** `.opencode/`；全局 `~/.config/opencode/` 出现 agents（9）/skills（14）/openfeel/core.md/opencode.jsonc；项目仅 `.openfeel/` + `AGENTS.md` + `opencode.jsonc`。
> **注意**：N1——不删除仓库自身 `.opencode/`；「项目精简」仅指 init 部署的新项目。

### op-003：update 改造 + schema/URL 修正

> **目标**：`updateProject` 部署目标改全局；全局 opencode.jsonc「解析→深度合并→序列化」保留用户字段；修正 skills schema + `$schema` URL + agent_manager_tool 处置。
> **前置依赖**：op-001（hard）
> **规模**：~5 文件
> **含 D1、N2、N3、N6、N8**

| # | 任务 | 描述 | 涉及文件 |
|---|------|------|----------|
| 1 | updateProject 全局化 | agents/skills/core.md 部署到全局路径；`getIncomingContent` 的正则与路径同步改为全局路径 | `src/core/update.ts` |
| 2 | `$schema` URL 修正 | `update.ts` L1361、L1515 `https://opencode.openfeel/config.json` → `https://opencode.ai/config.json`（行号以执行时 grep 为准） | `src/core/update.ts` |
| 3 | skills 字段 schema 修正 | `buildUpdatedJsonc` / `replaceSkillsFieldInJsonc` / `buildJsoncFromObject` 不再生成 `{name:path}`；全局 skill 走自动发现 → 全局 opencode.jsonc 省略 `skills` 字段（N6） | `src/core/update.ts` |
| 4 | agent_manager_tool 处置 | 按 N3 实测三选一（保留/移除），并同步模板 `templates-data/opencode/opencode.jsonc` 与 `buildJsoncFromObject` 的 experimental 保留逻辑（D37-2） | `src/core/update.ts` + 模板 |
| 5 | 全局 opencode.jsonc 深度合并 | 已有全局 opencode.jsonc 时「解析→深度合并→序列化」，保留用户自定义字段（含未知字段/注释策略需明确）；覆盖/合并语义与 `update_state` 冲突检测联动 | `src/core/update.ts` |
| 6 | update_state 全局化（N2） | 全局框架资产（agents/skills/core.md/全局 opencode.jsonc）hash 追踪走 `~/.openfeel/update_state.json`；项目资产继续项目 state；首次全局 state 降级须防全量覆盖（kb troubleshooting） | `src/core/update-state.ts`、`src/core/update.ts` |
| 7 | legacy 布局识别（N8） | `update` 检测项目内 `.opencode/agents|skills|instructions` 时输出「请运行 `openfeel migrate`」提示，不静默迁移 | `src/core/update.ts` |

> **验证**：`openfeel update` 幂等；全局 opencode.jsonc 合并保留用户字段；`skills` 不再出现 `{name:path}`；`$schema` == `https://opencode.ai/config.json`；agent_manager_tool 按实测处置并留依据；legacy 布局被识别并提示。
> **注意**：存量旧 state 重键迁移属 stage-39，本阶段只落新部署侧全局 state。

### op-004：全局框架约束落地（P2）

> **目标**：框架 core 约束部署到 `~/.config/opencode/openfeel/core.md`；全局 opencode.jsonc `instructions` 引用之；项目 opencode.jsonc 不写 instructions；项目 AGENTS.md 仅项目级约束。
> **前置依赖**：op-001（hard）、op-000（soft，结论定稿依据）
> **规模**：~4 文件
> **含 P2、N7**

| # | 任务 | 描述 | 涉及文件 |
|---|------|------|----------|
| 1 | core.md 全局部署 | 框架 core 约束（`templates-data/opencode/instructions/{lang}.md` 源）部署到 `getGlobalCoreMdPath()` | init/update 部署逻辑 + 模板源 |
| 2 | 全局 instructions 引用 | 全局 opencode.jsonc `instructions: ["~/.config/opencode/openfeel/core.md"]`（op-002/003 已落，本 op 校验一致） | 模板 |
| 3 | 项目不写 instructions | 模板 `opencode_jsonc` 移除 `instructions` 字段（P2 稳健设计） | `templates-data/opencode/opencode.jsonc` |
| 4 | AGENTS.md 约束边界 | 项目 AGENTS.md 模板保持「项目级约束」定位；框架级约束不再进项目（已全局化） | `templates-data/agents-md/{zh-CN,en}.md`（如需要微调） |

> **验证**：项目 opencode.jsonc 无 `instructions` 字段；全局 opencode.jsonc `instructions` 引用全局 core.md；op-000 结论已回填。
> **注意**：依赖 op-000 合并语义结论；若降级兜底（N5），按 P2 稳健设计定稿。

### op-005：测试改造

> **目标**：init/update 测试改隔离 HOME；断言全局路径 + 项目精简 + 不写 instructions；新增 schema 校验。
> **前置依赖**：op-002 / op-003 / op-004（hard）
> **规模**：~6 文件
> **含 N4**

| # | 任务 | 描述 | 涉及文件 |
|---|------|------|----------|
| 1 | init 测试改造 | mock `node:os` homedir；断言 `deployOpencode` 写全局 `~/.config/opencode/{agents,skills,openfeel/core.md,opencode.jsonc}`；断言项目**无** `.opencode/`；「非交互跳过部署」语义重定义 | `test/core/init.test.ts`、`test/commands/init.test.ts` |
| 2 | update 测试改造 | mock homedir；断言全局路径；`$schema` URL 断言改 `opencode.ai`；skills 字段断言改自动发现/无映射 | `test/core/update.test.ts` |
| 3 | schema 校验测试 | 断言全局 opencode.jsonc `skills` 符合 `{paths,urls}`（或省略）、无 `{name:path}`；`$schema` == 正确 URL | NEW / 并入 update.test |
| 4 | 不写 instructions 断言 | 断言项目 opencode.jsonc 无 `instructions` 字段 | 并入 init/update 测试 |
| 5 | 合并保留断言 | 已有全局 opencode.jsonc 含用户自定义字段 → update 后保留 | 并入 update.test |
| 6 | legacy 提示断言 | legacy 布局 fixture → `update` 输出 migrate 提示且不迁移 | 并入 update.test |

> **验证**：测试全部在隔离 HOME 下运行，不污染真实全局配置；`npm run build && npm test` 全绿（470 + 新增）；`openfeel lint i18n` / `lint kb` 零错误。
> **注意**：现有 11 个测试文件中的名称/路径硬编码（stage-36 已同步新名），本阶段重点改「项目内 `.opencode/` → 全局路径」的部署目标断言；`opencode-instance.test.ts`（仓库自举实例）不受影响。

---

## 六、兼容性策略（存量项目 legacy 布局）

| 存量对象 | 迁移前状态 | 本阶段处理 | 完整迁移 |
|----------|-----------|-----------|----------|
| 项目 `.opencode/agents/*.md` | 旧名/新名项目内部署 | **识别 + 提示**（`openfeel migrate`），不删除 | stage-39 |
| 项目 `.opencode/skills/*/SKILL.md` | 同上 | 同上 | stage-39 |
| 项目 `.opencode/instructions/core.md` | 项目内框架约束 | 同上 | stage-39 |
| 项目 `opencode.jsonc` | 含 `instructions` + 非法 `skills` 映射 | **update 不再写项目 instructions/skills**；已有非法字段不动（迁移时清理） | stage-39 |
| 项目 `.openfeel/update_state.json` | 混合项目 + 框架资产 | 项目资产继续用项目 state；框架资产 hash 转全局 state（新部署侧）；**存量旧 state 重键迁移留 stage-39** | stage-39 |
| 已有全局 `~/.config/opencode/opencode.jsonc` | 用户自定义（仅 `$schema`） | 深度合并，保留用户字段；冲突项记录（stage-38 `update_infos.md` 承接） | — |
| 项目 `AGENTS.md` | 含框架 + 项目约束混合 | 保持现状；框架约束已全局化，项目级约束裁剪留 stage-39 提示 | stage-39 |
| OpenFeel 仓库自身 `.opencode/` | 构建产物/自举实例 | **不动**（N1） | stage-39 |

> **边界重申**：本阶段聚焦「新部署路径 + 识别提示」；`openfeel migrate` 命令、备份、状态拆分重键、项目自定义资产保留（REV-007）均属 stage-39。

---

## 七、测试策略

| 验证点 | 方式 |
|--------|------|
| 全局部署路径 | init/update 测试 mock `node:os` homedir（N4），断言 `~/.config/opencode/{agents,skills,openfeel/core.md,opencode.jsonc}` |
| 项目精简 | 断言 init 后项目**无** `.opencode/`；仅 `.openfeel/` + `AGENTS.md` + `opencode.jsonc` |
| opencode.jsonc schema | 断言 `skills` 无 `{name:path}`；`$schema` == `https://opencode.ai/config.json` |
| 不写 instructions | 断言项目 opencode.jsonc 无 `instructions` 字段 |
| 全局合并保留 | 预置含用户自定义字段的全局 opencode.jsonc → update 后字段保留 |
| update_state 全局化 | 全局资产 hash 写入 `~/.openfeel/update_state.json`；首次降级不覆盖（kb troubleshooting） |
| agent_manager_tool | 按 N3 实测结果断言处置（保留/移除） |
| legacy 提示 | legacy fixture → `update` 输出 migrate 提示且不迁移/删除 |
| instructions 合并语义 | op-000 隔离 HOME 实测（或降级兜底记录） |
| 隔离无污染 | 所有涉及全局的测试在 mock homedir 下运行，不碰真实 `~/.config/opencode/` |

**现有测试同步重点**（调研定位）：

- `test/core/init.test.ts`：`deployOpencode` 断言（L146-174）从项目 `.opencode/` 改全局路径；「非交互跳过部署」（L176-182）语义重定义；`opencode.jsonc` 断言（L184-190）改最小覆盖。
- `test/core/update.test.ts`：`$schema` 断言（L99/122/332 等）改 `opencode.ai`；skills 映射断言改自动发现；「26 文件 skipped」计数（L154）重算；冲突/合并用例路径改全局。
- `test/commands/init.test.ts`：部署目标断言同步。
- 新增 `test/core/global-paths.test.ts`。

---

## 八、风险点与回滚

| # | 风险 | 影响 | 缓解 |
|---|------|:--:|------|
| 1 | **真实全局 `~/.config/opencode/` 被误写** | 高 | 测试 mock homedir（N4）；部署前对全局文件备份；`--dry-run` 预览（若引入） |
| 2 | **配置合并语义不符预期**（instructions 被项目覆盖） | 高 | 源码已证拼接+去重；P2 稳健设计（项目不写 instructions）+ op-000 实测兜底（N5） |
| 3 | **agent_manager_tool 实测结果不确定** | 中 | N3 三选一 + 实测 + 留依据；最坏移除该字段不伤核心功能 |
| 4 | **update_state 全局化引入降级全量覆盖** | 中 | 全局 state 首次加载降级须防全量覆盖（kb troubleshooting 已知坑）；新旧 state 边界清晰 |
| 5 | **项目精简误删仓库 `.opencode/`** | 高 | N1 明确边界；op-002 只改 `deployOpencode` 部署目标，不动 build.js 步骤 8 |
| 6 | **测试断言大范围改动引入误改** | 中 | 分 op 更新断言 + 全量回归兜底；mock homedir 统一封装 |
| 7 | **legacy 项目升级静默破坏** | 中 | N8 只识别+提示，不迁移；迁移留 stage-39 显式 `openfeel migrate` |
| 8 | **全局 opencode.jsonc 深度合并丢注释/未知字段** | 中 | 「解析→合并→序列化」须明确保留策略；测试覆盖用户字段保留 |

**回滚方案**：

- 各 op 独立提交，可按 op `git revert`。
- 全局部署出错 → 从备份恢复 `~/.config/opencode/` 与 `~/.openfeel/`。
- 版本号本阶段不变（仍 1.0.9，stage-39 统一升 1.1.0），回滚无外部发布影响。
- op-003 的 `$schema`/skills 修正为纯文本改动，git 可精确回退。

---

## 九、约束与设计决策

| # | 约束 | 处理 |
|---|------|------|
| 1 | 遵循 AGENTS.md 简洁原则 | 不引入新依赖；`global-paths.ts` 仅集中路径解析，默认不收纳既有 `homedir()` 路径（D37-1 交 Schemer） |
| 2 | 中文注释、英文标识符 | 新增 `global-paths.ts` 各函数须中文注释 |
| 3 | 复用 stage-35 fs 工具 | 全局文件写入用 `atomicWriteFileSync` / `withFileLock`，不裸写 |
| 4 | 不实施 stage-38~40 | 控制区标记、`update_infos.md` 读写、migrate、模型接口均不在本阶段（`update_infos.md` 仅解析路径） |
| 5 | 不直写 flow.json | Planner 不操作；阶段注册/推进由 Feel 执行 `openfeel flow` |
| 6 | 只改本阶段范围 | 不动 `claude/`、`kilo/` stub；不动仓库 `.opencode/` 自举逻辑（N1） |

---

## 十、预期产出

| 产出 | 路径 |
|------|------|
| 计划文档 | `.openfeel/plan/v1/stage-37/plan.md`（本文件） |
| 依赖声明 | `.openfeel/plan/v1/stage-37/deps.yaml`（由 Schemer 细化） |
| 操作方案 | `.openfeel/plan/v1/stage-37/ops/op-{000..005}.md`（由 Schemer 细化） |
| 全局路径模块 | NEW `src/core/global-paths.ts` + `test/core/global-paths.test.ts` |
| 源码改造 | `src/core/init.ts`、`src/core/update.ts`、`src/core/update-state.ts` |
| 模板 | `templates-data/opencode/opencode.jsonc`（skills/instructions/agent_manager_tool/$schema）、`templates-data/opencode/instructions/{zh-CN,en}.md`（core.md 源） |
| 测试 | `test/core/init.test.ts`、`test/commands/init.test.ts`、`test/core/update.test.ts` + 新增 schema/合并/legacy 断言 |

---

## 十一、待确认事项

1. **N1 仓库自举边界**：确认「项目精简」仅指 init 部署的新项目，仓库自身 `.opencode/` 本阶段保留、迁移留 stage-39。
2. **N2 update_state 边界**：确认本阶段只落「全局框架资产走全局 state」的新部署侧，存量旧 state 重键迁移留 stage-39。
3. **N3 agent_manager_tool 处置**：实测后三选一（保留/移除），是否接受「移除」作为默认若 schema 未定义。
4. **N7 项目 opencode.jsonc 最小内容**：是否认可「项目 = `$schema` + 用户自定义 `agent.model`，不写 instructions/skills/default_agent」。
5. **op-000 实测可用性**：开发环境是否有 `opencode` CLI 可执行 `opencode debug config`；无则走 N5 降级兜底，是否认可。
6. **D37-1**：`global-paths.ts` 是否一并收纳既有 4 处 `homedir()` 路径（profile/config/locks/schemas），默认「否」。

---

## 附录 A：调研证据

| 项 | 证据 |
|----|------|
| 部署入口 | `init.ts` `deployOpencode` L194-249（agents→`.opencode/agents`、skills→`.opencode/skills`、instructions→`.opencode/instructions/core.md`、opencode.jsonc→项目根、ADAPTER、.gitignore）；`initProject` L256-402（L348-352 调 deployOpencode） |
| update 入口 | `update.ts` `updateProject` L1554-1743（agents/skills/instructions/opencode.jsonc 部署到项目 `.opencode/` + 项目根）；`buildUpdatedJsonc` L1349、`replaceSkillsFieldInJsonc` L1418、`getIncomingContent` L1783 |
| `$schema` 拼写 | `update.ts` L1361 `$schema: 'https://opencode.openfeel/config.json'`、L1515 `'  "$schema": "https://opencode.openfeel/config.json",'`；模板 `templates-data/opencode/opencode.jsonc` L2 与 `template-loader.ts` L6698/6744 已为 `https://opencode.ai/config.json` |
| skills 非法映射 | 模板 `opencode.jsonc` `"skills": "SKILLS_PLACEHOLDER"` → build 展开 `{name:path}`（`template-loader.ts` L6704-6719）；`buildUpdatedJsonc` L1377-1381 写 `{name:path}` |
| agent_manager_tool | 模板 L17-19 `experimental.agent_manager_tool: true`；`buildJsoncFromObject` L1512-1537 有 experimental 保留逻辑 |
| 全局路径现状 | `config.ts` L170（`.config/openfeel/profile.yaml`）、`identity.ts` L128（`.openfeel/config.json`）、`file-lock.ts` L65（`.openfeel/locks`）、`resolver.ts` L25（`.openfeel/schemas`） |
| update_state 现状 | `update-state.ts` L66-68 `getStatePath` 用 `resolve(projectPath, STATE_FILE)`（项目级）；L104 注释「拆分属 stage-39」 |
| 测试隔离先例 | `global-config.test.ts` L10-14 `vi.mock('node:os', { homedir: () => mockHomeDir })` |
| 测试现状 | `init.test.ts` L146-174 断言项目 `.opencode/`（27 created）；`update.test.ts` L99/122/332 `$schema` 用 `opencode.openfeel`；L154「26 skipped」计数 |
| 仓库自举实例 | `opencode-instance.test.ts` 校验仓库 `.opencode/` 25 文件含生成物标记（stage-36 产物，本阶段不动） |

> 本计划引用知识库多条既有条目；改造完成后，须由 Archiver 将「全局部署架构」经验沉淀至 kb/architecture.md 与 kb/patterns.md。
