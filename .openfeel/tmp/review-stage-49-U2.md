# U2 CLI 命令层审查报告（v1.1.2-stage-49 / op-002）

> **审查人**：openfeel-reviewer（GLM 异种推理） | **日期**：2026-09-29
> **环境**：Windows 11 / pwsh 7 / node v24.18.1 / ripgrep 15.2.0 / 仓库根 `C:\Users\Liuary\Dev\Mine\AI\OpenFeel` @ `20670b8`
> **隔离验证目录**：`C:\Users\Liuary\AppData\Local\Temp\opencode\u2-fx`（flow.json fixture）与 `u2-en-test`（en 语言项目）

---

## 一、范围与文件归属（23/23 全覆盖）

`rg --files src -g "*.ts"` 复核全仓 62 个 `.ts`，U2 归属 23 个，逐一 `Test-Path` + 行数确认在盘：

| # | 文件 | 行数 | # | 文件 | 行数 |
|---|------|-----|---|------|-----|
| 1 | src/index.ts | 8 | 13 | src/commands/lint.ts | 201 |
| 2 | src/cli/index.ts | 158 | 14 | src/commands/migrate.ts | 93 |
| 3 | src/cli/repl.ts | 88 | 15 | src/commands/model.ts | 147 |
| 4 | src/core/i18n.ts | 160 | 16 | src/commands/plan.ts | 115 |
| 5 | src/core/i18n-data/en.ts | 632 | 17 | src/commands/project.ts | 208 |
| 6 | src/core/i18n-data/types.ts | 17 | 18 | src/commands/roadmap.ts | 34 |
| 7 | src/core/i18n-data/zh-CN.ts | 668 | 19 | src/commands/setup.ts | 24 |
| 8 | src/commands/archive.ts | 46 | 20 | src/commands/stage.ts | 446 |
| 9 | src/commands/config.ts | 264 | 21 | src/commands/update.ts | 114 |
| 10 | src/commands/flow.ts | 1351 | 22 | src/commands/view.ts | 92 |
| 11 | src/commands/init.ts | 92 | 23 | src/commands/instructions.ts | 54 |
| 12 | src/commands/knowledge.ts | 184 | | src/commands/setup.ts 补 | — |

注入链前置校验：`src/cli/index.ts:43-44` 注册 flow/plan ✅；`bin/openfeel.js` 无参数时进 REPL、有参数走 `runCli()` ✅；`node bin/openfeel.js flow current` 阶段合法（v1.1.2-stage-49, exec_running, op-001）✅。

---

## 二、取证方法（可第三方复现）

| 手段 | 命令样例 | 用途 |
|------|---------|------|
| 静态通读 | `read` 23 文件全文 | 源码级证据 |
| help 实测 | `node bin/openfeel.js <cmd> --help`（真实仓库，只读） | 文案 vs 行为 |
| en 语言实测 | 临时项目 `.openfeel/.info.json` = `{"user":"tester","lang":"en"}`，绝对路径调 bin | i18n 对称性 |
| 退出码矩阵 | 隔离 fixture + `Invoke-Expression` 后读 `$LASTEXITCODE` | 场景 1~24 |
| dry-run 写盘判定 | 前后各读 `meta.revision` 与 stage 字段 | 语义验证 |
| 硬编码扫描 | `rg -n "[一-龥]" src/commands src/cli src/index.ts -g "*.ts"` + 注释行过滤 | 泄漏清单 |
| 键对称 | `node bin/openfeel.js lint i18n` | 531 键一致 |

**环境保护终检**：`.openfeel/config.yaml` 三值 `auto`/`enabled`/`true`，SHA256 前后一致（`867F79…E7BD7D`）✅；真实 `~/.openfeel/`、`~/.config/*` 未触碰 ✅。git status 中 `.openfeel/flow.json` 与 checkpoints 变更来自并行 op-001 流水线状态推进（时间戳 22:31~22:35，与本单元只读命令无因果；U2 全部写盘验证在临时目录完成）。

---

## 三、命令 × help 文案 × 实际行为 × 退出码对照表

> 实测环境为真实仓库（只读）+ 隔离 fixture。✅=文案与行为一致；⚠️=有偏差（对应发现编号）。

### flow 命令组（19 子命令）

