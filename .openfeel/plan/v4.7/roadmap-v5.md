# OpenFeel v5 路线图（v5.0 ~ v5.3）

> 基于三份调研报告（A/B/C）的系统性发现，规划为 4 期渐进式改进。
> 上一里程碑：v4.7（Feel/Executor 部署版过期修复 + dev_core.md 规范化）

---

## v5.0 — 工具链内化与一致性治理

**目标**：消除重复的手动步骤，统一 Agent 提示词格式。

| # | 任务 | 来源 | 预估工作量 |
|:--:|------|:--:|:--:|
| 1 | **CLI 内化归档 git commit**：`flow advance --to done` 时自动执行 `git add .openfeel/` + `git commit`，消除归档阶段手动 git 操作 | 调研 A | 中（~3h） |
| 2 | **Agent 提示词结构统一**：当前部分 Agent prompt 使用 `#` 编号、部分使用无序列表，格式混用导致 LLM 解析不一致。统一为一种格式（建议全部使用 `#` 层级编号） | 调研 A | 小（~1h） |

**涉及文件**：
- `src/core/flow-manager.ts` — 在 `advanceStagePhase` 的 `done` 分支注入 git add+commit
- `.opencode/agents/*.md` — 9 个 Agent prompt 格式统一

**里程碑**：归档操作从"推进 + 手动 git"两步 → CLI 一步完成；Agent 提示词格式 100% 一致。

---

## v5.1 — 职责迁移与 Agent 协作原语

**目标**：清理跨层冗余（75 行工具规范从 dev_core 迁移到 core.md），引入 Agent 间自主委派能力。

| # | 任务 | 来源 | 预估工作量 |
|:--:|------|:--:|:--:|
| 3 | **dev_core.md "Agent 工具规范" 迁移到 core.md**：将 `.opencode/instructions/core.md` 中缺失的 75 行"Agent 工具使用规范"从 `dev_core.md` 迁移并入，`dev_core.md` 标记对应规则为 `[-]` 禁用 | 调研 A | 中（~2h） |
| 4 | **Handoff 原语**：Agent 间自主委派能力，参考 AutoGen Swarm 设计。允许 Agent 在任务执行中调用其他 Agent（如 Executor 调 Vision 分析截图），通过 Feel 统一调度实现 | 调研 B | 大（~6h） |

**涉及文件**：
- `.opencode/instructions/core.md` — 接收工具规范迁移
- `.openfeel/dev/dev_core.md` — 禁用已迁移规则
- `src/core/flow-manager.ts` — Handoff 调度逻辑
- `src/core/pipeline-schema.ts` — Handoff 数据结构定义
- `.opencode/agents/feel.md` — Handoff 调度规则

**里程碑**：dev_core.md 不再承载 core.md 层级规范；Agent 间可自主委派子任务。

---

## v5.2 — 状态持久化与灵活流程控制

**目标**：流水线推进时自动保存快照（可回溯），phase 转换支持组合条件（更灵活）。

| # | 任务 | 来源 | 预估工作量 |
|:--:|------|:--:|:--:|
| 5 | **Checkpoint 自动快照**：每次 phase 推进时自动保存当前 flow.json + 关键状态快照到 `.openfeel/checkpoints/`，参考 CrewAI 的 checkpoint 机制。支持 `openfeel flow checkpoint list` / `restore` 命令 | 调研 B | 大（~8h） |
| 6 | **组合终止条件**：phase 转换支持位或运算符组合条件（参考 AutoGen），替代当前单条件硬切换。例如 `test_passed | review_passed` → 任一满足即可推进，提升多 Agent 并行场景的流水线灵活性 | 调研 B | 中（~4h） |

**涉及文件**：
- `src/core/flow-manager.ts` — Checkpoint 自动保存逻辑 + 组合终止条件判断
- `src/commands/flow.ts` — `checkpoint list | restore` 子命令
- `src/core/pipeline-schema.ts` — 组合终止条件数据结构
- `.openfeel/checkpoints/` — 新目录，快照存储

**里程碑**：每次 phase 推进自动落快照，支持回溯；多 Agent 并行不再被单条件阻塞。

---

## v5.3 — 质量保障与知识库健康

**目标**：引入自动化校验工具，防止提示词和知识库随时间腐化。

| # | 任务 | 来源 | 预估工作量 |
|:--:|------|:--:|:--:|
| 7 | **`openfeel lint i18n`**：自动校验 i18n 数据文件的空键、中英文键不一致、缺失翻译等。作为 `lint` 命令组的首个子命令，后续可扩展更多检查项 | 调研 A | 中（~3h） |
| 8 | **kb 过期引用清理 + prompt 腐化检测**：扫描知识库中引用的已删除/重命名文件，提示过期条目；检测 Agent prompt 中过时的命令引用和路径。提供 `--fix` 自动修复过期引用 | 调研 C | 大（~5h） |
| 9 | **CLI-Agent 能力对齐**：当前 CLI 有 12 个命令组但 Agent 只感知 8 个 skill。启用 `openfeel roadmap`，为 roadmap/health/recover/wizard 补充 `/opfx:*` skill 映射，确保 Agent 能利用全部 CLI 能力 | 新发现 | 中（~3h） |

**涉及文件**：
- `src/commands/lint.ts` — 新增 lint 命令组，i18n 校验为首个子命令
- `src/core/i18n.ts` / `src/core/i18n-data/*.ts` — i18n 校验逻辑
- `src/core/kb-health.ts` — 知识库健康检查（新文件）
- `.opencode/skills/` — 补充 roadmap/health/recover/wizard 等 skill 定义
- `.openfeel/kb/*.md` — 过期引用检查目标
- `.opencode/agents/*.md` — prompt 腐化检测目标

**里程碑**：CI/CD 可集成 `openfeel lint` 阻断质量退化；知识库引用保持健康；CLI 全部命令对 Agent 可见。

---

## 版本汇总

| 版本 | 任务数 | 预估总工时 | 核心主题 |
|:--:|:--:|:--:|------|
| v5.0 | 2 | ~4h | 工具链内化 + 一致性治理 |
| v5.1 | 2 | ~8h | 职责迁移 + Agent 协作原语 |
| v5.2 | 2 | ~12h | 状态持久化 + 灵活流程控制 |
| v5.3 | 3 | ~11h | 质量保障 + 知识库健康 + CLI-Agent 对齐 |
| **合计** | **9** | **~35h** | v5 系列完整路线 |

---

> **制定依据**：调研 A（CLI 内化 + 提示词统一 + 规范迁移 + i18n lint）、调研 B（Handoff + Checkpoint + 组合终止条件）、调研 C（kb 健康 + prompt 腐化检测）
> 
> **优先级策略**：先消除手动负担（v5.0 git 自动提交）→ 重构架构债（v5.1 规范迁移 + v5.2 灵活流程）→ 引入质量门禁（v5.3 lint + 健康检测 + CLI-Agent 能力对齐）
