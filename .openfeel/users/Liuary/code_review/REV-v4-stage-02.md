# REV-v4-stage-02：KB检索 + 前置校验 审查记录

## 审查概览

| 维度 | 结果 | 说明 |
|------|------|------|
| op-001 schemer.md KB检索 | ✅ 通过 | 位置正确，4分类齐全，兜底完整 |
| op-002 planner.md KB检索 | ✅ 通过 | 位置正确，内容与schemer对称一致 |
| op-003 check-kb自包含 | ✅ 通过 | 语义检索完全内嵌，无外部依赖 |
| op-004 executor前置校验 | ⚠️ 1个问题 | flow.json路径描述不准确 |
| op-005 FlowManager集成 | ⚠️ 3个问题 | CLI命令不存在、pipeline.yaml路径错误、文件缺失 |
| npm run build | ✅ 通过 | TypeScript编译成功 |
| 旧概念残留 | ✅ 无 | 变更文件中无旧Agent名/概念引用 |

**审查结论**：op-001~003 通过，op-004/op-005 存在 4 个需要修正的问题。

---

## REV-001：executor.md 步骤 2.1 — flow.json 路径描述不准确
- **状态**：closed
- **优先级**：high
- **提出人**：Reviewer
- **提出时间**：2026-07-05

### 问题描述
`executor.md` 第 58 行「### 步骤 2：Phase 合法性校验」写：
```
1. 读取项目根目录下的 `flow.json` 文件
```

实际 `flow.json` 位于 `.openfeel/flow.json`（项目的 FlowManager 代码中统一使用 `resolve(projectPath, '.openfeel', 'flow.json')` 路径）。Executor 按文字描述执行 `read("flow.json")` 会因文件不存在而失败，导致步骤 2 前置校验无法通过。

**影响范围**：所有 Executor 执行的前置校验步骤 2，均会因"文件不存在"而中断。

### 建议修正
将第 58 行修正为：
```
1. 读取 `.openfeel/flow.json` 文件
```

### 处理记录
| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|
| 2026-07-05 | Executor | L58 `项目根目录下的 flow.json` → `.openfeel/flow.json`；同步修正 L35/L85 `flow.json` 引用 | pending |

### 验收记录
| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|
| 2026-07-05 | Reviewer | ✅ 通过 | executor.md L35/L58/L86 三处 flow.json 引用均已修正为 `.openfeel/flow.json`，无遗漏 |

---

## REV-002：executor.md 步骤 3a — CLI 命令 `openfeel flow validate` 不存在
- **状态**：closed
- **优先级**：high
- **提出人**：Reviewer
- **提出时间**：2026-07-05

### 问题描述
`executor.md` 第 73 行步骤 3a 引用：
```bash
openfeel flow validate --stage {当前stage} --op {当前op-id}
```

经实测，`openfeel flow` 子命令列表中**不存在 `validate` 命令**（返回 `unknown command 'validate'`）。当前 CLI 可用命令为：
- `flow health --quick` — 执行校验但**不接受** `--stage`/`--op` 参数
- `flow advance --op <id> --to <phase>` — 内部调用 `canAdvance`/`validate`，但会**实际推进 phase**（无 `--dry-run`）

这意味着 Executor 执行步骤 3a 时会立即遇到"命令不存在"错误，直接回退到步骤 3b（手动兜底）。但步骤 3b 同样存在路径和文件缺失问题（见 REV-003），导致**两层校验均不可用**。

### 建议修正
二选一：

**方案 A（推荐）**：在 CLI 中实现 `openfeel flow validate` 子命令，参数签名：
```
openfeel flow validate [--stage <id>] [--op <id>]
```
内部调用 FlowManager.validate() + canAdvance()，但不推进 phase。当前 `flow advance` 中已有完整校验逻辑（L310-350），可直接提取为独立命令。

**方案 B**：修改 executor.md 步骤 3a，替换为现有可用的 `flow health --quick`：
```
openfeel flow health --quick
```
注：此命令不校验 stage/op 级流转（`canAdvance`），仅校验 flow.json 整体合法性。需在 prompt 中补充说明此差异。

