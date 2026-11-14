# OpenFeel

[English](README.en.md) | [更新日志](CHANGELOG.md) | [npm](https://www.npmjs.com/package/openfeel) | [入门指南](docs/GETTING_STARTED.md)

OpenFeel 是配合 DSH、Claude Code、opencode 这类 AI 编程工具使用的命令行工具。它自己不写代码，只负责记录开发过程，约束 AI 做事的先后顺序。

## 它解决两个问题

一是 AI 聊久了会忘事。对话有长度上限，聊多了前面的内容就会丢；换个新会话，AI 就不记得项目做到哪、下一步该干什么。OpenFeel 把进度记在项目文件夹里，换会话后让 AI 读一下记录就能接着做。

二是 AI 做事容易跳步骤。没有约束的时候，AI 常会跳过需求和检查直接改代码，改完也不验证，最后版本发没发没人说得清。OpenFeel 要求 AI 按顺序来：先记下要做什么，写好计划再动手，做完必须经过检查和验证。上一步没做完，就进不了下一步。

## 它是怎么安排工作的

### 版本与阶段

一个版本可以分成几个阶段，每个阶段内部按固定顺序走：计划 → 计划审查 → 方案 → 执行 → 代码审查 → 测试 → 归档。如果是小改动，可以走简化流程，跳过方案和测试，但计划审查和代码审查依然保留。

阶段是版本下面的一段工作容器，一个阶段里可以放多个需求。做完一个需求不用关闭阶段；等确认要发布版本时，才统一推进归档。归档前要求这个版本的所有阶段都已经完成、关联的需求全部收尾，而且没有未解决的阻塞问题。

### 待办清单

具体的需求会列在待办清单里，分为七种状态：草稿、已排期、进行中、完成、阻塞、取消、驳回。每条需求可以认领，也可以关联到一个或多个阶段。

一条需求想标为「完成」，必须留下审查结论和验证证据，少一样都推不动。发布版本前，系统还会检查当前版本有没有没做完的需求，有的话就顺延到下一个版本。

## 两种使用方式

默认是自由模式（Free Mode）。OpenFeel 照样记录状态，但不强制先建需求或阶段，由 AI 自己判断这件事要不要走流程。

需要严格按步骤推进时，可以切到流程模式（Feel Mode）。这个模式要求先建好阶段和需求，AI 动手前必须先读取当前状态，审查和验证也不能跳过。

模式可以按单个项目切换，也可以改全局默认。平时直接让 AI 帮忙切就行，比如跟它说「把当前项目切到流程模式」或「全局默认改成自由模式」。两种模式共用同一套记录和检查条件，区别只是流转步骤是否强制执行。

## 记录存在哪

所有记录都保存在项目根目录的 `.openfeel/` 文件夹里，不放在聊天对话中，换会话或关掉软件都不会丢。里面包含当前进度、待办清单、检查记录、历史版本和项目设置。这些文件由 OpenFeel 自己维护，不需要手动修改，DSH 里的适配器只负责读取和转述。

> 📦 **最新版本 v1.5.22** — 适配器页面（`openfeel-dsh`）重写为「主要介绍 OpenFeel，再说明它是 DSH 适配版本」，适配细节移到后面；`feel_mode` 两种取值为 Feel Mode（流程模式，`enabled`）与 Free Mode（自由模式，`disabled`），默认 Free Mode。DSH 官方「发现」页可用索引 [`docs/market/index.json`](docs/market/index.json) 添加。版本能力概览见 [docs/VERSIONS.md](docs/VERSIONS.md)。

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

> 示例命令 `openfeel <cmd>` 为安装后的用法；在本仓库源码中开发或执行请用 `node bin/openfeel.js <cmd>`。支持的宿主：opencode（默认）、Claude Code、DSH。

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
- **完成必审验（v1.5.8 / REQ-027）**：需求 `done` 前必须 `openfeel req review <id> …` + `openfeel req verify <id> …`（两者均 `--result pass`）；阶段 `archiving → done` 前必须 `openfeel stage verify <id> …` 且该阶段关联需求全部 `done`——缺证据即被拒，`--force` 不绕过。

## Claude Code 适配器（v1.1.6 起）

> 与 opencode 适配器**并存**，**默认不启用**（须显式 `--tools claude`）。

- **启用**：`openfeel setup --tools claude`（或 `--tools opencode,claude` 双 harness）。
- **部署资产到 `~/.claude/`**：`CLAUDE.md`（全局约束，受管区三态，用户已有内容 append 不覆盖）、`agents/`（**10 个**，含 `feel`）、`skills/`（**22 个**共享源）、`settings.json`（注入 `"agent":"feel"` + `"permissions":{"defaultMode":"auto"}`，**用户既有键逐字保留**；**无则创建、有则不覆盖**——用户主权键 `model` 不被改写）。
- **升级**：`npm i -g openfeel@latest` → `openfeel setup --tools claude`；**首次创建 `~/.claude/{agents,skills}` 后须重启会话或 `/reload-skills`** 使新 skill/agent 生效；`CLAUDE.md` 于**下次会话**生效。仅 `npm i -g` 不刷新全局资产。
- **默认零触**：不带 `--tools` 时 `~/.claude/` **零变化**。

## DSH 适配器（v1.3.0 起）

> 与 opencode / Claude Code 适配器**并存**，默认不部署；适配器同时以独立 npm 包 `openfeel-dsh` 发布（v1.5.20 起，供 DSH 插件市场安装），`openfeel` 单包内仍自带 `dsh/`。

```bash
npm i -g openfeel@latest      # 1. 安装/升级（单包，已含 dsh/）
openfeel setup --tools dsh    # 2. 部署到 DSH profile（默认全部；可 --dsh-profile web）
# 3. 重启 DSH 宿主
```

**社区市场安装（v1.5.20 起）**：适配器已是独立 npm 包，可直接 `dsh plugin add openfeel-dsh`；**仍须**全局安装 CLI（`npm i -g openfeel`，门禁在 CLI 里），但**不要再执行 `openfeel setup --tools dsh`**——setup 会把 profile 依赖改写成本地 `link:`，覆盖市场安装版本。二选一，最后重启宿主。

- 写入 `<DSH_HOME>/profiles/<name>/package.json`：`dependencies["openfeel-dsh"] = "link:<openfeelRoot>/dsh"` + `dsh.profile.bundles += "openfeel-dsh"`，并在需要时执行 `pnpm install`（依赖未变化且链接有效时跳过）。
- 前提：DSH `0.2.0-rc.2`、Node ≥ 20.17、存在 DSH profile、全局 `openfeel` 可用（`openfeel-dsh` 的 `requiresCli` 声明所需 CLI 下限；适配器不做硬校验，CLI 过旧时以门禁报错为准）。
- 升级：`npm i -g openfeel@latest` → 重启 DSH；`link:` 指向同一路径，随包更新（社区市场安装则同时升级 `openfeel-dsh`）。
- 开发态可直接 `link:` 仓库 `dsh/`；详见 [dsh/README.md](dsh/README.md) 与 [dsh/ADAPTER.md](dsh/ADAPTER.md)。
- 写入门禁第 4 类（无法静态判定写入目标）默认 **告警放行、不阻断**，只落审计 + 一行 stderr（不消耗模型轮次）；已知安全命令可用 `OPENFEEL_SHELL_ALLOW` 白名单（`||` 分隔，折叠空白后**整条命令全等**，`strict` 档同样生效），例如 `OPENFEEL_SHELL_ALLOW="Build.bat all || node Tools/gen-typings.js"`。
- `openfeel update --tools dsh` 不适用（DSH 是全局部署）。

## 快速迭代模式（v1.1.7 起）

> 本节讲 `workflow_mode`（走流程时的关卡密度），与上文 `feel_mode`（是否强制流程）正交；新部署默认 **fast**（`config.yaml defaults.workflow_mode`），可逐阶段覆盖与切回。

- **快线链**：`plan_pending → plan_review → plan_passed → exec_running → review_pending → review_passed → archiving → done`（跳过 6 项 `scheme_*` / `test_*`；**计划审查与代码审查保留单轮**，`review_failed` 可回环重试）。
- **选择与切换**：`openfeel plan stage add <name> --workflow-mode full|fast|general`（新建阶段）；`openfeel stage set <stage> --workflow-mode full|fast|general`（单阶段切回）；`openfeel config set defaults.workflow_mode full|fast|general`（项目默认记忆）。**`general` 仅需求级合法**（v1.2.1 起，见 [docs/VERSIONS.md](docs/VERSIONS.md)）。
- **查看（只读）**：`openfeel flow mode [--stage <id>] [--json]`（当前模式 + 来源）；`openfeel flow phases [--mode full|fast|general] [--stage <id>]`（按模式查看转移表）。
- **默认自动推进开启**：新部署默认 `auto_advance: enabled`（v1.1.7 起）；如需关闭：`openfeel config set auto_advance disabled`。
- **v1.3.3 修复（fast 结构性缺口）**：fast 快线新增**返工边** `review_passed → exec_running`（`flow advance --reason` 落审计）；无 op 的 fast 阶段可用 `flow review add --stage <id>` 挂**阶段级 REV**；写入门禁对**空仓新增文件**与 `docs/**` / doc-note 放行（源码仍要求 `exec_running`）；`plan stage add` 后**原子聚焦**。阶段 ID 归一化与 `plan/` 目录映射见 [docs/commands.md](docs/commands.md)。

完整中文文档：[README.zh-CN.md](README.zh-CN.md)（含 Claude Code / DSH 适配器、命令参考与核心概念）


