# OpenFeel v2.0 — 迭代打磨

> 创建时间：2026-06-27 | 拟稿人：Architect Agent (Liuary)
> 更新：2026-06-27 第二轮 — 融入统一结构、易扩展体系、交互式 CLI
> 基于：一期部署复盘（`docs/2026-06-27-001-deploy-review.md`）

---

## 一、版本定位

v1.0 验证了核心价值主张。v2.0 解决三个根本问题：

1. **统一结构** — `.openfeel/` 废弃，全部工作区内容归入 `.openfeel/`，消除双目录分裂
2. **易扩展** — 核心约束统一 + 适配器特化，新增 Agent/指令/流程阶段只需改配置
3. **交互式 CLI** — 输入 `openfeel` 进入 REPL，子命令在交互环境中执行

### 设计原则

| # | 原则 | 说明 |
|---|------|------|
| 1 | **数据驱动 > 硬编码** | 流水线状态、配置项、指令模板从配置文件加载 |
| 2 | **核心统一 + 适配器特化** | 共享约束放核心层，平台差异放适配器层 |
| 3 | **约定优于配置** | 遵循目录约定即可注册，不改核心入口 |
| 4 | **新增不改旧** | 扩展能力时只新增文件不改已有文件 |

---

## 二、架构调整总览

### 2.1 目录统一方案

```
废弃 .openfeel/ ─────────────────────────────────────────────┐
                                                        │
                                                        ▼
项目根目录                                 .openfeel/（唯一工作区）
├── docs/           ← .openfeel/docs/ 迁入       ├── flow.json
├── roadmap/                               ├── pipeline.yaml    ← v2 新增
├── stages/          ← 废弃（合并到        ├── config.yaml
│                     .openfeel/stages/）   ├── .info.json
├── AGENTS.md                              ├── plan/            ← .openfeel/plan/ 迁入
├── .opencode/                             ├── stages/          ← 根目录 stages/ 合并
└── src/                                   ├── roadmap/         ← 根目录 roadmap/ 合并
                                           ├── dev/             ← .openfeel/dev/ 迁入
                                           ├── log/             ← .openfeel/log/ 迁入
                                           ├── kb/              ← .openfeel/kb/ 迁入
                                           ├── code_review/     ← .openfeel/code_review/ 迁入
                                           ├── bugs/            ← .openfeel/bugs/ 迁入
                                           ├── users/           ← .openfeel/users/ 迁入
                                           └── tmp/             ← .openfeel/tmp/ 迁入
```

### 2.2 易扩展体系：核心层 + 适配器层

```
┌─────────────────────────────────────────────────────┐
│  核心层（跨平台统一）                                  │
│  ├── 流水线状态机（pipeline.yaml）                     │
│  ├── 核心约束（AGENTS.md）                            │
│  ├── 工作区规范（instructions/core.md）                │
│  ├── flow.json 数据结构                               │
│  └── 知识库 / 日志 / 审查 / Bug 体系                   │
├─────────────────────────────────────────────────────┤
│  适配器层（平台特化）                                  │
│  ├── OpenCode 适配器                                  │
│  │   ├── Agents 定义（.opencode/agents/*.md）         │
│  │   ├── Skills 定义（.opencode/skills/*/）           │
│  │   └── opencode.jsonc（权限、默认Agent）             │
│  ├── Kilo 适配器（后续）                               │
│  │   └── kilo.json / agents / skills                  │
│  └── Claude 适配器（后续）                              │
│      └── claude.json / agents / skills                │
└─────────────────────────────────────────────────────┘
```

**扩展场景验证**：

| 扩展需求 | 改动范围 | 是否改源码 |
|----------|---------|-----------|
| 新增 Agent 角色 | 在适配器目录下加一个 `.md` 文件 | ❌ |
| 新增流水线阶段 | 编辑 `pipeline.yaml` | ❌ |
| 新增 CLI 命令 | 在 `src/commands/` 下加一个文件 | ❌（自动发现） |
| 新增约束规则 | 编辑 `dev_core.md` 或 AGENTS.md | ❌ |
| 适配新平台 | 新建适配器目录 + 配置文件 | ❌（不改核心） |
| 修改状态机行为 | 编辑 `pipeline.yaml` | ❌ |

