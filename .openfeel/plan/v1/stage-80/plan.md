# v1.2.0-stage-80 计划 — 归档消费点适配与存量迁移（本仓自举）

- **阶段**：`v1.2.0-stage-80`（主题二 · 归档拆分收官阶段）
- **依赖**：**hard: v1.2.0-stage-78, v1.2.0-stage-79**（引擎 + 命令面就绪后方可适配消费点并执行真实迁移）
- **优先级**：P0（对既有系统的**侵入面**——deps 校验（两处）/ health（写 + 读两侧）/ config 批量同步 / 恢复路径 + 本仓 78 阶段真实搬迁，回归风险最高）
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-11 ｜ **本轮修订**：2026-10-12（REV-80-001~008 全量落实）
- **行号基线**：本计划行号一律**双锚（符号名 + 行号）**，基线 commit **`fdfebc9`**（2026-10-12 实测复核）
- **定位**：把 stage-78/79 的归档能力**接入既有消费点并完成本仓自举迁移**——① 跨版本 stage deps 判定适配（**单一口径**：`plan stage add --deps` + `flow stage set --deps` 两处校验点 + health 读侧 `checkDanglingDeps`；裁定 Q）；② `flow health` 归档一致性检查（裁定 R）；③ `config set --sync-stages --stage` 已归档目标降级适配（REV-80-003 裁定①）；④ 恢复（checkpoint restore）与归档的关系落文案；⑤ **本仓 78 阶段一次性迁移**（9 个版本组；备份 + 判据门 + 回滚路径成文，裁定 S）；⑥ 端到端验证（归档后既有命令全绿 + flow.json 体积实测下降）。
- **范围**：`src/core/plan/path.ts`（新增判定 helper）、`src/commands/plan.ts`、`src/commands/flow.ts`、`src/commands/config.ts`、`src/core/flow-manager.ts`（`checkDanglingDeps` + `syncConfigFieldToStages` 最小追加）、`src/core/flow-archive/archive-health.ts`（新建）、`src/core/i18n-data/{zh-CN,en}.ts`、`test/{core,commands}` 对应 6 文件；**`.openfeel/flow.json` + `.openfeel/flow-archive/{v1.0.0..v1.1.7}.json`（迁移产物，经 CLI 归档命令生成——非手改）**。
- **边界**：**不做**自动归档（裁定 W）；**不改** phase 枚举 / 转移表；**不改**顶层 `openfeel archive`；**不归档** `requirements`（裁定 W）；不删除归档文件（无 unarchive）；不新增第三方依赖；不 `npm publish` / 不 `git push`；不直写 `flow.json`（迁移经 `flow archive` CLI 执行）；不改 checkpoint 保留策略（`CHECKPOINT_MAX_KEEP = 20`）；不新增写盘点。

## KB 检索（`openfeel-check-kb`）

- 已加载（2026-10-12 复核轮）。**高度相关条目**：
  - `kb/patterns.md #真实全局目录操作的安全程序：全量备份 + 判据门 + 回滚` → 本仓迁移四步：整文件备份（含 SHA256）→ 逐版本判据门（`--dry-run` 先行）→ 顺序执行 → 回滚路径预先成文。
  - `kb/patterns.md #「只报告型」与「修复型」命令的边界` → health 归档一致性检查**默认只报告**（warn，不改退出码）；不做自动修复命令（v1.2.0 范围外）。
  - `kb/troubleshooting.md #flow.json 内容增量核验必含 meta.revision/meta.updated` → 迁移前后核验须排除 `meta.revision` / `meta.updated` 再比对内容。
  - `kb/patterns.md #short name/full name stage 解析归一化` + `#阶段路径映射` → deps 判定经 `parseStageId`，与 stage-78 `versionOfStageId` 同源；**短名归一化产物（`path.ts:52-59` 恒为 `v1.0.0-*`）不得作为「已归档」判据**（REV-80-001 根因）。
  - `kb/patterns.md #status.md 缺失字段插入语义（锚点链 + 三态）与替换语义严格分离` → 新增导出**落点须核验互引方向**（禁造成循环依赖）——本计划 helper 落 `plan/path.ts` 的定向理由（REV-80-005）。
  - `kb/patterns.md #跨阶段「契约先行」协同` → 消费 stage-78/79 交付物；本阶段新增两契约登记 `deps.yaml downstream_contracts`（`isArchivedVersionOf` / `archiveHealthItems`）；禁第二套解析。
  - **无**「归档一致性 health 检查」「已归档版本显式命名操作的行为裁定」既有条目 → 归档时补沉 patterns。

