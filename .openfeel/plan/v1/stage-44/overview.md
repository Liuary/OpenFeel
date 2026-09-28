# v1.1.2-stage-44

## 目标

权限模型修正：为 9 个 agent 模板（zh-CN/en）的 `permission:` 块补 `external_directory`（默认 `allow`），修正 `utility` 的 `write`→`edit`（待实测），并文档化「agent 级 permission 覆盖顶层」语义与项目级收紧入口。范围仅限权限模型，不做平台抽象层。需求来源：`docs/phase-5/07-openfeel-permission-issue.md`。

## 依赖

- **hard**：无
- **soft**：无
- **下游**：`v1.1.2-stage-45`（**hard**，两者均改 `templates-data/opencode/agents/**`，必须串行：44 → 45）
- **内部硬性前置**：op-000（opencode 权限语义实测，比照 v1.1 stage-37 op-000）

## 操作方案

详见 `.openfeel/plan/v1/stage-44/plan.md`（op-000 ~ op-004）。
