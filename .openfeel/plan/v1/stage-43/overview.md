# v1.1.2-stage-43

## 目标

CLI 文档 skill 化与版本收口：新增 `openfeel-cli-usage` skill（唯一权威源 → build 双注入 → 自举重生成，扁平单文件、无 `{lang}`），裁定其与 `openfeel-wizard` 的职责边界；同步 docs/手册；版本号四处统一收口为 1.1.2 并完成全量回归。

## 依赖

- **hard**：`v1.1.2-stage-41`（skill 须文档化其新增命令 `flow phases` / `flow stage remove` / `plan stage add --deps` 与三入口分层结论）
- **soft**：`v1.1.2-stage-42`（文档化 `config effective` 与修正后的 `pipeline.phase` 语义）
- **下游**：无（版本终点，产出 `npm publish` 就绪态）

## 操作方案

详见 `.openfeel/plan/v1/stage-43/plan.md`（op-001 ~ op-003）。
