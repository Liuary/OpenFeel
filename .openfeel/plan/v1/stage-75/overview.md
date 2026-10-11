# v1.1.7-stage-75

## 目标

把模式引擎暴露为**命令面与交互**：`plan stage add --workflow-mode`（含骨架「工作流模式」行）+ `stage set --workflow-mode`（单阶段切换/切回，含缺失字段插入，裁定 H）+ `flow mode [--stage] [--json]` 只读查询（模式 + 来源）+ wizard 首次选型与**项目级记忆**写入 + `config set ... --sync-stages` 纳入新键（含 `--stage` 限定）+ op 骨架机械铺入口（裁定 I）+ `flow phases` 模式分节（`--mode`/`--stage` 解析链 + `--json` 增 `workflowMode`；消除 fast 下静默错表）[REV-75-001 修订] + 自举收尾动作（裁定 L ②：`--sync-stages --stage` 补齐 74~77 status.md 字段并核验）[REV-75-002 修订]。

## 依赖

- v1.1.7-stage-74

## 操作方案

> 详见 `.openfeel/plan/v1/stage-75/plan.md`（T1~T9，含 T3-附）；op 级拆分由 openfeel-schemer 定稿并落 `ops/deps.yaml`。
> op 级拆分以 `ops/deps.yaml` 为准（定稿 **4 op**，严格串行）：op-001 阶段创建/设置与「插入」写函数（T1/T2 + 冗余写入点①②）→ op-002 `flow mode` + `flow phases` 模式分节（T3/T3-附）→ op-003 `config set --sync-stages --stage`（T5 + 冗余写入点③ + health）→ op-004 op 骨架机械铺 + wizard 选型 + 自举 T9 + 门禁（T6/T4/T9/T8）。[REV-75-001/002 修订；REV-75-015 修订：原「建议 3-op」旧版作废]
