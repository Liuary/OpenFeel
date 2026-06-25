# OpenFeel 项目计划

> 创建时间：2026-06-24 | 拟稿人：Architect Agent (Liuary)
> 状态：draft | 最后更新：2026-06-24（流水线 Agent + flow.json + 模型分工）

---

## 一、项目定位

**OpenFeel** = AI_Prompt 的治理思想 × OpenSpec 的工具化方法，以 **Feel 为总统领** 的流水线 Agent 体系。

核心理念：**提示词瘦身，流程入工具**——Agent 不靠读长文本来理解流程，而是通过 TypeScript 工具（flow.json）获取当前状态和下一步指令。

---

## 二、Agent 体系

### 2.1 角色总览

```
用户 ←→ Feel（总统领）
           │
           ├── Planner  （计划官）  制定阶段计划
           ├── Schemer  （方案官）  制定开发方案（三层最底层）
           ├── Executor （执行官）  编码实现 + 自测
           ├── Reviewer （审查官）  审查计划/方案/代码
           ├── Tester   （测试官）  正式测试验收
           └── Archiver （归档官）  归档操作记录
```

### 2.2 模型分工

| Agent | 模型类型 | 示例 | 理由 |
|-------|---------|------|------|
| **Feel** | 主力推理 | DeepSeek V4 Pro | 全局调度，需深度理解 |
| **Planner** | （由 Feel 兼任） | — | 计划制定与 Feel 高度耦合 |
| **Schemer** | 主力推理 | DeepSeek V4 Pro | 方案制定需细粒度推理 |
| **Reviewer** | **异种推理** | GLM / Qwen | 异种模型交叉审查，避免同模型盲区 |
| **Executor** | 快速模型 | DeepSeek V4 Flash | 编码执行，速度优先 |
| **Tester** | 主力推理 | DeepSeek V4 Pro | 测试分析与用例设计 |
| **Archiver** | 主力推理 | DeepSeek V4 Pro | 归档需要理解上下文 |

### 2.3 各 Agent 职责

| Agent | 触发时机 | 输入 | 输出 |
|-------|---------|------|------|
| **Feel** | 用户对话 | 用户意图 | 调度决策 → 调用下游 Agent |
| **Planner** | 新版本启动 | 分期大纲 | 工作阶段划分 + 依赖声明 |
| **Schemer** | 阶段启动 / 审查不通过 / 测试不通过 | 阶段目标 + 问题描述 | 操作方案（op-xxx.md，极细粒度） |
| **Executor** | Schemer 产出方案后 | 操作方案 + 上下文 | 代码实现 + 自测报告 |
| **Reviewer** | Executor 自检通过后 | 代码 diff + 操作方案 | 审查条目（REV） |
| **Tester** | Reviewer 通过后 | 全量代码 + 方案 | 测试报告 / Bug 报告 |
| **Archiver** | Tester 通过后 | 阶段全部产出 | 归档总结 + 知识条目 |

---

## 三、开发流水线

### 3.1 完整流程

```
Phase 1: 计划
  Feel + User 讨论 → Planner 制定阶段计划 → Reviewer 审查计划
    └─ 不通过 → Planner 修改 → Reviewer 再审

Phase 2: 方案
  Schemer 制定开发方案（操作方案列表）→ Reviewer 审查方案
    └─ 不通过 → Schemer 修改 → Reviewer 再审

Phase 3: 执行循环
  ┌→ Executor 按方案编码 → 自测
  │   ├─ 通过 → 进入 Phase 4
  │   ├─ 不通过（< 3次）→ 重新执行
  │   └─ 不通过（≥ 3次）→ 回到 Phase 2（Schemer 重定方案）
  └──────────────────────────────────────┘

Phase 4: 审查循环
  Reviewer 审查代码 → 提交问题给 Schemer
    └─ Schemer 制定修正方案 → Executor 修正 → Reviewer 再审
       └─ 循环至无问题

Phase 5: 测试
  Tester 测试
    ├─ 通过 → 进入 Phase 6
    └─ 发现 Bug → Schemer 制定修复方案 → Executor 修复
       └─ 修复 Bug 的始终是 Executor → Tester 再测 → 循环

Phase 6: 归档
  Archiver 归档操作记录 + 提取知识条目
```

