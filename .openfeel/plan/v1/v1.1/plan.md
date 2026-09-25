# OpenFeel v1.1 — 部署通用化与并发安全架构改造

> **版本**：v1.1.0 | **创建日期**：2026-09-12 | **Planner**：独立 Planner（推理模型）
> **规模判定**：架构级（跨模块——init/update 部署管线、模板双层源、命名体系、文件系统写入一致性、CLI 命令层、测试断言、模板/规则全量）
> **定位**：框架资产（agent / skill / 框架级约束）从「项目内嵌」升级为「全局安装 + 项目覆盖」，并补齐多进程并发安全基础设施。这是自 v1.0 正式版以来最大的一次架构改造。

---

## 一、知识库参考

| 条目 | 路径 | 相关性 |
|------|------|--------|
| 双层模板源发散 | kb/troubleshooting.md #双层模板源发散 | **直接命中**。stage-36 的首要收敛对象，本改造必须根治该历史遗留 |
| 多语言模板数据管线 | kb/architecture.md #多语言模板数据管线 | **高度相关**。收敛后单一源的构建注入管线设计依据 |
| 构建脚本多语言循环生成模式 | kb/patterns.md #构建脚本多语言循环生成模式 | 必须遵循。build.js 语言循环注入结构 |
| 新增 Agent 全链路更新清单模式 | kb/patterns.md #新增 Agent 全链路更新清单模式 | **高度相关**。重命名 agent 时须比照的 9 项全链路清单 |
| update 增量部署哈希追踪 + 冲突标记三态模式 | kb/patterns.md #update 增量部署哈希追踪 + 冲突标记三态模式 | **高度相关**。stage-38 控制区标记要替换/演进的现有三态机制 |
| update_state.json 降级风险排查 | kb/troubleshooting.md #update_state.json 降级风险排查 | **直接命中**。stage-39 update_state 拆分迁移的坑位依据 |
| 部署传播内容哈希比对模式 | kb/patterns.md #部署传播内容哈希比对模式 | 参考。全局部署传播判定复用 |
| 全局跨项目用户画像 YAML 配置模式 | kb/patterns.md #全局跨项目用户画像 YAML 配置模式 | **高度相关**。`~/.config/openfeel/` 全局路径约定，全局 opencode 路径设计比照 |
| CLI 原子管理模式 | kb/patterns.md #CLI 原子管理模式 | 参考。stage-35 并发安全的既有约束基线 |
| 手动 edit status.md 频繁失败 | kb/troubleshooting.md #手动 edit status.md 频繁失败 | **高度相关**。status.md 并发写入的已知痛点 |
| 版本号语义管理与递增规范模式 | kb/patterns.md #版本号语义管理与递增规范模式 | 参考。stage-39 版本 1.1.0 全链路同步 |
| kb 条目与规则升级同步时点模式 | kb/patterns.md #kb 条目与规则升级同步时点模式 | 必须遵循。规则在 exec 实施、kb 在 archiving 同步 |
| WORKSPACE_DIRS 同步模式 | kb/patterns.md #WORKSPACE_DIRS 同步模式 | 参考。若新增 `.openfeel/` 子目录须同步 |
| 跨平台行尾归一化模式 | kb/patterns.md #跨平台行尾归一化模式 | 必须遵循。哈希比对与标记识别须归一化 CRLF |

> ⚠️ 执行任务前，若知识库中有相关条目，务必参考。重复踩过的坑不可再犯。

---

## 二、背景与动机

当前 OpenFeel 将框架全部资产（9 个 agent 定义、14 个 skill、core 约束、AGENTS.md、opencode.jsonc）**逐项目部署**到每个项目的 `.opencode/` 与项目根目录。这带来三类结构性问题：

1. **升级成本高**：每个项目都要单独 `openfeel update`，框架改进无法一次惠及全部项目。
2. **模板源分叉**：仓库根 `.opencode/` 与 `src/core/templates-data/` 双轨并存，已实际发散（4 个 skill + zh 3 个 agent / en 1 个 agent 内容不一致，见调研结论），`build.js` 部分源仍指向仓库 `.opencode/`。
3. **无并发保护**：多进程同时写 `flow.json` / 公共日志 / `status.md` 时存在竞态，当前无任何跨进程锁，序号分配（公共日志 NNN、op-NNN）用 `max+1` 存在重复风险；`flow.json` 的 `.bak` 机制实际不保留上一版本。

本改造（v1.1.0）一次性解决上述问题：**资产全局化 + 模板单源化 + 命名统一化 + 写入安全化 + 更新增量控制区化**。

### 调研确认事实（已核实）

