# v1.1.2-stage-48

## 目标

事件加固 + 遗留问题修复：针对三大过程事件（A 审查官工具幻觉 / B `npm test` 静默覆写真实环境 / C 裸跑命中全局旧版）做机制加固——审查纪律与可信度规范入模板、`flow.test.ts`/`plan.test.ts` 补 `vi.mock('node:os')` + CI 环境哈希守卫、执行型口径统一 `node bin/openfeel.js` + CI 版本门禁；并清理 13 项已盘点遗留（i18n help 文案、REV 状态提请、权限措辞精化、profile.yaml 健壮性、455 条死映射清理）。**继续 v1.1.2，不改版本号**。

## 依赖

- **hard**：`v1.1.2-stage-43`（已 done；本阶段修改其创建的 skill 权威源与已收口版本号）
- **soft**：stage-46（备份基础设施，供 profile 健壮性参考）、stage-47（测试隔离纪律先例）
- **下游**：`v1.1.2-stage-49`（**hard 上游**：本阶段提供稳定基线）
- **注意**：op-002 与 op-003 同改 `.github/workflows/ci.yml` → 串行

## 操作方案

详见 `.openfeel/plan/v1/stage-48/plan.md`（op-001 ~ op-007）。
