# Plan — stage-39: 存量迁移与兼容收尾

> **版本**：v1.1.0-stage-39
> **创建日期**：2026-09-25
> **Planner**：独立 Planner（推理模型）
> **规模判定**：架构级收尾（跨模块——新增 CLI 顶层 `migrate` 命令 + 存量读取兼容验证 + 文档/版本三处收口 + 全量回归）
> **定位**：v1.1 改造第五阶段（v1.1 大计划 P1）。**P6 + P8 收口**——落地 `openfeel migrate` 命令（检测/备份/迁移/回滚）、确认 P5 存量读取兼容已闭环、版本号统一升至 1.1.0、文档收口、全量回归。
> **来源**：`.openfeel/plan/v1/v1.1/plan.md`（stage-39 章节 + P5/P6/P8 + 兼容性策略 §六）+ 本计划调研复核。

---

## 一、知识库参考

| 条目 | 路径 | 相关性 |
|------|------|--------|
| update_state.json 降级风险排查 | kb/troubleshooting.md #update_state.json 降级风险排查 | **直接命中**。migrate 拆分/重键旧 state 的坑位依据 |
| P5 读取兼容模式 | kb/patterns.md #P5 读取兼容模式 | **直接命中**。normalizeAgentName 已实现，本阶段仅验证覆盖点 |
| 全局/项目双 state 路由模式 | kb/patterns.md #全局/项目双 state 路由模式 | **直接命中**。migrate 拆分重键依赖该路由 |
| 版本号语义管理与递增规范模式 | kb/patterns.md #版本号语义管理与递增规范模式 | **直接命中**。1.1.0 三处同步 + AGENTS.md 声明 |
| CLI --dry-run 安全预览模式 | kb/patterns.md #CLI --dry-run 安全预览模式 | 复用。migrate --dry-run 不写盘 |
| 原子写 / 建议性文件锁模式 | kb/patterns.md #原子写模式 / #建议性文件锁模式 | 必须遵循。migrate 备份/迁移写盘复用 stage-35 fs 工具 |
| 命名前缀统一与子串陷阱处理模式 | kb/patterns.md #命名前缀统一与子串陷阱处理模式 | 参考。文档 `/opfx:` → `openfeel-` 改名的陷阱规避 |
| 全局部署架构 / 控制区标记增量更新架构 | kb/architecture.md | 参考。migrate 复用 update 的全局部署 + managed-region 合并逻辑 |
| 跨平台行尾归一化模式 | kb/patterns.md #跨平台行尾归一化模式 | 必须遵循。migrate 备份/比对须归一化 CRLF |

> ⚠️ 执行任务前，若知识库中有相关条目，务必参考。重复踩过的坑不可再犯。

---

## 二、背景与动机

v1.1.0 前四阶段（stage-35~38）已完成并发保护、命名前缀、全局部署、控制区标记增量更新。框架资产已从「项目内嵌」升级为「全局安装 `~/.config/opencode/` + 项目精简」。但**存量项目**仍停留在旧布局（项目 `.opencode/agents|skills|instructions`、旧 `opencode.jsonc` 非法 `skills` 映射、混合 `update_state.json`），且版本号仍为 1.0.9。本阶段完成：

1. **迁移入口**：提供显式 `openfeel migrate` 命令（`--dry-run` 预览 + 备份 + 回滚），`openfeel update` 检测 legacy 只提示不静默迁移（P6）。
2. **兼容验证**：确认 P5 读取兼容（normalizeAgentName）与双 state 路由已在前序阶段闭环，仅补漏。
3. **收口**：文档 + 版本 1.1.0 + 全量回归。

### 调研确认事实（本计划复核，避免重复实现）

