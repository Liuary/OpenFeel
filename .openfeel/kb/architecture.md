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

> **更新于 2026-10-10（v1.1.6-stage-68）**：**skill 权威源迁至中立共享源**——17 个 skill 由 `templates-data/opencode/skills/` 整体迁至 `templates-data/skills/`（`git mv` 纯重命名，**逐字节不变**），为 v1.1.6「多 harness 并存」铺路（Claude Code 适配器将复用同一 skill 源；**agents 与约束文件仍按 harness 独立源**）。单源语义演进为：agent/instruction 源自 `templates-data/opencode/`，**skill 源自中立共享源 `templates-data/skills/`**。
>
> - **build.js 读点重指**：删死常量 `TEMPLATE_OPENCODE_SKILLS_DIR` → 新增 `TEMPLATE_SHARED_SKILLS_DIR = resolve(TEMPLATES_DATA_DIR, 'skills')`；`SKILLS_DIR = TEMPLATE_SHARED_SKILLS_DIR`（步骤 4 注入 `SKILL_DEFINITIONS` 与 `validateSkillDefinitions` 随变量自动生效）；步骤 6 `generateOpencodeSkillTemplates` 4 处 + `validateOpencodeSkillDefinitions` 3 处**显式改读共享源常量**（注入对象 `OPENCODE_SKILL_DEFINITIONS` 名/锚点/结构不变）。
> - **双注入对象仍不合并**：`SKILL_DEFINITIONS`（`update.ts`，供 `openfeel update`）与 `OPENCODE_SKILL_DEFINITIONS`（`template-loader.ts`，供 `openfeel init`）消费方不同，**仅数据源改共享、对象不合并**（承 D36-4）。
> - **防复活断言扩展**：`validateSingleSourceConsistency` 的冗余树断言由「`templates-data/agents` / `core-instructions`」扩为**含 `templates-data/opencode/skills`**——迁移后旧树若复活，`npm run build` 立即报错（**实测临时复活 → EXIT=1，复删后通过**）。`templates-data/opencode/` 保留 `agents` + `ADAPTER.{en,zh-CN}.md`（合法现役源，未被断言纳入）。
> - **零内容变更验证**：`git diff -M --numstat` 17 个 `SKILL.md` 内容列全 `0/0`（纯重命名）+ `npm run build` ×2 幂等 + 生成侧「注入内容 ≡ 共享源逐字节」（行尾归一化）；测试路径 5 处同步（`templates.test.ts:11` + `template-loader.test.ts:189/397/403/404`）+ 新增 `templates-migration.test.ts`（T4.1~T4.4）。
> - **实证**：v1.1.6-stage-68（commits `89978e7`/`966bd4b`）；`npm test` 65 文件 / 1139 用例 0 skipped、`tsc` 0、`lint i18n` 761、`lint kb` 0、build ×2 幂等不复活。
> - **参见**：v1.1.6-stage-68 plan/ops、`kb/patterns.md #零行为变更改造的验证方法`（零内容变更变体）、`docs/claude-code-adapter-plan.md`（多 harness 蓝本）。

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

## [+] Claude 内容源自立与运行时 3 API：多 harness 内容面第二实现 (2026-10-11)

**背景：v1.1.6-stage-69（Claude 内容适配，v1.1.6 最重阶段）**——v1.1.6 目标为「多 harness 并存」（opencode + Claude Code）。内容面按**可共享性二分**：

- **可共享内容 → 单源**：skills 归类为**中立共享源** `templates-data/skills/`（v1.1.6-stage-68 由 `opencode/skills` `git mv` 迁入，两 harness 共用）。
- **平台专有内容 → 各 harness 独立源**：**agent 定义**与**全局约束**按 harness 独立——Claude 侧新建 `templates-data/claude/{agents/{zh-CN,en}/*.md（9×2，含 `feel`）, constraint/{zh-CN,en}.md}`；opencode 侧维持 `templates-data/opencode/agents/**` + `templates-data/agents-md/**`。

**运行时 3 API（build 生成段消费，禁手改）**：

| API | 语义 |
|-----|------|
| `loadClaudeConstraintTemplate(lang)` | 返回 Claude `CLAUDE.md` 约束模板；语言回退 `zh-CN` + 缺失抛错 |
| `loadClaudeAgentTemplate(lang, agentId)` | 返回 Claude agent 模板（9 个，含 `feel`）；语言回退 + 缺失抛错 |
| `listClaudeAgentIds(lang)` | 列出 Claude agent id（**9**，含 `feel`） |

- **注入锚点**：`CLAUDE_AGENT_TEMPLATES`（双层 Record）/ `CLAUDE_CONSTRAINT_TEMPLATES`（单层 Record）由 `build.js` 生成；主流程 **6→8 步**（追加 2 生成 + `validateClaudeTemplates`）。
- **单源不变量**：Claude agents 键集 == opencode agents 键集（均 **9**，含 feel，**不再 −1**）——**键集断言** `assertKeySetsEqual`（内容按设计不同，不比内容）。
- **阴性不变量**：Claude agent 模板不含 `mode:`/`permission:`/`reasoning_effort:`/`.opencode/`；`templates-data/claude/skills` **不存在**（skills 走共享源，防发散）。
- **集成契约（交付 stage-71/73）**：`templates-data/claude/**` + 注入锚点 + 3 API；**本阶段不写 `settings.json`**（归 stage-73）、不接部署编排（归 stage-71）。

**设计理由**：agent/约束深度耦合 harness 字段与工具名（Claude `tools`/`effort`/`color` vs opencode `mode`/`permission`/`reasoning_effort`），强求单源会引入大量条件分支且不可读；而 skills 是平台中立操作步骤，天然可共享。二分兼顾「复用」与「适配准确」。

**实证**：v1.1.6-stage-69（8 commits `de76f89`~`45f2093`）——产物 9×2 + 约束 2；build ×2 幂等（SHA256 一致）；`npm test` **66 文件 / 1158 用例** 0 skipped / 0 failed；`tsc` 0；`lint i18n` 761（不新增）；`lint kb` 0；审查 passed（REV-69-001 blocking 修复 closed）。

**参见：** v1.1.6-stage-68（skills 迁共享源）/ v1.1.6-stage-69（本条目）；`templates-data/claude/**`；`build.js`；`src/core/template-loader.ts`；kb/architecture.md #模板单源架构、#多语言模板数据管线；kb/patterns.md #Claude Code agent frontmatter 结构化映射、#模板锚点注入的鸡生蛋处置、#单源一致性断言键集 vs 内容；manual/core/template-loader.md、manual/core/build.md

