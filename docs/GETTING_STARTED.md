# OpenFeel 用户入门指南

> 适用版本：**v1.1.7 快照** | 更新日期：2026-10-11 ｜ 命令细节以 `openfeel <cmd> --help` 实时输出为准
>
> ⚠️ 本文示例命令 `openfeel <cmd>` 为**安装后的一般使用者用法**；若在**本仓库源码**中开发/执行，请改用 `node bin/openfeel.js <cmd>`（全局 `openfeel` 可能命中旧版，请以 `openfeel --version` 实测为准）。

## 1. 简介

OpenFeel 是一款 **AI Agent 开发流程治理 CLI 工具**——通过三层计划（大计划/小计划/操作方案）与流水线阶段机（计划→方案→执行→审查→测试→归档），让多个 AI Agent 在统一规则下协作完成软件项目的规划、开发与验收。

## 2. 环境要求

| 依赖 | 最低版本 | 说明 |
|------|:--:|------|
| Node.js | ≥ 20 | 运行时环境（支持 ESM 与 `fetch` 等现代 API） |
| npm | ≥ 10 | 随 Node.js 安装，用于安装与发布 |

检查环境：

```bash
node --version
npm --version
```

## 3. 安装

```bash
npm install -g openfeel
```

安装完成后验证：

```bash
openfeel --version
openfeel --help
```

### 升级后为何需重跑 `setup`

升级流程：

```bash
npm i -g openfeel@latest   # 1. 升级 CLI
openfeel setup             # 2. 重跑部署，刷新全局 AGENTS.md/agents/skills/opencode.jsonc
# 3. 重启 harness（opencode）以加载新的全局配置

# Claude Code 适配器变体（可选，v1.1.6 起）
openfeel setup --tools claude   # 重跑 Claude 部署（~/.claude/）
# 首次创建 ~/.claude/{agents,skills} 后重启会话或 /reload-skills
```

仅 `npm i -g` 不会刷新全局资产，须重跑 `openfeel setup` 并重启 harness。`openfeel setup --check` 可诊断全局部署版本与 CLI 版本是否一致（一致退出 0，否则退出 1）。

### 启用 Claude Code 适配器（可选）

```bash
openfeel setup --tools claude   # 部署 ~/.claude/（与 opencode 并存，默认不启用）
```

- 部署资产到 `~/.claude/`：`CLAUDE.md`（全局约束，用户已有内容 append 不覆盖）、`agents/`（9 个，含 `feel`）、`skills/`（17 个共享源）、`settings.json`（注入 `"agent":"feel"` + `"permissions":{"defaultMode":"auto"}`，用户既有键逐字保留）。
- **升级后**：`npm i -g openfeel@latest` → `openfeel setup --tools claude`；首次创建 `~/.claude/{agents,skills}` 后须**重启会话或 `/reload-skills`**；`CLAUDE.md` 于下次会话生效。仅 `npm i -g` 不刷新全局资产。
- **默认零触**：不带 `--tools` 时 `~/.claude/` 零变化。

### 工作流模式（full / fast）与自动推进（v1.1.7 起）

自 v1.1.7 起支持两种工作流模式（**阶段级生效**，项目级默认记忆于 `config.yaml` 的 `defaults.workflow_mode`）：

- **full**：完整流水线（15 个 phase，含方案与测试环节）。
- **fast**（新部署默认）：快线链 `plan_pending → plan_review → plan_passed → exec_running → review_pending → review_passed → archiving → done`——跳过 6 项（`scheme_*` / `test_*`），**计划审查与代码审查保留单轮**（`review_failed` 可回环重试）。

选择与查看：

```bash
openfeel plan stage add stage-01 --workflow-mode fast   # 新建阶段时指定（写入项目默认记忆）
openfeel stage set stage-01 --workflow-mode full        # 单阶段切回完整流程
openfeel config set defaults.workflow_mode full         # 项目默认（后续新建阶段沿用）
openfeel flow mode [--stage stage-01] [--json]          # 查看当前模式与来源（只读）
openfeel flow phases --mode fast                        # 按指定模式查看转移表
```

> **默认自动推进开启（v1.1.7 起）**：新部署的 `config.yaml` 默认 `auto_advance: enabled`；如需关闭，执行 `openfeel config set auto_advance disabled`，或在创建阶段时显式传 `--auto-advance disabled`。

