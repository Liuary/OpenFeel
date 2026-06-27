# op-02：补齐测试项目 stage-02 ops/ 操作方案

- **完成时间**：2026-06-27
- **执行人**：CodeWorker Agent

## 操作概述

测试项目 `C:\Code\AI\test_deploy\openfeel_test` 的 `.openfeel/stages/stage-02-cli-integration/` 目录下缺少 `ops/` 目录（stage-01 有 4 个 op，stage-02 没有）。

根据 Planner 产出的计划文件 `stages/stage-02-cli-integration/stage.md`（145 行，定义 5 个操作节）创建了对应的 5 个操作方案文件。

## 创建的文件

| # | 文件名 | 对应 stage.md 章节 | 标题 |
|---|--------|-------------------|------|
| 1 | `op-001_CLI入口与命令注册.md` | 2.1 CLI 入口 | CLI入口与命令注册 |
| 2 | `op-002_格式化输出工具层.md` | 2.2 格式化输出工具 | 格式化输出工具层 |
| 3 | `op-003_全局错误处理与退出控制.md` | 2.3 全局错误处理 | 全局错误处理与退出控制 |
| 4 | `op-004_集成验证与端到端测试.md` | 2.4 集成验证 | 集成验证与端到端测试 |
| 5 | `op-005_清理与发布配置.md` | 2.5 清理与发布配置 | 清理与发布配置 |

## flow.json 更新

在 `stages.stage-02-cli-integration.ops` 中注册了全部 5 个 op，格式与 stage-01 保持一致（含 `id`、`title`、`state`、`assignee`、`attempts`、`max_attempts`、`checkpoints`）。

## 模板格式

每个 op 文件遵循 stage-01 ops/ 的模板格式：
- 元数据：阶段、状态、前置、负责 Agent、最多重试
- 目标描述
- 实施步骤（checkbox）
- 产出文件
- 自测清单
- 修正记录表

## 结果

✅ **5 个操作方案文件已创建，flow.json 已同步更新。**