## [+] 多 harness 部署编排架构：内容面就绪后接入 setup/update 双分支 + supportedTools enabled 默认门控 (2026-10-11)

**背景：v1.1.6-stage-71（部署编排与命令面）**——v1.1.6 前三阶段（stage-68 skills 中立共享源 / stage-69 Claude 内容源 / stage-70 skills 双平台分节）只备齐**内容面**；本阶段把 Claude 内容接通到 `openfeel setup` / `openfeel update` 的**部署编排面**，并严守「默认行为逐字不变」。

**四层落点**：

| 层 | 落点 | 要点 |
|----|------|------|
| **路径面** | `src/core/global-paths.ts` 追加 5 函数 | `getClaudeConfigDir/getClaudeAgentsDir/getClaudeSkillsDir/getClaudeMdPath/getClaudeSettingsPath`；`CLAUDE_CONFIG_DIR` **函数体内读 env** + `.trim()`，空/空白回落 `~/.claude`；延续 homedir 单点（自动纳入 `vi.mock('node:os')` 隔离） |
| **编排面** | `src/core/setup.ts` + `src/core/update.ts` 双分支 | `setupGlobalFramework(lang, tools=['opencode'])`；`updateProject` 早退改「**两工具都未选才空**」+ `wantOpencode`/`wantClaude` 分支；claude 分支 = `CLAUDE.md` + **9 agents** + **18 共享 skills**（复用 `deployGlobalAsset`，CLAUDE.md 走受管区三态），**不写 `settings.json`**（归 stage-73） |
| **门控面** | `src/core/update.ts` `supportedTools` + `src/commands/update.ts` | claude 转**正式条目** `{id:'claude', enabled:false}`（原注释删除）；**消费点由 `map(t=>t.id)` 改 `filter(t=>t.enabled).map(t=>t.id)`**（R-5 高危修复）——`enabled:false` 是「默认不启 Claude」的唯一数据源 |
| **命令面** | `src/commands/{setup,update}.ts` | `--tools <逗号列表>`；`parseToolList`（`core/update.ts` 单一实现，保序去重、空串/纯空白非法）→ 非法值 **exit 1** 且 **fail-fast 前置**（不触发 auto-init/写盘） |

**默认非回归不变量**：默认 `setup` / `update <path>` 后 `~/.claude/` **零变化**；既有 `--json` 契约、`setup` 无参输出/退出码逐字不变；仅 opencode 时的重启提醒逐字不变。以**隔离 HOME 端到端实测**取证（`USERPROFILE`/`HOME` 重定向 + `CLAUDE_CONFIG_DIR` 置空）。

**重启提醒按 harness 组合参数化**：部署后重启提醒由硬编码 opencode 改为按实际变更 harness 动态拼接，文案入 i18n 以 `{harness}` 占位（`update.restartHarnessTmpl`/`setup.restartHarnessTmpl` + `update.claudeReloadHintTmpl`），`isTTY` 守卫、非交互静默。

**备份编排（D-CFG）**：`computeBackupRel` 对越出 HOME 的路径不再抛错，改 `global-external/<sha8>/<规范化尾段>` fallback（`sha8 = sha256(resolve(absPath)).slice(0,8)`），使 `CLAUDE_CONFIG_DIR` 指向 HOME 外时的 `settings.json` 备份（stage-73）可行；HOME 内与 project 分支零回归。

**i18n**：7 新键 + 6 修订键（去 `（opencode）` 硬编码、harness 中性），基线 761→**768**（双处登记）。**边界**：`settings.json` 注入归 stage-73；不改版本号（归 stage-72）/ CI。

**交付给 stage-73 的集成契约**：`getClaudeSettingsPath()`（尊重 `CLAUDE_CONFIG_DIR`）+ `setup`/`update` 的 claude 分支接点 + `backupFileBeforeWrite` D-CFG fallback——stage-73 在 claude 分支扩展「写 `settings.json`」（须在 lock 之外，对齐 jsonc 备份口径）。

**实证**：v1.1.6-stage-71（4 commits `e753217`/`7287355`/`62fcb43`/`cdd0953`）；CLI 端到端 `setup --tools claude` → `~/.claude` 仅 `{agents 9, skills 17, CLAUDE.md}`（无 settings.json）；双 harness 二次 setup skipped=**54**；`npm test` **66 文件 / 1189 用例** 0 skipped；`tsc` 0；`lint i18n` **768**；`lint kb` 0（368 引用）；审查 passed（REV-71-001/002 low 非阻塞 open）。

**参见：** v1.1.6-stage-71（plan §二/§八；op-001~004）；`src/core/{global-paths,setup,update,backup}.ts`；`src/commands/{setup,update}.ts`；kb/architecture.md #全局部署架构、#Claude 内容源自立与运行时 3 API；kb/patterns.md #工具注册表 enabled 门控默认守卫、#环境变量路径函数的函数体内读 env 可测试性、#备份 HOME 外 fallback 的 sha8 口径、#重启提醒按 harness 组合参数化；manual/core/{setup,update,global-paths,backup}.md、manual/cli/{setup,commands}.md

## [+] 双模式转移表选择：getValidTargets 单一取表点 + stage→mode→表 三元解析（防第二信源） (2026-10-11)

**背景：v1.1.7-stage-74（双模式引擎，v1.1.7 首阶段）**——「快速迭代模式」（fast）与既有完整链路（full）需共存于同一流水线。若「校验/推进/路径求解/展示」各自维护一份转移表判据，必然出现「同 (stage, mode) 下各出口接受集不一致」的第二信源缺陷（呼应 kb/architecture.md #状态/相位单一事实源 的同族问题）。

**架构结论：转移表选择收敛为三元解析 `stage → mode → 表`，且只有一个取表点。**

