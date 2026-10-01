# 常见问题

> 使用 [+] / [-] 标记管理启用/禁用状态。只能标记禁用不能删除。

## [+] fuzzyCorrectPhase 正则尾部下划线问题 (2026-06-27)

**现象：** 输入 `"plan_pending "`（末尾有空格）时，`replace(/[\s_-]+/g, '_')` 生成 `"plan_pending_"`（尾部下划线），导致枚举匹配失败。

**根因：** 正则替换将末尾空格转为下划线，但 Trim 在替换之后执行，尾部下划线残留。

**修复：** 在正则替换后增加 `.replace(/^_+|_+$/g, '')` 去除首尾下划线。

**见于：** REV-001, Bug #3

## [+] 僵尸检测 filter 失效 (2026-06-27)

**现象：** `checkZombieStates` 中 Bug 检测过滤 `bugFiles.filter(f => f.startsWith(stageId))` 几乎必然返回空数组，僵尸 Bug 检测从不触发。

**根因：** Bug 文件按**模块目录**组织（`{module}/BUG-001_xxx.md`），文件名不以 `stageId` 开头。过滤条件与目录结构不匹配。

**修复：** 代码块替换为注释，说明延迟到 flow.json 增加 bugs 数据结构后完善。

**见于：** REV-003, Bug #18

## [+] repair dry-run 误报"已修复" (2026-06-27)

**现象：**
1. 文件不存在时 dry-run 返回 `fixed: true`（实际未修复）
2. flow.json 正常时返回 `fixed: false` 却被 `exit(1)` 当错误处理

**根因：** 双重缺陷——dry-run 返回值逻辑与命令层对 false 的处理同时出错。

**修复：** 文件不存在时 dry-run 返回 `fixed: false`；命令层对 `fixed: false` 不 `exit(1)`，而是输出"未检测到需要修复的问题"。

**见于：** REV-004, Bug #???

## [+] Schemer 产出路径指向不存在的目录 (2026-06-27)

**现象：** `schemer.md` 产的出路径为 `.openfeel/stages/{stage}/ops/`，但实际计划体系使用 `.openfeel/plan/{stage}/`。

**根因：** 新建 Agent 文件时硬编码了不存在的路径，未与现有 plan 体系对齐。

**修复：** 统一为 `.openfeel/plan/{stage}/ops/op-NNN_{title}.md`

**见于：** REV-008

> **更新于 2026-08-15（v1.0.0-stage-34）**：此历史坑正式收敛。stage-34 将「stages/ vs plan/ 不一致」从局部修复升级为**全链路路径统一**：废弃 `stages/` 作为写入目标（`plan/stage.ts` 与 `plan/scheme.ts` 不再写 `stages/`），改为写入 `plan/{series}/{stage}/` 多级目录；保留 `stages/{stageId}/status.md` 为三级回退的最后一级**只读兜底**。新增 `src/core/plan/path.ts` 作为 stageId↔plan 目录双向映射唯一权威，`findStageStatusPath` 实现三级回退（`plan/{series}/` 精确 → `plan/**` 递归 → `stages/` 兜底）。存量 `stages/` 目录**不迁移、不删除**，仅作历史存档，保证存量项目 status.md 读取不破坏。`getScheme` 的 opId 解析同步用锚定正则 `/^(.+)\.(op-\d+)$/` 而非 split（见 kb/patterns.md #点号分隔符锚定解析模式）。

## [+] architect 审查模板未同步更新 (2026-06-27)

**现象：** `reviewer.md` 新增了 `Tester 标记：→Tester 重点关注` 字段，但 `architect.md` 的审查模板未同步更新。

**影响：** Architect 执行审查时无法通过此字段传递功能边界风险给 Tester，Reviewer↔Tester 闭环在 Architect 审查场景下断裂。

**修复：** `architect.md` 审查模板同步增加 Tester 标记字段。

**见于：** REV-013

## [+] 手动 edit status.md 频繁失败 — 格式匹配脆弱 (2026-07-02)

**现象**：Feel 调度完成后通过 `edit` 工具更新 `status.md` 的 checkbox 或状态字段时，频繁报错 "oldString not found"，即使肉眼看起来匹配。

**根因**：`edit` 工具对字符串匹配要求极其严格（空格/换行/编码/不可见字符），手动构造的 `oldString` 与文件实际内容常有细微差异。

**修复方向**：保留 status.md 作为人类可读快照，但读写操作改为通过 CLI 命令（`openfeel stage`）完成原子操作。与 flow.json 管理模式一致——Agent 不直接修改数据文件，通过 CLI 间接管理。

**见于**：v4-stage-01/02/03 阶段状态更新流程中反复出现。

## [+] Agent prompt 中 CLI 命令引用应预先验证存在性 (2026-07-05)

**现象**：Executor prompt 中写入了 `openfeel flow validate` 命令引用，但实际 CLI 中不存在 `validate` 子命令。Executor 按 prompt 执行时立即遇到"命令不存在"错误。

**根因**：方案制定阶段（Schemer）在编写 Agent prompt 修改时，引用了"理应存在"但实际未实现的 CLI 命令。prompt 中的 shell 命令没有经过存在性验证。

**影响**：REV-002（v4-stage-02）为 high 阻塞级，Executor 前置校验步骤 3a 完全不可用。

**修复原则**：
1. Schemer 在方案中引用 CLI 命令前，应执行 `openfeel flow --help` 确认命令存在
2. 若命令不存在，选择方案 B（用现有命令替代并注明限制）而非假设命令"稍后实现"
3. Reviewer 审查时应实测 prompt 中引用的 CLI 命令

**见于**：REV-002 (v4-stage-02)

> **更新于 2026-07-05**：REV-002 已通过替换为 `openfeel flow health --quick`（现有命令）+ 限制说明的方式修复。

## [+] fast-glob 目录匹配需显式声明 onlyDirectories (2026-07-09)

**现象**：使用 `fg.sync(['plan/*/'])` 匹配子目录时返回空数组，即使目标目录确实存在。实际有 8 个子目录，但输出 0。

**根因**：fast-glob 默认 `onlyDirectories: false`，仅返回文件条目。尾部斜杠 `plan/*/` 不会自动激活目录匹配模式，需**显式声明** `onlyDirectories: true`。

**修复**：
```typescript
// 错误：返回空数组
fg.sync(['plan/*/'], { cwd: openfeelDir })

// 正确：返回目录列表
fg.sync(['plan/*'], { cwd: openfeelDir, onlyDirectories: true })
```
同时移除尾部斜杠（`onlyDirectories: true` 时斜杠不是必需的匹配条件）。

**经验**：使用 fast-glob 匹配目录时，应始终检查是否需要 `onlyDirectories` 选项。若同时匹配文件和目录，使用 `{ onlyDirectories: false }` 或省略该选项，但模式中不要依赖尾部斜杠的隐式行为。

**见于**：REV-002 (v0.4.2-stage-01)

## [+] autoRepairInconsistency 干扰组合条件推进路径 (2026-08-07)

**现象**：使用组合终止条件（`test_passed|review_passed → archiving`）时，阶段在 `test_passed` 状态下被 `autoRepairInconsistency` 自动修复为 `done`，跳过了 `archiving` 阶段。

**根因**：`autoRepairInconsistency`（flow-manager.ts L2135）的修复逻辑之一为：`status=done 但 phase≠done → 同步 phase 为 done`。当阶段 status 已为 `done`（如因测试通过标记）而 phase 为 `test_passed` 时，该逻辑将 phase 强制同步为 `done`。这截断了组合条件中 `test_passed→archiving` 的合法路径——`archiving` 被跳过，归档流程无法执行。

**触发条件**：
1. 阶段的 `status` 字段已为 `done`（常见于快速通过场景：测试通过后 status 直接被标记为 done）
2. `phase` 字段为组合条件中的中间值（如 `test_passed`）
3. `autoRepairInconsistency` 被调用（如 `openfeel flow health`、`openfeel flow repair` 等触发一致性检查）

**影响范围**：非本次 v0.5.3 引入的 Bug——`autoRepairInconsistency` 设计时未考虑组合终止条件场景，属已知遗留项。不影响含 `|` 组合条件以外的常规单条件 transitions。

**临时规避**：在归档完成前避免调用 `autoRepairInconsistency`（即避免 `flow health` / `flow repair` 对 v0.5.3-stage-01 的检查），或手动恢复 phase 后推进。

**建议修复方向**：`autoRepairInconsistency` 在同步 phase 前检查当前 phase 是否在 transitions 中存在合法出边（通过 `getValidTargets`），若存在则不强制同步——仅对无合法出边的"真卡住"状态执行修复。

**见于**：v0.5.3-stage-01 归档阶段（Executor 发现，已记录为遗留项供后续修复）

> **更新于 2026-08-07**：**v0.5.8 已修复根因**——问题核心在 `mapPhaseToStageStatus`（flow-manager.ts:2758）：原实现将 `test_passed` 和 `archiving` 都映射为 `done` status，导致 `autoRepairInconsistency` 检测到 `status=done, phase≠done` 时强制同步 phase 为 done。修复方案：仅 `done` phase 映射为 `done` status；`test_passed` → `testing`，`archiving` → `archiving`。注意 `mapPhaseToStageStatus` 的返回值直接影响 `autoRepairInconsistency` 的触发条件，二者构成耦合——修改映射表时必须考虑兼容性。

## [+] 流水线文件引用断裂的连锁修复 (2026-07-05)

**现象**：v4-stage-02 审查中发现三处引用断裂形成连锁故障：
1. `flow.json` 路径写为根目录 → 实际在 `.openfeel/flow.json`
2. CLI `flow validate` 命令不存在 → 步骤 3a 不可用
3. `pipeline.yaml` 路径错误且文件缺失 → 手动兜底步骤 3b 不可用

三处分属不同层级（文件路径 + CLI 命令 + 配置文件），但共同导致 Executor 前置校验的「步骤 3」完全不可用。

**修复策略**：统一采用"降至现有能力 + 注明限制"原则：
- 路径修正为实际路径 `.openfeel/flow.json`
- 命令替换为现有 `flow health --quick`（注明校验范围差异）
- 不创建新文件，改为引用 FlowManager 内置 transitions 表

**教训**：Agent prompt 中的三层引用（路径/命令/配置文件）应视为一个整体校验单元，在方案阶段逐项验证存在性。

**见于**：REV-001/002/003 (v4-stage-02)

## [+] Git 重命名检测交叉匹配假象 (2026-08-07)

**现象**：使用 `git mv` 将多个平铺目录（如 `plan/v5.8`、`plan/v5.9`、`plan/v5.10`）批量移入同一父目录（`plan/v5/`）后，`git diff` 的重命名检测出现**交叉匹配**——同一源目录下的不同文件被 git 归到不同目标目录。

**具体表现**（v0.5.11-stage-01 实例）：
- `plan/v5.8/status.md` → 被 git 检测为 renamed to `plan/v5/v5.10/status.md`
- `plan/v5.9/overview.md` → 被 git 检测为 renamed to `plan/v5/v5.8/overview.md`
- 原因是这些空模板文件（overview.md / status.md）内容高度相似，git 的相似度算法在多个候选目标中选择了错误匹配

**根因**：git 的 rename detection 基于文件内容相似度（`diff.renameLimit` 和 `-M` 相似度阈值），当多个源目录包含结构相同、内容相近的文件时，git 会将同目录的不同文件交叉分配到不同目标目录，产生随机但看似合理的重命名标注。

**影响**：
- 审查时若轻信 `git diff` 的重命名标注，可能误判文件迁移错误
- 实际 `git mv` 操作是正确的——文件在磁盘上的位置和内容均无误，仅 git 的元数据推断有偏差

**验证方法**：
1. **不依赖 `git diff --stat` 的重命名总结**——它可能将正确的移动标注为跨目录的交叉匹配
2. **以实际文件内容为准**——检查目标目录中每个文件的标题、时间戳、内容是否匹配预期归属
3. **使用 `git diff --name-status` 而非 `--find-renames`**——直接看文件增删，避免被相似度算法误导
4. **对比源端和目标端的文件列表**——确认每个源文件仅在预期目标目录中出现一次

**何时遇到**：
- 批量 `git mv` 结构相似的模板文件（空 overview.md / status.md / plan.md）
- 包含 `__init__.py` 或 `index.ts` 等通用命名的跨目录移动
- 重构项目目录结构时的批量迁移操作

**参见**：v0.5.11-stage-01、.openfeel/code_review/v0.5.11-stage-01.md（心得建议2）

## [+] npm publish 404/403 诊断链：secret 名字不匹配 + 2FA 冲突 (2026-08-08)

**背景**：GitHub Actions workflow 自动发布 npm 包 `openfeel@1.0.1` 失败，经历两个阶段的错误，最终定位为 secret 名字不匹配（404）+ 2FA 与 automation token 冲突（403）。

### 第一阶段：404 错误（secret 名字不匹配）

**现象**：`npm error 404 Not Found - PUT https://registry.npmjs.org/openfeel - Not found`，提示 `'openfeel@1.0.1' is not in this registry.`

