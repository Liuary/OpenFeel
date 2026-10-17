# OpenFeel — AI Agent 开发流程治理 CLI

[English](README.en.md) | [更新日志](CHANGELOG.md) | [npm](https://www.npmjs.com/package/openfeel) | [入门指南](docs/GETTING_STARTED.md)

> 📚 版本能力概览：[docs/VERSIONS.md](docs/VERSIONS.md) ｜ 逐版本明细：[CHANGELOG.md](CHANGELOG.md)

> ⚡ **当前适配 harness**：**opencode（默认）** ｜ **Claude Code**（`--tools claude`，v1.1.6 起） ｜ **DSH**（`--tools dsh`，v1.3.0 起） ｜ **默认模型**：DeepSeek V4（主力推理）+ GLM-5.3-flash（交叉审查）+ DeepSeek-flash（多模态视觉）

> ⚠️ 下文示例命令 `openfeel <cmd>` 为**安装后的一般使用者用法**；若在**本仓库源码**中开发/执行，请改用 `node bin/openfeel.js <cmd>`（全局 `openfeel` 可能滞后于本仓——未随本仓库源码同步更新）。

OpenFeel 是一个 TypeScript CLI 工具，为 AI Agent 开发提供端到端的流程治理。核心理念：**「提示词瘦身，流程入工具」** —— Agent 不靠读长文本理解流程，而是通过 `flow.json` 获取当前状态和下一步指令。

> 📦 **最新版本 v1.3.1**（DSH 部署热修复） — `openfeel setup --tools dsh` 的 `pnpm install` 增加 `--no-frozen-lockfile`，修复 profile lockfile 过期时的 `ERR_PNPM_OUTDATED_LOCKFILE`；版本能力概览见 [docs/VERSIONS.md](docs/VERSIONS.md)。

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

## 推荐用法：需求驱动 + 快速迭代（fast）

> 日常开发默认推荐 **fast**：计划审查 + 代码审查各单轮，跳过方案/测试相位；大改动或架构变更再用 **full**。

```bash
openfeel req add "接入 DSH 适配器" --workflow-mode fast          # 1. 发布需求
openfeel req claim REQ-NNN                                       # 2. 认领
openfeel plan stage add vX.Y.Z-stage-NN --workflow-mode fast     # 3. 建 fast 阶段
openfeel req link --stage vX.Y.Z-stage-NN --requirement REQ-NNN  # 4. 关联
openfeel flow next                                               # 5. 按调度迭代
```

- **fast（默认推荐）**：日常迭代；保留计划审查与代码审查，跳过 scheme/test；
- **full**：大改动 / 架构变更，完整六关；
- **general**：无流水线的零散任务，仅需求级合法；
- 需求关联阶段后，全部关联阶段 done 时自动收口需求。

## Claude Code 适配器（v1.1.6 起）

> 与 opencode 适配器**并存**，**默认不启用**（须显式 `--tools claude`）。

- **启用**：`openfeel setup --tools claude`（或 `--tools opencode,claude` 双 harness）。
- **部署资产到 `~/.claude/`**：`CLAUDE.md`（全局约束，受管区三态，用户已有内容 append 不覆盖）、`agents/`（**10 个**，含 `feel`）、`skills/`（**22 个**共享源）、`settings.json`（注入 `"agent":"feel"` + `"permissions":{"defaultMode":"auto"}`，**用户既有键逐字保留**；**无则创建、有则不覆盖**——用户主权键 `model` 不被改写）。
- **升级**：`npm i -g openfeel@latest` → `openfeel setup --tools claude`；**首次创建 `~/.claude/{agents,skills}` 后须重启会话或 `/reload-skills`** 使新 skill/agent 生效；`CLAUDE.md` 于**下次会话**生效。仅 `npm i -g` 不刷新全局资产。
- **默认零触**：不带 `--tools` 时 `~/.claude/` **零变化**。

## DSH 适配器（v1.3.0 起）

> 与 opencode / Claude Code 适配器**并存**，默认不部署；适配器随 `openfeel` 单包分发。

```bash
npm i -g openfeel@latest      # 1. 安装/升级（单包，已含 dsh/）
openfeel setup --tools dsh    # 2. 部署到 DSH profile（默认全部；可 --dsh-profile web）
# 3. 重启 DSH 宿主
```

- 写入 `<DSH_HOME>/profiles/<name>/package.json`：`dependencies["openfeel-dsh"] = "link:<openfeelRoot>/dsh"` + `dsh.profile.bundles += "openfeel-dsh"`，并在需要时执行 `pnpm install`（依赖未变化且链接有效时跳过）。
- 前提：DSH `0.2.0-rc.2`、Node ≥ 20.17、存在 DSH profile、全局 `openfeel` 可用。
- 升级：`npm i -g openfeel@latest` → 重启 DSH；`link:` 指向同一路径，随包更新。
- 开发态可直接 `link:` 仓库 `dsh/`；详见 [dsh/README.md](dsh/README.md) 与 [dsh/ADAPTER.md](dsh/ADAPTER.md)。
- `openfeel update --tools dsh` 不适用（DSH 是全局部署）。

## 快速迭代模式（v1.1.7 起）

> 与完整流水线（full）**并存**；新部署默认 **fast**（`config.yaml defaults.workflow_mode`），可逐阶段覆盖与切回。

- **快线链**：`plan_pending → plan_review → plan_passed → exec_running → review_pending → review_passed → archiving → done`（跳过 6 项 `scheme_*` / `test_*`；**计划审查与代码审查保留单轮**，`review_failed` 可回环重试）。
- **选择与切换**：`openfeel plan stage add <name> --workflow-mode full|fast|general`（新建阶段）；`openfeel stage set <stage> --workflow-mode full|fast|general`（单阶段切回）；`openfeel config set defaults.workflow_mode full|fast|general`（项目默认记忆）。**`general` 仅需求级合法**（v1.2.1 起，见 [docs/VERSIONS.md](docs/VERSIONS.md)）。
- **查看（只读）**：`openfeel flow mode [--stage <id>] [--json]`（当前模式 + 来源）；`openfeel flow phases [--mode full|fast|general] [--stage <id>]`（按模式查看转移表）。
- **默认自动推进开启**：新部署默认 `auto_advance: enabled`（v1.1.7 起）；如需关闭：`openfeel config set auto_advance disabled`。

完整中文文档：[README.zh-CN.md](README.zh-CN.md)（含 Claude Code / DSH 适配器、命令参考与核心概念）
