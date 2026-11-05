# v1.5.13-stage-128 计划（REQ-021 / fast 模式）

> 范围锁死：只有两个小项。不改版本号、不动 vite/vitest 配置、不扩到其它 phase 语义、不新增命令面。

## 一、事实（实测 / 源码定位）

**项 1（commit 相位）**

- `dsh/lib/guard.js` `classifyGitCommand` 的 `case 'commit'` 返回 `phases: ['exec_running', 'archiving']`（`:2236-2244`，数组在 `:2239`）。
- `allowsWholeTreeWrite(resolvedCwd, enforce, phases)`（`:2889`）用该数组判相位；唯一调用点在 `:3335`（第 2 类「整树写」分支）。没有其它调用者，也没有其它 `phases` 数组（全仓 grep 仅此一处）。
- 拒绝文案在 `:3360-3363`（`shell-git-whole-tree`），**是所有整树写共用的**（stash / clean / reset --hard 也走它）→ 不能整段替换成「四相位」，否则会谎报 `git reset --hard` 在 `review_passed` 可用。
- 既有测试：`dsh/test/guard.js:745`（D-126-02，断言 commit 在 `plan_review` 拒绝且文案含 `git 工作区写`）、`:1618`（P1-4，`archiving` 放行 / `done` 拒 / `git reset --hard` 在 archiving 仍拒 / commit 不受 `.openfeel/**` 干净约束）。
- **陷阱（必须写进验收）**：v1.5.12 op-002 的「纯书账」窄口在 `allowsWholeTreeWrite` 拒绝后才判定。若负例用「真实 git 仓库 + 仅改 `.openfeel/**`」，`done` 下仍会被 `git-commit-bookkeeping` 放行（设计如此，非本次要关的门）。负例必须用「非 git 临时目录」或「真实仓库 + `src/**` 待提交」，只留相位一个变量。

**项 2（frontmatter 截断）**

- `src/core/templates-data/skills/openfeel-cli-usage/SKILL.md:3` 是未加引号的 YAML 标量；实测 `yaml` 解析出 `description` 长度 **2455**，值尾停在 `…+ `--json` 出口`——`#` 之后（含 `#43` 自身、v1.5.11 / v1.5.12 / JSON 契约句 / 触发句）全部丢失。
- 该行**只有一个** `#`（index 2469，`--json` 出口 #43）。改动后 `#` 数量 = 0，解析值长度 **2766**（= 行 2779 − `description: ` 13），值尾为 `…阶段命名时加载。`。
- 生成链：`build.js` 步骤 4→`update.ts` 的 `SKILL_DEFINITIONS`（`:441`），步骤 6→`template-loader.ts` 的 `OPENCODE_SKILL_DEFINITIONS`（`:4453`）。二者是注入副本，**必须跑 `npm run build`**；`build.js` 末尾 `validateSingleSourceConsistency` 会校验源/注入一致。
- 既有正控：`test/core/templates.test.ts:521` 断言 `本文档为 v1.5.12 快照`（属正文，不受 frontmatter 改动影响），本次不得破坏。

## 二、项 1 改法

### 2.1 最终相位集合（唯一真值）

```js
phases: ['exec_running', 'review_passed', 'test_passed', 'archiving'],
```

**允许**：`exec_running` / `review_passed` / `test_passed` / `archiving`。
**仍拒**：`plan_pending` / `plan_review` / `plan_passed` / `scheme_*` / `review_pending` / `review_failed` / `test_pending` / `test_failed` / `done`（`done` 语义：工作已收口，落地走归档提交）。

### 2.2 `dsh/lib/guard.js` 改动点

1. `case 'commit'`（`:2228-2244`）：换数组；注释补一句「v1.5.13 / stage-128：审完即可提交（`review_passed`）/ 测完即可提交（`test_passed`），`done` 仍拒」。
2. 顶部注释 `:2108-2110` 与 `allowsWholeTreeWrite` JSDoc `:2882-2886`：把「额外允许 `archiving`」改为四相位表述。
3. 拒绝文案（`:3360-3387`）改为**按子命令分叉**，且相位串从 `classification.phases` 派生（单一真值，防两处漂移）：

