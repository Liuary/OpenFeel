# v1.1.2-stage-46 — 部署覆盖前自动备份

> **版本**：v1.1.2 | **创建日期**：2026-09-28 | **Planner**：独立 openfeel-planner
> **需求原文**：「如果部署时已有文件，则将原始文件备份，并在全局状态文件中提示 agent 检查」
> **定位**：为 `openfeel setup` / `init` / `update` 的**覆盖写入**增加「写前备份」，备份统一落全局根 `~/.openfeel/backup/{ts}/`，并在全局状态文件 `~/.openfeel/update_infos.md` 中登记「备份」类条目，供 Feel 会话启动检查。

---

## 一、需求映射与阶段目标

| 需求要素 | 目标 | 对应 op |
|----------|------|:--:|
| 「部署时已有文件 → 备份原始文件」 | 在「目标已存在且本次会被写入/覆盖」前，复制原件到全局备份根 | op-001、op-003 |
| 「在全局状态文件中提示 agent 检查」 | 扩展 `update_infos.md` 新增「备份」类条目 + 扩展 Feel 启动检查规则 | op-002、op-004 |
| 统一备份根 / 备份范围 | 全局根 `~/.openfeel/backup/{ts}/`；覆盖全部「已存在且将被写」的文件（不区分标记） | op-001、op-003 |
| 落模板权威源、双语 | 检查规则写入 `feel.md`（zh-CN/en）并 `npm run build` | op-004 |
| 验证 | 单元 + 接入 + 兼容 + 非 TTY | op-005 |

**范围界定**：仅**部署覆盖前的备份 + 提示**；**不含**还原/回滚命令（见 B8）。

---

## 二、前置依赖与上下游衔接

- **hard 依赖 `v1.1.2-stage-45`**：本阶段修改 `src/core/{init,setup,update}.ts`、`src/core/global-paths.ts` 的**逻辑**，而 stage-45 修改这些文件的**注释/文案**；串行（45 → 46）可让本阶段新增代码直接采用已泛化的平台中性表述，避免同文件写冲突。
- **soft 依赖 `v1.1.2-stage-44`**：无直接文件冲突（44 改 agents 模板），排在 45 之后自然满足。
- **下游**：`v1.1.2-stage-43`（版本收口需在最后）。
- **与既有机制关系**：复用 stage-35（原子写/文件锁）、stage-38（`update_infos.md` 三态）基础设施；**不替代** `migrate` 的项目内备份（见 B7）。

---

## 三、既有事实核实（文件:行号）

### 3.1 部署写入路径全景

| 链路 | 写入函数 | 文件与位置 | 覆盖既有？ |
|------|----------|------------|:--:|
| `openfeel setup` | `setupGlobalFramework` | `src/core/setup.ts:25-84`；① 全局 AGENTS.md `:40`；② 9 agent `:45-48`；③ 16 skill `:53-57`；④ 全局 opencode.jsonc `:60-74`（`atomicWriteFileSync` `:71`） | 是（幂等重写） |
| `openfeel update` | `updateProject` | `src/core/update.ts:1405+`；全局 AGENTS.md `:1463-1466`；agent/skill 经 `deployGlobalAsset`→`writeManagedFile`；全局 opencode.jsonc `:1488-1502`（写 `:1500`）；项目 opencode.jsonc **仅缺失时写** `:1506-1512` | 是 |
| `openfeel init` | `initProject`/`initWorkspaceCore` | `src/core/init.ts:242-298`；`initWorkspaceCore` `:166-235`；**⚠️ `.openfeel/config.yaml` 经 `writeDefaultConfig`（`src/core/config.ts:420-425`）无条件整体覆盖**，`init.ts:174-182`（`configExisted → updated.push`）印证；`package.json` 改写 `:291`；项目 opencode.jsonc **仅缺失时写** `:263-267` | **`.openfeel/config.yaml`：是（REV-001 更正）**；`package.json`：是 |
| `openfeel migrate` | `migrate` | **项目内备份**：`backupLegacy` `:199-259`，根 `BACKUP_DIR='.openfeel/backup'` `:88` + `manifest.json` `:258`；**全局重部署写**：`migrate.ts:487-501`（经 `deployGlobalAsset`：全局 AGENTS.md + agents + skills）+ `:512-524`（全局 opencode.jsonc 深度合并覆盖写 `:521`） | 项目内：既有备份机制（B7 不合并）；**全局写：是（REV-002 纳入）** |

