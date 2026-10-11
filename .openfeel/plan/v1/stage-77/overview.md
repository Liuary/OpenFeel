# v1.1.7-stage-77

## 目标

**v1.1.7 收官**：文档多载体（README×3 / GETTING_STARTED / commands）+ manual 核对补漏 + `CHANGELOG [1.1.7]`（显著登记默认值变更 + 存量迁移小节）+ 版本 **1.1.7** 全链路 A/B/C/D/E + **fast 隔离端到端验收**（快线链跑通 + 跳过项拒绝 + 单阶段切回 full）+ roadmap/plan 回填（M29~M32）+ 全门禁。

> **rev2（2026-10-11，HEAD `482fda7`）**：按计划审查 REV-77-001~008 修订（1 blocking + 7 非阻塞）——`docs/commands.md` 覆盖补 2 项 [REV-77-001]、基线更正实测（1306 / 796 / 425）[REV-77-002]、D 类补文档侧历史标记 7 处 [REV-77-003]、T2 改核对补漏 [REV-77-004]、B 类补 `update.ts` [REV-77-005]、T6 增 ci.yml 路径数断言 [REV-77-006]、存量回落 fast 迁移指引 [REV-77-007]、README 横幅口径裁定 [REV-77-008]。详见 `plan.md`（含修订记录对照表）。

## 依赖

- v1.1.7-stage-76

## 操作方案

> 详见 `.openfeel/plan/v1/stage-77/plan.md`（T1~T6）；op 级拆分由 openfeel-schemer 定稿并落 `ops/deps.yaml`。
> 建议 op：op-001 文档多载体 + manual 核对补漏（T1/T2）→ op-002 版本收口 A/B/C/D/E（T3；**B 类双生成物 `template-loader.ts` + `update.ts`**）→ op-003 fast 端到端验收 + 回填 + 全门禁报告（T4/T5/T6；**含 ci.yml 快照 5 路径断言**；版本收口 op 须为最终 op）。**实况以 `ops/deps.yaml` 为准**——最终 op 序 = op-001（T1/T2）→ op-002（T4 E2E）→ op-003（T3+T5+T6）[REV-77-017 订正]。