| 项 | 结论 |
|----|------|
| 全局配置 | `~/.config/opencode/opencode.jsonc`（JSON/JSONC），与项目配置**深度合并，项目覆盖全局**；`instructions` 数组经验证为**拼接 + 去重（非替换）**，见 P2 / REV-001 |
| 全局 agent | `~/.config/opencode/agents/<name>.md`（复数，单数兼容） |
| 全局 skill | `~/.config/opencode/skills/<name>/SKILL.md`（自动发现，无需 config 字段声明） |
| 全局规则 | `~/.config/opencode/AGENTS.md`（全局规则；项目 AGENTS.md 优先级更高） |
| `skills` 配置字段 | 现行 schema = `{ paths: string[], urls: string[] }` 且 `additionalProperties: false`；**当前 `{ "name": "path" }` 映射非法**，须修正 |
| `claude/`、`kilo/` | 仅 `ADAPTER.md` 占位 stub（「预留适配器目录 → 等待实现」），无 agent/skill 模板，**本次改造不涉及** |
| 全局环境现状 | `~/.config/opencode/opencode.jsonc` 已存在（内容仅 `$schema`）；`~/.openfeel/config.json`、`~/.config/openfeel/profile.yaml` 已存在 |

---

## 三、已确认决策（来自用户，不可推翻）

### D1：部署架构全量通用化

- 框架 + 框架级约束 + 通用 agent/skill → 全局 `~/.config/opencode/`
- 项目目录只保留：`.openfeel/` 工作区 + 项目级约束（`AGENTS.md`）+ 项目级 opencode 配置覆盖（模型 / 语言）

### D2：统一命名前缀

- `feel` agent **保持原名**（唯一例外：primary agent / `default_agent`）
- 其余 8 agent 加前缀：`openfeel-planner` / `openfeel-schemer` / `openfeel-executor` / `openfeel-reviewer` / `openfeel-feel-tester` / `openfeel-utility` / `openfeel-vision` / `openfeel-archiver`
- 全部 14 skill 加前缀：`openfeel-agent-model-check` / `openfeel-bug-acceptance` / `openfeel-check-kb` / `openfeel-get-bugs` / `openfeel-get-stage-status` / `openfeel-health` / `openfeel-model-check` / `openfeel-model-config` / `openfeel-recover` / `openfeel-roadmap` / `openfeel-search-kb` / `openfeel-sync-status` / `openfeel-update-stage-status` / `openfeel-wizard`
- `/opfx:` 命名空间（feel.md 中列出，与实际 skill 目录已脱节）→ 统一改为 `openfeel-` 前缀

### D3：增量更新 + 控制区标记

- 用控制区标记包裹受管内容，更新只覆盖区内，区外用户内容保留
- 标记方案：Markdown `<!-- openfeel:begin -->` … `<!-- openfeel:end -->`；frontmatter 无标记、结构化字段合并；JSONC 无标记、解析→深度合并→序列化；纯文本（`.gitignore`）`# openfeel:begin` … `# openfeel:end`
- 部署三态：不存在 → 直接写入；存在且无标记 → 增量追加到末尾并记录 `~/.openfeel/update_infos.md`；存在且含标记 → 只覆盖区内
- 新增约束：会话启动时检查 `~/.openfeel/update_infos.md` 并修复冲突，完成后提醒用户重启会话

### D4：并发竞态保护（基础设施 + 高风险全覆盖）

1. 统一原子写工具（唯一名 temp + rename，替换裸 `writeFileSync`）
2. 跨进程文件锁（lockfile + 指数退避重试）
3. 序号分配原子化（`O_EXCL` 独占创建，冲突重试）
4. 覆盖高风险文件：`flow.json`(+tmp/bak)、公共日志（条目 + `log.md`/`index.md`/`day_index.md`）、`status.md`、`update_state.json`、`~/.config/openfeel/profile.yaml`、`~/.openfeel/config.json`、`op-scheme` 文件、`kb/index.md`

---

## 四、Planner 新增决策（超出 D1~D4，供审查确认）

