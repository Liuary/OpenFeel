# OpenFeel v4.3 — 审计修复 + 中英双语支持

> 创建于 2026-07-09 | Planner 制定 | 修订于 2026-07-09（审查反馈 REV-001~008）

## 一、需求理解

### 总体目标

v4.3 涵盖两大板块：**Part A 审计遗留问题处理**（3 项）与 **Part B 中英双语支持**（7 项），合计 10 项变更。

### Part A：审计遗留问题处理

v4.2 阶段审计发现 7 个违规中的剩余 3 个待处理：

| # | 任务 | 优先级 | 描述 |
|:--:|------|:--:|------|
| A1 | 强化日志记录纪律 | **high** | feel.md 和/或各 Agent prompt 中强化「每个 Agent 完成后必须记录操作摘要到私域日志」 |
| A2 | 强化 Executor 自测报告完整性 | medium | executor.md 中明确「每个 op 均须产出自测报告到 .openfeel/tmp/」 |
| A3 | REV-004 修复 | low | project.ts 入口路径节增加目录存在性判断，src/ 不存在时标注「未检测到项目结构」 |

### Part B：中英双语支持

| # | 任务 | 描述 |
|:--:|------|------|
| B1 | 模板文件化重构 | 将 Agent 定义从 update.ts 内联字符串提取为按语言分目录的 .md 模板文件 |
| B2 | 语言配置存储 | .info.json 增加 `lang` 字段（zh-CN / en），默认 zh-CN，含回退逻辑 |
| B3 | init 双语提醒 | `openfeel init` 流程中中英双语提示用户选择部署语言 |
| B4 | update --lang 参数 | `openfeel update` 增加 `--lang` 参数，不指定时使用 init 选择的语言 |
| B5 | 英文 Agent prompt 模板 | 8 个 Agent prompt 翻译为英文版本 |
| B6 | 英文 AGENTS.md 模板 | 生成英文版 AGENTS.md 模板 |
| B7 | README.md 双语化 | 增加英文版内容 |

**约束**：
- 项目本身仍以中文开发（源码注释、内部文档、kb/ 保持中文）
- 仅部署给用户的 Agent prompt 和 AGENTS.md 需要双语
- 向后兼容：已有部署项目 update 时不强制切换语言；.info.json 无 lang 字段时默认 zh-CN
- 参见 kb/architecture.md #Feel 调度 + openfeel CLI 推进模型、kb/patterns.md #CLI 原子管理模式

---

## 二、分期与阶段划分

> **规模判定**：≥ 2 阶段、≥ 10 文件变更、跨模块架构变更 → **大规模**，走完整流水线。
>
> 参见 Planner prompt「计划粒度判定标准」和 kb/architecture.md #Worktree 并行批次策略。

### 阶段总览

| 阶段 | 名称 | 优先级 | 依赖 | 预估任务 | 预估文件 |
|------|------|:--:|------|:--:|:--:|
| v4.3-stage-01 | 模板文件化重构 + 纪律强化 | **P0** | — | 8 | ~12 新 + 5 改 |
| v4.3-stage-02 | REV-004 修复（project.ts） | **P0** | —（与 stage-01 并行） | 1 | 1 改 |
| v4.3-stage-03 | 英文内容产出 + 双语交互 | **P1** | stage-01 (hard) | 8 | ~10 新 + 4 改 |

### 依赖关系

```
v4.3-stage-01 (模板基建 + 纪律强化) ── parallel ── v4.3-stage-02 (REV-004 修复)
        │
        │  hard：stage-03 英文模板基于 stage-01 的中文模板翻译
        ▼
v4.3-stage-03 (英文内容产出 + 双语交互)
```

> **并行判定依据**（参见 kb/architecture.md #Worktree 并行批次策略）：
> - stage-01 修改文件集：`templates-data/` 下新增模板文件 + `update.ts` + `templates.ts` + `.opencode/agents/feel.md` + `.opencode/agents/executor.md`
> - stage-02 修改文件集：`src/commands/project.ts`
> - 两阶段文件集**无交集** → 可并行执行，互不阻塞。

### 阶段顺序说明

