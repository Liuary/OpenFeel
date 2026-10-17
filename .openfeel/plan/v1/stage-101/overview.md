# v1.3.0-stage-101

## 目标

让 OpenFeel 继续使用单一 npm 包 `openfeel`，把 DSH 适配器（仓库内 `dsh/`）随包分发，并新增显式部署指令 `openfeel setup --tools dsh`（写入 DSH profile：`openfeel-dsh -> <openfeelRoot>/dsh` 的 `link:` 依赖 + `dsh.profile.bundles`，并执行 `pnpm install`）；随后升版本到 **1.3.0** 并发 npm，触发 GitHub CI 自动发布。**不**新建、不发布 `openfeel-dsh` npm 包。

同时完成 README 重构：版本能力章节迁出到 `docs/VERSIONS.md` / `docs/VERSIONS.en.md`（CHANGELOG 保留逐版本明细）、补充 DSH 安装说明、把「需求驱动 + fast 快速迭代」提升为推荐用法；三语 README 同步。

## 依赖

无

## 操作方案

详见 [plan.md](plan.md)（含行为契约、文件改动清单、版本 1.3.0 收口清单、README R1/R2/R3、测试门禁、发布与回滚、风险与 DoD）。
