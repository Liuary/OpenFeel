# v1.1.2-stage-42

## 目标

配置口径与流水线状态正确性：统一 `auto_advance` 级联（项目优先、全局画像兜底）并新增 `openfeel config effective`（有效值 + 来源）；修复 `pipeline.phase` 在 `targetPhase==='done'` 时不置位的缺陷（全量 done 判定）；为 `plan stage add`/`plan scheme create` 补齐 `flow.json` 审计日志。对应反馈 #5/#6/#7。

## 依赖

- **hard**：无
- **soft**：`v1.1.2-stage-41`（同改 `src/core/flow-manager.ts` 与 i18n，建议顺序执行以避免同文件并发改动）
- **下游**：`v1.1.2-stage-43`（soft，须文档化 `config effective` 与修正后的 `pipeline.phase` 语义）

## 操作方案

详见 `.openfeel/plan/v1/stage-42/plan.md`（op-001 ~ op-004）。
