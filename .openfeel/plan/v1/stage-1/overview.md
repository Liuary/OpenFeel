# v1.5.17-stage-1

## 目标

新增 `feel_mode: enabled | disabled` 开关（默认 `enabled` = 现状）：`disabled` 时放松**流程强制**（不催建需求/阶段、preflight 降级为提示、提示词切「自由模式」），但**保留**数据完整性硬门（状态机 / done 门 / 归档判据 / blocking REV / 写入门禁）。项目级 `.openfeel/config.yaml` 覆盖全局 `~/.config/openfeel/profile.yaml`，即时生效。配套修复需求 ID 分配未纳入归档导致复用的问题。

## 依赖

无（独立特性）。

## 操作方案

详见 [`plan.md`](plan.md)。分六个操作单元：

1. T1 配套修复：归档需求纳入 ID 下限（`archivedRequirementMaxSeq` + `raiseRequirementSeqFloor` + `req add/split` 接线）；
2. T2 配置层：`feel_mode` schema / DEFAULT_CONFIG / `resolveFeelMode` 单点 + 全局 profile 字段；
3. T3 命令面：`config get --all` / `config set[--global]` / `config effective` 与级联层接入；
4. T4 preflight：`disabled` 时 strict → warn；
5. T5 DSH 适配器：镜像解析 + `workflowGate` 放宽 + `<feel_mode>` 自由模式提示 + 工具输出暴露 `feelMode`；
6. T6 测试与文档：CLI 单测矩阵 + dsh 单测 + 文档/CHANGELOG。