- **唯一取表点**：`getValidTargets(fromPhase, mode: WorkflowMode)`（`flow-manager.ts`）。`mode` **无默认值**——编译期强制调用点显式传入，从类型层面封死「漏传 mode 落回某默认表」的可能。取表法则唯一为私有 `resolveTransitionsForMode(mode)`：`fast → this.fastTransitions ?? getDefaultPipelineConfig('fast').transitions`；`full → this.pipelineConfig?.transitions ?? getDefaultPipelineConfig().transitions`。
- **四调用点全部显式传 stage 派生 mode**（源码检索：定义 1 + 调用 4）：`hasTransition` / `getAvailablePhases` / `findPhasePath` / `canAdvance`，各自经 `resolveStageWorkflowMode(stageName).value` 派生；间接消费者 `buildDownstreamPhases`（经无参 `getAvailablePhases` → `current.stage`，出口 `flow status --verbose`）。**任何 `getValidTargets` 调用点不得使用默认 mode**（静态约束）。
- **展示与校验同源**：`flow phases` 的运行时转移表经 `getPipelineTransitions(mode)`（同一 `resolveTransitionsForMode`），杜绝「展示与实际不符」；访问器 **无参 = full**（零回归既有断言），fast 分节归下游命令面。
- **phase 枚举零新增**：fast 仅复用既有 15 phase 的子集（**v1.1.7-stage-76 T7 起为 8 键 + `done` = 9 条目**，原「7 键 + `done`」），`PIPELINE_PHASES` 未动——「模式」是**图的裁剪**而非新相位。
- **防第二份表**：`FAST_TRANSITIONS` 常量仅 `flow-manager.ts` 定义 + `getDefaultPipelineConfig('fast')` 消费；命令层/模板层零副本（检索 `plan_pending:\s*\[|transitions:` in `src/commands/` = 0）。`advancePhase`（deprecated，不读转移表）不在读点清单内。
- **模式语义边界**：`config effective` / `flow status --verbose` = **当前阶段域**（无参）；`resolveStageWorkflowMode(stageId)` 显式 stageId = **任意阶段域**（`flow mode --stage` / 表选择），二者不混用。

**设计理由**：mode 是「同图不同裁剪」，若让每个出口自带缺省 mode，fast/full 混用项目会静默走错表。把「哪张表」收敛到**单一函数**，并用**必传形参**把「选择责任」推给调用点（每个调用点都知道自己在操作哪个 stage），是「单一信源 + 防漏传」的最简结构。

**已知边界**：`fast_transitions` 空对象 `{}` 经 `Object.keys(...).length > 0 ? data : null` 判定为**等同缺失** → 回落内置快线表（REV-74-009；避免「fast 全链静默死锁」）。本仓 `.openfeel/pipeline.yaml` 覆盖 full 表（缺组合键 `review_passed|test_passed`），故「本仓运行时 full 表 ≠ 内置 full 表」，两条验收线须区分（REV-74-004）。

**实证**：v1.1.7-stage-74（op-002/op-003/op-004；执行报告 `.openfeel/users/Liuary/log/op-stage74-report-2026-10-11.md`）——`getValidTargets` 定义 1 + 调用 4 均显式传 mode；`FAST_TRANSITIONS` 仅 1 文件；T7.10 断言同 (stage,mode) 下 `canAdvance`/`findPhasePath`/`getAvailablePhases`/`flow phases` 四者键集双向一致；`flow phases --json` 既有键逐字。

> **supersede（2026-10-11｜v1.1.7-stage-76 T7）**：fast 快线表由 **8 条目**（7 流转键 + `done`；`plan_pending → plan_passed`）修订为 **9 条目**（8 流转键 + `done`）——`plan_pending → ['plan_review']` + 新增 `plan_review: ['plan_passed', 'plan_pending']`，即 **fast 下计划审查（`plan_review`）不再跳过**（reviewer 单轮必过）。本节上文「7 键 + `done`」口径已被本轮取代；引擎单一取表点传导（未改 full 表 / phase 枚举 / 命令面）。详见 `dev/decisions.md` ADR-010（2026-10-11 需求变更 T7 修订）、kb/patterns.md #工作流快线必经计划审查。

**参见：** v1.1.7-stage-74（plan T3/T4；op-002/003/004；REV-74-001/002/003/004/009）；`src/core/flow-manager.ts` `getValidTargets`/`resolveTransitionsForMode`/`resolveStageWorkflowMode`/`FAST_TRANSITIONS`；`src/core/pipeline-schema.ts` `FastTransitionsSchema`；kb/architecture.md #状态/相位单一事实源、#部署级默认翻转的单一权威；kb/patterns.md #带 stage 形参的级联解析、#模式标记三层载体与记忆语义；manual/core/flow-manager.md

## [+] 部署级默认翻转的单一权威：DEFAULT_CONFIG 与 schema 逐键默认同键值 (2026-10-11)

**背景：v1.1.7-stage-74（T1/T6，裁定 E）**——`auto_advance` 部署级默认由 `disabled` **翻转为 `enabled`**（新建项目默认开启自动闭环），同时新增 `workflow_mode`（default `fast`）。翻转点散落多处（`ConfigDefaultsSchema` 逐键 `.default()`、`DEFAULT_CONFIG`、`DEFAULT_PROFILE`、`ProfilePreferencesSchema`、模板、测试断言），易出现「同键不同默认」。

**架构结论：级联 `builtin` 层默认值的**单一权威 = `DEFAULT_CONFIG`**；`ConfigDefaultsSchema` 的逐键 `.default()` 必须与 `DEFAULT_CONFIG` **同键值**。

- **翻转清单（裁定 E / B）**：`DEFAULT_CONFIG.auto_advance = 'enabled'`、`ConfigDefaultsSchema.auto_advance` 逐键默认同步 `'enabled'`；`DEFAULT_CONFIG.workflow_mode = 'fast'`、`ConfigDefaultsSchema.workflow_mode` 默认 `'fast'`。
- **为何 schema 默认必须同步**（REV-74-011 复核为**必要**）：`resolveConfigDefaults()` 缺失键路径为 `ConfigDefaultsSchema.shape[key].safeParse(defaults[key])`；若 schema 逐键默认仍为旧值 `'disabled'`，则对 `undefined` 判定成功并返回 `'disabled'`，**覆盖** result 初始化的 `DEFAULT_CONFIG.auto_advance`（`'enabled'`）→ 「全默认 = enabled」的语义必然破缺。故二者必须同键值（单一权威）。
- **有意** **不** **翻转**：`DEFAULT_PROFILE` / `ProfilePreferencesSchema`（`config.ts`）**保持 `disabled`**——画卷层 = 用户**个人偏好**，与「部署级默认」无关（REV-74-005）。级联最底层 `builtin` 取 `DEFAULT_CONFIG`，profile 层只在画像文件**真实存在且显式声明**时兜底。
- **副作用面**：`buildCascadeConfig` 的 configDefaults 段按 `Object.entries(defaults)` **仅对显式存在**的键 safeParse 并以原值回填，`.default()` 在该路径**不触发** → `config effective` / `flow status --verbose` 的来源标注不受影响。

