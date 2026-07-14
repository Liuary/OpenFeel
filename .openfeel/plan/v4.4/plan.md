# OpenFeel v4.4 — 国际化 + 流水线纪律强化

> 创建于 2026-07-13 | 正式计划制定于 2026-07-14 | Planner 制定

## 一、需求理解

### 总体目标

v4.4 涵盖两大主线：**国际化基建**（i18n）与**流水线纪律强化**（Pipeline Discipline），外加四个 P1 优化项，共 10 项问题（6 个 P0 + 4 个 P1）。

问题源于 v4.3 中英双语部署测试的反馈：CLI 仍硬编码中文输出、全局语言偏好缺失、流水线执行层面的多项短板（REV 跳过、git commit 缺失、日志失效、package.json 不完整）。

### 两大主线

| 主线 | 涵盖问题 | 优先级 | 性质 |
|------|----------|:--:|------|
| i18n 基建 | #1 CLI 输出国际化、#2 全局默认语言配置 | P0 | 新增能力 |
| 流水线纪律 | #5 REV 闭环、#6 git commit、#7 日志强制落档、#9 日志体系修复、#10 自动推进询问 | P0+P1 | 机制强化 |
| 配置优化 | #3 全局语言可修改+项目映射、#4 update 同步 AGENTS.md、#8 package.json 模板 | P1 | 体验完善 |

### 问题清单

| # | 问题 | 优先级 | 依赖 |
|:--:|------|:--:|------|
| 1 | CLI 输出国际化 — `flow status`/`overview`/`current` 等命令按项目语言输出 | P0 | — |
| 2 | 全局默认语言配置 — 首次使用提示选择，存储用户级 `~/.openfeel/config.json` | P0 | #1（共享 i18n 机制） |
| 3 | 全局语言可修改 + 项目路径→语言 KV 持久化 | P1 | #2 |
| 4 | update 时同步 AGENTS.md 语言 | P1 | #1, #2 |
| 5 | REV 闭环 — blocking REV > 0 时禁止 advance to done | P0 | — |
| 6 | git commit 缺失 — Executor 完成后自动提交 | P0 | — |
| 7 | 日志强制落档 — 关键节点自动创建日志骨架 | P0 | #9（需先修复日志体系） |
| 8 | package.json 模板规范化 — Agent prompt 明确最小模板要求 | P1 | — |
| 9 | 日志体系断裂 — flow.json 缺上下文 / 公域噪音 / 私域全空 | P0 | — |
| 10 | 自动推进询问 — plan_passed 且 auto_advance=disabled 时 Feel 询问用户 | P1 | — |

### 约束

- i18n 机制与 `template-loader.ts` 对齐：构建时内联字符串映射表，运行时按键查表
- 用户级配置路径 `~/.openfeel/config.json`，跨平台兼容（`os.homedir()`）
- 日志：公域降噪 + 私域自动创建骨架
- 向后兼容：已有项目不受影响（已有 `.info.json` 的 `lang` 字段不回退覆盖）
- 参见 kb/architecture.md #多语言模板数据管线、kb/patterns.md #向后兼容的可选配置字段模式

---

## 二、分期与阶段划分

> **规模判定**：≥ 2 阶段、≥ 9 项问题、跨模块架构变更（i18n 基建 + 流水线安全增强均涉及核心模块）→ **大规模**，走完整流水线。
>
> 参见 Planner prompt「计划粒度判定标准」和 kb/architecture.md #Worktree 并行批次策略。

### 阶段总览

| 阶段 | 名称 | 优先级 | 依赖 | 预估任务 | 预估文件 |
|------|------|:--:|------|:--:|:--:|
| v4.4-stage-01 | i18n 基建 + CLI 国际化 | **P0** | — | 6 | ~3 新 + 12 改 |
| v4.4-stage-02 | 日志修复 + 流水线安全增强 | **P0** | —（与 stage-01 并行） | 6 | ~1 新 + 7 改 |
| v4.4-stage-03 | 配置优化 + Agent 提示词完善 | **P1** | stage-01 (hard), stage-02 (soft) | 3 | ~1 新 + 4 改 |
| v4.4-stage-04 | 数据同步 + 收尾修复 | **P2** | stage-01 (soft), stage-02 (soft) | 5 | 6 改 |

### 依赖关系