- **A1（日志纪律）和 A2（自测报告）已融入 stage-01**：在创建 feel.md / executor.md 模板文件时，直接将强化后的纪律内容写入，而非先提取原版再修改。这样消除了原 stage-02 对 stage-01 的文件依赖（原方案中两阶段共享 feel.md / executor.md 修改）。
- **A3（REV-004 修复）独立为 stage-02**：project.ts 的修复与模板重构完全无关，作为独立阶段与 stage-01 并行推进。
- **stage-03 仅依赖 stage-01**：英文模板翻译需要中文模板就绪，但不依赖 project.ts 修复。

---

## 三、阶段详细计划

---

### v4.3-stage-01：模板文件化重构 + 纪律强化

**目标**：将 Agent 定义从 `src/core/update.ts` 内联字符串常量提取为按语言分目录的 `.md` 模板文件，建立构建时内联加载机制，并在模板提取时直接融入审计要求的日志纪律和自测报告强化内容。

**优先级**：P0 — 阻塞 stage-03

**负责 Agent**：Executor

#### 任务列表

| # | 任务 | 说明 |
|:--:|------|------|
| op-001 | **创建模板目录结构** | 创建 `src/core/templates-data/agents/zh-CN/`、`agents-md/zh-CN/`、`core-instructions/zh-CN/` 三个目录 |
| op-002 | **提取 Agent 定义到模板文件（含纪律强化）** | 将 `update.ts` 中 `AGENT_DEFINITIONS` 的 8 个 Agent 定义（archiver/executor/feel-tester/feel/planner/reviewer/schemer/utility）分别写入 `agents/zh-CN/{agent}.md`。**关键**：提取时直接融入以下纪律强化 — feel.md 在「子 Agent 返回精简模式」节后新增日志记录纪律段落；executor.md 在「输出报告」步骤中明确每个 op 均须产出自测报告到 `.openfeel/tmp/op-{opId}-test-report.md` |
| op-003 | **提取 AGENTS.md 模板到文件** | 将 `templates.ts` 中的 `AGENTS_MD_TEMPLATE` 提取为 `templates-data/agents-md/zh-CN.md` |
| op-004 | **提取 core instructions 模板到文件** | 将 `templates.ts` 中的 `CORE_INSTRUCTIONS_TEMPLATE_B64` 解码并写入 `templates-data/core-instructions/zh-CN.md` |
| op-005 | **实现构建时内联模板加载器** | 新增 `src/core/template-loader.ts`。**选型确定：构建时内联方案**。构建脚本在 `npm run build` 时将 `templates-data/` 下的 .md 文件读取并内联为 TS 字符串常量（现有 AUTO-GENERATED-BEGIN 模式的演进，改为自动化脚本生成）。导出 `loadAgentTemplate(lang, agentId): string` 和 `loadTemplate(lang, templateName): string` 函数，从内联常量中返回而非运行时读取文件。消除跨平台风险和 npm 包分发问题 |
| op-006 | **重构 update.ts 使用模板加载器** | 将 `update.ts` 中的 `AGENT_DEFINITIONS` 常量和硬编码的 skill/instruction 内容改为通过模板加载器按语言加载。移除 `AUTO-GENERATED-BEGIN/END` 注释块，由构建脚本替代 |
| op-007 | **同步更新 .opencode/agents/feel.md** | 将 op-002 中已强化日志纪律的 feel.md 模板内容同步到 OpenFeel 自身的 `.opencode/agents/feel.md`，确保 OpenFeel 自身的 Agent 部署也遵循新的日志纪律要求 |
| op-008 | **同步更新 .opencode/agents/executor.md** | 将 op-002 中已强化自测报告的 executor.md 模板内容同步到 `.opencode/agents/executor.md`，确保 OpenFeel 自身的 Executor 也遵循新的自测报告要求 |

> **op-007、op-008 同步更新说明**：OpenFeel 自身的 `.opencode/agents/*.md` 是特殊存在——既是模板源也是部署目标。模板文件化后，两者需保持同步。参见 kb/architecture.md #15→7 Agent 精简体系。

#### 产出文件

