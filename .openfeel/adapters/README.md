# 适配器目录规范

OpenFeel 采用核心层 + 适配器层架构：

## 核心层（跨平台统一）
位于 `.openfeel/` 下：
- 流水线状态机（pipeline.yaml）
- 核心约束（AGENTS.md）
- 工作区规范（.opencode/instructions/core.md）
- 数据结构（flow.json）
- 配置（config.yaml）
- 知识库/日志/审查/Bug 体系

## 适配器层（平台特化）
每个平台一个适配器目录：

| 目录 | 平台 | 状态 |
|------|------|------|
| `.opencode/` | OpenCode | ✅ 当前使用 |
| `kilo/` | Kilo | 🔵 预留 |
| `claude/` | Claude | 🔵 预留 |

每个适配器目录至少包含：
- 平台配置文件（opencode.jsonc / kilo.json / claude.json）
- `agents/` — Agent 定义
- `skills/` — Skill 定义
- `instructions/` — 平台特化指令

## 扩展指南
新增适配器：
1. 创建平台目录 + 配置文件
2. 复制核心层引用（AGENTS.md 路径）
3. 平台特化内容放入对应子目录
4. 不改核心层源码