---

## 一、背景与实测证据（大计划 §二 表 A 摘引 + 2026-10-12 复核）

> 行号双锚（**符号名 + 行号**）；基线 commit **`fdfebc9`**（除注明历史基线者）。

| 事实 | 位置（双锚） | 结论 |
|------|--------------|------|
| `plan stage add --deps` 校验 `deps ⊆ 已注册 stages`（未注册 → exit 1 零写盘） | `src/commands/plan.ts:90`（`const invalid = deps.filter(...)`；校验块 `:85-99`） | **适配点①**：deps **显式携带版本前缀** ∧ 版本 ∈ `meta.archived_versions` → 视为已满足；短名 / 未注册未归档 → 仍拒绝 |
| `flow stage set --deps` **同缺陷类第二校验点**（`known` 仅活跃集） | `src/commands/flow.ts:687`（`invalid` 过滤；`:688-691` exit 1 零写盘；目标阶段存在性 `:696`） | **适配点②**（REV-80-001 复核新增发现）：与①同判据、同 helper；不修则写侧口径分裂 |
| `plan stage add --deps` 负例基线（短名 typo） | `test/commands/plan.test.ts:321-322`（`--deps stage-99` 期望 exit 1） | 迁移写入 `v1.0.0` 后**不得翻转**（短名不参与归档判定；不变量 1） |
| `flow health`：`getHealthReport(quick)` + `--fix`（仅回写 status.md 状态） | 符号 `flow.command('health')` @ `src/commands/flow.ts:1866`（块 `:1865-1961`）；core `getHealthReport` @ `flow-manager.ts:3449` / `healthCheck` @ `:3388` | **适配点③**：新增「归档一致性」warn 项（不改退出码、不参与 `--fix`）。**修正**：原记 `flow.ts:1630-1670` 系误锚（该区段实为 `flow archive` 命令面）——REV-80-007 |
| `checkDanglingDeps`：悬空依赖仅 warn；`known` 仅活跃集 | 符号 `checkDanglingDeps` @ `src/core/flow-manager.ts:3683`（`:3683-3707`；`known` 构造 `:3687`、判定 `:3693`） | **适配点④（读侧）**：`known` 并入同 helper 判定——否则 T1 放行的跨版本 dep 立刻被报悬空（REV-80-002） |
| `config set --sync-stages --stage`：未注册逐 id 报错 exit 1 | `src/commands/config.ts:287-296`（`invalid` 过滤 `:287`；`exit(1)` `:294`） | **适配点⑤**：REV-80-003 裁定①——`--stage` 命中「显式前缀 ∧ 已归档」→ 降级「仅 status.md、跳过 flow.json 冗余」+ info |
| `stage set --workflow-mode` 未注册 → flow.json 冗余**静默跳过**（status.md 照常） | 符号 `syncWorkflowModeRedundancy` 的 `if (!target) return;` @ `src/commands/stage.ts:81-83` | 不对称参照范式（裁定① 的落点依据） |
| `flow mode` / `flow phases` 的 `--stage` 存在性 = 「已注册 **或** status.md 存在」双条件 | `src/commands/flow.ts:507`（mode）/ `:423`（phases） | 对已归档版本**原样可用**（附注④ 适配类；零改动） |
| 短名经 `parseStageId` 恒归一为 `DEFAULT_STAGE_VERSION`（`v1.0.0`） | `src/core/plan/path.ts:52-59`（短名分支）；`DEFAULT_STAGE_VERSION` `:18`；`versionOfStageId` @ `src/core/flow-archive/grouping.ts:39`（`:36-49`） | **REV-80-001 根因**：`d` 无显式前缀时**不得**据归一化产物判「已归档」 |
| `checkpoint restore`（含 `--stage`）为 flow.json 全量/子树快照恢复 | 符号 `flow.command('restore')` @ `src/commands/flow.ts:1573`；`restoreCheckpoint` @ `flow-manager.ts:801`（`saveCheckpoint` `:608` / `listCheckpoints` `:644`）；`saveCheckpoint` 调用点 `:1471` | 恢复早于归档点的快照会带回归档阶段 → health warn + 文档路径（裁定 R）。**修正**：原记 `flow-manager.ts:601-670` 实为 save/list 区段——REV-80-007 |
| 本仓 `flow.json` 现状（实测）：**86 阶段**（迁移对象 = 9 组 78 阶段：`v1.0.0`×34 / `v1.1.0`×6 / `v1.1.1`×1 / `v1.1.2`×20 / `v1.1.3`×1 / `v1.1.4`×4 / `v1.1.5`×2 / `v1.1.6`×6 / `v1.1.7`×4；+ v1.2.0 八阶段 78~85）；`pipeline.current.stage = v1.2.0-stage-80` / `pipeline.phase = active` / `reviews: 0` / `log` **1355** 条（`node -e` 实测） | 迁移对象与初值（**REV-80-007 修正**：原记「78 阶段 / current=v1.1.7-stage-77 / phase=done」已过期） |
| `.openfeel/flow.json.bak`（save 写前备份；实测 **421344 B** = plan_review 轮登记基线同值）+ `.openfeel/checkpoints/`（保留上限 **每阶段 20**：`CHECKPOINT_MAX_KEEP` @ `flow-manager.ts:598`；本仓实测 **774 份**〔`ls .openfeel/checkpoints \| wc -l`；plan_review 轮 773，随流程动态增长〕） | 实测 | 备份双保险的既有设施；迁移额外做**独立目录全量备份**（kb 安全程序；见 T4） |