| 项 | 结论 | 证据 |
|----|------|------|
| **P5 已实现** | `flow-manager.ts` L2814 `normalizeAgentName` + L2798 `LEGACY_AGENT_NAME_MAP`（8 旧名 → 新名）；已接入 `flow.ts`(L119/133/271/591)、`view.ts`(L32)、`metrics.ts`(L131) 全部展示 agent 名的路径；`mapPhaseToAgent`(L1504) 已返回新名。测试已覆盖（flow-manager.test.ts L2277-2337） | 源码 |
| **双 state 已实现** | `update-state.ts` 提供 `loadUpdateState`/`saveUpdateState`（项目）+ `loadGlobalUpdateState`/`saveGlobalUpdateState`（全局）；`update.ts` L1527-1537 按 `isAbsolute` 分流 | 源码 |
| **旧 state 拆分未实现** | 旧项目 `.openfeel/update_state.json` 中**混合记录框架资产 + 项目资产**（旧 key 为相对路径如 `.opencode/agents/planner.md`），尚无「框架条目移入全局 state 并重键」的逻辑 | 源码 |
| **版本三处当前值** | `package.json`=1.0.9；`.openfeel/config.yaml` `meta.version`=1.0.9；`src/core/config.ts` `CONFIG_TEMPLATE_ZH/EN` `version: 1.0.9`（L307/L364）。另有生成段 `template-loader.ts` L2786/L2934 含 `v1.0.9` 文本（AGENTS.md 模板版本声明）+ `test/core/update.test.ts` L570 硬编码 `'1.0.9'` | 源码 |
| **legacy 检测已有雏形** | `update.ts` L1348-1353（N8）已检测 `.opencode/{agents,skills,instructions}` 存在则 warn 提示运行 migrate | 源码 |
| **已有 `flow migrate` 子命令** | `flow-manager.ts` L2259 `migrate()` + `flow.ts` L811 `flow migrate` —— 这是 **flow.json 结构迁移（v4.0→v4.1 全局 phase）**，与 stage-39 要新增的**顶层 `openfeel migrate`（legacy 布局迁移）** 不同域，命名须区分 | 源码 |
| **当前 flow.json 无旧 assignee** | 本仓库 `.openfeel/flow.json` 所有 `ops` 均为空 `{}`，无 `assignee` 字段；migrate 的 assignee 重映射针对**存量项目**的 flow.json | 源码 |
| **文档残留** | `README.zh-CN.md`/`README.en.md` L98-109 有 `/opfx:` 技能映射表；`docs/phase-*` 历史文档不动（stage-36 已决定）；`CHANGELOG.md` 缺 1.1.0 条目；`docs/commands.md` 标注「适用版本 0.1.0」属过期文档 | 源码 |

---

## 三、已确认决策（继承 v1.1 大计划，不可推翻）

### P5：读取兼容 + 写入新名（已闭环）

- `mapPhaseToAgent` 返回新名；读取旧 `assignee` 时 `normalizeAgentName` 归一化（toLowerCase + 幂等）。
- **不强制迁移** `flow.json` 历史 `assignee`；历史日志/assignee 保留可读。

### P6：独立 `openfeel migrate` 命令

- `--dry-run` + 备份 + 回滚；`openfeel update` 检测 legacy 布局**只提示**不静默迁移。

### P8：版本号 stage-39 统一升至 1.1.0

- `package.json` + `.openfeel/config.yaml` + `config.ts` 模板常量 + `AGENTS.md`，一次性收口。

### 兼容性策略（大计划 §六）

| 存量对象 | 处理方式 |
|----------|----------|
| 项目 `.opencode/agents|skills|instructions` 框架资产 | migrate 备份到 `.openfeel/backup/{ts}/` 后清理 |
| 项目自定义 agent/skill（非框架） | **保留原位**（REV-007：逐项比对框架清单，仅删同源条目） |
| 项目 `opencode.jsonc` 非法 `skills` 映射 / `instructions` | 迁移清理，保留用户自定义字段 |
| 项目 `.openfeel/update_state.json` 混合记录 | 拆分：框架条目移入全局 state 并重键，项目条目保留 |
| `flow.json` 旧 `assignee` | 兼容读取，不强制改写（P5） |
| 项目 `AGENTS.md` 混合约束 | 提示用户手工裁剪，不做自动删改 |

---

## 四、Planner 新增判断（超出 P5/P6/P8，供审查 / Schemer 确认）