**验证**：
- `npm view openfeel` 确认包已存在（1.0.0，维护者 liuary），版本 1.0.1 不冲突
- registry URL 配置正确

**根因**：`.github/workflows/ci.yml` 第26行引用 `secrets.NPM_TOKEN`，但 GitHub 仓库实际配置的 Secret 名为 `OPENFEEL_AUTO_NPM`，名字不匹配导致 token 取空值。

**关键认知**：npm registry 对空/无效/权限不足的 token 故意返回 404（而非 401/403），这是 npm 的安全设计——防止攻击者通过返回码推断包是否存在。所以 **`publish 时的 404 ≠ 包不存在`**，通常指认证失败。

**修复**：ci.yml 第26行 `secrets.NPM_TOKEN` → `secrets.OPENFEEL_AUTO_NPM`（提交 e5485ec）。

### 第二阶段：403 错误（2FA 与 token 冲突）

**现象**（修复 secret 名字后）：`npm error 403 Forbidden - Two-factor authentication is required to publish this package but an automation token was specified`

**根因**：包 `openfeel` 在 npm 网站设置了包级强制 2FA（"Require two-factor authentication to publish"），而使用的是 automation token（legacy 旧式 token）。automation token 设计上绕过 2FA，与包级强制 2FA 冲突 → 被拒。

**关键认知**（基于 npm 官方文档查证）：
- npm 自 2025 年 11 月起移除 legacy token（Automation/Publish/Read-only），只支持 Granular token
- 发布要求："Publishing to npm requires either: 2FA enabled on your account, OR A granular access token with bypass 2FA enabled"
- Granular token 的 "Bypass 2FA" 选项（默认 false）设为 true 时，"takes precedence over account-level and package-level 2FA settings for publishing"——即覆盖账号级和包级 2FA 要求，CI 发布无需 OTP

**解决方案**：创建 Granular token（权限 Read and write + Bypass 2FA 开启 + 指定包 openfeel），更新 GitHub Secret `OPENFEEL_AUTO_NPM`。包级设置保持 "Require two-factor authentication or a granular access token with bypass 2fa enabled"（安全不降级，token 绕过 2FA 仅限发布动作）。

### 诊断要点

| 错误码 | 直觉判断 | 真实含义 | 验证方法 |
|--------|---------|---------|---------|
| 404 Not Found | 包不存在 | 认证失败（空/无效/权限不足 token） | `npm view <pkg>` 确认包存在 + 检查 secret 引用名 |
| 403 Forbidden + 2FA | 权限不足 | automation token 与包级 2FA 冲突 | 检查 token 类型 + 包级 2FA 设置 |

### 官方文档依据

- https://docs.npmjs.com/about-access-tokens ："As of November 2025, only Granular access tokens are supported. Legacy access tokens have been removed."
- https://docs.npmjs.com/configuring-two-factor-authentication ："Publishing to npm requires either: Two-factor authentication (2FA) enabled on your account, OR A granular access token with bypass 2FA enabled"

**见于**：v1.0.0 npm 发布排查（GitHub Actions CI）

## [+] flow.json load() 静默失败：stage.ops 为 null/undefined 时 Object.entries 遍历崩溃 (2026-08-09)

**现象：** `openfeel flow status`、`flow current`、`flow overview` 均报告 "flow.json 不存在"，但 flow.json 文件确实存在且其他字段正常。

**根因：** `FlowManager.load()` 中遍历 `Object.entries(stage.ops)` 时未对 `stage.ops` 做类型守卫。当 flow.json 中某个 stage 的 ops 字段为 null（JSON 解析保留原值）或缺失（undefined）时，`Object.entries(null)` 抛 TypeError，被外层 try-catch 静默捕获后 `this.data = null`，导致所有后续读取（status/current/overview）均报告文件不存在。

**触发条件：**
1. flow.json 中任意 stage 的 ops 字段值为 null（`"ops": null`）
2. 或 stage 对象中不存在 ops 字段（`undefined`）
3. 或其他非普通对象值（数组、字符串等）
4. 调用 `load()` 方法 — 任何 flow 命令（status/current/overview/health/repair）都会触发

**影响范围：** 不仅是 `load()` 中的遍历崩溃，同源崩溃点包括 `summary()`（ops 计数）、`getSummary()`（ops 计数）、`flow overview` 命令中 ops 遍历——共 **4 处** Object.entries(stage.ops) 调用均受波及。

**修复方案：**
1. 在所有遍历 `stage.ops` 的位置增加三重类型守卫：`stage.ops && typeof stage.ops === 'object' && !Array.isArray(stage.ops)`
2. `repair()` 增加 ops 修复逻辑：检测 ops 缺失或非普通对象时重置为 `{}`

**排查经验：**
- JSON 解析后的 `null` 值保留原语义，不等同于 JS 的 undefined 或空对象 —— 需显式检查
- 静默捕获（`try-catch` 仅设 `this.data = null` 而不记录原因）使根因排查困难 —— 建议在 catch 块中至少记录 `err.message` 到日志
- 一处崩溃点被发现后应主动排查同数据结构的其他访问点（全局搜索 `stage.ops` 的所有 `Object.entries`/`Object.keys` 调用）

**验证方法：**
1. 手动构造 flow.json，将某个 stage 的 ops 设为 null → `openfeel flow status` 应正常运行（而非报"不存在"）
2. `openfeel flow repair --dry-run` 检测到缺失 ops 并报告 → `openfeel flow repair` 实际修复为 `{}`

**参见：** v1.0.0-stage-30 op-001

## [+] update_state.json 降级风险：Schema 不匹配或丢失导致全量覆盖 (2026-08-11)

**现象：** 执行 `openfeel update` 后，用户手动修改过的 Agent 定义文件（如 feel.md）被静默覆盖，但预期应触发冲突检测并保留修改。

**根因：** `loadUpdateState()` 在以下情况返回 null，导致 `writeWithMergeDetection` 中 `fileState` 为 undefined：
1. `.openfeel/update_state.json` 文件不存在（首次 update 后意外删除）
2. Zod Schema 校验失败（工具版本升级后字段格式不兼容）
3. JSON 解析失败（文件损坏）

当 `loadUpdateState` → null 时，降级到"全量覆盖"模式——所有文件无论是否被用户修改，都被模板内容覆盖，等同于旧版 update 行为。

**诊断方法：**

```bash
# 检查 state 文件是否存在
ls -la .openfeel/update_state.json

# 检查 state 文件内容是否合法（手动 JSON 校验）
node -e "const s = require('./.openfeel/update_state.json'); console.log(Object.keys(s.files).length + ' files tracked')"

# 查看最近一次 update 记录
openfeel flow log --stage v1.0.0-stage-32  # 若有对应阶段日志
```

**修复与规避：**

1. **预防**：在 CI/CD 或自动化脚本中备份 `update_state.json`，确保升级工具时不丢失
2. **恢复**：若 state 丢失，下一次 `openfeel update` 会自动重建，但首次会全量覆盖。若用户有手动修改的文件，需提前备份
3. **升级路径**：`update_state.json` 的 `openfeel_version` 字段记录写入版本，未来可在 `loadUpdateState` 中增加版本迁移逻辑，而非仅在 Schema 不匹配时返回 null

**设计原理（不是 Bug）：**
- 降级为全量覆盖是**有意为之的安全回退**——相比"因 state 损坏而拒绝更新"，"全量覆盖"是更可用（usable）的选择
- `console.warn` 会输出 Schema 不匹配的详细原因，但用户可能忽略警告

**参见：** v1.0.0-stage-32（update 增量更新 + 冲突标记）、kb/patterns.md #update 增量部署哈希追踪 + 冲突标记三态模式

## [+] 双层模板源发散：init 与 update 部署内容不一致 (2026-08-15)

OpenFeel 的模板部署存在**两层模板源**：

| 内容 | update 路径（AGENT_TEMPLATES） | init 路径（OPENCODE_AGENT_TEMPLATES） |
|------|------|------|
| Agent 模板 | `templates-data/agents/{lang}/` | `templates-data/opencode/agents/{lang}/` |
| core 指令 | `templates-data/core-instructions/{lang}/` | `templates-data/opencode/instructions/{lang}/` |

两层本应逐字符一致，但已发生发散（stage-33 实测）：
- **feel.md**：`agents/` 层含「冲突检测」节（21 行，stage-32 新增），`opencode/agents/` 层缺失（agents=371 行 vs opencode=350 行）；
- **core.md zh**：`core-instructions/zh-CN.md` 缺 Vision（2 处），`opencode/instructions/zh-CN.md` 含 Vision（Vision 扩展 8→9 Agent 遗留）。

**关键坑点**：`build.js` 对两层分别独立校验（`validateAgentDefinitions` vs `validateOpencodeAgentTemplates`），**无跨层比对**，因此发散不会被 `npm run build` 报错，却会导致 init（`deployOpencode`）与 update（`loadTemplate`）部署内容不一致。

**规避方法**：改双层模板时必须「**按节锚点定点编辑、禁止整文件复制**」——整文件复制会抹掉或错位既有差异（如决策追加节因 opencode 层缺冲突检测节而上移 21 行，须用锚点文本而非死行号定位）。

**排查教训**：判断两层是否一致时，`git diff --no-index` 比 PowerShell `diff`（=Compare-Object 别名）可靠——计划审查阶段曾误用后者将已发散的两层判为 IDENTICAL，Schemer 阶段用 `git diff` 重新实测才纠正。

**遗留**：发散本身是历史遗留（feel.md 21 行差属 stage-32、core.md Vision 差异属 8→9 Agent 扩展），超出本 stage 范围未修复，需后续 stage 专项收敛。

**参见：** v1.0.0-stage-33（op-001/op-004）、kb/architecture.md #多语言模板数据管线

## [+] 并发写入竞态排查（丢失更新 / 重号 / .bak 被覆盖 / Windows rename 容错）(2026-09-12)

**症状**：多进程 / 多 Agent 并发操作后，共享状态文件出现「丢更新、序号重号、内容交错、`.bak` 失去备份价值、文件半写损坏」。

**根因分类与排查点：**

| 症状 | 根因 | 排查点 |
|------|------|--------|
| 丢失更新 | 无锁 `load → modify → save`，后保存者用旧快照覆盖前者 | 共享写点是否在锁内完成「读-改-写」；是否引入乐观并发校验（`meta.revision`） |
| 序号重号 / 覆盖 | 用「先算 `max+1` 再写」分配序号 | 分配是否以 `O_EXCL` 独占创建为最终依据；`max+1` 是否仅作候选起点 |
| `.bak` 无备份价值 | 写入成功后又用新内容覆盖 `.bak` | 是否「写前复制旧文件、写后不触碰」（S5 语义） |
| 文件半写 / 损坏 | 裸 `writeFileSync` 进程中断 | 是否改用原子写（同目录 temp + fsync + rename） |
| 释放锁报错 | Windows 下 `unlinkSync` 对被占用文件抛 `EPERM/EBUSY` | 释放是否 try/catch 容错并由 TTL 兜底 |
| 并发原子写失败 | Windows 下无锁并发 `rename` 同一目标抛 `EPERM`（实测 6 进程 2 个失败） | 共享写点是否已加锁；无锁点是否满足「唯一文件名 / 单写者假设」 |

**关键排查动作**：
1. grep 全部 `writeFileSync`，逐一确认是否属高风险共享写入点；共享写点必须加锁 + 原子写。
2. 确认序号分配路径的 `parse` 回调**只解析文件名**（不读内容）——否则崩溃残留的空占位文件会导致序号回退 / 重号。
3. 确认 `.bak` 语义为「写前复制」；连续两次 save 后断言 `.bak == 第一次内容`。
4. 并发测试：多子进程写同一计数 / 序号文件，断言无丢失、无重号；子进程不可用时降级为告警跳过（不误报）。
5. Windows 释放锁失败属预期，靠 TTL 兜底；不要「重试释放 / 强制删除」（会与抢占者竞态）。

**参见：** v1.1.0-stage-35 op-001~004、kb/patterns.md #原子写模式、#建议性文件锁模式、#flow.json 乐观并发校验模式、kb/architecture.md #跨进程并发保护架构

## [+] 模型名错误导致 Agent 无法启动：deepseek-v4-flash 已下线 → deepseek-flash (2026-09-25)

**症状：** opencode 会话中报 `Model not found: deepseek/deepseek-v4-flash. Did you mean: ...`，Executor / 事务官（utility）等快速模型 Agent 无法启动。

**根因：** deepseek 平台的 `deepseek-v4-flash` 模型已下线/更名，正确的快速模型标识为 `deepseek-flash`。frontmatter 里残留旧名导致平台按字面模型名查找失败。

**修复范围（改名须全链路同步，否则 build 重生成会把旧名带回来）：**

