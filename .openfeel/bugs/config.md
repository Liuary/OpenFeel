# config 模块 Bug 归档

> 来源阶段：`v1.1.2-stage-42`（配置口径与流水线状态正确性，实现 commit `6fffda9` ＋ `bed8493`）；BUG-001 为 v0.4.4 时期遗留登记；BUG-002 于 `v1.1.2-stage-46`（commit `d5556a4`）追加**缓解记录**，并于 `v1.1.2-stage-47`（commit `2fb38fa`）**语义修复并关闭**；BUG-004 于 `v1.1.2-stage-47` 验收新登记
> 登记人：openfeel-feel-tester ｜ 登记时间：2026-07-15（BUG-001）/ 2026-09-29（BUG-002、BUG-003、BUG-002 缓解记录）｜ 私域详细报告：`.openfeel/users/Liuary/bugs/config/`

---

## BUG-001：`config set lang` 参数解析异常，功能完全不可用

- **优先级**：high ｜ **阻塞**：否（历史遗留，现有替代路径）｜ **状态**：closed（2026-09-29，v1.1.2-stage-47 端到端复核确认缺陷已不存在）

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

- **优先级**：high ｜ **阻塞**：是（数据丢失）｜ **状态**：**closed**（v1.1.2-stage-47 `op-003` 语义修复 + 测试官隔离端到端验收通过）

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

### 关闭记录（v1.1.2-stage-47，commit `2fb38fa`）——语义修复，关闭标准达成

| 项 | 内容 |
|----|------|
| 修复 | `src/core/init.ts` 的 `initWorkspaceCore`：`configExisted === true` 分支**整段替换**为 `skipped.push('.openfeel/config.yaml (已存在，保留用户配置)')`，**不再调用 `writeDefaultConfig`**；并**删除** stage-46 的 config.yaml 备份接入块（无备份 IO、无 `backed` 条目）。`src/commands/init.ts` 新增 `init.skipped` 用户可见提示块（zh/en 对称）。`writeDefaultConfig` 增契约注释「调用方须先守卫」。 |
| 验收（测试官，隔离 HOME + 临时项目） | 用户改值 `config.yaml`（hash `06BF03A6…`，含自定义键）经 `init --workspace-only` 与全量 `init` **两次后哈希均不变**、三值仍 `auto/enabled/true`；输出含「已跳过 - .openfeel/config.yaml (已存在，保留用户配置)」；`update_infos.md` **零 config.yaml `backed` 条目**、备份目录无 config.yaml；`package.json` 备份块仍正常（生成备份 + `来源: init`）。全量 41 文件 / 693 用例全绿。 |
| 结论 | **关闭**（数据丢失根因消除：`init` 对已存在 `config.yaml` 不再任何形式的覆盖）。 |
| **防再犯** | ① **策略按资产归属二分**（用户可编辑的项目配置 → 不覆盖；框架为唯一权威源的部署物 → 备份后覆盖）——「备份后覆盖」是覆盖的前置，改「不覆盖」须**同批删除**其备份接入点（否则产生误导性 `backed` 条目）；② **不覆盖必须给用户可见理由**（`InitResult.skipped` → 命令层 `init.skipped` 提示），禁止静默跳过；③ **守卫责任上移到调用点**并在函数注释中写死契约（`writeDefaultConfig`「整体覆盖，调用方须先自行守卫」）；④ 回归守卫：`test/core/init.test.ts` 改写的用例断言「字节不变 + skipped + 无 backed」，另以隔离 HOME 端到端复跑双命令。沉淀见 `kb/patterns.md #写策略按资产归属二分`。 |

> 残留（不在本 Bug 关闭范围，另见 BUG-004）：`profile.yaml` 同类无备份覆盖 + 解析失败静默回退（未修）。

---

## BUG-003：`config effective` 在「无 profile.yaml」时 `auto_advance` 来源标为 `profile.yaml` 而非 `builtin`

- **优先级**：medium ｜ **阻塞**：否（生效值正确）｜ **状态**：**closed**（v1.1.2-stage-47 `op-003` 修复 + 测试官隔离端到端验收通过）

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

### 关闭记录（v1.1.2-stage-47，commit `2fb38fa`）

修复：`buildCascadeConfig`（`flow-manager.ts`）的画像层改为**仅当 `profile.yaml` 文件真实存在且原始 YAML 显式声明 `preferences.auto_advance`** 时填 `profileDefaults`；文件不存在 / 解析失败 / 缺键 → 不填 → 来源落 `builtin`。测试官隔离端到端验收：无 profile 时 `auto_advance：disabled [来源: builtin]`；有 profile 显式值时仍 `enabled [来源: profile.yaml]`（画像层未误伤）。**关闭**。

**防再犯**：① **「来源标注」必须与「取值填充」同源同判据**——只要用某个来源的**兜底默认值**参与填充，来源判定就不能称该层为「生效来源」（区分「用户显式声明」与「内置降级值」是根因所在）；② 判据落到**原始数据**而非二次封装返回值（读原始 YAML 判断键是否存在，而非读已被兜底的 `readProfile()` 结果）；③ 测试断言**必须覆盖 `source`**，只断言 `value` 是本次漏网主因（原用例标题写「全无 builtin」却只查值）；④ 注意 `effective`（显式声明值浅合并，无 builtin 回填）与 `resolveEffectiveConfig()`（含 builtin 回填）语义不同，断言不可互换。沉淀见 `kb/patterns.md #配置级联解析模式`（已更新）。

---

## BUG-004：`test/core/workspace/identity.test.ts` 直写真实 `~/.openfeel/config.json`（测试隔离缺口）