| 子命令 | help 文案要点 | 实际行为 | 退出码 | 判定 |
|--------|-------------|---------|--------|------|
| flow status | 摘要；--verbose 增强；-n 条数 | 非 verbose 走 summary+耗时；verbose 走级联/变更/下游/恢复 | 0 | ✅ |
| flow overview | 全状态可视化 | 分节渲染；bugs 统计读 `.openfeel/bugs/index.md` 正则 | 0 | ✅ |
| flow current | 显示当前阶段和操作 | 5 行摘要输出 | 0 | ✅ |
| flow metrics | Agent 性能指标 | `MetricsStore.summary()`（lang 未传，见 REV-008 备注） | 0 | ✅ |
| flow phases | 列出合法 phase 与转移表 | 文本模式 + 自定义 phase 差异提示（cli/BUG-001 方案 B） | 0 | ✅ |
| flow phases --json | 输出 `{phases, transitions, advanceAccepted}` | 实测 JSON 三键齐备，advanceAccepted=15 内置 phase | 0 | ✅ |
| flow stage add | 仅注册不建目录；指引 plan stage add | validateStageId → addStage → save；冲突分类处理 | 0/1/2 | ✅ |
| flow stage remove | 安全校验；--force/--dry-run/--purge | 校验三场景（ops/current/被依赖）；dry-run 不写盘（实测 rev 不变） | 0/1/2 | ✅ |
| flow advance | --to 必填；--stage 必须指定；--force 不绕 REV | --stage 手动校验 exit 1；REV 阻塞不可 --force 绕过（代码 598-603）；**dry-run 在 autoRepair 场景写盘** | 0/1 | ⚠️ REV-001 |
| flow attempt | --result pass\|fail | 非法 result exit 1（实测）；fail→shouldReplan 自动推进 | 0/1 | ✅ |
| flow log | 最近 n 条 | slice(-n) 渲染 | 0 | ✅ |
| flow review add | --op 必填；--auto-fix 跳阶段；--blocking 默认 true | auto-fix 路径校验 stage/op 存在性；REV ID=length+1 | 0/1 | ✅（重复见 REV-011） |
| flow review resolve | 解决条目 | 不存在 exit 1 | 0/1 | ✅ |
| flow retry | 查询重试状态 | 解析 opId；stage/op 缺失分别报错 | 0/1 | ✅ |
| flow repair | --dry-run 仅检测；--backup | 修复结果分支输出；旧格式提示迁移 | 0/1 | ✅ |
| flow migrate | 旧 v4.0 → v4.1；--no-backup | dryRun 透传 core；--no-backup 经 `backup===false` 解析（注释明确） | 0/1 | ✅ |
| flow checkpoint list/restore | restore 需 --force | 无 --force exit 1 | 0/1 | ✅ |
| flow health | 全面健康检查；--quick | fail 项存在时 exit 1（实测悬空 op 报 ❌ exit 1） | 0/1 | ✅ |
| flow recover | 跨会话恢复 | 恢复上下文渲染 | 0 | ✅ |
| flow wizard | 交互式推进 | **非 TTY 渲染交互 UI 失败后 exit 0**（实测 `cmd /c "< NUL"`） | 0（异常也 0） | ⚠️ REV-004 |

### 其余命令组