| 类型 | 文件 | 关联任务 |
|------|------|:--:|
| **新增** | `src/core/templates-data/agents/zh-CN/archiver.md` | op-002 |
| **新增** | `src/core/templates-data/agents/zh-CN/executor.md` | op-002 (含自测报告强化) |
| **新增** | `src/core/templates-data/agents/zh-CN/feel-tester.md` | op-002 |
| **新增** | `src/core/templates-data/agents/zh-CN/feel.md` | op-002 (含日志纪律强化) |
| **新增** | `src/core/templates-data/agents/zh-CN/planner.md` | op-002 |
| **新增** | `src/core/templates-data/agents/zh-CN/reviewer.md` | op-002 |
| **新增** | `src/core/templates-data/agents/zh-CN/schemer.md` | op-002 |
| **新增** | `src/core/templates-data/agents/zh-CN/utility.md` | op-002 |
| **新增** | `src/core/templates-data/agents-md/zh-CN.md` | op-003 |
| **新增** | `src/core/templates-data/core-instructions/zh-CN.md` | op-004 |
| **新增** | `src/core/template-loader.ts`（模板加载器） | op-005 |
| **修改** | `src/core/update.ts` — 使用模板加载器替代内联常量 | op-006 |
| **修改** | `src/core/templates.ts` — 简化或重定向到模板加载器 | op-006 |
| **修改** | `.opencode/agents/feel.md` — 同步日志纪律强化 | op-007 |
| **修改** | `.opencode/agents/executor.md` — 同步自测报告强化 | op-008 |
| **可能修改** | 构建脚本（如 `esbuild` 配置或 `scripts/build-templates.ts`）— 内联 .md 文件 | op-005 |

#### 自测要点

- 模板文件内容与原 `AGENT_DEFINITIONS` 常量一致（除纪律强化段落为新增）
- feel.md 中「日志记录纪律」段落存在且语义明确
- executor.md 中「自测报告」要求明确文件路径和格式
- 构建时内联脚本正常运行，`npm run build` 后模板内容嵌入编译产物
- 构建产物中 `template-loader` 函数在 zh-CN 语言下正确返回 8 个 Agent 定义
- 运行 `openfeel update`（在测试项目中）能成功部署 Agent 文件，内容与重构前一致
- 已有测试套件通过（npm test）

#### 关键决策点

> ✅ **已确定：模板加载选型 = 构建时内联方案**（审查 REV-002）
>
> 构建脚本在 `npm run build` 时将 `templates-data/` 下的 .md 文件读取并内联为 TS 字符串常量。优势：
> - 编译产出自包含，消除运行时 `fs.readFileSync` 的跨平台路径解析风险
> - npm 包分发无需额外配置 `package.json` `files` 字段（.md 文件仅供构建时使用）
> - 类似现有 `AUTO-GENERATED-BEGIN/END` 模式，改为自动化脚本生成
>
> 该决策消除了原计划中"模板文件随 npm 包分发"和"运行时文件读取路径解析失败"两项风险（参见风险矩阵 4.4）。

---

### v4.3-stage-02：REV-004 修复（project.ts）

**目标**：修复 v4.2 审计发现的 REV-004 — project.ts 入口路径节增加目录存在性判断。

**优先级**：P0 — 审计修复项

**前置依赖**：无 — 与 stage-01 并行（文件集无交集，参见并行判定依据）

**负责 Agent**：Executor

#### 任务列表

| # | 任务 | 优先级 | 说明 |
|:--:|------|:--:|------|
| op-001 | **REV-004 修复（project.ts）** | low | 在 `src/commands/project.ts` 的 `outputProjectOverview` 函数中，入口路径节（🚪 入口路径）增加目录存在性判断：`src/` 不存在时输出 `（未检测到项目结构）` 而非硬编码路径值。同时在「目录结构」节中，非 OpenFeel 项目目录不存在的节点标注"（未检测到）"或等价提示（当前已有部分存在性检查，需补全一致性） |

#### 产出文件

| 类型 | 文件 | 关联任务 |
|------|------|:--:|
| **修改** | `src/commands/project.ts` | op-001 |

#### 自测要点

- 在非项目目录（无 src/）下运行 `openfeel project overview`，入口路径节显示「（未检测到项目结构）」而非硬编码路径
- npm test 全量测试通过

---

### v4.3-stage-03：英文内容产出 + 双语交互