> **存量项目升级迁移（v1.1.7 起）**：若项目 `config.yaml` 未设置 `defaults.workflow_mode`（v1.1.7 之前创建的项目），升级后**新建阶段的骨架初值回落内置默认 `fast`**；既有阶段的 `status.md` 若无「工作流模式」字段，其模式解析同样按级联回落 `fast`（无感行为变更）。希望保持完整流程的存量项目，建议执行：
>
> ```bash
> openfeel config set defaults.workflow_mode full   # 项目级默认；新建与无字段阶段一并回落 full
> ```

## 4. 初始化项目

在项目根目录（或空目录）中初始化 OpenFeel 工作区：

```bash
openfeel init
```

也可以在指定目录初始化：

```bash
openfeel init ./my-agent-project
```

初始化会创建 `.openfeel/` 目录结构，包括流水线状态文件（`flow.json`）、配置（`config.yaml`）、分期大纲（`roadmap/`）、计划（`plan/`）、知识库（`kb/`）、日志（`log/`）等公共域与私域目录。

## 5. 基本工作流

### 5.1 查看流水线状态

```bash
openfeel flow status
```

输出当前所处的阶段（phase）：`plan_pending → plan_review → plan_passed → scheme_pending → scheme_review → scheme_passed → exec_running → review_pending → review_passed → test_pending → test_passed → archiving → done`（fast 工作流快线下为快线链，见「工作流模式」小节）。

### 5.2 创建计划

先创建分期大纲（版本），再添加工作阶段，最后为阶段创建操作方案：

```bash
# 创建分期大纲
openfeel roadmap create v1.0

# 添加工作阶段
openfeel plan stage add stage-01

# 为阶段创建操作方案（自动生成 op-001 模板）
openfeel plan scheme create stage-01 "实现核心功能"
```

### 5.3 推进阶段

操作方案经审查通过后，由 Feel 总统领（或人工）通过 `openfeel flow` 命令推进流水线：

```bash
# 推进到指定阶段
openfeel flow advance --stage v1.0.0-stage-01 --op v1.0.0-stage-01.op-001 --to exec_running

# 查看当前阶段与操作
openfeel flow current
```

### 5.4 常见辅助操作

```bash
# 查看计划阶段列表
openfeel plan stage list

# 查看知识库索引
openfeel knowledge index

# 项目健康检查（i18n 键一致性、kb 引用有效性）
openfeel lint
```

## 6. 命令速查表

| 命令 | 说明 |
|------|------|
| `openfeel init [path]` | 初始化项目工作区，创建 `.openfeel/` 目录结构与配置文件 |
| `openfeel flow` | 流水线状态管理（`status`/`current`/`advance`/`attempt`/`log` 等） |
| `openfeel flow mode` | 查看当前阶段的工作流模式与来源（只读，支持 `--stage` / `--json`） |
| `openfeel plan` | 计划管理（`stage add/list`、`scheme create/list`） |
| `openfeel view` | 审查条目管理（`list`/`add`/`accept`） |
| `openfeel archive <stage>` | 归档指定阶段（汇总产出、生成摘要、提取知识） |
| `openfeel roadmap` | 分期大纲管理（`create`/`show`） |
| `openfeel instructions <artifactId>` | 生成结构化指令（XML 或 JSON） |
| `openfeel update [path] [--tools <list>]` | 部署 OpenFeel 适配文件到目标项目 |
| `openfeel setup [--check] [--tools <list>]` | 部署全局框架配置；`--check [--json]` 只读诊断全局部署与 CLI 版本一致性 |
| `openfeel knowledge` | 知识库管理（`list`/`add`/`search`/`index`） |
| `openfeel stage` | 工作阶段状态管理（status.md 原子操作） |
| `openfeel project` | 项目管理与概览 |
| `openfeel config` | 配置管理（`get`/`set`，支持 `--global`） |
| `openfeel lint` | 项目健康检查（i18n 键一致性、kb 引用有效性） |
| `openfeel -v, --version` | 输出版本号 |
| `openfeel -h, --help` | 显示命令帮助信息 |

## 相关文档

- [命令参考](commands.md) — CLI 命令详细用法
- 框架行为约束 — 由 `openfeel setup` 部署到全局（见 README）
- [文档索引](index.md) — 设计文档与研发分期归档
- [变更日志](../CHANGELOG.md) — 版本历史与重要变更
