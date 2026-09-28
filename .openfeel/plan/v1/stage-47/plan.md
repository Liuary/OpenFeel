# v1.1.2-stage-47 — 已登记缺陷集中清理

> **版本**：v1.1.2 | **创建日期**：2026-09-29 | **Planner**：独立 openfeel-planner
> **定位**：集中清理 v1.1.2 各阶段在**正式测试/代码审查**中登记但未修的缺陷，使版本收口（stage-43）前无遗留脏点。**不新增功能、不做平台抽象层、不改版本号**。

---

## 一、背景与动机

v1.1.2 已完成 stage-41/42/44/45/46，测试与审查过程中登记了一批缺陷（`.openfeel/users/Liuary/bugs/` + `code_review/REV-v1.1.2-stage-4x.md`）。这些缺陷多为 low/medium 且「非阻塞」，但其中包含一条 **high（`config/BUG-002`：`init` 无条件覆盖用户 `config.yaml`）** 与一条 **medium（`templates/BUG-002`：stage-45 泛化遗漏）**。若不在发布前收口，将带着已知数据丢失风险与「文档-实现不一致」发布。

本阶段逐条裁定并修复，**不夹带无关重构**。

---

## 二、缺陷清单与逐条裁定

> 事实以原始 bug/REV 记录为准，行号已逐条实测复核（见各 op）。

| # | 编号 | 优先级 | 裁定 | 说明 |
|:--:|------|:--:|------|------|
| 1 | `cli/BUG-001` `flow phases` 与 `advance` 接受集合不一致 | low | **修（本阶段）** | 采纳**方案 B**：`flow phases` 增补「边界说明」+ `--json` 增 `advanceAccepted` 字段（= 内置 15 phase）。**不采纳 A**（把 `advance` 校验收敛到运行时 phases 会波及 `PipelinePhase` 类型与模糊修正，影响面大）；**不采纳 C**（load 告警属新增行为） |
| 2 | `cli/BUG-002` 目录冲突未走 i18n 键 + 死键 | low | **修（本阶段）** | 采纳**方案 B**：核心层抛结构化 `StageDirConflictError`（含 `stage`/`other`），命令层（`plan stage add`/`flow stage add`/`stage create`）按错误类型分流用 `common.stageDirConflictTmpl` 渲染，消除死键 |
| 3 | `archive/BUG-001` 缺 `deps` 抛 TypeError | low | **修（本阶段）** | **最小修复**（唯一读取点 `archive/merge.ts:85` 加 `Array.isArray` 守卫）；**不做**加载路径全量归一化（会改变写回内容，范围更大，留观察） |
| 4 | `config/BUG-003` 无 profile 时来源标为 `profile.yaml` | medium | **修（本阶段）** | `buildCascadeConfig` 仅当 `profile.yaml` **文件真实存在且原始 YAML 显式含** `preferences.auto_advance` 时填充 `profileDefaults` → 落到 `builtin`（对齐 stage-42 完成标准 1） |
| 5 | `templates/BUG-002` `agents-md:112` 未泛化 | medium | **修（本阶段）** | 改权威源 `agents-md/{zh-CN,en}.md:112` 套用 `AGENTS.md:122` 口径（无平台定位 + 括号标注 opencode 适配器）+ `npm run build` 重生成 |
| 6 | `config/BUG-002` `init` 无条件覆盖 `config.yaml` | **high** | **修（本阶段，收口语义修复）** | stage-46 仅缓解（备份 + 失败不覆盖）；本阶段**语义修复**：`init` 对**已存在**的 `config.yaml` **不再覆盖**（保留用户配置），并输出提示。理由：这是本版本真实事故根因（数据丢失），high 且属「发布前必须收口」；改动局部（一处调用点守卫）。**交互提示**：修复后 `config.yaml` 不再被覆盖 → stage-46 对其的备份接入点不再触发（无害，测试须同步翻转） |
| 7 | `REV-v1.1.2-stage-41` REV-008 `save()` 缺 `meta` 抛 TypeError | low | **修（本阶段）** | `save()` 入口加 `this.data.meta ??= {...}` 守卫 |
| 8 | `REV-v1.1.2-stage-41` REV-009 `--purge` 先于 `save` 的中间态 | low | **修（本阶段）** | 拆分为「内存注销 → `save()` 成功 → 再删目录」，消除事务顺序缺陷 |
| 9 | `REV-v1.1.2-stage-46` REV-011 jsonc 直写备份失败 fail-fast vs B3 | low | **修（本阶段，混合裁定）** | **setup/update → A**（补 `try/catch` → anomaly + 跳过 jsonc 写、其余继续，对齐 B3 幂等语义）；**migrate → B（保留 fail-fast，文档化）**（migrate 为可回滚事务，abort 更干净，REV-011 依据 2） |
| 10 | `REV-v1.1.2-stage-43` REV-003 「三处/四处」文本残留 2 处 | low | **修（本阶段）** | 版本级 `plan/v1/v1.1.2/plan.md:399` 与 `plan/v1/stage-43/plan.md:16` 统一改为引用 §3.1 权威清单 |
| 11 | `openfeel lint kb` 过期引用 `architecture.md:497` | low | **修（本阶段）** | 属「发布前脏点」；改 kb 写法指向全局 AGENTS.md。裁定归属**本阶段**（stage-43 为版本收口，不含 kb 内容修复） |
| 12 | `REV-v1.1.2-stage-44` REV-001/002/003 | low | **不修（归属已定）** | 实测：REV-001 已 **closed**；REV-002（stage-43 依赖文本）→ 归 **stage-43**（本阶段第 10 项已顺带覆盖依赖文本时点）；REV-003（需求文档 §三勘误 + 措辞）→ 归 **归档官**（`docs/phase-5` 归档处置） |
| 13 | `bugs/config/BUG-001` commander `config set lang` 解析异常 | high(旧) | **不修（已修复，状态未更新）** | 实测 `src/commands/config.ts` 已用 `get-lang`/`set-lang <lang>`/`list-projects`：缺陷已不存在 → 建议 **feel-tester 复核后 closed**，本阶段不改代码 |
| 14 | `.openfeel/dev/current.md` 陈旧 / `plan/index.md` 断档 / `day_index.md`·`log.md` 撞号重复表头 | low | **不修（归属归档官）** | 属 `.openfeel/` 工作区维护与团队进度记录，非代码缺陷 → 归 **archiver 归档阶段**，避免范围蔓延 |

