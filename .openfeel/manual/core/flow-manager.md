# 流水线管理模块（flow-manager）

> 模块文档，由归档官在归档时维护。对应源码：`src/core/flow-manager.ts`。

## 职责

管理 `flow.json` 的读写、流水线阶段推进、操作（Op）追踪、审查/日志记录与健康校验，是 OpenFeel 流水线的状态中枢。

## 核心 API

| 方法 | 功能 |
|------|------|
| `load()` / `save()` | 读取 / 持久化 flow.json（save 含乐观并发校验、写前备份与原子写；load 含 ops 防御性类型守卫） |
| `addStage(stageId, initialPhase)` | 注册新阶段 |
| `advanceStagePhase(stageName, phase)` | 推进阶段到目标 phase（校验合法性） |
| `getSummary()` / `summary(lang)` | 获取流水线摘要（结构化 / 文本） |
| `validate()` / `repair()` / `healthCheck()` | 校验、自动修复（含 ops 字段补全）、健康检查 |
| `saveCheckpoint()` / `restoreCheckpoint()` | 阶段检查点保存与回滚 |
| `autoCommitOnDone(stageName)` | 阶段 done 时自动 git 提交 |
| `FlowConcurrentModificationError` / `isFlowConcurrentError(err)` | flow.json 乐观并发冲突错误类型与识别函数（命令层统一捕获） |

## 并发保护与乐观并发校验

`save()` / `restoreCheckpoint()` / `repair()` 的 flow.json 写入均在 `flow.lock`（`.openfeel/tmp/locks/flow.lock`）内 + 原子写（`backup:true`），详见 `manual/core/fs.md`。

- **`.bak` 语义（S5）**：写前复制旧文件为 `.bak`，写成功后不再覆盖，使 `.bak` 始终保留**上一个已落盘版本**（修复旧实现「写后被新内容覆盖」的缺陷）。
- **乐观并发校验**：`meta.revision`（整数，单调递增；缺失 / 非整数视为 0）作为版本标识。`load()` 记录 `loadedRevision`；`save()` 在锁内 `readDiskRevision()` 比对基线，不一致抛 `FlowConcurrentModificationError(expected, actual)`（**不写盘 / 不备份**），一致则 `revision+1` 随内容原子落盘并同步内存基线。
- **恢复 / 修复**：`restoreCheckpoint()` 冲突时返回 `false` 并告警，成功时快照 revision 重定基为 `diskRevision+1`；`repair()` 为显式恢复工具**不做校验**，但写时递增 revision；`saveCheckpoint()` / `initFlow()` 原子写但**不加锁**（唯一文件名 / 首次创建）。
- **写入路径审计**：flow.json 全部写入路径（`save` / `restoreCheckpoint` / `repair` / `initFlow` / `saveCheckpoint`）均已审计并标注是否加锁及理由。
- **能力边界**：仅检测经 `FlowManager.save()` 维护 revision 的写入者；外部手工改写不递增 revision 无法检测。

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