| # | 决策 | 理由 |
|---|------|------|
| **P1** | **阶段数定为 5 个**（stage-35 ~ stage-39），在用户初步设想 4 个基础上，将「存量迁移」从 stage-37 拆出为独立 stage-39 | 全局部署改造（37）本身已很大（init/update/config/identity/命令层重写）；存量迁移涉及备份、状态拆分、旧文件清理、回滚，风险独立且需独立审查，不宜与部署改造混在一起 |
| **P2**（REV-001 修订，原属「已确认决策」现明确为 Planner 决策） | **框架级约束全局落地用 `instructions` 机制，且采用「对合并语义不敏感」的稳健设计**：<br>① 全局 `opencode.jsonc` → `instructions: ["~/.config/opencode/openfeel/core.md"]`；<br>② 项目 `opencode.jsonc` **完全不写 `instructions` 字段**（继承全局）；<br>③ 项目级约束仍走项目 `AGENTS.md`（opencode 约定自动加载，无需列入 `instructions`）；<br>④ **不**直接写 `~/.config/opencode/AGENTS.md` | **已验证**（REV-001）：opencode 源码 `packages/opencode/src/config/config.ts` 的 `mergeConfigConcatArrays()` 对 `instructions` 显式执行 `Array.from(new Set([...target.instructions, ...source.instructions]))`，即全局/项目两级 `instructions` 为**拼接 + 去重而非替换**，原「始终合并」假设成立。但该行为未在官方文档明示，为免未来版本变更破坏框架约束，仍采用稳健设计：项目侧不声明 `instructions`，则无论合并语义是拼接还是替换，全局框架约束都不会丢失。**依赖 stage-37 op-000 实测确认** |
| **P3** | **模板单一源 = `templates-data/`**；仓库根 `.opencode/` 降级为「构建产物 + 自举部署实例」，**禁止**再作为源；`build.js` 所有源路径改指 `templates-data/` | 根治双层源发散。仓库 `.opencode/` 是当前 build.js 步骤 4（`SKILL_DEFINITIONS`）的源，必须改向，否则重命名后仍会从旧目录取内容 |
| **P4** | **update_state 按「全局 / 项目」拆分**：`~/.openfeel/update_state.json`（全局框架资产）+ `.openfeel/update_state.json`（项目级资产 AGENTS.md / opencode.jsonc） | 全局资产由全局状态跟踪，项目级资产由项目状态跟踪，避免跨项目哈希互相污染 |
| **P5** | **agent 名重命名对存量数据采用「读取兼容 + 写入新名」**：`mapPhaseToAgent` 返回新名；读取时旧名（`planner`→`openfeel-planner`）自动归一化，**不强制**迁移 `flow.json` 内历史 `assignee` | 降低迁移破坏面；历史日志/assignee 保留可读 |
| **P6** | **提供独立 `openfeel migrate` 命令**（`--dry-run` + 备份 + 回滚），`openfeel update` 检测到 legacy 布局时**提示**而非静默迁移 | 迁移是不可逆高风险操作，须显式触发 + 可预览 + 可回滚 |
| **P7** | **本阶段（stage-35）与后续阶段均不修改 `flow.json`**；阶段注册由 Feel 执行 `openfeel plan stage add` | 遵循 Planner 职责边界 |
| **P8** | **版本号在 stage-39 统一升至 1.1.0**（`package.json` + `.openfeel/config.yaml` + `config.ts` 模板常量 + AGENTS.md），此前各 stage 不单独发版 | 遵循版本号三处同步规范，一次性收口 |

---

## 五、阶段概览