1. **agent 文件 frontmatter**：.opencode/agents/openfeel-executor.md、`openfeel-utility.md` 的 `model: deepseek/deepseek-v4-flash` → `deepseek/deepseek-flash`。
2. **模板源**：`src/core/templates-data/opencode/agents/{zh-CN,en}/openfeel-executor.md`、`openfeel-utility.md`（权威源，build 的读取对象）。
3. **生成段**：`src/core/template-loader.ts`（9 处）、`src/core/update.ts` 的 `SKILL_DEFINITIONS` 段——这些是 `npm run build` 的产物，源改了之后须重新 build 才会清除。
4. **硬编码模板常量**：`src/core/config.ts` 的 `CONFIG_TEMPLATE_ZH/EN` 中 `model_name: deepseek-flash`（L350/L407）；`.openfeel/config.yaml` 的 `models.roles` 同步。

**关键坑点：** 若只改 agent 文件而不改模板源 + 重新 build，`openfeel init` / `openfeel update` 部署到新项目时仍会写入旧模型名，问题复发。改后须**重启 opencode 会话**（frontmatter 修改不热生效）。

**排查方法：** `rg "deepseek-v4-flash"` 全库搜索（排除 `docs/` 历史记录、`.openfeel/tmp/` 测试 fixture），确认 `src/` 与 `.opencode/` 下清零。

**参见：** v1.1.0-stage-36 op-004（附带修复）、kb/setup.md #OpenCode Agent 模型配置（model 格式 `provider/model-name`）

## [+] opencode instructions 路径 `~` 不展开（debug config 输出保留字面 `~/...`）(2026-09-25)

**现象：** 全局 opencode.jsonc 的 `instructions: ["~/.config/opencode/openfeel/core.md"]`，用 `opencode debug config` 查看时输出**原样保留** `"~/.config/opencode/openfeel/core.md"`（未展开为绝对路径）。

**实测结论（op-000，真实 CLI 子进程 + 隔离 HOME）：**

| 层 | `~` 是否展开 | 证据 |
|----|-------------|------|
| 配置值层（`debug config` 输出） | **不展开** | 输出原样 `~/...` |
| 加载层（实际加载 core.md） | **展开并成功加载** | 指令型探针回显命中 token |

> 即：`~` 在 `debug config` 展示层不展开，但在**加载层实际会展开且可成功加载**——与计划阶段「未展开→必须绝对路径」的直觉预判不同。这是「加固而非推翻」。

**处置（仍采用绝对路径）：** 框架仍用绝对路径（`getGlobalCoreMdPath()` → `~/.config/opencode/openfeel/core.md` 经 `homedir()` 解析为绝对路径）写入全局 `opencode.jsonc` 的 `instructions`。理由：配置值层可读（`debug config` 显示完整路径而非 `~`）、跨平台无歧义、不依赖 opencode 内部展开实现（版本变更可能破坏 `~` 展开）。

**排查经验：**
- 判断「路径是否展开」须区分**展示层**与**加载层**，两者可能不同——不能仅凭 `debug config` 输出下结论「不展开 = 不会加载」。
- 验证「文件是否真的被加载进 agent 上下文」用**指令型探针**（在 core.md 写「回复开头必须输出 token XXX」→ `opencode run` grep 回显），而非「请复述系统提示词」（会被模型安全策略拒答）。
- 隔离全局路径用环境变量 `USERPROFILE`/`HOME`/`XDG_CONFIG_HOME` 指向临时目录，全程不污染真实 `~/.config/opencode/`。

**参见：** v1.1.0-stage-37 op-000、`.openfeel/plan/v1/stage-37/op-000-findings.md`、kb/architecture.md #全局部署架构

## [+] agent_manager_tool schema 未定义静默丢弃 (2026-09-25)

**现象：** 全局 opencode.jsonc 写入 `experimental.agent_manager_tool: true` 后，`opencode debug config` 输出 `"experimental": {}`（字段被丢弃），**无报错、无警告、exit 0**。

**根因：** 现行 opencode config schema（`https://opencode.ai/config.json`）的 `experimental` 对象**未定义** `agent_manager_tool` 字段，且 schema 采用「未知字段静默丢弃」而非「报错拒绝」策略。

**影响：** 静默丢弃比报错更危险——配置了看似生效、实则无效的字段，且无任何提示可发现。若不实测，会误以为该字段已启用。

**处置（N3 三选一 → 移除）：** 实测确认 schema 未定义后，选择**移除**该字段：
- `buildGlobalOpencodeFrameworkObj()` 不再写 `experimental` 块（源码注释标注 N3 依据）。
- 同步删除模板 `templates-data/opencode/opencode.jsonc` 的 `experimental` 块（D37-2）。

**排查经验：**
- opencode 配置字段是否生效**不能只看 schema 是否允许写入**——运行时「静默丢弃」无任何告警，须用 `opencode debug config` 实测最终生效值。
- 判断「字段该保留还是移除」遵循「实测优先于猜测」（AGENTS.md 第 6 条）：schema 已定义→保留；未定义但运行时静默接受→记录依据后保守保留或移除；运行时报错→移除。本案例为「未定义 + 静默丢弃」→ 移除。

**参见：** v1.1.0-stage-37 op-000/op-003、`.openfeel/plan/v1/stage-37/op-000-findings.md`、kb/architecture.md #全局部署架构

## [+] malformed 标记死循环排查：多对/不成对标记的降级策略 (2026-09-25)

**现象：** 目标文件含多对 `<!-- openfeel:begin/end -->` 或 begin/end 不成对时，若每次 update 都「追加受管区」，会导致每次 update 都判 malformed → 无限重复追加，文件持续膨胀。

**根因：** malformed 状态下 `parseRegion` 返回 `status: 'malformed'`，无法定位唯一受管区，任何「区内替换」或「追加」都会在下次 update 重新触发相同判定，形成死循环。

**修复（REV-1001 修订）：**

- malformed 分支**不写盘、不追加、不覆盖**，仅写 `update_infos.md` 异常条目（kind=anomaly）待人工修复。
- anomaly 条目按路径去重（同路径未修复的 anomaly 只记一条），杜绝 update_infos.md 无限累积。
- 用户手动修复为「恰好一对完整标记」后，下次 update 自动走 ok（区内替换）/ none（hash 兜底）正常路径，不再记 anomaly。

**排查经验：**

- 「追加即建区」只适用于**无标记（none）**文件；**malformed 绝不追加**——二者降级路径不同（none→追加建区；malformed→不写盘 + 记 anomaly）。
- 验证幂等：连续两次 update 后断言目标文件内容逐字符不变、update_infos.md 只多一条（或零条，去重后）anomaly 条目。

**参见：** v1.1.0-stage-38 op-002/op-004、kb/patterns.md #malformed 降级防死循环模式

## [+] migrate 中途失败排查：异常路径提示 + manifest 回填 + rollback 清理 (2026-09-25)

**现象：** `openfeel migrate` 在全局部署/state 拆分中途抛异常（如首次 agent 部署 EEXIST）时，若让堆栈直接外泄，用户既不知道能回滚、也不知道已部署了哪些全局资产，陷入「半迁移」状态。

**根因：** 迁移是多步写盘操作。步骤 2（全局部署）中途失败时，后续 manifest 回填与清理都不会执行，`manifest.globalStateKeys` 保持空，rollback 无法清理已写入的全局 state 记录。

**修复（REV-1404 / REV-1405）：**

- **命令层 try-catch**：`migrate` action 包裹 try-catch，失败输出 i18n `migrate.error.aborted`（含「可执行 `openfeel migrate rollback` 回滚」提示），`process.exit(1)`——不让堆栈直接外泄。
- **manifest 回填纳入 finally**：全局部署 + state 拆分包在 `try/finally`，finally 中回填 `manifest.globalStateKeys`（已部署的全局 state key）并 atomicWrite manifest.json——中途异常也能记录已部署 key，rollback 据此清理。
- **splitUpdateState 复用全局 state**：新增可选参数 `globalStateIn`，`migrateProject` 复用已加载的 globalState，消除重复 loadGlobalUpdateState IO（REV-1402）。

**排查经验：**

- 多步写盘操作的关键中间态（已部署 key 清单）必须**写入幂等可读的 manifest 并在 finally 回填**，否则异常路径无法回滚。
- 异常提示要「可操作」：不只报错，要指出「可 `openfeel migrate rollback` 回滚」的下一步动作。
- 验证：临时脚本注入首次部署失败，断言 stderr 含回滚提示 + `manifest.globalStateKeys.length === 1`（含已部署的 core.md）。

**参见：** v1.1.0-stage-39 op-001、`.openfeel/tmp/op-rev-stage-39-test-report.md`、kb/architecture.md #存量项目迁移架构

## [+] opencode 模型解析优先级排查：frontmatter 覆盖 opencode.jsonc agent.model（与直觉相反）(2026-09-25)

**现象：** 改了 `opencode.jsonc` 的 `agent.<name>.model` 后 Agent 实际仍用旧模型；或改了 agent markdown frontmatter `model:` 后模型立即变化。

**根因（REV-1606 实测勘误）：** opencode 官方配置源优先级为「project config < .opencode 目录（agents 等）」，故 **agent markdown frontmatter `model:` 覆盖 opencode.jsonc 的 `agent.<name>.model`**，真实优先级链：

```
项目 agents/*.md frontmatter > 全局 agents/*.md frontmatter >
项目 opencode.jsonc agent.model > 全局 opencode.jsonc agent.model > opencode 默认
```

这与直觉（「jsonc 更权威、覆盖 frontmatter」）相反——stage-40 计划初期（REV-1501）曾假设「jsonc > frontmatter」，op-001 步骤 0 用隔离 HOME + opencode 1.18.30 `debug config` 实测推翻。

**重要坑位：**
- skill L43 旧说「frontmatter model 声明性、不直接控制平台模型分配，实际由 jsonc 控制」是**过时错误**；实测 frontmatter **生效且优先**。
- 因此改模型时：若只改 jsonc 而 frontmatter 有显式值，改动被 frontmatter 遮蔽不生效；须改 frontmatter（或两处同步保持一致）。
- 本阶段已在 `model-config.ts` 落地修正链：`effective = default > project > global`（default 层多源不一致时以 frontmatter 为准，置 `inconsistent`）；CLI get 输出遮蔽提示（REV-1701）。

**排查动作：** 改模型不生效时，先 `openfeel model get <agent>`（或 `opencode debug config`）查各层显式值，确认生效源是 frontmatter 还是 jsonc，再定位应改的层。

**参见：** v1.1.0-stage-40 op-001 步骤 0、kb/architecture.md #模型配置三层级架构、kb/setup.md #OpenCode Agent 模型配置

## [+] opencode 全局 AGENTS.md 加载排查：自动加载 YES / 并存拼接 / 移除 instructions 仍生效 (2026-09-26)

**背景：** v1.1.1 把框架约束从 core.md（instructions）迁到全局 `~/.config/opencode/AGENTS.md`，须实测全局 AGENTS.md 是否自动加载、与项目 AGENTS.md 如何合并、移除 instructions 后约束是否仍生效。

**实测结论（op-000，真实 CLI 子进程 + 隔离 HOME）：**

| 验证项 | 结论 |
|--------|------|
| 全局 `~/.config/opencode/AGENTS.md` 自动加载 | **YES**（项目 opencode.jsonc 为 `{}` 时仍加载） |
| 全局 + 项目 AGENTS.md 并存 | **拼接**（不覆盖） |
| 移除 instructions 后约束仍生效 | **YES** |

**排查方法：**

- 验证「约束是否加载进 agent 上下文」用**指令型探针**（在 AGENTS.md 写「回复开头必须输出 token XXX」→ `opencode run` grep 回显），而非「请复述系统提示词」（会被模型安全策略拒答）。
- 隔离全局路径用环境变量 `USERPROFILE`/`HOME`/`XDG_CONFIG_HOME` 指向临时目录，全程不污染真实 `~/.config/opencode/`。

**经验：**

- AGENTS.md 自动加载是 opencode 的**约定行为**（与 instructions 字段无关），故约束载体从 instructions/core.md 迁到全局 AGENTS.md 是安全的——移除 instructions 后约束仍生效（实测确认）。
- 全局 + 项目 AGENTS.md **拼接而非覆盖**，故「项目级去约束化」（框架通用约束归全局、项目只留项目特有约束）不会丢失约束，二者互补加载。

**参见：** v1.1.1-stage-01 op-000、kb/architecture.md #全局约束架构、kb/troubleshooting.md #opencode instructions 路径 ~ 不展开
## [+] `flow phases` 自描述 phase 与 `flow advance` 接受集合不一致（第二信源残留）(2026-09-29)

**现象**：自定义 `.openfeel/pipeline.yaml` 在 `phases` 中新增内置 15 项之外的 phase（如 `gate`）后，`openfeel flow phases` 把 `gate` 宣称为合法且可达（列出 `plan_passed → [gate]`），但 `openfeel flow advance --to gate` 拒绝：`'gate' 不是合法的 PipelinePhase`；加 `--force` 亦失败（模糊修正基于硬编码枚举 → `非法 phase 'gate'，模糊修正失败`）。

