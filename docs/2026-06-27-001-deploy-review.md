# OpenFeel 一期部署：设计目标与实际交付对比分析

> **编写时间**：2026-06-27  
> **编写人**：Architect Agent (Liuary)  
> **来源**：基于测试项目 `openfeel_test`（TypeScript Todo CLI）全流水线实战复盘  
> **目标用途**：为框架 v1.1 迭代提供根基参考

---

## 一、测试项目概览

### 1.1 部署内容

本次部署将 OpenFeel 一期产出的框架能力，以 **TypeScript Todo CLI** 为测试载体，执行了完整的 6 阶段流水线：

```
Plan → Scheme → Code → Review → Test → Archive
```

### 1.2 实际目录结构

```
测试项目根目录 (openfeel_test)
├── .openfeel/                     # 规范工作区（部分填充）
│   ├── docs/                # 3 份 AI 自我认知文档 + 本对比文档
│   ├── kb/                  # 知识库（架构决策、代码模式、排查经验）
│   ├── bugs/                # Bug 记录（BUG-001 ~ BUG-002）
│   ├── code_review/         # 审查条目（REV-001 ~ REV-009）
│   └── [缺失] dev/ log/ plan/ users/ tmp/ config.yaml .info.json
│
├── .openfeel/               # OpenFeel 运行时（主要数据沉淀于此）
│   ├── flow.json            # 流水线状态机（核心数据文件）
│   ├── config.yaml          # 执行配置
│   ├── .info.json           # 用户身份
│   ├── stages/              # 阶段运行时产出
│   │   └── stage-01-project-setup/
│   │       ├── ops/         # 4 个操作方案
│   │       ├── summary.md   # 阶段归档总结
│   │       ├── overview.md  # 阶段概览
│   │       └── status.md    # 阶段状态
│   └── [空] bugs/ code_review/ dev/ log/ kb/ tmp/
│
├── .opencode/               # OpenCode 平台适配
│   ├── agents/              # 7 个 Agent 定义
│   ├── skills/              # 8 个 /opfx:* 技能
│   └── [缺失] instructions/core.md  ← CRITICAL
│
├── roadmap/v1.0.md          # 分期大纲
├── stages/                  # 阶段计划定义
│   ├── stage-01-project-setup/stage.md
│   └── stage-02-cli-integration/stage.md
├── deps.yaml                # 阶段依赖声明
├── src/                     # 测试业务代码（Todo CLI）
│   ├── storage.ts           # 数据持久化层（49 行）
│   ├── task-manager.ts      # 业务逻辑层（97 行）
│   ├── index.ts             # CLI 入口
│   └── __tests__/           # 22 个单元测试用例
└── package.json / tsconfig.json / vitest.config.ts
```

---

## 二、测试项目 AI 的自我认知

测试项目中的 AI Agent 在流水线执行过程中，产出了三份深度自我认知文档。以下是核心观点的提炼：

### 2.1 框架理解（framework-understanding.md）

AI 将 OpenFeel 定位为 **"将传统软件工程方法论系统性地应用于 AI Agent 协作开发"的治理框架**，具体认知包括：

| 认知维度 | AI 的理解 |
|----------|----------|
| **核心洞察** | 角色分离解耦认知负担——规划、编码、审查分配给不同 Agent |
| **关键创新** | 异种模型交叉审查——不同模型系列审查，消除同模型盲区 |
| **流程设计** | 串行流水线 + 条件回退 = 自愈闭环 |
| **知识管理** | Archiver 从操作记录中提取结构化知识，解决"每次从零开始" |
| **CLI 设计** | CLI → Skill → Agent 三层解耦映射 |

AI 还准确识别了框架的潜在局限：
- 流程刚性 vs 灵活性（缺少自适应）
- 串行瓶颈（吞吐量受限）
- 模型成本（4-6 倍于直接编码）
- 异种模型审查能力的前置假设
- 知识库冷启动问题

### 2.2 实践感受（practice-insights.md）

在实际运行中，AI 识别出 **7 个框架问题**：

| # | 问题 | 根因 | 严重度 |
|---|------|------|--------|
| 1 | `plan stage add` 不更新 `flow.json` 的 stages 字段 | `addStage()` 仅操作文件系统 | 阻塞级 |
| 2 | `scheme create` 与 flow.json 鸡生蛋问题 | 假定 stage 已注册但注册步骤缺失 | 阻塞级 |
| 3 | Archiver 使用非标准 phase 值 `"completed"` | 未引用标准枚举 | 中 |
| 4 | Windows ESM 路径兼容性 | URL 格式的盘符处理 | 低 |
| 5 | `advance` 命令 opId 语义不够灵活 | 全局阶段不应绑定具体 op | 中 |
| 6 | 依赖版本漂移 | 方案未明确版本锁定策略 | 低 |
| 7 | 覆盖率工具缺失 | Schemer 未对照 Roadmap 检查 | 中 |