**已关闭项（无需动作）**：`templates/BUG-001`（closed）、`kb/BUG-001`（closed；其对应的新残留见第 11 项）。

---

## 三、前置依赖与上下游衔接

- **hard 依赖 `v1.1.2-stage-46`**：本阶段修改 `src/core/init.ts`、`src/core/flow-manager.ts` 等 stage-46 刚触及的文件，且第 6 项与 stage-46 的备份接入点存在语义交互（须在 46 之后）。
- **下游 `v1.1.2-stage-43`**：本阶段完成后进入版本收口；本阶段**不做版本号变更**。
- **最终顺序**：`41 → 42 → 44 → 45 → 46 → 47 → 43`。
- **复用**：stage-35（原子写/文件锁）、stage-38（update_infos 三态）、stage-46（backup 基础设施）。

---

## 四、op 级任务清单

| op | 主题 | 具体改动点（文件:行号 → 改动） / 验收要点 |
|----|------|------------------------------------------|
| op-001 | CLI 自描述边界 + 冲突 i18n（#1/#2） | ① `src/commands/flow.ts:332-360`（`phases` action）：当 `getPipelinePhases()` 含 `PIPELINE_PHASES` 之外的名字时，追加一行边界说明（i18n `flow.phases.customPhaseNote`）；`--json` 输出增 `advanceAccepted: [...PIPELINE_PHASES]`（`:343-346`）；② 新增 `StageDirConflictError`（`src/core/flow-manager.ts`，导出，含 `stage`/`other` 字段），`registerStage`（`:737`）与 `addStage`（`:1162`）由抛 `Error(中文字符串)` 改为抛该错误；③ 命令层 catch 分流：`src/commands/plan.ts:44-52`、`src/commands/flow.ts`（`stage add` catch 块）、`src/commands/stage.ts`（`create` catch 块）命中 `StageDirConflictError` 时用 `t('common.stageDirConflictTmpl', {stage, other})` 渲染（其余错误沿用 `common.errorTmpl`）；④ i18n：新增 `flow.phases.customPhaseNote`（zh/en 对称）；**`common.stageDirConflictTmpl` 复用既有键**——经实测该键已定义于 `src/core/i18n-data/zh-CN.ts:32`（zh 值）与 `src/core/i18n-data/en.ts:31`（en 值 `Stage dir conflict: {stage} and {other} map to the same directory`），**REV-003③ 所称「en 为空串」经核实不成立**（`zh-CN.ts` 的 `en: ''` 是既有「单语分文件」模式的正常值，en 由 `en.ts` 提供）；落地时仍 `rg` 校验两文件该键均非空。**验收**：自定义 `pipeline.yaml` 加 `gate` 后 `flow phases` 输出含边界提示；`--json | ConvertFrom-Json` 含 `advanceAccepted` 15 项；en 下 `plan stage add v4.0.0-stage-04`（与 `v4-stage-04` 冲突）stderr 为英文；`rg stageDirConflictTmpl src/` 有使用点（死键消除），且 zh-CN.ts/en.ts 该键值均非空 |
| op-002 | 存量数据鲁棒性（#3/#7） | ① `src/core/archive/merge.ts:85` → `` `- **依赖阶段**：${Array.isArray(stage.deps) && stage.deps.length > 0 ? stage.deps.join(', ') : '无'}` ``；② `src/core/flow-manager.ts:339`（`save()` 内 `this.data.meta.updated = ...` 之前）加 `this.data.meta ??= { version: '1.0', project: '', updated: '', revision: 0 };`（与 `defaultFlowData` 字段一致）。**验收**：`openfeel archive v1.0.0-stage-04`（该阶段无 `deps`）exit 0 且摘要有「依赖阶段：无」；手工构造缺 `meta` 的 flow.json 后 `flow stage add <id>` 不再抛 TypeError（命令层正常完成或给出可读错误） |
| op-003 | config 语义与来源（#4/#6） | ① **BUG-002 语义修复（REV-002 补全）**：`src/core/init.ts:178-206`——`configExisted === true` 分支**整段替换**为 `skipped.push('.openfeel/config.yaml (已存在，保留用户配置)')`（复用 stage-46 已扩展的 `InitResult.skipped`），**删除 stage-46 引入的整段备份接入块**（`backupFileBeforeWrite` + `appendUpdateInfo('backed', …)` + `notifyBackupIfTTY` + `BackupError` catch 全部移除——语义修复后文件不再被覆盖，保留该块会产生**误导性 `backed` 条目**与无意义 IO，违反 stage-46 B3「备份是覆盖的前置」）；`configExisted === false` 分支保持（`writeDefaultConfig` + `created.push`）；**清理随之变为未使用的 import**（`backupFileBeforeWrite`/`notifyBackupIfTTY`/`BackupError`，`appendUpdateInfo` 若 op-004 仍需保留则不动）；同步更新 `writeDefaultConfig`（`src/core/config.ts:420-425`）注释，声明「调用方须守卫，不无条件覆盖」；② **BUG-003**：`src/core/flow-manager.ts:1575-1580` 改为——仅当 `existsSync(getGlobalProfilePath())` 为真**且**原始 YAML（`parseYaml(readFileSync(...))`）中 `preferences.auto_advance` **显式存在**时，才写 `profileDefaults['auto_advance']`（解析失败/缺键 → 不填，落 `builtin`）；③ 确认 `flow.status --verbose` 级联表与 `config effective` 同源一致；④ **联动文档同步（REV-002）**：`.openfeel/manual/core/backup.md:46` 备份范围表的 `config.yaml` 行改为「不再覆盖，无备份接入」、`:68` 的 BUG-002 段改记「语义修复已由 stage-47 落地，BUG-002 待 feel-tester 验收关闭」。**验收**：隔离 HOME 下 `init` **重跑**后 `config.yaml` 字节不变（哈希一致，三值保留）+ 输出含「已存在，保留用户配置」的 skipped 提示 + **不产生 `backed` 条目**；无 `profile.yaml` 时 `openfeel config effective` 输出 `auto_advance：disabled [来源: builtin]`；存在 profile 且显式设 `enabled` 时来源仍为 `profile.yaml`；`rg -n "backupFileBeforeWrite\|notifyBackupIfTTY" src/core/init.ts` 零命中 |
| op-004 | 部署事务顺序与失败一致性（#8/#9） | ① **REV-009**：`src/core/flow-manager.ts` `removeStage`（`:1258+`）改为**不执行目录删除**，改为返回 `{ purgeTarget?: string }`（或暴露 `getPurgeTarget(stageId)`）；`src/commands/flow.ts:460-464` 改为「`mgr.removeStage(...)` → `mgr.save()` → 成功后 `rmSync(purgeTarget)`」；② **REV-011**：`src/core/setup.ts`（jsonc 备份段，`:60-74` 附近）与 `src/core/update.ts`（jsonc 备份段，`:1488-1503` 附近）为 `backupFileBeforeWrite` 补 `try/catch` → 命中 `BackupError` 时 `appendUpdateInfo('anomaly', {…, note:'backup_failed'})` + `console.warn` + **跳过本次 jsonc 写入、继续其余步骤**（对齐 B3）；`src/core/migrate.ts`（`:512-524`）**保持 fail-fast**（不改代码），在 `.openfeel/manual/core/backup.md` 记录「migrate 事务语义下有意 fail-fast」。**验收**：`--purge` 场景注入 `save()` 失败后目录仍在、`flow.json` 注册仍在（无中间态）；setup/update 注入 jsonc 备份失败后命令继续且 `update_infos.md` 出现 `backup_failed` 异常条目 |
| op-005 | 平台描述泛化补漏（#5） | `src/core/templates-data/agents-md/zh-CN.md:112` 与 `en.md:112`：套用 `AGENTS.md:122` 口径——「9 个 agent 内联 `permission:` 白名单（含 `external_directory: "allow"`），随 `openfeel setup` 部署到**全局 agents 目录**（opencode 适配器：`~/.config/opencode/agents/*.md`）」/ 英文对应；`npm run build` 重生成 `template-loader.ts` 生成段（`:2798` en / `:3251` zh 附近）与 `.opencode/` 自举实例。**验收**：`rg -n "agents/\*\.md" src/core/templates-data/agents-md AGENTS.md` 三处口径一致（均含「opencode 适配器」标注）；`npm run build` 幂等（build 后零 diff）；`npm run build` 一致性校验通过 |
| op-006 | 文档/文本残留清理（#10/#11） | ① `.openfeel/kb/architecture.md:497`：将 `| 约束载体 | core.md（项目 `.opencode/instructions/core.md` + 全局 `~/.config/opencode/openfeel/core.md`） | …` 行改为**不触发 lint 过期引用**的写法（去掉已退役可解析路径，改为「历史 core.md（已退役）」历史语境描述，或拆分为不可解析的引号描述）；② 版本级 `.openfeel/plan/v1/v1.1.2/plan.md:438`（实测活残留行号＝`:438`，**REV-003① 更正**；原计划误写 `:399`，该行无匹配）「版本号四处一致为 `1.1.2`」→ 改引用「§3.1 权威清单」；③ `.openfeel/plan/v1/stage-43/plan.md:16`「版本号三处同步（+AGENTS.md）」→ 改引用「§3.1 权威清单」。**验收**：`node bin/openfeel.js lint kb` 输出「✅ 未发现过期引用（共检查 N 个引用）」；两处计划文本不再出现「三处/四处」陈旧表述 |
| op-007 | 测试与全量回归 | ① 新增/调整测试（见 §六 翻转清单）；② 所有测试遵守**隔离 HOME / 临时目录**（历史事故：`npm test` 曾覆写真 `config.yaml`）——用 `vi.mock('node:os')` / `USERPROFILE`·`HOME` 环境变量隔离，**不触碰真实 `~/.openfeel/` 与仓库 `.openfeel/config.yaml`**；③ `npm run build && npm test` 全绿（基线 41 文件 / 685 用例，本阶段新增后须 ≥ 该数）；④ `openfeel lint i18n` + `openfeel lint kb` 零错误。**验收**：全绿 + 双 lint 零错误 |

