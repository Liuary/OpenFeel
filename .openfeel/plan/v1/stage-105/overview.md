# v1.3.4-stage-105

## 目标

修复 1.3.3 复测暴露的三处分发链路断点：① DSH 适配器 `review_add` 透传 `--stage`；② `setup --check` 三态化（mismatch / restart-required / ok）；③ `setup` 在 dsh-only / 已是最新分支刷新 `update_state.json` 的版本与适配器标记。发布 1.3.4。

## 依赖

无（v1.3.4 唯一阶段；v1.3.3 已归档并发布）

## 操作方案

见 `plan.md` 第三节文件清单。执行顺序：适配器透传 → 部署标记（update_state/adapters）→ 宿主 marker + check 三态 → 版本收口。fast 模式，计划审查 + 代码审查各保留一轮。
