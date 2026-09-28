# v1.1.2-stage-45

## 目标

平台强限定内容「描述泛化」：把模板/规则/注释/帮助文案/文档/手册中「以 opencode 为唯一 harness」的描述性内容改为无平台表述；opencode 具体路径仅在适配器实现语境保留并显式标注。**仅描述泛化、零行为变更**（不动路径解析、不引入适配器抽象、不改目录树/`$schema`、不回改历史归档）。

## 依赖

- **hard**：`v1.1.2-stage-44`（二者均改 `src/core/templates-data/opencode/agents/**`，必须串行：44 → 45）
- **soft**：无
- **下游**：`v1.1.2-stage-43`（soft，文档通用化须在版本收口前完成）

## 操作方案

详见 `.openfeel/plan/v1/stage-45/plan.md`（op-001 ~ op-004）。
