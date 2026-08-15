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
