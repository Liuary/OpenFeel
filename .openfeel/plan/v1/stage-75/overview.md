# v1.1.7-stage-75

## 目标

把模式引擎暴露为**命令面与交互**：`plan stage add --workflow-mode`（含骨架「工作流模式」行）+ `stage set --workflow-mode`（单阶段切换/切回，含缺失字段插入，裁定 H）+ `flow mode [--stage] [--json]` 只读查询（模式 + 来源）+ wizard 首次选型与**项目级记忆**写入 + `config set ... --sync-stages` 纳入新键 + op 骨架机械铺入口（裁定 I）。

## 依赖

- v1.1.7-stage-74

## 操作方案

> 详见 `.openfeel/plan/v1/stage-75/plan.md`（T1~T8）；op 级拆分由 openfeel-schemer 定稿并落 `ops/deps.yaml`。
> 建议 op：op-001 阶段创建/设置与 sync-stages（T1/T2/T5）→ op-002 `flow mode` + wizard 交互（T3/T4）→ op-003 骨架机械铺 + 测试门禁（T6/T7/T8）。
