# 架构决策

> 使用 [+] / [-] 标记管理启用/禁用状态。只能标记禁用不能删除。

## [+] Worktree 并行批次策略 (2026-06-27)

v3.0 采用三批次推进（batch-1/2/3），其核心策略为按文件集冲突域划分并行安全组：

```
Batch 1 (并行)
├─ stage-01: flow.json 鲁棒性    ← flow-manager.ts, pipeline-schema.ts, commands/flow.ts
└─ stage-02: 模型配置落地         ← config.ts, config.yaml, Agent .md 文件

Batch 2 (串行，依赖 stage-01)
└─ stage-03: 效率优化            ← flow-manager.ts, commands/flow.ts + Agent 文件

Batch 3 (串行，依赖 stage-03)
└─ stage-04: 体验补全            ← commands/flow.ts, init.ts, Agent 文件
```

**并行安全判定规则：**
- 两阶段修改文件集无交集 → 可并行（如 batch-1）
- 后阶段依赖前阶段的 API 或数据结构变更 → 必须串行（如 stage-03 依赖 stage-01 的 FlowManager 改造）
- 后阶段依赖前阶段的 Agent prompt 修改 → 必须串行（如 stage-04 依赖 stage-03 的 Agent 文件）

**注意事项：**
- 并行 worktree 合并顺序：先完成的先合并，后完成的 rebase 已合并分支
- 通过 `task_claim.md` 的 🔒 锁定机制检测文件冲突
- 并行阶段完成后各自独立审查，ReviewWorker 复用 `-worker` 后缀的专用子 Agent

## [+] 模型配置三级体系 (2026-06-27)

`config.yaml` `models` 节采用三级覆盖（级联优先级从高到低）：

```
models.agents.{agent_id}   → Agent 级覆盖（最高优先级）
models.roles.{agent_id}    → 按 Agent frontmatter model 字段匹配
models.default             → 默认配置（兜底）
```

每个配置节点包含 `provider`、`model_name`、`base_url`、`api_key_env` 字段。

**设计决策：**
- 实际模型选择由平台层（OpenCode）决定，config.yaml 仅用于 Awareness（让 Agent 知道自己的目标模型类型）
- 首次 `init --demo` 生成 `models.template.yaml` 供新项目复用
- `writeDefaultConfig()` 包含完整 models 节，防止首次读取返回 undefined
- 各 Agent 的 "读取模型配置" 步骤末尾必须注明 "注：实际模型由平台层分配，此处为 Awareness 目的。"

## [+] test_enabled=false 跳过测试链路 (2026-06-27)

当 `config.yaml` 中 `test_enabled=false` 时：
- `review_passed` 状态等价于 `done`，跳过 `ready_for_test → test_writing → testing → bug_found → bug_fixing` 链路
- 自动流程从 `review_passed` 直接切换到 `done`
- v3.0 所有 4 阶段均在此模式下闭环

> [superseded 2026-10-03 / v1.1.4-stage-62] 本条目描述的 `test_enabled=false` 测试分路机制**已移除**：15 相位模型下 **phase 图与 `test_enabled` 无关**（`.openfeel/pipeline.yaml` 的 `review_passed: [test_pending]` 恒定），保留即误导（见 kb/patterns.md #死导出/漂移 API 的清理判据）。该键已从 `ConfigDefaultsSchema` / `DEFAULT_CONFIG` / `EFFECTIVE_CONFIG_KEYS` / `instruction-loader` / 双语言模板全链移除；存量 `config.yaml` 残留行按**非受管扩展键**读侧 passthrough 兼容（不报错、不崩溃），`config set test_enabled …` 报无效键。**后续 phase/status 语义见本文件 #状态/相位单一事实源**：`phase` 为唯一事实源，`status` 为其粗粒度投影，`review_passed` 恒投影 `'review_passed'`（不再等价 `done`）。原文保留以存审计链。

## [+] Flow CLI 严格校验 (2026-06-28)

v3.1 引入的校验规则：
- 非法 phase 值在推进时**拒绝执行**（而非静默修正或警告通过）
- 阶段跳跃（如从 `coding` 跳到 `done`）需 `--force` 参数显式确认
- `flow advance --stage` 参数支持跨阶段同步（Flow↔Stage 联动）
- `flow status --verbose` 输出完整配置摘要（config.yaml 当前值、pipeline.yaml 阶段表、flow.json 当前状态）

## [+] 15→7 Agent 精简体系设计 (2026-07-05)

v0.4.0 将 Agent 从 15 个精简为 7 个，形成职责清晰的层级结构：

```
feel（总统领） → 兼任 Planner
  ├─ planner（计划官）
  ├─ schemer（方案官）
  ├─ executor（执行官） — 合并 code.md（修复）+ code-worker.md（自测）
  ├─ reviewer（审查官） — 合并 architect.md（架构审查）
  ├─ feel-tester（测试官） — 替换 tester.md
  └─ archiver（归档官）
```

**设计原则：**
- 每个 Agent 职责单一，避免越界操作
- 评审和测试角色分离（Reviewer 审查代码、Tester 验收功能）
- Feel 总统领统一调度，通过 `task` 工具按流水线阶段串行推进
- 删除的 9 个 Agent 中：4 个功能被合并（code/architect/code-worker/review-worker）、3 个被替代（tester/debug/test-writer）、2 个职责划归 Feel（ask/auto-runner）

## [+] Feel 调度 + openfeel CLI 推进模型 (2026-07-05)

v0.4.0 废弃旧式"自动闭环"（auto-runner 调度 code-worker/review-worker），统一为 Feel 总统领通过 CLI 推进流水线：

- Feel 读取 `flow.json` 判断当前阶段和 phase
- 通过 `openfeel flow` 命令推进流水线（`status` → `advance` → `repair`）
- 下游 Agent（Planner/Schemer/Executor/Reviewer/Tester/Archiver）仅在自己的职责边界内操作
- 新增 `openfeel flow overview` 命令输出全阶段可视化状态
- 新增 `openfeel flow metrics` 命令追踪 Agent 性能指标
- 新增 `openfeel flow recover` 命令实现跨会话上下文恢复
- 新增 `openfeel stage status/set/task` 命令以原子操作管理 status.md

## [+] 知识库自动化体系：检索 → 去重 → 沉淀 (2026-07-05)

v0.4.0 建立了知识库的「读写闭环」：

- **检索层**：`check-kb` skill 内嵌语义检索（步骤 5 自执行 `python scripts/search_kb.py`），无需再手动调用 `search-kb`
- **去重层**：`kb-dedup.ts` 在归档前执行 Jaccard 词袋相似度计算，相似度 > 80% 时更新而非新增条目
- **沉淀层**：Archiver 在阶段完成后从操作记录中提取可复用经验，自动写入对应 kb/ 分类
- **触发时机**：每个阶段 `test_passed` → `archiving` → 提取经验 → 去重 → 写入 → `done`
- **CLI 入口**：`openfeel flow overview --full` 可查看知识库最近更新摘要

## [+] 多语言模板数据管线：源文件→构建时内联→运行时加载 (2026-07-12)

v0.4.3 建立了支持多语言的模板数据管线，采用「源文件管理 → 构建时内联 → 运行时按语言加载」三层架构：

```
templates-data/                              ← 唯一真相源（人类编辑）
├─ agents/{lang}/*.md        (16 files)      ← Agent prompt 模板
├─ agents-md/{lang}.md       (2 files)       ← AGENTS.md 模板
└─ core-instructions/{lang}.md (2 files)     ← Core instructions 模板
        │
        ▼ 构建时 (build.js)
src/core/template-loader.ts                  ← 编译产物（AUTO-GENERATED）
  AGENT_TEMPLATES: Record<lang, Record<agentId, string>>
        │
        ▼ 运行时
template-loader.ts 导出函数：
  loadAgentTemplate(lang, agentId): string    ← 按语言+AgentID 返回模板
  loadTemplate(lang, name): string            ← 按语言+模板名返回模板
```

**设计决策：**
- 源文件按 `{type}/{lang}/` 两级目录组织，语言为第一级键（支持未来新增语言）
- 构建脚本 (`build.js`) 在 `npm run build` 时遍历语言目录，将所有 .md 文件读取并内联为 TS 字符串常量，写入 `template-loader.ts` 的 `AUTO-GENERATED-BEGIN/END` 块
- 运行时通过 `loadAgentTemplate(lang, agentId)` 按语言键查表返回，无需 fs 读取，消除跨平台路径解析风险
- `getLang()` 函数从 `.info.json` 读取 `lang` 字段，缺失时默认 `zh-CN`，保证向后兼容
- 模板加载器通过 `??` 运算符实现语言回退：`AGENT_TEMPLATES[lang] ?? AGENT_TEMPLATES['zh-CN']`