> **更正记录（REV-001）**：原计划称「`.openfeel/**` 走 `writeTemplateIfMissing`，项目 `.openfeel` 不覆盖」，**不成立**。实测：`flow.json`（`FlowManager.initFlow:2705-2706` `existsSync` 守卫，不覆盖）与 `.info.json`（`ensureInfoJson` `identity.ts:105-123` 仅缺失或 lang 无效时补写；`writeLang` `init.ts:64-74` 改写 lang，属框架状态文件）**确不构成用户可编辑内容覆盖**；但 **`.openfeel/config.yaml` 是无条件整体覆盖**，属裁定 #3 漏网（详见 B9）。

**核心写入咽喉**：`writeManagedFile`（`src/core/update.ts:1299-1363`）——`deployGlobalAsset`（`:1371-1377`）的唯一实现，覆盖 stage-38 三态：
- 不存在 → `created`（写全文，`:1318-1321`）**无需备份**；
- 存在含标记 → `updated`（frontmatter 合并 + 区内替换，`:1330-1341`）**需备份**；
- 存在无标记但 hash 匹配 → `adopt`（覆盖为带标记内容，`:1346-1349`）**需备份**；
- 存在无标记 hash 不匹配 → `appended`（末尾追加受管区，`:1343-1357`）**需备份**（本次仍写入该文件）；
- `malformed` → 不写盘（`:1359-1362`）**无需备份**。

### 3.2 `update_infos.md` 现状（真实实现）

- 模块：`src/core/update-infos.ts`；路径 `getGlobalUpdateInfosPath()` = `~/.openfeel/update_infos.md`（`src/core/global-paths.ts:45-48`）。
- 条目类型 `UpdateInfoKind = 'appended' | 'anomaly'`（`:15`）；节标题 `SECTION_TITLES`（`:35-38`）。
- 记录结构（`:18-25`）：`kind / absolutePath / projectRoot / relativePath / timestamp / resolved`；路径二态（全局记绝对路径，项目记「项目根 + 相对路径」，`:20-23`）。
- 行格式（`:62`）：`- [ ] \`{displayPath}\`（{timestamp}）`；解析正则（`:71`）：`/^- \[([ x])\] \`(.+)\`（(.+)\）$/`。
- 写盘：加锁 `globalLockPath('update-infos')` + `atomicWriteFileSync`（`:120-146`）；`anomaly` 类按路径去重（`:122-135`）。
- 三类消费方：`appendUpdateInfo` / `resolveUpdateInfo` / `clearUpdateInfos`（`:119/150/170`）。
- **⚠️ 读侧节识别为硬编码（REV-003）**：`loadUpdateInfos`（`:87-113`）用 `line.startsWith('## 追加')` / `'## 异常'` 切换 `currentKind`（`:95-98`），**不读 `SECTION_TITLES`**。新增「## 备份」节若不改此处，「备份」条目会被误归为 `anomaly`（`currentKind` 从上一节残留）→ **op-002 必须同步修改 `:95-98`**。

### 3.3 `~/.openfeel/` 现有文件与路径解析

`src/core/global-paths.ts`：`getGlobalUpdateStatePath()` `:41-43`、`getGlobalUpdateInfosPath()` `:45-48`、`getGlobalLockPath(name)` `:56-58`、`getGlobalOpenfeelConfigPath()` `:61-63`。**尚无备份根路径函数** → op-001 新增。

### 3.4 Feel 启动检查规则位置

- **agent 模板**（权威源）：`src/core/templates-data/opencode/agents/zh-CN/feel.md:349-360`、`en/feel.md:349-360`（`## update_infos 检查修复` / `## update_infos Check & Repair`）——现只处理「追加」「异常」两类。
- 生成段：`src/core/template-loader.ts` 的 `AGENT_TEMPLATES`（随 build 重生成）。
- 项目根 `AGENTS.md`、`templates-data/agents-md/{zh-CN,en}.md`：**未含** update_infos 检查规则（grep 确认）→ B5 仅落 `feel.md`。

---

## 四、关键裁定 B1~B8

### B1 备份目录结构（保留层级 + 防同名冲突）

**裁定**：保留原文件路径层级，按「全局 / 项目」两类分区：