**根因**：phase **转移表**已统一到运行时 `pipelineConfig`（展示 `getPipelineTransitions()` 与校验 `hasTransition()`/`getValidTargets()` 同源），但 phase **合法性判定**（`PipelinePhaseSchema` / `PIPELINE_PHASES`）仍是硬编码，二者可能与自描述冲突；而 `pipeline.yaml` 头部却声明「新增/修改流水线阶段只需编辑此文件，不改 TS 源码」，使该缺口更具误导性。属**预存量缺陷**，新增自描述命令使其首次可见。

**排查方法**：

1. 构造含自定义 phase 的 `pipeline.yaml`，对比 `flow phases` 输出集合与 `advance --to` 接受集合；
2. `rg -n "PIPELINE_PHASES" src/` 列出全部使用点，区分「展示源」与「校验源」——若存在两个不同来源即为第二信源。

**避免再犯**：

- 为自描述命令补说明行，标注数据来源与可用边界（如「`advance --to` 目前仅接受内置 15 个 phase」）；
- 或将 `advance` 的 phase 合法性判定也收敛到运行时 `pipelineConfig.phases`，做到真正单一数据源；
- 或在 `pipeline.yaml` 加载时对未知 phase 告警，避免「宣称支持却不生效」。

**参见：** v1.1.2-stage-41 正式测试 cli/BUG-001、kb/patterns.md #CLI 自描述命令模式

> **更新于 2026-09-29（已修复，v1.1.2-stage-47 op-001）**：采纳**方案 B（显式化而非收敛）**——`flow phases` 人类输出在运行时含内置 15 之外 phase 时追加边界说明（i18n `flow.phases.customPhaseNote` zh/en），`--json` 增 `advanceAccepted`（= `PIPELINE_PHASES` 内置 15）。实测（隔离项目 + 自定义 `pipeline.yaml` 含 `gate`）：`phases` 长度 16 / `advanceAccepted` 长度 15 且不含 `gate`；`flow advance --to gate`（含 `--force`）拒绝 → 自描述边界与 `advance` 实际接受集合一致。**保留的结论**：两集合语义角色不同（描述现状 vs 施加约束），不应强行同源（收敛会波及 `PipelinePhase` 类型与模糊修正链）。

## [+] 新增 i18n 键已定义却未接入（死键）：核心层抛中文错误绕过 t() 渲染 (2026-09-29)

**现象**：新增键 `common.stageDirConflictTmpl` 在 `zh-CN.ts` / `en.ts` 双侧均已定义，但 en 语言下 `openfeel plan stage add` / `flow stage add` 的冲突错误仍输出中文——命令层实际走 `common.errorTmpl` + 核心层抛出的中文文案。

**根因**：核心层 `registerStage` / `addStage` 抛错文案为中文硬编码（项目既有惯例），命令层 `catch` 统一用 `common.errorTmpl({msg})` 渲染，专为该场景定义的键从未被任何调用点引用（死键）。**`openfeel lint i18n` 只校验 zh/en 键对称性，不校验键是否被引用，因此死键不报错。**

**排查方法**：从本阶段 diff 提取新增 i18n 键清单，逐键 `rg -n "<key>" src/ test/`；仅出现在 `i18n-data/*.ts` 定义处、无消费点的即为死键。

**避免再犯**：

- 为「需要独立渲染」的错误场景定义键时，**同一提交内**改命令层 `catch` 按错误类型分流并接入该键，或改核心层抛结构化错误（含字段）+ 命令层渲染；
- 新增键后以 `rg` 引用校验兜底，避免「已定义即已覆盖」的错觉；
- 长期可为 `lint i18n` 增加「未引用键」检查（当前仅对称性检查）。

**参见：** v1.1.2-stage-41 正式测试 cli/BUG-002、kb/patterns.md #CLI 国际化封装模式

> **更新于 2026-09-29（已修复，v1.1.2-stage-47 op-001）**：采纳「核心层抛结构化错误 + 命令层按类型渲染」——新增 `StageDirConflictError`（含 `stage`/`other`，`message` 保留原中文文案以兼容既有 `toThrow` 断言），`registerStage`/`addStage` 改抛该错误，三入口（`plan stage add`/`flow stage add`/`stage create`）catch 分流命中时用 `common.stageDirConflictTmpl` 渲染 → **死键消除（3 处使用点）**。实测 `lang=en` 冲突 stderr 为纯英文 `Stage dir conflict: v4.0.0-stage-04 and v4-stage-04 map to the same directory`。**附带更正**：`zh-CN.ts` 内该键 `en: '` 属「单语分文件」模式正常值（en 值在 `en.ts:31`），原判「en 需补全」不成立——死键本质是**无使用点**而非值缺失。

## [+] kb-dedup 去重检索对 CRLF 行尾静默失效（归档官去重降级）(2026-09-29)

> **更新于 2026-10-01（v1.1.2-stage-51 op-007，A6）**：该缺陷对**新暴露的 `openfeel knowledge dedup` 子命令同样生效**——命令复用同一 `findSimilarEntries`/`parseKbFile`，CRLF 分类文件（`patterns.md` CRLF 2730 / `troubleshooting.md` CRLF 758）仍只解析出极少条目，去重建议**静默漏检**。**归档期绕过法（实证有效）**：把 `.openfeel/kb/*.md` 复制到临时目录并做 `\r\n → \n` 归一，再 `node bin/openfeel.js knowledge dedup "<内容>" --project <tmp>`（`basePath` = `<tmp>/.openfeel/kb`）→ 归一后 `patterns.md` 可解析条目恢复为完整集（本次 5 条候选最高相似度 < 4%，全判新增）。**根因修复建议**：在 `parseKbFile` 内做行尾归一（一行改动），可同时修复归档去重与 `knowledge dedup`。

**现象**：归档官调用 `findSimilarEntries(newContent, category)`（`src/utils/kb-dedup.ts`）时返回的相似条目极少——`patterns.md` 的 80 个条目标题仅解析出 2 个，相似度普遍 < 8%，去重形同虚设、极易新增重复条目，且**不报错**。

**根因**：`parseKbFile()` 用 `content.split('\n')` 切行，标题正则 `^##\s+\[([+-])\]\s+(.+?)\s+\((\d{4}-\d{2}-\d{2})\)$` 的 `$` 锚点在 CRLF 文件下无法匹配（行尾残留 `\r`），故仅 LF 行尾的条目被识别。实测：`patterns.md` 原始切分命中 2 条，`\r\n → \n` 归一后命中 75 条（文件共 80 行 `## [+/-]`）；`troubleshooting.md` 为全 CRLF → 命中 0 条。

**排查方法**：

```bash
node -e "const b=require('fs').readFileSync('.openfeel/kb/patterns.md');let c=0,l=0;for(let i=0;i<b.length-1;i++)if(b[i]===13&&b[i+1]===10)c++;for(const x of b)if(x===10)l++;console.log('CRLF',c,'LF',l)"
```

CRLF 计数 > 0 即可疑；或直接对比「`findSimilarEntries` 命中的标题数」与「文件内 `## [+/-]` 行数」。

**避免再犯**：

- 去重检索降级时**改用手动关键词匹配**（提取 `## [+]` 条目标题做核心名词重叠判断，≥60% 标记「疑似重复」不新增，无匹配则标注「未去重，待人工复核」后新增）；
- 根因修复：解析前统一 `content.replace(/\r\n/g, '\n')`，或按 `/\r?\n/` 分割行；
- 归档官每次归档后可做一次「命中数 vs 标题数」比对，作为去重工具健康自检。

**参见：** v1.1.2-stage-41 归档（4 条候选去重实测）、`src/utils/kb-dedup.ts`


## [+] `writeDefaultConfig` 无条件覆盖：`npm test` 静默改写真实 config.yaml (2026-09-29)

**症状**：跑一次 `npm test`（或重复执行 `openfeel init`）后，仓库 `.openfeel/config.yaml` 的 `defaults` 三值被静默还原为模板默认 `manual / disabled / false`；无提示、无备份，且若 HEAD 恰为模板值，`git diff` 甚至为空（伪装成「没有变化」）。

**根因（两层叠加）**：

1. **实现层**：`writeDefaultConfig`（`src/core/config.ts`（420-425 行））无条件 `atomicWriteFileSync` 整体覆写，无 `existsSync` 判断、无备份。`initWorkspaceCore` 的 `existsSync` 只用于 created/updated 分类、**不阻止覆盖**；`initDemo` 有守卫，`update` 仅在 `.openfeel/` 不存在时触发，故 `init` / `init --workspace-only` / `init --demo` **每次必发**。
2. **测试层**：`test/commands/init.test.ts` 的「不传路径时应使用当前工作目录」用例未 mock `process.cwd()`，`init` 以仓库根为 cwd 执行 → 真实文件被覆写（REV-011，high blocking，归 stage-46 REV-001 做实现层修复）。

**诊断步骤**：

1. 取实测值而非推测：`git log --oneline -- .openfeel/config.yaml` 看最后一次提交——若无任何「改回」提交而值却变了，即为代码覆写而非人为；
2. hash 前后比对：记 SHA256 → 跑 `npm test` → 再取 hash（实测 `5229455D…` → `23F76595…`），最直观的证据链；
3. 单文件复现：`npx vitest run test/commands/init.test.ts` 即可命中，无需全量测试；
4. 与 `HEAD` 比对：`git show HEAD:.openfeel/config.yaml` 与工作区实测（本次实测工作区 = HEAD = `auto/enabled/true`）。

**避免再犯（可操作结论）**：

- 测试必须隔离 cwd + homedir（见 patterns「测试 cwd 隔离模式」），并加**反向守卫**断言真实工作区文件逐字不变，随每次 `npm test` 自动生效；
- 覆写前一律走「存在则备份 + 合并写入」，而非整体覆写（`backupFileBeforeWrite` + `backed` 条目，见 stage-46 op-003）；
- 零断言用例是本次的放大器：高危副作用路径必须有可观测断言；
- 恢复手段：从 `%TEMP%\opencode\config.yaml.bug002-backup` 还原后 hash 回到基线（实测有效）。

**同类风险（顺带核验）**：`writeProfile`（`~/.config/openfeel/profile.yaml`）同为无备份整体覆盖，且 `readProfile` 解析失败静默回退 `DEFAULT_PROFILE`，随后的 `ensureProfileDefaults` 会用默认值写回——非法 YAML 时用户画像整体丢失（实测 `name: TestUser → unknown`）。

**参见：** `config/BUG-002`、v1.1.2-stage-42 REV-011、stage-46 REV-001

> **更新于 2026-09-29（实现层根因已消除，v1.1.2-stage-47 op-003）**：`init` 对**已存在**的 `.openfeel/config.yaml` **不再覆盖**（`configExisted` 分支仅 `skipped.push('.openfeel/config.yaml (已存在，保留用户配置)')` + 命令层 `init.skipped` 用户可见提示），并**删除 stage-46 的 `config.yaml` 备份接入块**（无覆盖则无「备份前置」语义，保留会产生误导性 `backed` 条目）；`writeDefaultConfig` 增注释声明「整体覆盖，调用方须先自行守卫」。隔离实测：用户自定义三值 + 自定义键经 `init --workspace-only` 与全量 `init` 两次重跑**哈希均不变**，`update_infos.md` 无该文件 `backed` 条目；`package.json` 备份块仍工作。**保留的同类风险**：`writeProfile`（`~/.config/openfeel/profile.yaml`）仍为无备份整体覆盖 + 解析失败静默回退（未修，见 kb/不修项）。

## [+] 需求/文档记载的根因判断须实测复核（opencode 权限「顶层 permission 不生效」误判） (2026-09-29)

**现象**：`docs/phase-5/07-openfeel-permission-issue.md` §二.1/§二.2 断言「agent 级 `permission` 覆盖顶层 `permission`，故 `external_directory` 不继承顶层 `allow`、回落默认 `ask`」。按此判断制定的规避方案（项目 `agent.<name>.permission` **镜像全量键**）经实测**无效**。

**实测（opencode 1.18.33，隔离 HOME，`opencode run` 判别器 R3/R7）**：

- §二.2 **不成立**：顶层 `permission: "allow"`（`*:allow`）经 `findLast` + `*` 通配**对 `external_directory` 生效**，外部目录免询问 —— **含真实 9-agent 形态**。
- §二.1 属**过度概括**：仅「**同名键** agent 优先」；未声明键由顶层/项目配置生效。
- §五「镜像全量键」规避方案**无效**：合并是按权限键深合并、`.md` 优先，项目 `opencode.jsonc` 无法覆盖 `.md` 已声明的键（R5/R6 实证）。

**排查动作（四步）**：

1. 「文档结论」与「现场现象」矛盾时，**先隔离实测**（见 patterns「隔离 HOME 实测 opencode 行为的方法」），不按文档直接改代码；
2. 用**行为级判别器**（`opencode run` 非 TTY 自动拒绝）+ **对照组**取因果闭环，而非仅看静态 ruleset；
3. 结论与文档冲突时**停下上报**（不越界改他方文档），在 findings 记录「未复现 / 冲突」，**不把未验证结论写入框架文档**；
4. 冲突项转审查/归档阶段统一勘误（本项 → REV-003 → 归档官在需求文档追加「勘误与实测补充」节并注明实测版本）。