**设计理由**：默认值是「多处书写、单点解读」的典型散弹区。把 `DEFAULT_CONFIG` 定为唯一权威、要求 schema 逐键默认对齐，可在「缺失键回退 schema 默认」与「级联 builtin 回退 `DEFAULT_CONFIG`」两条路径上得到同值，消除「schema 默认 ≠ 级联默认」的隐性分叉。

**实证**：v1.1.7-stage-74——`ConfigDefaultsSchema.auto_advance` 由 `disabled→enabled`（executor 自陈偏差，REV-74-011 独立复核确认为**必要**并接受）；`resolveConfigDefaults` 四键实测全 `enabled`/`fast`；隔离 HOME + 无 `config.yaml` → `config effective auto_advance` = `enabled [builtin]`（T7.5 CLI 半段，REV-74-008 补落点）；`DEFAULT_PROFILE`/`ProfilePreferencesSchema` 实测维持 `disabled`。

**参见：** v1.1.7-stage-74（plan T1/T6；op-001；REV-74-005/008/011）；`src/core/config.ts` `DEFAULT_CONFIG`/`ConfigDefaultsSchema`/`resolveConfigDefaults`/`DEFAULT_PROFILE`；kb/architecture.md #双模式转移表选择、#config.yaml meta.version 语义；manual/core/config.md

## [+] 版本分片归档架构：按版本前缀分片 + 三段归档单元 + meta.archived_versions 轻量索引 (2026-10-12)

**背景：v1.2.0-stage-78（主题二「flow.json 归档拆分」先行执行）**——`flow.json` 单文件随版本无限累积（实测 HEAD `84951ce`：**406280 B / revision 914 / 78 阶段全留 / `log[]` 1313 条**），每次 `flow status`/`overview`/Agent 读状态都吞整文件（污染上下文窗口），`save()` 每次重写全文件（写放大）。用户诉求：「flow 文件只保留近期事务和未归档事务，已归档的历史信息按版本号归档」。

**架构结论：归档粒度 = 版本（stageId 前缀 `vX.Y[.Z]`），归档单元 = `stages` 条目 + 关联 `reviews` + 关联 `log` **三段**，`meta`/`pipeline` 保留。**

- **归档落点**：`.openfeel/flow-archive/{version}.json`（**新建目录**，与既有 `openfeel archive`（阶段摘要 → `.openfeel/log/archive-{stage}.md`）**职责分离**）；结构 `{ schemaVersion:1, version, archived_at, stages, reviews, log, counts }`（裁定 U）。目录**不纳入 `WORKSPACE_DIRS`**、零 gitignore 改动、按需 `mkdirSync` 幂等创建（Q2 定稿）。
- **切分分组键（单一权威 `parseStageId`，禁自写正则）**：`stages` 按解析版本前缀分组；`reviews` 按 `op` 前缀（`<stageId>.op-NNN` 或 `<stageId>`，点号锚定正则剥离 opId 段）；`log` 按 `detail.stageName`。**缺失 / 不可解析一律保留在 flow.json**（`detail.stageId`/`detail.stage` 等他键不看——保守裁定 T，防误搬）。
- **轻量索引**：`flow.json.meta.archived_versions: string[]`（追加 + 幂等去重，裁定 Q）——供 stage-80 跨版本 deps 判定（`plan stage add --deps` 对已归档版本视为已满足）；**展示层不读归档**。
- **写盘复用 fs 工具底座**：`withFileLock`（**独立锁名 `flow-archive`**）+ `atomicWriteFileSync`（`backup:false`，同版本重归档 = 幂等覆盖写）；flow.json 变更走既有 `save()`（revision 乐观锁 + `.bak`）。
- **不自动归档**：不挂 advance 钩子，触发 = 显式命令（可预览 `--dry-run`、可审计、可回滚）。
- **零常规路径触碰（阶段不变量）**：本阶段产物（`src/core/flow-archive/**`）仅被测试 import；`src/commands/**`/`src/cli/**`/`flow-manager.ts` 零 import（命令面归 stage-79）。**契约面 = 函数签名级**（12 导出交 stage-79/80 直接消费，禁命令层第二套解析/切分）。

**设计理由**：把「版本收官后的历史搬运」独立为版本粒度分片，收缩活跃 `flow.json` 体积，既兑现用户「避免污染上下文窗口」诉求（本仓为首个 dogfood 受益者），又将「既有三段切分」与「未来需求层（可跨版本）」的语义复杂度分离（归档先行 = 失败可回退面最小）。

**参见：** v1.2.0-stage-78（plan T1~T3；op-001/002；REV-78-006/015）；`src/core/flow-archive/{archive-file,grouping,archive-ops}.ts`；`src/core/plan/path.ts`（`parseStageId`）；`src/core/fs/`（`withFileLock`/`atomicWriteFileSync`）；roadmap `v1.2.0.md` §主题二；kb/patterns.md #归档引擎分层与独立锁模式；kb/troubleshooting.md #可选字段「读侧补齐」的序列化副作用；manual/core/flow-archive.md

## [+] 归档命令面架构：引擎面/命令面分层 + 判据门前置 + 两步事务顺序 + `pipeline` 处置同事务（owner 单一） (2026-10-12)

**决策**：把 stage-78 的**引擎能力**（纯函数 + IO 原语）暴露为 **CLI 控制**的命令面时，采用如下四层约束（`flow archive` 子命令组）：