```
~/.openfeel/backup/{ts}/
├── manifest.json                          # source(绝对路径) → backupRel 映射 + 时间/命令/哈希
├── global/.config/opencode/AGENTS.md      # 全局资产：相对 HOME 的层级
├── global/.config/opencode/agents/feel.md
└── project/OpenFeel-3f2a1c9b/             # 项目资产：项目名 + 短哈希（防同名项目冲突）
    ├── .openfeel/config.yaml
    └── opencode.jsonc
```

- 依据：① 保留层级可直接人工还原；② 全局/项目分区 + 项目短哈希避免不同项目同名文件撞车；③ `manifest.json` 提供 source→backup 精确映射（可空，人工还原不依赖它）。
- **项目短哈希**：`sha256(projectPath).slice(0,8)`；项目名为 `basename(projectPath)`。
- **同名多次备份**：每次命令独立 `{ts}` 目录（见 B2），同目录内同一源路径**不会重复**（一次命令内每文件只备份一次）。

### B2 timestamp 语义与幂等

**裁定**：**每次命令一个 `{ts}` 目录**，格式 `yyyyMMddTHHmmssSSS`（本地时区）；进程内首次生成后缓存复用；目录已存在（同毫秒）则依次 `-2`、`-3` 后缀。

- 依据：① 一次命令 = 一个备份集，便于整体回看；② 毫秒精度 + 冲突后缀，避免覆盖既有备份（**绝不覆盖**）；③ 不复用旧目录，避免向历史备份集追加而破坏其完整性。
- 同一分钟内多次部署 → **新目录**（毫秒级区分），不做分钟级复用。
- **锁作用域（REV-005）**：`{ts}` 目录探测（撞名 check-then-act）与 `manifest.json` 读改写（read-modify-write）**必须全程处于同一 `withFileLock(globalLockPath('backup'))` 临界区内**——即 `beginBackupSet()` 的目录判定 + 每文件备份 + manifest 更新为单一临界区串行执行，消除跨进程 TOCTOU（并发 setup 时不得出现同 ts 目录双双 mkdir 或 manifest 互覆丢映射）。

### B3 备份时机与原子性

**裁定**：**写前备份**（读原件 → 经 `atomicWriteFileSync` 落备份 → `manifest` 记录 → 再写目标）；**备份失败 → 跳过该文件的写入**并记录一条异常（不静默覆盖），其余文件继续；备份写入走**全局锁 + 原子写**（stage-35 基础设施）。

- 依据：① 需求为「已有文件即备份」，必须发生在覆盖之前；② 「备份失败仍覆盖」会造成不可逆数据丢失，违背需求目的——宁可跳过该文件并提示；③ 复用 `atomicWriteFileSync`（`src/core/fs/atomic-write.ts`）与 `withFileLock(globalLockPath('backup'))`（`src/core/fs/file-lock.ts`），与 `update-infos` 写入同构。
- 触发判定：仅当目标**已存在**且本次**将实际改变内容**（`created`/`skipped` 不触发）时备份（见 §3.1）。
- **失败时调用方动作（REV-004）**：`writeManagedFile` 遇备份失败**返回既有动作值 `'skipped'`**（不新增第五值，避免破坏 `ManagedAction` 联合类型与各处 `switch`），并以异常条目区分成因；CLI 汇总经既有 `skipped` 数组呈现（完成标准显式断言）。
- **异常条目成因需可区分（REV-004）**：备份失败**不复用 anomaly 的自愈语义**（anomaly = 标记解析失败可自愈），须在 op-002/op-004 联动扩展（见 B4/B5）。

### B4 提示条目格式

**裁定**：`update_infos.md` **新增第三类「备份」**（`kind='backed'`），**不复用**「追加」类。

- 条目标题：`## 备份（部署覆盖前已存在 → 已备份，待检查）`。
- 行格式（向后兼容，尾部段可选）：
  `- [ ] \`{displayPath}\`（{timestamp}）（备份: \`{backupRel}\`，来源: {command}）`