**避免再犯**：需求/根因类文档中的机制性断言须标注**实测版本**；据此设计的规避方案须**先证伪再落地**；「未复现」须如实记录（含成因未定的说明），不得为凑结论补白成因。

**参见：** `.openfeel/plan/v1/stage-44/op-001-findings.md` §八、`docs/phase-5/07-openfeel-permission-issue.md` 勘误节、v1.1.2-stage-44 REV-003

## [+] 多源文案同步陷阱：模板权威源与仓库根手维护文件双份同句易只改一处 (2026-09-29)

**现象**：本仓库中同一语义句存在**两份存放**——模板权威源 `src/core/templates-data/agents-md/{zh-CN,en}.md`（经 `openfeel setup` 部署为**所有项目**的全局 `AGENTS.md`）与**仓库根 `AGENTS.md`**（手工维护、仅本仓库可见）。v1.1.2-stage-45 只泛化了仓库根 `AGENTS.md:122`，模板权威源 `agents-md:112` 未同步 → **用户可见度最高**的一份仍以「框架部署目标」口吻硬编码 opencode 全局绝对路径（`templates/BUG-002`，medium 非阻塞）。同类问题在 `templates/BUG-001` 已发生过一次，属**重复模式**。

**根因**：`build.js:143` 对 agents-md **仅注入 `AGENTS_MD_TEMPLATES` 生成段，不写仓库根 `AGENTS.md`**；两者无单一源约束、无一致性断言 → 改一处**不会触发任何失败**（build 一致性校验、测试、lint 均绿）。

**排查方法**：

```bash
# 双源比对：关键句片段同时搜索模板源与仓库根
rg -n "关键句片段" src/core/templates-data AGENTS.md
# 权限部署落点专项（本案例）
rg -n "agents/\*\.md" src/core/templates-data/agents-md AGENTS.md
```

口诀：**「仓库根有 `AGENTS.md`，若与模板源同句，改一处必查两处」**；文案类改动收尾时应把「关键句全仓 `rg` 遍历」列为**必做步骤**（按行号盘点无法覆盖「同语义句的其它副本」——本案例即 A 类清单只登记了 `agents-md:3`，漏掉 stage-44 新增的 `:112`）。

**避免再犯**：

- 修改模板权威源后，`npm run build` 会自动传播到部署产物（生成段 + `.opencode/` 自举），但**仓库根 `AGENTS.md` 不在此链路** → 改任一侧时**同批核对另一侧**；
- 可为「双份同句」加**一致性断言**（类似 stage-45 的泛化锁断言），把人工核对变成机器护栏；
- 归档/审查时把「模板源 vs 仓库根镜像」列入文案变更的固定检查项。

**参见：** `templates/BUG-002`（本阶段）、`templates/BUG-001`（closed，同模式首次发生）、`.openfeel/bugs/templates.md`、kb/troubleshooting.md #双层模板源发散、kb/patterns.md #AGENTS.md 模板同步模式

## [+] 「备份失败绝不覆盖」的失败路径语义分叉：受管文件跳过继续 vs jsonc 直写整体中止 (2026-09-29)

**现象**：同一份「备份失败绝不覆盖」需求在不同接入链路表现不一致（v1.1.2-stage-46 实测）：

| 链路 | 备份失败时行为 | 退出码 |
|------|----------------|:--:|
| 受管文件（`writeManagedFile` 三改写分支） / `init` 的 `config.yaml`、`package.json` | 跳过该文件写入 + `anomaly(note='backup_failed')` + `warn`（**命令继续**） | 0 |
| 全局 `opencode.jsonc` 三处直写（`setup` / `update` / `migrate`） | `BackupError` 上抛，**整条命令中止** | 1 |

**根因**：方案伪代码层面的缺口——受管路径分支写了 `try/catch`，jsonc 直写路径的伪代码未包 `try/catch`，执行方按方案如实实现（并在偏差记录披露）。**不是实现偏差，是设计缺口**。

**为何可接受（可裁定为非阻塞 fail-fast）**：① **数据安全无损**——abort 路径下「无备份不覆盖」以最强形式成立（jsonc 原样保留）；② **状态可自愈**——三命令的 `saveGlobalUpdateState` 均在尾部，中止时全局 state 未落盘，重跑即重部署；`migrate` 另有 `finally` 回填 `manifest.globalStateKeys` + `rollbackMigration` 事务兜底；③ **失败响亮**——含路径 + 原因 + 非零退出，比 exit 0 的静默半完成更透明。

**唯一实质偏差**：`setup`/`update` 执行顺序为「受管资产 → jsonc」，jsonc 备份失败时前面的资产**已写入** → 命令中止于**部分部署**状态（非数据不一致、非数据丢失，重跑收敛）。

**排查动作**：

```bash
# 逐链路比对错误处理；对同一故障注入分别跑两条链路
rg -n "backupFileBeforeWrite" src/core          # 找出全部接入点，逐个看是否在 try/catch 内
# 故障注入：把备份根构造为文件 → ENOTDIR
```

分别断言「退出码」「目标文件是否被覆盖」「`anomaly(backup_failed)` 是否落盘」三项，即可暴露分叉。

**对齐方向（二选一，须先确认「部分部署 + exit 1」在目标场景是否可接受）**：**A** 三处补 `try/catch` → `anomaly` + `warn` + 跳过 jsonc 写入继续（与受管路径口径统一）；**B** 在模块手册与计划文档中显式记录 fail-fast 为**有意设计**（零代码变更，与 migrate 事务回滚语义自洽）。禁止为「一致性」直接改成静默半完成。

> **更新于 2026-09-29（已定稿，v1.1.2-stage-47 op-004）**：上述「二选一」已按**混合裁定**落地——`setup`/`update` 取 **A**（补 `try/catch` **仅捕获 `BackupError`**：`anomaly(backup_failed)` + `console.warn` + **跳过本次 jsonc 写入、继续其余步骤**；跳过后 `updateFileHash` 不执行 → 下次 update 重跑自愈）；`migrate` 取 **B**（保持 fail-fast，零代码变更 + 文档化，依据其**可回滚事务**语义）。分流判据＝「幂等部署（部分完成可自愈）vs 可回滚事务（abort 更干净）」。已同步 `manual/core/backup.md`。

**参见：** `REV-v1.1.2-stage-46` REV-011、`test-v1.1.2-stage-46-report-2026-09-29.md` §4、`.openfeel/manual/core/backup.md`、kb/patterns.md #部署覆盖前自动备份机制

## [+] 测试以「保存/恢复」代替 homedir mock：直写真实全局目录的伪隔离（隔离审计四步法） (2026-09-29)

**现象**：`npm test` 全量运行会**改写真实 `~/.openfeel/config.json` 的 mtime**（内容靠 `afterEach` 回滚还原、哈希不变），且**无任何测试失败**——伪隔离使污染长期不可见（v1.1.2-stage-47 验收发现，登记 `config/BUG-004`，medium 非阻塞）。

**根因**：`test/core/workspace/identity.test.ts` 的 `recordProjectLang` 块未 `vi.mock('node:os')`，直接以真实 `homedir()` 读写全局配置（保存原内容 → 用例结束写回）。保存/恢复**不是隔离手段**，其失效窗口：进程被强杀（Ctrl+C/OOM/超时）→ 残留测试条目；并发跑测试 → 互相覆盖；且它对「写盘目标错误」零信号。

**定位链（四步，可复用）**：

1. 记录真实对象的 **mtime + SHA256** 基线（`~/.openfeel/config.json`、`~/.config/opencode/`、`~/.config/openfeel/profile.yaml`）；
2. 跑全量 `npm test` → 复测：**哈希不变但 mtime 变化** = 「被写过又被还原」的铁证（只比 hash 会漏检）；
3. **二分定位**：按目录二分 `npx vitest run test/core/<子目录>` 缩小到单文件（本案 `test/core` → `workspace` → 该文件唯一命中）；
4. **反证**：`$env:USERPROFILE` 与 `$env:HOME` 同时重定向到隔离目录后复跑，若不再触碰真实文件 → 证明该用例走了**未被 mock 的 `os.homedir()`**。

**避免再犯**：

- 依赖全局路径的测试**必须** `vi.mock('node:os')`（前提：全仓仅 `global-paths.ts` 取 `homedir`，见 kb/patterns.md #全局路径测试的单点 mock 隔离模式）；
- 把「`npm test` 前后真实全局目录 **mtime + hash** 比对」列为验收固定项（归档官/测试官均可执行）；
- 发现历史残留（本案真实 `config.json` 有 **455 条** `…\\Temp\\openfeel-update-test-*` 死映射，为早期 `update.test.ts` 未隔离时遗留）→ **单独评估清理**，勿在修用例时顺手改动真实用户数据；
- 该文件属**既有隔离缺口**（非 stage-47 引入），本轮 7 个 Bug 验收结论不受影响，已按裁定归属 **v1.1.2-stage-43**（发布前清零点）。

**参见：** `config/BUG-004`、v1.1.2-stage-47 测试报告 §五（污染核验）、kb/patterns.md #全局路径测试的单点 mock 隔离模式、kb/patterns.md #测试 cwd 隔离模式

## [+] 裸跑 `openfeel` 命中 PATH 全局旧版 CLI：门禁数字与行为口径被环境污染 (2026-09-29)

**现象**：同一命令在「审查会话」与「执行会话」给出不同结果——`openfeel lint i18n` 一处输出「✅ 502 键一致」，另一处「✅ 531 键一致」；据此一度判定 executor 的报告「数字错误」（v1.1.2-stage-47 代码审查「唯一微瑕」记录）。

**根因**：审查会话**裸跑 `openfeel`** 命中的是 PATH 上的**全局 npm 安装旧版**（本机 `C:\Users\<user>\AppData\Roaming\npm\openfeel.ps1`，v1.1.1），其内置旧 i18n-data 键集即 502；本仓 `node bin/openfeel.js` 为 v1.1.2，键集 531。**两数均为真实输出，差异源于二进制不同，而非口径不同**。

**诊断（三行）**：

```powershell
Get-Command openfeel            # → ...\AppData\Roaming\npm\openfeel.ps1（全局旧版，非本仓）
openfeel --version              # → 1.1.1
node bin/openfeel.js --version  # → 1.1.2（本仓）
```

**后果（比数字更严重）**：① 门禁数字口径错误并**误伤执行方**（executor 报告被记为微瑕，后以代码级铁证改写并撤销该判定）；② 更危险的是**行为口径**——旧版缺新命令/新校验/新 i18n 键，用其验证「本仓功能」会得到假阴性（命令不存在）或假阳性；③ 结论失真且**无任何报错**（旧版正常输出「成功」），属静默污染。

**避免再犯**：① 仓库内一切门禁（`lint i18n` / `lint kb` / `--version` / `--help` 抽查）统一用 **`node bin/openfeel.js <cmd>`**，或先 `Get-Command openfeel` 核验指向；② 引用门禁数字时**注明命令与版本**（如「`node bin/openfeel.js lint i18n` → 531 键，v1.1.2」）；③ 出现「同一命令两处结果不一致」时**先比二进制、再比代码**，不要先怀疑对方报告；④ 误判须**如实改写**并回溯撤销连带结论（本案已撤销 stage-47「微瑕」记录，审查官自我更正入档）。

**参见：** `REV-v1.1.2-stage-43` REV-006（结论改写）、`REV-v1.1.2-stage-47` 代码审查「连带更正」节、kb/troubleshooting.md #需求/文档记载的根因判断须实测复核

## [+] 长版本多阶段流水线的两类「伪信号」：审查会话幻觉 与 验收动作自身污染基线（v1.1.2 复盘） (2026-09-29)

**背景**：v1.1.2 共 7 个阶段（41/42/44/45/46/47/43）、跨多会话推进，暴露出**两类与代码正确性无关、却直接决定结论可信度**的问题，作为版本级教训沉淀。

**第一类：审查会话「幻觉断言」**（v1.1.2 内发生两轮，审查官自认）

- **症状**：审查记录中出现**未经实测的断言**（如「`NEW_SKILL_NAMES` 不存在」「翻转清单已无遗漏」「某行号属实」），措辞确凿但无命令证据；新会话独立复核发现断言与实际不符（行号 ±N 漂移、清单多处遗漏、「实测 531」实为另一二进制输出）。
- **有效防线（本案验证）**：① 每个断言**附可复现命令**（`rg` / `read` 行号 / `git log -1`），无证据不下结论；② **可信度声明 + 新会话独立复核**——正是该机制把「疑似幻觉」定性为「部分属实 + 行号漂移 + 环境污染」；③ 处理记录**保留原文不删**，追加复核结论（审计链完整、结论可改写但不可抹除）；④ 审查官**自我更正**显式写入审查文件（本案 REV-006 结论改写 + 撤销 stage-47「微瑕」判定）。

**第二类：验收动作自身污染验收基线**（真实事故，非幻觉）