**目标**：产出英文版 Agent prompt 模板和 AGENTS.md，在 init 和 update 命令中加入语言选择与参数支持，语言配置持久化存储，README 双语化。增加自动化测试覆盖。

**优先级**：P1

**前置依赖**：v4.3-stage-01 (hard) — 英文模板基于 stage-01 创建的中文模板（含纪律强化内容）翻译

**负责 Agent**：Executor

#### 任务列表

| # | 任务 | 说明 |
|:--:|------|------|
| op-001 | **翻译 8 个 Agent prompt 为英文** | 基于 stage-01 产出（已含纪律强化）的 `agents/zh-CN/` 模板，翻译为英文并写入 `agents/en/` 目录。保留 frontmatter 结构，正文英文化。注意：代码标识符、CLI 命令、文件路径保持原样不翻译。关键术语见术语表（第四节） |
| op-002 | **创建英文 AGENTS.md 模板** | 将 `AGENTS_MD_TEMPLATE`（中文）翻译为英文版，写入 `templates-data/agents-md/en.md`。注意：AGENTS.md 中的行为准则语言需对应切换（英文模板→英文行为准则→英文思维） |
| op-003 | **创建英文 core instructions 模板** | 将 `core-instructions/zh-CN.md` 翻译为 `core-instructions/en.md` |
| op-004 | **init 命令双语语言选择** | 修改 `src/commands/init.ts` 和/或 `src/core/init.ts`：在 `initProject` 流程中，用中英双语提示用户选择 Agent 提示词语言（zh-CN / en），选择结果调用 op-005 的语言配置存储写入。非交互环境下默认 zh-CN 并记录提示 |
| op-005 | **语言配置存储（独立 op）** | 修改 `src/core/workspace/identity.ts` 的 `ensureInfoJson` 函数：增加 `lang` 字段支持（`zh-CN` | `en`，默认 `zh-CN`）。**回退逻辑**：读取 `.info.json` → `lang` 字段不存在或为空 → 默认 `zh-CN` → 补充写入。确保向后兼容已有部署项目（原 .info.json 无 lang 字段不会报错） |
| op-006 | **update 命令新增 --lang 参数** | 修改 `src/commands/update.ts`：增加 `--lang <zh-CN|en>` 参数。未指定时读取 `.openfeel/.info.json` 的 `lang` 字段（通过 op-005 的回退逻辑保证总能获得有效值）。update 流程根据语言选择调用模板加载器加载对应模板目录 |
| op-007 | **README.md 双语化** | 在现有中文 README.md 基础上，增加英文段落（或在文件底部增加 English 节）。至少在安装、快速开始、命令参考三节提供双语内容。可选方案：单独创建 `README.en.md` 链接 |
| op-008 | **测试覆盖** | 新增以下测试：① `template-loader` 单元测试 — 验证中文/英文模板加载函数返回正确内容；② `init --lang` 集成测试 — 验证交互选择后 .info.json 正确写入 lang 值；③ `update --lang` 集成测试 — 验证参数正确传递到模板加载器；④ 回退逻辑测试 — 验证 .info.json 无 lang 字段时默认 zh-CN |

#### 产出文件

| 类型 | 文件 | 关联任务 |
|------|------|:--:|
| **新增** | `src/core/templates-data/agents/en/archiver.md` | op-001 |
| **新增** | `src/core/templates-data/agents/en/executor.md` | op-001 |
| **新增** | `src/core/templates-data/agents/en/feel-tester.md` | op-001 |
| **新增** | `src/core/templates-data/agents/en/feel.md` | op-001 |
| **新增** | `src/core/templates-data/agents/en/planner.md` | op-001 |
| **新增** | `src/core/templates-data/agents/en/reviewer.md` | op-001 |
| **新增** | `src/core/templates-data/agents/en/schemer.md` | op-001 |
| **新增** | `src/core/templates-data/agents/en/utility.md` | op-001 |
| **新增** | `src/core/templates-data/agents-md/en.md` | op-002 |
| **新增** | `src/core/templates-data/core-instructions/en.md` | op-003 |
| **修改** | `src/commands/init.ts`（或 `src/core/init.ts`） | op-004 |
| **修改** | `src/core/workspace/identity.ts` — `ensureInfoJson` 增加 lang 字段 + 回退逻辑 | op-005 |
| **修改** | `src/commands/update.ts` — 增加 --lang 参数 | op-006 |
| **修改** | `README.md` | op-007 |
| **新增** | 测试文件（template-loader 单元测试、init/update 集成测试） | op-008 |

