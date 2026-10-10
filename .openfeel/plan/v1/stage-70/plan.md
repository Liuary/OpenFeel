# v1.1.6-stage-70 计划 — 共享 skills 中立化

- **阶段**：`v1.1.6-stage-70`
- **依赖**：**hard: `v1.1.6-stage-68`**（skills 已迁共享源 `templates-data/skills/`）
- **优先级**：P0（本版本「共享源」落地的实质内容）
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-10
- **定位**：把共享 skill 正文里**平台强限定**的内容改为**能力名叙述 + 平台分节**：opencode 与 Claude 各自小节。**opencode 小节逐字保留原文（零回归）**，Claude 小节新增。目标：同一份共享源同时可供两 harness 消费。
- **范围**：`src/core/templates-data/skills/**`（4 重写 + 3 轻改 + 6 个 Feel 措辞）；`test/core/templates.test.ts`（中立化断言）；`npm run build` 传播生成段。
- **边界**：**不改任何 opencode 小节原文**；不改 skill 的 `name`/`description` 触发语义（仅必要时扩充触发词）；不新增依赖；不接部署；不 `npm publish`/`git push`；不改 `flow.json`。

## KB 检索（`openfeel-check-kb`）

- 已加载。**高度相关条目**：
  - `kb/patterns.md #平台无关化「描述泛化」原则与边界：只改描述 + 适配器细节保留标注 + B 类清单` → **判定原则**：断言平台唯一→泛化；说明具体用法/路径/命令→保留并标注「opencode 适配器」；B 类保留清单（`opencode.jsonc`/`$schema`/opencode 字段/适配器目录本体及其操作指令/`supportedTools`/历史归档/fixture）。
  - `kb/patterns.md #部署语境 vs 本仓语境命令口径二分` → skill 中 `openfeel <cmd>`（部署语境）与 `node bin/openfeel.js`（本仓语境）措辞须区分。
  - `kb/patterns.md #CLI 用法 skill 化模式` → `openfeel-cli-usage` 权威源单文件、快照声明；改写须与 build 双注入同步。
  - `kb/troubleshooting.md #多源文案同步陷阱` → 分平台小节的措辞同步核对。
  - `kb/architecture.md #opencode agent 与 skill 合并语义` → skill 名须唯一（同名覆盖非确定）——中立化不改名。

---

## 一、背景与实测证据

| 事实 | 位置 | 结论 |
|------|------|------|
| 共享源 17 skill | `templates-data/skills/`（stage-68 迁入） | 本阶段在此源上改写 |
| opencode 特化 4 个（含平台配置/重启/权限口径） | `openfeel-agent-model-check`、`openfeel-model-config`、`openfeel-model-check`、`openfeel-cli-usage` | **重写 = 拆平台分节** |
| 轻改 3 个（工具名映射/全局规则文件措辞/skill 调用语法） | `openfeel-tool-usage`（工具名映射表）、`openfeel-workspace`（「全局 AGENTS.md」措辞）、`openfeel-check-kb`（skill 调用语法） | 小改 + 分节 |
| Feel 措辞 6 个 skill（共约 11 处） | 见 T3 | 首次「主会话（Feel）」、其后「主会话」 |
| `openfeel-model-check` 平台识别表含 **错误事实** `claude/claude.json` | 该 skill 正文 | Claude Code **无此文件** → 必须改为「全局约束 `~/.claude/CLAUDE.md`；本期由 stage-73 注入 `settings.json`」 |

> **统一约定**：正文以**能力名**叙述；平台差异以 `### opencode 适配器` / `### Claude Code 适配器` 两小节分列。**opencode 小节逐字保留原文**。`description` 触发词若含平台词，扩充为能力词（如「模型配置」）但**保留原触发词**。

---

## 二、变更点清单（编号 T）

### T1 — 4 个重写（拆平台分节）

| skill | 分节要点 |
|-------|----------|
| `openfeel-agent-model-check` | auth.json/opencode.jsonc/重启节 → 分节；**Claude 节**：无 auth.json，模型由 Claude 侧（`/model`、settings/env、网关）决定 |
| `openfeel-model-config` | 配置位置/优先级链/多模态规则 → 分节；**Claude 链**：项目 `.claude/agents` > 用户 `~/.claude/agents`，frontmatter `model` 优先于 inherit |
| `openfeel-model-check` | 平台识别表中 **`claude/claude.json` 是错误事实** → 改为「Claude Code 无平台配置文件；全局约束 `~/.claude/CLAUDE.md`；本期由 stage-73 注入 `settings.json`」；agents 目录扫描、角色回退表（feel 行）、`question`/Feel 措辞同步 |
| `openfeel-cli-usage` | 升级流程「重启 harness（opencode）」→ 分平台说明（`--tools`、Claude 重启/`/reload-skills` 语义）；权限模型节分节；快照声明保持「以 `--help` 为准」 |