- **症状**：`npm test` 覆写仓库真实 `.openfeel/config.yaml`（hash `5229455D…`→`23F76595…`，stage-42 REV-011）；`npm test` 改写真实 `~/.openfeel/config.json` 的 **mtime**（内容靠回滚保持，stage-47 验收发现 → `config/BUG-004`）。
- **铁律**：**验收命令本身也是被测对象**——跑测试/CLI 前先记录被测真实对象的基线（内容 SHA-256 + mtime），跑后逐项比对；「保存/恢复」**不是**隔离手段。
- **防线**：测试隔离（`vi.mock('node:os')` + `spyOn(process.cwd)`）+ **反向守卫用例**（真实工作区逐字不变 / 真 mtime+SHA 只读断言）+ 隔离 HOME 端到端验收。

**给后续版本的判决**：门禁与验收的**可信度优先于门禁数字**——凡「结论依赖某个信号」，该信号的取得方式必须能被第三方复现（命令 + 版本 + 环境三要素齐备），否则该结论在归档时只能标注「待复核」。

**参见：** kb/troubleshooting.md #裸跑 openfeel 命中 PATH 全局旧版、#writeDefaultConfig 无条件覆盖：npm test 静默改写真实 config.yaml、#测试以「保存/恢复」代替 homedir mock（隔离审计四步法）、kb/patterns.md #测试 cwd 隔离模式

## [+] 真实环境一次性数据清理规范：末段匹配 + 计数断言 + 四步保护（不可省） (2026-09-29)

**场景**：清理 `~/.openfeel/config.json` 中历史累积的测试死映射（v1.1.2-stage-48 op-006，455 条 `openfeel-update-test-*`）。

**陷阱一：匹配式必须是「末段匹配」而非字面前缀** —— `projects` 的**键是绝对路径**，测试前缀位于**路径末段**：

```
C:\Users\<user>\AppData\Local\Temp\openfeel-update-test-iFoJSv
```

- 正确：`k.split(/[\\/]/).pop().startsWith('openfeel-update-test-')`（实测 455/455 命中）；
- 错误：`k.startsWith('openfeel-update-test-')`（字面前缀，实测 **0 命中**）。

**陷阱二：0 命中会「假性通过」** —— 若只断言「无真实键被删」，0 命中时脚本什么都没删也会通过。**必须断言删除数恰为预期**（`dead.length === 455`，不符即 `exit 3`；留 `CLEAN_ALLOW_COUNT_MISMATCH=1` 逃生阀）。同理须同时断言**删后剩余键数 === 0**。

**四步保护（不可省）**：① **隔离副本先行试跑**（`--target` 指向副本，先 `--dry-run` 再实跑，断言 455→0）；② **带时间戳备份**（`config.json.bak.{ISO ts}`，绝不覆盖）；③ **执行真实文件**；④ **执行后复核**：剩余键数 + JSON 合法性（`config list-projects` 可读）+ 备份**可解析且含原数据 → 可直接覆盖还原**。

**其它约束**：JSON 解析失败 → **中止且不写盘**（保护原文件）；写出前 `JSON.stringify` → `JSON.parse` **自校验**；脚本置于 `.openfeel/tmp/`（不进 `src/`、不进 npm `files`）；**过程计数（455 → 0）与备份路径写入日志**，备份保留可还原性供后续核验。

**参见：** v1.1.2-stage-48 op-006、`REV-v1.1.2-stage-48` REV-002、`.openfeel/tmp/clean-dead-lang-mappings.mjs`、`.openfeel/manual/core/global-paths.md`（死映射背景与人工清理指引）、kb/troubleshooting.md #测试以「保存/恢复」代替 homedir mock（隔离审计四步法）

## [+] 随包 postinstall 在用户端路径层级失效：包内脚本假设 rootDir 且静默跳过 (2026-09-30)

**症状**：随包发布的 `postinstall` 补丁脚本在用户机器上「**文件不存在，跳过**」×2 并以 **EXIT=0 静默结束**——功能看似装上却不生效、且无任何报错（v1.1.2-stage-49 B3，补丁脚本 `patch-inquirer.js`）。

**根因（两层）**：
1. **路径层级错位**：脚本用 `rootDir = resolve(__dirname, '..')` 假设「包根的同级 `node_modules`」，但用户端**依赖提升（扁平化安装）**后目标实际位于 `<prefix>/node_modules/@inquirer/core/...`，比脚本假设的**多一层** → 找不到文件即跳过；
2. **`engines` 与依赖要求不符**：本包 `engines.node >=20.0.0` 但 `@inquirer/core@11.2.1` 要求 `>=23.5.0 || ^22.13.0 || ^20.17.0` → 放行 20.0~20.16 的崩溃区间（`util.styleText` 自 Node 20.12 起才提供）。

**排查**：构造**用户端扁平化布局模拟**（`<prefix>/node_modules/openfeel/scripts/...` + 依赖提升至 `<prefix>/node_modules/@inquirer/core/`）运行 postinstall，观察是否真改到目标（实测「跳过」×2、theme.js 未变）；`rg patch-inquirer` 复核引用点。

**避免**：**删除**随包 `postinstall`（**就地改写第三方包属反模式**：升级即被覆盖、pnpm/yarn 不适用、随包发布无效），`engines` **收紧对齐**依赖实际要求（`>=20.17.0`），未来确需兼容改用 `overrides`/`patches`。**注意**：包内附带的 `.npmrc` 的 `engine-strict` 对消费者**无效**（npm 只读消费者自身项目/用户级 `.npmrc`），不要指望它生效。

**参见：** v1.1.2-stage-49 B3、`REV-v1.1.2-stage-49-U7` U7-01、`plan/v1/stage-49/ops/op-011.md`、kb/setup.md #npm 超时与网络预检

## [+] 配置键白名单须 schema 驱动 + 值类型归一：避免字符串 "true" 写入破坏配置 (2026-09-30)

**症状**：`config set test_enabled true` 后配置校验失败（写入字符串 `"true"`），或扩白名单后 boolean 键**首次可达** → `ZodError` 崩溃（v1.1.2-stage-50 T36 / R3）。

**根因（两层）**：

1. **白名单硬编码单键**（`['auto_advance']`）时，`test_enabled` 等 boolean 键被命令层**先行拦截**（不可达）→ **掩盖**了「值以字符串原样写入」的缺陷；
2. **扩到全量 `defaults.*` 后 boolean 键首次可达** `setConfigValue`，若**不先归一值类型**，`z.boolean().parse("true")` 直接 `ZodError` 崩溃。

> 描述修正：现状是「**白名单拦截不可达**」，而非「已写坏配置」；**归一因此是扩白名单的前置条件**，不是可选项（stage-50 REV-002）。

**排查**：`rg` 白名单数组（`commands/config.ts`）+ `setConfigValue` 值写入路径（`config.ts`）；确认 parse/归一发生在**写盘之前**。

**修法三件套**：

1. **白名单 schema 驱动**：从 `ConfigDefaultsSchema` 取 keys，**不硬编码**（新增配置键自动纳入）；
2. **写入前按字段 schema 归一值类型**：boolean 键把 `"true"`/`"false"` 解析为布尔 —— **逐层解包后 `instanceof z.ZodBoolean`**（**zod v4 无 `_def.typeName`**，勿按 v3 写法判断）；
3. **枚举非法值报错且不写盘**：`execution_mode bogus` 等 → 报错 + **目标文件 hash 与 mtime 不变**（不写盘是验收硬断言）。

**三口径一致**：`config set` / `get` / `effective` 对同一键的**值与来源**一致（`rg notAdjustableHint src/` 应零命中）。

**参见：** v1.1.2-stage-50 T36（R3）/ REV-002、`plan/v1/stage-50/ops/op-003.md`、`REV-v1.1.2-stage-50.md`、kb/patterns.md #配置级联解析模式

## [+] prompt 级协议 vs 代码级强制：自动归档/就地收敛/加锁无运行时强制，可靠性依赖模型 (2026-10-01)

**现象**：`current.md` 的自动归档轮换、`dev_last` 主题超限就地收敛、`dev_last` 写入加锁（`withFileLock` + `atomicWriteFileSync`）等规则，**只写在 agent 模板与 skill（prompt 层）**，产品源码 `src/**` 中**无对应运行时实现**（v1.1.2-stage-53 scope 明确「不改业务源码」）。

**风险**：
- 规则可靠性**依赖 Feel 遵循 prompt**；模型不遵从时**静默失效**且无告警（不会报错，只是没归档/没加锁）。
- 测试无法端到端验证——只能以「模板文本断言」替代运行时演练（如 6 主题 fixture 收敛用文本断言，非目录级运行时演练）。
- 迁移类数据的零丢失亦无 git 基线可对比（`dev_last.md` 在 `.gitignore` 内），只能内容映射核对。

**排查/识别**：确认某规则是否强制，用 `rg "关键词" src/**` 检查有无实现；若仅命中 `templates-data/**` 与 `agents-md`，即属 **prompt 级协议**（本阶段实测 `src/**` 仅 `structure.ts` 的 `DEV_SUB_DIRS` 常量）。

**缓解（设计边界须明示，非修复）**：
1. 在计划/报告中**显式声明该边界**（「会话协议而非运行时强制」）；
2. 关键规则尽量落**代码护栏**：如加锁以 `withFileLock` 的并发 fixture（2 写者 + 无锁对照复现覆盖）证明机制有效；
3. 模板改动**以文本断言守护**（模板含 `withFileLock`/`dev-last-`/`.openfeel/tmp/locks/`/`atomicWriteFileSync` 等关键串）；
4. 首次触发复杂协议（如 R4 收敛）时由人工**复核留痕**。

**判据**：凡「禁止手改 X、由 Agent 按协议维护」的治理规则，须区分**代码强制**与**prompt 约定**；后者必在文档中标注边界，并对高风险动作补代码护栏或人工复核点。

**参见：** v1.1.2-stage-53 §八 R-2c / 测试报告 §八观察项 1；kb/architecture.md #跨进程并发保护架构；kb/patterns.md #建议性文件锁模式

## [+] 空模板检测纯子串匹配误报：正文引用占位标记即被误判未填充 (2026-10-01)

**症状**：`plan scheme publish` 对**完整方案**误拒（exit 1「模板未填充」）；`flow ops list` 显示 `(empty)`；`flow health` 误报空模板（本仓实测报 `v1.1.2-stage-52.op-005`，而该文件 17112 字节）。

**根因**：`EMPTY_TEMPLATE_MARKER='- [ ] 待补充'`，`isTemplateEmpty()` / `detectFillState()` / `publishScheme` 校验三处均为 `content.includes(marker)` **纯子串**匹配——op 正文**引用**该字面量（说明性文字）即命中。

**排查**：定位所有使用占位标记常量的判定点（`rg "EMPTY_TEMPLATE_MARKER|待补充"`），检查是 `includes` 还是结构匹配。

**修法**：判定收紧为**整行/列表项**匹配（单一来源，供 health/publish/ops list 共用），补回归断言「正文引用 → filled / 独占一行 → empty」。

**判据**：凡「标记字符串 vs 内容」判定，先问「是否要求独占结构位」；纯子串命中即误报源（同族：`view.add` 用词边界而非裸子串）。

**参见：** v1.1.2-stage-52 测试验收 `cli/BUG-005`；`src/core/flow-manager.ts` / `src/core/plan/scheme.ts`；kb/patterns.md #CLI 自描述命令模式

> **更新于 2026-10-01（已修复，v1.1.2-stage-54 op-001）**：`isTemplateEmpty` 改为**整行锚定**正则 `/(?:^|\n)[ \t]*-\s*\[\s*\]\s*待补充[ \t]*(?=\r?\n|$)/`（`EMPTY_TEMPLATE_LINE_RE`，单一来源），`detectFillState` 的 `partial` 分支同口径收紧（行首仅 `[ \t]*`），`plan/scheme.ts:455` 改调 `isTemplateEmpty`（消除第二处子串判断）；`rg "content.includes(EMPTY_TEMPLATE_MARKER)" src/` 零命中。**端到端实测**：真实独占行空模板 `publish` exit 1 / `health` 仅报其；正文**行内引用** → `publish` exit 0 / `ops list (filled)` / `health` 不报；**本仓 `flow health` 空模板告警归零**（`stage-52.op-005` 由 `(empty)`→`(partial)`）。**14 形态边界终测**：10 类真实空模板全检出（独占行 LF/CRLF/缩进/末尾无换行/仅标记/无空格变体/部分填充/多行缩进/全角空格/围栏内），4 类误报源全排除（行内引用/表格/已勾选/行内代码后随内容）。**已知边界**：代码围栏内独占行仍判 `empty`（不引入围栏解析，avoid 过度设计）。**判据升级**：占位符/标记类检测**默认整行锚定**（行内引用不应误报）；「是否要求独占结构位」是纯子串与结构匹配的分水岭。

## [+] 即席实测误在仓库 cwd 执行真实命令：fixture 前须显式断言 cwd (2026-10-01)