---

## 三、改进清单（25 项）

### 🔴 必须修复（基础设施 + Bug）

| # | 问题 | 阶段 |
|---|------|------|
| 1 | `.openfeel/` 废弃：全部工作区内容迁移到 `.openfeel/`，文档迁移到根目录 `docs/` | 01 |
| 2 | 根目录 `stages/` 和 `roadmap/` 迁移到 `.openfeel/` | 01 |
| 3 | 所有源码/文档中的 `.openfeel/` 路径引用更新为 `.openfeel/` | 01 |
| 4 | `openfeel init` 创建完整 `.openfeel/` 目录结构（取代当前残缺版） | 01 |
| 5 | `openfeel init` 生成 `.opencode/instructions/core.md` | 01 |
| 6 | `plan stage add` 不更新 `flow.json` 的 stages 字段 | 02 |
| 7 | `scheme create` 依赖 stage 已在 flow.json 注册（鸡生蛋） | 02 |
| 8 | Archiver 将 phase 设为 `"completed"` 而非标准枚举值 | 02 |

### 🟡 建议增强

| # | 改进 | 阶段 |
|---|------|------|
| 9 | `advance` 命令 opId 可选化（全局阶段不绑定具体 op） | 02 |
| 10 | `openfeel init` 默认安装覆盖率工具 | 05 |
| 11 | 知识库 `index.md` 由 Archiver 自动生成 | 05 |
| 12 | Windows ESM 路径平台自适应 | 05 |
| 13 | Schemer 对照 Roadmap 检查质量指标可验证性 | 02 |
| 14 | 依赖版本锁定策略写入 Schemer 方案模板 | 05 |

### 🔵 架构调整 + 规范固化

| # | 调整 | 阶段 |
|---|------|------|
| 15 | 交互式 CLI（REPL 模式）：`openfeel` 进入，子命令在交互环境执行 | 05 |
| 16 | Planner 保持独立 subagent | 03 |
| 17 | Executor "环境自适应"写入 Agent 规范 | 03 |
| 18 | Tester "边界测试生成"正式化 | 03 |
| 19 | 失败回退路径专项测试 | 04 |
| 20 | Agent 工具使用规范（todowrite/question/task/skill） | 03 |

### 🟢 可扩展性重构（核心 + 适配器）

| # | 改动 | 阶段 |
|---|------|------|
| 21 | 流水线状态机数据化：PipelinePhase / VALID_TRANSITIONS → `pipeline.yaml` | 07 |
| 22 | config.ts 通用化：switch/case → `yaml.parse()` + Zod Schema | 07 |
| 23 | 指令生成参数化：DEFAULT_RULES / techStack 从 config 读取 | 07 |
| 24 | CLI 命令自动发现：目录扫描 + 动态 import | 07 |
| 25 | 适配器层架构：核心约束统一，平台特化隔离到适配器目录 | 07 |

### ⚪ 待补齐

| # | 内容 | 阶段 |
|---|------|------|
| 26 | `openfeel instructions` 命令实现 | 05 |
| 27 | `openfeel update` 命令实现 | 05 |
| 28 | 测试项目 stage-02 操作方案补齐 | 06 |

---

## 四、阶段规划

### v2-stage-01：目录统一 + 基础设施补全

**目标**：`.openfeel/` 废弃，工作区统一到 `.openfeel/`。`openfeel init` 一键创建完整工作区。

| 操作 | 内容 |
|------|------|
| op-001 | **迁移 `.openfeel/` → `.openfeel/`**：dev/ log/ plan/ kb/ code_review/ bugs/ users/ tmp/ config.yaml .info.json |
| op-002 | **迁移根目录 → `.openfeel/`**：stages/ → `.openfeel/stages/`，roadmap/ → `.openfeel/roadmap/` |
| op-003 | **迁移 `.openfeel/docs/` → 根目录 `docs/`**：部署复盘等文档合并到项目文档 |
| op-004 | 删除空的 `.openfeel/` 目录，更新 `.gitignore` |
| op-005 | 更新所有源码/文档中的 `.openfeel/` 路径引用 → `.openfeel/` |
| op-006 | `openfeel init` 创建完整 `.openfeel/` 目录树（plan/stages/roadmap/dev/log/kb/code_review/bugs/users/tmp） |
| op-007 | `init` 生成 `.openfeel/dev/dev_core.md`、`.openfeel/dev/current.md` 模板 |
| op-008 | `init` 生成 `.opencode/instructions/core.md` |