**优势：**
- 编译产出自包含，npm 包分发无需额外配置（.md 文件仅供构建时使用）
- 语言配置与模板内容完全解耦——新增语言只需添加模板目录+构建脚本注册，无需修改 runtime 代码
- 与 v0.4.1 建立的构建时模板同步机制（templates-data/ → .opencode/agents/）协同工作

**参见：** v0.4.3-stage-01 op-005（模板加载器）、v0.4.3-stage-03 op-001/op-006（多语言扩展）、kb/patterns.md #构建脚本多语言循环生成模式

## [+] i18n 基础设施：TS 常量导入 + 运行时查表模式 (2026-07-14)

与 template-loader 的构建脚本+Base64 内联管线互补，CLI 输出的 i18n 采用更轻量的方案：

```
i18n-data/{lang}.ts                ← 唯一真相源（人类编辑）
  zh-CN.ts (206 entries)           ← 中文映射表
  en.ts    (206 entries)           ← 英文映射表（键结构对称）
  types.ts                         ← I18nEntry / I18nDomain 类型定义
        │
        ▼ 构建时（零脚本——TS 直接 import）
src/core/i18n.ts                   ← 运行时引擎
  t(key, lang?, vars?): string     ← 按键+语言查表+模板插值
  getCliLang(projectPath): string  ← 三级回退解析语言
```

**设计决策：**
- 字符串量可控（每语言 < 250 条），无需构建脚本的 Base64→decode 链路，TS 常量直接导入即可
- 键名采用 `{domain}.{module}.{name}` 层级命名（如 `flow.status.title`），动态字符串用 `Tmpl` 后缀区分
- 源文件按语言分离（zh-CN.ts / en.ts），键结构完全对称，新增语言仅需新增一个文件
- 与 template-loader 共享「运行时按键查表」模式——`t()` 和 `loadAgentTemplate()` 均为同步查表函数
- 全局语言配置路径 `os.homedir()/.openfeel/config.json`，跨平台兼容

**与 template-loader 的关系：**
- template-loader 处理**部署时模板**（Agent prompt、AGENTS.md、core instructions，内容量大需 Base64 编码）
- i18n 处理**运行时 CLI 输出**（命令反馈文本，内容量小直接 TS 常量）
- 两者互补形成完整的多语言覆盖：运行时输出（i18n）+ 部署时内容（template-loader）

**参见：** v0.4.4-stage-01 op-001~op-002、kb/patterns.md #CLI 国际化封装模式

## [+] 公域日志批量聚合策略：推进事件延迟并入阶段里程碑 (2026-07-14)

v0.4.4 将公域日志从"每次 advance_stage_phase 逐条写入"改为"endStage() 完成时批量聚合为一条里程碑记录"：

```
之前：flow advance 每次调用 → 公域日志立即写入一条（每阶段 6-8 条噪音）
之后：advance_stage_phase 取消直接日志写入 → endStage() 汇总为一条里程碑记录
```

**规则：**
- advance_stage_phase 不再调用 publicLogger.logPhaseChange()——仅记录 flow.json 内部 log
- endStage() 新增 logMilestone() 调用，汇总该阶段全部推进为一条里程碑
- 里程碑事件（test_passed、archiving→done）仍逐条记录，确保审计链不丢失
- 降噪效果：消除约 85%+ 的公域日志条目，剩余均为里程碑级事件

**参见：** v0.4.4-stage-02 op-001、kb/patterns.md #流水线节点触发日志骨架模式

## [+] 8→9 Agent 体系扩展：Vision 视觉官 (2026-08-07)

v0.4.6 新增第 9 个 Agent：**Vision（视觉官）**，基于 qwen-vl-plus 多模态模型：

- **职责**：通用视觉分析（图像理解、UI 截图分析、图表/流程图解析、错误堆栈截图分析）
- **模型**：alibaba/qwen-vl-plus（通义千问多模态）
- **调起方式**：Feel 或其他 Agent 通过 `task` 按需调用，接收图片输入，输出结构化分析结果
- **模式**：subagent（不参与流水线调度，仅作为分析能力提供者）
- **权限**：read、glob、grep、bash（不需要 write/task 权限——产出通过返回值传递）

**设计决策：**
- Vision 不参与流水线阶段推进，不是流水线中的固定环节，而是被其他 Agent 按需调用的"能力代理"
- 与现有 8 Agent 的流水线调度模型（Feel → Planner → Schemer → Executor → Reviewer → Tester → Archiver）不同，Vision 是横向能力扩展
- 模板文件按现有多语言管线创建（zh-CN + en），由 build.js 自动注入 template-loader.ts，无需修改构建脚本
- Agent 颜色选 `#06B6D4`（青色），与现有 8 色无冲突，且符合"视觉/光学"的语义联想

## [+] CLI 质量门禁体系：lint 子命令组 (2026-08-07)

v0.5.4 引入首个自动化质量检查命令组 `openfeel lint`，以子命令形式承载多领域校验：

```
openfeel lint
├─ i18n    → 校验 422 键在 zh-CN/en 之间的对称一致性（空值检测、独有键检测）
└─ kb      → 扫描 .openfeel/kb/ 中的过期文件引用（目标文件不存在），输出过期条目列表
```

**设计决策：**
- 选择 `lint` 作为命令组名而非 `check` 或 `validate`，与前端工具链（ESLint）和 DevOps（Hadolint）命名习惯一致，降低认知成本
- 每个子命令独立实现校验逻辑，通过 Commander `.command()` 注册，新校验项以新增子命令的方式扩展，无需修改现有校验逻辑
- `--fix` 自动修复为可选能力，当前 `lint i18n` 无自动修复（键缺失需人工决策），`lint kb` 的 `--fix` 已在路线图中但尚未实现（v0.5.4 首版仅检测）
- lint 命令零依赖外部服务——i18n 校验通过静态分析 `src/core/i18n-data/*.ts` 的导出键集合，kb 校验通过 `glob` 检查文件存在性

**路线图：**
- 短期：`lint kb --fix` 自动修复过期引用（替换为最近似文件名或标记弃用）
- 中期：`lint prompt` 检测 Agent prompt 中的过时 CLI 命令引用和路径
- 长期：CI/CD 集成 `openfeel lint` 作为提交前门禁，阻断质量退化

**参见：** v0.5.4-stage-01 op-001（lint i18n）、op-002（lint kb）、kb/patterns.md #CLI lint 子命令组扩展与 --fix 自动修复模式

## [+] 分级模块文档系统：manual + 树图索引 (2026-08-07)

v0.5.6 建立了 `.openfeel/manual/` 分级模块文档系统，与 kb/ 知识库形成互补：

```
manual/               ← 模块文档系统（人类维护，Archiver 归档时更新）
├── index.md          ← 树图索引（核心引擎 / CLI 层 / Agent 体系）
├── core/
│   ├── flow-manager.md   ← 流水线管理模块（职责、核心 API、状态机）
│   └── config.md         ← 配置管理模块（配置层级、读写方法）
├── cli/
│   └── commands.md       ← 命令体系（命令注册、i18n 集成）
└── agents/
    └── feel.md           ← Agent 设计（9 Agent 体系、调度模型）
```

**设计决策：**
- **分工明确**：manual 记录"模块是什么"（API 参考、职责、结构），kb 记录"怎么做决策/踩了什么坑"（经验沉淀）
- **按需扩展**：新增模块时在 index.md 树图中追加条目，创建对应文档，不预建空目录
- **归档官维护**：归档官在归档时必须检查本阶段涉及的模块，若其 API、结构或职责发生变更，须同步更新 manual/ 中对应模块文档
- **轻量结构**：每个模块文档 20-30 行左右，含职责描述、核心 API 速查、关键数据结构，不做过度展开
- **与 AGENTS.md 联动**：AGENTS.md 中写入「模块手册」约束（`manual/index.md` 模块树），确保 Agent 知晓该文档系统并能在需要时查阅

**维护规则索引表：**

| 模块 | 对应文档 | 归档时检查点 |
|------|----------|--------------|
| flow.json / 流水线推进 | `core/flow-manager.md` | 核心 API 或状态机变更 |
| config.yaml / profile.yaml | `core/config.md` | 配置层级或读写方法变更 |
| 命令注册 / i18n | `cli/commands.md` | 新增命令组或翻译机制变更 |
| Agent 体系 / 调度模型 | `agents/feel.md` | Agent 数量、模型或调度规则变更 |