### 3.2 状态流转图

```
  plan_pending ──→ plan_review ──→ plan_passed
                                       │
                                  scheme_pending ──→ scheme_review ──→ scheme_passed
                                                                           │
                          ┌────────────────────────────────────────────────┘
                          ▼
                    exec_running ──→ self_check
                      │    ↑            │
                      │    └── retry < 3┤
                      │                ├── pass → review_pending
                      └── retry ≥ 3 ──→ scheme_pending（重定方案）
                                                │
                                          review_pending ──→ review_failed ──→ scheme_pending（修正方案）
                                                │                    ↑              │
                                                └── review_passed ───┘              │
                                                       │                          │
                                                  test_pending                     │
                                                       │                          │
                                                  test_failed ─────────────────────┘
                                                       │
                                                  test_passed
                                                       │
                                                  archiving ──→ done
```

---

## 四、flow.json — 流程管理工具的数据核心

### 4.1 设计原则

- **JSON 格式**：机器可读写，TypeScript 工具管理 CRUD
- **Feel 不直接读文件**：Feel 通过 CLI 调用 `openfeel flow` 查询和推进
- **替代 status.md**：状态不再靠 Agent 手动维护 Markdown，改为工具自动更新

### 4.2 数据结构

```jsonc
// .openfeel/flow.json
{
  "meta": {
    "version": "1.0",
    "project": "OpenFeel",
    "updated": "2026-06-24T12:00:00Z"
  },

  "pipeline": {
    "phase": "executing",                    // 当前流水线阶段
    "current": { "stage": "stage-01", "op": "op-002" },
    "retry": 2                              // 当前 op 执行官重试次数
  },

  "stages": {
    "stage-01": {
      "name": "项目骨架与构建体系",
      "status": "in_progress",
      "deps": [],
      "ops": {
        "op-001": {
          "title": "搭建TS项目骨架",
          "state": "done",
          "assignee": "executor",
          "attempts": 1,
          "max_attempts": 3,
          "checkpoints": {
            "plan": "passed",
            "scheme": "passed",
            "exec": { "attempts": 1, "self": "passed" },
            "review": "passed",
            "test": "passed"
          }
        },
        "op-002": {
          "title": "配置vitest测试框架",
          "state": "executing",
          "assignee": "executor",
          "attempts": 2,
          "max_attempts": 3,
          "checkpoints": {
            "plan": "passed",
            "scheme": "passed",
            "exec": { "attempts": 2, "self": "failed" }
          }
        }
      }
    }
  },

  "reviews": [
    {
      "id": "REV-001",
      "op": "stage-01.op-002",
      "status": "open",
      "priority": "high",
      "title": "vitest配置缺少全局类型声明",
      "filed_by": "reviewer",
      "filed_at": "2026-06-24T13:00:00Z"
    }
  ],

  "log": [
    { "time": "2026-06-24T12:00Z", "agent": "feel", "action": "phase_change",
      "detail": { "from": "scheme_review", "to": "exec_running", "stage": "stage-01", "op": "op-001" }},
    { "time": "2026-06-24T12:30Z", "agent": "executor", "action": "self_check_failed",
      "detail": { "stage": "stage-01", "op": "op-002", "attempt": 2 }}
  ]
}
```

### 4.3 FlowManager 工具 API（TypeScript）

Feel 和其他 Agent 不直接操作 flow.json。所有读写通过 `FlowManager` 类：

```typescript
class FlowManager {
  // ── 查询（所有 Agent 可调用）──
  getPhase(): PipelinePhase                    // 当前阶段
  getCurrent(): { stage: string, op: string }  // 当前操作
  getOpState(opId: string): OpState            // 操作方案状态
  getOpCheckpoints(opId: string): Checkpoints  // 各阶段 checkpoint
  getReadyOps(): Op[]                          // 可执行的操作（前置满足）
  getReviewItems(opId?: string): ReviewItem[]  // 审查条目
  getRetryCount(opId: string): number          // 当前重试次数
  summary(): PipelineSummary                   // 人类可读摘要

  // ── 推进（由 Feel / Agent 通过 CLI 调用）──
  advancePhase(opId: string, to: PipelinePhase): void
  recordAttempt(opId: string, result: 'pass' | 'fail'): {
    shouldRetry: boolean,                      // 是否应该重试
    shouldReplan: boolean                      // 是否应该重定方案（≥3次失败）
  }
  addReview(item: ReviewItem): void
  resolveReview(reviewId: string): void
  appendLog(entry: LogEntry): void

  // ── 校验 ──
  canAdvance(opId: string, to: PipelinePhase): boolean
  validate(): ValidationResult
}
```