```js
const allowedPhaseList = (classification.phases ?? ['exec_running']).join(' / ');
let denyMessage = classification.gitSubcommand === 'commit'
  ? t(
      `OpenFeel 写入门禁：禁止在当前阶段用 shell 做 git 工作区写（${classification.detail}）—— git commit 只允许活跃阶段处于 ${allowedPhaseList} 之一；plan_* / scheme_* / review_pending / test_pending / done 一律拒绝（工作已收口请走归档提交）。只读查询（git status / log / diff）不受影响。`,
      `OpenFeel write guard: git worktree writes via the shell (${classification.detail}) are blocked in this phase — git commit is only allowed when an active stage is in ${allowedPhaseList}; plan_* / scheme_* / review_pending / test_pending / done are always refused (once work is closed, commit through the archive flow). Read-only git status / log / diff are unaffected.`,
    )
  : t(/* 原通用文案，逐字保留 */);
```

   两处硬约束：① 保留 `git 工作区写` 四字（`:745` D-126-02 用 `/git 工作区写/` 断言，删了就假红）；② 非 commit 的通用文案**一字不动**（`stash` 用例 `/git 工作区写/` 靠它）。
4. 书账条件注释 `:3336-3348` 的 ① 与 `:3339`：由「无 `exec_running`/`archiving` 阶段」改为「无 `exec_running` / `review_passed` / `test_passed` / `archiving` 阶段」；代码条件本身不改（`allowsWholeTreeWrite` 已保证）。**行为后果写清楚**：`review_passed`/`test_passed` 不再需要走书账窄口（相位直接放行），窄口只剩 `plan_*` / `scheme_*` / `review_pending` / `test_pending` / `done` 五类。
5. `dsh/ADAPTER.md`：`:65` 的「无 `exec_running` 时的 `commit`」→「不在允许相位的 `commit`（`exec_running|review_passed|test_passed|archiving`）」；`:71` 的「无 `exec_running` / `archiving` 阶段时」→「无上述四相位时」。

### 2.3 测试（`dsh/test/guard.js`）

新增一个 `check('stage-128：commit 相位扩到 review_passed/test_passed（4 正 5 负）', ...)`，放在 `:1618` P1-4 之后：

| 相位 | 夹具 | 期望 |
|---|---|---|
| `exec_running` | `gitProject` + `src/**` 待提交 | 放行（回归） |
| `review_passed` | 同上 | 放行（**新增正例**） |
| `test_passed` | 同上 | 放行（**新增正例**） |
| `archiving` | 同上 | 放行（回归） |
| `plan_pending` | 同上 | 拒（**新增负例**） |
| `review_pending` | 同上 | 拒（**新增负例**） |
| `test_pending` | 同上 | 拒（**新增负例**） |
| `done` | 同上 | 拒（**新增负例**） |
| `plan_review` | `project(planFlow)` | 拒（回归 D-126-02） |

- 负例断言：`typeof result === 'string'` + `readAudit(dir).at(-1).reason === 'shell-git-whole-tree'`（隔离成功路径，不允许 `git-commit-bookkeeping`）+ 文案匹配 `/exec_running \/ review_passed \/ test_passed \/ archiving/`。
- 另加两条防退化断言：① `review_passed` + 真实仓库 + 仅 `.openfeel/**` 改动 → 放行（相位直放，`reason !== 'git-commit-bookkeeping'`，证明相位门真的放宽了）；② `done` + 真实仓库 + 仅 `.openfeel/**` 改动 → **仍放行**且 `reason === 'git-commit-bookkeeping'`（显式锁住 op-002 窄口，本次不动它）。
- `gitProject(...)` 返回 `null`（无 git）时沿用既有 `if (repo === null) return;` 跳过写法。

## 三、项 2 改法

### 3.1 最终文本（逐字，插入 `SKILL.md:3`；`:2779` 字符，`description` 值 2766 字符）

