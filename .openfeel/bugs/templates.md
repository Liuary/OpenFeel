# templates 模块 Bug 归档

> 来源阶段：`v1.1.2-stage-45`（平台强限定内容「描述泛化」，实现 commit `8e1e186`）
> 登记人：openfeel-feel-tester ｜ 登记时间：2026-09-29 ｜ 私域详细报告：`.openfeel/users/Liuary/bugs/templates/`
> 本文件为 **templates 模块首次建立**的公共 Bug 归档。

---

## BUG-002：全局约束模板 `agents-md` 权限部署路径行未泛化（与仓库根 `AGENTS.md` 同类表述处理不一致）

- **优先级**：medium ｜ **阻塞**：否 ｜ **状态**：open（**处置归属：stage-47 缺陷清理**）

### 核心结论

模板权威源 `src/core/templates-data/agents-md/{zh-CN,en}.md:112`（`## 权限模型（Agent permission）` 节首句）仍将 opencode 专属全局绝对路径 `~/.config/opencode/agents/*.md` 直接表述为**框架的部署目标**——**既未泛化、也未按本阶段要求显式标注为「opencode 适配器」**：

```
zh-CN.md:112  9 个 agent 各自内联 `permission:` 白名单（`openfeel setup` 部署到 `~/.config/opencode/agents/*.md`），含 `external_directory: "allow"`。
en.md:112     Each of the 9 agents inlines a `permission:` allowlist (deployed by `openfeel setup` to `~/.config/opencode/agents/*.md`), including `external_directory: "allow"`.
```

对照仓库根 `AGENTS.md:122`（**本阶段 op-003 ① 已泛化**）：

```
由 `openfeel setup` 部署到**全局 agents 目录**（opencode 适配器：`~/.config/opencode/agents/*.md`）。
```

复现命令：`rg -n "agents/\*\.md" src/core/templates-data/agents-md AGENTS.md`

**根因**：**双源不同步**——同一语义句在「模板权威源（部署源）」与「仓库根 `AGENTS.md`（手工维护、仅本仓库可见）」双份存在，本阶段仅改了后者。`build.js:143` 对 agents-md 仅注入 `AGENTS_MD_TEMPLATES` 生成段，**不写仓库根 `AGENTS.md`**，两者无单一源约束、无一致性断言，故「改一处」不会触发任何失败。

**归因**：**清单外遗漏**。stage-45 plan §2.2 A 类盘点仅登记 `agents-md:3`（部署路径行），未覆盖 stage-44 新增的 `:112`（权限部署落点行）→ 属盘点清单覆盖缺口，非 executor 越界或漏执行。

### 影响范围

- **用户可见性最高**：该模板经 `openfeel setup` 部署为**所有 OpenFeel 项目的全局 `AGENTS.md`**（`getGlobalAgentsMdPath()` 落点），可见度**高于**仓库根 `AGENTS.md`（后者仅本仓库可见）——恰是用户指令点名要清理的「强限定平台」同类内容。
- **违反双源同步约定**：与 `templates/BUG-001`（closed）同属一个**重复模式**（「仓库根 `AGENTS.md` 已改、`templates-data/agents-md/*` 未同步」）。
- **生成副本**：`src/core/template-loader.ts:2798`（en）/ `:3251`（zh）`AGENTS_MD_TEMPLATES` 生成段随 `npm run build` 复制该句 → 修复须**改权威源 + 重新 build**（**禁手改生成段**）。
- **功能影响：无**（纯模板文本，无路径解析或运行时行为变更）；不影响流水线推进，故为**非阻塞**。

### 建议修复方向（供 openfeel-schemer，不由测试官实施）

1. 修改 `src/core/templates-data/agents-md/zh-CN.md:112` 与 `en.md:112`，套用 op-003 对仓库根 `AGENTS.md:122` 的措辞——先给无平台限定的定位（「全局 agents 目录 / the global agents directory」），再以括号保留并标注精确落点（"deployed to the global agents directory (opencode adapter: `~/.config/opencode/agents/*.md`)"）。**opencode 硬编码全局绝对路径不得再以「框架部署目标」口吻呈现**。
2. `npm run build` 重生成 `template-loader.ts` 生成段与 `.opencode/` 自举实例；跑 `npm test`（40 文件 / 659 用例）并做 `npm run build` 后 `git status` 零 diff 复核。
3. 同批一并复核 `templates/BUG-001` 遗留的「双源同步」检查清单，避免第三次同类遗漏。

### 关联观察（低优先级，非本 Bug 断言）

- `.openfeel/manual/core/setup.md:30-32` 部署落点表（`~/.config/opencode/AGENTS.md` / `agents/` / `skills/`）未逐行标注「opencode 适配器」（`:33` 配置行已标注）。该文档为内部模块手册、上下文即 opencode 适配器部署，判定为**可接受残留**；若 schemer 一并处置可提升一致性。

> 沉淀：`kb/troubleshooting.md #多源文案同步陷阱`（本阶段新增）