| # | 判断 | 理由 | 状态 |
|---|------|------|------|
| **M1** | **migrate 采用「顶层 `openfeel migrate` + 子命令」结构**：`openfeel migrate [path]`（默认执行，等价 run）+ `--dry-run` + `openfeel migrate rollback`。与已有 `openfeel flow migrate`（flow.json 结构迁移）**不同域**，两者并存不冲突 | 大计划 P6 只定义「migrate 命令」，未定结构；子命令最小化（run/rollback）避免过度设计 | 待确认 |
| **M2** | **备份目录 `.openfeel/backup/{timestamp}/`**，含 `manifest.json`（记录所有被删/被改文件的源路径、目标备份路径、操作类型、旧 update_state 内容）。回滚即读最近备份目录的 manifest 逆向恢复 | 大计划 §六明确备份到 `.openfeel/backup/{ts}/`；manifest 是回滚可靠性的关键 | 待确认 |
| **M3** | **legacy 判据**（任一即视为 legacy，需迁移）：① 项目 `.opencode/agents/` 含 `.md` 文件；② 项目 `.opencode/skills/` 存在；③ 项目 `.opencode/instructions/core.md` 存在；④ 项目 `opencode.jsonc` 含非法 `skills` 映射（`{name: path}` 对象形式）或 `instructions` 字段；⑤ 项目 `.openfeel/update_state.json` 含旧框架资产 key（`.opencode/...` 相对路径） | 判据须精确到文件级，避免误判；与 update.ts L1348 N8 检测对齐并扩展 | 待确认 |
| **M4** | **migrate 流程顺序**：检测 → 备份 → 全局部署（复用 `updateProject` 的全局部署段）→ update_state 拆分/重键 → 清理 legacy 项目文件（逐项比对框架清单）→ flow.json assignee 报告（不强制改写）。任一步失败则中止并提示回滚 | 顺序保证可回滚性；全局部署复用 stage-37 能力，不重写 | 待确认 |
| **M5** | **flow.json assignee 默认不强制改写**（遵循 P5），migrate 仅在 dry-run 报告 + 执行报告中**列出**旧名条目；提供 `--remap-assignee` 可选开关供用户显式改写 | 大计划 op-001 写「重映射 assignee」，但 §六/P5 明确「不强制改写」——二者调和为「报告 + 可选改写」，默认不改 | 待确认 |
| **M6** | **版本收口清单扩展为 6 处**：package.json、`.openfeel/config.yaml`、`config.ts` 模板常量（×2 语言）、`templates-data/agents-md/{zh-CN,en}.md`（源，经 build 生成 template-loader.ts）、项目根 `AGENTS.md` 版本声明、`CHANGELOG.md` 新增 [1.1.0] 条目。`test/core/update.test.ts` L570 硬编码 `'1.0.9'` 改为动态读取或同步 | 大计划 P8 列三处 + AGENTS.md；实际存在生成段源文件 + 测试硬编码，须一并收口 | 待确认 |
| **M7** | **文档更新范围**：更新「当前文档」（`README.zh-CN.md`/`README.en.md` 的 `/opfx:` 表、`README.md` 快速开始加 migrate、`CHANGELOG.md`）；**不动**「历史文档」（`docs/phase-*`、`docs/research/*`、`docs/v4-summary.md`）；`docs/commands.md` 已标注「适用版本 0.1.0」属过期文档，本阶段**不更新**（避免范围蔓延），仅如需要时在 README 加跳转提示 | stage-36 待确认⑤已定「更新 README/当前文档，不动 docs/phase-* 历史」；commands.md 过期另案处理 | 待确认 |

### 交 Schemer 评估的议题

- **D39-1**：migrate 的「全局部署段」是**复用 `updateProject` 内部逻辑**（抽取共享函数）还是**独立实现**？本计划默认**抽取共享**：将 `update.ts` 中「写全局 core.md/agents/skills/opencode.jsonc」段提取为可复用函数，migrate 与 update 共用，避免双份维护。
- **D39-2**：update_state 拆分时，旧 key（`.opencode/agents/planner.md`）→ 新 key（全局绝对路径 `~/.config/opencode/agents/openfeel-planner.md`）的重键映射规则：本计划默认**按文件名归一化**（旧名 → normalizeAgentName 得新名 → 拼全局绝对路径），无法映射的条目保留在项目 state 并标记待人工处理。
- **D39-3**：回滚粒度：本计划默认**整次 migrate 回滚**（一次 migrate = 一个备份目录，rollback 恢复该目录 manifest 的全部条目），不支持部分回滚（避免过度设计）。

---

## 五、工作阶段（op 级）

### 概览