---

## 二、目标语义与不变量

| 维度 | 内容 |
|------|------|
| deps 判定（**单一口径**） | `--deps <d>`：已注册（含短名归一化命中）→ 现状；**`d` 显式携带版本前缀**（全名格式 `^(v\d+(?:\.\d+)*)-stage-\d+$`）∧ 版本 ∈ `archived_versions` → **视为已满足**（info 提示，不阻断）；**短名（`stage-NN`）恒走「必须已注册」原路径**（REV-80-001）；其余 → exit 1（现行为逐字）。三处复用同一 helper：`plan.ts:90` / `flow.ts:687` / `flow-manager.ts:3683`（写读不得分裂，REV-80-002） |
| health 归档项（裁定 R + REV-80-002） | ① `archived_versions` ↔ `listArchiveVersions` 双向对账（索引有文件缺 / 文件有索引缺）→ warn；② flow.json `stages` 又含已归档版本阶段（restore 带回 / 重复归档残留）→ warn；③ `checkDanglingDeps` 已归档 dep 不再报悬空（同 helper）——均只报告、不改退出码、不参与 `--fix`、归非 quick 集合 |
| config 批量同步（REV-80-003 裁定①） | `config set <key> <v> --sync-stages --stage <d>`：`d` 命中「显式前缀 ∧ 已归档」→ **降级**（status.md 字段照常同步〔五态结果不变〕、flow.json 冗余写入跳过、info 一行）；短名 / 未注册未归档 → **原路径 exit 1 逐字不变** |
| 迁移 | 按 9 组逐版本 `flow archive <version>`；`--dry-run` 先行；每步后 `flow health`；体积前后记录（阈值见 §四.3） |
| 恢复文案 | restore 早于归档点的快照 → 文档明示「需重新归档」；health 给出可读提示 |

**不变量**：

1. **既有命令零回归**：deps 正例/负例行为不变（**含**：`plan.test.ts` 全部 `--deps` 用例与 `flow.test.ts:745` 负例在注入 `archived_versions` 下仍绿；短名 typo `stage-99` **不翻转**）；`flow health` 既有检查项与输出逐字不变（仅新增 warn 行；`--json` 仅增键）；`config set --sync-stages` 既有正/负例（含 `test/commands/config.test.ts:532-550` T7.7d）逐字不变。
2. **迁移可回滚**：独立目录备份（`.openfeel/tmp/backup-stage-80/`，`tmp/` 不入版本管理〔`.gitignore` 实测〕）+ SHA256 生成/复核命令 + 回滚命令成文；迁移前工作区 clean 检查。
3. **迁移不动 v1.2.0 阶段**：78~85 不属被归档版本，零影响。
4. **常规路径零触碰**：health 的新检查项**只读** `flow-archive/` 的**目录清单级**信息（`listArchiveVersions`）——不读归档文件内容；归档判定只读 `meta.archived_versions` 轻量索引。**静态 import 面**：`flow-manager.ts` 零 `flow-archive` import（REV-80-005 定向）；`archive-health.ts` 仅被 `commands/flow.ts` 消费。
5. **无新写盘点**：deps 判定与 health 为只读；config 降级为 status.md 写（既有写盘点，非新增）、flow.json 零写盘；`--fix` 不触归档。

---

## 三、变更点清单（编号 T）