- **优先级**：medium ｜ **阻塞**：否 ｜ **状态**：open（**归档官裁定归属：`v1.1.2-stage-43`**，发布前清零点，已由 Feel 安排纳入）｜ **归因**：预存量缺陷（不在 stage-47 7 Bug 范围；本阶段验收中新登记）

### 核心结论

`test/core/workspace/identity.test.ts` 的 `describe('recordProjectLang')` 块**未 mock `node:os`**，直接以真实 `homedir()` 读写用户全局配置 `~/.openfeel/config.json`（`identity.test.ts:8/:101/:111/:119`），以「保存原内容 → `afterEach` 回写恢复」的**伪隔离**代替单点 mock。故 `npm test` 每次全量运行都会**真实写入**该文件（mtime 被改写；内容靠回滚保持不变）。

**实测证据（v1.1.2-stage-47 验收）**：运行 `identity.test.ts` 前后真实 `config.json` mtime `06:07:59.899 → 06:08:05.621`（哈希不变 = 被恢复）；将 `USERPROFILE`/`HOME` 重定向后，全量 `npm test` 与单文件运行均**不再触碰**真实文件（mtime/哈希不变）→ 证明写路径使用未 mock 的 `os.homedir()`。二分定位：`test/core` → `workspace` → 本文件唯一命中。

**违反纪律**：与 stage-46 REV-011 / stage-42 REV-011 确立的「homedir 单点 mock，不得触碰真实 `~/.openfeel/`」硬要求相悖；stage-47 执行自测报告「测试全程隔离 HOME/cwd，未触碰真实 `~/.openfeel/`」与实测不符（该文件属既有隔离缺口，非本阶段引入）。

### 影响范围

- 数据风险：若进程在「写入」与「`afterEach` 恢复」之间被强杀（Ctrl+C/OOM/超时），用户全局配置将残留测试条目 `openfeel-identity-record-*`，或回滚为旧快照而丢失并发写入；多会话并发跑测试时可见瞬时脏读。
- 触发频率：`npm test` 全量运行必发。
- 功能影响：无（产品代码行为不变）。

### 建议修复方向

在 `identity.test.ts` 顶部加 `vi.mock('node:os', …)`（复用 `global-paths.ts` 的 N4 单点设计返回临时 home），与 `init/setup/update/backup` 等测试同构；顺带评估清理真实全局配置中的历史残留。

### 关联观察

真实 `~/.openfeel/config.json` 现存 **455 条** `…\Temp\openfeel-update-test-*` 死映射（项目已不存在）；本次验收运行**未新增**（前 455 / 后 455），推断为 `update.test.ts` 早期未加 mock 时遗留，建议后续单独评估清理。

### 归属裁定与处置方向（归档官）

- **裁定归属 `v1.1.2-stage-43`**（版本收口 / 发布前清零点），理由：本 Bug 属**既有隔离纪律缺口**（非 stage-47 引入，不影响本轮 7 Bug 验收结论），且 stage-47 定位为「已登记缺陷集中清理」，不应夹带「测试基建重构 + 真实用户数据清理」两类动作。
- **处置清单（建议 stage-43 执行）**：① `identity.test.ts` 顶部加 `vi.mock('node:os', …)`（复用 `global-paths.ts` 的 N4 单点设计返回临时 home），与 `init/setup/update/backup` 等测试同构；② 顺带补一条「测试隔离审计」硬要求：`npm test` 前后比对真实 `~/.openfeel/` 与 `~/.config/opencode/` 的 **mtime + hash**（只比 hash 会漏掉伪隔离）；③ 单独评估清理 455 条死映射（**须用户确认后再动真实用户数据**，勿在修测试时顺手改）。
- **防再犯**：保存/恢复**不是**隔离手段——依赖全局路径的测试一律 `vi.mock('node:os')`；该模式已沉淀为 `kb/troubleshooting.md #测试以「保存/恢复」代替 homedir mock：直写真实全局目录的伪隔离（隔离审计四步法）`，并在 `kb/patterns.md #全局路径测试的单点 mock 隔离模式` 追加反例。

> 沉淀建议：`kb/troubleshooting.md #测试以「保存/恢复」代替 homedir mock`（**已由归档官落地**，含隔离审计四步法）+ `kb/patterns.md #全局路径测试的单点 mock 隔离模式`（**已追加反例**）

---

## 汇总

| 编号 | 标题 | 优先级 | 阻塞 | 状态 | 来源阶段 |
|------|------|:--:|:--:|:--:|----------|
| [BUG-001](#bug-001config-set-lang-参数解析异常功能完全不可用) | `config set lang` 参数解析异常 | high | 否 | closed | v0.4.4（遗留） |
| [BUG-002](#bug-002openfeel-init-无条件整体覆盖已存在的-openfeelconfigyaml静默丢失用户配置) | `init` 无条件覆盖 `config.yaml` | high | 是 | **closed**（stage-47 语义修复验收通过） | v1.1.2-stage-42 |
| [BUG-003](#bug-003config-effective-在无-profileyaml-时-auto_advance-来源标为-profileyaml-而非-builtin) | `config effective` 无 profile 时来源标注偏差 | medium | 否 | **closed**（stage-47 验收通过） | v1.1.2-stage-42 |
| [BUG-004](#bug-004identitytestts-直写真实-openfeelconfigjson测试隔离缺口) | `identity.test.ts` 直写真实 `~/.openfeel/config.json`（测试隔离缺口） | medium | 否 | open（**归 `v1.1.2-stage-43`**） | v1.1.2-stage-47 |
