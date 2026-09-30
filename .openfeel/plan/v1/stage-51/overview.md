# v1.1.2-stage-51

## 目标

流水线状态维护与 CLI 可维护性（下游反馈二）：补齐「**纠正/清理**」侧 CLI 能力——**N1~N11** 编号化（3 批次 H1~H3）——孤儿 op 回收与检测、结构字段 CLI（deps/reviews）、`scheme create` 注册语义统一、`flow attempt` 同步 `current.op`、`stage set` 幂等化与字段扩展、`stage task --add`、op 文件名固定 `op-NNN.md`、knowledge index 宽容解析与**新增 `openfeel knowledge dedup` 子命令**（A6 用户裁定）、公共日志布局**仅统一未来写入**（A7 用户裁定：不迁移历史、索引共存说明）、git 脏区警告降噪。**继续 v1.1.2，不改版本号**。

## 依赖

- **hard**：`v1.1.2-stage-50`（当前 `planned`；`flow-manager.ts`/`commands/flow.ts`/`core/plan/scheme.ts` 为其热区，必须串行；且 **T1 ↔ N4 共用 `current.op` 生命周期**、**T8 → N9 的 `basePath` 参数化为 `openfeel knowledge dedup` 子命令的基础**）
- **soft**：`v1.1.2-stage-41`（`plan scheme create`/`flow stage remove`/`plan stage add --deps` 为基线）
- **下游**：无固定后继（v1.1.2 收尾）
- **不纳入**：反馈 #6 的 `config set` 白名单扩展（归 stage-50 T36/R3）；#3(b) `advance` 报错回显（实测已修）
- **用户已裁定（2026-09-30）**：A2 孤儿 op 默认只报告 + `--prune-orphans`；A5 op 文件名改 `op-NNN.md` 且不做迁移命令；**A6 暴露 `openfeel knowledge dedup` 子命令（不删除）**；**A7 仅统一未来写入、不新增历史迁移命令**；A1/A3/A4/A8 按建议

## 操作方案

详见 `.openfeel/plan/v1/stage-51/plan.md`（op-001 ~ op-009）。