- 字段：源路径（`displayPath`，沿用全局绝对路径 / 项目二元组）、**备份相对路径**（`backupRel`）、时间（`timestamp`）、**部署来源命令**（`command` ∈ **`setup` / `update` / `init` / `migrate`**，REV-002 扩充）。
- 字段风格统一（REV-006②）：`UpdateInfoEntry` 新增字段沿用既有「必填 + 显式 null」风格（`backupRel: string \| null`、`command: string \| null`），**不用可选标记 `?`**；旧条目解析时置 `null`。
- 解析须**容错且向后兼容**：旧「追加/异常」行（无尾部段）仍可解析（`backupRel`/`command` 为 `null`）。
- `- [ ]` 勾选语义：待 Agent/用户**检查备份是否成功且确无内容丢失**；确认后改 `- [x]`（沿用 `resolveUpdateInfo` 或 edit）。
- 依据：① 与既有两类语义不同（既非「已追加」也非「异常」），独立成类最清晰；② 不污染既有格式与去重逻辑；③ `command` 枚举须覆盖全部**会触发全局部署写**的调用方（`migrate` 亦经 `deployGlobalAsset`，REV-002）。

### B5 agent 检查规则扩展

**裁定**：扩展 `feel.md`（zh-CN/en 权威源 `:349-360`）的 update_infos 检查规则：① 新增「备份」类处理：读取备份条目 → **先检查 `backupRel` 指向的备份文件是否存在**（REV-006④）→ TTY 下提示用户「部署覆盖前已备份原文件至 `{backupRel}`，请检查」（**若备份文件缺失**则提示「备份已丢失，请谨慎检查当前文件」，闭合 B8 残余风险）→ 用户确认后勾选 `- [x]`；② **联动扩展「异常」类分支（REV-004）**：区分两种成因——「含 begin/end 标记 → 已自愈」沿用原逻辑；「备份失败（未含标记问题）」引导用户**重跑 `openfeel update` / `openfeel setup`**（而非等待自愈）。落**模板权威源**并 `npm run build` 重生成，**双语同步**。

- 依据：需求明确要求「提示 agent 检查」；规则现有载体即 `feel.md`，无需新增载体（项目 `AGENTS.md`/`agents-md` 无该规则，保持现状）。
- 依据（REV-004）：备份失败复用 anomaly 会造成「永远不会自愈 + 每次会话反复误提示 + anomaly 按路径去重吞掉后续恢复重试」——故必须区分成因，避免语义冲突。

### B6 非 TTY 行为

**裁定**：**备份条目始终写入** `update_infos.md`（文件操作，不随 TTY 变化）；**控制台提示仅 TTY 打印**，非 TTY 静默（沿用项目既有非 TTY 静默惯例，见 `feel.md` 冲突检测/update_infos 规则 `:357` 与 `update.ts:1515` 的 `isTTY` 守卫）。

- 依据：CI/CD 下控制台提示只污染日志；但审计记录必须落盘以便后续会话检查。

### B7 与 migrate 既有备份的统一

**裁定**：**项目内备份不合并**（保持 `migrate` 的 `.openfeel/backup/{ts}/` + `manifest.json` + rollback 不变）；**但 migrate 的全局部署写路径纳入本需求备份范围（REV-002）**。

- 依据（项目内不合并）：① 两者**作用域与语义不同**——migrate 项目内备份的是**将被删除/改写的项目文件**、服务于**可回滚的事务**（`rollbackMigration`，`migrate.ts:594+`）；本需求备份的是**部署覆盖前的原始文件**、服务于**事后检查**（无回滚）；② 强行统一会破坏 `migrate` 的 rollback 路径与既有测试/fixture（行为变更，风险高）；③ 两备份根（项目 `/.openfeel/backup` vs 全局 `~/.openfeel/backup`）**并存是正确的**，须在 manual 说明区别。
- 依据（全局写纳入）：① 裁定 #3 口径为「所有已存在且将被写的文件」；② `migrate.ts:487-501` 经 `deployGlobalAsset`（与 setup/update 同咽喉）+ `:512-524` 全局 jsonc 覆盖写，**同类覆盖写不得部分备份**；③ 具体接入：`command='migrate'`（B4 枚举）+ op-003 增补 migrate 全局 jsonc 写前备份。
- 若未来要统一项目内备份，应单独立项并评估 migrate 兼容（标注为「后续可选」）。

### B9 覆盖写路径全景与豁免（裁定 #3 落实清单，REV-001/002/006）

**裁定**：按裁定 #3「所有目标已存在且本次会被写入/覆盖的文件」逐路径落实，**仅对框架状态文件豁免**：

