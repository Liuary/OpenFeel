# OpenFeel v0.3.0 项目计划

> 创建时间：2026-06-27 | 拟稿人：Architect Agent (Liuary)
> 状态：draft | 基于二期 NumKit 端到端测试审查驱动

---

## 一、版本定位

> **从概念验证到生产可用** — 修复测试暴露的工程缺陷，提升效率，补齐体验短板。

一期 (v1.0) 搭建了核心流水线骨架，二期 (v2.0) 完成了架构统一与工程打磨。三期 (v3.0) 以真实测试反馈为驱动，解决阻碍生产使用的硬伤。

---

## 二、输入来源

三期所有任务来源于 **二期 NumKit 测试审查** 中发现的 12 个问题 + 5 条设计建议，详见 `docs/phase-2/issues_and_improvements.md`。

---

## 三、阶段划分

### v3-stage-01：flow.json 鲁棒性加固（P0）

**目标**：消除 flow.json 状态机的两个致命隐患——非法 Phase 值写入和 JSON 结构损坏。

| # | 任务 | 类型 | 对应问题 |
|:--:|------|------|:--:|
| 1.1 | `Phase` 从动态 `string` 硬化为 Zod enum，写入时拒绝非法值 | 代码 | P0 #1 |
| 1.2 | flow.json 读写通过 `FlowManager` 封装，CLI 层禁止直接文件操作 | 代码 | P0 #2 |
| 1.3 | `flow validate` 遇到非法 phase 时自动修正为最近合法值并警告 | 代码 | P0 #1 |
| 1.4 | `flow repair` 命令：自动检测并修复常见格式问题（重复字段、缺少字段等） | 命令 | P0 #2 |
| 1.5 | 每次写入 flow.json 前自动备份（`.bak`），写入后 JSON 格式校验 | 代码 | P2 #9 |

**修改文件**：`src/core/flow-manager.ts`, `src/core/pipeline-schema.ts`, `src/commands/flow.ts`

---

### v3-stage-02：模型配置落地（P0）

**目标**：将设计中的模型分配机制从文本描述落地为实际配置，使异种交叉审查真正生效。

| # | 任务 | 类型 | 对应问题 |
|:--:|------|------|:--:|
| 2.1 | `config.yaml` 增加 `models` 节 Zod schema（default / agents / roles 三级） | 代码 | P0 #3 |
| 2.2 | `model-check` skill 与 config 联动：检测 → 报告 → 引导配置 → 写入 | Skill | P0 #3 |
| 2.3 | 各 Agent 的 prompt 中增加"读取模型配置"步骤（当前仅 architect/code 有） | Agent | P0 #3 |
| 2.4 | 首次配置后自动导出 `models.template.yaml` 供新项目复用 | 代码 | P0 #3 |
| 2.5 | Agent YAML frontmatter 增加 `model` 字段声明（如 `model: cross_model`） | Agent | 设计 |

**修改文件**：`src/core/config.ts`, `.openfeel/config.yaml`, `.opencode/skills/model-check/SKILL.md`, `.opencode/agents/{feel,planner,executor,reviewer,review-worker,tester,test-writer,archiver,auto-runner,debug,ask,code-worker}.md`

---

### v3-stage-03：效率优化（P1）

**目标**：解决测试中暴露的流程摩擦——小修正过重、串行低效、方案盲区。

| # | 任务 | 类型 | 对应问题 |
|:--:|------|------|:--:|
| 3.1 | **轻量修正路径**：REV 条目增加 `canAutoFix` 标记，Reviewer 判断明确时可跳过 Schemer，直接由 Executor 修正 | 代码 + Agent | P1 #5 |
| 3.2 | **`flow health` 命令**：跨文件一致性检测（flow.json ↔ status.md ↔ 实际文件），僵尸状态检测 | 命令 | P1 #7 |
| 3.3 | **Schemer/Executor npm 版本校验**：方案声明前 `npm view` 验证版本存在性 | Agent | P1 #4 |
| 3.4 | **Feel 并行调度**：调度时读 `deps.yaml`，无依赖的 op 并行启动多个 Executor | Agent | P1 #6 |

