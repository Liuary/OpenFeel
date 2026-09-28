# v1.1.2-stage-46

## 目标

部署覆盖前自动备份：`openfeel setup`/`init`/`update`/**`migrate`** 在写入**已存在且本次会改变**的目标文件前（含全局资产、全局 opencode.jsonc、项目 `.openfeel/config.yaml`、项目 `package.json`），将原件备份到全局根 `~/.openfeel/backup/{ts}/`（保留路径层级 + `manifest.json`）；并在全局状态文件 `~/.openfeel/update_infos.md` 新增「备份」类条目，扩展 `feel.md`（zh/en）启动检查规则提示 Agent 检查。需求原文：「如果部署时已有文件，则将原始文件备份，并在全局状态文件中提示 agent 检查」。

## 依赖

- **hard**：`v1.1.2-stage-45`（二者同改 `src/core/{init,setup,update}.ts`、`global-paths.ts`，串行 45 → 46）
- **soft**：`v1.1.2-stage-44`（无直接文件冲突）
- **下游**：`v1.1.2-stage-43`（soft，版本收口须在最后）
- **复用**：stage-35（原子写/文件锁）、stage-38（`update_infos.md` 三态）；**不纳入** `migrate` 项目内备份（B7，仅项目内不合并）；**纳入** `migrate` 全局部署写（REV-002）
- **覆盖写路径全景与豁免**：见 plan.md §四 B9（`.info.json`/`update_state.json`/`update_infos.md` 豁免）

## 操作方案

详见 `.openfeel/plan/v1/stage-46/plan.md`（op-001 ~ op-005）。