### T2 — 3 个轻改

| skill | 改动 |
|-------|------|
| `openfeel-tool-usage` | 增「工具名映射表」（opencode 小写工具名 ↔ Claude 工具名 Read/Write/Edit/Bash/Glob/Grep/TodoWrite/Skill/Task） |
| `openfeel-workspace` | 「全局 AGENTS.md」→「全局规则文件（Claude: `~/.claude/CLAUDE.md`）」 |
| `openfeel-check-kb` | `skill("openfeel-x")` 调用语法分平台说明 |

### T3 — 6 个 Feel 措辞（共约 11 处）

- 首次出现「主会话（Feel）」、其后「主会话」；明确 subagent 不互调、主会话负责向用户确认。
- 涉及 skill（示例，实施时全仓 `rg` 穷举）：`openfeel-recover`、`openfeel-sync-status`、`openfeel-wizard`、`openfeel-update-stage-status`、`openfeel-get-stage-status`、`openfeel-get-bugs`。

### T4 — 中立化断言（opencode 关键串零回归）

| # | 用例 | 断言 |
|:-:|------|------|
| T4.1 | 4 重写 skill 双平台小节**并存** | 每个重写 skill 同时含 `### opencode 适配器` 与 `### Claude Code 适配器` |
| T4.2 | opencode 关键串仍在 | 原 opencode 小节内的关键串（如 `opencode.jsonc`、`auth.json`、`/reload-skills` 视 skill）仍存在（**零回归**） |
| T4.3 | 中性化检查 | `openfeel-model-check` 中 **不再**出现 `claude/claude.json`（纠错断言） |
| T4.4 | 工具名映射 | `openfeel-tool-usage` 含映射表且键集齐备 |

### T5 — 构建传播 + 门禁 + 报告

- `npm run build` 传播生成段（`SKILL_DEFINITIONS` / `OPENCODE_SKILL_DEFINITIONS`）；×2 幂等；`.opencode/**` 与冗余树不复活。
- `npm test` 全绿；`tsc` = 0；`lint i18n` = **761**（不新增键）；`lint kb` = 0。

---

## 三、op 划分与执行顺序（**2~3 op**）

| op | 主题 | 覆盖 | 关键产出 | 依赖 |
|:--:|------|------|----------|------|
| **op-001** | 4 个重写（拆平台分节）+ 纠错 | T1 | 4 skill 正文 | hard: stage-68 |
| **op-002** | 3 个轻改 + 6 个 Feel 措辞 | T2+T3 | 9 skill 措辞改动 | hard: op-001 |
| **op-003** | 中立化断言 + build 传播 + 门禁 + 报告 | T4+T5 | 测试；生成段；阶段报告 | hard: op-002 |

**顺序：op-001 → op-002 → op-003。**

**边界声明**：opencode 小节逐字保留；不改 skill 名；不新增依赖；不改 `flow.json`。

---

## 四、验收标准（阶段级）

1. **双平台并存**：4 重写 skill 均含两平台小节（T4.1）。
2. **零回归**：opencode 小节原文逐字保留，原关键串存在（T4.2）。
3. **纠错**：`openfeel-model-check` 不再出现 `claude/claude.json`（T4.3）。
4. **功能等价**：`name`/`description` 触发语义不退化；17 skill 全部仍可被 build 注入。
5. **门禁**：`npm test` 全绿 `0 skipped`；`tsc` = 0；`lint i18n` = 761；`lint kb` = 0；`npm run build` ×2 幂等。

---

## 五、风险与回滚

| # | 风险 | 影响 | 缓解 / 回滚 |
|:-:|------|------|-------------|
| R-1 | 中立化改写**改了** opencode 小节原文 → 用户既有内容变化 | **高** | 只增 Claude 小节 + 正文能力名叙述；**opencode 小节逐字保留**；T4.2 零回归断言 |
| R-新3 | 纠错 `claude/claude.json` 时误删其它平台事实 | 中 | 仅替换错误行；T4.3 定向断言 |
| R-新4 | `openfeel-cli-usage` 快照声明/双注入失同步 | 中 | 与 build 双注入同步；`lint kb`/build 门禁 |
| R-新5 | 工具名映射不全会误导 | 中 | T4.4 键集断言 |

**回滚**：`git revert <sha>`；纯 skill 正文改写，无数据迁移。

## 六、边界（不做）

1. **不改 opencode 小节原文**（B 类保留清单）。
2. 不改 skill 名（合并语义要求唯一）。
3. 不改 `agents-md` / Claude agent 模板（归 stage-69）。
4. 不新增依赖；不改 CI；不 `npm publish`/`git push`；不改 `flow.json`。

## 七、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-10 | openfeel-planner | 初稿：T1~T5；2~3 op；验收 5 条；锁定「双平台分节 + opencode 小节逐字零回归 + `claude/claude.json` 纠错」。 |