---

## 五、影响文件清单

| op | 新增 | 修改 |
|----|------|------|
| op-001 | — | `src/commands/{flow,plan,stage}.ts`、`src/core/flow-manager.ts`（错误类型）、`src/core/i18n-data/{zh-CN,en}.ts` |
| op-002 | — | `src/core/archive/merge.ts`、`src/core/flow-manager.ts` |
| op-003 | — | `src/core/init.ts`（删除 config.yaml 备份接入块 + 守卫 + 清理 import）、`src/core/config.ts`（注释）、`src/core/flow-manager.ts`、**`.openfeel/manual/core/backup.md`（`:46`/`:68` 同步，REV-002）** |
| op-004 | — | `src/core/flow-manager.ts`（`removeStage` 拆分）、`src/commands/flow.ts`、`src/core/{setup,update}.ts`、`.openfeel/manual/core/backup.md` |
| op-005 | `.opencode/agents-md` 生成段（重生成） | `src/core/templates-data/agents-md/{zh-CN,en}.md`、`src/core/template-loader.ts`（生成段） |
| op-006 | — | `.openfeel/kb/architecture.md`、`.openfeel/plan/v1/v1.1.2/plan.md`、`.openfeel/plan/v1/stage-43/plan.md` |
| op-007 | 新增测试用例 | `test/core/{flow-manager,init,config,archive/merge,template-loader,opencode-instance,setup,update}.test.ts`、`test/commands/{plan,config}.test.ts` 等 |