#### 自测要点

- `openfeel init` 显示中英双语语言选择提示，选择后 .info.json 写入正确 lang 值
- `openfeel update --lang en` 部署英文版 Agent 文件和 AGENTS.md
- `openfeel update`（无 --lang）读取 .info.json 的 lang 字段决定语言
- .info.json 无 lang 字段时，默认 zh-CN 且不报错（向后兼容验证）
- 已有部署项目 update 时不强制切换语言
- 英文 Agent 模板内容准确、语义与中文版一致
- README.md 包含中英双语内容
- npm test 全量测试通过（含新增测试用例）

---

## 四、技术要点与风险

### 4.1 模板加载：构建时内联方案

**最终选型**：构建时内联（审查 REV-002 确认）

构建脚本在 `npm run build` 时按以下流程将 .md 模板文件内联为 TS 字符串常量：

```
templates-data/agents/{lang}/*.md  ──读取──▶  构建脚本  ──生成──▶  src/core/template-data.ts（TS 常量）
templates-data/agents-md/{lang}.md ──读取──▶              ──生成──▶  （类似现有 AUTO-GENERATED-BEGIN 模式）
templates-data/core-instructions/{lang}.md ──读取──▶
```

`template-loader.ts` 从内联常量（而非运行时 fs）中按 lang + key 返回模板内容。

**优势**：
- 编译产出自包含，无运行时文件读取依赖
- npm 包分发无需配置 `package.json` `files` 字段（.md 仅供构建时使用）
- 消除跨平台路径解析（`__dirname` vs `import.meta.url`）风险
- 模板修改后需 `npm run build` 重新编译方可生效（模板不频繁变更，可接受）

### 4.2 模板文件与部署文件同步

重构后存在三层文件关系：
1. **模板源文件**：`src/core/templates-data/agents/{lang}/*.md`（唯一真相源）
2. **编译产物**：构建脚本内联为 TS 常量，编译到 JS bundle
3. **部署目标**：用户项目的 `.opencode/agents/*.md`（由 `openfeel update` 写入）

OpenFeel 自身的 `.opencode/agents/*.md` 是特殊存在 — 既是模板源（间接，通过 templates-data/ 同步）也是部署目标。**同步机制**：stage-01 的 op-007/op-008 确保模板修改后立即同步到 `.opencode/agents/`，后续若手动修改 `.opencode/agents/` 也应反向同步到 `templates-data/` 源文件。由 Executor 在实施时自行判断同步方向。

### 4.3 英文翻译的术语一致性

8 个 Agent prompt 中存在大量 OpenFeel 专有术语，需统一英文术语表：

| Agent ID | 中文 | 建议英文 |
|----------|------|----------|
| `feel` | 总统领 | Orchestrator |
| `planner` | 计划官 | Planner |
| `schemer` | 方案官 | Schemer |
| `executor` | 执行官 | Executor |
| `reviewer` | 审查官 | Reviewer |
| `feel-tester` | 测试官 | Tester |
| `archiver` | 归档官 | Archiver |
| `utility` | 事务官 | Utility Agent |

> **REV-004 修复**：原术语表 "Commander" 语气过重（军事化），改为 "Orchestrator"（编排者）。新增 Agent ID 映射列以便翻译时精确定位。

### 4.4 风险矩阵

| 风险 | 概率 | 影响 | 缓解 |
|------|:--:|:--:|------|
| 构建时内联脚本在 esbuild/tsup 等不同打包工具下行为不一致 | 低 | 高 — 编译产物缺少模板内容 | stage-01 自测含 `npm run build` 后验证产物中包含模板字符串 |
| 英文 prompt 翻译后语义偏差 | 低 | 中 — 英文用户体验下降 | stage-03 自测含中英内容逐段比对 |
| 向后兼容破坏（已有项目 update 被强制切语言） | 低 | 中 | op-005 回退逻辑：.info.json 无 lang → 默认 zh-CN，不报错 |
| .opencode/agents/ 与 templates-data/ 模板源不同步 | 低 | 低 — 仅影响 OpenFeel 自身 Agent 行为 | stage-01 op-007/op-008 显式同步；后续可在 CI 中增加一致性检查 |