```
v4.4-stage-01 (i18n 基建) ── parallel ── v4.4-stage-02 (日志修复 + 流水线安全)
         │                                        │
         │  hard：stage-03 的 config 命令           │  soft：stage-03 的 Agent 提示词
         │  依赖 stage-01 的全局配置机制             │  与 stage-02 的 Agent 模板同文件
         ▼                                        ▼
              v4.4-stage-03 (配置优化 + 提示词完善)
                        │
                        │  soft：stage-04 的 flow 修复与 stage-01/02 的
                        │  flow.ts/flow-manager.ts 改动在同一文件区域
                        ▼
              v4.4-stage-04 (数据同步 + 收尾修复)
```

> **并行判定依据**（参见 kb/architecture.md #Worktree 并行批次策略）：
> - stage-01 修改文件集：`src/commands/` 下所有命令文件（i18n 封装）、`src/core/workspace/identity.ts`、`src/core/init.ts`、**新增** `src/core/i18n.ts` + `src/core/i18n-data/`
> - stage-02 修改文件集：`src/core/flow-manager.ts`、`src/core/public-logger.ts`、`src/commands/flow.ts`（advance 命令）、Agent 提示词模板（`templates-data/agents/`）
> - 两阶段文件集**仅在 `src/commands/flow.ts` 有交集**（stage-01 封装输出函数、stage-02 新增 REV 阻塞检查逻辑）。虽为同一文件但操作区域不同（输出层 vs 业务逻辑层），可标注为 soft 依赖——任意一方先合并后另一方 rebase 即可，无需严格串行。
> - stage-03 的 `templates-data/` 改动与 stage-02 共享同一批 Agent 模板文件 → **hard 依赖** stage-02。

### 阶段顺序说明