**修改文件**：`src/core/flow-manager.ts`, `src/commands/flow.ts`, `.opencode/agents/feel.md`, `.opencode/agents/schemer.md`, `.opencode/agents/executor.md`

---

### v3-stage-04：体验补全（P2）

**目标**：降低使用门槛，增强长期可用性。

| # | 任务 | 类型 | 对应问题 |
|:--:|------|------|:--:|
| 4.1 | **`flow wizard` 交互模式**：引导式流水线推进（当前状态 → 可选下一步 → 预览 → 执行） | 命令 | P2 #9 |
| 4.2 | **`init` 增强**：增加 `--demo` 标志创建带示例骨架的项目 | 命令 | P2 #12 |
| 4.3 | **Reviewer/Tester 边界明确**：Reviewer→方案符合性，Tester→功能正确性；Reviewer 观察可附带 `→Tester重点` 标记 | Agent | P2 #10 |
| 4.4 | **KB 自动检索**：Schemer/Executor prompt 增加"执行前先查 KB"指令 | Agent + Skill | P2 #11 |
| 4.5 | **npm 超时保护**：`npm install` 60s 超时 + 网络连通性预检 | Agent | P2 #8 |
| 4.6 | **结构化文件安全编辑**：JSON/YAML 修改后自动格式校验 | Agent | P2 #9 |

**修改文件**：`src/commands/flow.ts`, `src/commands/init.ts`, `src/core/init.ts`, `.opencode/agents/{feel,reviewer,tester,schemer,executor}.md`, `.opencode/skills/check-kb/SKILL.md`

---

## 四、并行批次

```
Batch 1 (并行)
├─ v3-stage-01: flow.json 鲁棒性        ← 修改 flow-manager.ts, pipeline-schema.ts, commands/flow.ts
└─ v3-stage-02: 模型配置落地             ← 修改 config.ts, config.yaml, Agent .md 文件

Batch 2 (串行，依赖 stage-01)
└─ v3-stage-03: 效率优化                ← 修改 flow-manager.ts, commands/flow.ts + Agent 文件

Batch 3 (串行，依赖 stage-03 Agent 文件)
└─ v3-stage-04: 体验补全                ← 修改 commands/flow.ts, init.ts, Agent 文件
```

**并行安全说明**：
- stage-01 和 stage-02 修改完全不同的文件集，可安全并行
- stage-03 依赖 stage-01 的 FlowManager 改造，需串行
- stage-04 依赖 stage-03 的 Agent prompt 修改，需串行

---

## 五、验证方式

每阶段完成后：

| 阶段 | 验证方式 |
|------|----------|
| stage-01 | `npm test` 全部通过；手动写入非法 phase → `flow status` 拒绝；`flow repair` 修复损坏 JSON |
| stage-02 | `model-check` skill 正常检测报吿；`config.yaml` models 节写入后各 Agent 可读取 |
| stage-03 | `flow health` 检测一致性；并行调度日志确认多 Executor 启动；npm 版本校验拒绝不存在的包 |
| stage-04 | `flow wizard` 交互流程完整；`init --demo` 生成可用项目；KB 自动检索有日志输出 |

三期全量验证：用改进后的 OpenFeel 重新运行 NumKit 端到端测试，对比改进前后的 Agent 调用次数和错误处理能力。

---

## 六、质量指标

| 指标 | 目标 |
|------|:--:|
| 阶段完成 | 4/4 done |
| 测试通过 | 全部现有测试 + 新增测试 |
| 二级审查 Bug | 0 open |
| 知识条目新增 | ≥5 |

---

> **下一步**：确认阶段划分后，制定 deps.yaml 和 status.md，启动 Batch 1（stage-01 + stage-02 并行）。