### 4.4 Flow 命令（Feel 的操作入口）

```
openfeel flow
├── status                              # 当前流水线状态摘要
├── current                             # 当前 op + phase + retry
├── advance --op <id> --to <phase>      # 推进阶段（Feel 专用）
├── attempt --op <id> --result <p/f>    # 记录执行结果
├── review add --op <id> [--title]     # 添加审查条目
├── review resolve <rev-id>            # 解决审查条目
├── retry --op <id>                     # 查看重试状态
└── log [--last <n>]                    # 查看操作日志
```

---

## 五、三层计划体系

### 5.1 层级

```
分期大纲 (roadmap/v1.0.md)       ← Feel + Planner
  └── 工作阶段 (stages/stage-01/)  ← Planner
        └── 操作方案 (stages/stage-01/ops/op-003.md) ← Schemer（最底层、最细）
```

### 5.2 操作方案模板（Schemer 产出）

操作方案由 Schemer 按固定模板生成，确保 Executor 可精准执行：

```markdown
# op-003：实现 CLI 入口

- **阶段**：stage-01
- **状态**：（由 flow.json 管理，不手动修改）
- **前置**：op-001, op-002
- **负责 Agent**：Executor
- **最多重试**：3

## 目标
创建 CLI 入口文件，用户可通过 `openfeel` 命令调用工具。

## 实施步骤
- [ ] 创建 `bin/openfeel.js`（shebang + 导入 cli）
- [ ] 创建 `src/cli/index.ts`（commander 程序注册）
- [ ] package.json 注册 `bin` 字段

## 产出文件
- `bin/openfeel.js`
- `src/cli/index.ts`

## 自测清单（Executor 完成后逐项确认）
- [ ] `node bin/openfeel.js --version` 输出版本号
- [ ] `node bin/openfeel.js --help` 显示命令列表
- [ ] TypeScript 编译无错误

## 修正记录
| 次数 | 时间 | 问题 | 修正内容 |
|------|------|------|----------|
```

---

## 六、CLI 命令体系

```
openfeel
├── init [path]                       # 初始化 .openfeel/ 工作区 + flow.json
├── update                            # 刷新 Agent/Skill 文件
│
├── flow                              # 流水线管理（★ 核心）
│   ├── status                        # 当前状态摘要
│   ├── current                       # 当前 op + phase
│   ├── advance --op <id> --to <p>   # 推进阶段
│   ├── attempt --op <id> --r <p/f>  # 记录执行结果
│   ├── review add/resolve           # 审查条目管理
│   └── log [--last <n>]             # 操作日志
│
├── roadmap                           # 分期大纲
│   ├── create <version>
│   └── show [version]
│
├── plan                              # Planner 产出
│   ├── stage add <name>
│   └── stage status [name]
│
├── scheme                            # Schemer 产出
│   ├── create <stage> <title>       # 创建操作方案
│   └── status [--op <id>]           # 查看方案状态
│
├── view                              # Reviewer 操作
│   ├── list [--op <id>]
│   ├── add [--op <id>]
│   └── accept <rev-id>
│
├── archive <stage>                   # Archiver 操作
│
└── knowledge                         # 知识库
    ├── list / add / search
```

---

## 七、/opfx:* 技能映射

| Skill | 驱动 | 模型 |
|-------|------|------|
| `/opfx:flow` | → CLI `openfeel flow *` | Feel 调用 |
| `/opfx:plan` | → Planner Agent | 推理模型 |
| `/opfx:scheme` | → Schemer Agent | 推理模型 |
| `/opfx:code` | → Executor Agent | 快速模型 |
| `/opfx:view` | → Reviewer Agent | 异种推理模型 |
| `/opfx:test` | → Tester Agent | 推理模型 |
| `/opfx:archive` | → Archiver Agent | 推理模型 |
| `/opfx:kb` / `:init` / `:update` | CLI 直接 | — |