| 路径 | 是否覆盖写 | 处理 | 依据 |
|------|:--:|------|------|
| 全局 `~/.config/opencode/{AGENTS.md,agents/*.md,skills/*/SKILL.md}` | 是 | **纳入**（经 `writeManagedFile`，op-003①） | `update.ts:1299-1363` |
| 全局 `~/.config/opencode/opencode.jsonc` | 是 | **纳入**（setup/update/migrate 三处直写，op-003②） | `setup.ts:71`、`update.ts:1500`、`migrate.ts:521` |
| 项目 `.openfeel/config.yaml` | **是** | **纳入（REV-001 更正）**：`writeDefaultConfig`（`config.ts:420-425`）无条件覆盖；op-003③ 在 `init.ts:174-182` 覆盖前备份（`command='init'`） | `init.ts:175-182` |
| 项目 `package.json` | 是 | **纳入**（`init.ts:291` 改写 devDependencies） | op-003④ |
| 项目 `.openfeel/flow.json` | 否 | 不纳入（`initFlow:2705-2706` `existsSync` 守卫，不覆盖） | — |
| 项目 `.openfeel/.info.json` | 边缘 | **豁免**（`ensureInfoJson` `identity.ts:105-123` 仅缺失/lang 无效补写；`writeLang` `init.ts:64-74` 仅为设置 lang）。内容为框架管理（`{user,lang}`），用户不编辑；与 `update_state.json` 同类豁免 | REV-006① |
| `~/.openfeel/{update_state.json,update_infos.md}` | 是（框架状态） | **豁免**（框架生成、可重建；备份属过度设计） | 审查认可（§二） |
| 项目 `opencode.jsonc` | 否 | 不纳入（`init.ts:263-267`/`update.ts:1506-1512` 仅缺失时写） | — |

### B8 范围界定（是否含还原/回滚命令）

**裁定**：**不做** `openfeel backup list/restore`。

- 依据：① 备份已保留原路径层级 + `manifest.json`（source→backup 映射），**人工即可还原**；② 新增还原命令属新抽象与新命令面，AGENTS.md 约束 2 明确要求避免为单一功能引入新能力；③ 需求原文只要求「备份 + 提示」，未要求还原。故仅在提示中给出备份路径。

---

## 五、op 级任务清单