**参见：** v0.5.6-stage-01 op-001（manual 创建 + AGENTS.md 模块手册约束）、kb/patterns.md #归档官维护 manual 模块文档模式

## [+] 计划目录按大版本系列分组模式 (2026-08-07)

v0.5.7 将 `.openfeel/plan/` 从平铺目录重构为按大版本系列分组，形成「系列索引 + 顶层指针」的二级导航体系：

```
plan/                    ← 顶层（仅入口文件）
├── index.md             ← 顶层索引（系列导航 + 各版本阶段对照表）
├── plan_index.md        ← 指针文件（指向系列索引，轻量）
├── plan_log.md          ← 变更日志（最近 30 条摘要）
├── v4/                  ← v4 系列收纳（v4 ~ v0.4.7）
│   ├── index.md         ← v4 系列索引（各期摘要 + 状态表）
│   ├── plan.md          ← v4 大版本计划（顶层设计）
│   ├── v0.4.7/            ← 各小版本目录
│   │   └── plan.md
│   └── ...
├── v5/                  ← v5 系列收纳（v0.5.0 ~ v0.5.7）
│   ├── index.md         ← v5 系列索引
│   ├── roadmap-v5.md    ← v5 系列路线图（从 v0.4.7 迁入）
│   └── v0.5.7/
│       └── ops/
└── v1/ v2/ v3/ ...      ← 历史版本原位保留
```

**设计决策：**
- **git mv 保留历史**：已跟踪文件用 `git mv` 移动，保留完整 git blame 和 log 追溯链
- **未跟踪目录降级**：未跟踪目录 git mv 拒绝操作时，降级为文件系统 `Move-Item`（历史通过 plan_log.md 留存）
- **指针 + 索引分离**：`plan_index.md` 作为轻量指针（0 业务内容），`index.md` 承载完整的系列导航和阶段对照表
- **系列自包含**：每个系列目录（v4/、v5/）包含独立的 `index.md`，可直接作为该系列的入口页
- **历史不迁移**：v1/v2/v3 等早期版本保持原位，仅 v4+ 按系列收纳
- **无硬编码路径**：skill 引用（如 `get-stage-status` 中的 plan_index → index.md）、部署模板中的 plan 路径引用全部同步更新，消除引用断裂

**经验教训：**
- 大规模文件移动时先 `git status` 确认目标在暂存区状态，避免 git mv 拒绝
- 重构后立即校验所有引用路径的可用性（glob 全量检查 + 每个链接点击验证）
- 计划目录调整涉及 skill/模板/CLI 三层引用，需全链路同步→自测闭环

**参见：** v0.5.7-stage-01 op-001（目录重构 + reasoning_effort 调整）、kb/patterns.md #约束文件→指令文件迁移模式（同属目录重构类模式）

> **更新于 2026-08-15（v1.0.0-stage-34）**：本模式从「OpenFeel 自身目录重构」落地为「框架标准部署」。stage-34 修复三处路径不一致（`init.ts` 示例阶段平铺、`plan/stage.ts` + `plan/scheme.ts` 误写 `stages/`、`flow-manager` findStatusPath 双路径平铺回退），统一为 `plan/{series}/{stage}/` 多级结构（series=`v{MAJOR}`）。新增唯一权威工具 `src/core/plan/path.ts`：`parseStageId`（三格式解析）、`stageIdToPlanDir`（正向映射）、`planDirToStageId`（回查 flow.json 反向映射 + 去歧义）、`findStageStatusPath`（三级回退）。init 示例阶段部署到 `plan/v1/stage-01/` 并注册 `v1.0.0-stage-01`；CLI 参数兼容「完整 stageId 为主、短名 `stage-NN` 为别名（series 默认 v1）」。存量 `stages/` 保留只读兜底、不做物理迁移（规避 Git 重命名交叉匹配假象，见 kb/troubleshooting.md #Git 重命名检测交叉匹配假象）。

## [+] config.yaml meta.version 语义：OpenFeel 框架版本 (2026-08-15)

`config.yaml` 的 `meta.version` 语义确认为「**OpenFeel 框架版本**」（非配置格式版本），与 package.json 同步。

**关键点：**
- `config.yaml meta.version` 由 `src/core/config.ts` 的硬编码模板常量 `CONFIG_TEMPLATE_ZH`（约 304 行）/ `CONFIG_TEMPLATE_EN`（约 361 行）生成，是**字面量**（非 `${DEFAULT_CONFIG.xxx}` 插值）；
- 版本升级须**三处同步**：项目实例 config.yaml + config.ts 双语言模板常量，否则新项目 `init` 仍生成旧版本号（REV-003 曾指出此源码遗漏）；
- `flow.json meta.version='1.0'` 是**内部格式**，与 config.yaml meta.version 是两个独立字段，不参与框架版本同步。

**编码注意**：config.yaml 实测为 UTF-8 无 BOM（非 GBK），改后须保留原编码，避免乱码。

**与既有「模型配置三级体系」的关系**：本条目界定 `meta` 节的版本语义，既有条目界定 `models` 节的模型覆盖层级，两者同属 config.yaml 的不同节，互不覆盖。

**参见：** v1.0.0-stage-33 op-005、kb/patterns.md #版本号语义管理与递增规范模式

## [+] 跨进程并发保护架构：原子写 + 建议性文件锁 + 序号原子化三层底座 (2026-09-12)

OpenFeel 多进程/多 Agent 并发写共享状态文件的统一安全底座，由三个零依赖小工具组成（`src/core/fs/`）：

| 层 | 模块 | 机制 | 解决的问题 |
|----|------|------|-----------|
| 原子写 | `atomic-write.ts` | 同目录唯一名 temp（`.{basename}.{pid}.{rand}.tmp`）→ write → fsync → `renameSync` 覆盖 | 进程中断致文件半写/损坏 |
| 建议性锁 | `file-lock.ts` | `openSync(lockPath,'wx')`（O_EXCL）独占创建 + 指数退避 + 陈旧锁 rename 抢占 + token 归属校验 | 跨进程「读-改-写」交错 / 丢失更新 |
| 序号原子化 | `sequence.ts` | `openSync(candidate,'wx')` 占号 + EEXIST 递增重试 | `max+1` 分配器的跨进程重号 / 覆盖 |

**设计选型理由：**
- **零第三方依赖**：仅用 `node:fs`/`node:crypto`/`node:path`/`node:os`，契合项目「避免过度设计、不随意引第三方库」约束。
- **同目录 temp 保证 rename 同卷原子**：跨卷 rename 会退化为「复制 + 删除」非原子操作。
- **建议性锁（advisory）而非强制锁**：跨平台简单可靠；锁文件集中 `.openfeel/tmp/locks/{name}.lock`（项目级）与 `~/.openfeel/locks/{name}.lock`（全局级），不污染业务目录。
- **序号 `max+1` 降级为「候选起点快速路径」**：最终分配权归 O_EXCL 独占创建 + EEXIST 重试，单进程一次命中、并发绝不重号。
- **锁 TTL=3000ms 基于实测**：最长临界区 P99 ≈ 8.14ms（94KB flow.json 原子写 5.22ms / 公共日志读改写 6.53ms），取 368×P99 大余量；`staleMs < timeoutMs`（3000 < 5000）保证崩溃残留可在等待窗口内被抢占。同步 API 下事件循环被阻塞，心跳续期不可行，故用静态大余量 TTL。

**接入范围**：仅高风险共享写入点（flow.json、公共日志、status.md、op 序号、全局配置、kb/index.md），低风险一次性写入（init 模板、日志骨架）保持裸 `writeFileSync`，避免过度设计。

**参见：** v1.1.0-stage-35 op-001~004、kb/patterns.md #原子写模式、#建议性文件锁模式、#flow.json 乐观并发校验模式

## [+] opencode 全局/项目 agent 与 skill 合并语义（源码验证）(2026-09-12)

opencode 加载配置时，全局（`~/.config/opencode/`）与项目（`.opencode/`）资产的合并语义经源码验证如下，是 v1.1 stage-37「全局部署架构」的关键前提：

- **agent：按名 `mergeDeep` 合并**。项目覆盖同名 agent；**异名全局 agent 保留**，项目目录**不屏蔽**全局 agent（**无**「项目 config 存在即跳过全局」的短路逻辑）。
- **skill：并集合并，但同名覆盖结果非确定**。故全局与项目 skill **必须保持名唯一**，不得依赖同名覆盖。
- **`default_agent` 在合并后的注册表解析**（非各层独立解析）。

