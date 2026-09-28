# v1.1.2-stage-47 执行自测报告 — 已登记缺陷集中清理

- **执行时间**：2026-09-29
- **执行 Agent**：openfeel-executor
- **阶段**：v1.1.2-stage-47（phase = exec_running）
- **交付**：op-001 ~ op-007 全部实现与自测（含 14 项测试翻转清单）

---

## 一、执行摘要

7 个 op 全部完成并自测通过；`config/BUG-002`（high）语义修复落地（`init` 不再覆盖已存在 `config.yaml`，并删除 stage-46 备份接入块）；`removeStage` 事务顺序、jsonc 备份失败 A/B 分流、BUG-003 来源修正、cli/archive/templates 缺陷、kb/计划文本残留全部收口。全量回归 **41 文件 / 693 用例全绿**（基线 685，+8），`lint i18n`（531 键一致）与 `lint kb`（0 过期引用）零错误，测试全程隔离 HOME/cwd，未触碰真实 `~/.openfeel/` 与仓库 `.openfeel/config.yaml`（三值仍 auto/enabled/true）。

---

## 二、前置校验结果

| 校验项 | 结果 | 说明 |
|--------|:--:|------|
| 方案完整性 | 通过 | `ops/deps.yaml` + op-001~007 均存在；各 op 含目标（变更目标）、改动点、自测清单、`- **阶段**：`、`- **最多重试**：`。注意：方案文件由 schemer 生成，采用「变更目标/精确改动点」语义字段（非字面 `## 目标`/`## 实施步骤`），等效可用；由 Feel 显式指令执行 |
| Phase 合法性 | 通过 | `openfeel flow current`：phase=`exec_running`、current=`v1.1.2-stage-47.op-001`、retry=0 |
| 流转合法性 | 通过 | `openfeel flow health --quick` → 「🎉 健康检查通过」（CLI 方式）；flow.json stage phase=exec_running 合法 |

---

## 三、逐 op 完成情况

### op-001 CLI 自描述边界与目录冲突 i18n（cli/BUG-001、cli/BUG-002）
- `src/commands/flow.ts` `phases` action：人类可读输出追加边界说明（运行时含内置 15 之外 phase 时）；`--json` 增 `advanceAccepted`（= `PIPELINE_PHASES` 内置 15，可编程消费）。
- `src/core/flow-manager.ts` 新增导出 `StageDirConflictError`（含 `stage`/`other`，message 文本保持原文）；`registerStage`/`addStage` 改抛该错误。
- 三入口命令层（`commands/{plan,flow,stage}.ts`）catch 分流：命中 → `common.stageDirConflictTmpl` 渲染（死键消除，3 处使用点）。
- i18n 新增 `flow.phases.customPhaseNote`（zh/en 成对）。
- **自测**：`test/commands/flow.test.ts` 由 5 → 8 用例，新增「自定义 gate → 边界提示 + advanceAccepted 长度 15/不含 gate」「无自定义 → 无提示」「en 下冲突 stderr 英文模板」；CLI 实测 `--json` 三键含 `advanceAccepted`=15。`flow-manager.test.ts:2447/:2461` 冲突 `toThrow(/阶段目录冲突/)` 不破（REV-005 行号更正已落）。

### op-002 存量数据鲁棒性（archive/BUG-001、REV-41 REV-008）
- `src/core/archive/merge.ts:85` 加 `Array.isArray(stage.deps) && …` 守卫（唯一读取点）。
- `save()` 入口加 `this.data.meta ??= { version:'1.0', project:'', updated:'', revision:0 }`（仅补整体缺失）。
- **自测**：新增「阶段缺 deps → 摘要『依赖阶段：无』不抛错」「缺 meta → save() 不抛 TypeError 且写回 meta」两用例通过。

### op-003 config 语义与来源（config/BUG-002 high、config/BUG-003）
- `init.ts` `configExisted===true` 分支**整段替换**为 `skipped.push('.openfeel/config.yaml (已存在，保留用户配置)')`；**删除** stage-46 的 config.yaml 备份接入块（`backupFileBeforeWrite`/`appendUpdateInfo('backed')`/`notifyBackupIfTTY`/`BackupError` catch）。**import 保留**（package.json 备份块仍使用，REV-004）。
- `commands/init.ts` 新增 skipped 用户可见输出块；i18n 新增 `init.skipped`（zh/en）。
- `config.ts` `writeDefaultConfig` 注释声明「调用方须先守卫，不无条件覆盖」。
- `flow-manager.ts` `buildCascadeConfig` 画像层：仅当 `getGlobalProfilePath()` 文件存在**且**原始 YAML 显式含 `preferences.auto_advance` 时填 `profileDefaults`，否则落 `builtin`；新增 `global-paths` import，移除未使用 `readProfile` import。
- `manual/core/backup.md:46/:68` 同步。
- **自测**：`init.test.ts:165` 改写（不覆盖 + 字节不变 + skipped + 无 backed）、`:191` 删除并改写为 package.json 备份失败用例；`flow-manager.test.ts:2786` 翻转（`profileDefaults.auto_advance` → `toBeUndefined()` + `effective` 空 + `resolveEffectiveConfig().auto_advance === {value:'disabled', source:'builtin'}`）。**端到端**：隔离 HOME 重跑 `init` → 输出「已跳过 - .openfeel/config.yaml (已存在，保留用户配置)」且文件哈希不变。验收命令：config.yaml 相关备份零残留、`backupFileBeforeWrite(pkgPath` 恰 1 处。