```text
description: OpenFeel CLI 命令用法参考：命令清单与关键参数、15 个 phase 枚举与转移表、stageId 命名与目录映射约定、v1.1.2 新增能力（自描述/可纠错、--json 结构化输出、health --fix、scheme draft、knowledge dedup、纠正清理侧命令面）、v1.1.4 新增能力（checkpoint 选择性恢复 --stage/--dry-run、flow stage reset 精准复位、故障恢复路径）、v1.1.5 新增能力（setup --check [--json] 诊断 / 被动部署提示）、v1.1.6 新增能力（Claude Code 适配器 `--tools claude` / settings 注入）、v1.1.7 新增能力（双模式工作流 workflow_mode：flow mode 只读查询 / flow phases --mode 模式分节 / plan stage add --workflow-mode / stage set --workflow-mode / config set --sync-stages --stage）、v1.2.0 新增能力（需求流转命令组 `openfeel req`：需求 7 状态与 10 子命令 / 认领协议；flow.json 版本分片归档 `flow archive`：`<version>` / `list` / `show`）、v1.2.1 新增能力（需求拆分 `req split` / 三模式 `full/fast/general` / 审查档位 `--review-tier` / 通用工作者 `openfeel-explorer` / 可观测性字段 / 模型默认值统一与部署非破坏性）、v1.2.2 新增能力（flow next 调度决策 / 全局 --project / 13 读命令 --json 与 33 成功出口·34 注册选项 / 错误封装 code+kind+errorKind / --version --json / flow archive 判据明细 / archive <stage> --json / reviewTier 消歧）、v1.2.3 修复（并发 JSON 退出统一 / --review-tier help 文案订正 / req 过滤单点化 / 锁超时 E2E 测试钩子）、v1.2.4 收口（archive <stage> 覆盖保护 + --force / plan stage list·model list|get·flow retry·lint i18n|kb·roadmap show --json / config get --all / 40 成功出口·41 注册选项）、v1.3.0（DSH 适配器单包分发 / setup --tools dsh / README 版本能力概览迁出）、v1.3.1 修复（setup --tools dsh 的 pnpm frozen-lockfile 部署失败）、v1.3.2（DSH 写入门禁 `ctx.tools.guard` + 非项目 bootstrap）、v1.3.3 修复（fast 阶段级 REV / `review_passed → exec_running` 返工边 / 写入门禁风险分层 / `plan stage add` 原子聚焦 / 阶段 ID ↔ 目录映射文档化）、v1.3.4 修复（适配器 `review_add --stage` 透传 / `setup --check` 五态含 restart-required / 部署标记刷新）、v1.3.5 修复（统一 shell 工具推荐：Windows 优先 Git Bash 其次 PowerShell 7）、v1.4.0 新增（静态展示资源与 doc 同层 + `openfeel chore` 微变更通道）、v1.5.0 新增（`openfeel dev sync` / 状态记录瘦身：Only-Feel 写状态、日志降级、30 分钟同步）、v1.5.2 新增（流程入口闸：无阶段研究/方案不可写）、v1.5.3 新增（派发契约 / 恢复包 / 结构化交接 / 批次发布）、v1.5.4 新增（日志摘要 / 快照 revision/stale / 观测指标）、v1.5.5 新增（preflight 账本 / 适配器 strict / 审查独立性）、v1.5.6 新增（preflight 写命令全覆盖 / `lint req` 需求正文命令名校验 + 抑制标记 / `flow metrics` 流程健康三项 + 适配器 `observability`）、v1.5.7 新增（需求导向：阶段 = 长期 `exec_running` 的版本容器 / 需求完成与阶段关闭解耦 / 归档发布需用户确认 / `feel_status` 默认 compact（`detail:"full"` 取全量）/ 阶段目录防复用）、v1.5.8 新增（归档官生成发布说明与开发 skill `--skill` / 多需求阶段 `requirements[]` / 多会话 P0（sessions 登记、并发自动提交跳过、`feel_status.sessions`）/ 完成必审验（`req review|verify` + `stage verify`）/ 需求随版本归档与发布门（`req release-check|rollover`、`--allow-unfinished`）、v1.5.9 收尾（文档 / 模板 / skill 快照刷新 + eslint 清零 + v1.5.7 归档补齐）、v1.5.10 新增（`openfeel dashboard` 单文件自包含 HTML 看板 + `--json` 出口 No.43）、v1.5.11 加固（shell 写入门禁 / 受保护路径扩展 / doc-asset 豁免收窄 / Win32 路径归一化 / cwd fail-closed + `guard-state` / chore 收窄）、v1.5.12 修复（`guard-stale` 重启后恒 stale 修复与受支持自愈 / `git commit` 纯书账放行 / git 外部执行面白名单 / dsh 测试隔离 + 多 profile 提示 + 门禁原因标题修正）；JSON 契约 43 成功出口 / 44 注册 `--json` 选项）。当需要查询 CLI 命令、参数、phase、stageId、阶段命名时加载。
```

相对现状**唯一**改动：`出口 #43` → `出口 No.43`（+2 字符）。不重排、不截短、不换行。

### 3.2 同步与测试