- **i18n 基建独立成 stage-01**：CLI 字符串国际化是跨所有命令文件的切面变更，触及面广但变更模式高度一致（把硬编码中文字符串替换为 `t()` 函数调用）。作为独立阶段可聚焦完成，为后续配置命令 (#3) 和 update 同步 (#4) 打基础。
- **日志修复 + 流水线安全独立成 stage-02**：四个 P0 问题 (#5/#6/#7/#9) 紧密耦合——#9 日志体系修复是 #7 强制落档的前提，而 #5 REV 闭环和 #6 git commit 都依赖流水线核心 (`flow-manager.ts`)。合入同一阶段避免跨阶段依赖碎片化。
- **P1 优化集中在 stage-03**：三个 P1 项 (#3/#4/#8) 均为锦上添花的配置与提示词优化，在 P0 基础设施落成后再推进。

---

## 三、阶段详细计划

---

### v4.4-stage-01：i18n 基建 + CLI 国际化

**目标**：建立与 `template-loader.ts` 对齐的构建时内联 i18n 字符串映射机制；实现全局默认语言配置（用户级 `~/.openfeel/config.json`）；将 CLI 命令的硬编码中文输出全部国际化。

**优先级**：P0 — 阻塞 stage-03 的 config 命令和 update 同步

**负责 Agent**：Executor

#### 任务列表

| # | 任务 | 说明 |
|:--:|------|------|
| op-001 | **创建 i18n 字符串源文件** | 创建 `src/core/i18n-data/zh-CN.ts` 和 `src/core/i18n-data/en.ts`，按功能域（flow/init/update/project/stage/plan/knowledge/roadmap/view/common）组织字符串映射表。键名使用语义化英文标识（如 `flow.status.globalStatus`），值分别为中英文字符串。所有字符串从现有 CLI 命令输出中提取，确保无遗漏。 |
| op-002 | **实现 i18n 运行时引擎** | 新增 `src/core/i18n.ts`。核心函数：`t(key: string, lang?: string): string` — 按语言+键名查表返回字符串，缺失时回退 `zh-CN`；`getCliLang(projectPath: string): 'zh-CN' | 'en'` — 先读全局配置 `~/.openfeel/config.json` 的 `lang` 字段，再读项目 `.info.json` 的 `lang` 字段，均缺失回退 `zh-CN`。与 `template-loader.ts` 模式对齐：字符串映射表在 `i18n-data/` 下以 TS 常量维护，构建时无需额外处理（TS 直接导入）。 |
| op-003 | **实现全局语言配置存储** | 在 `src/core/workspace/identity.ts`（或新增 `src/core/workspace/global-config.ts`）中实现以下函数：`getGlobalConfig(): GlobalConfig` — 读取 `~/.openfeel/config.json`，不存在返回默认值 `{ lang: 'zh-CN', projects: {} }`；`setGlobalConfig(config)` — 写入全局配置；`isFirstUse(): boolean` — 检测 `~/.openfeel/config.json` 是否存在，判定首次使用。路径使用 `os.homedir()` 确保跨平台兼容。 |
| op-004 | **首次使用语言选择提示** | 在 `src/core/init.ts` 的 `initProject()` 函数入口，`ensureInfoJson()` 之前，调用 `isFirstUse()` 检测。若为首次使用，弹出中英双语提示让用户选择全局默认语言，结果写入 `~/.openfeel/config.json` 的 `lang` 字段。非交互环境（CI/CD）输出提示信息并默认 `zh-CN`。选择后继续原有 `init` 流程，使用全局默认语言作为项目的语言选择默认值。 |
| op-005 | **国际化 CLI 命令输出** | 逐个命令文件封装国际化输出：将 `console.log()` 和 `console.error()` 中的硬编码中文字符串替换为 `t('key')` 调用。涉及文件：`src/commands/flow.ts`（status/overview/current/advance/metrics/wizard 等所有子命令输出）、`src/commands/init.ts`、`src/commands/update.ts`、`src/commands/project.ts`、`src/commands/stage.ts`、`src/commands/plan.ts`、`src/commands/knowledge.ts`、`src/commands/archive.ts`、`src/commands/roadmap.ts`、`src/commands/view.ts`、`src/commands/instructions.ts`。动态字符串（如含变量插值）使用模板函数模式：`t('flow.advance.ok', { stage: 'xx', to: 'yy' })` → `已推进: {stage} → {to}` / `Advanced: {stage} → {to}`。 |
| op-006 | **自测与回归验证** | 在测试项目中分别设置 `zh-CN` 和 `en` 语言，运行 `openfeel flow status`、`openfeel flow overview`、`openfeel flow current`、`openfeel init`（非交互模式）等命令，验证输出语言正确。验证：`~/.openfeel/config.json` 的创建与读写；首次使用检测逻辑；向后兼容（已有项目无全局配置时回退 `zh-CN`）；`npm test` 全量通过。 |

#### 产出文件

| 类型 | 文件 | 关联任务 |
|------|------|:--:|
| **新增** | `src/core/i18n.ts`（i18n 运行时引擎） | op-002 |
| **新增** | `src/core/i18n-data/zh-CN.ts`（中文字符串映射表） | op-001 |
| **新增** | `src/core/i18n-data/en.ts`（英文字符串映射表） | op-001 |
| **修改** | `src/core/workspace/identity.ts` — 新增全局配置读写函数（或提取到新文件 `global-config.ts`） | op-003 |
| **修改** | `src/core/init.ts` — 首次使用语言选择提示 + 使用全局默认语言 | op-004 |
| **修改** | `src/commands/flow.ts` — 国际化所有子命令输出 | op-005 |
| **修改** | `src/commands/init.ts` — 国际化输出 | op-005 |
| **修改** | `src/commands/update.ts` — 国际化输出 | op-005 |
| **修改** | `src/commands/project.ts` — 国际化输出 | op-005 |
| **修改** | `src/commands/stage.ts` — 国际化输出 | op-005 |
| **修改** | `src/commands/plan.ts` — 国际化输出 | op-005 |
| **修改** | `src/commands/knowledge.ts` — 国际化输出 | op-005 |
| **修改** | `src/commands/archive.ts` — 国际化输出 | op-005 |
| **修改** | `src/commands/roadmap.ts` — 国际化输出 | op-005 |
| **修改** | `src/commands/view.ts` — 国际化输出 | op-005 |
| **修改** | `src/commands/instructions.ts` — 国际化输出 | op-005 |

#### 自测要点

- `t('flow.status.globalStatus', 'en')` 返回 `Global Status`，`t('same-key', 'zh-CN')` 返回 `全局状态`
- `getCliLang()` 在无全局配置且无项目 `.info.json` `lang` 时返回 `zh-CN`
- `isFirstUse()` 在 `~/.openfeel/config.json` 不存在时返回 `true`
- 交互式首次使用：提示语中英双语显示，选择 'en' 后全局配置写入 `{ lang: 'en' }`
- 非交互环境首次使用：输出提示信息，默认 `zh-CN` 且不阻塞流程
- CLI 命令输出在英文项目下全部为英文，中文项目下为中文
- `npm test` 全量通过（225+/227 通过）

#### 技术决策

> ✅ **已确定：i18n 字符串维护方式 = TS 常量直接导入**（与 template-loader 对齐但不引入构建脚本）
>
> 与 template-loader 不同，i18n 字符串数量可控（每语言 < 200 条），无需构建脚本的 Base64→decode 链路。直接以 TS 常量维护在 `i18n-data/{lang}.ts` 中，`i18n.ts` 按需导入。优势：
> - 零构建脚本依赖，TypeScript 原生类型推导
> - 新增语言只需新增 `i18n-data/{lang}.ts` 文件，扩展成本极低
> - 与 template-loader 的「运行时按键查表」模式一致
>
> **全局配置路径**：`os.homedir() + '/.openfeel/config.json'`。Windows → `C:\Users\{name}\.openfeel\config.json`，macOS/Linux → `~/.openfeel/config.json`。

---

### v4.4-stage-02：日志修复 + 流水线安全增强

**目标**：修复日志体系三处断裂（flow.json 缺上下文、公域噪音、私域全空）；实施流水线安全机制（REV 闭环 + git commit 自动提交 + 日志强制落档）。

**优先级**：P0 — 阻塞 stage-03 的 Agent 提示词修改（共享模板文件）

**前置依赖**：无 — 与 stage-01 并行（文件集仅在 flow.ts 有交集但操作区域不重叠，见并行判定依据）

**负责 Agent**：Executor

#### 任务列表

| # | 任务 | 说明 |
|:--:|------|------|
| op-001 | **修复 flow.json 日志上下文缺失 + 公域日志降噪** | 两处联动修改：(a) `src/core/flow-manager.ts` — `appendLog()` 的 `agent` 字段由硬编码 `'flow-manager'` 改为可选参数，`advanceStagePhase()` 调用时传入实际触发者（Feel/Executor/Reviewer）；日志 `detail` 中增加 `summary` 字段记录操作摘要。(b) `src/core/public-logger.ts` — `logPhaseChange()` 不再每次推进都写日志，改为**批量聚合**：在 `endStage()` 完成时汇总该阶段所有阶段推进合并为一条公域日志。新增 `logMilestone()` 方法用于记录阶段完成、测试通过、归档完成等里程碑事件（此类事件仍逐条记录）。 |
| op-002 | **实现 REV 闭环：blocking REV 阻塞 done 推进** | 在 `src/core/flow-manager.ts` 的 `advanceStagePhase()` 方法开头新增 `targetPhase === 'done'` 时的前置校验：调用 `getReviewItems()` 获取当前阶段所有 REV，计数 `blocking !== false` 且 `status === 'open'` 的条目数 > 0 时，抛出错误拒绝推进。错误信息包含未解决的 blocking REV 列表（ID + 标题）。`--force` 参数仅将错误降级为警告但不跳过，确保 `--force` 也不能绕过安全检查。同步在 `src/commands/flow.ts` 的 `flow advance` 命令中添加命令层前置校验（双路兜底：命令层 + FlowManager 层）。 |
| op-003 | **实现 git commit 自动提交机制** | 两处实施：(a) **Agent 提示词强化**：在 `templates-data/agents/{lang}/executor.md` 的「输出报告」步骤末尾，增加「每个 op 完成后必须执行 `git add -A && git commit -m "op-{id}: {title}"`」的强制要求。同步更新 OpenFeel 自身 `.opencode/agents/executor.md`。(b) **流水线钩子（可选增强）**：在 `src/commands/flow.ts` 的 `flow advance` 命令中，每次推进后检查 `git status --porcelain`，若有未提交变更，输出醒目警告。此钩子作为安全网而非主要机制（主要依赖 Agent 自律）。 |
| op-004 | **实现日志强制落档骨架** | (a) **流水线节点触发**：在 `src/core/flow-manager.ts` 的 `advanceStagePhase()` 中，当推进到 `exec_running`、`review_pending`、`test_pending` 等关键 phase 时，自动调用骨架创建函数，在私域日志目录创建带日期前缀的空日志文件骨架（文件名含模板提示，如 `{date}-001-template.md`），Agent 只需填充内容。(b) **Agent 提示词强化**：在 `templates-data/agents/{lang}/feel.md` 的日志记录纪律段落中，明确「骨架文件已由流水线自动创建，填充即可」。同步更新 `.opencode/agents/feel.md`。 |
| op-005 | **实现自动推进询问（Feel prompt 强化）** | 修改 `templates-data/agents/{lang}/feel.md`（中英文版本）：在「核心职责」的调度决策节中，新增规则——「当阶段进入 plan_passed 且项目 auto_advance=disabled 时，Feel 在推进到 scheme_pending / exec_running 前必须询问用户是否开启自动推进」。若用户同意，Feel 通过 `openfeel flow` CLI 或调用 FlowManager API 将 auto_advance 设为 enabled。同步更新 `.opencode/agents/feel.md`。 |
| op-006 | **自测与回归验证** | 验证：(a) flow.json 日志中 `agent` 字段记录实际触发者而非 flow-manager；(b) 公域日志 milestone 事件存在且 phase 变更不再逐条写入；(c) 推进 `flow advance --stage xx --to done` 时，存在 open blocking REV → 拒绝推进并显示 REV 列表；(d) `--force` 也无法绕过 REV 阻塞检查（仅降级警告但仍拒绝）；(e) 私域日志骨架在阶段推进时自动创建；(f) Feel 在 auto_advance=disabled 项目 plan_passed 后询问是否开启；`npm test` 全量通过。 |

#### 产出文件

| 类型 | 文件 | 关联任务 |
|------|------|:--:|
| **修改** | `src/core/flow-manager.ts` — advanceStagePhase REV 检查 + 日志 agent 字段 + 骨架触发 | op-001, op-002, op-004 |
| **修改** | `src/core/public-logger.ts` — 公域日志降噪（批量聚合）+ 里程碑方法 | op-001 |
| **修改** | `src/commands/flow.ts` — advance 命令 REV 前置校验双路兜底 + git 脏区检查 | op-002, op-003 |
| **修改** | `templates-data/agents/zh-CN/executor.md` — op 完成后 git commit 要求 | op-003 |
| **修改** | `templates-data/agents/en/executor.md` — op 完成后 git commit 要求（英文版同步） | op-003 |
| **修改** | `templates-data/agents/zh-CN/feel.md` — 日志骨架填充说明 + 自动推进询问 | op-004, op-005 |
| **修改** | `templates-data/agents/en/feel.md` — 日志骨架填充说明 + 自动推进询问（英文版同步） | op-004, op-005 |
| **修改** | `.opencode/agents/executor.md` — 同步 git commit 要求 | op-003 |
| **修改** | `.opencode/agents/feel.md` — 同步日志骨架说明 + 自动推进询问 | op-004, op-005 |

#### 自测要点

- 公域日志 `log.md` 中 `advance_stage_phase` 条目数大幅减少（每阶段仅里程碑级记录）
- `flow.json` 日志记录的 `agent` 字段不再是恒定的 `flow-manager`
- 模拟存在 open blocking REV → `openfeel flow advance --stage x --to done` 被拒绝，错误信息包含 REV 列表
- `openfeel flow advance --stage x --to done --force` 仍被拒绝（仅降级警告）
- 推进到关键 phase 时私域日志目录下出现骨架文件
- `npm test` 全量通过

#### 关键设计决策

> ✅ **REV 闭环不设例外**：blocking REV > 0 时 `advance to done` 无条件拒绝。`--force` 仅降级日志级别（error → warn），仍拒绝推进。理由：流水线安全不应存在后门——如果确实需要绕过（如 low 优先级 REV 故意不修），应先通过 `flow review resolve` 或修改 REV 的 `blocking` 标记。
>
> ✅ **日志降噪策略：批量聚合而非取消**：`advance_stage_phase` 改为在 `endStage()` 完成时汇总为一条。里程碑事件（test_passed, archiving→done）仍逐条记录。确保审计链不丢失的同时消除 85%+ 的噪音条目。
>
> ✅ **git commit 优先级：Agent 自律 > 流水线强制**：主要依赖 executor.md prompt 强化。流水线钩子 (`git status --porcelain`) 仅作为安全网警告，不自动提交（避免误提交敏感文件）。

---

### v4.4-stage-03：配置优化 + Agent 提示词完善

**目标**：实现全局语言可修改命令、项目路径→语言 KV 持久化；完善 `update` 命令的语言同步逻辑；规范 Agent 的 package.json 模板要求。

**优先级**：P1 — 体验优化，不阻塞核心功能

**前置依赖**：
- stage-01 (hard)：`openfeel config` 命令依赖 stage-01 的全局配置读写机制 (#3/#4)
- stage-02 (soft)：package.json 模板修改共享 Agent 模板文件（与 stage-02 的 executor.md 修改同文件）

**负责 Agent**：Executor

#### 任务列表

| # | 任务 | 说明 |
|:--:|------|------|
| op-001 | **实现 `openfeel config` 命令 + 项目语言映射** | 新增 `src/commands/config.ts`，注册 `openfeel config` 命令组，含以下子命令：(a) `openfeel config get lang` — 读取并显示全局默认语言；(b) `openfeel config set lang <zh-CN\|en>` — 修改全局默认语言并回显结果；(c) `openfeel config list projects` — 列出 `~/.openfeel/config.json` 中所有已记录的项目路径→语言映射。在 `src/core/workspace/identity.ts` 中新增 `recordProjectLang(projectPath, lang)` 函数——在 `openfeel update` 成功更新后，自动将项目路径和语言写入全局配置的 `projects` KV 表。在 `src/cli/index.ts` 中注册新命令。 |
| op-002 | **完善 update 的 AGENTS.md 语言同步** | 在 `src/core/update.ts` 的 `updateProject()` 中实现语言同步逻辑：检测「项目尚未部署」（通过判断 `.opencode/agents/` 目录是否存在 + 是否为空），首次部署时使用全局默认语言部署全部内容（含 AGENTS.md）。已有项目 update 且 `--lang` 与当前 `.info.json` 语言不同时：(a) 更新框架内容（Agent/Skills/core.md）；(b) 提示用户 AGENTS.md 存在语言差异，询问是否覆盖（交互模式）/ 输出警告（非交互模式）。`--lang` 与当前语言相同时跳过 AGENTS.md 覆盖。支持 `--force` 参数跳过确认直接覆盖。 |
| op-003 | **强化 Agent 的 package.json 模板要求** | 在 `templates-data/agents/{lang}/executor.md`（中英文版本）的「项目初始化」相关段落中，明确 `package.json` 最小模板要求：必须包含 `name`、`version: "1.0.0"`、`type: "module"`、`scripts.test`（如 `"test": "vitest run"`）。强调 template-data 下的 Agent 提示词在每次 `npm run build` / `openfeel update` 时部署到目标项目。中文模板同步翻译。确保中英 Agent 产出同质化。 |

#### 产出文件

| 类型 | 文件 | 关联任务 |
|------|------|:--:|
| **新增** | `src/commands/config.ts` — `openfeel config` 命令组 | op-001 |
| **修改** | `src/cli/index.ts` — 注册 config 命令 | op-001 |
| **修改** | `src/core/workspace/identity.ts` — 新增 `recordProjectLang()` 函数 | op-001 |
| **修改** | `src/core/update.ts` — AGENTS.md 语言同步逻辑 | op-002 |
| **修改** | `src/commands/update.ts` — --force 参数 + 语言差异提示 | op-002 |
| **修改** | `templates-data/agents/zh-CN/executor.md` — package.json 最小模板要求 | op-003 |
| **修改** | `templates-data/agents/en/executor.md` — package.json 最小模板要求（英文版） | op-003 |

#### 自测要点

- `openfeel config set lang en` → 全局配置更新，回显 `Global language set to: en`
- `openfeel config get lang` → 正确显示当前全局语言
- 在项目 A（zh-CN）中执行 `openfeel update` 后，`~/.openfeel/config.json` 的 `projects` 中新增映射
- `openfeel config list projects` → 列出所有项目路径及对应语言
- 首次 update（无 `.opencode/agents/` 目录）→ 使用全局默认语言部署含 AGENTS.md
- 已有 en 项目执行 `openfeel update --lang zh-CN` → 提示语言差异确认覆盖
- 已有 en 项目执行 `openfeel update --lang en` → 跳过 AGENTS.md，仅更新框架内容
- 新建英文项目 → Agent 生成的 `package.json` 包含 name/version/type/scripts.test
- `npm test` 全量通过

---

### v4.4-stage-04：数据同步 + 收尾修复（Feel 研究改进）

**目标**：修复 Feel 研究发现的 5 项改进点——CLI 兼容性 bug、知识库数据过时、代码模板优化、版本号更新、跨文件一致性修复。

**优先级**：P2 — 收尾完善，不阻塞核心功能

**前置依赖**：stage-01 (soft，依赖 i18n 机制判断输出语言)，stage-02 (soft，flow-manager/flow.ts 改动在同一文件区域)

**负责 Agent**：Executor

#### 任务列表

| # | 任务 | 说明 |
|:--:|------|------|
| op-001 | **修复 flow wizard Node.js 20 兼容性** | `openfeel flow wizard` 报错 `styleText is not exported from node:util`——`styleText` 是 Node.js 22+ 的 API，当前环境为 Node.js 20.11.1。修复：将 `styleText` 替换为 ANSI 转义码直接输出或使用 `chalk`/自定义颜色函数；或在调用前检测 Node 版本并使用降级方案。涉及 `src/commands/flow.ts`（wizard 实现）或 dist 构建产物中引用的位置。 |
| op-002 | **更新知识库测试数据** | `kb/setup.md` 第 37 行和 `kb/index.md` 第 88 行仍写"225/227 通过（2 个已知弱项）"，实际 `npm test` 已 275/275 全部通过（18 个测试文件）。更新为当前准确数据。 |
| op-003 | **修复 init.ts 测试模板硬编码** | `src/core/init.ts` 第 269 行生成的示例测试文件 `test/index.test.ts` 中硬编码了 OpenFeel 的问候语逻辑（`greet` 函数返回"你好，${name}！欢迎使用 OpenFeel"），且包含一个 TODO 注释"替换为项目实际的模块路径"。修复：将示例测试改为更通用的模板（如简单的 `sum` 函数测试），移除 OpenFeel 特有引用和 TODO。 |
| op-004 | **更新项目版本号** | `package.json` 中 `version` 仍为 `0.1.0`，未反映经历 v1~v4.4 多轮迭代的实际成熟度。更新为 `1.0.0`（首个正式版本）。同步检查 README.md 和 Agent 模板中是否有引用版本号的位置。 |
| op-005 | **修复 v4.2 跨文件一致性问题** | `flow health` 检测到 v4.2 的 `flow.json` 状态为 `done` 但 `status.md` 状态为 `review_passed`，不一致。修复：将 `.openfeel/plan/v4.2/v4.2-stage-01/status.md` 的状态更新为 `done`，与 flow.json 对齐。 |

#### 产出文件

| 类型 | 文件 | 关联任务 |
|------|------|:--:|
| **修改** | `src/commands/flow.ts` — wizard 兼容性修复（或 dist/ 中的对应构建产物） | op-001 |
| **修改** | `.openfeel/kb/setup.md` — 测试数据更新 | op-002 |
| **修改** | `.openfeel/kb/index.md` — 测试数据更新 | op-002 |
| **修改** | `src/core/init.ts` — 测试模板去 OpenFeel 化 | op-003 |
| **修改** | `package.json` — 版本号更新 | op-004 |
| **修改** | `.openfeel/plan/v4.2/v4.2-stage-01/status.md` — 状态对齐 | op-005 |

#### 自测要点

- `openfeel flow wizard` 在 Node.js 20 下正常运行（不报 styleText 错误）
- `kb/setup.md` 和 `kb/index.md` 中测试数据更新为 275/275
- `openfeel init` 生成的 `test/index.test.ts` 不再包含 OpenFeel 特有逻辑
- `package.json` version 更新为 `1.0.0`
- `openfeel flow health` 不再报告 v4.2 跨文件不一致
- `npm test` 全量通过（275/275）

---

## 四、依赖关系与风险评估

### 依赖矩阵

| 阶段 | 依赖 | 类型 | 说明 |
|------|------|:--:|------|
| stage-01 → stage-03 | hard | 全局配置读写机制为 config 命令和项目映射的前置条件 |
| stage-02 → stage-03 | soft | Agent 模板文件共享（executor.md / feel.md），需协调合并顺序 |
| stage-01 ↔ stage-02 | soft (parallel) | 文件集仅在 `flow.ts` 有交集但操作区域不同，可并行后 rebase |

### node 依赖图

```
v4.4-stage-01 ──soft── v4.4-stage-02
      │                      │
      │ hard                 │ soft
      ▼                      ▼
           v4.4-stage-03
```

### 风险矩阵

| 风险 | 影响 | 概率 | 缓解措施 |
|------|:--:|:--:|------|
| i18n 封装遗漏：CLI 命令某处输出未封装 | 中英混杂输出 | 中 | op-001 从现有代码 grep 所有 `console.log`/`console.error` 字符串，建立完整清单后逐条封装 |
| 全局配置路径跨平台问题 | Windows vs Unix 路径差异 | 低 | 使用 `os.homedir()` + `path.join()`，v4.3 已有跨平台经验 |
| REV 闭环误伤：历史遗留 open REV 阻塞合法推进 | 流水线卡死 | 低 | op-002 仅校验 `blocking !== false` 的 open REV；非阻塞 REV 不拦截 |
| git commit 机制依赖 Agent 自律不足 | Agent 仍不提交 | 中 | 双重保障：prompt 强化（主）+ 流水线提醒钩子（辅）。若 v4.4 测试仍失效，v4.5 考虑流水线强制提交 |
| Agent 模板文件冲突：stage-02 和 stage-03 同时修改 executor.md | 合并冲突 | 中 | stage-03 声明 soft 依赖 stage-02，在 stage-02 executor.md 修改已合并后再修改同一文件 |
| update AGENTS.md 覆盖用户自定义内容 | 用户内容丢失 | 低 | op-002 采用「提示确认 + --force 跳过」模式，参考 kb/patterns.md #向后兼容的可选配置字段模式 |

---

## 五、里程碑与验收标准

### M1：i18n 基建就绪（stage-01 完成）

- [ ] `openfeel flow status` 在英文项目下输出英文
- [ ] `openfeel flow overview` 在中文项目下输出中文
- [ ] 首次运行 openfeel 弹出中英双语语言选择
- [ ] `~/.openfeel/config.json` 正确创建和读取
- [ ] `npm test` 全量通过

### M2：流水线纪律强化（stage-02 完成）

- [ ] blocking REV 未解决时 `advance --to done` 被拒绝
- [ ] `flow.json` 日志 agent 字段记录实际触发者
- [ ] 公域日志噪音降至 ≤ 5 条 `advance_stage_phase` 记录
- [ ] 关键节点自动创建私域日志骨架文件
- [ ] git 脏区警告在命令层生效
- [ ] Feel 在 auto_advance=disabled 项目 plan_passed 后询问是否开启

### M3：配置体验完善（stage-03 完成）

- [ ] `openfeel config` 命令组全部子命令可用
- [ ] `openfeel update` 语言同步逻辑正确（首次部署/切换/一致/确认）
- [ ] Agent 生成的 package.json 包含完整模板要求
- [ ] `npm test` 全量通过

---

## 六、附录

### 参考知识库条目

| 条目 | 类别 | 关联要点 |
|------|------|----------|
| kb/architecture.md #多语言模板数据管线 | architecture | i18n 构建时内联模式的参考实现 |
| kb/architecture.md #Worktree 并行批次策略 | architecture | stage-01↔stage-02 并行判定 |
| kb/patterns.md #构建脚本多语言循环生成模式 | patterns | 新增语言零代码变更思想 |
| kb/patterns.md #向后兼容的可选配置字段模式 | patterns | 全局配置的 `??` 回退策略 |
| kb/patterns.md #双语 CLI 交互模式 | patterns | init 选择→持久化→update 读取三段式 |
| kb/patterns.md #REV blocking 标记模式 | patterns | REV 闭环的 blocking 字段语义 |
| kb/patterns.md #CLI 原子管理模式 | patterns | config 命令作为全局配置的原子操作入口 |

### 知识库补充建议

本计划实施过程中预计产生以下经验（由 Archiver 在阶段归档时沉淀）：

- `architecture`：i18n 基础设施与多语言模板管线的架构关系
- `patterns`：CLI 命令国际化的封装模式（`t()` + 模板函数）
- `patterns`：流水线安全钩子的实现模式（前置校验双路兜底）
- `patterns`：日志强制落档骨架的流水线节点触发模式
- `troubleshooting`：跨阶段并行时文件合并冲突的处理经验

### 全局配置结构（`~/.openfeel/config.json`）

```json
{
  "lang": "zh-CN",
  "projects": {
    "/home/user/project-a": "zh-CN",
    "/home/user/project-b": "en"
  }
}
```

- `lang`：用户全局默认语言偏好，首次使用时交互选择，可通过 `openfeel config set lang` 修改
- `projects`：项目路径→使用语言的 KV 映射，由 `openfeel update` 自动记录，`openfeel config list projects` 查看