**对全局部署的推论**：框架 agent/skill 全局安装后，项目侧只需部署「同名覆盖项」（如模型 / 语言定制），无需复制全部资产；项目自定义 agent/skill 与全局共存。因 skill 同名覆盖非确定，命名前缀统一（D2：`openfeel-`）是保证全局/项目不冲突的必要前提。

> 注：本条描述 **agent / skill 的合并语义**，与 P2 / REV-001 已验证的 **`instructions` 拼接 + 去重**（`mergeConfigConcatArrays`）是不同维度的合并行为，勿混同。

**参见：** `.openfeel/plan/v1/v1.1/plan.md` P2 / REV-001、v1.1.0-stage-35 计划阶段源码核实（general agent）

## [+] 模板单源架构：templates-data/opencode 唯一权威源 + 双注入对象 + 单源一致性断言 (2026-09-25)

v1.1.0-stage-36 根治了「双层模板源发散」（见 troubleshooting.md #双层模板源发散），把三对并存的双层模板源收敛为**单一权威树 + 两个独立注入对象**：

```
templates-data/opencode/                    ← 唯一权威源（人类编辑）
├─ agents/{zh-CN,en}/openfeel-*.md          ← agent prompt（feel 保留原名，其余 8 个加 openfeel- 前缀）
├─ skills/openfeel-*/SKILL.md               ← 14 个 skill（全部加前缀）
├─ instructions/{zh-CN,en}.md               ← core 指令（含 Vision）
├─ opencode.jsonc / ADAPTER.{lang}.md        ← 平台配置与适配器说明
└─ agents-md/{zh-CN,en}.md                  ← 项目级 AGENTS.md 模板（部署目标不同，保留独立目录）
        │
        ▼ 构建时 (build.js)
src/core/template-loader.ts                 ← AGENT_TEMPLATES / OPENCODE_AGENT_TEMPLATES / OPENCODE_SKILL_DEFINITIONS ...
src/core/update.ts                          ← SKILL_DEFINITIONS
        │
        ▼ 运行时
init.ts（deployOpencode 部署）  vs  update.ts（增量更新）
```

**关键设计决策：**

- **单一权威树 = `templates-data/opencode/`**：删除 `templates-data/agents/` 与 `templates-data/core-instructions/`；build.js 全部源路径改指权威树（`SKILLS_DIR` 重指 `opencode/skills`，`generateAgentDefinitions` / `generateTemplateFromCoreMd` 等改读 `TEMPLATE_OPENCODE_*`），并删除改向后成为死常量的 6 个源目录常量。
- **双注入对象不合并（D36-4 结论）**：`SKILL_DEFINITIONS`（update.ts，供 `openfeel update`）与 `OPENCODE_SKILL_DEFINITIONS`（template-loader.ts，供 `openfeel init`）消费方不同（增量更新 vs 首次部署），合并会牵连调用方大改且无净收益。故**保留两个对象，仅改源路径 + 加断言**。agent / instruction 同理。
- **单源一致性断言（`validateSingleSourceConsistency`）**：build 新增断言，校验三对对象**键集 + 归一化内容**一致（`AGENT_TEMPLATES ≡ OPENCODE_AGENT_TEMPLATES`、`SKILL_DEFINITIONS ≡ OPENCODE_SKILL_DEFINITIONS`、`CORE_INSTRUCTIONS_TEMPLATES ≡ OPENCODE_CONFIG_TEMPLATES[*].instructions`），并断言冗余树（`agents` / `core-instructions`）已不存在。此断言让「再次漂移」在 `npm run build` 时即报错，弥补了旧实现「两层独立校验、无跨层比对」的盲区。
- **`.opencode/` 降级为构建产物（自举实例）**：build 新增步骤 8（置于 `npx tsc` 之后，`await import('./dist/core/fs/atomic-write.js')` 复用 stage-35 原子写），从权威源重生成 `.opencode/{agents,skills,instructions,ADAPTER.md}` 并插入生成物标记 `<!-- openfeel:generated — 本文件由 npm run build 生成，请勿手工编辑 -->`。标记插在 YAML frontmatter 闭合 `---` 之后（插之前会破坏 frontmatter 解析），与 stage-38 的 `<!-- openfeel:begin/end -->` 控制区标记语法不冲突。
- **行尾归一 LF**：新增 `.gitattributes`（`src/core/templates-data/**` 与 `.opencode/**` `text eol=lf`）+ 各注入函数读文件后 `content.replace(/\r\n/g,'\n')`，防止 CRLF 泄漏进生成模板串造成跨平台不可复现。

**参见：** v1.1.0-stage-36 op-001/op-004、kb/troubleshooting.md #双层模板源发散、kb/patterns.md #构建脚本多语言循环生成模式、#跨平台行尾归一化模式

## [+] 全局部署架构：框架资产全局化 + 项目精简 + 双 state (2026-09-25)

v1.1.0-stage-37（D1/P2 全量落地）将框架部署目标从「逐项目部署」切换到「全局部署」，并落地框架约束走 instructions 机制：

**部署架构三层：**

| 层 | 部署目标 | 内容 |
|----|----------|------|
| 全局框架资产 | `~/.config/opencode/` | 9 agent（`agents/`）、14 skill（`skills/`）、框架约束 `openfeel/core.md`、框架级 `opencode.jsonc` |
| 全局 state | `~/.openfeel/update_state.json` | 全局资产的 hash 追踪（绝对路径作 key） |
| 项目精简 | 项目根 | 仅 `.openfeel/` 工作区 + 项目 `AGENTS.md`（项目级约束）+ 项目 `opencode.jsonc`（模型/语言覆盖，仅 `$schema` + 用户 `agent.<name>.model`，**不写** instructions/skills/default_agent） |

**核心设计决策：**

- **框架约束走 `instructions`（P2）**：框架 core.md 部署到 `~/.config/opencode/openfeel/core.md`，全局 `opencode.jsonc` 的 `instructions` 引用其**绝对路径**；项目 `opencode.jsonc` 完全不写 `instructions`（继承全局）。项目级约束仍走项目 `AGENTS.md`（opencode 约定自动加载，实测确认，无需列入 instructions）。
- **全局/项目双 state（N2）**：全局资产（agents/skills/core.md/全局 opencode.jsonc）hash 追踪走 `~/.openfeel/update_state.json`（绝对路径 key）；项目资产（AGENTS.md / 项目 opencode.jsonc）继续走项目 `.openfeel/update_state.json`。首次全局 state 加载降级须防全量覆盖（见 troubleshooting.md #update_state.json 降级风险排查）。
- **全局 opencode.jsonc 深度合并**：已有全局配置时「解析→深度合并→序列化」，保留用户自定义字段（含未知字段 passthrough）；合并/写入加全局锁 + 原子写。见 patterns.md #JSONC 深度合并模式。
- **legacy 布局识别（N8）**：update 检测项目内遗留 `.opencode/{agents,skills,instructions}` 时仅提示「请运行 openfeel migrate（stage-39 提供）」，不静默迁移/删除。存量旧 state 重键迁移、项目自定义资产保留均属 stage-39。
- **仓库自身 `.opencode/` 不动（N1）**：「项目精简」仅指 init 部署的新项目；OpenFeel 仓库自身的 `.opencode/` 仍是构建产物/自举实例（stage-36 步骤 8），本阶段不删除、不改 build.js。

> **【supersede｜2026-10-01｜v1.1.2-stage-55】** 本决策已变更：仓库自身不再保留项目级 `.opencode/` 受管实例（`agents`/`skills`/`ADAPTER.md`）与根 `AGENTS.md`/`opencode.jsonc`。理由：① 全局部署已完备（`openfeel setup` 幂等刷新，含 17 skill / 9 agent / 全局 `AGENTS.md`）；② 消除「项目级与全局」双份资产漂移；③ 移除 `build.js` 步骤 8 以消除复活负担（防复活）。**适用边界**：**目标项目**的 `.opencode/` 相关语义与保留清单**不受影响**（本决策仅针对 OpenFeel 仓库自身）。回滚：`git checkout <sha> -- AGENTS.md opencode.jsonc .opencode/` + 恢复 `build.js` 步骤 8。

**opencode 全局/项目配置合并语义实测结论（op-000，真实 CLI 子进程 + 隔离 HOME）：**