> **REV-008**：原风险矩阵中「模板文件化后 npm 包分发遗漏 .md 文件」（概率 中）和「运行时文件读取在打包后路径解析失败」（概率 中）两项已在构建时内联方案下消除，从矩阵中移除。

---

## 五、质量指标

| 指标 | 目标值 | 验证方式 |
|------|--------|----------|
| 模板重构后 Agent 功能无回归 | 100% 一致 | 对比重构前后 `openfeel update` 产出 diff |
| 日志记录纪律硬化 | feel.md 显式要求 | 审查 |
| 自测报告完整性 | executor.md 显式路径和格式 | 审查 |
| REV-004 修复 | project overview 无目录时正确标注 | 手动测试 |
| 语言配置存储 + 回退逻辑 | .info.json 无 lang → 默认 zh-CN | 单元测试 + 集成测试 |
| 英文模板完整性 | 8 Agent + AGENTS.md + core-instructions | 审查 |
| 双语 init 流程 | 交互式选择 → .info.json 持久化 | 集成测试 |
| update --lang 参数 | 命令行解析 + 模板选择正确 | 集成测试 |
| 构建时内联正确性 | build 产物包含全部模板内容 | 单元测试 (op-008) |
| 测试回归 | npm test 全部通过 | 自动化测试 |
| README 双语化 | 含中英双语文档 | 审查 |

---

## 六、附录：文件变更汇总

| 阶段 | 新增 | 修改 | 合计 |
|------|:--:|:--:|:--:|
| stage-01 | ~12 | 5 | ~17 |
| stage-02 | 0 | 1 | 1 |
| stage-03 | ~10 | 4 | ~14 |
| **合计** | **~22** | **10** | **~32** |

### 涉及模块

| 模块 | 文件 |
|------|------|
| Agent 定义 | `.opencode/agents/feel.md`, `executor.md` |
| 模板文件（新） | `src/core/templates-data/agents/{zh-CN,en}/*.md` (16 files) |
| 模板文件（新） | `src/core/templates-data/agents-md/{zh-CN,en}.md` |
| 模板文件（新） | `src/core/templates-data/core-instructions/{zh-CN,en}.md` |
| 模板加载（新） | `src/core/template-loader.ts` |
| 核心逻辑 | `src/core/update.ts`, `src/core/templates.ts`, `src/core/init.ts` |
| CLI 命令 | `src/commands/init.ts`, `src/commands/update.ts`, `src/commands/project.ts` |
| 工作区 | `src/core/workspace/identity.ts` |
| 文档 | `README.md` |
| 测试（新） | template-loader 单元测试、init/update 集成测试 |

---

## 七、修订记录

| REV | 优先级 | 处理结果 |
|-----|:--:|------|
| REV-001 | high | ✅ 阶段重排：stage-02 纪律强化融入 stage-01 的 op-002，stage-02 缩减为仅 project.ts 修复，两阶段改为并行 |
| REV-002 | high | ✅ 模板加载选型明确为构建时内联方案，移除"由 Schemer 确认"推迟决策 |
| REV-003 | medium | ✅ 自动降级：构建时内联消除 npm 分发问题，风险矩阵中移除相关条目 |
| REV-004 | — | ✅ 术语表：Commander → Orchestrator，新增 Agent ID 映射列 |
| REV-005 | — | ✅ op-005（语言配置存储）明确回退逻辑：无 lang → 默认 zh-CN + 补充写入 |
| REV-006 | medium | ✅ B2（语言配置存储）拆为独立 op-005；新增 op-008 测试覆盖目标（单元 + 集成） |
| REV-007 | — | ✅ op-007/op-008 明确 .opencode/agents/ 与 templates-data/ 同步机制 |
| REV-008 | — | ✅ 风险矩阵更新：移除已消除的 2 项，调整剩余概率 |
