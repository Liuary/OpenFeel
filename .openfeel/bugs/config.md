# config 模块 Bug 归档

> 来源阶段：`v1.1.2-stage-42`（配置口径与流水线状态正确性，实现 commit `6fffda9` ＋ `bed8493`）；BUG-001 为 v0.4.4 时期遗留登记；BUG-002 于 `v1.1.2-stage-46`（commit `d5556a4`）追加**缓解记录**（状态仍 open）
> 登记人：openfeel-feel-tester ｜ 登记时间：2026-07-15（BUG-001）/ 2026-09-29（BUG-002、BUG-003、BUG-002 缓解记录）｜ 私域详细报告：`.openfeel/users/Liuary/bugs/config/`

---

## BUG-001：`config set lang` 参数解析异常，功能完全不可用

- **优先级**：high ｜ **阻塞**：否（历史遗留，现有替代路径）｜ **状态**：open

### 核心结论

Commander 14.x 下 `.command('set lang <lang>')` 会把**无尖括号的路径词 `lang` 也当作必填参数**：`config set lang en` 被解析为 `config set <lang> <lang>`，action 只收到第一个参数 `"lang"` → 校验失败并报「无效的语言值 "lang"」。帮助输出即暴露该问题（`set <lang> <lang>`）。`get lang` / `list projects` 因 action 无参数，恰好仍能工作。

**根因**：子命令路径使用**空格分隔**（`get lang` / `set lang <lang>` / `list projects`），与 Commander 的参数语法冲突。

### 影响范围

- 触发条件：`config set lang <v>` 必然失败（`zh-CN` / `en` 均同）。
- 涉及文件：`src/commands/config.ts`（3 处 `.command()` 调用）。
- 现状：现行 CLI 已改用 `config get-lang` / `set-lang` / `list-projects`（连字符形式），本条目为登记在册的历史缺陷记录，保留以便追溯与排期。

### 建议修复方向

路径词全部改连字符分隔（`get-lang` / `set-lang <lang>` / `list-projects`）或使用 `.command()` 链式嵌套写法；同步更新方案文档 op-001.md 自测清单中的命令名。

---

## BUG-002：`openfeel init` 无条件整体覆盖已存在的 `.openfeel/config.yaml`，静默丢失用户配置

- **优先级**：high ｜ **阻塞**：是（数据丢失）｜ **状态**：open（**v1.1.2-stage-46 已落地「缓解」**；语义修复归 **stage-47**）

### 核心结论

`writeDefaultConfig`（`src/core/config.ts:420-425`）**无条件整体覆写** `config.yaml`，无 `existsSync` 判断、无备份、无提示。`initWorkspaceCore` 的 `existsSync` 仅用于 created/updated 分类，**不阻止覆盖**（`initDemo` 有守卫）；因此对已初始化项目执行 `openfeel init` / `init --workspace-only` / `init --demo` **每次必发**。

**触发链**：`commands/init.ts` → `initProject` / `initWorkspaceOnly` → `initWorkspaceCore` → `writeDefaultConfig`；`openfeel update` 仅在 `.openfeel/` 不存在时条件触发。

**证据链**：`git log --oneline -- .openfeel/config.yaml` 最后一次提交仅为 `meta.version` 变更（无「改回」提交）而三值却被还原为模板默认 `manual/disabled/false` → 指向代码覆写；隔离复现 hash `40836CC6…` → `0A3AB5B2…`，且输出仍显示 `~ .openfeel/config.yaml`（程序明知已存在仍覆盖）。

**放大路径（stage-42 实测）**：`test/commands/init.test.ts`「不传路径」用例未 mock `process.cwd()`，`npm test` 以仓库根为 cwd 执行 → 真实 `.openfeel/config.yaml` 被覆写（hash `5229455D…` → `23F76595…`），即**本阶段的验收命令本身破坏验收基线**。测试侧已由 stage-42 op-005（REV-011）修复并加反向守卫；**实现层根因未修**。

**同类风险**：`writeProfile`（`~/.config/openfeel/profile.yaml`）同为无备份整体覆盖；且 `readProfile` 解析失败静默回退 `DEFAULT_PROFILE`，随后的 `ensureProfileDefaults` 用默认值写回 → 非法 YAML 时画像整体丢失（实测 `name: TestUser → unknown`）；嵌套自定义键（`user`/`preferences` 子 Schema 非 passthrough）回写时被剥离。

### 影响范围

- 数据丢失：用户对 `config.yaml` 的任何修改（defaults 三值、models 节）在下次 `init` 时静默丢失。
- 触发频率：已初始化项目执行 `init` 必发；`init` 属部署/体验/测试常用命令。
- 涉及文件：`src/core/config.ts`（`writeDefaultConfig` / `writeProfile`）、`src/core/init.ts`（`initWorkspaceCore`）。

### 建议修复方向

覆写前走 `backupFileBeforeWrite`（`command='init'`）+ `backed` 条目，或「存在则备份 + 合并写入」；`readProfile` 解析失败不覆盖；子 Schema passthrough 或写回保留原始键。**已列为 stage-46 REV-001（high, blocking=true，op-003 接入备份 + op-005 补测试）**。

> 沉淀：`kb/troubleshooting.md #writeDefaultConfig 无条件覆盖`、`kb/patterns.md #测试 cwd 隔离模式`

### 缓解记录（v1.1.2-stage-46，commit `d5556a4`）

**本阶段仅落地「缓解」，不构成语义修复，状态保持 `open`。**