| op | 主题 | 变更目标 | 文件数 |
|----|------|----------|:--:|
| op-001 | `openfeel migrate` 命令 | NEW `migrate.ts` + NEW `commands/migrate.ts` + 注册 + i18n + 测试 | ~6 |
| op-002 | 存量读取兼容收尾（P5 验证 + update_state 旧格式降级） | 验证 normalizeAgentName 覆盖点；update-state 旧格式降级补漏 | ~2 |
| op-003 | 文档 + 版本 1.1.0 收口 | 版本 6 处 + README/CHANGELOG + kb 引用检查 | ~10 |
| op-004 | 全量回归 | build + test + lint i18n/kb | ~0（验证） |

### 依赖图

```
op-001（migrate 命令：检测/备份/迁移/回滚）
   │ hard
   ▼
op-002（存量读取兼容收尾：P5 验证 + update_state 旧格式降级）
   │ soft（migrate 的 update_state 拆分依赖 op-002 的降级兼容结论）
   ▼
op-003（文档 + 版本 1.1.0 收口）
   │ hard
   ▼
op-004（全量回归：build + test + lint）
```

- op-001 先导（migrate 命令，无硬依赖；复用 stage-35 fs + stage-37 部署 + stage-38 managed-region）。
- op-002 hard 依赖 op-001（update_state 拆分/重键是 migrate 的一部分，降级兼容结论回填）。
- op-003 hard 依赖 op-001/002（版本收口与文档更新在迁移逻辑定型后执行，避免返工）。
- op-004 hard 依赖 op-001/002/003（全量回归兜底）。

---

### op-001：`openfeel migrate` 命令

> **目标**：落地 P6——显式迁移命令，检测 legacy 布局 → 备份 → 全局部署 → 状态拆分/重键 → 清理 → assignee 报告，支持 `--dry-run` 与回滚。
> **前置依赖**：无（复用 stage-35/37/38 能力）
> **规模**：~6 文件
> **含 M1/M2/M3/M4/M5 + D39-1/2/3**

#### 命令设计

```
openfeel migrate [path]            # 默认执行迁移（等价 run）
openfeel migrate [path] --dry-run  # 预览迁移计划，不写盘
openfeel migrate rollback          # 回滚最近一次迁移（读 .openfeel/backup/{latest}/manifest.json）
openfeel migrate [path] --remap-assignee   # 可选：改写 flow.json 旧 assignee 为新名
```

#### 检测逻辑（M3，legacy 判据）

```
detectLegacy(projectPath): LegacyReport {
  projectOpendirAgents:      .opencode/agents/ 含 .md 文件
  projectOpendirSkills:       .opencode/skills/ 存在
  projectOpendirInstructions: .opencode/instructions/core.md 存在
  legacyJsoncSkillsMapping:   opencode.jsonc 的 skills 为 {name:path} 对象映射（非法）
  legacyJsoncInstructions:    opencode.jsonc 含 instructions 字段
  mixedUpdateState:           .openfeel/update_state.json 含 .opencode/... 旧框架 key
  // 任一为 true → legacy
}
```

#### 备份机制（M2）

- 备份根：`.openfeel/backup/{yyyyMMddHHmmss}/`（唯一时间戳）。
- 备份内容：所有将被删除的 legacy 文件（`.opencode/agents/*`、`.opencode/skills/*`、`.opencode/instructions/*` 中**框架同源**条目）+ 旧 `opencode.jsonc` + 旧 `.openfeel/update_state.json`。
- `manifest.json`：记录每条 `{ op, source, backupPath, hash }` + 时间戳 + openfeel 版本。
- 写盘走 `atomicWriteFileSync`；全局 opencode.jsonc 合并走 `withFileLock`。

#### 迁移流程（M4）

1. **检测**：`detectLegacy` 判定；无 legacy → 输出「已是最新布局，无需迁移」并退出。
2. **备份**：写 `.openfeel/backup/{ts}/` + `manifest.json`。
3. **全局部署**：复用 update 的全局部署段（写 `~/.config/opencode/{core.md,agents/*,skills/*}` + 深度合并全局 `opencode.jsonc`）——D39-1 抽取共享函数。
4. **update_state 拆分/重键**：旧项目 state 的框架条目（key 匹配旧 `.opencode/...`）→ 归一化新名 → 移入全局 state（绝对路径 key）；项目条目保留在项目 state。D39-2 重键规则。
5. **清理 legacy 项目文件**：逐项比对框架清单（REV-007），仅删与框架 agent/skill 同源条目；**非框架资产标记「项目自定义」保留原位**，在报告中单列。
6. **flow.json assignee 报告**：扫描存量 flow.json 旧名 assignee，dry-run/执行报告列出；仅 `--remap-assignee` 时改写（M5）。
7. **清理项目 opencode.jsonc**：移除非法 `skills` 映射 + `instructions` 字段，保留用户自定义字段。