| 验证项 | 结论 |
|--------|------|
| instructions 合并 | **拼接 + 去重**（全局在前，项目追加，不覆盖） |
| `~` 展开（配置值层） | `debug config` 输出**不展开**（保留字面 `~/...`） |
| `~` 展开（加载层） | 加载时实际展开并成功加载（与「未展开→必须绝对路径」的直觉预判不同） |
| core.md 实际加载 | **PASS**（指令型探针回显命中 token） |
| AGENTS.md 自动加载 | **YES**（项目 `opencode.jsonc` 为 `{}` 时仍加载） |
| config 目录 | **无 APPDATA 偏差**（`config == $HOME/.config/opencode`） |
| agent_manager_tool | schema 未定义 + **静默丢弃**（无报错 exit 0）→ 移除 |

> `~` 虽在加载层可展开，但仍采用绝对路径（`getGlobalCoreMdPath()`）：配置值层可读、跨平台无歧义、不依赖 opencode 内部展开实现（「加固而非推翻」）。

**参见：** v1.1.0-stage-37 op-000~005、`.openfeel/plan/v1/stage-37/op-000-findings.md`、kb/architecture.md #opencode 全局/项目 agent 与 skill 合并语义、kb/patterns.md #JSONC 深度合并模式、#全局/项目双 state 路由模式

## [+] 控制区标记增量更新架构：managed-region 四策略 + 三态 + update_infos 双资产路径 (2026-09-25)

v1.1.0-stage-38（D3 全量落地）用「控制区标记」替换/演进 stage-32 以来的「hash 四态」更新机制，实现「更新只覆盖受管区、区外用户内容零破坏」，并落地 `~/.openfeel/update_infos.md` 记录与「会话启动检查修复」约束。

**四策略（按文件类型分派 `detectFileType`）：**

| 文件类型 | 判定依据 | 策略 | 三态适用 |
|---------|---------|------|---------|
| Markdown 正文（agent/skill/AGENTS.md/core.md） | `.md` | `<!-- openfeel:begin/end -->` 包裹/替换 | 适用 |
| Markdown frontmatter | `.md` + YAML frontmatter | 结构化字段合并（无标记） | 不适用（恒合并） |
| JSONC（opencode.jsonc） | `.jsonc` | 解析 → deepMerge → 序列化（复用 opencode-config） | 不适用（恒合并） |
| 纯文本（.gitignore） | `.gitignore` | `# openfeel:begin/end` | 适用 |

**部署三态（+appended 四分类）：**

| 文件存在？ | 含标记？ | hash 匹配？ | 动作 | 结果 |
|:--:|:--:|:--:|:--|:--:|
| ❌ | — | — | 写全文（frontmatter 结构化 + 正文标记包裹） | `created` |
| ✅ | ✅ | — | frontmatter 合并 + 区内替换 → 全文比对 | `skipped` / `updated` |
| ✅ | ❌ | ✅ | adopt 写带标记新框架内容 | `updated` |
| ✅ | ❌ | ❌/无记录 | 末尾追加受管区 + 写 update_infos.md | `appended` |
| ✅ | malformed | — | 不写盘，仅记 anomaly 条目 | `skipped` |

**update_infos 双资产路径（N7 / REV-903）**：`~/.openfeel/update_infos.md` 全局共享，条目路径自包含无歧义——全局资产记**绝对路径**，项目资产记「项目根 + 相对路径」二元组（`AGENTS.md (项目: /abs/root)`），禁止只记相对路径（跨项目共享文件会归属歧义）。写入走 `withFileLock(globalLockPath('update-infos'))` + 原子写。

**核心设计决策：**

- **hash 降级为「无标记文件归属兜底」（N3）**：不再作为含标记文件的拒写依据；含标记文件无条件只覆盖区内（标记即「区内归框架、区外归用户」的契约）。
- **追加即建区（N2）**：追加内容 = 标记包裹的受管区（非裸内容），杜绝无限重复追加。
- **`generated` 与 `begin/end` 不冲突、不统一（N6）**：前者单行整文件声明（构建产物），后者成对区间包裹（增量更新），token 与形态均不同。
- **会话启动修复规则落地 feel.md（主）+ core-instructions（辅）**，双语同步（N5）；修复动作用 edit 工具勾选条目（Feel 不能 import TS 模块），不新增 CLI。

**参见：** v1.1.0-stage-38 op-001~004、kb/patterns.md #控制区标记模式、#malformed 降级防死循环模式、kb/troubleshooting.md #malformed 标记死循环排查

## [+] 存量项目迁移架构：legacy 布局检测 + 备份回滚 + 全局部署迁移 (2026-09-25)

v1.1.0-stage-39（P6 收口）新增顶层 `openfeel migrate` 命令，把存量旧布局项目（项目内 `.opencode/` 下的 agents/skills/instructions 旧目录、旧 `opencode.jsonc` 非法 `skills` 映射、混合 `update_state.json`）迁移到 stage-37 的全局部署架构。核心决策：

- **legacy 五条判据（M3）**：任一为 true 即视为 legacy；判据 ①/② 采用「框架同源判定」——文件/目录名经 `normalizeAgentName`（agent）/ `remapSkillName`（skill）归一化后命中框架清单（9 agent + 14 skill），项目自定义 agent/skill **不计**。此举保证 migrate 幂等（二次执行 `isLegacy=false`），否则项目自定义资产恒使项目判 legacy 形成「迁移-仍判 legacy」死循环（REV-007）。
- **备份回滚（M2/D39-3）**：备份到 `.openfeel/backup/{yyyyMMddHHmmss}/` + `manifest.json`（每条 `{op, source, backupPath, hash}`）。回滚按 manifest 逆向恢复被删/改写的项目文件；`manifest.globalStateKeys` 记录本次写入的全局 state key，回滚仅删这些、不触碰历史全局条目（REV-1302）。
- **全局部署迁移（D39-1）**：migrate 复用 update 的全局部署能力——最小侵入抽取 `deployGlobalAsset`（等价 `writeManagedFile(..., {isGlobal:true})`），migrate 与 update 共用，避免双份维护（REV-1205）。
- **state 拆分重键（D39-2）**：旧项目 state 的框架条目（`.opencode/...` 相对 key）→ 归一化新名 → 移入全局 state（绝对路径 key）；无法映射的条目保留项目 state 并记 `unmapped` 待人工处理。
- **回滚边界（REV-1201）**：全局框架资产（agents/skills/core.md/opencode.jsonc）幂等可重建，回滚**不还原全局文件**（可 `openfeel update` 重建），仅还原项目文件 + 全局 state 新增条目。

**参见：** v1.1.0-stage-39 op-001~004、kb/patterns.md #迁移命令模式、#回滚边界模式、kb/troubleshooting.md #migrate 中途失败排查

## [+] 模型配置三层级架构：工具默认/全局/项目 + 优先级链 frontmatter>jsonc (2026-09-25)

v1.1.0-stage-40（收官）新增 `openfeel model` 命令组 + `src/core/model-config.ts` 内部 API，统一三层级 agent 模型读写，解决「改 agent 模型要手动改多处文件 + 重启」的痛点。

**三层级落点（agent 级，只改 model 键，不触碰同 agent 其他字段与其他 agent）：**

| scope | 落点 | 写盘方式 |
|-------|------|----------|
| `default`（工具默认） | 有显式 model 的 4 agent（executor/utility/reviewer/vision）→ `templates-data/opencode/agents/{zh-CN,en}/*.md` frontmatter（双语）；vision/reviewer 额外改 `opencode-config.ts` `buildGlobalOpencodeFrameworkObj()`；无显式 model 的 5 agent（feel/planner/schemer/feel-tester/archiver）报错提示改用 global/project，不新增框架默认 | managed-region frontmatter 读写 + opencode-config 结构化定位；写后须 `npm run build` 重生成 |
| `global`（全局） | `~/.config/opencode/opencode.jsonc` `agent.<name>.model` | parseJsonc + 文件锁 + 原子写 |
| `project`（当前项目） | 项目根 `opencode.jsonc` `agent.<name>.model` | parseJsonc + 原子写（不加锁） |

**解析优先级链（REV-1606 实测勘误，推翻计划初期的相反假设）：**

```
项目 agents/*.md frontmatter > 全局 agents/*.md frontmatter >
项目 opencode.jsonc agent.model > 全局 opencode.jsonc agent.model > opencode 默认
```

opencode 官方配置源优先级为「project config < .opencode 目录（agents 等）」，故 **agent markdown frontmatter 覆盖 opencode.jsonc**（非 plan 初期 REV-1501 假设的「jsonc > frontmatter」）。`getAgentModel` effective 解析修正为 `default > project > global`（取首个非空显式值）；default 层多源不一致时以 frontmatter 为准并置 `inconsistent`。

