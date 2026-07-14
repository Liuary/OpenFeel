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

v4.0 将 Agent 从 15 个精简为 7 个，形成职责清晰的层级结构：

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

v4.0 废弃旧式"自动闭环"（auto-runner 调度 code-worker/review-worker），统一为 Feel 总统领通过 CLI 推进流水线：

- Feel 读取 `flow.json` 判断当前阶段和 phase
- 通过 `openfeel flow` 命令推进流水线（`status` → `advance` → `repair`）
- 下游 Agent（Planner/Schemer/Executor/Reviewer/Tester/Archiver）仅在自己的职责边界内操作
- 新增 `openfeel flow overview` 命令输出全阶段可视化状态
- 新增 `openfeel flow metrics` 命令追踪 Agent 性能指标
- 新增 `openfeel flow recover` 命令实现跨会话上下文恢复
- 新增 `openfeel stage status/set/task` 命令以原子操作管理 status.md

## [+] 知识库自动化体系：检索 → 去重 → 沉淀 (2026-07-05)

v4.0 建立了知识库的「读写闭环」：

- **检索层**：`check-kb` skill 内嵌语义检索（步骤 5 自执行 `python scripts/search_kb.py`），无需再手动调用 `search-kb`
- **去重层**：`kb-dedup.ts` 在归档前执行 Jaccard 词袋相似度计算，相似度 > 80% 时更新而非新增条目
- **沉淀层**：Archiver 在阶段完成后从操作记录中提取可复用经验，自动写入对应 kb/ 分类
- **触发时机**：每个阶段 `test_passed` → `archiving` → 提取经验 → 去重 → 写入 → `done`
- **CLI 入口**：`openfeel flow overview --full` 可查看知识库最近更新摘要

## [+] 多语言模板数据管线：源文件→构建时内联→运行时加载 (2026-07-12)

v4.3 建立了支持多语言的模板数据管线，采用「源文件管理 → 构建时内联 → 运行时按语言加载」三层架构：

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
- 与 v4.1 建立的构建时模板同步机制（templates-data/ → .opencode/agents/）协同工作

**参见：** v4.3-stage-01 op-005（模板加载器）、v4.3-stage-03 op-001/op-006（多语言扩展）、kb/patterns.md #构建脚本多语言循环生成模式

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

**参见：** v4.4-stage-01 op-001~op-002、kb/patterns.md #CLI 国际化封装模式

## [+] 公域日志批量聚合策略：推进事件延迟并入阶段里程碑 (2026-07-14)

v4.4 将公域日志从"每次 advance_stage_phase 逐条写入"改为"endStage() 完成时批量聚合为一条里程碑记录"：

```
之前：flow advance 每次调用 → 公域日志立即写入一条（每阶段 6-8 条噪音）
之后：advance_stage_phase 取消直接日志写入 → endStage() 汇总为一条里程碑记录
```

**规则：**
- advance_stage_phase 不再调用 publicLogger.logPhaseChange()——仅记录 flow.json 内部 log
- endStage() 新增 logMilestone() 调用，汇总该阶段全部推进为一条里程碑
- 里程碑事件（test_passed、archiving→done）仍逐条记录，确保审计链不丢失
- 降噪效果：消除约 85%+ 的公域日志条目，剩余均为里程碑级事件

**参见：** v4.4-stage-02 op-001、kb/patterns.md #流水线节点触发日志骨架模式