#### 回滚机制（D39-3）

- `rollback` 读 `.openfeel/backup/{latest}/manifest.json`，逆向恢复所有备份文件到源路径；恢复旧 `update_state.json`（从全局 state 移除迁移期新增的框架条目 + 项目 state 恢复）。
- 回滚同样支持 `--dry-run` 预览。

| # | 任务 | 描述 | 涉及文件 |
|---|------|------|----------|
| 1 | 新建 migrate 核心模块 | NEW `src/core/migrate.ts`：`detectLegacy` / `backupLegacy` / `migrateProject` / `rollbackMigration` / `splitUpdateState` / `remapAssignees`。复用 `update-state.ts`、`global-paths.ts`、`managed-region.ts`、`fs/*` | NEW `src/core/migrate.ts` |
| 2 | 新建 migrate 命令 | NEW `src/commands/migrate.ts`：注册 `openfeel migrate` + `rollback` 子命令 + `--dry-run` / `--remap-assignee` | NEW `src/commands/migrate.ts` |
| 3 | 注册命令 | `src/cli/index.ts` 追加 import + `registerMigrateCommand` | MOD `src/cli/index.ts` |
| 4 | i18n 键 | `migrate.*` 域新增（检测报告/备份/部署/拆分/清理/assignee/回滚/错误提示），zh-CN + en 对称 | MOD `src/core/i18n-data/zh-CN.ts` + `en.ts` |
| 5 | 抽取共享部署函数 | 将 `update.ts` 全局部署段（core.md/agents/skills/opencode.jsonc）提取为可复用函数，migrate 与 update 共用（D39-1） | MOD `src/core/update.ts` |
| 6 | 测试 | legacy fixture（含项目自定义 agent/skill）验证 detect/dry-run/执行/回滚/保留非框架资产 | NEW `test/core/migrate.test.ts` + `test/commands/migrate.test.ts` |

**完成标准**：
- `openfeel migrate --dry-run` 在 legacy fixture 上输出完整迁移计划（检测→备份→部署→拆分→清理→assignee 报告），不写盘。
- 实际执行后：项目 `.opencode/agents|skills|instructions` 框架资产被清理、非框架资产保留原位；旧 `opencode.jsonc` 非法字段被清理且用户字段保留；update_state 完成拆分/重键。
- `openfeel migrate rollback` 可恢复执行前状态。
- 测试全绿，含「项目自定义资产保留（REV-007）」断言。

---

### op-002：存量读取兼容收尾

> **目标**：确认 P5 已闭环（不重复实现），补 `update_state` 旧格式加载降级兼容的缺失项。
> **前置依赖**：hard: op-001（migrate 的 update_state 拆分依赖本 op 结论）
> **规模**：~2 文件

#### 调研结论（本 op 执行时需复核）

- P5 `normalizeAgentName` 已覆盖全部展示点（flow/view/metrics），`mapPhaseToAgent` 已返回新名——**无剩余工作**，仅需新增/补强测试断言确认无遗漏旧名硬编码。
- 双 state 路由已实现——**无剩余工作**。
- 剩余补漏：`loadUpdateState` 对旧格式（含框架资产 key）的降级行为——当前 Zod schema `files: Record<string, FileState>` 对旧 key 是**宽松兼容**（不校验 key 值），但 migrate 拆分时需识别旧 key。确认降级不丢记录（kb troubleshooting #update_state.json 降级风险排查）。

| # | 任务 | 描述 | 涉及文件 |
|---|------|------|----------|
| 1 | P5 覆盖点验证 + 补测 | 全库 grep 确认无旧 assignee 硬编码残留；补强 normalizeAgentName 接入点断言（flow/view/metrics 展示路径） | MOD `test/core/flow-manager.test.ts` |
| 2 | update_state 旧格式降级确认 | 确认 `loadUpdateState`/`loadGlobalUpdateState` 对旧格式（混合 key）的加载行为不丢记录；如需，补旧 key 识别辅助函数供 migrate 拆分使用 | MOD `src/core/update-state.ts`（如需）+ 测试 |