### 2.3 测试总结（test-flow-summary.md）

流水线执行的量化结果：

| 阶段 | 状态 | 关键产出 | 问题发现 |
|------|------|----------|----------|
| Plan | ✅ 通过 | roadmap、deps.yaml、stage 定义 | 0 |
| Scheme | ✅ 通过 | 4 个 op，总计 130+ 子步骤 | 0 |
| Code | ✅ 100% | 54 项自测全部通过 | 0（编码阶段） |
| Review | 有条件通过 | 5 维度审查 | 9 条 REV |
| Test | 有条件通过 | 22 用例 + 15 边界测试 | 2 个 Bug |
| Archive | ✅ 完成 | 7 ADR + 7 模式 + 6 排查 | 0 |

**遗留问题合计**：11 项（1 HIGH / 2 MEDIUM / 8 LOW）

---

## 三、OpenFeel v1.0 设计目标回顾

### 3.1 核心理念

| 设计维度 | 目标 |
|----------|------|
| **总体定位** | 以 Feel 为总统领的流水线 Agent 体系 |
| **核心思想** | 提示词瘦身，流程入工具——Agent 通过 TypeScript 工具操作 flow.json |
| **方法论** | 将软件工程方法论注入 AI Agent 协作开发 |

### 3.2 9 阶段规划

| 阶段 | 名称 | 核心产出 |
|------|------|----------|
| stage-01 | 项目骨架与构建体系 | package.json, tsconfig, CLI, vitest |
| stage-02 | 核心 Schema 引擎 | ArtifactGraph, Schema 验证 |
| stage-03 | 工作区 + FlowManager | .openfeel/ 初始化, FlowManager 类, flow 命令 |
| stage-04 | 三层计划管理 | roadmap/stage/op 体系, scheme 命令 |
| stage-05 | 指令生成系统 | XML 指令, 模板渲染, 上下文注入 |
| stage-06 | Review + Archive 闭环 | view/archive 命令, 审查条目管理 |
| stage-07 | OpenCode 适配器 | 7 个 Agent + 8 个 /opfx:* 技能 |
| stage-08 | 知识库系统 | kb/ 管理, 经验暂存归档 |
| stage-09 | 测试、文档与发布 | 测试 > 80%, README, npm 发布 |

---

## 四、逐维度比对分析

### 4.1 目录结构比对

| 规范要求 | 设计预期位置 | 实际位置 | 状态 |
|----------|-------------|----------|------|
| 用户身份 | `.openfeel/.info.json` | `.openfeel/.info.json` | ⚠️ 位置偏移 |
| 全局配置 | `.openfeel/config.yaml` | `.openfeel/config.yaml` | ⚠️ 位置偏移 |
| 流水线状态 | `.openfeel/flow.json` | `.openfeel/flow.json` | ✅ 正确 |
| 阶段计划 | `.openfeel/plan/{stage}/` | `stages/{stage}/stage.md` | ⚠️ 位置偏移 |
| 阶段运行时 | `.openfeel/stages/{stage}/` | `.openfeel/stages/{stage}/` | ✅ 正确 |
| 操作方案 | `.openfeel/stages/{stage}/ops/` | `.openfeel/stages/{stage}/ops/` | ✅ 正确 |
| 代码审查 | `.openfeel/code_review/` → `.openfeel/users/{user}/code_review/` | `.openfeel/code_review/` | ⚠️ 中间状态 |
| Bug 追踪 | `.openfeel/bugs/` → `.openfeel/users/{user}/bugs/` | `.openfeel/bugs/` | ⚠️ 中间状态 |
| 知识库 | `.openfeel/kb/` | `.openfeel/kb/` | ✅ 正确 |
| 开发规则 | `.openfeel/dev/dev_core.md` | 缺失 | ❌ 缺失 |
| 开发进度 | `.openfeel/dev/current.md` | 缺失 | ❌ 缺失 |
| 公共日志 | `.openfeel/log/` | 缺失 | ❌ 缺失 |
| 计划索引 | `.openfeel/plan/plan_index.md` | 缺失 | ❌ 缺失 |
| 用户工作区 | `.openfeel/users/{username}/` | 缺失 | ❌ 缺失 |
| OpenCode 指令 | `.opencode/instructions/core.md` | 缺失 | 🔴 CRITICAL |

**核心问题**：`.openfeel/` 与 `.openfeel/` 之间出现了内容分裂——AI Agent 在执行时将审查记录、Bug 记录和知识库内容写入 `.openfeel/`，而运行时状态写入 `.openfeel/`，但两个位置的设计关系未明确定义。