- 改源后跑 `npm run build`（重生成 `src/core/update.ts:441` 与 `src/core/template-loader.ts:4453` 的注入副本，并自带一致性校验）。
- 新增测试 `S6`：加在 `test/core/templates.test.ts` 的 `describe('stage-84：新 skill openfeel-req + cli-usage 补节（S4/S5）')` 内（`S5` 之后，`:546` 后追加），不新建文件（`/^---\n/` 解析逻辑少一层重复）。要点：
  1. `import { splitFrontmatter } from '../../src/core/managed-region.js'`（生产解析器，勿自写正则）。
  2. 解析 `CLI_SKILL` → `split.frontmatter.description` 为字符串，`length === 2766`（长度锚，截断必失败）。
  3. 必含：`v1.5.10 新增`、`openfeel dashboard`、`出口 No.43`、`v1.5.11 加固`、`guard-state`、`v1.5.12 修复`、`git commit` `纯书账放行`、`JSON 契约 43 成功出口`、末句 `当需要查询 CLI 命令、参数、phase、stageId、阶段命名时加载。`。
  4. 阴性：该行原文不匹配 `/\s#/`；解析值不以 `出口` 结尾（`not.toMatch(/出口$/)`）。
  5. 注入副本同步：`src/core/update.ts`、`src/core/template-loader.ts` 均含 `出口 No.43` 且**不含** `出口 #43`（防「改了源忘了 build」）。
- 不动 `test/core/templates.test.ts:521` 的 `本文档为 v1.5.12 快照` 正控（本次不刷快照声明；快照刷新属发布批次）。

## 四、文件清单

| 文件 | 动作 |
|---|---|
| `dsh/lib/guard.js` | 改（commit `phases` 数组 + 4 处注释 + 文案分叉 + 相位串派生） |
| `dsh/test/guard.js` | 改（新增 stage-128 check：4 正 / 5 负 + 2 条防退化） |
| `dsh/ADAPTER.md` | 改（`:65`、`:71` 两处相位表述） |
| `src/core/templates-data/skills/openfeel-cli-usage/SKILL.md` | 改（`:3` 唯一替换） |
| `src/core/update.ts` | 生成（`npm run build`，勿手改） |
| `src/core/template-loader.ts` | 生成（`npm run build`，勿手改） |
| `test/core/templates.test.ts` | 改（新增 S6） |
| `.openfeel/plan/v1/stage-128/{plan,overview}.md` | 本次计划产物 |

## 五、验收（6 条，可复验）

1. `node dsh/test/guard.js` 全绿；新 check 的 4 正 / 5 负全过，`P1-4` / `D-126-02` / op-002 全部书账用例零回归。
2. 四个允许相位的 commit 均 `undefined`；`plan_pending` / `review_pending` / `test_pending` / `done` 均为 `string` 且 `lastDecision.reason === 'shell-git-whole-tree'`。
3. commit 拒绝文案同时含 `exec_running / review_passed / test_passed / archiving` 与 `plan_* / scheme_* / review_pending / test_pending / done`；非 commit 整树写（`git reset --hard` / `git stash`）文案与改动前逐字一致。
4. `review_passed` 下只改 `.openfeel/**` 的真仓库 commit 走相位放行（`reason !== 'git-commit-bookkeeping'`）；`done` 下同类 commit 仍走书账放行（`reason === 'git-commit-bookkeeping'`）——两者同时成立才证明「只放宽相位、没动窄口」。
5. `npm run build` 成功（含 `validateSingleSourceConsistency`）；两份注入副本出现 `出口 No.43`、不再有 `出口 #43`；`SKILL.md:3` 无裸 `#`。
6. `npm test` 全绿：新 S6 通过，`templates.test.ts:521`（`本文档为 v1.5.12 快照`）与 S5 不回归。

## 六、风险

- **R1（中）宽容度误解**：`review_passed` 只放宽 **commit**，不放宽源码写入（`decideForTargets` 仍要求 `exec_running`）——即「已存在的脏改动可以提交，但不能再生新改动」。这是有意为之；文案已点明，避免被当成「审完可继续改代码」。
- **R2（高，易假绿）** 负例若用「真实 git 仓库 + 仅 `.openfeel/**`」，`done` 会被 op-002 书账窄口放行 → 负例必须带 `src/**` 待提交或使用非 git 临时目录，否则会把「未验证」写成「已验证」。
- **R3（中）注入副本分叉**：改 `templates-data` 后漏跑 `npm run build`，源码与 `update.ts` / `template-loader.ts` 不一致；S6 第 5 点即为该风险的自动化门。
- **R4（低）文案共用误伤**：把四相位写进所有整树写文案会谎报 `reset --hard` 可用；故必须按 `gitSubcommand === 'commit'` 分叉，并保留 `git 工作区写` 字样以维持既有断言。
- **R5（低）尺寸**：description 仅 +2 字符（2766），仍远低于模板尺寸约束；无快照/长度回归风险。