**完成标准**：
- 全库无旧 assignee 硬编码残留（grep 断言）。
- update_state 旧格式加载降级兼容有测试覆盖，migrate 拆分重键依赖其结论。

---

### op-003：文档 + 版本 1.1.0 收口

> **目标**：版本 6 处同步 + README/CHANGELOG 更新 + kb 引用检查（P8 + M6 + M7）。
> **前置依赖**：hard: op-001/002
> **规模**：~10 文件

#### 版本收口清单（M6）

| # | 位置 | 变更 |
|---|------|------|
| 1 | `package.json` | `version: 1.0.9` → `1.1.0` |
| 2 | `.openfeel/config.yaml` | `meta.version: 1.0.9` → `1.1.0` |
| 3 | `src/core/config.ts` | `CONFIG_TEMPLATE_ZH/EN` 内 `version: 1.0.9` → `1.1.0`（L307/L364） |
| 4 | `src/core/templates-data/agents-md/zh-CN.md` + `en.md` | `v1.0.9` → `v1.1.0`（版本声明节；经 `npm run build` 重生成 `template-loader.ts`） |
| 5 | `AGENTS.md`（项目根） | 版本声明 `v1.0.9` → `v1.1.0` |
| 6 | `CHANGELOG.md` | 新增 `[1.1.0] - 2026-09-25` 条目（Added/Changed 汇总 v1.1 六阶段） |

#### 文档更新范围（M7）

| 文档 | 动作 |
|------|------|
| `README.zh-CN.md` / `README.en.md` | 更新 `/opfx:` 技能映射表（L98-109）→ `openfeel-` 前缀技能名 |
| `README.md` | 快速开始加 `openfeel migrate` 一句 + 跳转 |
| `CHANGELOG.md` | 新增 [1.1.0] 条目 |
| `docs/phase-*`、`docs/research/*`、`docs/v4-summary.md` | **不动**（历史文档） |
| `docs/commands.md` | **不更新**（已标注 0.1.0 过期，另案处理） |
| kb 引用 | 检查 `.openfeel/kb/` 是否有需同步的版本/路径引用（lint kb 兜底） |

| # | 任务 | 描述 | 涉及文件 |
|---|------|------|----------|
| 1 | 版本 6 处同步 | 按上表同步版本号；`npm run build` 重生成 `template-loader.ts` | package.json、config.yaml、config.ts、agents-md zh/en、AGENTS.md、CHANGELOG.md |
| 2 | README 更新 | `/opfx:` → `openfeel-`；README.md 加 migrate | README.zh-CN.md、README.en.md、README.md |
| 3 | CHANGELOG 1.1.0 条目 | 汇总 v1.1 六阶段 Added/Changed | CHANGELOG.md |
| 4 | kb 引用检查 | 检查 kb 中版本/路径引用是否需同步；同步测试硬编码 `'1.0.9'` | test/core/update.test.ts（如需） |

**完成标准**：
- 版本 6 处一致为 `1.1.0`；`npm run build` 后 `template-loader.ts` 生成段版本同步。
- README 无 `/opfx:` 残留（grep 断言）；CHANGELOG 含 [1.1.0] 条目。
- 历史文档 docs/phase-* 未改动。

---

### op-004：全量回归

> **目标**：`npm run build && npm test` 全绿；`lint i18n / kb` 零错误。
> **前置依赖**：hard: op-001/002/003
> **规模**：验证性（无新文件，修复回归问题）

| # | 任务 | 描述 | 涉及文件 |
|---|------|------|----------|
| 1 | build + test | `npm run build` 一致性校验通过；`npm test` 全绿（当前基线 545 + 新增 migrate 测试） | — |
| 2 | lint i18n / kb | `openfeel lint i18n`（双语键对称）+ `openfeel lint kb`（过期引用）零错误 | — |
| 3 | 修复回归 | 若 build/test/lint 发现回归，修复并重新验证 | 视情况 |

**完成标准**：
- `npm run build` 通过（含 build.js 单源/版本一致性校验）。
- `npm test` 全绿（545 + migrate 新增测试）。
- `openfeel lint i18n` / `openfeel lint kb` 零错误。

