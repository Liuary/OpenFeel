# v1.1.2-stage-41

## 目标

CLI 自描述与可纠错能力：新增 `openfeel flow phases`（phase + 转移表）、`openfeel flow stage remove`（安全校验 + current 兜底）、stageId 校验/建议名/`(series, stageDir)` 冲突检测、`plan stage add --deps`，并收敛 `plan stage add`/`flow stage add`/`stage create` 三入口职责。对应反馈 #1/#2/#3（缺口部分）/#4/#9。

## 依赖

- **hard**：无
- **soft**：无
- **下游**：`v1.1.2-stage-42`（soft，同改 flow-manager/i18n，建议顺序执行）；`v1.1.2-stage-43`（hard，须文档化本阶段新命令）

## 操作方案

详见 `.openfeel/plan/v1/stage-41/plan.md`（op-001 ~ op-005）。
