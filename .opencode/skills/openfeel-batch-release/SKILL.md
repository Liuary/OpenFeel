# Openfeel Batch Release

> 由 OpenFeel 归档生成（v1.5.8 · 2026-11-01）

## 何时使用

- 处理与阶段 `v1.5.8-stage-122` 已完成需求相近的任务：
  - REQ-024 归档官增强：汇总已完成需求 + 生成 docs/releases/vX.md + 按 harness 生成 skill
  - REQ-025 workflowGate 边界：仅有 done 阶段时仍判为有活跃阶段，应视为无开启阶段
  - REQ-026 DSH 适配器发布面：补 engines.dsh（宽松 >=0.2.0）+ 生成插件市场索引（git 源）+ 市场生态调研
  - REQ-027 完成必审验：需求与阶段 done 门强制审查 + 验证证据
  - REQ-028 stage 多需求编排：requirements[] 链接 + 兼容旧单值 + 聚合/归档列全
  - REQ-029 多会话收束 P0：会话登记 + 自动提交防污染（多会话时拒绝 -A）+ current 优先非 done 阶段 + feel_status.sessions
  - REQ-030 需求随版本归档 + 需求 ID 单调计数器（last_req_seq）+ 发布门 release-check / 未完成需求顺延
- 归档沉淀的知识条目：
  - [REV-005] [self-review] v1.5.8 批次：归档官增强 / 多需求编排 / 多会话 P0 / 完成必审验 / 需求归档与发布门；tsc + vitest 2321 + dsh 46/109/58 全绿

## 步骤

1. 阅读归档摘要 `.openfeel/log/archive-v1.5.8-stage-122.md`，确认操作产出与审查结论。
2. 对照发布说明 `docs\releases\v1.5.8.md`，确认已完成需求与升级提示。
3. 按需检索知识库 `.openfeel/kb/`，复用既有模式与结论。
4. 改动完成后运行 `npx tsc --noEmit` 与 `npx vitest run` 验证。

## 参考

- 归档摘要：`.openfeel/log/archive-v1.5.8-stage-122.md`
- 发布说明：`docs\releases\v1.5.8.md`