> 合计约 **13 个源码/模板文件 + ~3 个文档文件（含 `.openfeel/manual/core/backup.md`）+ ~8 个测试文件**。

---

## 六、测试策略

| 验证点 | op | 方式 |
|--------|:--:|------|
| `flow phases` 边界说明 + `--json.advanceAccepted` | 001 | 构造含 `gate` 的 `pipeline.yaml` fixture → 断言输出含边界提示、JSON 含 15 项 `advanceAccepted` |
| 冲突错误 i18n | 001 | `lang=en` fixture → 断言 `plan stage add`/`flow stage add`/`stage create` stderr 为英文模板；`rg` 断言 `stageDirConflictTmpl` 有引用 |
| archive 缺 `deps` | 002 | fixture flow.json 阶段无 `deps` → `archive` exit 0 + 「依赖阶段：无」 |
| `save()` 缺 `meta` | 002 | 构造无 `meta` 的 flow.json → 命令不抛 TypeError |
| `init` 不再覆盖 `config.yaml` | 003 | 隔离 HOME + 临时项目：写入用户自定义三值 → 重跑 `init` → 断言文件**字节不变**（哈希一致）+ skipped 提示 + **无 `backed` 条目**；`init.test.ts:191` 备份失败用例删除 |
| `config effective` 来源 `builtin` | 003 | 隔离 HOME（无 profile）+ 项目无 config.yaml → 断言 `auto_advance` source === `builtin`；有 profile 显式值时 source === `profile.yaml` |
| `--purge` 事务顺序 | 004 | 注入 `save()` 失败 → 断言目录未被删、注册仍在 |
| jsonc 备份失败对齐 | 004 | 注入 `backupFileBeforeWrite` 抛 `BackupError`（setup/update）→ 断言命令继续 + anomaly `backup_failed`；migrate 场景断言 fail-fast（中止） |
| `agents-md:112` 泛化 | 005 | `rg` 三处口径一致 + `npm run build` 幂等 |
| `lint kb` 零过期引用 | 006 | `node bin/openfeel.js lint kb` 断言「未发现过期引用」 |
| 全量回归 + 隔离 | 007 | `npm run build && npm test`；`lint i18n`/`lint kb` |

