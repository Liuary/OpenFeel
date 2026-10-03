# v1.1.4-stage-64 计划 — op 注册一致性（问题 2）

- **阶段**：`v1.1.4-stage-64`
- **依赖**：无（独立模块 `plan/scheme.ts` + `fs/sequence.ts`）
- **优先级**：P1
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-03
- **定位**：使 `plan scheme create` 的 op 序号与 `flow.json` 注册**一致**（基于「注册 ∪ 文件」+ 空位回填），并提供 **`plan scheme register`** 补注册既有文件、`create` 时对未注册文件**告警**。
- **范围**：`src/core/plan/scheme.ts`、`src/core/fs/sequence.ts`、`src/commands/plan.ts`、`src/core/i18n-data/*`、skill/docs、测试。
- **边界**：不删除/迁移既有 op 文件与注册键；不改 `plan scheme create` 的模板与注册语义（state/checkpoints 默认不变）；不改 `flow repair --prune-orphans` 单向语义；不新增依赖；不 `npm publish`/`git push`；不改 `flow.json`（由 Feel 推进）。

## KB 检索（`openfeel-check-kb`）

- 已加载 `openfeel-check-kb`。**高度相关条目**：
  - `kb/patterns.md #op 文件命名规范`（`op-NNN.md`，标题在内容首行）→ 序号空间解析须兼容历史 `op-NNN_{title}.md`。
  - `kb/patterns.md #纠正/清理侧命令面（对称原理）`（「每可写结构须有增删改查对称能力」）→ 支撑新增 `register`（register 是 create 的对称补全）。
  - `kb/patterns.md #并发保护基础设施（O_EXCL 占号 + 锁 + rename）` / `#原子写` → 序号分配须在 `scheme-{stageDir}` 锁内 + `reserveSequence` O_EXCL 兜底。
  - `kb/troubleshooting.md #自动修复/删除侧边界`（`findOrphanOps` 单一实现）→ 复用 `fileOrphans` 口径，避免第二套判定。
- **无「创建时检测未注册文件」条目** → 归档时补沉 patterns。

---

## 一、背景与实测证据（唯一事实基准）

| 事实 | 源码位置 | 结论 |
|------|----------|------|
| `createScheme` 序号仅据 ops/ 目录**文件**（`reserveSequence`→`nextSequence` = max+1） | `src/core/plan/scheme.ts:249-261` + `src/core/fs/sequence.ts:54-70` | **不查 flow.json 注册** → 文件 001~004 未注册时生成 005 |
| `reserveSequence` 支持 `start` 注入起点 + O_EXCL 递增重试 | `sequence.ts:79-109` | 可承载「注册 ∪ 文件」起点 |
| `reconcileOrphans` 已能识别 `fileOrphans`（有文件无键）与 `keyOrphans`（有键无文件） | `flow-manager.ts:324-371` | 复用为告警/补注册口径 |
| `flow repair --prune-orphans` 仅删 `keyOrphans`（单向、不删文件） | `flow-manager.ts:2820-2840` | **无 fileOrphans 补注册入口** |
| 全仓无 `plan scheme register` / `flow repair --register-ops` | `rg` | 问题 2 建议②缺失 |

> 观察场景：方案官手写 `op-001~004.md`（未注册）→ `plan scheme create` 生成 `op-005` → 「文件 001~004、注册仅 005」错位；`flow ops list` 为空、`flow attempt` 无法记录 001~004。

---

## 二、目标语义

| 维度 | 改前 | 改后 |
|------|------|------|
| 序号来源 | 仅 ops/ 文件 max+1 | **`注册 ∪ 文件`** 的**最小未用正整数**（空位回填） |
| 补注册 | 无 | `plan scheme register <stage> [opId] [--dry-run]` |
| 未注册文件 | 静默跳过 | `create` 时**告警**并提示 `plan scheme register` |
| 一致性报告 | `flow health` warn | 保持（复用 `findOrphanOps`） |

**注意（D2）**：在观察场景（001~004 未注册）下，`注册 ∪ 文件` = {1,2,3,4} → 最小未用 = **5**，仍会生成 005。**正解是 `register` 补注册既有文件**（而非期望 create 复用 001~004，复用会覆盖既有内容）。因此本阶段以 **`register` + 告警**为主修复，序号改为「注册 ∪ 文件 + 空位回填」用于**防止注册键与文件序列脱节导致的跳号**（如某号仅注册无文件、或删文件留空洞）。

---

## 三、变更点清单（编号 T）