### T1 — 跨版本 deps 判定适配（单一口径 helper + 命令层两处）

- **单一口径 helper（REV-80-001/002）**：新增 `isArchivedVersionOf(stageId: string, archivedVersions: readonly string[] | undefined): boolean`，落点 **`src/core/plan/path.ts`**（新导出，纯函数）。判据（**全仓唯一实现**）：
  1. `stageId` 须匹配**全名格式** `^(v\d+(?:\.\d+)*)-stage-\d+$`（即**显式携带版本前缀**；REV-80-001 判据 `/^v\d+(\.\d+)*-/` 的收紧实现——短名两法同拒、非法全名两法同拒）；
  2. 捕获的版本段 ∈ `archivedVersions`（入参缺省/非数组 → `[]` → false）。
  - **短名恒 false**：`stage-NN` 经 `parseStageId` 归一为 `v1.0.0-*` 属**默认版本语义**，不得据此判「已归档」——REV-80-001 根因。
  - **落点理由（REV-80-005 定向）**：`flow-manager` 需复用同一 helper（T2-c）而**禁止** `flow-manager → flow-archive` 运行时依赖；`plan/path.ts` 为 `parseStageId` 唯一权威之家，四处调用方（`plan.ts:9` / `config.ts:13` / `flow.ts:28` / `flow-manager.ts:32`）**均已 import 该模块**——零新增模块边、零循环（互引方向核验：`plan/path.ts` 不 import `flow-manager`；对齐 kb #status.md 缺失字段插入语义 的落点/循环依赖判据）。`versionOfStageId`（`grouping.ts`）保持不动。
- **命令层两处（同判据、同 helper）**：
  - ① `src/commands/plan.ts:90`（`plan stage add`）：过滤条件追加 `&& !isArchivedVersionOf(d, data?.meta?.archived_versions)`；命中已归档 → info 一行（i18n 新键，双表成对 + 基线登记），**不阻断**；负例（既未注册也未归档）→ 现行为**逐字不变**（`:92-96` 文案与 exit 1）。
  - ② `src/commands/flow.ts:687`（`flow stage set --deps`，**本轮复核新增发现**——与①同缺陷类）：同一 helper 同一路由；负例 `v9.9.9-stage-99`（`test/commands/flow.test.ts:745`）保持 exit 1。
- **已注册优先**：`known.has(norm(d))` 判定前置——既有正例（短名/全名指向已注册阶段）零回归。
- 提示（info）与负例错误文案**分离**（新增 info 键；既有 `plan.stage.invalidDepsTmpl` / `stage.set.depsDanglingTmpl` 零改动）。

### T2 — `flow health` 归档一致性检查（core + 命令层；裁定 R + REV-80-002/005）

- **落点定稿（REV-80-005②，采纳首选方案；两方案不得并存）**：**新文件** `src/core/flow-archive/archive-health.ts`——纯函数 `archiveHealthItems(input: { projectPath: string; data: FlowData }): HealthCheckItem[]`（`import type { HealthCheckItem } from '../flow-manager.js'`，编译期擦除、零运行时依赖边；归档侧复用 `getArchivedVersions` / `listArchiveVersions` / `versionOfStageId`，**禁第二套解析**）：
  - a. `archived_versions` ↔ `listArchiveVersions(projectPath)` **双向对账**（索引有文件缺 / 文件有索引缺 → warn；均一致 → pass）；
  - b. `data.stages` 存在版本前缀 ∈ `archived_versions` 的阶段 → warn（restore 带回 / 重复归档残留；判据经 `versionOfStageId`，与引擎同源）。
- **消费方 = 命令层**（`src/commands/flow.ts` `flow.command('health')` 块 `:1865-1961`）：人类输出与 `--json` payload 的 items **合并追加**；warn-only → `ok` 不变、**退出码语义不变**；`--quick` 跳过归档项；`--fix` 不触。**不引入** `flow-manager → flow-archive` 运行时依赖（备选「落 `flow-manager.ts`」方案不采纳——若未来改采，须补「无循环 import」断言 + 更新 `produces_core` + 大计划核验 A2 例外注记）。
- c. **读侧口径（REV-80-002）**：`src/core/flow-manager.ts:3683` `checkDanglingDeps`——未命中 `known` 的 dep 追加判定 `isArchivedVersionOf(d, this.data.meta?.archived_versions)`（**与 T1 同一 helper，单一口径**）；命中 → 不报悬空。
- **禁止态**：不得出现「T1 放行 + health 仍报悬空」或反向（写/读口径分裂）。
- `deps.yaml downstream_contracts` 登记：`isArchivedVersionOf`（path.ts）+ `archiveHealthItems`（archive-health.ts）两契约。