### 既有测试**翻转清单**（必须同步，否则回归失败）

| 文件 | 位置 | 翻转内容 | 原因 |
|------|------|----------|------|
| `test/core/init.test.ts` | `:165`（stage-46「已存在 config.yaml → 备份 + backed + **仍覆盖**」） | **改写**为「已存在 → **不覆盖**（文件字节不变、用户自定义键保留）+ **不产生 backed 条目** + `skipped` 含 `config.yaml`」 | #6 BUG-002 语义修复（stage-46 的「备份后仍覆盖」裁定被本阶段取代；备份接入块被删除） |
| `test/core/init.test.ts` | `:191`（stage-46/REV-010「备份失败 → 不覆盖 + anomaly」） | **删除**：`config.yaml` 备份接入块移除后该路径不再存在（如需保留失败语义，迁移到受管层文件用例） | 同上（REV-002） |
| `test/core/flow-manager.test.ts` | `:2783-2789`（用例标题「全无 builtin…（DEFAULT_PROFILE）」/ 断言 `:2786`） | **翻转**：`:2786` `expect(cascade.profileDefaults.auto_advance).toBeUndefined()`（原 `toBe('disabled')` 会失败）；`effective.auto_advance` 仍 `'disabled'`；**新增** `resolveEffectiveConfig().auto_advance.source === 'builtin'`；更新用例标题去掉「DEFAULT_PROFILE 兜底」语义 | #4 BUG-003（REV-003② 更正：非「仅增补」） |
| `test/commands/plan.test.ts` / flow 测试 | 冲突消息断言 | 若断言中文硬编码文案 → 改为模板渲染结果（en 下英文） | #2 |
| `test/core/archive/merge.test.ts` | deps 用例 | 新增「无 deps 字段」正向用例 | #3 |
| `test/core/{setup,update}.test.ts` | jsonc 备份失败 | 新增「跳过并继续」断言 | #9 A |
| `test/core/{template-loader,opencode-instance}.test.ts` | 生成段 | 随 build 重生成校验（通常无需改断言，需复核） | #5 |
| `test/core/config.test.ts` | `config effective` 用例 | 复核「全无 → `disabled`/`builtin`」断言（BUG-003 后应通过；如原断言依赖 `profileDefaults` 存在须同步） | #4 BUG-003 |