| 命令 | help 文案要点 | 实际行为 | 退出码 | 判定 |
|------|-------------|---------|--------|------|
| init [path] | 初始化工作区；--demo/--lang/--workspace-only | 路径校验 exit 1；created/updated/skipped 分节 | 0/1 | ✅（无 try-catch 见 REV-009） |
| plan stage add | 完整入口；--deps 空格/逗号 | 建目录+overview/status+注册；**deps 不校验存在性** | 0/1 | ⚠️ REV-002 |
| plan stage list | 列出工作阶段 | 遍历 plan/{series}/stage-NN | 0 | ✅ |
| plan scheme create/list | 创建/列出方案 | 委托 core/plan/scheme | 0 | ✅ |
| stage status [id] | 无参列全部；有参显示详情 | 三级回退解析 status.md | 0/1 | ✅ |
| stage set | 原子更新 --status | 锁+备份+正则替换 | 0/1 | ✅ |
| stage task | --done/--undone 互斥 | 互斥校验 exit 1；taskNo 数值校验 | 0/1 | ✅ |
| stage create | 「已弃用，请改用 flow stage add」 | 弃用提示仅 TTY stderr（非 TTY 静默，实测代码路径）；行为=flow stage add 复制 | 0/1/2 | ✅（重复见 REV-012） |
| view list/add/accept | 审查条目管理 | add 校验 priority；accept 不存在 exit 1 | 0/1 | ✅（与 flow review add 重叠见 REV-011） |
| archive \<stage\> | 归档指定阶段 | 失败 exit 1；展示路径硬编码 join（漂移风险备注） | 0/1 | ✅ |
| roadmap create/show | 分期大纲 | 无 try-catch（REV-009） | 0 | ✅ |
| instructions | 生成 XML/JSON 指令 | resolveSchema 失败 exit 1 | 0/1 | ✅ |
| update [path] | 部署适配文件；--force 跳确认 | 有 path 全量部署；冲突/追加报告 | 0/1 | ✅ |
| knowledge list/add/search/index | 知识库管理 | add 校验 category（实测 exit 1）；list --type 不校验（宽松，可接受） | 0/1 | ✅ |
| project overview | 实时扫描概览 | 分节渲染 | 0 | ✅（中文硬编码见 REV-006） |
| config get-lang/set-lang/list-projects | 全局语言管理 | set-lang 校验合法值 exit 1 | 0/1 | ✅ |
| config get/set [-g] | 项目/全局配置 | 全局键白名单+值白名单（实测 exit 1）；项目模式仅 auto_advance | 0/1 | ✅（键不对称见 REV-010） |
| config effective [key] | 有效值+来源（status.md > config.yaml > profile.yaml > builtin） | 未知键 exit 1 并列受管键（实测）；全量输出四键 | 0/1 | ✅ |
| lint i18n/kb | 键一致性/过期引用 | **发现问题仍 exit 0** | 0（恒） | ⚠️ REV-005 |
| migrate [path] / rollback | Legacy 布局迁移 | 路径不存在 exit 1；rollback dry-run 回退读父 opts（注释明确） | 0/1 | ✅ |
| model set/get/list | 模型配置；--scope 校验 | 非法 scope exit 1（实测）；非 TTY default 需 force/build | 0/1 | ✅（i18n 泄漏见 REV-006） |
| setup | 纯全局部署 | --lang 白名单式归一 | 0 | ✅ |

---

## 四、必查项逐项结论

### 1. help × 行为对照 —— 结论：总体一致，2 处偏差
`flow phases --json` / `flow stage remove` / `config effective` / `stage create` 弃用 / `flow advance` 的 help 文案与实测行为一致（含 advanceAccepted 与 phases 的显式区分注释、`--no-backup` 经 `backup===false` 的 Commander 语义注释、rollback 父 opts 回退注释）。偏差：`flow advance --dry-run` 的 autoRepair 写盘（REV-001）；`flow wizard` 非 TTY 行为 help 未警示且 exit 0（REV-004）。

### 2. 退出码语义 —— 结论：0/1/2 约定成立，2 处例外
约定：0 成功 / 1 通用错误 / 2 并发冲突（`EXIT_CONCURRENT`，cli/index.ts:135）。隔离 fixture 24 场景实测：remove 不存在(1)、remove 活跃阶段(1)、remove dry-run 失败(1)、remove dry-run 成功(0)、advance 缺 --stage(1)、advance 非法 phase(1)、advance 跳跃(1)、advance --force --dry-run(0)、purge 非 TTY 无 force(1)、config effective 未知键(1)、config set 非法 key(1)、model 非法 scope(1)、view 非法 priority(1)、knowledge 非法 category(1)、attempt 非法 result(1)、health 失败(1)、重复 stageId(1)。例外：wizard 非 TTY 失败 exit 0（REV-004）；lint 发现问题恒 exit 0（REV-005）。

### 3. --dry-run / --force 语义 —— 结论：remove/advance 常规/migrate/repair 合规，1 处破坏
- `flow stage remove --dry-run`：**实测不写盘**（revision 1→1），失败也 exit 1（REV-005 履行）✅
- `flow advance --dry-run` 常规场景不写盘（revision 1→1）✅；**但目标阶段 phase/status 不一致时 autoRepair 先行 save 落盘**（实测 revision 1→2、phase 被改写）❌ REV-001
- `flow advance --force --dry-run`：跳过校验但不执行（help 明示，实测输出警告）✅
- `--force` 边界一致：跳过交互确认/安全校验，**不绕过 REV 阻塞**（advance done 路径硬性拒绝）；remove --purge 非 TTY 须 force（实测 exit 1）；checkpoint restore 无 force 拒绝 ✅
- migrate（flow/legacy 两域）dry-run 均代码级确认不落盘（core 层 dryRun 参数透传）

