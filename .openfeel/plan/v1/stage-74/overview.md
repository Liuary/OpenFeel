# v1.1.7-stage-74

## 目标

为「快速迭代模式」建立**引擎底座**：新增配置键 `workflow_mode`（`full|fast`，默认 fast，四层级联）+ phase **full/fast 双转移表** + **表选择单一权威**（展示/校验/推进/BFS 同源）+ 依裁定 E 翻转 `DEFAULT_CONFIG.auto_advance` 为 `enabled`（部署级默认自动推进开启）+ 本仓自举基线 `defaults.workflow_mode: full`（裁定 L）。

## 依赖

无

## 操作方案

> 详见 `.openfeel/plan/v1/stage-74/plan.md`（T1~T8）；op 级拆分由 openfeel-schemer 定稿并落 `ops/deps.yaml`。
> 建议 op：op-001 配置面（T1/T6）→ op-002 双表与表选择（T2/T3/T5）→ op-003 级联（T4）+ 测试门禁（T7/T8）。