### T3 — 恢复路径与文案（裁定 R）

- `checkpoint restore`（含 `--stage`）后若带回归档阶段：health 的 T2-b 即时报 warn；**不改 restore 行为**。
- 阶段内落文案（供 stage-85 docs 承接）：恢复分层（ADR-004）与归档的关系表（`flow health` → `stage reset` → `restore --stage` → 全量 restore → `health --fix`；归档后须补 `flow archive` 重新归档）。

### T4 — 本仓 78 阶段存量迁移（自举，裁定 S）

- **前置（执行前须用户确认）**：① 工作区 clean（`git status` 确认无未提交关键改动）；② **独立目录全量备份**：`mkdir -p .openfeel/tmp/backup-stage-80/` → `cp .openfeel/flow.json .openfeel/tmp/backup-stage-80/flow.json`（`.openfeel/tmp/` 已入 `.gitignore`〔实测〕、不入版本管理；或等价**仓库外目录**）；③ **SHA256 生成/复核命令**：生成 `sha256sum .openfeel/flow.json > .openfeel/tmp/backup-stage-80/flow.json.sha256`（PowerShell 备选 `Get-FileHash -Algorithm SHA256`）；复核 `sha256sum -c .openfeel/tmp/backup-stage-80/flow.json.sha256`（备份副本与源双向比对）；④ 记录迁移前体积（`wc -c < .openfeel/flow.json`）/ revision / 阶段数 / log 条数。
- 执行：按 9 组顺序 `flow archive vX --dry-run` → `flow archive vX`（v1.0.0 起）→ 每步 `flow health`；全部完成后 `flow archive list` 复核 9 组。
- 核验：① 体积前后对比记录（阈值：**迁移后 ≤ 迁移前 1/5**，见 §四.3）；② `git diff .openfeel/flow.json` 内容核验排除 `meta.revision` / `meta.updated`（kb 纪律）；③ 既有命令抽查（`flow status` / `overview` / `log` / `metrics`）全绿；④ v1.2.0 阶段（78~85）零影响。
- **回滚路径成文**：备份回填（`cp .openfeel/tmp/backup-stage-80/flow.json .openfeel/flow.json`；SHA256 复核一致）+ `rm -rf .openfeel/flow-archive/` + 备份中的 `archived_versions` 还原（或整体还原备份文件）→ `flow health` 复核。

### T5 — 端到端与常规路径零触碰验证程序（REV-80-006）

- 隔离临时项目：多版本 fixture 归档 → **重命名 `.openfeel/flow-archive/`** → 消费点清单**按大计划 §三 裁定 P 附注① 全量逐条执行**（**不再以「等」概括**）：渲染类 7 项——`flow status` / `flow overview` / `flow current` / `flow ops list` / `flow log` / `flow wizard` / `flow health`；判定/操作类——`flow mode` / `flow phases` / `flow advance` / `flow attempt` / `flow retry` / `flow repair` / `flow recover` / `flow checkpoint restore` / `flow stage add` / `flow stage remove` / `flow stage set` / `flow stage reset` / `stage create` / `plan stage add --deps` / `plan scheme list` / `plan register` / `openfeel archive <stage>` / `config set --sync-stages` → 恢复目录名后一致（验收 4 的可执行化）。
- **判据（REV-80-006）**：每条命令「**退出码 0 且 `--json` 无 `fail`**」；`flow health` 例外——「除**已声明的归档一致性 warn** 外无 warn」（显式豁免；其余任一 warn 视为失败）。
- **「阶段已移出活跃集」行为断言（不依赖目录重命名）**：迁移/归档后——`flow status --json` 阶段计数 = 活跃集（8）；`flow overview` 阶段列表不含归档阶段；`plan stage list` 仍列出归档目录（文件系统视图不变，附注②）；`stage status <已归档全名>` 可用；`flow health --json` 无 `fail`、warn 仅声明项。
- **static import 面断言**：`rg -n "from '.*flow-archive/" src/ --glob '!src/core/flow-archive/*'` → **仅命中 `src/commands/flow.ts`**（本阶段后唯一消费者）；定向断言 `rg -n "flow-archive" src/core/flow-manager.ts` → **零命中**（REV-80-005 定向）。**注**：裸串 `rg "flow-archive" src/` 会命中 i18n 文案（如 `archive.list.empty`），**不得**用作 import 面判据。
- 既有命令零破坏断言（`flow phases --json` / `flow mode --json` / `flow advance` 拒绝集逐字）。

