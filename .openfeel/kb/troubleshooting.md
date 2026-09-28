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

1. **agent 文件 frontmatter**：`.opencode/agents/openfeel-executor.md`、`openfeel-utility.md` 的 `model: deepseek/deepseek-v4-flash` → `deepseek/deepseek-flash`。
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

## [+] 新增 i18n 键已定义却未接入（死键）：核心层抛中文错误绕过 t() 渲染 (2026-09-29)

**现象**：新增键 `common.stageDirConflictTmpl` 在 `zh-CN.ts` / `en.ts` 双侧均已定义，但 en 语言下 `openfeel plan stage add` / `flow stage add` 的冲突错误仍输出中文——命令层实际走 `common.errorTmpl` + 核心层抛出的中文文案。

**根因**：核心层 `registerStage` / `addStage` 抛错文案为中文硬编码（项目既有惯例），命令层 `catch` 统一用 `common.errorTmpl({msg})` 渲染，专为该场景定义的键从未被任何调用点引用（死键）。**`openfeel lint i18n` 只校验 zh/en 键对称性，不校验键是否被引用，因此死键不报错。**

**排查方法**：从本阶段 diff 提取新增 i18n 键清单，逐键 `rg -n "<key>" src/ test/`；仅出现在 `i18n-data/*.ts` 定义处、无消费点的即为死键。

**避免再犯**：

- 为「需要独立渲染」的错误场景定义键时，**同一提交内**改命令层 `catch` 按错误类型分流并接入该键，或改核心层抛结构化错误（含字段）+ 命令层渲染；
- 新增键后以 `rg` 引用校验兜底，避免「已定义即已覆盖」的错觉；
- 长期可为 `lint i18n` 增加「未引用键」检查（当前仅对称性检查）。

**参见：** v1.1.2-stage-41 正式测试 cli/BUG-002、kb/patterns.md #CLI 国际化封装模式

## [+] kb-dedup 去重检索对 CRLF 行尾静默失效（归档官去重降级）(2026-09-29)

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