### op-004 部署事务顺序与失败一致性（REV-41 REV-009、REV-46 REV-011）
- `removeStage` 改为返回 `{ purgeTarget?: string }`、**不删目录**；命令层顺序 = `removeStage → save() → rmSync(purgeTarget)`；日志 `detail.purged` → `detail.purgeTarget`；`rmSync` import 从 flow-manager 移除（未再使用）。
- `setup.ts` / `update.ts` jsonc 备份 + 合并写 + `updateFileHash` 包入 `try/catch`，**仅捕获 `BackupError`** → `anomaly(backup_failed)` + `warn` + 跳过 jsonc 写、继续其余步骤；`migrate.ts` 保持 fail-fast（未改代码）。
- `manual/core/backup.md:67` 定稿 A/B 分流。
- **自测**：`flow-manager.test.ts:2636` 改写（返回 `purgeTarget` 且目录仍在 + 日志 `detail.purgeTarget`）；`commands/flow.test.ts` 新增「save() 失败 → 目录仍在、注册仍在」；`setup/update.test.ts` 各新增「jsonc 备份失败 → 跳过写 + anomaly + 继续」。`rg removeStage(` 生产唯一调用方 `commands/flow.ts:473`。

### op-005 平台描述泛化补漏（templates/BUG-002）
- `templates-data/agents-md/{zh-CN,en}.md:112` 套用 `AGENTS.md:122` 口径（「全局 agents 目录（opencode 适配器：…）」/ 英文对应）；`npm run build` 重生成 `template-loader.ts` 生成段（zh:3257/en:2804）+ `.opencode/` 自举实例。
- **自测**：`rg "agents/\*\.md"` 三处口径一致（均含 opencode 适配器标注）；build 幂等（二次 build 零 diff）；单源一致性校验 3/3 通过。

### op-006 文档与文本残留清理（REV-43 REV-003、lint kb）
- `.openfeel/kb/architecture.md:497` 退役 `core.md` 可解析路径改为历史语境（「历史 core.md（已退役；项目级与全局级各一份）」）。
- `.openfeel/plan/v1/v1.1.2/plan.md:438`、`.openfeel/plan/v1/stage-43/plan.md:16` 改引用「§3.1 权威清单」。
- **自测**：`openfeel lint kb` → 「✅ 未发现过期引用（共检查 178 个引用）」；`rg "四处一致|三处同步"` 仅余 v1.1.2/plan.md:24 对照说明（计划明确不改）。

### op-007 测试与全量回归
- 统一 `npm run build`（含 op-005 传播，幂等）+ 全量 `npm test` + 双 lint。
- 翻转清单 F1~F14 逐项落实（F3 改写为 package.json 备份失败注入；F5 经实测为真实 profile 文件、无需翻转；F6 新识别已改）。
- **隔离硬要求**：测试 mock homedir / spy cwd；执行前后仓库 `.openfeel/config.yaml` 三值恒为 auto/enabled/true；无 `.openfeel/config.yaml`/`backup` 越界写入。

---

## 四、验收命令与结果

| 验收项 | 命令 | 结果 |
|--------|------|:--:|
| op-001 JSON 契约 | `node bin/openfeel.js flow phases --json` | keys=phases,transitions,advanceAccepted；长度 15 ✅ |
| op-001 死键消除 | `rg "instanceof StageDirConflictError" src/commands` | 3 命中 ✅ |
| op-003 备份残留 | `rg "backupFileBeforeWrite\(pkgPath" src/core/init.ts` | 恰 1 处；config.yaml 相关零残留 ✅ |
| op-003 端到端 | 隔离 HOME 重跑 init | 输出「已存在，保留用户配置」+ 哈希不变 ✅ |
| op-006 lint kb | `node bin/openfeel.js lint kb` | 未发现过期引用（178 引用） ✅ |
| op-007 全量 | `npm run build && npm test` | 41 文件 / 693 用例全绿 ✅ |
| op-007 门禁 | `lint i18n` / `lint kb` | 531 键一致 / 0 过期引用 ✅ |
| 隔离核验 | `git status --porcelain \| rg "config\.yaml\|backup"` | 空（未越界） ✅ |

---

## 五、产出文件

**源码**：`src/commands/flow.ts`、`src/commands/plan.ts`、`src/commands/stage.ts`、`src/commands/init.ts`、`src/core/flow-manager.ts`、`src/core/archive/merge.ts`、`src/core/init.ts`、`src/core/config.ts`、`src/core/setup.ts`、`src/core/update.ts`、`src/core/i18n-data/{zh-CN,en}.ts`、`src/core/templates-data/agents-md/{zh-CN,en}.md`、`src/core/template-loader.ts`（生成段，build 重生成）