| 项 | 内容 |
|----|------|
| 缓解措施 | `init` 覆盖 `.openfeel/config.yaml` 前经 `backupFileBeforeWrite` 备份原件到 `~/.openfeel/backup/{ts}/project/<basename>-<hash8>/`；**备份失败则绝不再覆盖**（`BackupError` → `skipped.push` + `anomaly(note='backup_failed')`，`writeDefaultConfig` 不在 catch 之后）；项目 `package.json` 同构处理 |
| 提示链 | 全局状态文件 `~/.openfeel/update_infos.md` 新增 `backed` 类条目（含 `backupRel` + 来源命令）+ TTY 提示 + `feel.md`（zh/en）启动检查规则第三类（含备份文件存在性检查） |
| 已修复的部分 | 「静默」丢失变为「**可恢复 + 可发现**」——不再无备份覆盖；但**未取消「无条件覆盖」语义**（覆盖行为本身仍在，仅备份后仍覆盖） |
| 实测证据 | 隔离 HOME 端到端：① 已存在 `config.yaml`（含用户自定义键）→ 备份副本保留自定义键、目标仍被覆盖；② 备份失败（备份根构造为文件触发 ENOTDIR）→ `config.yaml` 内容 MUST-SURVIVE（未被覆盖）+ `anomaly（原因: backup_failed）` + 命令 exit 0；③ 集成断言 `test/core/init.test.ts:191`（stage-46/REV-010）纳入全量回归（41 文件 / 685 用例全绿） |
| 残留（**语义修复**，归 stage-47） | 期望行为：`init` 不再无条件整体覆盖，或覆盖前**必须**备份且显式提示/合并写入（保留用户 `defaults` 三值与 `models` 节的自定义）；`writeDefaultConfig`（`config.ts:420-425`）本身的覆盖语义未改 |
| 同类残留 | `writeProfile`（`~/.config/openfeel/profile.yaml`）同为无备份整体覆盖 + 解析失败静默回退 `DEFAULT_PROFILE` → 未纳入 stage-46 缓解范围（`writeProfile` 调用方不在部署链路，见 `.openfeel/manual/core/backup.md` 豁免节） |

> **归档纪律**：`BUG-002` 在 stage-46 归档时**不得**标注为已修复（`status` 保持 `open`）；关闭标准 = 「不再无条件覆盖」的语义修复落地并经测试官验收（stage-46 op-003「BUG-002 关闭标准」节）。

---

## BUG-003：`config effective` 在「无 profile.yaml」时 `auto_advance` 来源标为 `profile.yaml` 而非 `builtin`

- **优先级**：medium ｜ **阻塞**：否（生效值正确）｜ **状态**：open（待 openfeel-schemer 裁定）

### 核心结论

在「全局画像文件不存在 + 项目无 `config.yaml`」的环境下，`openfeel config effective` 输出：

```
execution_mode：manual   [来源: builtin]
auto_advance：disabled   [来源: profile.yaml]   ← 期望 builtin
test_enabled：false      [来源: builtin]
merge_mode：manual       [来源: builtin]
```

**根因**：`readProfile()`（`config.ts:181-206`）在画像文件不存在/为空/非法时返回 `DEFAULT_PROFILE`（其 `preferences.auto_advance` 恒为 `'disabled'`）；`buildCascadeConfig`（`flow-manager.ts:1570-1580`）**无条件**用它填充 `profileDefaults` → `profileDefaults.auto_advance` 恒存在 → `resolveEffectiveConfig` 的来源判定链 `status > config > profile > builtin` 中 `builtin` 分支对 `auto_advance` **永不命中**（其余三键因 `profileDefaults` 不含它们仍正常落到 `builtin`）。造成四键之间来源标注行为**不对称**，与 stage-42 完成标准 1「全无 → disabled/builtin」及 op-002 关键设计决策 3 不一致。

**旁证**：`test/core/flow-manager.test.ts:2783` 用例标题写「全无 builtin」，但断言只检查 `value`（`profileDefaults.auto_advance === 'disabled'` 与 `effective.auto_advance === 'disabled'`），**未断言 `source`** → 单测层面无法捕获，652 全绿不代表符合验收口径。

### 影响范围

- 触发频率：任何未创建 `~/.config/openfeel/profile.yaml` 的环境（全新机器 / 首次使用，`init` 不创建该文件）下必现。
- 功能影响：生效值正确、不改变自动推进决策；仅「生效来源」展示误导，削弱 #5「有效值 + 生效来源」的来源可信度。

### 建议修复方向

1. `buildCascadeConfig` 仅在**画像文件真实存在**时填充 `profileDefaults`（区分「用户显式设置」与「DEFAULT_PROFILE 兜底」），无文件时落到 `builtin`；
2. 或在来源判定中把「来自 `DEFAULT_PROFILE` 的隐式兜底」归为 `builtin`；
3. 若团队认定「来源标注为画像层（含内置默认画像）可接受」，则须**修订完成标准 1 与相关单测标题**以消除二次「文档 vs 实现」不一致。

> 沉淀：`kb/patterns.md #配置级联解析模式`

---

## 汇总

| 编号 | 标题 | 优先级 | 阻塞 | 状态 | 来源阶段 |
|------|------|:--:|:--:|:--:|----------|
| [BUG-001](#bug-001config-set-lang-参数解析异常功能完全不可用) | `config set lang` 参数解析异常 | high | 否 | open | v0.4.4（遗留） |
| [BUG-002](#bug-002openfeel-init-无条件整体覆盖已存在的-openfeelconfigyaml静默丢失用户配置) | `init` 无条件覆盖 `config.yaml` | high | 是 | open（stage-46 已缓解，语义修复归 stage-47） | v1.1.2-stage-42 |
| [BUG-003](#bug-003config-effective-在无-profileyaml-时-auto_advance-来源标为-profileyaml-而非-builtin) | `config effective` 无 profile 时来源标注偏差 | medium | 否 | open | v1.1.2-stage-42 |
