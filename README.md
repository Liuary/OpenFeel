# OpenFeel — AI Agent 开发流程治理 CLI

[English](README.en.md) | [更新日志](CHANGELOG.md) | [npm](https://www.npmjs.com/package/openfeel) | [入门指南](docs/GETTING_STARTED.md)

> ⚡ **当前适配 harness**：**opencode（默认）** ｜ **Claude Code**（`--tools claude`，v1.1.6 起） ｜ **默认模型**：DeepSeek V4（主力推理）+ GLM-5.3-flash（交叉审查）+ DeepSeek-flash（多模态视觉）

> ⚠️ 下文示例命令 `openfeel <cmd>` 为**安装后的一般使用者用法**；若在**本仓库源码**中开发/执行，请改用 `node bin/openfeel.js <cmd>`（全局 `openfeel` 可能滞后于本仓——未随本仓库源码同步更新）。

OpenFeel 是一个 TypeScript CLI 工具，为 AI Agent 开发提供端到端的流程治理。核心理念：**「提示词瘦身，流程入工具」** —— Agent 不靠读长文本理解流程，而是通过 `flow.json` 获取当前状态和下一步指令。

> 📦 **最新版本 v1.2.0**（flow.json 版本分片归档 / 需求流转系统） — 归档 `flow archive`（版本分片）+ 需求 `openfeel req`（10 子命令 / 7 状态）；既有自描述 `flow phases`、配置有效值 `config effective`、部署前自动备份要点保留。

> 📌 本项目基于 [AI_Prompt](https://github.com/Liuary/AI_Prompt) 开发，参考了 [OpenSpec](https://github.com/Fission-AI/OpenSpec) 等工具的设计思路。

---

## 快速开始

```bash
npm install -g openfeel        # 安装（Node ≥ 20）
openfeel init ./my-project     # 初始化新项目
openfeel update                # 已有项目？一键部署平台适配器
openfeel migrate               # 存量旧布局项目？一键迁移（检测/备份/回滚）
openfeel flow status           # 查看流水线
openfeel flow phases           # 查看合法 phase 与转移表
openfeel setup --tools claude  # 显式启用 Claude Code 适配器（可选）

npm install -g openfeel@latest # 更新到最新版本
```

> 💡 `init` 用于新项目首次部署，`update` 为已有项目增量更新（适用于 `init` 之后再引入 OpenFeel 的项目）。存量旧布局项目（opencode 适配器：项目内 `.opencode/agents|skills|instructions`）用 `openfeel migrate` 迁移到全局部署。框架资产（agents/skills/AGENTS.md）经 `openfeel setup` 全局部署，项目内不再生成 `.opencode/agents|skills`。

## Claude Code 适配器（v1.1.6 起）

> 与 opencode 适配器**并存**，**默认不启用**（须显式 `--tools claude`）。

- **启用**：`openfeel setup --tools claude`（或 `--tools opencode,claude` 双 harness）。
- **部署资产到 `~/.claude/`**：`CLAUDE.md`（全局约束，受管区三态，用户已有内容 append 不覆盖）、`agents/`（**9 个**，含 `feel`）、`skills/`（**18 个**共享源）、`settings.json`（注入 `"agent":"feel"` + `"permissions":{"defaultMode":"auto"}`，**用户既有键逐字保留**）。
- **升级**：`npm i -g openfeel@latest` → `openfeel setup --tools claude`；**首次创建 `~/.claude/{agents,skills}` 后须重启会话或 `/reload-skills`** 使新 skill/agent 生效；`CLAUDE.md` 于**下次会话**生效。仅 `npm i -g` 不刷新全局资产。
- **默认零触**：不带 `--tools` 时 `~/.claude/` **零变化**。

## 快速迭代模式（v1.1.7 起）

> 与完整流水线（full）**并存**；新部署默认 **fast**（`config.yaml defaults.workflow_mode`），可逐阶段覆盖与切回。

- **快线链**：`plan_pending → plan_review → plan_passed → exec_running → review_pending → review_passed → archiving → done`（跳过 6 项 `scheme_*` / `test_*`；**计划审查与代码审查保留单轮**，`review_failed` 可回环重试）。
- **选择与切换**：`openfeel plan stage add <name> --workflow-mode full|fast`（新建阶段）；`openfeel stage set <stage> --workflow-mode full|fast`（单阶段切回）；`openfeel config set defaults.workflow_mode full|fast`（项目默认记忆）。
- **查看（只读）**：`openfeel flow mode [--stage <id>] [--json]`（当前模式 + 来源）；`openfeel flow phases [--mode full|fast] [--stage <id>]`（按模式查看转移表）。
- **默认自动推进开启**：新部署默认 `auto_advance: enabled`（v1.1.7 起）；如需关闭：`openfeel config set auto_advance disabled`。

## v1.2.0 新增能力

- **flow.json 版本分片归档（`flow archive`）**：三个入口——`openfeel flow archive <version>`（执行归档；判据门 = 该版本全部阶段 done 且无 blocking open REV，**不设 `--force`**）、`openfeel flow archive list`、`openfeel flow archive show <version> [--json]`；归档落点 `.openfeel/flow-archive/{version}.json`。**与顶层 `openfeel archive <stage>`（阶段摘要归档）区分**；常规命令不读归档。
- **需求流转（`openfeel req`）**：10 子命令（`add` / `list` / `show` / `claim` / `release` / `set` / `link` / `advance` / `board` / `next`）+ 7 状态（`draft` / `scheduled` / `in_progress` / `done` / `blocked` / `cancelled` / `rejected`）；需求进度由关联阶段 phase 聚合（**全部关联阶段 done 时自动收口**）；认领协议 = `owner` + `claimed_at`（无 TTL）。用法权威源见 `openfeel-req` skill。
- **兼容**：旧 flow.json（无 `requirements` / `archived_versions`）零报错，升级**无需迁移**。

完整中文文档：[README.zh-CN.md](README.zh-CN.md)（详见其中的「Claude Code 适配器」小节）