### T6 — 测试与门禁

- `test/commands/plan.test.ts`：**双用例**——(a) 短名 typo：fixture 注入 `archived_versions: ['v1.0.0']`（v1.0.0 移出活跃集模拟已归档），`--deps stage-99` → **仍 exit 1**（不翻转；扩展 `:321-322`）；(b) 显式前缀 `v1.0.0-stage-01`（已归档）→ **exit 0** 注册成功 + info。并**复核 `plan.test.ts` 全部 `--deps` 用例**（`:295` / `:304` / `:313` / `:321` / `:329` / `:337`）在「`archived_versions:['v1.0.0']` 注入」条件下仍绿。
- `test/commands/flow.test.ts`：`flow stage set --deps` 对称用例（`:737` / `:745` 负例保持 + 已归档显式前缀正例）+ health 命令层合并（人类 + `--json`）与退出码不变断言。
- `test/core/flow-manager.test.ts`：悬空依赖**对称用例**（已归档 dep → 无 warn / 不存在未归档 dep → 有 warn；`:2732` 短名既有用例保持）。
- `test/core/plan/path.test.ts`：helper 单测（短名恒 false / 显式前缀未归档 false / 显式前缀已归档 true / `undefined` 列表 false）。
- `test/core/flow-archive.test.ts`：`archiveHealthItems` 三项（对账缺失 / 重复阶段 / 索引缺）。
- `test/commands/config.test.ts`：`--stage` 已归档降级用例（status.md 同步 + flow.json 零冗余写入 + info）+ `:532-550`（T7.7d）既有负例保持。
- **承接 REV 收口项**（见「承接 REV 与处置表」）：REV-79-022 补 `rearchivedTmpl` 幂等用例；REV-79-020/021 文档补登（`stage-79/ops/deps.yaml` 错误码契约 + 锚点口径）。
- 门禁：`npm run build` ×2 → `npm test` → `tsc` = 0 → `lint i18n` 新基线（显式登记）→ `lint kb` = 0。

### T7 — `config set --sync-stages --stage` 已归档目标降级（REV-80-003 裁定①）

- **裁定（三选一，取①「纳入适配」）**：`config set <key> <v> --sync-stages --stage <d>`，`d` 命中「**显式版本前缀** ∧ 版本 ∈ `archived_versions`」→ **降级**：status.md 字段**照常同步**（复用既有 `writeStatusField` / `insertStatusField` 单点，五态结果不变）、**flow.json 冗余写入跳过**（off-set 目标不触 `data.stages[id]`、不新增冗余键、不额外 `save`）+ **info 提示**；短名 / 未注册未归档 / 非显式前缀 → **原路径 exit 1 逐字不变**（`config.ts:287-296`；短名防误判路由同 T1）。
- **裁定理由**：与 `stage set --workflow-mode`「未注册 → flow.json 冗余静默跳过」（`stage.ts:81-83`）**同范式**；且 `flow mode` / `flow phases` 的 `--stage` 校验本为「已注册 **或** status.md 存在」双条件（`flow.ts:507` / `:423`）——config 的硬失败属**范式不对称**；不修则 §八.14 须长期豁免一条可适配的拒绝（选项②/③ 不采纳：② 的「替代路径」不成立，③ 使 80~84 执行期口径悬空）。
- **落点**：`src/commands/config.ts`（guard 分支 + info）+ `src/core/flow-manager.ts::syncConfigFieldToStages`（`:3599`；off-set 目标：status.md 解析经 `findStageStatusPath`；无 `data.stages[id]` → 跳过冗余写入、不置 `flowJsonDirty`）。
- 既有负例保持：未注册且未归档（`--stage bogus-x`）→ exit 1 原样（`test/commands/config.test.ts:532-550` T7.7d）。

### 承接 REV 与处置表（REV-79 pending 8 条；REV-80-004）

> 来源：`users/Liuary/code_review/REV-79.md`（均标「转 v1.2.0 收口」）；`deps.yaml` stage-80 `notes` 留索引行。

