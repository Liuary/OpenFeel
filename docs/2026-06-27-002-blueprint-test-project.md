# 测试项目结构蓝图

> 基于一期部署测试项目 `openfeel_test` 的实际文件结构归档。测试项目为一次性项目，此文件保留其结构摘要供框架设计参考。

---

## 一、项目元信息

| 属性 | 值 |
|------|-----|
| 项目名称 | `todo-cli` |
| 部署路径 | `C:\Code\AI\test_deploy\openfeel_test` |
| 部署时间 | 2026-06-26 |
| 测试载体 | TypeScript Todo CLI（6 条命令） |
| 流水线状态 | `done`（6 阶段全程无回退） |

---

## 二、完整文件清单

```
openfeel_test/                          # 项目根目录
│
├── .gitignore
├── opencode.jsonc                      # default_agent: feel, skills 注册
├── package.json                        # todo-cli, ESM, 4 deps + 6 devDeps
├── tsconfig.json                       # strict, ES2022, bundler
├── vitest.config.ts                    # globals: true
├── deps.yaml                           # 2 stages, hard 依赖
│
├── roadmap/
│   └── v1.0.md                         # 分期大纲（Todo CLI 需求定义）
│
├── stages/                             # Planner 产出（阶段计划定义）
│   ├── stage-01-project-setup/
│   │   └── stage.md                    # 115 行，4 个操作分解
│   └── stage-02-cli-integration/
│       └── stage.md                    # 145 行，5 个操作分解
│
├── src/                                # 测试业务代码
│   ├── index.ts                        # CLI 入口（Commander）
│   ├── storage.ts                      # 数据持久化层（49 行）
│   ├── task-manager.ts                 # 业务逻辑层（97 行）
│   └── __tests__/
│       ├── storage.test.ts             # 4 个测试用例（77 行）
│       └── task-manager.test.ts        # 18 个测试用例（234 行）
│
├── .openfeel/                                # 规范工作区（知识沉淀层）
│   ├── kb/
│   │   ├── architecture.md             # 7 ADR（138 行）
│   │   ├── patterns.md                 # 7 代码模式（223 行）
│   │   └── troubleshooting.md          # 6 排查经验（144 行）
│   ├── bugs/
│   │   └── task-manager.md             # BUG-001(HIGH) + BUG-002(LOW)
│   ├── code_review/
│   │   └── stage-01-project-setup.md   # REV-001 ~ REV-009
│   └── docs/
│       ├── framework-understanding.md  # AI 对框架的深度理解（262 行）
│       ├── practice-insights.md        # 7 个实践问题与建议（151 行）
│       └── test-flow-summary.md        # 全流水线测试总结（313 行）
│   └── [缺失] dev/ log/ plan/ users/ tmp/ config.yaml .info.json
│
├── .openfeel/                          # OpenFeel 运行时（状态管理层）
│   ├── .info.json                      # { "user": "Liuary" }
│   ├── config.yaml                     # execution_mode: manual, auto_advance: enabled
│   ├── flow.json                       # 327 行，完整流水线状态 + 13 步日志
│   ├── roadmap/
│   │   └── v1.0.md                     # （空存根）
│   ├── stages/
│   │   ├── stage-01-project-setup/
│   │   │   ├── overview.md
│   │   │   ├── status.md
│   │   │   ├── summary.md              # 124 行，阶段归档总结
│   │   │   └── ops/                    # Schemer 产出
│   │   │       ├── op-001_工程初始化与依赖安装.md    # 115 行，18 子步骤
│   │   │       ├── op-002_数据层StorageService实现.md # 146 行，16 子步骤
│   │   │       ├── op-003_业务逻辑层TaskManager实现.md # 193 行，32 子步骤
│   │   │       └── op-004_单元测试编写.md            # 258 行，50+ 子步骤
│   │   └── stage-02-cli-integration/
│   │       ├── overview.md
│   │       └── status.md
│   └── [空目录] bugs/ code_review/ dev/ log/ kb/ tmp/
│
├── .opencode/                          # OpenCode 平台适配
│   ├── agents/
│   │   ├── feel.md                     # primary, DeepSeek V4 Pro(主力推理)
│   │   ├── planner.md                  # subagent, DeepSeek V4 Pro
│   │   ├── schemer.md                  # subagent, DeepSeek V4 Pro
│   │   ├── executor.md                 # subagent, DeepSeek V4 Flash(快速)
│   │   ├── reviewer.md                 # subagent, GLM/Qwen(异种推理)
│   │   ├── feel-tester.md              # subagent, DeepSeek V4 Pro
│   │   └── archiver.md                 # subagent, DeepSeek V4 Pro
│   └── skills/
│       ├── opfx-flow/
│       ├── opfx-plan/
│       ├── opfx-scheme/
│       ├── opfx-code/
│       ├── opfx-view/
│       ├── opfx-test/
│       ├── opfx-archive/
│       └── opfx-kb/
│   └── [缺失] instructions/core.md
│
└── dist/                               # TypeScript 编译产物
```