**覆盖**：#1, #2, #3, #4, #5

---

### v2-stage-02：CLI Bug 修复 + 增强

**目标**：修复阻塞级 Bug，提升命令体验。

| 操作 | 内容 |
|------|------|
| op-001 | `plan stage add` 调用后自动同步写入 flow.json stages 字段 |
| op-002 | `scheme create` 检测 stage 注册状态，未注册自动注册 |
| op-003 | Archiver Agent 定义中固化 phase 枚举引用 |
| op-004 | `validate()` 增强容错——检测非标准 phase 自动修正 |
| op-005 | `advance` 命令 opId 改为可选参数 |
| op-006 | Schemer 方案模板增加质量指标可验证性检查 |

**覆盖**：#6, #7, #8, #9, #13

---

### v2-stage-03：Agent 规范 + 工具使用约束

**目标**：固化实战验证的 Agent 行为，建立跨 Agent 工具使用规范。

| 操作 | 内容 |
|------|------|
| op-001 | Planner Agent 确认为独立 subagent |
| op-002 | Executor Agent 写入"环境自适应"标准能力 |
| op-003 | Tester Agent 写入"边界测试生成"标准能力 |
| op-004 | 所有 Agent 定义中嵌入工具使用规范引用 |
| op-005 | `dev_core.md` 中补充跨 Agent 工具使用优先级表 |

**覆盖**：#16, #17, #18, #20

---

### v2-stage-04：韧性路径验证

**目标**：专项测试失败回退链路，验证自愈闭环。

| 操作 | 内容 |
|------|------|
| op-001 | 构造触发 `review_failed` 的场景，验证 → scheme_pending → 重定方案 → 修正 全链路 |
| op-002 | 构造触发 `test_failed` 的场景，验证 → scheme_pending → 重定方案 → 修复 → 再测 全链路 |
| op-003 | 验证 3 次重试上限后回退到 Schemer（不陷入死循环） |

**覆盖**：#19

---

### v2-stage-05：交互式 CLI + 工具链补齐

**目标**：`openfeel` 进入 REPL 模式，同时补齐缺失命令。

| 操作 | 内容 |
|------|------|
| op-001 | 实现 REPL 模式：`openfeel` 无参数进入交互环境 |
| op-002 | REPL 内支持所有子命令（init / flow / plan / scheme / view / archive / knowledge / instructions） |
| op-003 | REPL 与命令行模式共存：`openfeel init <path>` 仍可直接调用 |
| op-004 | `openfeel init` 默认安装 `@vitest/coverage-v8` |
| op-005 | Archiver 归档时自动生成/更新 `kb/index.md` |
| op-006 | CLI 底层增加 `resolveFileUrl()` 跨平台路径处理 |
| op-007 | Schemer 方案模板增加依赖版本锁定策略 |
| op-008 | `openfeel instructions <id>` 命令实现 |
| op-009 | `openfeel update` 命令实现 |

**覆盖**：#10, #11, #12, #14, #15, #26, #27

---

### v2-stage-06：部署测试 2.0

**目标**：在新测试项目中执行完整流水线，验证所有改进。

| 操作 | 内容 |
|------|------|
| op-001 | 在新项目执行 `openfeel init` → 完整 `.openfeel/` 结构 |
| op-002 | 补齐 stage-02 ops/，完整 6 阶段流水线 |
| op-003 | 验证 CLI Bug 修复、REPL 模式、韧性路径 |
| op-004 | 验证 Agent 工具使用规范在实际执行中生效 |
| op-005 | 产出 v2 部署复盘文档 → `docs/` 归档 |