**事故**：executor 在 T3 实测中，本应在隔离 fixture 内运行 `openfeel archive`，却在**仓库 cwd** 执行真实命令 → `flow.json` 被写（+1 日志 / rev 441）+ 误生成归档文件。即时回滚（rev 440、删误产物）后经审查官独立核验**数据无损坏**（rev/log/文件一致、`git status` 无残留、config 三值未变）。

**裁定**：误跑 = **违反测试隔离硬要求**（违规）；回滚 = **合规的应急处置**（数据完整性恢复优先，非违规手改）；数据损坏风险 = 无。

**整改（可操作）**：
1. **fixture 实测前显式切换工作目录并断言**（`Push-Location <fixture>` + 断言 `Get-Location`/`process.cwd()`）；禁止「默认在仓库根跑命令」。
2. **误写后即时报告 + 留痕**（在报告/REV 披露），并优先用 `git checkout -- .openfeel/flow.json` 或 `.bak` 恢复，减少手工编辑（本次为手工回滚，已补核前后 hash）。

**判据**：任何会写盘的命令，运行前必须回答「cwd 是否为隔离目录」；`flow.json` 是全局共享状态，误写成本高。

**参见：** v1.1.2-stage-52 op-014 exec_review 偏差裁定；kb/patterns.md #测试 cwd 隔离模式、#隔离 HOME 实测法

## [+] 同类缺陷须一次全量扫描而非逐个暴露：stage 解析归一化三轮修复教训 (2026-10-01)

**过程**：stage-52 的 stage 解析归一化缺陷**分三轮**才收口——op-012（REV-005，修 F1~F5）→ op-013（REV-007，补 remove/attempt）→ op-014（REV-009，补 `addAutoFixReview` + 独立扫描又发现第 8/9/10 处）。每轮审查/扫描都「又发现一处」，共 10 处。

**教训**：**同族缺陷若按「点状报告」逐个修，必然留尾**——因为触发路径分散（命令层 + 核心层 + 多个消费点），单点修复不改变「同类索引点仍在」的事实。

**可操作方法（一次性闭包）**：
1. 先界定**缺陷类的判据**（如「入参可能为短名的 `stages[...]` 索引点 / `startsWith(stageId)` 前缀比较」）；
2. 用 `rg` **全量枚举**所有候选点（`rg -n "stages\[" src/`、`rg -n "startsWith\(" src/`），逐点判定「数据派生 / 已归一化 / 缺陷」；
3. 缺陷点**同批修复**，并给出**闭包收口证据**（「无第 N+1 处」的独立全量扫描结论），而非等审查再发现。

**判据**：收到一条「同族缺陷」报告时，默认动作是**扫描整个缺陷类**，而非仅修报告点；收口以「全量扫描无残留」为准，不以「报告条目 all closed」为准。

**参见：** v1.1.2-stage-52 REV-005/007/009 + op-012/013/014；kb/patterns.md #短名/全名 stage 解析归一化的统一范式

## [+] 新增输出键/契约的同步面清单：i18n help + docs + manual + kb + 部署型 skill 模板（易漏最后一环） (2026-10-01)

**症状（同族反复发生，三次）**：CLI 输出新增字段后，**文档面**未同步，且每次遗漏的载体不同：
1. `cli/BUG-003`（stage-48）：`flow phases --json` 实际含 `advanceAccepted`，`--help` 文案只列 `{ phases, transitions }`；
2. stage-52 observation：又新增 `transitionsDiff`（第 5 键），plan 表述仍陈旧；
3. `cli/BUG-003` **复发** + `templates/BUG-005`（stage-54）：实测 **5 键**（`schemaVersion/phases/transitions/advanceAccepted/transitionsDiff`），而 **i18n help 文案**（`zh-CN.ts`/`en.ts`）与**部署型 skill 模板**（`openfeel-cli-usage/SKILL.md:46`）分别记 **4 键 / 3 键**。

**根因**：新增输出键的**同步面是一个多载体集合**，且各载体**无单一源、无一致性断言**——`lint i18n` 只校验 zh/en 键**对称性**、不校验「文案内列举的键集合」与实现是否一致；`npm run build` 只传播生成段，**不会校验文案内容**。任一载体遗漏都不触发失败。

**同步面清单（新增/变更 JSON 输出键时逐项打勾）**：

| 载体 | 落点示例 | 校验方式 |
|------|----------|----------|
| i18n help 文案 | `src/core/i18n-data/{zh-CN,en}.ts`（`help.<path>`） | 断言 `t('help...')` 含新键名 |
| 人类可读 `--help` | 命令 `.description()` / `addHelpText` | 实跑 `--help` |
| `docs/commands.md` | 命令参考 | 人工/rg |
| `.openfeel/manual/**` | 模块手册（如 `cli/commands.md`、`core/flow-manager.md`） | 人工/rg |
| `.openfeel/kb/**` | patterns 约定条目 | `rg` |
| **部署型 skill 模板** | `src/core/templates-data/opencode/skills/*/SKILL.md` | `rg` + `npm run build` |

**排查方法**：从实现里取出真实键集合（`node -e "...Object.keys(JSON.parse(stdout))"`），对上述**每个载体** `rg` 关键键名（如 `transitionsDiff`），零命中处即遗漏。参考 stage-54 op-002 对 i18n help 的修复与 `templates/BUG-005` 对 skill 模板的登记。

**避免再犯**：
- 把「新增输出键」视为**一次多点同步**，按上表逐项收口；**部署型 skill 模板**因不在 build 一致性校验链路上，是最易漏的一环；
- 收尾以**关键键名全仓 `rg`**为准（同类教训另见「多源文案同步陷阱」——按行号盘点必漏副本）；
- 长期可为 `lint` 增加「输出契约 ↔ 文案列举键集合」一致性断言（当前无）。

**参见：** v1.1.2-stage-54 E3（i18n help 修复）与 `templates/BUG-005`（skill 模板遗漏）；`cli/BUG-003`（stage-48，同族首次）；kb/troubleshooting.md #多源文案同步陷阱、#新增 i18n 键已定义却未接入（死键）

> **更新于 2026-10-01（v1.1.2-stage-56）**：本条目所述「部署型 skill 模板」一环已**收口并实证**——`templates/BUG-005` 由 op-001 修复（`openfeel-cli-usage/SKILL.md` 补齐 `flow phases --json` **5 键**），并完成「权威源 → `npm run build` 生成段 → `openfeel setup` 全局副本」**全链路一致**验证（全局副本正文与权威源 **CONTENT-EQUAL**）。同步面清单在原文基础上**扩展为 9 载体的可操作表**（含生成段、CHANGELOG、全局副本），见 kb/patterns.md #部署型资产变更的多载体同步面清单；同族新例 `cli/BUG-007`（`docs/commands.md` 手写文档残留已删子命令 `project list`/`info`，由归档官就地更正）。

## [+] 自举实例移除须连带删除 build 生成步骤（否则 `npm run build` 复活）(2026-10-01)

**症状**：把「构建产物型」受管文件（`.opencode/{agents,skills,ADAPTER.md}` 等）用 `git rm` 删除后，跑一次 `npm run build`（或 CI 构建），这些文件**全部回来了**——删除只在当前工作树生效，生成步骤每次构建都重建。

**根因**：这些文件不是源，而是 `build.js` 某步骤（stage-55 前为**步骤 8**「`.opencode/` 自举重生成」）的产物——该步骤先 `rmSync` 旧目录再**从权威源全量重生成**。只删产物不改生成器 → 下次构建必然复活。

**排查**：删除前先定位生成逻辑——`rg -n "<产物文件名>|<生成函数名>" build.js`，确认「生成函数 + 调用点 + 分区注释 + 仅被其使用的辅助函数」。若只删了文件而 `rg` 仍命中生成函数，则复活是必然。

**修复（内容锚定，非行号）**：
1. **整函数删除**生成器（如 `regenerateOpencodeInstance`）；
2. **删调用点**（如 build 末尾 `await regenerateOpencodeInstance();`）；
3. **连带删辅助函数**（如仅被步骤 8 使用的 `insertGeneratedMark`）与因此变为未使用的 `import`（如 `mkdirSync`）——否则 `tsc`/lint 报未使用；
4. 分区注释改写为说明「已于 <阶段> 移除（防复活）」，保留**原因**便于后来者理解；
5. **加防复活断言**：静态断言 `build.js` 源码不含生成函数名；并**实测**「`npm run build` 后 `Test-Path <产物>` 仍为 `False`」。

**判据**：凡「受管文件是构建产物」的删除任务，**先删生成器再删产物**（或同批），并以「构建后不复活」为验收实证；只删文件 = 未完成。

**实证**：v1.1.2-stage-55 op-003——删 `build.js` 步骤 8（函数 + 调用 + 分区注释 + `insertGeneratedMark` + `mkdirSync` import）；验收：`rg "regenerateOpencodeInstance|insertGeneratedMark" build.js` 零命中，连续 3 次 `npm run build` 后 5 项资产 `Test-Path` 全 `False`。

**参见：** v1.1.2-stage-55 op-003（F4）、门 D；`build.js`（步骤 8 分区注释）；`.openfeel/manual/core/build.md` #步骤 8（已移除）；kb/architecture.md #仓库自身不再保留项目级部署资产

## [+] 模板断言的保护边界：build 注入常量 vs 源文件直读（「改源忘 build」窗口）(2026-10-01)

**症状/困惑**：为「防模板内容意外丢失」新增的断言（如 reviewer 纪律节断言），在**故意删掉模板源中的目标节**后**并未变红**——断言看似失效（REV-v1.1.2-stage-55 REV-003 的验证方法修正即源于此）。

**根因**：断言调用的 loader（`loadOpencodeAgentTemplate`）在运行时读的是 **build 注入的 AUTO-GENERATED 常量**（如 `OPENCODE_AGENT_TEMPLATES`，其源为 `templates-data/**`，由 `build.js` 注入），**并非直读 `templates-data/**` 文件**。因此「只改模板源、不重跑 build」时，常量保持旧内容 → 基于 loader 的断言**不会变红**。

**正确的断言有效性验证法**：改模板源 **→ `npm run build`**（把源变更传播到注入常量）**→ 跑断言**（此时才应红）→ `git checkout` 恢复源 + 重建 → 复跑应绿。**仅改源不 build** 的验证是**假阴性验证**，会误导为「断言无效」。

**保护边界（据此评估断言价值）**：
- **能拦**：改源 → build → 纪律节丢失（**CI 与正常 build 流程必拦**——build 单向从源生成，最终态与源一致，断言反映真实交付物）；
- **不能拦**：改源**未 build** 的本地中间态（生成段仍旧）——该窗口由 **push 后 CI 必跑 build+test** 兜底；
- **结论**：缺口属**所有「经 loader/build 注入」的模板断言的共性**（非某条断言特有），在正常工作流下保护目标达成。

**避免/加固**：① 若需堵「改源忘 build」的本地窗口，可**另加「源文件直读」锚点断言**（直接读 `templates-data/**` 文件，与 loader 断言互补双保险）；② 验证断言「真的会红」时，务必先把变更传播到断言实际读取的载体；③ 锚点取**语义稳定**者（如 H2 标题 + 核心子要点），避免取易随措辞调整的句子。

**实证**：v1.1.2-stage-55 op-005——`loadOpencodeAgentTemplate`（`template-loader.ts`）实测读 `OPENCODE_AGENT_TEMPLATES[lang][agentId]`（build 注入常量）；修正验证法为「改源 + build → 红（2 failed）→ 恢复 + 重建 → 绿（41 passed）」；REV-003 评估「正常工作流下纪律节丢失必被拦」成立并关闭。

**参见：** v1.1.2-stage-55 op-005（REV-003）；`src/core/template-loader.ts`（`loadOpencodeAgentTemplate` / `OPENCODE_AGENT_TEMPLATES`）；kb/patterns.md #模板单源架构

## [+] `advanceAccepted` 被误述为「组合条件路径」：字段语义须与实现对齐（内置 15 phase 推进白名单）(2026-10-01)

**症状**：`openfeel-cli-usage` skill 把 `flow phases --json` 的 `advanceAccepted` 解释为「**组合条件路径**另见 `advanceAccepted`」——**语义错误**，误导读者以为它是 `transitions` 的组合源（如 `review_passed|test_passed`）。

**实测真相**（stage-56 复核）：
- `advanceAccepted: [...PIPELINE_PHASES]`（`src/commands/flow.ts` 的 `flow phases` action）= **内置 15 个 phase 名的「推进白名单」**——即 `flow advance --to` **实际接受**的取值集合，**不是**组合条件路径；
- 组合条件差异（内置默认含 `review_passed|test_passed`，而本仓 `pipeline.yaml` 未列）由 **`transitionsDiff.missing` 显式可见**（实测 `missing=["review_passed|test_passed"]`、`extra=changed=[]`）；
- `phases` 是**存在视图**（运行时 `pipeline.yaml` 声明的全部 phase），三者语义不同（见 kb/patterns.md #CLI 自描述集合的「存在视图 vs 推进白名单」区分）。