### T1 — 序号分配改为「注册 ∪ 文件」+ 空位回填（`scheme.ts`）

- 新增纯函数 `nextSchemeSequence(fileSeqs: Set<number>, registeredSeqs: Set<number>): number`：返回**最小未用正整数**（1 起）。空集 → 1。
- `createScheme` 锁内：
  1. 扫描 `opsDir` 得 `fileSeqs`（正则 `/^op-(\d+)/`，兼容历史命名，**既有解析不变**）；
  2. **读取 flow.json** 当前 `stages[stage].ops` 键得 `registeredSeqs`（在 `scheme-{stageDir}` 锁内只读；写仍由 `syncToFlowJson` 的 flow.lock 保护）；
  3. `start = nextSchemeSequence(...)`，调用 `reserveSequence({ ..., start })`（O_EXCL 兜底占用/跳号）。
- `reserveSequence` 已有 `start`/EEXIST 递增能力，**无需改其核心**；如需亦可加可选 `used` 集，但优先最小改动。

### T2 — 新增 `plan scheme register`（`commands/plan.ts` + `scheme.ts`）

- 签名：`openfeel plan scheme register <stage> [opId] [--dry-run]`
- 逻辑（`registerSchemes(projectPath, stage, opId?, {dryRun})`）：
  - 用 `findOrphanOps`/`reconcileOrphans` 取目标阶段的 `fileOrphans`（有文件无注册键）；
  - 指定 `opId` → 仅补注册该项（若已注册则报告 no-op；若文件不存在则报错）；
  - 未指定 → 补注册该阶段**全部** `fileOrphans`；
  - 每条按 `createScheme` 的注册默认（`state='pending'`、`assignee='openfeel-executor'`、`attempts=0`、`max_attempts=3`、`checkpoints` 默认），`title` 由 `extractTitle`（文件首行→回退文件名）；
  - `--dry-run` 仅列出将注册项、零写盘；正式执行留 `register_op` 审计日志 + `mgr.save()`。
- 返回结构化结果（`registered[] / skipped[] / noop[]`）供命令层输出。

### T3 — `create` 未注册文件告警（`scheme.ts` + `plan.ts`）

- `createScheme` 成功后（或占号前）检测目标阶段 `fileOrphans`；非空 → `console.warn` 列出（前 5 条）并提示 `plan scheme register <stage>`。
- **D2 建议**：告警**继续创建**（非破坏性）；备选「拒绝创建直至注册」。

### T4 — `flow repair` / `flow health` 保持

- 不改 `--prune-orphans`（仍单向删 keyOrphans）；`flow health` 的 `orphanOps` warn 保持。
- **不新增** `flow repair --register-ops` 别名（最小命令面；`plan scheme register` 承接）。

### T5 — 测试面

| # | 用例 | 断言 |
|:-:|------|------|
| T5.1 | 空阶段 create ×3 | 得 001/002/003 并注册 |
| T5.2 | 注册键有空洞（如注册 001、003） | create 回填 002（最小未用） |
| T5.3 | 文件孤儿场景（001~004 文件未注册）+ create | 序号 = 5（不覆盖 001~004）；出现**未注册告警** |
| T5.4 | `plan scheme register <stage>` | 001~004 全部注册，`state='pending'`，title 正确 |
| T5.5 | `plan scheme register <stage> op-002` | 仅注册 002 |
| T5.6 | `plan scheme register --dry-run` | 零写盘（flow.json revision 不变） |
| T5.7 | 已注册 op 再 register | no-op 报告 |
| T5.8 | 历史命名 `op-001_{title}.md` | 序号解析兼容、register title 回退正确 |

### T6 — 文档 + skill + i18n

| # | 文件 | 改动 |
|:-:|------|------|
| T6.1 | `templates-data/opencode/skills/openfeel-cli-usage/SKILL.md`（权威源） | `plan scheme` 行新增 `register`；`create` 序号说明与告警 |
| T6.2 | `.openfeel/manual/cli/commands.md`、`docs/commands.md` | 同步 |
| T6.3 | `i18n-data/{zh-CN,en}.ts` | 新增告警/命令文案（**允许键数 +少量**，须同步更新验收基线与双语句对；优先复用既有键减少新增） |

> i18n 键数（D-i18n 显式登记）：本阶段新增 **9 键**（op-001 新增 1 键 `plan.scheme.unregisteredFilesWarnTmpl`；op-002 新增 8 键 `plan.scheme.register.{ok,dryRun,none,noop}Tmpl` + `help.plan.scheme.register{,.argstage,.argopId,.dryRun}`），基线从 **730 变为 739**，须在本阶段验收口径中显式登记；`lint i18n` 以实际值 739 为准。