| REV | 摘要 | 处置 | 动作 / 落点 |
|-----|------|------|-------------|
| REV-79-011 [low] | 大计划 A5 / 裁定 P④ 与 stage-79 定稿并存「双口径」 | **本阶段收口（本轮已落实）** | 大计划 A5 / P④ 补注「stage-79 已定稿：`current` 置空 `{stage:'',op:''}`」；T6 复核 |
| REV-79-012 [low] | stage-79 `produces_core` 与 helper 落点「方案期定稿」张力 | **转 stage-85** | 历史阶段记录复盘 / 文档收口（stage-85 收官轮） |
| REV-79-017 [low] | 承接 011：Q3 未标已收敛 + 空集守卫行号漂移 | **本阶段收口（本轮已落实）** | 大计划 Q3 标「已收敛（`current` 置空；空集 → `phase='active'`）」；A4 / P⑤ / R-11 空集守卫双锚（工作区 `flow-manager.ts:1490-1493`，基线 `fdfebc9`）；T6 复核 |
| REV-79-019 [medium] | stage-79 `op-001.md` 参考实现未同步 013/015 落实结果 | **转 stage-85** | 历史 op 文档同步（收官轮） |
| REV-79-020 [low] | `archive-write-failed` 未登记进冻结失败错误码契约 | **本阶段收口** | 随 T6：`stage-79/ops/deps.yaml` + `ops/op-001.md` D10 补登第 6 码 |
| REV-79-021 [low] | 行号锚点漂移 | **本阶段收口** | 随 T6：统一「基线 commit + 双锚」口径（本计划已执行；`stage-79` 自检报告同步） |
| REV-79-022 [low] | `flow.archive.rearchivedTmpl` 覆盖分支无测试覆盖 | **本阶段收口** | 随 T6：补「已归档版本重新登记 → 再归档 → 幂等收敛」用例 |
| REV-79-023 [low] | 风格 nit（`--json` 失败出口 / 防御强度不齐） | **本阶段收口** | 随 T6（可选统一；非阻塞） |

---

## 四、验收要点（阶段级）

1. deps 适配正/负例全绿（含：短名 typo 负例不翻转；显式前缀已归档正例；`v9.9.9-stage-99` 负例）；`plan stage add` 与 `flow stage set --deps` 其余行为逐字不变。
2. health 归档三检查项触发与恢复路径提示正确；退出码语义不变；`--json` 仅增键；写/读单一口径（已归档 dep 无悬空 warn）。
3. **迁移完成**：`flow archive list` = 9 组；flow.json 体积**≤ 迁移前 1/5**——基线以**迁移执行前现场实测**为准（复现：`wc -c < .openfeel/flow.json`；plan_review 轮登记 **421344 B**〔= 当时 `.openfeel/flow.json.bak` 快照字节数〕；本修订轮复核 HEAD `fdfebc9` 树 **420984 B** / 工作区 **421587 B**——字节数随 save 变动）；既有命令全绿；回滚路径成文并有独立复核。
4. 常规路径零触碰验证程序通过（T5；含 static import 面断言 + 「阶段已移出活跃集」行为断言）。
5. 门禁全绿；v1.2.0 阶段（78~85）与 flow 生命周期零影响。
6. `config set --sync-stages --stage <已归档显式全名>` 降级可用（status.md 同步 + flow.json 零冗余写入 + info）；短名 / 未注册仍 exit 1。

## 五、风险

| # | 风险 | 缓解 |
|:-:|------|------|
| R-80-1 | 真实迁移误操作（本仓唯一不可轻率回滚的动作面） | 裁定 S 四步程序（独立目录备份 + SHA256 + dry-run + 判据门 + 回滚成文）+ 执行前用户确认（开放问题 Q9） |
| R-80-2 | deps 适配破坏既有拒绝语义 | **判据路由**：显式前缀才进归档判定，短名恒走原路径（REV-80-001）；负例双用例逐字断言（T6）+ 既有 `plan.test.ts` / `flow.test.ts` 全绿 |
| R-80-3 | health 误报（正常态报 warn） | 双向对账 + 三项独立用例 + 本仓迁移后 `flow health` 零 warn 验收 |
| R-80-4 | restore 带回归档阶段未被发现 | T2-b 检查项 + 文档路径（T3） |
| R-80-5 | 写/读口径分裂（写侧放行、health 报悬空或缺读侧适配） | 同一 helper 三处复用（T1 两处 + T2-c）+ 对称用例（REV-80-002） |
| R-80-6 | config 降级破坏既有负例 | 短名 / 未注册仍 exit 1（原路径逐字）+ T7.7d 既有用例保持 + 新降级用例 |

