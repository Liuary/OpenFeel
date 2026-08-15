# 流水线管理模块（flow-manager）

> 模块文档，由归档官在归档时维护。对应源码：`src/core/flow-manager.ts`。

## 职责

管理 `flow.json` 的读写、流水线阶段推进、操作（Op）追踪、审查/日志记录与健康校验，是 OpenFeel 流水线的状态中枢。

## 核心 API

| 方法 | 功能 |
|------|------|
| `load()` / `save()` | 读取 / 持久化 flow.json（save 含备份与防损坏机制；load 含 ops 防御性类型守卫） |
| `addStage(stageId, initialPhase)` | 注册新阶段 |
| `advanceStagePhase(stageName, phase)` | 推进阶段到目标 phase（校验合法性） |
| `getSummary()` / `summary(lang)` | 获取流水线摘要（结构化 / 文本） |
| `validate()` / `repair()` / `healthCheck()` | 校验、自动修复（含 ops 字段补全）、健康检查 |
| `saveCheckpoint()` / `restoreCheckpoint()` | 阶段检查点保存与回滚 |
| `autoCommitOnDone(stageName)` | 阶段 done 时自动 git 提交 |

## 状态机

阶段 phase 枚举（`src/core/pipeline-schema.ts` 的 `PIPELINE_PHASES`）：

```
plan_pending → plan_review → plan_passed
→ scheme_pending → scheme_review → scheme_passed
→ exec_running → review_pending → review_failed | review_passed
→ test_pending → test_failed | test_passed
→ archiving → done
```

- 全局宏观状态 `META_PHASES`：`active` / `paused` / `done`（仅元信息，调度基于阶段 phase）
- 合法流转由 `transitions` 表控制，key 可用 `|` 组合多个源 phase（并行场景）
- 推进必须通过 CLI（`openfeel flow advance`），禁止手动编辑 flow.json

## 数据位置

`flow.json` 位于项目根 `.openfeel/` 下，含 `pipeline`（宏观状态 + 当前阶段/op）、`stages`（各阶段独立状态机）、`reviews`、`log`。

## status.md 路径解析

`findStatusPath`（及健康检查）委托 `src/core/plan/path.ts` 的 `findStageStatusPath` 实现**三级回退**：

```
1. plan/{series}/stage-NN/status.md   ← 解析 stageId → 精确路径（首选）
2. plan/**/stage-NN/status.md         ← fast-glob 递归（兼容 series 变化/旧平铺）
3. stages/{stageId}/status.md         ← 历史遗留，只读兜底
```

stageId↔目录映射收敛到 `plan-path` 模块，flow-manager 不再自行 split 版本号或 resolve 目录（stage-34 变更）。
