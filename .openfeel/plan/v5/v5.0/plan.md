# OpenFeel v0.5.0 — 框架级记忆体系

> 创建于 2026-08-07 | 基于 route-map 中的设计

## 目标

建立不依赖平台的两层记忆体系，支撑跨会话决策连续性。

## 任务

| op | 任务 | 涉及文件 |
|----|------|------|
| op-001 | 全局用户画像 profile.yaml 读写 | `src/core/config.ts`（+schema + 读写方法） |
| op-002 | CLI `config --global` 标志 | `src/commands/config.ts` |
| op-003 | 项目记忆卡片 dev_last.md 扩展 + Feel prompt | 模板 + `feel.md` |

## 设计要点

- 全局 profile：`~/.config/openfeel/profile.yaml`，YAML 格式
- 项目记忆：dev_last.md 增加决策历史、上下文快照
- CLI：`config get/set --global` 操作全局 profile
- 不依赖任何平台机制