| 阶段 | 名称 | 定位 | 优先级 | 依赖 | 预估规模 |
|------|------|------|:--:|------|:--:|
| [stage-35](#stage-35并发保护基础设施) | 并发保护基础设施 | 原子写 + 跨进程锁 + 序号原子化 + 高风险写入接入 | P0 | 无 | 3 新增 + ~10 修改 |
| [stage-36](#stage-36模板源收敛--命名前缀统一) | 模板源收敛 + 命名前缀统一 | 双层模板源收敛为单源；8 agent + 14 skill 加前缀；`/opfx:` 统一 | P0 | soft: stage-35 | ~40 文件（多为重命名） |
| [stage-37](#stage-37全局部署架构) | 全局部署架构 | init/update 部署到 `~/.config/opencode/`；项目精简；opencode.jsonc schema 修正 | P0 | hard: stage-36 | ~15 源码 + 模板 |
| [stage-38](#stage-38控制区标记--增量更新) | 控制区标记 + 增量更新 | 控制区标记；`update_infos.md`；会话启动修复规则 | P1 | hard: stage-37 | ~8 文件 |
| [stage-39](#stage-39存量迁移与兼容收尾) | 存量迁移与兼容收尾 | `openfeel migrate`；update_state 拆分；文档/版本/全量回归 | P0 | hard: stage-37；soft: stage-38 | ~12 文件 |
| [stage-40](#stage-40模型配置接口) | 模型配置接口 | CLI `openfeel model` + 内部 API 改「工具默认/全局/项目」三层级 agent 模型 | P1 | hard: stage-37（前置 stage-36） | 待定（stage-40 新增，待细化） |

### 依赖图

```
stage-35（并发保护）  ── soft ──→  stage-36（收敛 + 重命名）
                                      │
                                   hard
                                      ▼
                                stage-37（全局部署）
                                   │        │        │
                                 hard      hard      hard
                                   ▼        ▼        ▼
                            stage-38  stage-39  stage-40
                          （控制区标记）│（迁移 + 收尾）（模型配置接口）
                                   └──soft──┘
```

> 说明：stage-35 与 stage-36 无硬依赖，但**建议顺序执行**（36 会重命名并重写大量文件，先完成 35 可避免后续对同一批写入点二次改动）。stage-38 与 stage-39 之间存在 **soft 依赖（REV-010 统一：stage-39 为 hard: stage-37；soft: stage-38）**——migrate 复用标记感知的合并逻辑，故 39 排最后。stage-40 为 **hard: stage-37**（依赖全局部署结构就绪）+ 前置 stage-36（agent `openfeel-` 前缀），与 stage-38/39 并列，排最后（P1，用户新需求追加）。

---

## stage-35：并发保护基础设施

> **硬性前置**：无。本阶段独立、低耦合，为后续所有写入改造提供统一底座。
> **详细计划**：见 `.openfeel/plan/v1/stage-35/plan.md`（本阶段已展开）。

### 任务清单（op 级）

| op | 主题 | 涉及文件 |
|----|------|----------|
| op-001 | 统一原子写工具 | NEW `src/core/fs/atomic-write.ts` + NEW test |
| op-002 | 跨进程文件锁 | NEW `src/core/fs/file-lock.ts` + NEW test |
| op-003 | 序号分配原子化 | NEW `src/core/fs/sequence.ts` + NEW test |
| op-004 | 高风险写入接入 | `flow-manager.ts`、`public-logger.ts`、`plan/stage.ts`、`plan/scheme.ts`、`update-state.ts`、`config.ts`、`workspace/identity.ts`、`workspace/knowledge.ts`、`archive/merge.ts`、`metrics.ts` + 相关测试（含 flow.json 乐观并发校验，乐观并发修订） |

### 完成标准

- 三个 fs 工具模块均有独立单元测试；并发场景测试（并行多进程写）验证无丢失更新、无重复序号
- **并发写不损坏文件、不产生交错；并发 load-modify-save 通过乐观并发校验显式报错而非静默覆盖（无静默丢失更新）（乐观并发修订）**
- `flow.json` 的 `.bak` 真正保留**上一版本**（写前复制，不再被新内容覆盖）
- 高风险写入点全部走原子写；共享写点（flow.json、公共日志、status.md）走文件锁
- **所有写 `flow.json` 的代码路径（`save` / `restoreCheckpoint` / `initFlow`）均经审计并标注是否接入保护及理由；`restoreCheckpoint` 已接入 `withFileLock` + `atomicWriteFileSync`，`.bak` 语义与 S5 一致（REV-002）**
- `npm test` 全绿（425 + 新增）

---

## stage-36：模板源收敛 + 命名前缀统一

> **硬性前置**：无（soft: stage-35）。**本阶段是 D2 全量落地**，也是 stage-37 的名称前提。

### 任务清单（op 级）

| op | 主题 | 说明 |
|----|------|------|
| op-001 | 双层模板源收敛 | 单一源定为 `templates-data/`。合并 `templates-data/agents/{lang}` 与 `templates-data/opencode/agents/{lang}`（保留一份，消除 4 个内容发散）；合并仓库 `.opencode/skills` 与 `templates-data/opencode/skills`（消除 4 个发散）。`build.js` 全部源路径改指 `templates-data/`；仓库 `.opencode/` 降级为构建产物/自举实例。**双层 skill 源合并策略（REV-005）**：`templates-data/opencode/skills/` 为**唯一权威源**，仓库 `.opencode/skills/` 为**构建产物**（由 build 从权威源生成，禁止手工编辑）。build.js 步骤 4（`SKILLS_DIR` → `SKILL_DEFINITIONS`，注入 `update.ts`）与步骤 6（`TEMPLATE_OPENCODE_SKILLS_DIR` → `OPENCODE_SKILL_DEFINITIONS`，注入 `template-loader.ts`）**保持为两个独立注入对象**（消费方不同：update 命令 vs init/template-loader），但**均改从唯一权威源读取**，并在 build 校验中新增「两对象键集与内容一致」断言；步骤 7 的 skills 列表同样以权威源为准 |
| op-002 | agent 重命名 | 8 个 agent 加 `openfeel-` 前缀（feel 保留）；同步 frontmatter、`mapPhaseToAgent`、`loadAgentTemplate`/`listAgentIds`、`template-loader` 注入块、build.js |
| op-003 | skill 重命名 + `/opfx:` 统一 | 14 个 skill 目录加前缀；`SKILL_DEFINITIONS` 键、`NEW_SKILL_NAMES`、init/update 部署路径、feel.md 中 `/opfx:*` 全部改为 `openfeel-*` |
| op-004 | 部署实例与构建产物重生成 + 测试 | `npm run build` 重生成 `template-loader.ts` / `update.ts` 生成段；重生成仓库 `.opencode/` 自举实例；更新硬编码名称的测试断言 |

### 涉及文件（关键）

- 模板源：`src/core/templates-data/agents/**`、`src/core/templates-data/opencode/{agents,skills}/**`、`agents-md`、`core-instructions`
- 构建：`build.js`、`src/core/template-loader.ts`（生成段）、`src/core/update.ts`（`SKILL_DEFINITIONS` 生成段 + `NEW_SKILL_NAMES`）
- 源码：`src/core/init.ts`、`src/core/flow-manager.ts`、`src/core/template-loader.ts`
- 部署实例：`.opencode/agents/*`、`.opencode/skills/*`
- 测试：`test/core/template-loader.test.ts`、`test/core/update.test.ts`、`test/core/init.test.ts`

### 完成标准

- `templates-data/` 为唯一模板源，仓库内不再存在同名双份发散文件
- 所有 agent（feel 除外）与 skill 名带 `openfeel-` 前缀；全库 grep 无旧名残留（`/opfx:` 亦清零）
- **build.js 步骤 4 与步骤 6 均从 `templates-data/opencode/skills/` 单一权威源读取；`SKILL_DEFINITIONS` 与 `OPENCODE_SKILL_DEFINITIONS` 键集与内容一致（REV-005）**
- `npm run build` 一致性校验全通过；`npm test` 全绿

### 风险

- **运行中会话自举风险**：重命名会改变本仓库正在使用的 agent 名，须在 stage 收尾重启 opencode。
- **测试断言大范围改动**：约数十处硬编码名称/路径断言，需系统性排查（见测试策略）。

---

## stage-37：全局部署架构

> **硬性前置**：stage-36（名称与单源定型）。**本阶段是 D1 落地**。

### 任务清单（op 级）

| op | 主题 | 说明 |
|----|------|------|
| op-000 | instructions 合并语义前置验证（REV-001） | **须在 op-004 前执行**。在隔离 HOME 下构造「全局 + 项目两级 `opencode.jsonc` 均含 `instructions`」场景，实测 opencode 解析后的最终 `instructions`（`opencode debug config` 或等价方式），确认全局条目是否被项目配置保留。源码证据预期为**拼接+去重**；无论结果如何，均按 P2 稳健设计落地（项目侧不写 `instructions`）。结论回填 P2 并作为 op-004 定稿依据 |
| op-001 | 全局路径模块 | NEW `src/core/global-paths.ts`：集中解析 `~/.config/opencode/{agents,skills}`、全局 `opencode.jsonc`、全局框架约束文件、`~/.openfeel/update_state.json`、`~/.openfeel/update_infos.md` |
| op-002 | init 改造 | `deployOpencode` → 全局部署：agent/skill/框架约束写入 `~/.config/opencode/`；项目仅生成 `.openfeel/` + 项目 `AGENTS.md` + 项目 `opencode.jsonc`（模型/语言覆盖，**不写 `instructions`**） |
| op-003 | update 改造 + schema/URL 修正 | `updateProject` 部署目标改全局；全局 `opencode.jsonc` 采用「解析→深度合并→序列化」；**修正 `skills` 字段 schema**（移除非法 `{name:path}` 映射，依赖自动发现或 `{paths:[]}`）；项目 `opencode.jsonc` 仅保留模型/语言（**不写 `instructions`**）；**修正 `$schema` URL 拼写**（`src/core/update.ts` L1362/L1516：`https://opencode.openfeel/config.json` → `https://opencode.ai/config.json`，REV-008）；**确认并处置模板 `experimental.agent_manager_tool`**（现行 `https://opencode.ai/config.json` schema 未定义该字段，REV-004）——按「保留（若运行时仍识别）/ 更名 / 移除」三选一处理并记录依据 |
| op-004 | 全局框架约束落地（P2） | 框架 core 约束部署到 `~/.config/opencode/openfeel/core.md`，并在全局 `opencode.jsonc` 的 `instructions` 引用（`["~/.config/opencode/openfeel/core.md"]`）；项目 `AGENTS.md` 仅项目级约束。**依赖 op-000 的合并语义实测结论** |
| op-005 | 测试改造 | init/update 测试改为隔离临时 HOME（`HOME`/`USERPROFILE` 指向 tmp），断言全局路径；新增 opencode.jsonc schema 校验测试；新增「项目配置不写 `instructions`」断言 |

### 涉及文件（关键）

- NEW `src/core/global-paths.ts`
- `src/core/init.ts`（`deployOpencode`、`initProject`）
- `src/core/update.ts`（`updateProject`、`buildUpdatedJsonc`、`replaceSkillsFieldInJsonc`、`getIncomingContent`）
- `src/core/update-state.ts`、`src/core/workspace/identity.ts`、`src/core/config.ts`
- `src/core/templates-data/opencode/opencode.jsonc`（模板）
- `test/core/init.test.ts`、`test/commands/init.test.ts`、`test/core/update.test.ts`

### 完成标准

- 全新 `openfeel init` 后：全局 `~/.config/opencode/` 出现 agents/skills/core；项目目录仅 `.openfeel/` + `AGENTS.md` + `opencode.jsonc`
- `openfeel update` 幂等；全局 `opencode.jsonc` 合并保留用户自定义字段
- 全局 `opencode.jsonc` 的 `skills` 字段符合现行 schema（不再出现 `{name:path}`）
- **`instructions` 合并语义已由 op-000 实测确认；项目 `opencode.jsonc` 不写 `instructions` 字段，全局框架约束在任何合并语义下均不丢失（REV-001）**
- **模板 `experimental.agent_manager_tool` 已按现行 schema 处置（保留/更名/移除，含依据记录）（REV-004）；`update.ts` 的 `$schema` URL 已修正为 `https://opencode.ai/config.json`（REV-008）**
- 测试全部在隔离 HOME 下运行，不污染开发者真实全局配置

### 风险

- **真实全局配置被误写**：测试必须隔离 HOME；部署前对全局文件做备份。
- **配置合并语义**：opencode 全局/项目配置深度合并。**源码已证 `instructions` 为拼接+去重（REV-001）**，但为防未来变更仍采用稳健设计（项目不写 `instructions`），并由 op-000 实测兜底，避免项目配置意外清空全局 `instructions`。

---

## stage-38：控制区标记 + 增量更新

> **硬性前置**：stage-37（全局部署目标定型）。**本阶段是 D3 落地**。

### 任务清单（op 级）

| op | 主题 | 说明 |
|----|------|------|
| op-001 | 控制区标记工具 | NEW `src/core/managed-region.ts`：按文件类型识别/包裹/替换受管区（Markdown 注释标记、纯文本 `#` 标记、frontmatter 结构化合并、JSONC 深度合并） |
| op-002 | 部署三态接入 | 更新部署逻辑：不存在→写入；无标记→末尾追加 + 记录 `update_infos.md`；含标记→只覆盖区内 |
| op-003 | `update_infos.md` + 会话启动修复规则 | `~/.openfeel/update_infos.md` 读写；在全局框架约束与 feel.md 中新增「会话启动检查并修复、完成后提醒重启」约束 |
| op-004 | 测试 | 标记识别/替换、三态合并、update_infos 记录与清理的单元测试 |

### 完成标准

- 四类文件的标记/合并行为均有测试覆盖
- 对「用户已修改且无标记」的文件，更新**只追加不覆盖**，并写入 `update_infos.md`
- 会话启动修复约束在框架约束与 feel.md 中落地（zh-CN + en 双语同步）

---

## stage-39：存量迁移与兼容收尾

> **硬性前置**：stage-37；**软前置**：stage-38（migrate 复用控制区标记的合并逻辑）。

### 任务清单（op 级）

| op | 主题 | 说明 |
|----|------|------|
| op-001 | `openfeel migrate` 命令 | 检测 legacy 布局（项目 `.opencode/agents|skills|instructions`、旧 `opencode.jsonc` skills 映射、旧 `update_state.json`）→ 备份 → 全局部署 → 状态拆分/重键 → 清理 legacy 项目文件 → 重映射 `flow.json` assignee；支持 `--dry-run` 与回滚。**项目自定义资产保留（REV-007）**：清理项目 `.opencode/agents` / `.opencode/skills` 前逐项比对框架清单，**仅删除与框架资产同名/同源的条目**；非框架资产（项目自定义 agent/skill）标记为「项目自定义」并**保留原位**（不迁移、不删除），在 `--dry-run` 报告中单列 |
| op-002 | 存量读取兼容（P5） | `mapPhaseToAgent` 返回新名；读取旧 assignee 时归一化；`update_state` 旧格式加载降级兼容 |
| op-003 | 文档 + 版本 1.1.0 | 更新 `docs/`、`CHANGELOG.md`、`README*`、`.openfeel/kb/` 引用；版本三处同步（`package.json`、`config.yaml`、`config.ts` 模板常量）+ AGENTS.md |
| op-004 | 全量回归 | `npm run build && npm test` 全绿；lint i18n / kb 零错误 |

### 完成标准

- `openfeel migrate --dry-run` 可在 legacy 样例项目上输出完整迁移计划；实际执行后可回滚
- 存量项目迁移后，`openfeel flow status` / `update` / 流水线推进功能不回归
- 版本号三处一致为 `1.1.0`；测试全绿

---

## stage-40：模型配置接口

> **硬性前置**：stage-37（全局部署结构就绪）；**前置**：stage-36（agent `openfeel-` 前缀）。**定位**：提供 CLI 命令 + 内部 API，快速修改「工具默认 / 全局 / 当前项目」三层级的指定 agent 使用模型，解决「改 agent 模型要手动改多处文件」的痛点。（stage-40 新增，待细化）

### 关键裁定（用户已裁定，不可更改）

- **接口形式**：CLI 命令（`openfeel model set/get/list <agent> <model> [--scope default|global|project]`）+ 内部 API（供 Agent/skill 在模型报错时自动调用）
- **三层级落点**：
  - 「工具默认」= 改框架默认模型源（`templates-data/*/agents/*.md` 的 `model:` frontmatter），影响以后 init/update 部署的默认值
  - 「全局」= `~/.config/opencode/opencode.jsonc` 的 `agent.<name>.model`
  - 「当前项目」= 项目 `opencode.jsonc` 的 `agent.<name>.model`
- **模型名校验**：对照 `~/.local/share/opencode/auth.json` 的 provider key（当前 deepseek/zhipuai/alibaba-cn）

### 任务清单（占位，待细化）

> op 级规划留待推进到本 stage 时再展开。

### 完成标准（占位，待细化）

- CLI 可对三层级指定 agent 完成模型 `set/get/list`；内部 API 可在模型报错时被自动调用；模型名校验对照 auth.json provider key 生效

### 涉及文件（预估）

- CLI 命令层（命令注册）、模型配置读写模块（NEW）、`templates-data/*/agents/*.md` frontmatter、`~/.config/opencode/opencode.jsonc`、项目 `opencode.jsonc`、auth.json provider key 校验

> 与知识库既有「模型配置三级体系」（`config.yaml` 的 default/agents/roles 覆盖，见 kb/architecture.md #模型配置三级体系）**不同域**：本阶段针对 opencode 侧 agent 的 `model` 字段落点（工具默认 / 全局 / 项目），两者分属不同配置域，细化时须明确区分，避免概念混淆（模型名格式遵循 `provider/model-name`，见 kb/setup.md #OpenCode Agent 模型配置）。

---

## 六、兼容性策略（存量项目迁移）

| 存量对象 | 迁移前状态 | 迁移后 | 处理方式 |
|----------|-----------|--------|----------|
| 项目 `.opencode/agents/*.md` | 旧名（`planner.md` 等） | 删除（改由全局提供） | `openfeel migrate` 备份到 `.openfeel/backup/{ts}/` 后清理 |
| 项目 `.opencode/skills/*/SKILL.md` | 旧名 | 删除（改由全局提供） | 同上 |
| 项目 `.opencode/agents` / `.opencode/skills` 中的**项目自定义**资产（非框架） | 项目自有内容 | 保留原位（不迁移、不删除） | migrate 逐项比对框架清单，仅清理与框架同名/同源的条目；非框架条目标记「项目自定义」并在 dry-run 报告中单列（REV-007） |
| 项目 `.opencode/instructions/core.md` | 项目内框架约束 | 删除（改由全局 `~/.config/opencode/openfeel/core.md` 提供） | 同上 |
| 项目 `opencode.jsonc` | 含 `instructions` + 非法 `skills` 映射 | 仅保留模型/语言覆盖 | 迁移时清理，保留用户自定义字段 |
| 项目 `.openfeel/update_state.json` | 混合记录项目 + 框架资产 | 拆分为全局 + 项目两份 | 迁移：框架资产条目移入 `~/.openfeel/update_state.json` 并重键为新路径/新名；项目资产条目保留 |
| `flow.json` 中 `assignee` | 旧名（`planner` 等） | 兼容读取 | 不强制改写；读取归一化（P5） |
| 项目 `AGENTS.md` | 含框架约束 + 项目约束混合 | 仅项目级约束 | 迁移时提示用户手工裁剪（框架约束已全局化），不做自动删改 |
| 已有全局 `~/.config/opencode/opencode.jsonc` | 用户自定义 | 合并框架所需字段 | 部署时深度合并，保留用户字段；冲突项记录到 `update_infos.md` |

> **是否需要 `openfeel migrate` 命令**：**需要**（P6）。理由：旧布局清理不可逆、涉及跨项目全局状态、且需回滚能力。`openfeel update` 检测到 legacy 布局时只**提示**运行 migrate，不静默处理。

---

## 七、测试策略

| 验证点 | 阶段 | 方式 |
|--------|------|------|
| 原子写 / 文件锁 / 序号原子性 | stage-35 | 新增 `fs/*.test.ts`；并发子进程写测试验证无丢失、无重号 |
| flow.json `.bak` 保留上一版本 | stage-35 | 断言连续两次 save 后 `.bak` == 第一次内容 |
| flow.json 乐观并发校验 | stage-35 | 构造 load 后外部修改 flow.json 再 save → 断言抛冲突错误；revision 递增；无 revision 旧文件兼容（乐观并发修订） |
| 模板单源一致 | stage-36 | build 一致性校验（`validateAgentDefinitions` 等）；新增「无双份发散」校验 |
| 名称前缀完整 | stage-36 | 全库 grep 断言无旧名 / `/opfx:`；`listAgentIds` / skill 键断言带前缀 |
| 全局部署路径 | stage-37 | init/update 测试以临时 HOME 运行，断言 `~/.config/opencode/{agents,skills}` 与项目精简 |
| opencode.jsonc schema | stage-37 | 断言 `skills` 字段符合 `{paths,urls}`，无 `{name:path}` |
| instructions 合并语义 | stage-37 | op-000 隔离 HOME 实测全局 + 项目两级 `instructions` 解析结果，确认全局约束保留（REV-001） |
| `agent_manager_tool` / `$schema` | stage-37 | 断言模板不再含 schema 未定义字段（REV-004）；断言 `$schema` == `https://opencode.ai/config.json`（REV-008） |
| 控制区标记 / 三态合并 | stage-38 | `managed-region.test.ts`；无标记文件只追加不覆盖 |
| migrate | stage-39 | 构造 legacy 样例项目 fixture，验证 dry-run / 执行 / 回滚；fixture 含**项目自定义** agent/skill，断言保留原位（REV-007） |
| 全量回归 | stage-39 | `npm run build && npm test`（425 + 新增）；lint i18n / kb |

**现有测试需同步修改的重点**（调研确认）：

- `test/core/update.test.ts`：大量硬编码 `.opencode/agents/planner.md`、`.opencode/skills/check-kb/SKILL.md`、旧 `skills` 映射（L105/115/116 等）→ 改为新名 + 全局路径
- `test/core/template-loader.test.ts`：`feel-tester` 等名称断言
- `test/core/init.test.ts` / `test/commands/init.test.ts`：部署目标断言
- `test/core/plan/scheme.test.ts` / `stage.test.ts`：序号分配相关（接入原子序号后）
- 所有涉及 `.openfeel/update_state.json` 的测试：state 拆分后路径调整

---

## 八、风险点与回滚

| # | 风险 | 影响 | 缓解 |
|---|------|------|------|
| 1 | 全局部署误写开发者真实 `~/.config/opencode/` | 高（污染本机） | 测试隔离 HOME；部署前备份；dry-run 预览 |
| 2 | 重命名破坏运行中会话（自举） | 中 | 阶段收尾重启 opencode；迁移期保留旧名只读兼容 |
| 3 | 配置合并语义不符预期（`instructions` 数组被项目覆盖） | 高 | **源码已验证为拼接+去重（REV-001）**；仍采用稳健设计（项目配置不写 `instructions`），并由 stage-37 op-000 实测确认兜底 |
| 4 | build.js 仍从旧目录取源导致重命名不生效 | 中 | stage-36 强制改源路径 + 新增「单源」校验 |
| 5 | 存量 `update_state.json` 迁移丢记录 → 全量覆盖 | 中 | 迁移重键 + 备份；加载降级兼容（kb troubleshooting 已知坑） |
| 6 | 测试断言大范围改动引入误改 | 中 | 分阶段更新断言 + 全量回归兜底 |
| 7 | 文件锁在 Windows 上语义差异（`O_EXCL`/rename） | 中 | stage-35 跨平台测试；锁超时兜底 |
| 8 | 版本号三处不同步 | 低 | stage-39 统一收口 + 校验 |

**回滚方案**：

- 各 stage 独立提交，可按 stage `git revert`。
- `openfeel migrate` 自带备份目录与回滚子命令；`--dry-run` 先预览。
- 全局部署若出错，从备份目录恢复 `~/.config/opencode/` 与 `~/.openfeel/`。
- 版本号仅在 stage-39 变更，未发布前回滚无外部影响。

---

## 九、里程碑与交付物

| 里程碑 | 阶段 | 交付物 |
|--------|:--:|------|
| M1 写入安全底座 | stage-35 done | 原子写 / 文件锁 / 原子序号三工具 + 高风险接入 |
| M2 模板单源 + 命名统一 | stage-36 done | `templates-data/` 单源；全量 `openfeel-` 前缀 |
| M3 全局部署架构 | stage-37 done | init/update 部署到 `~/.config/opencode/`；项目精简；schema 修正 |
| M4 增量更新可控 | stage-38 done | 控制区标记 + `update_infos.md` + 启动修复规则 |
| M5 存量平滑迁移 | stage-39 done | `openfeel migrate` + 文档 + 1.1.0 |
| **v1.1.0 发布** | 全部 done | `npm publish` 就绪 |

---

## 十、变更汇总

| 类别 | 预估数量 | 说明 |
|------|:--:|------|
| 新增源码 | 5 | `fs/atomic-write.ts`、`fs/file-lock.ts`、`fs/sequence.ts`、`global-paths.ts`、`managed-region.ts` |
| 新增命令 | 2 | `openfeel migrate`、`openfeel model`（stage-40，新增待细化） |
| 新增测试 | 5+ | 对应上述模块 + 并发场景 |
| 修改源码 | ~15 | init / update / update-state / config / identity / flow-manager / public-logger / stage / scheme / knowledge / merge / metrics / cli |
| 重命名文件 | ~22 | 8 agent + 14 skill（模板源 + 部署实例 + 生成段） |
| 模板/规则 | 全量 | agents / skills / core-instructions / agents-md / opencode.jsonc |
| 版本 | 3 处同步 | package.json、config.yaml、config.ts 模板常量（+ AGENTS.md） |

> 本计划引用知识库多条既有条目；改造完成后，须由 Archiver 将「全局部署架构」「控制区标记增量更新」「跨进程并发保护」三条新经验沉淀至 kb/architecture.md 与 kb/patterns.md。