---

## 七、完成标准

1. 第 1~11 项缺陷全部修复且验收通过；第 12~14 项按裁定归属记录（不改代码）。
2. `openfeel flow phases` 在自定义 phase 下给出边界说明；`--json.advanceAccepted` 存在。
3. 目录冲突错误在 en 下为英文；`stageDirConflictTmpl` 死键消除。
4. `openfeel archive <无deps阶段>` 正常退出；`save()` 对缺 `meta` 的 flow.json 不抛 TypeError。
5. `openfeel init` 重跑**不再覆盖**用户 `config.yaml`（字节不变 + skipped 提示）；**stage-46 的 `config.yaml` 备份接入块已删除**（`rg backupFileBeforeWrite src/core/init.ts` 零命中，无误导性 `backed` 条目）；`manual/core/backup.md:46/:68` 已同步（REV-002）。
6. 无 `profile.yaml` 时 `config effective` 的 `auto_advance` 来源为 `builtin`。
7. `--purge` 在 `save()` 失败时不留中间态；setup/update 的 jsonc 备份失败走「跳过 + anomaly」，migrate 保持 fail-fast 且文档化。
8. `agents-md/{zh-CN,en}.md:112` 与 `AGENTS.md:122` 口径一致且经 build 传播。
9. `openfeel lint kb` 零过期引用；两处版本清单文本残留清除。
10. `npm run build && npm test` 全绿（≥ 41 文件 / 685 用例，含本阶段新增）；`openfeel lint i18n` + `openfeel lint kb` 零错误；测试全程隔离 HOME，未触碰真实 `~/.openfeel/` 与仓库 `.openfeel/config.yaml`。

---

## 八、风险与注意事项

| # | 风险 | 缓解 |
|---|------|------|
| R1 | BUG-002 语义修复后，`init` 不再把模板新字段带给存量项目 | 模板演进能力下降为**有意取舍**（用户可编辑文件优先保护）；在 manual/注释说明；如需补全可另立命令（不属本阶段） |
| R2 | BUG-002 修复与 stage-46 备份接入点交互（config.yaml 不再触发备份）导致既有测试失败 | §六 翻转清单显式列出 `init.test.ts:165/:191`；同步更新 |
| R3 | REV-011 混合裁定（setup/update=A，migrate=B）被审查认为不统一 | 计划中明确依据（幂等 vs 事务）；migrate fail-fast 文档化，可评审复核 |
| R4 | BUG-003 改为读原始 profile YAML，若解析失败口径变化 | 解析失败 → 不填 → 落 `builtin`（更贴近「无有效画像」），并保留 `readProfile` 既有降级行为不变 |
| R5 | REV-009 改动 `removeStage` 返回值契约，影响调用方 | 仅一处命令层调用（`commands/flow.ts`）+ 测试；同步更新 |
| R6 | 测试误触真实配置（历史事故） | op-007 强制隔离 HOME/临时目录（`vi.mock('node:os')` / env）；CI 与本地一致 |
| R7 | 改动范围蔓延到「无关重构」 | 严格限于 §二清单；第 14 项三类工作区陈旧内容明确归归档官 |
| R8 | `lint kb` 修复若属解析器边界（`|` 分隔）误报，改文档即掩盖真问题 | op-006 先判定是「真实过期引用」还是「解析边界」；若为边界则不谎报、记录并另立（本仓实测为 `core.md` 真退役路径，属真实过期） |

