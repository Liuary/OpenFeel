# v1.1.2-stage-50

## 目标

全量审查 non-blocking 集中清理（第二批）：承接 v1.1.2-stage-49 整仓全量审查总报告 §五 的流转裁定，**编号化清理 T1~T57 共 57 条**（6 批次 A~F）——内部模式一致性（current.op 悬空/缺 ops 守卫/op 分割写法/checkpoint 死键/shell 拼接）、门禁与 CI 失效面（`lint` 退出码/CI 守卫窗口与覆盖/transitions 差异显式化）、死代码与配置面（`utils/path.ts` 删除/`update_infos` 清理策略/profile 深拷贝/级联 Zod 校验/原型链防护）、i18n 与命令体验（arguments 泄漏/wizard 非 TTY/REPL/退出码）、测试质量与覆盖（环境依赖测试/静默 skip/migrate 失败语义断言缺口）、模板与文档口径（**`templates/BUG-003` 部署型 skill 双口径 34 行/5 skill**、`agents-md/en.md:438` 图注、`cli-usage` 枚举、`build.js` 注释、CHANGELOG）。**继续 v1.1.2，不改版本号**。

## 依赖

- **hard**：`v1.1.2-stage-49`（已 done/归档；本阶段清单全部来自其总报告与单元报告的流转裁定）
- **soft**：`v1.1.2-stage-48`（`templates/BUG-003` 与 U4-001 为事件 C 口径治理续作）
- **下游**：无固定后继（v1.1.2 收尾）；归档官文档类与 R5 登记项由归档/后续版本承接

## 操作方案

详见 `.openfeel/plan/v1/stage-50/plan.md`（op-001 ~ op-007）。