---

## 八、开发阶段规划（9 阶段）

| 阶段 | 名称 | 核心产出 | 复杂度 |
|------|------|----------|--------|
| **stage-01** | 项目骨架与构建体系 | package.json, tsconfig, CLI 框架, vitest | ⭐⭐ |
| **stage-02** | 核心 Schema 引擎 | ArtifactGraph, Schema 验证, 状态检测 | ⭐⭐⭐⭐ |
| **stage-03** | 工作区 + flow.json | .openfeel/ 初始化, FlowManager 类, flow 命令 | ⭐⭐⭐ |
| **stage-04** | 三层计划管理 | roadmap/stage/op 体系, scheme 命令 | ⭐⭐⭐ |
| **stage-05** | 指令生成系统 | XML 指令, 模板渲染, 上下文注入 | ⭐⭐⭐⭐ |
| **stage-06** | Review + Archive 闭环 | view/archive 命令, 审查条目, 归档合并 | ⭐⭐⭐ |
| **stage-07** | OpenCode 适配器 | Feel/Planner/Schemer/Executor/Reviewer/Tester/Archiver + /opfx:* 技能 | ⭐⭐⭐ |
| **stage-08** | 知识库系统 | kb/ 管理, 经验暂存归档 | ⭐⭐ |
| **stage-09** | 测试、文档与发布 | 测试 > 80%, README, npm 发布, CI | ⭐⭐⭐ |

### 阶段详细

#### Stage 03：工作区 + FlowManager（核心变更）
- `openfeel init` 创建 `.openfeel/` + 初始化 `flow.json`
- **FlowManager 类**：JSON 读写、状态推进、重试计数、校验
- `openfeel flow` 命令组（status/current/advance/attempt/log）
- config.yaml + .info.json

#### Stage 04：三层计划 + Scheme 命令
- `openfeel roadmap` — 分期大纲
- `openfeel plan stage` — 工作阶段
- `openfeel scheme create` — Schemer 产出操作方案（固定模板）
- flow.json 中的 stages/ops 自动同步

#### Stage 07：OpenCode 适配器
- **Feel Agent**（总统领，推理模型）
- **流程 Agent 定义**：Planner / Schemer / Executor / Reviewer / Tester / Archiver
- 每个 Agent 定义绑定对应模型配置
- **/opfx:* 技能**生成：flow/plan/scheme/code/view/test/archive/kb/init/update

---

## 九、并行批次

```
Batch 1   stage-01                    项目骨架
               │
Batch 2   stage-02 ∥ stage-03        Schema引擎 ∥ 工作区+FlowManager
            │   │       │   │
Batch 3   stage-04 ∥ stage-06 ∥ stage-08   计划 ∥ 审查归档 ∥ 知识库
            │                     │
Batch 4   stage-05 ──→ stage-07          指令生成 → OpenCode适配
            │          │
Batch 5   ───── stage-09 ─────            测试·文档·发布
```

---

## 十、验证方式

端到端流水线验证：

```
$ openfeel init                                    # 创建 .openfeel/ + flow.json
$ openfeel flow status                             # 查看空流水线
$ openfeel roadmap create v1.0                      # 分期大纲
$ openfeel plan stage add stage-01                  # 工作阶段
$ openfeel scheme create stage-01 搭建TS骨架        # Schemer 创建方案
$ openfeel flow advance --op op-001 --to exec_running
$ openfeel flow attempt --op op-001 --result pass   # Executor 自检通过
$ openfeel flow advance --op op-001 --to review_pending
$ openfeel view add --op op-001 --title "测试问题"   # Reviewer 发现问题
$ openfeel flow advance --op op-001 --to review_failed
# → Schemer 重新制定修正方案 → Executor 修复 → 循环
$ openfeel flow advance --op op-001 --to done
$ openfeel archive stage-01
```

---

## 十一、技术选型

| 类别 | 选型 |
|------|------|
| 语言 | TypeScript 5.x |
| CLI | commander ^14 |
| Schema | zod ^4 + yaml ^2 |
| 模板 | Handlebars |
| 测试 | vitest |
| 发布 | Changeset |

---

> **下一步**：确认流水线设计后，从 stage-01 启动。