---

## 四、op 划分与执行顺序（**3 op**）

| op | 主题 | 覆盖 | 关键产出 | 依赖 |
|:--:|------|------|----------|------|
| **op-001** | 序号「注册 ∪ 文件」+ 空位回填 + create 告警 | T1+T3+T5.1~T5.3 | `scheme.ts`/`fs/sequence.ts`；测试 | — |
| **op-002** | `plan scheme register` 补注册 | T2+T5.4~T5.8 | `scheme.ts`/`commands/plan.ts`；测试 | hard: op-001 |
| **op-003** | 文档 + skill + i18n + 门禁 | T4+T6 | skill 权威源/manual/docs；`build`；全门禁；阶段报告 | hard: op-002 |

**顺序：op-001 → op-002 → op-003。**

**边界声明**：不改 op 模板/注册默认语义；不改 `--prune-orphans`；不新增 `flow repair --register-ops`；不新增依赖；不 `npm publish`/`git push`；不改 `flow.json`。

---

## 五、验收标准（阶段级）

1. **序号一致**：`create` 序号基于「注册 ∪ 文件」最小未用；同一阶段重复 create 不跳号、不重号。
2. **回填**：存在注册空洞时回填空位（T5.2）。
3. **补注册**：`plan scheme register` 可将 fileOrphans 全部/单项注册进 `flow.json`，`flow ops list` 可见。
4. **告警**：存在未注册文件时 `create` 输出告警 + 处理指引。
5. **dry-run**：`register --dry-run` 零写盘。
6. **兼容**：历史命名 `op-NNN_{title}.md` 解析/标题回退不变。
7. **测试**：`npm test` 全绿 `0 skipped / 0 failed`。
8. **类型**：`tsc` = 0；**KB**：`lint kb` = 0；**i18n**：`lint i18n` 通过（键数与双语句对一致，新增键显式登记）。
9. **构建**：`npm run build` 成功、`.opencode/**` 不复活。

---

## 六、风险与回滚

| # | 风险 | 影响 | 缓解 / 回滚 |
|:-:|------|------|-------------|
| R-1 | 读 flow.json 注册键与占号竞态 | 中 | 在 `scheme-{stageDir}` 锁内读取；写由 flow.lock 保护；O_EXCL 兜底 |
| R-2 | 空位回填复用已删除文件的序号，旧引用断链 | 低 | 空位回填仅针对「既无文件又无注册」的空洞；注册键计入占用不回收（union 语义） |
| R-3 | `register` 误注册非 op 文件 | 低 | 仅接受 `/^op-\d+/` 命名；复用 `findOrphanOps` 口径 |
| R-4 | 新增 i18n 键影响门禁基线 | 低 | 优先复用既有键；必须新增则显式登记新基线 |
| R-5 | 告警在 CI/非 TTY 噪声 | 低 | 告警走 stderr，遵循既有 `--quiet`/非 TTY 约定 |

**回滚**：`git revert <sha>`；不删数据。

---

## 七、边界（不做）

1. 不迁移/重命名既有 op 文件；不删除注册键。
2. 不改 `createScheme` 模板与注册默认（state/checkpoints）。
3. 不改 `flow repair --prune-orphans` 单向语义；不新增 `--register-ops`。
4. 不新增依赖；不 `npm publish`/`git push`；不改 `flow.json`。
5. 不创建除本阶段外的 op。

---

## 八、裁定项（本阶段需明确）

| # | 议题 | **建议** | 依据 |
|:-:|------|----------|------|
| **D2** | 存在未注册文件时 create 行为 | **告警继续** | 非破坏性；正解由 `register` 承接；拒绝创建会破坏既有工作流 |
| **D-reg** | 补注册入口 | **`plan scheme register`**（不新增 `flow repair --register-ops`） | 最小命令面；语义归属「方案管理」 |
| **D-i18n** | 新增文案键 | 优先复用既有键；必须新增则显式登记新基线 | `lint i18n` 门禁可观测 |

## 九、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-03 | openfeel-planner | 初稿：T1~T6；3 op；验收 9 条；裁定 D2/D-reg/D-i18n；说明观察场景正解为 register |
| 2026-10-03 | openfeel-executor | D-i18n 落地：新增 9 键，基线 730→739（op-001 1 / op-002 8）；T6.3 只做基线登记与对称性验证（不在 op-003 新增键，属正向偏差） |