### 4. 三入口一致性 —— 结论：口径自洽，存在受控重复
- `plan stage add`（完整入口）↔ `flow stage add`（仅注册）：help 文案互相指引（flow.ts:376「通常应使用 openfeel plan stage add」；plan.ts:25「仅注册请用 openfeel flow stage add」）✅
- `stage create`：description 标注「已弃用，请改用 openfeel flow stage add」+ TTY 弃用提示（非 TTY 静默，对齐 init/update 对称静默惯例）✅；但 catch 块与 flow stage add 几乎逐行复制（并发/目录冲突/errorTmpl 三段），属受控重复，建议收敛到共享 helper（并入 REV-003 处理）
- 遗留困惑点：REV 双入口（view add vs flow review add）为另一处职责重叠（REV-011）

### 5. i18n 对称性 —— 结论：键级对称 531/531，运行时输出存在泄漏
- `lint i18n` 实测：`✅ 531 键一致`，exit 0 ✅
- en 实测（隔离 lang=en 项目）：flow 全组、remove、advance、review add、view add、config 组 help 均已翻译 ✅
- 泄漏（en 下仍输出中文）：**所有 argument 描述**（applyHelpI18n 不遍历 arguments，REV-003）；并发冲突提示（4 处）；REV 阻塞提示；Git 脏区警告；wizard/REPL 全部输出；project.ts 标题行；config/model 的变量插值中文。详见 REV-003/006。

### 6. 参数校验 —— 结论：绝大多数清晰，1 处缺失
非法 stageId（三入口统一 validateStageId+建议名，实测 exit 1 提示清晰）✅；非法 phase（列出合法枚举）✅；阶段跳跃（列出可达目标）✅；重复 stageId（`Stage 'stage-01' already exists`，实测 exit 1）✅；目录冲突（StageDirConflictError 分类 i18n）✅；purge 非 TTY 守卫 ✅。缺失：`--deps` 悬空引用静默入库（REV-002）。

### 7. 过度设计 / 死代码 —— 结论：无未使用选项；2 处重复实现 + 1 处死代码
- `src/index.ts:10` `export const VERSION = '0.1.0'`：全仓零引用（`rg "from '.*index.js'" src bin` 零命中）且与 package.json 1.1.2 漂移 → **记录并交 U7 交叉核对**（op-002 预定项履行）
- view add 与 flow review add 同数据源双入口（REV-011）
- i18n 双键冗余：`stage.create.desc` 与 `help.stage.create` 同文案两键（REV-007 关联）
- 未发现未使用的 option / 无复用需求的抽象层

### 内部模式一致性（5 项检查）
| 项 | 结论 |
|----|------|
| 校验风格 | 基本一致（validateStageId 三入口统一）；例外：init/update `--lang` 不校验合法值 vs config set-lang 严格校验；knowledge list --type 宽松 vs add 严格（可接受，但与 add 不对称） |
| 命名规范 | options 一律 camelCase，action 参数命名一致 ✅ |
| 错误处理 | **不一致**：update/archive/view/knowledge 有 try-catch+errorTmpl；init/roadmap 裸调 core（堆栈外泄风险，REV-009）；并发冲突 catch 在 4 处重复实现而不复用 handleCliError（REV-003 关联） |
| 返回模式 | console 输出 + process.exit，全命令一致 ✅ |
| 日志约定 | 命令层不直接 appendLog（经 core），一致 ✅ |

---

## 五、发现清单（映射 REV 条目）

