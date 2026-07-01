# OpenFeel v4.0 — 工程精简与能力增强

> 基于四期改进建议（12 项）+ 工程改造需求，在 v3.x 稳定基础上做减法（15→7 Agent 全面对齐部署项目）和加法（增强 Agent 决策、审查、可视化）。

## 一、版本定位

v4.0 是一次**双向优化**：
- **减法**（减法先做）：15 个 Agent 精简到 7 个，全面对齐部署项目体系（feel / planner / schemer / executor / reviewer / feel-tester / archiver），精简 `.opencode/instructions/core.md`
- **加法**（增量增强）：将 12 项改进建议按优先级分三批落地，提升 Agent 决策质量、审查准确度、流水线可观测性

**与前版本的衔接**：v3.x 已全部归档，工作区干净，测试 225/227 通过。v4.0 为全新版本的独立计划。

## 二、输入来源

| 来源 | 路径/说明 |
|------|----------|
| 四期改进建议 | `docs/phase-4/suggestions.md` — 12 项改进建议，分为 🔴 先做 / 🟡 值得做 / 🟢 锦上添花 |
| 工程改造需求 | 用户明确要求：15→7 Agent 全面对齐部署项目 + 精简 core.md（424→~250 行） |
| 部署项目参考 | `C:\Code\AI\test_deploy\openfeel_test\.opencode\agents\` — 7 个目标 Agent 文件模板 |
| 项目当前状态 | 无活跃计划，无 flow.json，15 个 Agent |
| 目标体系 | feel（总统领+Planner兼任）/ planner / schemer / executor（合并code）/ reviewer（合并architect）/ feel-tester（替换tester）/ archiver |

## 三、阶段划分

### 阶段 01：工程改造 — 15→7 Agent 全面对齐

**目标**：移除 9 个废弃 Agent，重写/精简 7 个 Agent 对齐部署项目，精简 core.md，清理所有过期引用，建立 v4.0 的清爽基座。

#### A. 删除（9 项）

| # | 任务 | 类型 | 说明 |
|:--:|------|:--:|------|
| 1 | 移除 auto-runner.md | 删除 | 自动闭环调度由 Feel 直接根据 flow.json 状态接管 |
| 2 | 移除 code-worker.md | 删除 | 其职责合并到 executor.md（自测 + 修复） |
| 3 | 移除 review-worker.md | 删除 | 其职责合并到 reviewer.md（统一审查） |
| 4 | 移除 ask.md | 删除 | 其只读分析职责由 Feel 自行处理 |
| 5 | 移除 debug.md | 删除 | Executor 自测 + Tester 正式测试替代 |
| 6 | 移除 test-writer.md | 删除 | Executor 自测替代 |
| 7 | 移除 architect.md | 删除 | 职责合并到 reviewer.md（架构审查 + 计划管理） |
| 8 | 移除 code.md | 删除 | 职责合并到 executor.md（Bug 修复 + 审查问题处理） |
| 9 | 移除 tester.md | 删除 | 替换为 feel-tester.md（测试官） |

#### B. 重写（4 项）

| # | 任务 | 类型 | 说明 |
|:--:|------|:--:|------|
| 10 | 重写 feel.md | 重写 | 对齐部署项目（95→~65 行）：增加 flow.json 调度逻辑、Planner 职责兼任声明、/opfx: 技能表；保留会话启动流程和任务路由表核心内容 |
| 11 | 重写 executor.md | 重写 | 对齐部署项目（162→~60 行）：合并 code.md 的修复能力（自测 + 修复 + 重试机制）；保留环境自适应关键逻辑 |
| 12 | 重写 reviewer.md | 重写 | 对齐部署项目（111→~70 行）：合并 architect.md 的架构审查职责；扩展为 5 审查维度（正确性/规范性/安全性/完整性/一致性）；声明异种模型驱动 |
| 13 | 新建 feel-tester.md | 重写 | 对齐部署项目（替换 tester.md，~60 行）：含测试分析/测试执行/Bug 提交/回归验证；声明测试类型（单元/集成/验收） |

#### C. 精简（3 项）

| # | 任务 | 类型 | 说明 |
|:--:|------|:--:|------|
| 14 | 精简 planner.md | 精简 | 参考部署项目结构（93→~60 行）：保留核心原则、会话启动、计划工作流 5 Phase、协作边界；移除冗余的重复描述 |
| 15 | 精简 schemer.md | 精简 | 参考部署项目结构（123→~95 行）：保留方案模板、op 级依赖声明、依赖版本校验；适度精简会话启动和环境适配细节 |
| 16 | 精简 archiver.md | 精简 | 参考部署项目结构（93→~70 行）：保留归档工作流 4 步骤、PipelinePhase 枚举；移除与 Stage-02 的冗余关系描述 |

#### D. 配套更新（3 项）

| # | 任务 | 类型 | 说明 |
|:--:|------|:--:|------|
| 17 | 精简 core.md | 重写 | 清理 9 个已移除 Agent 的引用（auto-runner/code-worker/review-worker/ask/debug/test-writer/architect/code/tester）；重写"自动闭环"→"Feel 调度 + openfeel CLI 推进"模型；目标 424→~250 行 |
| 18 | 更新 AGENTS.md | 修改 | 移除已删除 9 个 Agent 的引用；更新职责边界表（7 Agent 体系）；更新自动闭环约束章节 |
| 19 | 清理源码引用 | 修改 | grep 搜索项目中对 9 个已移除 Agent 的所有引用（.ts 文件、配置、文档），清理或替换 |

#### E. 后续阶段调整（1 项）

| # | 任务 | 类型 | 说明 |
|:--:|------|:--:|------|
| 20 | 调整 stage-02/03/04 计划 | 修改 | 因 stage-01 中 executor/reviewer/tester→feel-tester 被大幅重写，重新评估后续阶段的任务范围、涉及文件和依赖关系 |

#### 修改文件范围

- **删除**：9 个 Agent 文件（auto-runner / code-worker / review-worker / ask / debug / test-writer / architect / code / tester）
- **重写**：4 个 Agent 文件（feel / executor / reviewer）+ 新建 feel-tester
- **精简**：3 个 Agent 文件（planner / schemer / archiver）
- **重写**：`.opencode/instructions/core.md`
- **修改**：`AGENTS.md`
- **修改**：源码中的引用（`.ts` 文件）

### 阶段 02：核心增强 — 知识检索 + 前置校验

**目标**：落地 🔴 先做 2 项，让知识库从"只写"变"读写"，让 Executor 执行前有安全校验。

> ⚠️ 本阶段在 stage-01 完成后重新评估。stage-01 中 planner/schemer/executor 已被精简/重写，需基于新版本注入增强逻辑。

| # | 任务 | 类型 | 说明 |
|:--:|------|:--:|------|
| 1 | #4 KB 检索增强 Agent 决策 | 增强 | 基于 stage-01 精简后的 planner.md/schemer.md，注入 KB 自动检索逻辑；扩展 check-kb skill 使其在决策阶段自动触发 |
| 2 | #5 Executor 前置校验钩子 | 增强 | 基于 stage-01 重写后的 executor.md，添加 op 方案存在性/完整性校验；不完整时拒绝执行 |

**修改文件范围**（预计，stage-01 完成后确认）：
- 修改 `.opencode/agents/planner.md` / `.opencode/agents/schemer.md`（KB 检索注入）
- 修改 `.opencode/agents/executor.md`（前置校验钩子）
- 可能修改 `.opencode/skills/check-kb/SKILL.md`
- 可能修改 `src/core/flow-manager.ts`

### 阶段 03：审查增强 + 流水线可视化

**目标**：落地 🟡 值得做 4 项，提升审查质量和流水线可观测性。

> ⚠️ 本阶段在 stage-01 完成后重新评估。stage-01 中 reviewer 已扩展为 5 审查维度（正确性/规范性/安全性/完整性/一致性），#1「模式一致性」维度需重新定位为"内部模式一致性"子维度。

| # | 任务 | 类型 | 说明 |
|:--:|------|:--:|------|
| 1 | #1 模式一致性审查子维度 | 增强 | 在 reviewer 5 维度基础上，细化"一致性"为"外部一致性（vs 架构）+ 内部模式一致性（同类代码风格统一）" |
| 2 | #2 方案一致性回写 | 增强 | 基于 stage-01 重写后的 executor.md，编码完成后自动比对方案声明与实际产出 |
| 3 | #3 REV blocking 标记 | 增强 | 在 reviewer.md 中增加 REV 条目 blocking 字段，非阻塞 REV 不中断流水线 |
| 4 | #6 流水线可视化 `/opfx:status` | 新增 | 一次性展示全状态（阶段、op、审查、Bug、耗时等综合视图） |

**修改文件范围**（预计，stage-01/02 完成后确认）：
- 修改 `.opencode/agents/reviewer.md`（#1 子维度 + #3 REV blocking）
- 修改 `.opencode/agents/executor.md`（#2 方案一致性回写）
- 新增或修改 `src/commands/flow.ts`（#6 可视化命令）

### 阶段 04：体验优化 — 6 项锦上添花

**目标**：落地 🟢 锦上添花 6 项，完善统计、日志、性能等体验细节。

> ⚠️ 本阶段在 stage-01 完成后重新评估。stage-01 中 feel-tester 替换了 tester，部分任务需调整目标 Agent。当前为概要计划，具体任务在 stage-01 完成后细化。

| # | 任务 | 类型 | 说明 |
|:--:|------|:--:|------|
| 1 | #7 阶段耗时统计 | 增强 | flow.json 增加 stats 字段（start_time / end_time / duration） |
| 2 | #8 Reviewer/Tester 快速通道 | 增强 | 代码量 < 200 行 + 自测全通过时，跳过完整审查，标记为快速通过 |
| 3 | #9 公共日志审计链补全 | 增强 | 正常流程的状态变更也写入公共日志 |
| 4 | #10 跨会话上下文恢复 | 增强 | Feel 重启后从 flow.json + status.md 准确恢复状态机位置 |
| 5 | #11 Agent 性能指标 | 新增 | 记录每个 Agent 的执行时间、成功率、重试次数 |
| 6 | #12 知识库自动去重 | 增强 | 归档前检索现有条目，相似度 > 80% 时更新而非新增 |
| 7 | **status.md CLI 管理** | **工程** | `openfeel stage` 命令管理阶段状态，Agent 不再直接 edit status.md |

**修改文件范围**（预计，stage-01/02/03 完成后确认）：
- 修改 `src/core/flow-manager.ts`（#7 stats + #10 上下文恢复）
- 修改 `.opencode/agents/reviewer.md` / `.opencode/agents/feel-tester.md`（#8 快速通道）
- 修改日志写入逻辑（#9 审计链补全）
- 新增性能指标模块（#11）
- 修改 kb 归档逻辑（#12 自动去重）
- 新增 `src/commands/stage.ts`（#13 status.md CLI 管理命令）

## 四、依赖关系

```
v4-stage-01 (15→7 Agent 全面对齐)
    │
    ├─(hard)── v4-stage-02 (核心增强：KB 检索 + 前置校验)
    │              │
    │              └─(hard)── v4-stage-03 (审查增强 + 可视化)
    │                             │
    │                             └─(soft)── v4-stage-04 (体验优化)
    │
    └─(hard)── v4-stage-03 (审查增强 + 可视化)
                   │
                   └─(soft)── v4-stage-04 (体验优化)