---

## 九、op 执行顺序与依赖

```
【串行链 A：flow-manager.ts 相关（同文件，单执行流顺序触碰）】
  op-001（CLI 边界 + StageDirConflictError，flow-manager.ts:737/:1162 + commands/flow.ts）
     → op-002（save() meta 守卫，flow-manager.ts:339）
     → op-003（级联 profile 层，flow-manager.ts:1575-1580 + init.ts + commands/flow.ts 不涉）
     → op-004（removeStage 拆分 flow-manager.ts:1258 + commands/flow.ts:460-464）

【并行组 B：与 A 无文件交集，可并行】
  op-005（templates-data/agents-md + npm run build 生成段）
  op-006（kb/architecture.md + 计划文本）

【收尾】
  op-007（测试 + 全量回归）
```

**建议顺序**：串行链 A（op-001 → op-002 → op-003 → op-004）∥ 并行组 B（op-005、op-006）→ op-007。

**并行/互斥依据（REV-001 更正）**：
- ❌ **原表述「op-001 / op-002 / op-005 / op-006 可并行」错误**：`op-001` 与 `op-002` **同改 `src/core/flow-manager.ts`**（`:737`/`:1162` vs `:339`）→ 必须**串行**；且 `op-001` 与 `op-004` 还同改 `src/commands/flow.ts`（`stage add` catch vs `remove` 顺序），故 op-001/002/003/004 全部纳入同一条串行链 A（均由单执行流顺序触碰 `flow-manager.ts`）。
- ✅ **op-005 与 op-006 与 A 无文件交集**，可并行：op-005 只改 `templates-data/agents-md/**` 并触发 `npm run build`（重生成 `template-loader.ts` 生成段与 `.opencode/`）；op-006 只改 `kb/architecture.md` 与两处计划文本——A 不触碰这两类文件。
- **build 时机**：op-005 的 `npm run build` 与 A 并行时可能编译到 A 的中间态；稳妥做法是 **op-005 改完权威源后先不立即 build，待链 A 完成后于 op-007 统一 `npm run build`**（或 op-005 独立 build 后再由 op-007 复核零 diff）。
- op-007 最后统一回归。

---

## 十、修订记录

| 时间 | 修订人 | 依据 | 修订内容 |
|------|--------|------|----------|
| 2026-09-29 | openfeel-planner | 用户需求「v1.1.2-stage-47 已登记缺陷集中清理」 | 新建本阶段：14 项缺陷逐条裁定（11 修 / 2 归属 / 1 已修复待关闭）；op-001~007；翻转清单；强隔离测试要求 |
| 2026-09-29 | openfeel-planner | REV-v1.1.2-stage-47 REV-001（blocking, medium） | **§九 并行组更正**：op-001/002 同改 `flow-manager.ts`（`:737`/`:1162` vs `:339`）→ 并入串行链 A（op-001→002→003→004）；并行组仅保留 op-005/op-006；补并行/互斥依据与 build 时机 |
| 2026-09-29 | openfeel-planner | REV-v1.1.2-stage-47 REV-002（blocking, high） | **op-003① 补全**：明确**删除 stage-46 的 `config.yaml` 备份接入块**（`init.ts:181-201` 整段替换为 `skipped.push`）+ 清理未使用 import + 联动 `.openfeel/manual/core/backup.md:46/:68` 同步；§五 影响文件清单补 manual；`init.test.ts:165/:191` 处置明确（改写/删除） |
| 2026-09-29 | openfeel-planner | REV-v1.1.2-stage-47 REV-003（low） | ① op-006② 行号更正 `:399` → `:438`；② 翻转清单改为**翻转** `flow-manager.test.ts:2786`（`profileDefaults.auto_advance` → `toBeUndefined()`）+ 新增 `source==='builtin'` + 更新用例标题；③ `stageDirConflictTmpl` **经核实 en 值已存在**（`en.ts:31`），REV-003③ 的「en 空串」不成立，改为落地时 `rg` 校验两文件非空 |