**模型名校验**：格式 `{provider}/{model-id}`；provider 硬校验（对照 `~/.local/share/opencode/auth.json` 顶层 key，路径走 `global-paths.ts` 新增 `getAuthJsonPath()`）；model-id 软校验（仅格式，提示以 `Did you mean` 为准）；auth.json 缺失降级为仅格式校验。

**设计要点**：`model-config.ts` 纯函数化（不直接 console 输出，返回结构化结果），供 CLI 与「Model not found 自动修复」共用；agent 名复用 `normalizeAgentName` 归一化；`default` 层多源（frontmatter + opencode-config.ts）通过 `frameworkRoot` 可注入路径实现测试隔离。

**参见：** v1.1.0-stage-40 op-001~003、kb/troubleshooting.md #opencode 模型解析优先级排查、kb/patterns.md #模型配置命令模式、kb/setup.md #OpenCode Agent 模型配置

## [+] 全局约束架构：约束统一全局 AGENTS.md + 约束/操作分离 + 项目级去约束化 (2026-09-26)

v1.1.1-stage-01 将框架约束从「core.md 平台指令层」彻底收敛到「全局 AGENTS.md 约束层」，实现约束与操作分离的「全局化彻底化改造」：

**核心变化：**

| 项 | 改造前 | 改造后 |
|----|--------|--------|
| 约束载体 | 历史 core.md（已退役；项目级与全局级各一份） | 全局框架约束文件（AGENTS.md） |
| 操作步骤 | 混在 core.md | 拆为 skill（新增 `openfeel-workspace`、`openfeel-tool-usage` 2 个操作类） |
| 全局部署 | init 顺带部署 | 收归 `openfeel setup`（纯全局） |
| 项目初始化 | init 生成项目 AGENTS.md + 部署全局资产 | init 只建工作区（`--workspace-only`），不生成项目 AGENTS.md |

**核心设计决策：**

- **约束常驻全局 AGENTS.md**：行为约束/规范/原则属「每会话必读、跨项目统一」，放入全局 `~/.config/opencode/AGENTS.md`（opencode 约定自动加载）。
- **操作拆 skill**：操作步骤/工作流属「触发时才读」，拆为 skill（`openfeel-workspace` 工作区操作、`openfeel-tool-usage` 工具使用规范），避免常驻噪音。
- **项目级去约束化**：init 不再生成项目 AGENTS.md 骨架；update 不再部署项目 AGENTS.md；存量项目 AGENTS.md 属用户项目约束**保留不动**。
- **state remap**：存量全局 state 的 core.md key 一次性重映射到全局 AGENTS.md key（`getGlobalAgentsMdPath()`），保证增量更新连续性。

**op-000 实测结论（关键前提，真实 CLI 子进程 + 隔离 HOME）：**

| 验证项 | 结论 |
|--------|------|
| 全局 `~/.config/opencode/AGENTS.md` 自动加载 | **YES**（项目 opencode.jsonc 为 `{}` 时仍加载） |
| 全局 + 项目 AGENTS.md 并存 | **拼接**（不覆盖） |
| 移除 instructions 后约束仍生效 | **YES** |

**与 stage-37「全局部署架构」的关系**：stage-37 落地框架约束走 `instructions`（core.md 绝对路径引用）；本阶段进一步把约束载体从 instructions/core.md 迁到全局 AGENTS.md，消除「约束两处存放」（core.md + AGENTS.md）的冗余。移除 instructions 后约束仍生效（op-000 实测），证明该迁移安全。

**参见：** v1.1.1-stage-01 op-000~005、kb/architecture.md #全局部署架构、kb/patterns.md #约束/操作分离模式、kb/troubleshooting.md #opencode 全局 AGENTS.md 加载排查

## [+] 全局宏观状态聚合语义：全量 done 判定 + 空集守卫 + 不迁移历史 (2026-09-29)

`pipeline.phase` 是**派生**的宏观状态（`META_PHASES`：`active` / `paused` / `done`），不由单次推进的目标 phase 直接决定，而由全部阶段聚合得出（v1.1.2-stage-42 op-003，`flow-manager.ts:1090-1094`）：

```ts
// 所有 stage 均 done 时置 'done'，否则 'active'（P3 全量 done 判定）
const allDone = Object.values(this.data.stages).length > 0
  && Object.values(this.data.stages).every((s) => s.phase === 'done');
this.data.pipeline.phase = (allDone ? 'done' : 'active') as MetaPhase;
```

四条配套语义（写入实现时须一并遵守）：

- **空集守卫必须写**：`length > 0 && every(...)`。`every` 对空数组返回 `true`（vacuous truth），缺守卫会把「无阶段项目」误判为全局 `done`。
- **单阶段 done 不改变全局**：「`targetPhase === 'done'` 即置全局 done」的简化实现（备选 A）在多阶段场景会误置全局 done，已否决。
- **`current` 不回退是设计行为**：`advanceStagePhase` 无条件设置 `current.stage/op`；反馈「`flow status` 的 current 应回退」不属实，显式记录以免被审查误判为遗漏（P3a）。
- **不做数据迁移**：`pipeline.phase` 可由 `stages` 重新推导、任一次 advance 自愈，迁移历史 flow.json 反而污染审计链；`validate()` 的 `MetaPhaseSchema`（含 `done`）通过路径已核实，`fuzzyCorrectMetaPhase` 不会把 `done` 误修正为 `active`。
- **消费方核验清单**：`status` / `status --verbose` / `current` / `overview`（已独立计算 `allStagesDone`，去重一致化）、`wizard`（`metaPhase==='done' || allStagesDone` 双条件，行为不变）、`validate`、`migrate`（独立赋值）。

**验证方法**：三场景测试——单阶段 done → 全局 done / 部分 done → active / 全 done → done + `validate()` 通过；并 `rg "phase = 'active'"` 确认无其它写入点残留。

## [+] opencode agent permission 合并求值语义：findLast + 按键深合并 + 平台默认 ask (2026-09-29)

**实测依据**：`.openfeel/plan/v1/stage-44/op-001-findings.md`（隔离 HOME + `opencode debug agent` / `opencode run`，opencode-ai 1.18.33；审查官独立复验 R-①/R-②/R-③ 一致）。

1. **求值算法**：权限规则列表用 `findLast`（**最后匹配者胜**），规则 `permission` 字段按通配匹配（`"*"` 匹配**任意**权限名）⇒ 顶层 `permission: "allow"` 生成 `{permission:"*",action:"allow",pattern:"*"}`，位于内置默认之后，对 agent 未声明的键（含 `external_directory`）**生效**。
2. **规则顺序**：`[opencode 内置默认]` → `[配置文件（顶层 permission / agent.<name>.permission）]` → `[agent .md frontmatter 的 permission]` → `[自动追加：opencode 自身 tool-output 目录 allow]`。
3. **合并粒度**：按权限键**深合并**（非整体替换）；**同名键 agent `.md` 优先**，配置文件无法覆盖；仅 `.md` **未声明**的键才由配置生效。⇒ 补键后 `external_directory` 已被 `.md` 声明，项目 `opencode.jsonc` 与顶层 `permission` 均**无法再收紧**；**唯一项目级收紧入口 = 项目 `.opencode/agent/<name>.md`**（可整体覆盖全局同名 agent）。
4. **平台默认值**：`external_directory` 默认 `ask`（内置 `{"*":"ask"}` + opencode 内部 `tool-output` / `%TEMP%\opencode` 目录 allow）；**不存在**「对所有 agent 追加 `external_directory:{"*":"allow"}`」的逻辑（实测追加项仅覆盖内部目录）。
5. **键名有效性**：授权键为 **`edit`**；`write` 键**不被识别**（`write: "deny"` 不生效，write/patch 工具映射到 `edit` 权限）。
6. **值形式**：单值 `external_directory: "allow"` 与对象 `{"*": "allow"}` 均被 schema 接受且**等价**（同一规则，仅序列化键序差异）；框架统一取单值。

**设计取舍（v1.1.2-stage-44）**：9 agent 模板内联白名单 + 补 `external_directory: "allow"` ⇒ 「项目级全程免审」不再依赖顶层/项目配置；代价=框架 agent 豁免于项目顶层 `permission`，收紧须走项目级 agent `.md`。已文档化至根 `AGENTS.md` 权限模型节、`agents-md/{zh-CN,en}.md` 与 `manual/core/permission.md`。