```

**依赖说明**：
- Stage 01 → Stage 02：**hard**。Stage 01 的 Agent 文件重写/精简是 Stage 02 注入增强逻辑的上下文前提。
- Stage 01 → Stage 03：**hard**。stage-01 中 reviewer 被重写为 5 维度版本，stage-03 需基于此版本继续细化。
- Stage 02 → Stage 03：**hard**。stage-02 修改 executor（前置校验），stage-03 继续修改 executor（方案回写），共享同一文件需串行。
- Stage 03 → Stage 04：**soft**。Stage 04 修改的 feel-tester / flow-manager 与 Stage 03 修改范围不冲突，可独立推进。

**注意**：因 stage-01 范围扩大（9 删除 + 7 更新 + 配套 3 + 后调 1 = 20 项），后续阶段的任务细节需在 stage-01 完成后重新确认。当前为概要计划。

## 五、验证方式

| 阶段 | 验证方法 |
|------|----------|
| Stage 01 | 1. 确认 9 个 Agent 文件已删除，Agent 目录仅保留 7 个文件（feel / planner / schemer / executor / reviewer / feel-tester / archiver）<br>2. 7 个 Agent 文件内容对齐部署项目风格：简洁清晰、职责明确、模型声明正确<br>3. grep 搜索项目中对 auto-runner / code-worker / review-worker / ask / debug / test-writer / architect / code / tester 的残留引用（应为零）<br>4. core.md 行数 ≤ 270 行，自动闭环章节已重写为 Feel 调度模型<br>5. AGENTS.md 中已移除所有废弃 Agent 引用<br>6. `npm run build` 编译通过<br>7. `npm test` 测试 225/227 通过（无回归） |
| Stage 02 | 1. 使用 Schemer 制定方案时，验证 check-kb skill 被触发并加载相关条目<br>2. Executor 在无 op 方案时拒绝执行并输出提示<br>3. Executor 在 op 方案不完整时拒绝执行<br>4. `npm test` 测试通过 |
| Stage 03 | 1. Reviewer 审查报告包含「内部模式一致性」子维度条目<br>2. Executor 编码完成后方案文件有偏差标记<br>3. 非阻塞 REV 不中断流水线<br>4. `/opfx:status` 输出完整可视化视图<br>5. `npm test` 测试通过 |
| Stage 04 | 1-7 同上<br>8. `openfeel stage status/set/task` 命令可用，Agent 不直接 edit status.md |

## 六、质量指标

| 指标 | 目标 | 备注 |
|------|:--:|------|
| 阶段完成率 | 4/4 | 全部阶段闭环 |
| 测试通过率 | 225/227 | 不引入新失败 |
| 代码行数变化 | 净减少 ~600 行 | 删除 9 个 Agent（约 ~900 行）+ 重写 7 个 Agent（净减少 ~300 行）+ 精简 core.md（约 -170 行），新增功能代码约 ~600 行 |
| Agent 数量 | 15 → 7 | 减少 8 个（最终 7 个对齐部署项目） |
| core.md 行数 | 424 → ~250 | 精简约 41% |
| 知识库条目 | 19+ | 新增改进经验 |