| # | 位置 | 问题 | 级别 | blocking | REV |
|---|------|------|------|----------|-----|
| F1 | flow.ts:516-523 | advance --dry-run 在 autoRepair 场景写盘（实测 rev 1→2） | 功能缺陷 | **true** | REV-001 |
| F2 | plan.ts:39-44 + plan/stage.ts:100-105 | --deps 悬空引用静默入库（实测 exit 0） | 功能缺陷/数据完整性 | **true** | REV-002 |
| F3 | cli/index.ts:78-109 | applyHelpI18n 不覆盖 arguments → en 下全量中文泄漏 | 一致性 | false | REV-003 |
| F4 | flow.ts:1314-1325 | wizard 非 TTY 不静默 + 失败 exit 0 | 边界健壮性 | false | REV-004 |
| F5 | repl.ts:19,58-80 | REPL 内命令 process.exit(1) 杀死会话（实测） | 边界健壮性 | false | REV-005 |
| F6 | lint.ts:86-96,136-144 | lint i18n/kb 发现问题恒 exit 0（CI 门禁失效；对比 flow health exit 1） | 一致性 | false | REV-006 |
| F7 | cli/index.ts:140-142 + flow.ts:400,483,1317 + stage.ts:432 | 并发冲突提示硬编码中文且 4 处重复不复用 handleCliError | 一致性/i18n | false | REV-003 |
| F8 | flow.ts:77,594-603,648-651 | 运行时中文硬编码（'(无)'/REV 提示/Git 脏区） | i18n | false | REV-006 |
| F9 | config.ts:150,196 + model.ts:21,67 | 变量插值携带中文（en 模板+中文内容） | i18n | false | REV-006 |
| F10 | project.ts:33,101,106 | 输出硬编码中文 | i18n | false | REV-006 |
| F11 | repl.ts:27,41,49 | REPL 不走 i18n；help 列表含不存在的顶层 `scheme`、缺 7 个命令组 | 文档腐化 | false | REV-005 |
| F12 | config.ts:70,75 + stage.ts:404 | config 组无组级 description；注册时 t() 与注入链双轨求值；带 `{lang}` 占位符的输出模板键被误用作 description（靠注入链兜底）；`stage.create.desc`/`help.stage.create` 双键冗余 | 设计脆弱性 | false | REV-007 |
| F13 | init.ts:35-37 + roadmap.ts:21,31 | 无 try-catch，core 抛错时堆栈外泄（对比 update.ts:23 有包裹） | 一致性 | false | REV-009 |
| F14 | config.ts:214 vs config.ts:236-263 | config set 项目模式仅 auto_advance，与 effective 受管键（4 个）不对称 | 观察项（或有意设计） | false | REV-010 |
| F15 | src/index.ts:10 | VERSION='0.1.0' 零引用+漂移 | 死代码 | false | REV-008（交 U7） |
| F16 | view.ts:41-69 vs flow.ts:734-804 | REV 双入口：同数据源、filed_by/校验强度/参数面不一致；REV ID 基于 length+1 有重号风险（U1 交叉） | 重复实现 | false | REV-011 |
| F17 | stage.ts:140,164,185,192 | status.md 中文格式键解析假设（数据契约，当前自洽） | 观察项 | false | （U1/U3 交叉） |
| F18 | model.ts:96 | execSync('npm run build') 无 timeout | 观察项 | false | （随 REV-009 顺带） |

> F5 与 F11 同属 repl.ts，合并为 REV-005；F7/F8/F9/F10 同属「运行时中文硬编码」，按位置分组但同归 REV-006 修复面。

---

## 六、覆盖度与局限

**覆盖度**：23/23 文件全量通读；19+27=46 个子命令 help 实测；24 个退出码场景隔离实测；2 个 dry-run 写盘判定（remove/advance）实测 + 2 个（migrate/repair）代码级确认；en 语言隔离项目实测 7 个 help；硬编码扫描全量（rg + 人工判读）。预期 ≥15 条结论：实际 18 条发现 + 7 项必查结论，达成。

**局限（待实测项）**：
1. 并发冲突 exit 2 未实测复现（需双进程竞态），以代码路径审查为据（cli/index.ts:138-146、flow-manager isFlowConcurrentError 透传）；
2. `flow wizard` / `update` 交互分支的完整 TTY 流程未端到端实测（inquirer 交互模拟成本高，以非 TTY 实测+代码审查为据）；
3. lint kb 的引用解析启发式正确性未逐一构造边界用例（U6 将以 `lint kb` 全量输出交叉核对）；
4. `config effective` 的级联来源矩阵（4×N 组合）属 U3 范围，本单元仅验证未知键行为与 help 口径；
5. docs/commands.md 与 manual/cli/** 的全量文档对照属 U6，本单元仅抽查 `flow phases`/`config effective` 两节存在且口径一致。