### 处理记录
| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|
| 2026-07-05 | Executor | L69/L71 `openfeel flow validate` → `openfeel flow health --quick`；补充限制说明注释；更新响应格式 | pending |

### 验收记录
| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|
| 2026-07-05 | Reviewer | ✅ 通过 | 已替换为 `flow health --quick`，并在 L75 补充已知限制说明 |

---

## REV-003：executor.md 步骤 3b — pipeline.yaml 路径不一致且文件缺失
- **状态**：closed
- **优先级**：high
- **提出人**：Reviewer
- **提出时间**：2026-07-05

### 问题描述
`executor.md` 第 84 行步骤 3b 写：
```
1. 读取 `.openfeel/plan/v4/pipeline.yaml`，确认其中 `transitions` 节...
```

存在两个问题：

1. **路径不一致**：FlowManager 实际加载的路径是 `.openfeel/pipeline.yaml`（见 `flow-manager.ts:2012`），而非 `.openfeel/plan/v4/pipeline.yaml`。两个路径都不存在对应文件。

2. **文件缺失**：项目中不存在任何 `pipeline.yaml` 文件。FlowManager 在文件缺失时使用 `getDefaultPipelineConfig()` 硬编码默认值（含 15 个 phase 和完整 transitions 表），但 Executor 无法通过"手动读取文件"的方式获取这些信息。

**综合影响**：REV-002（CLI 不可用）+ REV-003（手动兜底路径断裂）→ 步骤 3 的两层校验在**当前项目状态下完全不可用**。Executor 会遇到"命令不存在 → 手动读取文件 → 文件不存在"的连锁失败。

### 建议修正
三选一：

**方案 A（推荐）**：创建 `.openfeel/pipeline.yaml` 文件，内容为 FlowManager 的默认配置（`getDefaultPipelineConfig()` 输出为 YAML）。使 CLI 和手动读取共享同一数据源。

**方案 B**：修改步骤 3b 路径为 `.openfeel/pipeline.yaml`，并在 prompt 中补充说明："若文件不存在，transitions 使用 FlowManager 内置默认值（`review_passed → test_pending` 等），可参考 `src/core/flow-manager.ts` 中的 `getDefaultPipelineConfig()`"。

**方案 C**：完全取消步骤 3b 的手动兜底，直接要求 Executor 通过读取 `src/core/flow-manager.ts` 中的 `PIPELINE_TRANSITIONS` 常量来获取合法流转表。

### 处理记录
| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|
| 2026-07-05 | Executor | L85 改为引用 FlowManager 内置默认 transitions 表（`getDefaultPipelineConfig()`）；L90 错误提示更新 | pending |

### 验收记录
| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|
| 2026-07-05 | Reviewer | ✅ 通过 | L85 已改为引用 FlowManager 内置 transitions 表，不再指示 Executor 读取不存在的 pipeline.yaml |

---

## REV-004：search-kb SKILL.md 仍声称是 check-kb 回退方案（语义陈旧）
- **状态**：pending
- **优先级**：low
- **提出人**：Reviewer
- **提出时间**：2026-07-05

### 问题描述
`.opencode/skills/search-kb/SKILL.md` 第 122 行：
```
- 此技能是 `check-kb` 的回退方案——当 `check-kb` 精确匹配无结果时可自动调用
```

在 op-003 将语义检索**完全内嵌**到 check-kb 后（步骤 5 自行执行 `python scripts/search_kb.py`），search-kb 不再作为 check-kb 的回退被调用。此描述变为语义陈旧引用。

**影响范围**：不影响功能（check-kb 已自包含），但会造成文档语义矛盾。此文件不在本次变更范围内（op-001~005 均未修改 search-kb）。

### 建议修正
将第 122 行更新为：
```
- 此技能是独立语义检索工具，可直接使用。`check-kb` 技能已内嵌自动回退到语义检索，无需手动调用本技能作为回退。
```

或在下一阶段（stage-03/04）统一清理。

### 处理记录
| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|

### 验收记录
| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|