### 4.2 流水线状态机比对

#### 设计目标（plan.md 中的状态流转图）

```
plan_pending → plan_review → plan_passed → scheme_pending → scheme_review
                                                                  ↓
                                                            scheme_passed
                                                                  ↓
                         exec_running ←──────────────────────────┘
                             ↓      ↑
                       self_check   │
                        ↓     ↑     │
                   pass → review_pending
                        ↓     ↑
                   review_failed ──→ scheme_pending
                        ↓
                   review_passed
                        ↓
                   test_pending
                    ↓        ↑
                test_failed ─┘
                    ↓
                test_passed
                    ↓
                archiving → done
```

#### 实际执行轨迹（flow.json log）

```
plan_pending → plan_passed → scheme_pending → scheme_passed
                                                    ↓
                                              exec_running
                                                    ↓
                                              review_pending → review_passed
                                                    ↓
                                              test_pending → test_passed
                                                    ↓
                                              archiving → done
```

**比对发现**：

| 差异点 | 设计 | 实际 | 评价 |
|--------|------|------|------|
| plan_review 阶段 | 独立存在 | 未出现 | 简化了，但降低了审查严谨度 |
| scheme_review 阶段 | 独立存在 | 未出现 | 同上 |
| 自测回退循环 | self_check → retry < 3 → exec_running | 实际未触发 | 路径存在但未被测试 |
| review_failed 路径 | 存在 | 未触发（审查有条件通过） | 路径未被测试 |
| test_failed 路径 | 存在 | 未触发（测试有条件通过） | 路径未被测试 |
| Phase 值不一致 | 标准枚举 | Archiver 使用了 `"completed"` 而非 `"done"` | 🔴 框架 Bug |

**关键洞察**：流水线设计的"失败回退"路径在本轮测试中未被触发——回退到 Schemer 重定方案、review_failed 回退、test_failed 回退——这些**韧性路径是未经测试的假设**。

### 4.3 Agent 体系比对

#### 设计目标 vs 实际部署

| Agent | 设计模型 | 实际模型 | 差异 |
|-------|---------|---------|------|
| **Feel** | 主力推理 | DeepSeek V4 Pro | ✅ 一致 |
| **Planner** | Feel 兼任 | 独立 subagent（DeepSeek V4 Pro） | ⚠️ 独立化 |
| **Schemer** | 主力推理 | DeepSeek V4 Pro | ✅ 一致 |
| **Executor** | 快速模型 | DeepSeek V4 Flash | ✅ 一致 |
| **Reviewer** | 异种推理 | GLM/Qwen | ✅ 一致 |
| **Tester** | 主力推理 | DeepSeek V4 Pro | ⚠️ 命名为 feel-tester |
| **Archiver** | 主力推理 | DeepSeek V4 Pro | ✅ 一致 |

### 4.4 知识管理比对

实际产出质量：

| 文件 | 条目数 | 质量评价 |
|------|--------|----------|
| `architecture.md` | 7 ADR | 高质量——每项含决策+上下文+影响 |
| `patterns.md` | 7 模式 | 高质量——含代码示例和已知问题 |
| `troubleshooting.md` | 6 排查经验 | 高质量——含根因+复现+修复方案 |
| `index.md` | 缺失 | ❌ 缺少总索引 |

### 4.5 CLI 工具层比对

| 命令 | 设计 | 实际 | 状态 |
|------|------|------|------|
| `openfeel init` | ✅ | ✅ 已验证 | 创建 `.openfeel/` + `flow.json` |
| `openfeel flow status/current/advance/attempt` | ✅ | ✅ 已验证 | 13 次日志记录 |
| `openfeel plan stage add` | ✅ | ⚠️ 有问题 | 不更新 flow.json stages 字段 |
| `openfeel scheme create` | ✅ | ⚠️ 有问题 | 鸡生蛋依赖 |
| `openfeel roadmap create/show` | ✅ | ✅ 已验证 | — |
| `openfeel view` | ✅ | 隐含验证 | 审查条目通过 CLI 添加 |
| `openfeel archive` | ✅ | ✅ 已验证 | 归档完成 |
| `openfeel instructions` | ✅ | ❌ 未实现 | — |
| `openfeel update` | ✅ | ❌ 未实现 | — |

---

## 五、关键差距总结

### 5.1 已实现（达到或超过设计预期）