| op | 主题 | 具体改动点（文件:行号 → 改动） / 验收要点 |
|----|------|------------------------------------------|
| op-001 | 备份基础设施 | ① `src/core/global-paths.ts`（`getGlobalUpdateInfosPath` `:45-48` 附近）新增 `getGlobalBackupRootPath()` → `~/.openfeel/backup`（用 `homedir()`，命名对齐 `getGlobalSchemasDir` `:71-73` 先例）；② **新建** `src/core/backup.ts`：`backupFileBeforeWrite(absPath, opts:{command, projectPath?})` —— 判存（不存在→返回 null）、计算备份相对路径（B1：`global/<HOME 相对>` 或 `project/<basename>-<hash8>/<项目相对>`）、`mkdirSync(recursive)`、**原子写**备份副本、更新当次 `manifest.json`、返回 `{backupRel, ts}`；`beginBackupSet()` 生成/缓存 `{ts}`；备份失败**抛出可识别错误**（`BackupError`）供调用方跳过写；③ 复用 `atomicWriteFileSync`（`src/core/fs/atomic-write.ts`）+ `withFileLock`/`globalLockPath`（`src/core/fs/file-lock.ts`）；④ **锁作用域（REV-005）**：`{ts}` 目录探测/撞名判定 + 每文件备份 + `manifest.json` 读改写**全部在单一 `withFileLock(globalLockPath('backup'))` 临界区内串行**。**验收：单测覆盖「不存在不备份 / 已存在备份成功 / 备份失败可识别 / manifest 记录 / ts 目录不复用 / 并发两进程互不覆盖」** |
| op-002 | `update_infos` 扩展「备份」类 | `src/core/update-infos.ts`：`UpdateInfoKind` 增 `'backed'`（`:15`）；`SECTION_TITLES` 增「备份」节（`:35-38`）；`UpdateInfoEntry` 增 **`backupRel: string \| null` 与 `command: string \| null`（必填 + 显式 null，统一既有风格，REV-006②）**（`:18-25`）；`serialize` 输出尾部段（`:58-67`）；`parseLine` 正则改为**容错且向后兼容**（`:70-81`，旧行无尾部段仍可解析并置 `null`）；`FILE_HEADER` 增补说明（`:40-47`）；`appendUpdateInfo` 支持 `backed` 且**不去重**（区别于 anomaly，`:122-135`）；**⚠️ 同步修改读侧 `loadUpdateInfos` 的节识别（`:95-98`，REV-003）**——新增「## 备份」分支，或重构为按 `SECTION_TITLES` 值匹配消除双源。**验收：serialize→load 往返 `kind==='backed'` 正确（不被误分类为 anomaly）；旧格式文件仍可解析；`- [ ]`→`- [x]` 勾选可解析** |
| op-003 | 接入部署写入路径 | ① `src/core/update.ts` `writeManagedFile`（`:1299-1363`）：在 `updated`（`:1330`）/`adopt`（`:1346`）/`appended`（`:1351`）三条**会改写既有文件**的分支写入前调用 `backupFileBeforeWrite` 并 `appendUpdateInfo('backed', {…, backupRel, command})`；`created`/`skipped`/`malformed` 不备份；**备份失败 → `writeManagedFile` 返回 `'skipped'`（不新增动作值，REV-004）+ 记「备份失败」可区分异常 + 告警**；新增 `command` 形参并透传 `deployGlobalAsset`（`:1371-1377`）；② 全局 opencode.jsonc 写前备份（`command` 分别为 `setup`/`update`/`migrate`）：`src/core/setup.ts:60-74`、`src/core/update.ts:1488-1502`、**`src/core/migrate.ts:512-524`（REV-002 补入）**；③ **项目 `.openfeel/config.yaml`（REV-001 补入）**：`src/core/init.ts:174-182`（`writeDefaultConfig` 调用处，`configExisted` 为真时）在覆盖前调用 `backupFileBeforeWrite`（`command='init'`）；④ `src/core/init.ts:271-294` 的 `package.json` 改写前备份（`command='init'`）；⑤ `command` 由调用链显式传入：`setup`→`'setup'`、`update`→`'update'`、`init`→`'init'`、**`migrate`（`migrate.ts:487-501` 经 `deployGlobalAsset`）→`'migrate'`**。**验收：四链路（setup/update/init/migrate）覆盖写入均产生备份 + `backed` 条目；`created` 路径与「已存在不覆盖」（flow.json/项目 jsonc）不产生备份；备份失败→目标文件未写入 + 异常条目** |
| op-004 | agent 检查规则扩展（模板权威源 + build） | `src/core/templates-data/opencode/agents/{zh-CN,en}/feel.md:349-360`「update_infos 检查修复」节：① 新增「备份」类处理（**先查 `backupRel` 所指文件是否存在**，存在→提示检查；缺失→提示「备份已丢失，请谨慎检查当前文件」，REV-006④；确认后勾选）；② **扩展「异常」类分支（REV-004）**：区分「含标记可自愈」与「备份失败需重跑 `openfeel update` / `openfeel setup`」；③ 非 TTY 静默说明（B6）；`npm run build` 重生成 `template-loader.ts` 生成段与 `.opencode/agents/feel.md` 自举。**验收：zh/en 同步；build 通过；生成段含三类处理** |
| op-005 | 测试 | ① NEW `test/core/backup.test.ts`（op-001 验收项，含并发两进程互不覆盖）；② `test/core/update-infos.test.ts`：`backed` 类 serialize→load **往返 kind 正确**（REV-003 兜底）+ 旧格式兼容 + 勾选；③ `test/core/update.test.ts`/`test/core/setup.test.ts`：覆盖写产生备份、`created` 不备份、**备份失败→目标文件未写入 + 异常条目（REV-004 集成层）**；④ **`test/core/init.test.ts`：已存在 `config.yaml` → init 后产生备份 + `backed` 条目 + 用户自定义键存在于备份文件（REV-001）**；⑤ 非 TTY 静默断言；⑥ **N4 隔离声明（REV-006③）**：所有测试经 `homedir()` 单点 mock 隔离全局路径（`global-paths.ts:5` 惯例），**不触碰真实 `~/.openfeel/`**；⑦ `npm run build && npm test` 全绿。**验收：全绿** |

---

## 六、影响文件清单

