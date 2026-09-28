# v1.1.2-stage-47

## 目标

已登记缺陷集中清理：修复 v1.1.2 各阶段测试/审查中登记但未修的缺陷（11 项修复），含 `config/BUG-002`（`init` 无条件覆盖 `config.yaml`，high，本阶段做**语义修复**不再覆盖——**并删除 stage-46 引入的 `config.yaml` 备份接入块**、同步 `manual/core/backup.md`）、`config/BUG-003`（`config effective` 无 profile 时来源应为 `builtin`）、`templates/BUG-002`（`agents-md:112` 泛化补漏）、`cli/BUG-001/002`、`archive/BUG-001`、`REV-41 REV-008/009`、`REV-46 REV-011`（混合裁定：setup/update 对齐 B3，migrate 保留 fail-fast）、`REV-43 REV-003` 文本残留、`lint kb` 过期引用。使版本收口前无遗留脏点。**不新增功能、不改版本号**。

## 依赖

- **hard**：`v1.1.2-stage-46`（同改 `src/core/init.ts`/`flow-manager.ts`，且 `config/BUG-002` 与 stage-46 备份接入点存在语义交互，须在 46 之后）
- **soft**：无
- **下游**：`v1.1.2-stage-43`（soft，版本收口须在最后；本阶段不做版本号变更）
- **归属他处（不纳入）**：`REV-44 REV-002/003` → stage-43/归档官；`.openfeel/dev/current.md`、`plan/index.md`、`day_index.md`/`log.md` 陈旧 → 归档官；`config/BUG-001`（已修复，待 closed）

## 操作方案

详见 `.openfeel/plan/v1/stage-47/plan.md`（op-001 ~ op-007）。