**覆盖**：#28

---

### v2-stage-07：可扩展性重构（核心 + 适配器）

**目标**：核心模块数据驱动，建立适配器分层架构。

#### A. 流水线状态机数据化

| 操作 | 内容 |
|------|------|
| op-001 | 定义 `pipeline.yaml` Schema（phases / transitions / checkpoints / defaults） |
| op-002 | FlowManager 构造函数加载 `pipeline.yaml`，替换硬编码 |
| op-003 | `advancePhase()` / `validate()` 改为配置驱动 |
| op-004 | 测试用例从 `pipeline.yaml` 读取 phase 字面量 |

#### B. 配置解析通用化

| 操作 | 内容 |
|------|------|
| op-005 | `ConfigSchema`（Zod），`readConfig()` 改为 `yaml.parse()` + Schema 校验 |
| op-006 | 新增配置项只需扩展 Schema，不改解析逻辑 |

#### C. 指令生成参数化

| 操作 | 内容 |
|------|------|
| op-007 | `config.yaml` 增加 `meta.project`、`meta.tech_stack` |
| op-008 | `generateProjectContext()` 从 config 读取，消除硬编码常量 |
| op-009 | 输出结构（XML/JSON）支持模板文件加载 |

#### D. CLI 自动发现

| 操作 | 内容 |
|------|------|
| op-010 | `autoRegisterCommands()`：扫描 `src/commands/` → 动态 import → 注册 |
| op-011 | 新增命令只需加文件，不改 `cli/index.ts` |

#### E. 适配器层架构

| 操作 | 内容 |
|------|------|
| op-012 | 定义适配器目录规范：`.opencode/`（当前）、`kilo/`（预留）、`claude/`（预留） |
| op-013 | 核心约束（AGENTS.md / instructions/core.md）提取平台无关部分 |
| op-014 | 平台特化（工具权限、Agent 定义、Skill 定义）隔离到各自适配器目录 |

**覆盖**：#21, #22, #23, #24, #25

---

## 五、阶段依赖

```
v2-stage-01（目录统一 + 基础设施）
     │
     ├──→ v2-stage-02（CLI 修复）←── 并行 ──→ v2-stage-03（Agent 规范）
     │         │                                      │
     │         ├──→ v2-stage-04（韧性验证）           │
     │         │         │                            │
     │         │         ├──→ v2-stage-07（可扩展性）─┘
     │         │         │         │
     │         │         │         └──→ v2-stage-06（部署测试 2.0）
     │         │         │
     │         └──→ v2-stage-05（交互CLI + 工具链）───┘
```

- **v2-stage-01**：全局前置（所有阶段需要统一后的目录结构）
- **v2-stage-02 ∥ v2-stage-03**：可并行
- **v2-stage-05**：依赖 stage-02（需要修复后的 CLI）
- **v2-stage-04**：依赖 stage-02
- **v2-stage-07**：依赖 stage-02 + stage-04（需要稳定的流水线环境）
- **v2-stage-06**：依赖全部前置阶段

---

## 六、验证方式

### 基础验证

```
$ openfeel                          # 进入 REPL 交互模式
openfeel> init                      # 在当前目录创建完整 .openfeel/
openfeel> plan stage add stage-01   # flow.json stages 自动注册
openfeel> scheme create stage-01 测试
openfeel> flow advance --to review_pending   # opId 可选
openfeel> archive stage-01          # phase = "done"
openfeel> instructions stage-01 --change test
openfeel> update
openfeel> exit
```

### 命令行兼容

```
$ openfeel init /path/to/project    # 传统模式仍然可用
$ openfeel flow status
```

### 可扩展性验证

```
# 新增流水线阶段
编辑 .openfeel/pipeline.yaml → 添加 phase + transition → 不改 TS 源码即可推进

# 新增 CLI 命令
在 src/commands/ 下加文件 → 不改 cli/index.ts 即可用

# 新增 Agent
在 .opencode/agents/ 下加 .md → 自动发现

# 适配新平台
新建 kilo/ 目录 + 配置文件 → 不改核心代码
```