**局限**：结论**仅对 opencode 1.18.33 成立**（版本差异不可迁移）；`task` 委派子 agent 的 ruleset 继承未单独实测；配置热重载未单独实测。

## [+] 纠正侧能力对称原则：创建侧齐备 → 补齐纠正/清理侧 CLI（可维护性架构）（2026-10-01）

**反模式（v1.1.2-stage-51 核心命题）**：CLI 在「创建侧」能力齐备（建阶段、建 op、推进相位），却在「纠正/清理侧」近乎空白（不能删除 op、不能设置阶段依赖、不能改审查条目）→ 一旦误建条目，**无任何合法手段回收**，只能永久残留或违规手改状态文件（`flow.json`）——使硬性纪律「禁止手动编辑 flow.json」在**故障恢复场景下无解**。

**架构结论**：任何「声明式状态文件 + 禁止手改 + 全由 CLI 写入」的治理体系，必须为**每一种可写结构**提供对称的**增 / 删 / 改 / 查**命令面，否则「禁止手改」纪律在异常路径上不可满足。补齐按**能力三分类**：

| 能力 | 语义 | v1.1.2-stage-51 落地 |
|------|------|------|
| **删除** | 注销错误条目 | `plan scheme remove <stage> <opId>`（done/checkpoint 保护 + `--force`/`--dry-run`） |
| **修正** | 改结构字段的值 | `flow stage set --deps <ids...>`（悬空校验 exit 1）、`flow review update/remove <revId>` |
| **对账** | 检出「声明 ↔ 实体」漂移 | `flow repair` 的 op↔文件对账（默认只报告 + `--prune-orphans`）、`flow health` 孤儿 `warn` |

**配套原则**：
1. **对账能力先于自动清理**：新增可写结构时同步新增「漂移检测」；清理默认只报告、显式开关（见 kb/patterns.md #孤儿检测与安全清理模式）。
2. **单一语义**：同一概念只保留一条权威路径——如 `scheme create` 隐式注册必须补齐 `overview.md`/`status.md` 骨架（消除「半注册」），抽 `ensureStageSkeleton` 供 `addStage` 共用，两路径产物**逐字节一致**。
3. **单一 owner**：跨命令共享的生命周期（`pipeline.current.op`）由**一个函数**维护（`syncCurrentOp`），禁止各命令各写一份（见 kb/patterns.md #跨阶段「契约先行」协同）。
4. **不做历史迁移**：结构变更（文件名/布局）以「未来写入统一 + 读取端兼容」收敛，不背历史迁移包袱（见 kb/patterns.md #「未来写入统一 + 历史共存」渐进收敛策略）。

**参见：** v1.1.2-stage-51（反馈 08，N1~N11，9 op）；`plan/v1/stage-51/plan.md`；`.openfeel/manual/cli/commands.md`、`.openfeel/manual/core/flow-manager.md`

## [+] 上下文预算治理架构：两条设计目的 + 索引层/主题层/详情层三层分层 (2026-10-01)

**背景（v1.1.2-stage-53）**：`current.md` / `dev_last.md` 原先承担了过多职责与粒度错位的内容——`current.md` 堆入版本里程碑表与逐阶段产出明细（本仓曾达 **82 行**），`dev_last.md` 单会话覆盖写 7 节（本仓 **53 行**）。两者都写「正在做什么」，职能重合；且 `dev_last.md` 整文件覆盖写在多会话下**后写者覆盖先写者**（信息丢失）。

**两条设计目的（总纲，写入全局框架约束层）**：
1. **保存核心信息便于恢复**：任何时刻打开索引（`current.md` / `dev_last.md`）即可在**有限上下文**内恢复到可继续工作的程度。
2. **避免无关信息污染上下文**：索引层只放「结论与位置」，**细节下沉**到主题文件 / `tmp/` 文档；索引不承载过程性明细。

**推导的分层原则**：

| 层 | 载体 | 粒度上限 | 读者 |
|----|------|----------|------|
| 索引层 | `.openfeel/dev/current.md`、`users/{username}/dev_last.md` | 条数硬限 + 字数硬限 | 用户 / 会话启动 |
| 主题层 | `users/{username}/dev_last/{english-name}.md` | ≤10 条、≤300 字/条 | 按需读取 |
| 详情层 | `users/{username}/tmp/` 文档 | 不限（索引仅记**地址**） | 显式指定时读取 |

**归档落点**：`current.md` 被轮换出的旧记录归档至 `.openfeel/dev/current_archive/`（公共域、纳入版本管理）；`dev_last` 超期记录**不归档**（用户约束），仅在主题数超限时**就地收敛**（见 kb/patterns.md #就地收敛而非归档）。

**判据**：任何「跨会话恢复状态」的索引文件，先问「打开它能否在有限上下文内恢复工作」，再问「过程性明细是否应下沉」——两条目的冲突时，**恢复性优先**（细节下沉，但地址必留）。

**参见：** v1.1.2-stage-53（D1~D10，5 op：`627805e`/`3792b77`/`ae0d6e2`/`4377822`/`27ce06e`）；`templates-data/agents-md/{zh-CN,en}.md` 工作区结构节；kb/patterns.md #索引 + 主题文件的分层记录模式

## [+] 团队文件 vs 本地文件的职能三分：跨用户操作 / 本地恢复 / 交接传递 (2026-10-01)

**问题**：`current.md` 与 `dev_last.md` 职能原先部分重合（都写「正在做什么」），导致「公共进度」与「个人状态」边界模糊、内容互相污染。

**裁定基线（v1.1.2-stage-53）**：

| 文件 | 定位 | 更新时机 | 内容边界 |
|------|------|----------|----------|
| `.openfeel/dev/current.md` | **团队文件**（公共域、跨用户、纳入版本管理） | **仅个人提交时更新** | 整体信息；无 agent 细节、无 `## @成员` 段；≤5 条记录；旧记录自动归档 |
| `.openfeel/users/{username}/dev_last.md` | **本地文件**（私域、被 `.gitignore` 忽略） | 会话末尾**更新**（非整文件覆盖） | 本地状态恢复 + 操作记录；活跃主题 ≤5；含「公共交接区」（仅位置 + 摘要） |

**三分职能**：① **跨用户操作/整体进度** → `current.md`；② **本地状态恢复**（上次操作、流水线快照、待续、决策、经验）→ `dev_last.md` 及其主题文件；③ **交接传递**（跨会话/跨用户传信息）→ `dev_last.md` 的「公共交接区」，**只列交接文档位置 + 核心摘要**，不描述细节。

**判据**：写入前先判「这条信息是给谁看的」——团队看 → `current`；只有自己/下次会话看 → `dev_last`；交给他人 → 交接区。公共域文件**不得**承载私域待续与 agent 级流水。

**实证**：旧 `current.md` 的「非阻塞遗留清单（登记项 7 条）」本质为私域待续，迁移时**移入 `dev_last/pending.md`** 而非留在公共 `current`；`current.md` 82 行 → 14 行、`dev_last.md` 53 行 → 34 行索引 + 5 主题文件。

**参见：** v1.1.2-stage-53 D2/D3/D7、A8；`plan/v1/stage-53/plan.md` §三 职能划分；kb/architecture.md #上下文预算治理架构

## [+] 仓库自身不再保留项目级部署资产：框架资产全局化后的项目级精简（supersede N1）(2026-10-01)

**背景**：框架资产（9 agent / 17 skill / 全局 `AGENTS.md` / 全局 `opencode.jsonc`）在 v1.1.1 起已由 `openfeel setup` 统一部署到全局 `~/.config/opencode/`，但 OpenFeel 仓库自身仍保留一套**项目级部署实例**——根 `AGENTS.md`、根 `opencode.jsonc`、`.opencode/{agents,skills,ADAPTER.md}`（共 27 个受管文件），由 `build.js` 步骤 8「自举重生成」产出。由此形成**双份资产**：同一批 agent/skill/约束在项目级与全局各有一份，二者可漂移且需人工维持同步。

**决策（v1.1.2-stage-55）**：仓库自身**不再保留**项目级部署资产——删除根 `AGENTS.md`、根 `opencode.jsonc`、`.opencode/{agents,skills,ADAPTER.md}`，并删除 `build.js` 步骤 8（防复活）；`.opencode/` 仅保留 opencode 运行时目录（`node_modules`/`package.json`/`package-lock.json`/`.gitignore`）。本决策 **supersede** 原「全局部署架构（stage-37）N1：仓库自身 `.opencode/` 不动」（见本文档 #全局部署架构 条目 L400 追加的 supersede 注记）。