---

## 六、测试策略

| 验证点 | op | 方式 |
|--------|----|------|
| legacy 检测 | op-001 | `detectLegacy` 单测：构造含/不含 legacy 的 fixture 目录断言判据 |
| migrate dry-run | op-001 | fixture 上 `--dry-run` 输出完整计划且不写盘（前后文件快照一致） |
| migrate 执行 | op-001 | 执行后：框架资产清理、非框架资产保留（REV-007）、jsonc 非法字段清理、state 拆分重键 |
| migrate 回滚 | op-001 | `rollback` 恢复执行前状态（文件 + state + jsonc） |
| P5 覆盖点 | op-002 | normalizeAgentName 接入点断言 + 全库无旧名硬编码 grep |
| update_state 旧格式降级 | op-002 | 旧格式（混合 key）加载不丢记录断言 |
| 版本一致性 | op-003 | 断言 6 处版本号一致为 1.1.0 |
| 全量回归 | op-004 | build + test + lint i18n/kb |

**legacy fixture 设计**：
- `test/fixtures/legacy-project/`：`.opencode/agents/planner.md`（框架）+ `.opencode/agents/custom-agent.md`（项目自定义）+ `.opencode/skills/check-kb/SKILL.md` + `.opencode/instructions/core.md` + 非法 `skills` 映射 `opencode.jsonc` + 混合 `update_state.json`。
- 断言 migrate 后 `custom-agent.md` 保留原位（REV-007）。

---

## 七、风险点与回滚

| # | 风险 | 影响 | 缓解 |
|---|------|------|------|
| 1 | **migrate 误删项目自定义 agent/skill** | 高（数据丢失） | REV-007 逐项比对框架清单，仅删同源条目；非框架资产保留原位并在报告单列；测试覆盖 |
| 2 | **备份回滚可靠性** | 高（不可逆操作） | manifest.json 完整记录 + hash 校验 + rollback 前 dry-run 预览；测试覆盖回滚 |
| 3 | **migrate 误写真实全局 `~/.config/opencode/`** | 高（污染本机） | 测试隔离 HOME；部署前备份；dry-run 预览 |
| 4 | **update_state 拆分丢记录 → 全量覆盖** | 中 | 重键 + 备份；降级兼容（kb troubleshooting 已知坑） |
| 5 | **版本 6 处不同步** | 低 | op-003 统一收口 + 断言校验 |
| 6 | **`openfeel migrate` 与 `openfeel flow migrate` 命名混淆** | 低 | 命令 help 明确区分；i18n 文案标注差异 |

**回滚方案**：
- 各 op 独立提交，按 op `git revert`。
- `openfeel migrate` 自带备份目录 + `rollback` 子命令 + `--dry-run` 预览。
- 全局部署出错时从 `.openfeel/backup/{ts}/` 恢复 `~/.config/opencode/` 与 `~/.openfeel/`。
- 版本号仅在本 stage 变更，未发布前回滚无外部影响。

---

## 八、里程碑与交付物

| 里程碑 | op | 交付物 |
|--------|:--:|------|
| 迁移入口落地 | op-001 | `openfeel migrate`（detect/backup/migrate/rollback + --dry-run） |
| 兼容确认 | op-002 | P5 覆盖点验证 + update_state 降级补漏 |
| 版本/文档收口 | op-003 | 6 处版本 1.1.0 + README/CHANGELOG |
| 全量回归 | op-004 | build/test/lint 全绿 |

---

## 九、变更汇总

| 类别 | 预估数量 | 说明 |
|------|:--:|------|
| 新增源码 | 2 | `migrate.ts` + `commands/migrate.ts` |
| 新增命令 | 1 | `openfeel migrate`（+ rollback 子命令） |
| 新增测试 | 2 | `migrate.test.ts` + `commands/migrate.test.ts` |
| 修改源码 | ~5 | cli/index.ts、update.ts（抽取共享）、update-state.ts（如需）、i18n zh/en |
| 文档/版本 | ~10 | package.json、config.yaml、config.ts、agents-md zh/en、AGENTS.md、CHANGELOG.md、README×3 |

> 本计划完成后，由 Archiver 将「存量迁移命令设计」「旧 state 拆分重键」「版本多源同步清单」三条经验沉淀至 kb/patterns.md 与 kb/architecture.md。
