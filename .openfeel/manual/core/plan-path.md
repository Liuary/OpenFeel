# 阶段路径映射模块（plan-path）

> 模块文档，由归档官在归档时维护。对应源码：`src/core/plan/path.ts`。

## 职责

stageId ↔ plan 目录双向映射的**唯一权威工具**，消除各处硬编码 split/resolve 路径。将阶段标识（stageId）与物理目录（`plan/{series}/stage-NN/`）之间的映射收敛到单一模块，供 flow-manager、命令层、plan 核心层复用。

## 核心 API

| 函数 | 功能 |
|------|------|
| `parseStageId(stageId)` | 解析 stageId → `{ series, stageDir, fullStageId }`，支持完整/历史/短名三格式，无法解析返回 null |
| `stageIdToPlanDir(stageId)` | stageId → `plan/{series}/stage-NN/` 相对目录 |
| `normalizeStageId(stageId)` | 短名/完整 stageId → 规范化完整 stageId |
| `validateStageId(input)` | 校验 stageId 格式（`stage-NN` / `vX.Y.Z-stage-NN` / `vX-stage-NN`），返回 `{ ok, reason? }`（失败附中文原因） |
| `suggestStageId(projectPath, input)` | 为非法/非规范输入推导建议名（`NN = 目标 series 内 max+1`，严格限定 series、不跨 series 串号；统计来源 = flow.json `stages` + `plan/{series}/` 目录） |
| `findStageDirConflict(projectPath, stageId)` | 检测 `(series, stageDir)` 冲突，返回映射同一目录的**其它** stageId（无冲突返回 `null`），供 `registerStage`/`addStage` 与三入口命令层复用 |
| `planDirToStageId(projectPath, stageDir)` | 目录名 → 完整 stageId（回查 flow.json 反向映射 + 去歧义） |
| `findStageStatusPath(projectPath, stageId)` | 三级回退查找 status.md 绝对路径 |

## 映射规则

| 格式 | 示例 | series / stageDir / fullStageId |
|------|------|------|
| 完整四级 | `v1.0.0-stage-34` | `v1` / `stage-34` / 原样 |
| 历史短版 | `v4-stage-04` | `v4` / `stage-04` / 原样 |
| 短名 | `stage-01` | `v1`（默认）/ `stage-01` / `v1.0.0-stage-01` |

- 常量：`DEFAULT_SERIES = 'v1'`、`DEFAULT_STAGE_VERSION = 'v1.0.0'`（短名补齐默认四级版本前缀）。
- 反向映射去歧义：目录名无法唯一还原版本前缀，须回查 flow.json 匹配 `*-stage-NN`；多匹配优先 `pipeline.current.stage`，否则按版本前缀字典序降序取最新。

## 三级回退（findStageStatusPath）

```
1. plan/{series}/stage-NN/status.md   ← 解析 stageId → 精确路径（首选）
2. plan/**/stage-NN/status.md         ← fast-glob 递归（兼容 series 变化/旧平铺）
3. stages/{stageId}/status.md         ← 历史遗留，只读兜底
```

## 变更历史

| 阶段 | 变更 |
|------|------|
| stage-34 | 新增本模块（stageId 三格式解析 + 双向映射 + 三级回退），收敛 init/plan/stage/scheme/flow-manager/commands 各处硬编码路径 |
| stage-41 | 新增 `validateStageId` / `suggestStageId` / `findStageDirConflict`（三入口统一 stageId 校验 + 建议名 + `(series, stageDir)` 冲突检测） |
| stage-52 | 本模块**未改**——`normalizeStageId` 被 op-012/013/014 共 **10 处**调用点复用（统一范式 `normalizeStageId(x) ?? x` + 双键回退，见 `kb/patterns.md #短名/全名 stage 解析归一化的统一范式`）。归档核对确认无需变更 |