**关键不变量（顺序）**：**刷新全局严格早于删除项目资产**。执行顺序为「模板迁入 → 刷新全局（`setup`）→ 删除」。若顺序颠倒，删除后即出现「项目级已删、全局仍旧」的**降级运行**窗口；顺序正确则删除时全局已就绪，可无缝接管（生效仅需重启会话）。

**设计理由**：
1. **全局部署已完备**——`setup` 幂等、走受管区三态 + 写前备份，可随时重建全局资产；
2. **消除双份资产漂移**——同一语义句/同一 agent 定义不再两处存放（历史教训：`templates/BUG-001`/`002` 双源不同步）；
3. **消除 build 复活负担**——自举实例是构建产物，删除生成步骤后 `npm run build` 不再复活它们。

**适用边界**：本决策**仅针对 OpenFeel 仓库自身**；**目标项目**（`openfeel init` 部署的项目）的 `.opencode/` 相关语义、legacy 检测（`migrate`）与保留清单**不受影响**。

**可操作结论**：判断「某项目级受管资产能否退役」的判据＝① 是否已有**幂等的全局/公共部署源**可接管；② 删除是否**受 git 跟踪可恢复**（`git checkout <sha> -- <paths>`）；③ 是否有**构建步骤会复活**它（有则须连同删除）。三者齐备再动手，并把「刷新早于删除」写为显式不变量。

**参见：** v1.1.2-stage-55（op-002 门 B / op-003 删除 + 防复活 / op-004 supersede）；`plan/v1/stage-55/plan.md` §四 安全门；`.openfeel/manual/core/build.md` #步骤 8；kb/patterns.md #真实全局目录操作的安全程序、#supersede 历史决策的追加式记录；kb/troubleshooting.md #自举实例移除须连带删除 build 生成步骤

## [+] 四类日志边界：CLI 进程运行日志 / 工作区审计 / 流水线状态审计 / 部署更新记录 (2026-10-02)

**问题**：项目内已存在三种「日志/记录」，stage-58 新增 CLI 进程运行日志后易与三者混淆——四者都叫「日志」，但**归属、载体、语义、消费者**完全不同，混用会造成治理混乱与错误排查。

**四类边界（stage-58 裁定）**：

| 类别 | 载体 | 归属 | 语义 | 消费者 |
|------|------|------|------|--------|
| **CLI 进程运行日志** | `~/.openfeel/cli/logs/openfeel-YYYY-MM-DD.log` | **全局（跨项目）** | CLI 进程的命令/结果/错误（`[ISO][LEVEL][pid] msg`，恒 UTF-8，默认 on） | 开发者诊断 CLI 行为 |
| **项目工作区审计日志** | `.openfeel/log/**`（`public-logger`） | **项目** | 团队级重要事件（里程碑、阶段闭环、Bug/REV 严重问题） | 团队查阅 |
| **流水线状态审计** | `flow.json.log[]` | **项目** | 结构化状态事件（阶段注册/推进、op 注册、attempt） | 工具/Agent 追踪状态 |
| **部署更新记录** | `update_infos.md` | **全局/项目双资产** | setup/update/migrate 的部署/备份/异常条目 | 用户/Agent 查部署沿革 |

**判据（写入前先判「这条信息属于谁」）**：按**归属层级**（全局 vs 项目）与**语义**（进程诊断 / 团队事件 / 状态事件 / 部署沿革）两维二分；**不共用载体、不互相追加**。新增日志类能力时先回答「它是否已有归属」，避免第四类无边界生长。

**关键设计约束（stage-58）**：CLI 运行日志**恒 UTF-8**（与 console 输出编码完全解耦，见 kb/patterns.md #CLI 输出编码自适应单一咽喉模式）、**不记录 stdout 内容**（仅 argv + 状态 + 错误，防隐私/体积）、**best-effort**（写失败吞掉不中断 CLI）、`error` 语义 = 「命令处理中抛出的异常」（解析期错误经 `program.error()` 直接 exit、不入日志，仅文档化）。

**实证**：v1.1.2-stage-58 B-1~B-8（`src/core/runtime-log.ts` + `global-paths.getCliLogsDir()`）；manual `core/runtime-log.md` 写明四类边界与 REV-002 error 边界；`bin/openfeel.js` 单一咽喉 install（库侧默认 no-op）；真实 `~/.openfeel/cli/logs/` 在 `npm test` 前后零变化（测试不写真实日志）。

**参见：** v1.1.2-stage-58 B-1~B-8、REV-002；`.openfeel/manual/core/runtime-log.md`；kb/patterns.md #CLI 输出编码自适应单一咽喉模式、#库侧默认 no-op + 进程入口 install

## [+] 状态/相位单一事实源：status 为 phase 的粗粒度投影，phase 为唯一事实源 (2026-10-03)

**背景（v1.1.4-stage-62，问题 4/5/7）**：`stage.status`（`status.md`「状态」/ `flow.json` `stages[].status`）原先由 `mapPhaseToStageStatus(phase, currentStatus, testEnabled)` 派生，却存在两个歧义源：① 配置门禁键 `test_enabled=false` 时中间相位 `review_passed` 被投影为**终态 `'done'`**；② `autoRepairInconsistency` 在 `status==='done' && phase!=='done'` 时**反向**强制 `phase='done'`。二者叠加形成**单向锁**：`flow advance --to review_passed` 置 `status='done'` → 下一步 `advance --to test_pending` 入口 auto-repair 把 `phase` 锁 `done` → `findPhasePath(done → test_pending)` = `no-path`，确定性复发（**6/6**）。

**架构结论**：**`phase` 是唯一事实源，`status` 是 `phase` 的粗粒度投影**。

- `stage.status = mapPhaseToStageStatus(phase, status)`：任何 `status` 都可由 `phase` 重新投影得到；`mapPhaseToStageStatus` **不含 `testEnabled` 形参**（该配置键已全链移除），`review_passed` **恒返回 `'review_passed'`**（**中间相位不投影终态 `done`**）；`review_failed → 'review_failed'`、`test_passed → 'testing'`、`archiving → 'archiving'`、`done → 'done'`，default → `currentStatus`。
- **不变量**：任何**非 `done`** 相位都不得投影为 `'done'`（`STAGE_STATUS_VALUES` 值域校验的派生依据：`['planned','review_failed','review_passed','testing','archiving','done']`）。
- **对账/修正只允许 `phase → status` 单向**：`autoRepairInconsistency` 的 `status=done && phase≠done` 分支改为「以 `phase` 为权威，将 `status` 修正为投影值（撤销非法 `done`）」，**绝不** `status → phase` 前推；`phase=done && status≠done` 仍同步 `status='done'`（合法方向）。
- **`flow.json` 损坏时以 `phase` 为准**：`reconcileStatusMd`（出口 `flow health --fix`）的权威值 = `mapPhaseToStageStatus(phase)`，**仅回写 `status.md`「状态」行**。

**已知边界（REV-001，medium 非阻塞）**：`mapPhaseToStageStatus` 的 `default` 分支返回 `currentStatus`——当调用方传入 `currentStatus='done'` 且 `phase` 落在 default 分支（`exec_running` / `test_pending` 等 9 相位）时，投影值仍为 `'done'`，与「非 done 相位不投影 done」不变量在该输入组合下**破缺**；auto-repair 对此 **no-op 假阳性**（detail 报告已撤销但值未变）。**锁不复发**（auto-repair 不再改 `phase`）、路径求解只依赖 `phase`，故不冲突决定性验收；建议后续阶段收敛（default 分支对 `currentStatus==='done'` 返回安全中间值，或 detail 明示 no-op）。

**实证**：v1.1.4-stage-62（commits `26629e6` / `abcab76` / `fa7f4f8`）；`npm test` 61 文件 / **1023 用例** 0 skipped / 0 failed、`tsc` 0、`lint i18n` 730、`lint kb` 0；fixture 实测 `{phase:review_passed, status:done}` 经 auto-repair 后 `phase` **不变**、`status='review_passed'`，`advance --to test_pending` exit 0。

**参见：** v1.1.4-stage-62（plan §二/§五；op-001/op-002）；`src/core/flow-manager.ts` `mapPhaseToStageStatus` / `autoRepairInconsistency` / `reconcileStatusMd` / `STAGE_STATUS_VALUES`；kb/troubleshooting.md #autoRepairInconsistency 干扰组合条件推进路径；kb/patterns.md #auto-repair 仅 phase→status 单向
