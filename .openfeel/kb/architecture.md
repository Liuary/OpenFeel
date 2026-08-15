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

## [+] config.yaml meta.version 语义：OpenFeel 框架版本 (2026-08-15)

`config.yaml` 的 `meta.version` 语义确认为「**OpenFeel 框架版本**」（非配置格式版本），与 package.json 同步。

**关键点：**
- `config.yaml meta.version` 由 `src/core/config.ts` 的硬编码模板常量 `CONFIG_TEMPLATE_ZH`（约 304 行）/ `CONFIG_TEMPLATE_EN`（约 361 行）生成，是**字面量**（非 `${DEFAULT_CONFIG.xxx}` 插值）；
- 版本升级须**三处同步**：项目实例 config.yaml + config.ts 双语言模板常量，否则新项目 `init` 仍生成旧版本号（REV-003 曾指出此源码遗漏）；
- `flow.json meta.version='1.0'` 是**内部格式**，与 config.yaml meta.version 是两个独立字段，不参与框架版本同步。

**编码注意**：config.yaml 实测为 UTF-8 无 BOM（非 GBK），改后须保留原编码，避免乱码。

**与既有「模型配置三级体系」的关系**：本条目界定 `meta` 节的版本语义，既有条目界定 `models` 节的模型覆盖层级，两者同属 config.yaml 的不同节，互不覆盖。

**参见：** v1.0.0-stage-33 op-005、kb/patterns.md #版本号语义管理与递增规范模式