---

## 三、量化指标

| 维度 | 数值 |
|------|------|
| 总文件数 | ~45 |
| 核心业务代码行数 | 146（storage 49 + task-manager 97） |
| 测试代码行数 | 311（77 + 234） |
| 测试用例数 | 22（全部通过） |
| 操作方案子步骤总数 | 130+ |
| 自测清单项 | 54（100% 通过） |
| 审查发现问题 | 9（REV-001 ~ REV-009） |
| 测试发现 Bug | 2（1 HIGH + 1 LOW） |
| 知识条目 | 20（7 ADR + 7 模式 + 6 排查） |
| flow.json 日志步数 | 13 |
| Agent 定义数 | 7 |
| 技能定义数 | 8 |
| CLI 命令验证 | 9/11（2 个有问题） |

---

## 四、关键设计特征

### 4.1 双层工作区

| 层 | 目录 | 职责 | 文件类型 |
|----|------|------|----------|
| **沉淀层** | `.openfeel/` | 知识、审查、Bug、文档 | kb/, code_review/, bugs/, docs/ |
| **运行时层** | `.openfeel/` | 状态、配置、阶段、方案 | flow.json, config.yaml, stages/ |

这是实际运行中自然形成的分层，在 v1.1 中需要正式定义为设计规范。

### 4.2 操作方案粒度

Schemer 产出极细粒度操作方案：
- 每个 op 包含 16~50+ 个子步骤
- 每个子步骤含具体代码片段
- 自测清单逐项 checkbox
- Executor 可按步骤逐字执行

### 4.3 flow.json 数据结构

```jsonc
{
  "meta": { "version", "project", "updated" },
  "pipeline": { "phase", "current": { "stage", "op" }, "retry" },
  "stages": {
    "{stage}": {
      "name", "status", "deps": [],
      "ops": {
        "{op}": {
          "title", "state", "assignee", "attempts", "max_attempts",
          "checkpoints": { "plan", "scheme", "exec", "review", "test" }
        }
      }
    }
  },
  "reviews": [{ "id", "op", "status", "priority", "title", "filed_by", "filed_at" }],
  "log": [{ "time", "agent", "action", "detail" }]
}
```

### 4.4 依赖声明

```yaml
stages:
  stage-01: { depends: [], downstream: [{ stage: stage-02, type: hard }] }
  stage-02: { depends: [{ stage: stage-01, type: hard }], downstream: [] }
constraints:
  max_parallel: 1        # 串行执行
  review_gate: enabled   # 强制审查
  test_gate: enabled     # 强制测试
```

---

## 五、与设计目标的差异点

| 差异 | 设计 | 实际 | 影响 |
|------|------|------|------|
| `.info.json` 位置 | `.openfeel/` | `.openfeel/` | 位置偏移 |
| `config.yaml` 位置 | `.openfeel/` | `.openfeel/` | 位置偏移 |
| 阶段计划位置 | `.openfeel/plan/` | `stages/`（根目录） | 位置偏移 |
| Planner 模式 | Feel 兼任 | 独立 subagent | 架构调整 |
| Tester 命名 | `tester` | `feel-tester` | 命名不一致 |
| plan_review 阶段 | 独立存在 | 跳过 | 简化流程 |
| scheme_review 阶段 | 独立存在 | 跳过 | 简化流程 |
| Phase `"completed"` | 不存在 | Archiver 引入 | Bug |
| 审查/Bug 记录位置 | `.openfeel/users/{user}/` | `.openfeel/`（公共域） | 未区分公私域 |