1. **面分层不越界**：命令面（`src/commands/flow.ts` 的 `flow archive <version>` / `list` / `show`）只做**编排与呈现**；一切版本解析 / 分组切分 / 判据过滤 / 索引管理 / `pipeline` 处置一律经 `src/core/flow-archive/` 的**导出 helper**（**禁命令层第二套解析/切分**，契约 = 函数签名级）。子命令组挂既有 `flow` 命令，**不改顶层命令树**；与既有顶层 `openfeel archive <stage>`（阶段摘要 → `.openfeel/log/archive-*.md`）**职责分离**。
2. **判据门前置（两步）**：① **版本存在性门**在前——`listArchivableCandidates(data)` 无该 `version` 候选（版本不存在 / 未注册于活跃 flow.json，含已归档版本）→ **exit 1 零写盘**（防空归档覆盖既有归档；`splitForArchive` 对不存在版本返回空集不抛错 + 判据门「全 done」在无候选时 vacuous-true，构成危险源）；② 判据门在后——`allDone !== true`（未 done 阶段）或 `listBlockingOpenRevsForVersion` 非空 → exit 1 零写盘，列未满足项。**覆盖写仅在活跃集仍含该版本条目时允许**（重复执行重跑收敛）。**不设 `--force`**。
3. **blocking 谓词单一**：`r.blocking !== false && r.status === 'open'`（`blocking` **缺省 = 阻塞**），与全仓唯一谓词同源；版本作用域过滤经 core 单一 helper（复用 `versionOfReviewOp` 同源解析）。
4. **两步事务顺序 + `pipeline` 处置同事务**：先 `writeArchiveFile`（新增，独立锁 `flow-archive`，与 flow 锁**不嵌套**）→ 成功后内存移除三段 + `addArchivedVersion` + `applyArchivePipelineDisposition`（**纯内存**）→ 最后 `mgr.save()`（后，捕获并发冲突 → exit 2）。顺序不变量：归档文件写成功前**不改** `flow.json`；`save()` 失败 → 归档文件已存在（**幂等可重跑**）、flow.json 原样、exit 2。`pipeline.current` 属被归档版本 → `{stage:'',op:''}`；`phase` 按归档后活跃集重算（**空集 → `'active'`**，与宏观 done 判定空集守卫同效）。处置 **owner = 本阶段**（与归档同一 `save()`），下游 stage-80 仅消费点适配、**不实现处置**。

**设计理由**：破坏性命令（历史永久搬运、无 unarchive）的安全性不靠运行时强制，而靠「**存在性门前置**堵住空集写盘 + **判据门**堵住未收官 + **两步事务顺序**使半完成态可重跑收敛 + **处置同事务**消除 `pipeline` 与 `stages` 双写不一致窗口」四道结构性约束；`--dry-run` 复用同一只读校验路径（四写盘点逐字节零写盘），使「可预览」与「正式执行」共用单一真值来源。

**参见：** v1.2.0-stage-79（plan T1/T3；op-001；REV-79-001/002/005/015）；`src/commands/flow.ts`（`flow archive` 子命令组）；`src/core/flow-archive/{archive-ops,grouping}.ts`（`normalizeArchiveVersion`/`applyArchivePipelineDisposition`/`listBlockingOpenRevsForVersion`）；kb/patterns.md #破坏性命令安全校验清单模式、#事务顺序模式、#`--dry-run` 必须字节级不写盘、#归档引擎分层与独立锁模式；kb/architecture.md #版本分片归档架构；manual/core/flow-archive.md

## [+] 归档消费面口径分层架构：deps 判定（版本粒度）vs health 残留（键粒度）+ 单一口径 4 调用点 (2026-10-12)

**决策**：把 stage-78/79 的归档能力接入既有消费点（跨版本 stage deps 判定 + `flow health` 归档一致性 + config 批量同步降级）时，**同一「是否已归档」问题按消费语义分两层粒度**，两者判据不同、**禁互相套用**：

1. **deps 判定 = 版本粒度**（写侧放行 + 读侧对账**同口径**）：core helper `isArchivedVersionOf(stageId, archivedVersions)`（`src/core/plan/path.ts`）——**显式版本前缀 ∧ 版本段 ∈ `meta.archived_versions`**。判据经 `parseStageId` **探针法**派生（`parsed.fullStageId !== stageId` 即拒，零自写正则，消除第二信源）；**短名恒 `false`**（短名 `stage-NN` 经 `parseStageId` 归一为默认版本 `v1.0.0-*`，属**默认版本语义**，不得据此判「已归档」）。**全仓唯一实现**，共 **4 调用点**同源：`commands/plan.ts`（`plan stage add --deps`）+ `commands/flow.ts`（`flow stage set --deps`，两处校验点）+ `core/flow-manager.ts`（`checkDanglingDeps`，health 读侧）+ `commands/config.ts`（降级判定）。**「单一口径」硬约束**：不得「写侧放行 + 读侧报悬空」并存。
2. **health 归档残留 = 键粒度**（`src/core/flow-archive/archive-health.ts`，**新文件**）：b 项判据**两段式**——① `versionOfStageId(stageId) ∈ archived_versions`（廉价预筛）∧ ② `stageId ∈ readArchiveFile(version).stages` **键集**（键级证据，惰性读一次快照，仅取 `stages` 键集）。收窄动因：短名经 `parseStageId` 归一 `v1.0.0`，而本仓已归档 `v1.0.0` → 若仅凭版本前缀，「默认版本新建阶段」（`plan stage add stage-NN` → 键 `v1.0.0-stage-NN`）即触发**误导性**「归档残留」warn（REV-80-019 blocking）。默认版本新建阶段 → 键 ∉ 快照 → **不报**；restore 带回 → 键 ∈ 快照 → **仍报**（检出能力保留）；快照缺失/损坏 → 读侧宽容 `null` → **不可证实不报**（索引↔文件不一致由 a 项承担）。

**health 归档项三项（a/b/c，全部 warn-only，**恒无 `fail`**、不改退出码、非 quick、不参与 `--fix`）**：a. 归档索引（`meta.archived_versions`）↔ 归档目录清单**双向对账**（恒 1 条 pass/warn）；b. 活跃集残留（键粒度，仅非空时 warn）；c. 悬空依赖**读侧**（`checkDanglingDeps` 并入 `isArchivedVersionOf`，与写侧同口径）。**常规路径零读归档文件**；b 项候选分支按版本惰性读一次快照（每版本至多一次）。

**依赖方向不变量**：`flow-manager.ts` 对 `flow-archive/*` **零 import**（避免 `flow-manager → flow-archive` 运行时边；core helper 落 `plan/path.ts` 而非 flow-archive）；`archive-health.ts` 对 flow-manager 仅 `import type`（编译期擦除），**仅被 `src/commands/flow.ts` 消费**。**静态 import 面可执行断言**：`rg "from '.*flow-archive/" src/ --glob '!src/core/flow-archive/*'` 命中仅 `src/commands/flow.ts`。

