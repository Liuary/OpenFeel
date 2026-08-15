# OpenFeel 用户入门指南

> 适用版本：1.0.0 | 更新日期：2026-08-07

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

输出当前所处的阶段（phase）：`plan_pending → plan_review → plan_passed → scheme_pending → scheme_review → scheme_passed → exec_running → review_pending → review_passed → test_pending → test_passed → archiving → done`。

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
| `openfeel plan` | 计划管理（`stage add/list`、`scheme create/list`） |
| `openfeel view` | 审查条目管理（`list`/`add`/`accept`） |
| `openfeel archive <stage>` | 归档指定阶段（汇总产出、生成摘要、提取知识） |
| `openfeel roadmap` | 分期大纲管理（`create`/`show`） |
| `openfeel instructions <artifactId>` | 生成结构化指令（XML 或 JSON） |
| `openfeel update [path]` | 部署 OpenFeel 适配文件到目标项目 |
| `openfeel knowledge` | 知识库管理（`list`/`add`/`search`/`index`） |
| `openfeel stage` | 工作阶段状态管理（status.md 原子操作） |
| `openfeel project` | 项目管理与概览 |
| `openfeel config` | 配置管理（`get`/`set`，支持 `--global`） |
| `openfeel lint` | 项目健康检查（i18n 键一致性、kb 引用有效性） |
| `openfeel -v, --version` | 输出版本号 |
| `openfeel -h, --help` | 显示命令帮助信息 |

## 相关文档

- [命令参考](commands.md) — CLI 命令详细用法
- [项目行为约束](../AGENTS.md) — AI Agent 协作核心规范
- [文档索引](index.md) — 设计文档与研发分期归档
- [变更日志](../CHANGELOG.md) — 版本历史与重要变更