> 说明：op 级拆分建议——op-001（T1 + T2 + T7：helper 与三校验点 + health a/b/c + config 降级，**消费点适配**）→ op-002（T3 文案 + T5 验证程序）→ op-003（T4 本仓迁移 + T6 门禁 + 承接收口项，**收口 op 为最终 op**）；由 openfeel-schemer 定稿并落 `ops/deps.yaml`。

## 六、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-11 | openfeel-planner | 初稿（立项随批次落盘）：T1~T6；依据大计划 §三 裁定 Q/R/S/W 与 §二 表 A。**只写计划文档，未改源码、未动 flow.json。** |
| 2026-10-11 | openfeel-planner | REV 修订轮（v1.2.0-stage-78 plan_review 后续）：T5 常规路径零触碰清单升级为「消费点清单全员（大计划 §三 裁定 P 附注）」。**只改计划文档。** |
| 2026-10-12 | openfeel-planner | **REV-80-001 落实**：T1 判定收敛为「**d 显式携带版本前缀**（全名格式）才生效，短名恒走必须已注册原路径」；helper 落点定 `src/core/plan/path.ts`（单一口径）；复核新增 **`flow stage set --deps` 第二校验点**（`flow.ts:687`）纳入适配；T6 补短名 typo 负例 + 显式前缀归档正例双用例与全 `--deps` 用例复核清单。**只改计划文档。** |
| 2026-10-12 | openfeel-planner | **REV-80-002 落实**：T2 增 c. `checkDanglingDeps` 读侧并入同 helper（写/读单一口径，禁「T1 放行 + health 报悬空」并存）；补对称用例；`deps.yaml downstream_contracts` 登记两 helper。**只改计划文档。** |
| 2026-10-12 | openfeel-planner | **REV-80-003 落实**：新增 **T7——裁定①「纳入适配」**（`--stage` 命中已归档显式全名 → 降级「仅 status.md、跳过 flow.json 冗余」+ info；与 `stage.ts:81-83` 同范式）；修订大计划附注①/② 口径并新增附注④「枚举收缩不涵盖操作拒绝」+ §八.14 / §八.5 / §四 stage-80 行同步。**只改计划文档。** |
| 2026-10-12 | openfeel-planner | **REV-80-004 落实**：新增「承接 REV 与处置表」（REV-79 pending 8 条逐条处置：011/017/020/021/022/023 本阶段收口、012/019 转 stage-85）；`deps.yaml` stage-80 `notes` 留索引行。**只改计划文档。** |
| 2026-10-12 | openfeel-planner | **REV-80-005 落实**：① `deps.yaml` stage-80 `produces_core` 补 9 个归档文件（`.openfeel/flow-archive/{v1.0.0..v1.1.7}.json`，notes 注明「经 CLI 生成、非手改」）；② T2 落点定稿为**新文件** `src/core/flow-archive/archive-health.ts`（纯函数返回 `HealthCheckItem[]`，避免 `flow-manager → flow-archive` 运行时依赖）。**只改计划文档。** |
| 2026-10-12 | openfeel-planner | **REV-80-006 落实**：T5 判据改「退出码 0 且 `--json` 无 `fail`；health 除已声明归档一致性 warn 外无 warn」并显式豁免；补 **static import 面断言**（含 `flow-manager.ts` 零命中定向断言）；「等」替换为「按裁定 P 附注① 全量清单逐条执行」；补「阶段已移出活跃集」行为断言（不依赖目录重命名）。**只改计划文档。** |
| 2026-10-12 | openfeel-planner | **REV-80-007 落实**：§一 全表改**双锚（符号名 + 行号）** + 标基线 commit `fdfebc9`；实测修正——`flow health` = `flow.ts:1865-1961`（`flow.command('health')` @1866，非 1630-1670）、`restoreCheckpoint` = `flow-manager.ts:801`（非 601-670）、本仓 **86 阶段 / `current=v1.2.0-stage-80` / `phase=active`**、checkpoints **每阶段 20**（本仓 774 份）。**只改计划文档。** |
| 2026-10-12 | openfeel-planner | **REV-80-008 落实**：验收 3 补数值阈值（**≤ 迁移前 1/5**）+ 复现命令（基线 421344 B / HEAD 420984 B / 工作区 421587 B）；T4 明写备份落 `.openfeel/tmp/backup-stage-80/`（`tmp/` 不入版本管理）或仓库外目录 + SHA256 生成/复核命令。**只改计划文档，未改源码、未直写 flow.json、未推进 phase。** |