**设计理由**：deps 判定关心「这个**版本**是否已归档 → 依赖视为已满足」（版本是依赖的真实语义单元，跨版本阶段集合整体搬运）；health 残留关心「这条 **stageId 键**是否真的躺在某归档快照里」（键级证据才能区分「真残留」与「默认版本新建的同前缀新阶段」）。两者若强行收敛为单一粒度，要么 deps 误拒合法跨版本依赖，要么 health 误报默认版本新建阶段——故显式**分层**并在契约层（`deps.yaml` `note_granularity`）登记「禁互相套用」。

**参见：** v1.2.0-stage-80（plan T1/T2；op-001/002/004；REV-80-001/002/010/019/027）；`src/core/plan/path.ts`（`isArchivedVersionOf`）；`src/core/flow-archive/archive-health.ts`（`archiveHealthItems`）；`src/core/flow-manager.ts`（`checkDanglingDeps`）；kb/architecture.md #版本分片归档架构、#归档命令面架构；kb/troubleshooting.md #长寿命索引与「版本前缀判据」陷阱；manual/core/plan-path.md、manual/core/flow-archive.md、manual/core/flow-manager.md

## [+] 需求流转四层模型架构：需求层为「排期与调度层」（显式字段 + 阶段 phase 聚合投影） (2026-10-12)

**模型**：`版本 roadmap → 需求 REQ-NNN → 计划 stage(15-phase) → 方案 op` 四层。**需求层负责「排期与调度」**（可指定预估版本 `target_version`、优先级 `priority`、认领人 `owner`），**不负责「工序」**——工序的单一事实源仍是阶段 `phase`（对齐既有「状态/相位单一事实源」）。

**双层状态**：需求层粗粒度显式状态 `RequirementStatus`（7 值 `draft`/`scheduled`/`in_progress`/`done`/`blocked`/`cancelled`/`rejected`）+ `in_progress` 内部进度**由关联阶段的 15-phase 聚合**。二者关系 = **聚合投影**：显式字段是权威（写事务在 `flow.json`），聚合方向（阶段 phase → 需求状态回写）**不属本层**。

**存储与职责切片（本阶段 = 引擎面）**：`RequirementData`（**10 字段**）类型与常量（`REQ_STATUSES` / `REQ_PRIORITIES` / `REQ_ID_PATTERN`）**单一来源**落 `src/core/req/types.ts`（叶子模块、零 import）；`FlowData.requirements`（顶层可选，类比 `reviews`）+ `StageData.requirement_id`（单值可空，`1:N` 需求↔阶段）最小追加于 `flow-manager.ts`；CRUD/认领原语落 `src/core/req/requirement-ops.ts`（**纯内存、零独立写盘点**，落盘恒经调用方 `FlowManager.save()`——复用锁 + revision 乐观锁 + `.bak`）；正文骨架落 `src/core/req/body-file.ts`（`REQ-NNN.md` 为**人读副本**，机读权威恒为 `flow.json`）。

**阶段切片**：stage-81 = **引擎面**（数据模型 / 写事务 / CRUD 与认领原语 / ID 分配 / 正文原语）；stage-82 = 命令面（`openfeel req`）；stage-83 = 聚合判定与回写（`advanceStagePhase` done / `resetStagePhase` 对称回写）；stage-84 = Agent/skill 契约；stage-85 = 文档与版本收口。**`requirements` 随版本归档的口径留后续版本**（本版不归档 `requirements`）。

**设计理由**：① 需求层与既有线性计划范式（一个版本 = 一串阶段）解耦，需求获得**独立身份 / 生命周期 / 排期 / 认领**；② 工序单一事实源不被破坏（`phase` 权威不变，需求状态为粗粒度投影）；③ 引擎面/命令面/聚合面分层，使每阶段改动面收敛、可单独验收。

**参见：** v1.2.0-stage-81（plan §二；op-001/002；ADR-011）；`src/core/req/types.ts`；`src/core/req/requirement-ops.ts`；`src/core/flow-manager.ts`；kb/architecture.md #状态/相位单一事实源、#全局宏观状态聚合语义；manual/core/req.md、manual/core/flow-manager.md

## [+] 需求层正交边界架构：`src/core/req/**` 对归档层 / 工作流模式零耦合 + 静态串断言固化 (2026-10-12)

**边界声明**：`src/core/req/**`（需求引擎）**不 import / 不读取**工作流模式字段（`workflow_mode`）、转移表（`PIPELINE_PHASES` / `getValidTargets`）、**归档层（`flow-archive/**`）**；亦**禁** `process.cwd` / `homedir`（路径全由 `projectPath` 参数注入，测试隔离）。**本版不归档 `requirements`**（其归档口径留后续版本）——故与归档层零依赖边。

**固化方式**：以**测试断言形式**静态固化（`test/core/req.test.ts` 正交 describe）——直读三份源文件全内容（**含文件头注释 / JSDoc**），逐文件 × 6 禁止串 `not` 断言 + **正控三断言**（各文件独有符号 `toContain`）+ `NEEDLES.length === 6`（防清单被删空），防负向断言空转；配套 `rg` 命令行零命中复核。

**必要副产品（注释措辞纪律）**：因扫描对象含文件头注释，**「正交声明」注释措辞不得含禁止串字面量**（用「不依赖归档层 / 不引用工作流模式字段」中性措辞）——否则注释与零命中断言自相矛盾（REV-81-009 blocking 即此）。落点选 `src/core/req/` 为叶子层（`types.ts` 零 import），与 flow-manager 仅单向 `import type`，无环。

**设计理由**：需求层与归档层是 v1.2.0 **两个正交主题**（归档 = 历史只读搬运；需求 = 推进中部的独立身份层）；若需求层耦合归档层/模式字段，则「需求随版本归档」的语义、模式感知横切会污染引擎面。以 6 禁止串断言把边界从「约定」升为「可证伪门禁」。

**参见：** v1.2.0-stage-81（plan §二 不变量 3 / 裁定 J / §七.5；op-003 T5.6；REV-81-006/009）；`src/core/req/{types,requirement-ops,body-file}.ts`；`test/core/req.test.ts`（正交 describe）；manual/core/req.md

## [+] 需求命令面架构：引擎单点 + 命令层零业务逻辑（校验/流转/占用/关联唯一性） (2026-10-12)

