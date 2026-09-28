# v1.1.2-stage-43

## 目标

CLI 文档 skill 化与版本收口：新增 `openfeel-cli-usage` skill（唯一权威源 → build 双注入 → 自举重生成，扁平单文件、无 `{lang}`），裁定其与 `openfeel-wizard` 的职责边界；同步 docs/手册；版本号四处统一收口为 1.1.2 并完成全量回归；**并修复 `config/BUG-004`（`identity.test.ts` 直写真实 `~/.openfeel/config.json` 的测试隔离缺口）+ 复核版本收口清单**。

## 依赖

- **hard**：`v1.1.2-stage-41`（skill 须文档化其新增命令 `flow phases` / `flow stage remove` / `plan stage add --deps` 与三入口分层结论）；**`v1.1.2-stage-47`**（版本收口清单行号/内容以 stage-41~47 全部落地后的实盘为准；`config/BUG-004` 由 stage-47 验收发现）
- **soft**：`v1.1.2-stage-42`、`stage-44`、`stage-45`、`stage-46`（文档化 `config effective`/`pipeline.phase`、权限模型、平台泛化、部署前备份；会改写本阶段需同步的 docs/手册与模板行号）
- **下游**：无（版本终点，产出 `npm publish` 就绪态）

## 操作方案

详见 `.openfeel/plan/v1/stage-43/plan.md`（op-001 ~ op-005）。