| op | 新增 | 修改 |
|----|------|------|
| op-001 | `src/core/backup.ts`、`test/core/backup.test.ts` | `src/core/global-paths.ts` |
| op-002 | — | `src/core/update-infos.ts` |
| op-003 | — | `src/core/update.ts`、`src/core/setup.ts`、`src/core/init.ts`、**`src/core/migrate.ts`（全局 jsonc 写前备份，REV-002）**、**`src/core/config.ts`（`writeDefaultConfig` 备份接入，REV-001，若在 config 侧接入）** |
| op-004 | `.opencode/agents/feel.md`（重生成） | `src/core/templates-data/opencode/agents/{zh-CN,en}/feel.md`、`src/core/template-loader.ts`（生成段）、`.openfeel/manual/**`（说明备份与 migrate 差异） |
| op-005 | 新增测试用例 | `test/core/update-infos.test.ts`、`test/core/update.test.ts`、`test/core/setup.test.ts`、`test/core/init.test.ts`（config.yaml 备份）、`test/core/global-paths.test.ts`（新增 `getGlobalBackupRootPath` 断言） |

---

## 七、完成标准

1. `openfeel setup`/`update`/`init`/**`migrate`** 对**已存在且本次被写入**的目标文件（含**全局资产、全局 opencode.jsonc、项目 `.openfeel/config.yaml`、项目 `package.json`**，清单见 B9），写入前均生成备份至 `~/.openfeel/backup/{ts}/`（保留层级，B1）；`created`（新建）与「已存在但不覆盖」（`flow.json`、项目 `opencode.jsonc`）不产生备份。
2. 每次命令一个 `{ts}` 目录，**不覆盖**既有备份；`manifest.json` 记录 `source → backupRel + 时间 + 命令 + 哈希`；`{ts}` 生成与 manifest 读改写**全程在 backup 锁临界区内**（并发互不覆盖，REV-005）。
3. `update_infos.md` 新增「备份」类条目（含源路径、备份路径、时间、来源命令 ∈ `setup/update/init/migrate`，B4），**`loadUpdateInfos` 能正确识别「## 备份」节**（往返 `kind==='backed'`，REV-003），旧文件仍可解析。
4. `feel.md`（zh/en 权威源）检查规则扩展为三类（含 `backupRel` 存在性检查与「备份失败需重跑」分支），`npm run build` 后生成段与自举一致；非 TTY 静默（B6）。
5. 备份失败 → **目标文件未写入 + `writeManagedFile` 返回 `'skipped'` + 记可区分异常**（REV-004）；原子写 + 全局锁接入（B3）。
6. `migrate` 项目内备份**未改动**（B7 项目内不合并）；`migrate` 全局部署写**已纳入**（REV-002）；无 `backup restore` 命令（B8）。
7. `npm test` 全绿（含 integration 层「备份失败→未写入」与 init config.yaml 备份断言）；`openfeel lint i18n` / `lint kb` 零错误。

---

## 八、风险与注意事项

| # | 风险 | 缓解 |
|---|------|------|
| R1 | 备份累积（每次 update 均可能新增备份）膨胀 `~/.openfeel/backup` | 本阶段**不做**自动清理（避免过度设计）；在 manual 说明可手工清理；后续可单独立项做保留策略 |
| R2 | `update_infos.md` 格式变更致旧文件解析失败 | op-002 正则**向后兼容**（尾部段可选）+ 单测覆盖旧格式 |
| R3 | 备份失败仍写入 → 数据丢失 | B3：备份失败**跳过该文件写入**（`writeManagedFile` 返回 `'skipped'`）+ 记**可区分**异常（REV-004） |
| R4 | 项目短哈希碰撞 / 同名项目混淆 | `basename` + `sha256(projectPath)` 前 8 位；`manifest.json` 存绝对源路径 |
| R5 | 与 `migrate` 备份混淆（两套目录） | B7 明确区别 + manual 说明；项目内不合并，**全局写纳入** |
| R6 | 与 stage-45 同改 `init/setup/update.ts` 冲突 | **hard 串行 45 → 46** |
| R7 | 非 TTY 下提示缺失致用户不知情 | 条目始终落盘；TTY 才打印；下一次会话 Feel 检查提示 |
| R8 | 备份写入非原子/无锁致半写 | 复用 `atomicWriteFileSync` + `globalLockPath('backup')` |
| R9 | `.openfeel/config.yaml` 覆盖写漏网致用户基线丢失（REV-001） | op-003③ 在 `init.ts:174-182` 覆盖前备份；op-005④ 断言用户自定义键存在于备份 |
| R10 | migrate 全局写未备份致「同类覆盖写部分备份」（REV-002） | B7/B9 纳入 + op-003② 补 `migrate.ts:512-524` + `command='migrate'` |
| R11 | 「备份」条目被 `loadUpdateInfos` 误分类为 anomaly（REV-003） | op-002 同步改 `:95-98` 节识别 + 单测 serialize→load 往返 |
| R12 | 备份失败条目复用 anomaly 语义冲突（永不自愈/误提示/去重吞重试，REV-004） | B3+B5+op-004：失败走可区分异常 + feel.md 分支引导重跑；`writeManagedFile` 返回 `'skipped'` |
| R13 | `{ts}`/manifest 并发 TOCTOU（REV-005） | op-001④：单一 `withFileLock(globalLockPath('backup'))` 临界区 + 并发测试 |
| R14 | 用户误删备份文件后条目仍在（REV-006④） | op-004①：feel 检查 `backupRel` 存在性，缺失时提示谨慎 |

---

## 九、op 执行顺序与依赖

```
op-001（backup 基础设施 + 路径函数）
   │
   ├─→ op-002（update_infos 扩展「备份」类）
   └─→ op-003（四链路写入接入 setup/update/init/migrate，依赖 op-001 + op-002）
            │
            ├─→ op-004（feel 检查规则 + build）
            └─→ op-005（测试 + 回归）
```

**建议顺序**：op-001 → op-002 → op-003 → op-004 → op-005。

- op-001/op-002 为底座，可并行但 op-003 同时依赖二者。
- op-004 依赖 op-002 的条目格式定型。
- op-005 最后回归。

---

## 十、修订记录

| 时间 | 修订人 | 依据 | 修订内容 |
|------|--------|------|----------|
| 2026-09-28 | openfeel-planner | 用户新增需求「部署覆盖前自动备份 + 全局状态提示」 | 新建本阶段：B1~B8 裁定 + op-001~op-005；确定硬依赖 stage-45（同改 init/setup/update） |
| 2026-09-29 | openfeel-planner | REV-v1.1.2-stage-46 REV-001（blocking, high） | 更正 §3.1 `.openfeel/config.yaml` 覆盖写事实（`writeDefaultConfig` `config.ts:420-425` + `init.ts:174-182`）；新增 **B9 覆盖写路径全景与豁免**；op-003 增补 ③ config.yaml 备份接入；op-005 增补 ④ init 备份断言；完成标准 1/7 更新；风险 R9 |
| 2026-09-29 | openfeel-planner | REV-v1.1.2-stage-46 REV-002（blocking, medium） | **migrate 全局写纳入**：B4 `command` 枚举扩为 `setup/update/init/migrate`；B7 补 migrate 全局写裁定；op-003 ② 增补 `migrate.ts:512-524` + ⑤ `deployGlobalAsset` `command` 透传；§3.1 表格更新；风险 R10 |
| 2026-09-29 | openfeel-planner | REV-v1.1.2-stage-46 REV-003（blocking, medium） | op-002 增补读侧 `loadUpdateInfos:95-98` 节识别修改（或按 `SECTION_TITLES` 匹配消双源）；§3.2 增补遗漏说明；验收改「serialize→load 往返 kind 正确」；风险 R11 |
| 2026-09-29 | openfeel-planner | REV-v1.1.2-stage-46 REV-004（non-blocking, medium） | B3 明确失败返回 `'skipped'` + 可区分异常；B5+op-004 扩展 anomaly 分支（区分可自愈/需重跑）；op-005 ③ 补集成层断言；风险 R12 |
| 2026-09-29 | openfeel-planner | REV-v1.1.2-stage-46 REV-005（non-blocking, low） | B2/op-001④ 明确 `{ts}` 生成 + manifest 读改写全程在 backup 锁临界区；op-001/op-005 增并发断言；风险 R13 |
| 2026-09-29 | openfeel-planner | REV-v1.1.2-stage-46 REV-006（non-blocking, low） | B9 记录 `.info.json` 豁免理由；B4 字段风格统一为「必填 + null」；op-005⑥ N4 隔离声明；op-004① `backupRel` 存在性检查；风险 R14 |

> 三处既有裁定不变（#5 画像仅兜底 / #6 只修全量 done、不做 current 回退 / 技能源扁平单文件无 `{lang}`）。