**分层**：`openfeel req` 10 子命令（`add`/`list`/`show`/`claim`/`release`/`set`/`link`/`advance`/`board`/`next`）= **薄命令层**（`src/commands/req.ts`）；全部业务判定（字段白名单 / 值域 / 状态流转合法性 / 认领占用 / 关联唯一性 / done 门）**单点**在引擎层 `src/core/req/requirement-ops.ts`。命令层仅：解析参数 → 调引擎原语 → **错误码→文案映射** → `save()`（成功路径）→ `process.exitCode`。

**关键约束**：
- **`set`/`advance` 命令层零校验**：不重做流转校验（否则产生第二份流转表 → 双信源漂移）；「列合法目标」经引擎**新增导出** `getAllowedNextStatuses(status)`（只读纯函数、返回副本；`ALLOWED_TRANSITIONS` 保持**模块私有**）派生，**禁命令层硬编码枚举**（REV-82-003 blocking）。
- **写命令分流矩阵**：引擎**唯一抛错原语** `addRequirement`（构造期入参契约违反）→ `catch` → `common.errorTmpl` exit 1；其余原语恒**返回错误码**（`not_found`/`already_claimed`/`already_linked`/`invalid_status`/`invalid_field`/`stage_not_found`）→ 命令层逐码映射文案 exit 1 零写盘。
- **`link` 归一单点**：仅一次 `normalizeStageId`（禁自写解析、不做双键回退、不读 status.md）；阶段存在性以引擎 `stage_not_found` 为**唯一门**。
- **正交**：命令层不 import / 不引用 `ALLOWED_TRANSITIONS`/工作流模式/归档层/`.phase`/`allLinkedStagesDone`（避免第二实现）——以测试直读源文全内容 **7 禁止串零命中**固化。

**分工理由**：引擎面（纯函数 + 调用方落盘）与命令面（exit 码 / 提示 / save）分层，使「同语义」只有一处实现；需求状态机与聚合回写（stage-83）复用同一流转表 / 同一 done 门谓词，禁第二套。

**实证**：v1.2.0-stage-82（plan_review REV-82-001/002/003 blocking；code_review pass）；`src/commands/req.ts`（10 子命令）；`requirement-ops.ts :: getAllowedNextStatuses`。

**参见：** v1.2.0-stage-82（plan §二 不变量；op-001~003）；`src/commands/req.ts`；`src/core/req/requirement-ops.ts`；kb/patterns.md #需求引擎不变量模式、#CLI 退出码语义；manual/core/req.md、manual/cli/commands.md

## [+] 双层状态聚合架构：需求 done 判定单源委托 `allLinkedStagesDone`（同一原语两消费点 + 空集守卫） (2026-10-12)

**分层**：需求层为「显式粗粒度状态」+「关联阶段 15-phase 聚合投影」**双层**——**工序单一事实源恒为阶段 `phase`**，需求状态是其**粗粒度投影**（对齐 kb/architecture.md #状态/相位单一事实源：投影方向单一 `phase → 需求状态`，**绝不**由需求状态前推阶段 phase）。

**单源委托（REV-83-002）**：`computeRequirementAggregate(data, requirementId)`（`src/core/req/aggregate.ts`）的 **done 分支直委托既有唯一原语 `allLinkedStagesDone(data, id)`**（`requirement-ops.ts:76-79`，`linked.length > 0 && linked.every(phase === 'done')`，**含空集守卫**）；**禁第二份 `length > 0 && every(done)` 表达式**（会致「显式 done 门」与「聚合投影」双 done 判定源漂移）。两消费点**同源**：`applyStatusChange` 的 `to === 'done'` 门（`req advance --to done` 唯一显式门）与聚合函数共用该原语——以静态断言（`aggregate.ts` 含 `allLinkedStagesDone(` 且 `.every(` 零命中）+ 动态同源断言（全 fixture `aggregate==='done'` ⟺ `allLinkedStagesDone(data,id)`）双向锁定。

**空集守卫**：**零关联阶段 → `aggregate = null`**（不参与 done 判定，**禁误报 done**——`every` 对空数组 vacuous truth 陷阱）；`stageCount / doneCount / stageIds` 一并输出（`stageIds` = `data.stages` 键序）。

**落点**：`src/core/req/aggregate.ts`（对 `flow-manager` 仅 `import type` 防运行时环）；回写入口 `syncRequirementStatus`（纯内存、声明式不绑定事件，见 kb/patterns.md #对称回写模式）。

**判据**：凡「由底层事实派生上层状态」，① 上层判定**必须委托底层唯一原语**（禁就地复写表达式）；② 派生函数**纯**（无 IO / 无 `this`）；③ 空集/无关联须有**显式守卫语义**（返回 `null` 而非 vacuous `done`）；④ 同一判定语义的多个消费点须可枚举并**同源断言**。

**实证**：v1.2.0-stage-83（plan_review REV-83-002 blocking 闭合）；`src/core/req/aggregate.ts :: computeRequirementAggregate`；`test/core/req.test.ts` 段 A（T4.1 15-phase 穷举 + T4.5 同源四组）+ 段 C（静态）。

**参见：** v1.2.0-stage-83（plan §二 不变量 7 / §四.4；op-001）；`src/core/req/aggregate.ts`；`src/core/req/requirement-ops.ts :: allLinkedStagesDone`；kb/architecture.md #状态/相位单一事实源、#需求流转四层模型架构、#全局宏观状态聚合语义（空集守卫）、#需求命令面架构；kb/patterns.md #需求引擎不变量模式；manual/core/req.md

## [+] 可观测性埋点架构：recordRun 命令层接线 + phase→agent 归属 + 日志 3 字段 + 会话标识三级链 (2026-10-15)

**背景**：v1.2.1 的提速举措若无埋点则无法度量（设计 §8）——`recordRun` 为零调用点死代码、`flow metrics` 恒空；CLI 运行日志 578/5371 条 start 无 done（约 10.8%，耗时永久丢失）；`exec_running` 为**阶段级** phase 不可按 op 分段；活跃/闲置靠分析层「>20min」启发式（非 CLI）。