| 能力 | 证据 |
|------|------|
| **流水线状态机** | flow.json 327 行，完整记录 6 阶段 13 步操作日志 |
| **操作方案生成** | Schemer 产出 4 个 op，共计 130+ 子步骤，粒度极精细 |
| **多 Agent 协作** | 7 个 Agent 按序调度，无重复劳动或越界操作 |
| **异种模型审查** | Reviewer 使用不同模型系列，发现 9 个真实问题 |
| **自测闭环** | Executor 54 项自测全部通过，验证率 100% |
| **知识归档** | Archiver 提取 7 ADR + 7 模式 + 6 排查经验 |
| **OpenCode 适配** | 7 个 Agent 定义 + 8 个 /opfx:* 技能完整部署 |

### 5.2 未实现或缺失

| 缺失项 | 设计阶段 | 影响 |
|--------|---------|------|
| `.opencode/instructions/core.md` | 全部 | 🔴 启动指令加载失败 |
| `.openfeel/dev/dev_core.md` | 基础 | 动态规则无法沉淀 |
| `.openfeel/dev/current.md` | 基础 | 跨会话进度追踪不可用 |
| `.openfeel/log/` 日志体系 | 基础 | 团队级事件无记录 |
| `.openfeel/plan/` 计划体系 | 计划管理 | 计划变更无追踪 |
| `.openfeel/users/{username}/` | 基础 | 个人工作区缺失 |
| `stage-02` ops/ | Stage 04 | 第二阶段无法启动 |
| 失败回退路径验证 | Stage 02 | 回退→重定方案→再审路径未经测试 |
| 覆盖率工具集成 | Stage 01 | Roadmap 质量门禁不可验证 |

### 5.3 意外发现

1. **Executor 的环境自适应**：自主降级 vitest 版本——未在设计文档中定义但极具价值
2. **Tester 的深度测试**：主动识别竞态条件（BUG-001 HIGH），超出了"执行测试用例"的职责
3. **`.openfeel/` 与 `.openfeel/` 职责分裂**：运行时沉淀在 `.openfeel/`，知识沉淀在 `.openfeel/`——提示需要正式定义边界
4. **AI 的元认知**：AI 产出框架理解文档，具备框架层面的自省能力

---

## 六、迭代建议

### 6.1 必须修复（CRITICAL / HIGH）

| # | 问题 | 建议 |
|---|------|------|
| 1 | `.opencode/instructions/core.md` 缺失 | `openfeel init` 中自动生成 |
| 2 | `plan stage add` 不更新 flow.json | `addStage()` 同步调用 FlowManager |
| 3 | Archiver 使用非标准 phase 值 | Agent 定义中固化枚举引用；validate() 增强容错 |
| 4 | `.openfeel/` 基础目录缺失 | `openfeel init` 自动创建模板 |
| 5 | `stages/` 与 `.openfeel/stages/` 重复 | 统一路径到 `.openfeel/stages/` |
| 6 | `.openfeel/` 与 `.openfeel/` 职责边界 | 正式定义：运行时层 vs 沉淀层 |

### 6.2 设计调整建议

| # | 建议 | 理由 |
|---|------|------|
| 7 | Planner 保持独立 subagent | 降低 Feel 复杂度，遵循单一职责 |
| 8 | Executor 环境自适应能力写入规范 | 实战证明有效 |
| 9 | Tester 边界测试生成能力正式化 | 发现 HIGH 级 Bug |
| 10 | 失败回退路径专项测试 | 韧性机制尚未验证 |

### 6.3 验证有效的设计（保持不变）

1. Schemer → Executor checkbox 驱动执行
2. 异种模型交叉审查
3. Review + Test 双门禁
4. Archiver 知识提取机制
5. flow.json 作为单一状态源
6. 模型分工策略
7. CLI → Skill → Agent 三层映射

---

## 七、总体评价

### 框架成熟度评估

| 维度 | 评分 | 说明 |
|------|------|------|
| **流水线核心** | ★★★★☆ | 状态机设计合理，但失败回退路径未验证 |
| **Agent 体系** | ★★★★☆ | 角色分工明确，模型分配合理 |
| **工具链** | ★★★☆☆ | 核心可用，但有注册 Bug |
| **知识管理** | ★★★★☆ | 归档质量高，缺少索引 |
| **工作区规范** | ★★☆☆☆ | 目录结构分裂，基础文件缺失 |
| **跨平台兼容** | ★★★☆☆ | Windows 路径有适配问题 |
| **韧性机制** | ★★☆☆☆ | 设计存在但未验证 |

### 核心结论

**OpenFeel 一期部署验证了核心价值主张——用工程化流程治理 AI Agent 协作开发是可行的。** 当前框架处于"骨架扎实、细节待打磨"阶段。最大问题不是架构缺陷，而是基础设施不完备、韧性路径未验证、两个工作区职责边界需定义。建议按优先级在 v1.1 迭代中有序推进。