**根因**：`advanceAccepted` 与 `transitions` 同属自描述 JSON，但**语义角色不同**；撰写文档时按「名字相邻」误把它归为转移表的组合条件，未回读实现（`advanceAccepted: [...PIPELINE_PHASES]`）。

**修复（stage-56 op-001）**：skill 改为准确表述——「`advanceAccepted` = 内置 15 phase 的推进白名单（`flow advance` 只接受这 15 个值），**不是**组合条件路径；组合条件差异经 `--json.transitionsDiff.missing` 显式可见（stage-50 裁定：不补组合键，改以 `transitionsDiff` 显式化）」；`rg "组合条件路径" SKILL.md` **零命中**。

**避免再犯**：① 文档写「某字段是什么」前，**回读实现取真值**（`rg <field> src/` 看赋值表达式），勿按字段名猜测；② 自描述 JSON 的字段**语义角色**须各自标注（存在视图 / 推进白名单 / 差异报告），name-adjacency ≠ semantic-adjacency；③ 判据：能回答「它约束什么/解释什么」才算写清语义。

**实证**：v1.1.2-stage-56 REV-005（方案审查发现 `project` 陈旧 + 表述失实）、op-001 修正；测试官实测 `advanceAccepted.length=15`、`transitionsDiff.missing=["review_passed|test_passed"]` 与注记逐字吻合。

**参见：** v1.1.2-stage-56 op-001 / REV-005 / REV-008；kb/patterns.md #CLI 自描述集合的「存在视图 vs 推进白名单」区分、#CLI 自描述命令模式；kb/troubleshooting.md #`flow phases` 自描述 phase 与 `flow advance` 接受集合不一致

## [+] Node 无内建 GBK 编码能力：`TextEncoder` 静默忽略、`Buffer.transcode` 抛错 → 必须第三方编码器 (2026-10-02)

**症状/困惑**：Windows 传统 CJK 代码页下要把人类可读文本转成 GBK 字节，直觉上应可用 Node 内建 API，实际两条路都不通——且**一条静默、一条报错**，易误判为「代码写错」。

**实测（Node ≥20，win32）**：
- `new TextEncoder('gbk')` → **静默忽略**参数、仍按 UTF-8 编码（**不报错**，最危险，产出错误字节还以为是 GBK）；
- `Buffer.transcode(src, from, 'gbk')` → **抛错**（不支持 GBK）；
- `TextDecoder('gbk'/'gb18030')` 可**解码**（仅解码方向，非本需求重点）。

**结论/操作**：Node 标准库**无 GBK/GB18030/Big5 等传统 CJK 编码能力**，必须引入第三方编码器（本项目选 `iconv-lite`）。`iconv.encode('中文⚠','gbk')` → `d6d0 cec4 3f`（不可编码字符降 `?`，与预期一致）。

**依赖评估路径（MIT）**：选型时先查包是否**已在 prod 依赖树**（本项目 `iconv-lite@0.7.2` 已随 `@inquirer/prompts → @inquirer/editor → @inquirer/external-editor` 传递安装、**非 dev**）→ 提为**直接依赖**只改 `package.json` + `package-lock.json` 根 `dependencies` 各 1 行，**不改依赖树**（`npm ls iconv-lite` 显示直接依赖）；自带 `lib/index.d.ts`（**无需 @types**）；MIT 许可、由 npm 解析安装、**不打入 tarball**（`npm pack` 文件数不变）。

**避免**：① 用 `chcp` 探测代码页时**勿按 UTF-8 解码整串**——`spawnSync('chcp',...)` 输出用 `stdout.toString('latin1')` 再 `/\d+/` 提取数字；② 不可编码字符降级 `?` 是 iconv 默认行为，**不额外告警**（避免日志噪声/编码递归）。

**实证**：v1.1.2-stage-58 D-1~D-4（`package-lock.json` +1 行；`npm ls iconv-lite` = 0.7.2 直接依赖）；`.openfeel/manual/cli/output-encoding.md` 记录降级策略。

**参见：** v1.1.2-stage-58 D、A-7；kb/patterns.md #CLI 输出编码自适应单一咽喉模式；`src/cli/output-encoding.ts`

## [+] 默认开启写真实用户目录的副作用防护：`VITEST` 会被 spawn 子进程继承、不能作隔离守卫 (2026-10-02)

**症状/困惑**：默认开启的运行日志使 `npm test` 疑似写真实 `~/.openfeel/cli/logs/`；同时「用 `process.env.VITEST` 守卫跳过安装」的方案看似安全，却让经 `bin/` 的 E2E **恒绿零覆盖**。

**实测事实**：
- vitest 主进程设置 `process.env.VITEST="true"`（`node_modules/vitest/.../cli-api.*.js`），且 `spawnSync/spawn` 子进程以 `{...process.env}` **继承**该变量；
- 因此 `test/cli/repl.test.ts` 的 spawn 子进程必带 `VITEST=true`；若 `installOutputEncoding`/`installRuntimeLog` 首行 `if (process.env.VITEST) return;`，则**经 `bin` 的真实 CLI 子进程**也被短路 → 被测转码/日志链路根本不运行 → 输出「本来正确」→ 断言恒绿。

**正确防护（不设 env 守卫）**：
1. **库侧默认 no-op**：能力模块内部默认「未安装」，`install*` 仅由 `bin/openfeel.js` 调用；in-process 测试从不 install → 零写盘（`kb/patterns.md #库侧默认 no-op + 进程入口 install`）；
2. **测试自身隔离**：`vi.mock('node:os')` + 子进程双设 `USERPROFILE`/`HOME`/`XDG_CONFIG_HOME`；spawn 真实 CLI 的用例显式 `OPENFEEL_LOG:'0'`（关日志降噪）；
3. **E2E 正控**：断言「若 install 被短路则必失败」（如 GBK 字节 + fatal UTF-8 抛错），消除恒绿。

**审计法（铁证）**：跑全量 `npm test` 前后比对真实用户目录的 **mtime + SHA256**——「hash 不变但 mtime 变化」= 被写过又还原（伪隔离铁证）；本阶段实测真实 `~/.openfeel/cli/logs/openfeel-2026-10-02.log` 在 `npm test` 前后**零变化**（同 Length / 同 LastWriteTimeTicks）→ 测试不写真实 HOME。

**避免**：① 默认开启写盘能力时，**测试/子进程须显式关闭或隔离**；② 任何「用 vitest 环境变量做守卫」的方案先问「子进程是否继承」；③ 库侧默认关闭 + 入口 install 是比 env 守卫更可靠的隔离范式。

**实证**：v1.1.2-stage-58 REV-001（blocking，裁定方案 b 删除 `VITEST` 守卫）、REV-004（两 install 策略统一）；E-4 `repl.test.ts` 加 `OPENFEEL_ENCODING:'utf8'` + `OPENFEEL_LOG:'0'`。

**参见：** v1.1.2-stage-58 REV-001/REV-004、E-3/E-4/E-5；kb/patterns.md #库侧默认 no-op + 进程入口 install、#测试全局路径隔离模式（禁用保存/恢复伪隔离）；kb/troubleshooting.md #测试以「保存/恢复」代替 homedir mock

## [+] CI 同一 push 多 run 并发发布同版本 → npm registry 409；job 级 concurrency 组串行化（必要但不充分） (2026-10-02)

**症状/现象**：CI `publish` job 偶发 `npm publish` 失败 `409 Cannot publish over previously staged version`，但同一版本随后又「自动」成功（**假失败**）。

**根因（实测）**：同一 push（`25689d4`）仅 1 个 PushEvent，GitHub 却为该 commit 调度了 **2 个 workflow run**（run #53 success / #54 failure，同 `head_sha`、同 `created_at`）；两 run 的 `publish` job 时间窗**重叠**（#53 `19:22:03→19:22:28` success；#54 `19:22:08→19:22:31` 409）。两 run 都通过 `Check if version changed`（暂存期远端 `npm view openfeel version` 仍为旧版 `1.1.1`）→ 并发 PUT 同一版本 `1.1.2` → 先者成功并由 registry 置 *staged* 态，后者被拒 409。属 npm registry 已知竞态（[npm/cli#9889](https://github.com/npm/cli/issues/9889)）。

**处置（方案 A，用户裁定）**：在 `publish` job 加 **job 级 `concurrency`**：

```yaml
concurrency:
  group: publish-${{ github.ref }}
  cancel-in-progress: false
```

同一 ref 的 run 串行化（排队）；发布为不可逆副作用，故 `cancel-in-progress: false`（避免取消进行中的发布）。

**边界（必要但不充分）**：串行化只保证第二个 run 在第一个 run **结束后**开始，**不保证** registry 已完成 staged→finalize（本次实测 stage `19:22` → finalize `19:29`，窗口约 7 分钟）。若 GitHub 再次把同一 push 调度成 2 个 run，第二个 run 的 `Check if version changed` 若在 finalize 前执行仍读到旧版本 → 再次 publish → 再次 409。要彻底消除需幂等/重试语义（publish 后置重试 / provenance-oidc）或接受手动重跑；本轮按裁定不做兜底。

**判据**：CI 中任何「受远端外部状态（registry / *staged* 态）影响的并发不可逆写」都应显式指定 job/工作流级 `concurrency`；对发布类 job 用 `cancel-in-progress: false`。

**实证**：v1.1.2-stage-60（op-001 `7e09eac`，`.github/workflows/ci.yml` +3 行）；REV-001（low 非阻塞，挂起观察，若再现 409 应升级 medium）。

**参见：** 私域 `.openfeel/users/Liuary/code_review/REV-v1.1.2-stage-60.md`；公域 `.openfeel/code_review/v1.1.2-stage-60.md`；kb/troubleshooting.md #npm publish 404/403 诊断链；npm/cli#9889

## [+] CI 环境守卫误报：守卫窗口混入「默认写盘」的非测试 CLI 步骤（stage-58 运行日志默认开启后 ABSENT→存在） (2026-10-02)

**症状/现象**：CI `build-and-test` 稳定失败 `::error::环境被测试改动：/home/runner/.openfeel`，但本地 `npm test` 前后真实 `~/.openfeel` 零变化——看似「测试污染」，实为**非测试步骤**在守卫窗口内写盘。

**根因（决定性复现）**：stage-58 令运行日志「默认开启」后，`bin/openfeel.js` 每次运行都写 `~/.openfeel/cli/logs/*.log` + `~/.openfeel/locks/`。而守卫窗口（`Env snapshot` → `Env guard`）内包含两条**非测试** bin 调用：`Version consistency guard`（`node bin/openfeel.js --version`）与 `lint i18n`。干净 runner 上 `~/.openfeel` 由 `ABSENT` 变「存在」→ diff 非空 → 误报。

**正确处置（双保险）**：
1. **隔离被检步骤副作用**：给窗口内非测试 bin 步骤注入 `env: OPENFEEL_LOG: '0'`（YAML 中**必须带引号**；`resolveRuntimeLogConfig` 以 `=== '0'` 严格比较，不带引号会被解析为数字 `0` 而失配）——`build-and-test` 的 `Version consistency guard`/`lint i18n` + `publish` 的 `Version guard` 共 **3 处**；
2. **收紧窗口**：把 `Env snapshot` 下移到 `lint i18n` 后、`Test` 前，使窗口恰为目标范围（测试）；`Env guard` after 仍在 `Test`+`Coverage` 之后；
3. **快照三态加固**：exists 分支空清单不再落「空文件」，改写固定标记 `EXISTS-EMPTY`（与 `ABSENT` 区分），避免「空目录」与「不存在」表示混淆。

**三场景决定性验证（WSL/Linux 隔离 HOME + 仓库副本）**：S1（修复后，注入 env + 快照下移）= PASS(diff 空)；S2（仅快照下移、不注入 env）= PASS → **下移窗口独立有效**；S3（修复前：快照在 CLI 调用之前、不注入 env）= FAIL(非空，含 `cli/logs/*.log`) → **复现 CI #52**。S3 diff 出现 `-ABSENT` / `+<sha256> …/cli/logs/…` 即铁证。

**判据/避免**：任何「默认开启写盘」的副作用，都会让「守卫窗口内的只读步骤」不再只读；**窗口内每个 step 都必须显式隔离（关写盘）或证明无副作用**，且快照点须紧贴被测对象。此为 stage-48「环境哈希守卫」窗口纪律的具体勘误（原判 `--version`/`lint i18n` 实测只读，已被 stage-58 默认日志推翻）。

**实证**：v1.1.2-stage-59（CI run #52 `cacbefb` 失败 → 修复后 run #53 `25689d4` build-and-test 双 success + `Env guard` success）；commits `7d84f15`/`25689d4`；仅改 `.github/workflows/ci.yml` 单文件；门禁 `npm test` 61 文件 / 1018 用例 0 skipped、`lint i18n` 730 键、`lint kb` 0。

**参见：** v1.1.2-stage-59；kb/patterns.md #环境哈希守卫（CI 层）（**已更新**：窗口纪律勘误 + 三态）；kb/troubleshooting.md #默认开启写真实用户目录的副作用防护；kb/patterns.md #库侧默认 no-op + 进程入口 install