**四件套**：
1. **度量接线（T1）**：`recordRun` 调用点落**命令层**（`src/commands/flow.ts` advance 逐步推进循环内、`mgr.save()` 之后），core 层零改动——因 `metrics.ts:10` 已 `import { normalizeAgentName } from './flow-manager.js'`，**core 反向接线必成 import 环**；归属以 `PHASE_AGENT_MAP` **单点常量**（10 键）承载（`*_passed` / `done` / meta 未入表 = 跳过不记）；duration = 被退出 phase 的**窗口耗时**（无基线跳过不写 0 值）；`--dry-run` 因提前 return 天然排除（字节级零写盘）。
2. **日志字段（T2）**：start/done 行对称落 `[project=…] [session=…]`，done 行另落 `[duration_ms=…]`；**done 行必写加固**（`process.on('exit')` 单源 + SIGINT/SIGTERM → 130/143 + 一次性旗标），安装点 = **bin 单一咽喉**。
3. **op 埋点（T3）**：`Op` 增**可选** `attempted_at?` / `completed_at?`，仅 `recordAttempt` 三分支写值（`draft` 拒绝分支不写）；**读侧宽容不注入**（`load()` 零改动 → 存量 `load→save` 零注入）。
4. **语义标注（T4）**：`advance_stage_phase` / `reset_stage_phase` 审计 detail 追加**可选** `session_id`（恒写）/ `resumed`（条件写），**跨会话恢复显式可辨**，替代 >20min 启发式。

**会话标识单一来源**：新建 `src/core/session.ts`（叶子模块，**零 import runtime-log / flow-manager** 防环），被 runtime-log 与 flow-manager 共同消费；三级链 env → project → proc + 值前缀 `env:` / `project:` / `proc:` 供**机器可判**人工 vs 自动化；`proc:` 级不参与跨会话判定。

**不变量**：新增埋点一律「**可选字段 + 读侧宽容**」（不 load 补齐）；四类日志边界不变（只改「CLI 进程运行日志」行内字段）；`--dry-run` 字节级零写盘；口径警示——phase 窗口**含跨会话闲置/等待**，不得表述为「agent 纯执行时长」（`flow metrics` 追加口径注记行 + T4 标注联合解释）。

**判据**：埋点字段「可选 + 读侧宽容」为默认；「死代码接线」先判 import 环方向（core 已被反向依赖 → 落命令层）。

**实证**：v1.2.1-stage-86（3 op `aea0b41` / `dff7e68` / `7a56fa3`；18 文件 +1182/−16；门禁 **71 文件 / 1591 用例** 0 skipped / 0 failed、`lint i18n` **912**、`tsc` 0）。

**参见：** v1.2.1-stage-86（plan §二 不变量 / §三 T1~T4 / §四 Q1·Q2；op-001~003）；`src/core/session.ts`；`src/core/metrics.ts :: PHASE_AGENT_MAP`；`src/core/runtime-log.ts :: logCliStart / logCliDone / installExitHooks`；kb/architecture.md #四类日志边界、#状态/相位单一事实源；kb/patterns.md #死代码接线的落点判据、#CLI 进程日志行格式向后兼容扩展、#进程级会话标识三级链；manual/core/session.md、manual/core/metrics.md、manual/core/runtime-log.md

## [+] 需求拆分与版本解绑架构：父子关系「仅溯源不聚合」+ 需求与版本正交（`target_version` 非门） (2026-10-15)

**背景**：v1.2.1「需求接取制度」把机制层（v1.2.0 已有 `claim`/`release` + 占用校验）升级为**完整工作模式**——① 需求**可拆分为可独立执行/并行的子需求**（设计 §3.2「拆解为可独立执行/并行的子需求并发布」、§3.3「鼓励拆分需求并行执行」）；② 需求**不绑版本**（版本号仅发布时推进）。

**父子关系「仅溯源不聚合」（核心不变量）**：
- `RequirementData.parent_id?: string` 是**纯溯源字段**——**不入聚合判定 / 不入 done 门 / 不进 `PATCH_WHITELIST`（`req set` 不可改绑）/ 读侧不 load 补齐**；父子**无级联**（两子均 done 后父仍 `draft`，父流转由 feel 显式执行）。
- 理由：聚合 done 判定**单源恒为 `allLinkedStagesDone`**（承 stage-83 REV-83-002 纪律）；引入父子聚合会造**第二份 done 判定源**（`.every(`）→ 漂移。`parent_id` 表达「什么由什么拆出」这一**关系事实**，不表达状态派生——故不新增聚合面（`aggregate.ts` 本阶段零改动为门）。
- **禁 `PATCH_WHITELIST`** 天然拒改绑 + **不写环检测**（子 ID 恒为新 max+1、方向恒 `child → parent`，结构上无环）——「用结构约束替代运行时校验」。

**需求与版本正交（`target_version` 非门）**：
- `target_version` 为**纯可选、纯展示/过滤/排序维度**；全生命周期（创建 → 认领 → 排期 → 进行中 → 关联阶段 → 阶段 done → 聚合收口）**无一处作为门**——核验面 = 6 消费点（字段声明 / `listRequirements` 读侧过滤 / `addRequirement` **仅拒空串** / `updateRequirement` 仅显式提供时值域校验 / 命令层传递·展示·过滤·排序 / 骨架缺省渲染）+ 6 无版本条件点（`ALLOWED_TRANSITIONS` 单点表 / `applyStatusChange` done 门 / `claim` / `release` / `link` / `allLinkedStagesDone` + 聚合回写）。
- 固定手段三面：**核验**（`file:line` 逐条 + 是否构成门）+ **断言**（「无 `target_version` 全生命周期可用」端到端，防未来引入版本门）+ **落文**（skill `## 需求与版本解绑`）。**版本号推进与需求解绑**——`--version` 仍归发布收口阶段（本阶段不改）。

**判据**：新增**关系型可选字段**时，先判「它是关系事实还是状态派生」——关系事实**只记不聚合**（禁造第二判定源）；「某字段不构成门」须以**消费点全枚举 + 逐条判定**固定，而非仅凭「看起来可选」。

**实证**：v1.2.1-stage-87（plan §二 不变量 1 / 边界 1/3；REV-87-002/004；op-001~003；3 commits `f46d01d`/`a84227f`/`b3c4df3`；门禁 71 文件 / 1614 用例 0 skipped / 0 failed、`lint i18n` 931、`tsc` 0）。

**参见：** v1.2.1-stage-87（plan §三 T1/T3 / §二 不变量；op-001/op-003）；`src/core/req/types.ts :: RequirementData.parent_id`；`src/core/req/requirement-ops.ts :: splitRequirement`；kb/architecture.md #需求流转四层模型架构、#双层状态聚合架构、#需求层正交边界架构；kb/patterns.md #事务性批量构造原语模式、#关系型可选字段「仅溯源不聚合」模式；manual/core/req.md