**测试**：`test/core/{init,flow-manager,config,archive/merge,setup,update}.test.ts`、`test/commands/flow.test.ts`

**文档/工作区**：`.openfeel/manual/core/backup.md`、`.openfeel/kb/architecture.md`、`.openfeel/plan/v1/v1.1.2/plan.md`、`.openfeel/plan/v1/stage-43/plan.md`、`.openfeel/plan/v1/stage-47/ops/op-001.md`（REV-005 行号）、Bug/REV 条目状态与处理记录

---

## 六、Bug / REV 处置清单

| 编号 | 处置 | 状态 |
|------|------|------|
| cli/BUG-001 | op-001 方案 B 修复 | resolved（待验收关闭） |
| cli/BUG-002 | op-001 结构化错误 + i18n 分流 | resolved（待验收关闭） |
| archive/BUG-001 | op-002 最小修复 | resolved（待验收关闭） |
| config/BUG-002（high） | op-003 语义修复 + 删备份接入块 | resolved（待 feel-tester 验收关闭） |
| config/BUG-003 | op-003 画像层显式性守卫 | resolved（待验收关闭） |
| templates/BUG-002 | op-005 权威源泛化 + build | resolved（待验收关闭） |
| config/BUG-001 | 核实缺陷已不存在（`get-lang`/`set-lang`/`list-projects`） | closed（本阶段不改代码） |
| REV-41 REV-008 | op-002 save() meta 守卫 | resolved |
| REV-41 REV-009 | op-004 事务顺序 | resolved |
| REV-43 REV-003 | op-006 文本残留清扫 | resolved |
| REV-46 REV-011 | op-004 混合裁定（A/B） | resolved |
| REV-47 REV-005 | op-001 行号更正（随执行消化） | resolved |

---

## 七、偏差记录

1. **【方案事实不符·已按代码事实修正】op-003 F4 的 `effective.auto_advance` 断言**：方案/REV-003② 称「`effective.auto_advance` 仍 `'disabled'`」，但 `buildCascadeConfig` 的 `effective` 是 `{...profileDefaults,...configDefaults,...statusOverrides}` 的**显式声明值合并**（无 builtin 回填）。BUG-003 修复后无画像文件 → 三层皆无该键 → `effective.auto_advance` 实为 `undefined`（非 `'disabled'`）。已按代码事实将断言写为 `toBeUndefined()`，并保留 `resolveEffectiveConfig().auto_advance === {value:'disabled', source:'builtin'}`（该路径经 `DEFAULT_CONFIG` 回填，方案此项正确）。属计划对 `effective` 构成的理解偏差，**不改变 BUG-003 修复目标**；已如实登记，建议后续阶段在计划中澄清 `effective`（声明值合并）与 `resolveEffectiveConfig`（builtin 回填）的区别。
2. **【超范围·依任务关键要求】新增 `init.skipped` i18n 键与命令层输出块**：op-003 方案 §i18n 称「无 i18n 键变更」（理由：skipped 为内部字符串），但任务关键要求 1 明确「命令层须将 `.openfeel/config.yaml` 的跳过作为**用户可见提示**输出」，且 op-003 验收标准含「输出含『已存在，保留用户配置』的 skipped 提示」。原命令层对 `initProject` 路径未输出 skipped → 为闭合该要求，新增 `init.skipped` 键（zh/en 对称）与输出块。属依用户指令（优先级最高）的必要补充。
3. **【无跳步违规】** 未发生跳过前置校验或方案步骤的违规；所有 op 均先完整 read 方案再执行。
4. **REV-004 验收命令措辞**：`rg "backupFileBeforeWrite" | rg -v pkgPath` 会命中 import 行（:26，import 须保留）——已以精确断言替代：`rg "backupFileBeforeWrite\(" | rg -v pkgPath` 零命中 + `backupFileBeforeWrite\(pkgPath` 恰 1 处。

---

## 八、遗留与移交

- **待审查**：请 Feel 安排 openfeel-reviewer 对 op-001~007 代码改动进行审查（本报告与各 op 方案为审查输入）。
- **待测试官验收关闭**：上表 resolved 的 6 个 Bug（含 config/BUG-002）由 openfeel-feel-tester 验收后关闭；config/BUG-001 已按用户裁定 closed（如需运行时复核可在隔离 HOME 下补验 `config set-lang`）。
- **归属他处（不在本阶段）**：`.openfeel/dev/current.md` 陈旧、`plan/index.md` 断档、`day_index.md`/`log.md` 撞号 → 归档官；REV-44 REV-002/003 → stage-43/归档官；`config/BUG-002` 顺带核验的 `profile.yaml` 同类风险（非法 YAML 覆盖 / 嵌套扩展字段剥离）未修，留观察。
- **版本号**：本阶段未做版本号变更（归 stage-43）。
- **Commit**：见下方 git 提交记录。
