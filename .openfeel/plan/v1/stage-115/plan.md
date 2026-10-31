# v1.5.6-stage-115 计划 — `openfeel lint req`（剥前缀 + 真实命令树解析 + 抑制标记）

- **阶段**：`v1.5.6-stage-115`（工作流模式 **fast**；批次发布，全部门禁绿才发 1.5.6）
- **关联需求**：REQ-017（`.openfeel/requirements/REQ-017.md`，判定规则与验收口径已在正文冻结）
- **基线**：v1.5.5（`--json` 注册 41 / 成功出口 40 / i18n 条目 1048 / 错误码 13）
- **目标**：把「需求正文里的命令名是否存在」变成机器可校验事实——新增 `openfeel lint req`；候选 span → 剥 `openfeel` 前缀 → 沿**真实命令树**贪心下降 → **A 类（断点）进 `issues`、`ok:false`、exit 1**；**B 类（疑似命令组）进 `suspects`、仅提示、exit 0**；抑制标记只服务「引用错误命令名」的场景（正文里的错误名该改就改，见 §4.3 分类处置）。
- **本计划的事实基线**：2026-10-31 逐文件 `read` + `grep` 核对（非推测）。行号均为**核对当刻**行号；执行期若被前置 op 或 stage-114 改动位移，需就地重新 `grep`（见 §11）。

---

## 0. 事实核对结果（先读这一节，再看设计）

### 0.1 命令层现状（`src/commands/lint.ts`，304 行）

| 符号 | 行 | 结论 |
|---|---|---|
| `registerLintCommand(program: Command)` | 45 | 形参即**根 program**（`src/cli/index.ts` 传入）→ 循环依赖的解法就在此 |
| `lint` 组 `.command('lint')` | 46-48 | description 硬编码中文，由 `applyHelpI18n` 用 `help.lint` 覆盖 |
| `lint i18n` | 51-71 | `.option('--json', t('help.lint.i18n.json', lang))`；`options.json` 分支 `emitJson(withSchemaVersion({target,ok,issues}))`；`issues.length>0` → `process.exitCode = 1` |
| `lint kb` | 74-97 | 同上形态；issues 由 `stale` 映射，`message` 用 `t('lint.kb.issueTmpl', …)` |
| `LintIssue` 接口 | 19-24 | `{path, message}` —— **新命令必须逐字复用此形状与键序** |
| `printLintI18n` / `printLintKb` | 150 / 206 | 人类输出与 issues 同源的既有范式（本阶段照抄） |

### 0.2 根命令树现状（`src/cli/index.ts`）

- `90-108` 静态 import 19 个 `register*Command`；`110-128` 在**模块顶层**逐一调用 → 一旦 import 该模块，导出的 `program` 就是**完整树**；`309` `export { program }`。
- 根命令 **19 个**：`init, flow, plan, view, archive, roadmap, instructions, update, knowledge, stage, project, config, lint, migrate, model, setup, req, chore, dev`。
- **无 `.alias()`、无 `.hideHelp()`、无 `_hidden`**（`grep` 零命中）→ 树遍历无需考虑别名/隐藏命令（`name()` 即唯一名，如 `'set-lang <lang>'` → `set-lang`）。
- 已核实的关键子树（`grep "\.command\('"`）：

| 父 | 子命令 | 出处 |
|---|---|---|
| `flow` | status,next,overview,current,metrics,phases,mode,**stage**,advance,attempt,ops,log,**review**,retry,repair,migrate,checkpoint,archive,health,recover,wizard | `flow.ts:48,53,184,313,460,509,538,644,704,935,1349,1404,1484,1550,1744,1829,1915,1976,2075,2340,2449,2531` |
| `flow.stage` | add,remove,set,reset | `flow.ts:709,739,818,886` |
| `flow.ops` | list | `flow.ts:1408` |
| `flow.review` | add,resolve,update,remove | `flow.ts:1555,1635,1658,1717` |
| `flow.checkpoint` | list,restore | `flow.ts:1981,2015` |
| `flow.archive` | list,show | `flow.ts:2242,2279` |
| `stage` | **status,set,task,create**（**无** deps/reset/remove） | `stage.ts:366,371,453,576,651` |
| `plan` | stage,scheme | `plan.ts:18,23,213` |
| `plan.stage` | add,list | `plan.ts:28,172` |
| `plan.scheme` | create,publish,rename,list,remove,register | `plan.ts:220,283,312,352,405,449` |
| `project` | overview | `project.ts:30,35` |
| `archive` | **无子命令**（`archive <stage>` 是位置参数） | `archive.ts:14` |
| `config` | get-lang,set-lang,list-projects,get,set,effective | `config.ts:87,92,102,118,136,264,466` |
| `knowledge` | list,add,search,index,dedup | `knowledge.ts:42,85,129,182,225` |
| `req` | add,list,show,claim,release,set,link,advance,split,board,next | `req.ts:111…696` |
| `lint` | i18n,kb（**新增 req**） | `lint.ts:52,75` |

### 0.3 现状实测：对本仓全部需求正文跑一遍「规则模拟」（只读，非 CLI 调用）

扫描 `.openfeel/requirements/*.md`（**实测 17 份**：REQ-001 ~ REQ-017；REQ-017 为本需求本体）、已应用现有抑制标记：

| 文件 | 行 | 类 | span | 断点 | Feel 裁定处置 |
|---|---|---|---|---|---|
| REQ-015.md | 11 | A | `archive create`、`flow config_sync_stage` | `archive`、`flow` | **改正文**（`flow archive`；`config set` + `--sync-stages`），**不加标记** |
| REQ-015.md | 18 | A | `flow review_add` / `flow review_resolve` / `flow review_update` / `flow review_remove` | `flow`（四名均为下划线写法；真名 `flow review add\|resolve\|update\|remove`） | **改正文**为 4 个独立 span，**不加标记** |
| REQ-015.md | 19 | A | `stage deps` / `stage reset` / `stage remove` | `stage` | **改正文**为真实入口，**不加标记** |
| REQ-015.md | 20 | B | `op create` / `op publish` | 尾命令 `create` / `publish` 已注册 | **改正文**为 `plan scheme create` / `plan scheme publish`，**不加标记** |
| REQ-015.md | 21 | A | `archive create` | `archive` | **改正文**为 `flow archive`，**不加标记** |
| REQ-017.md | 11 | A + B | A：`stage deps` / `stage reset` / `archive create`；B：`op create` | `stage` / `stage` / `archive` | **加行尾 `<!-- lint-req:ignore -->`** |
| REQ-017.md | 50 | A + B | A：`archive create` / `stage deps` / `stage reset` / `stage remove`；B：`op create` / `op publish` | 同上 | **加行尾 `<!-- lint-req:ignore -->`** |
| REQ-015.md | 51-76 / 82 | — | （已在既有区间/行内抑制内） | — | **保持现状，不动** |

**实测基线（按 REV-010 的「前导 token 串」新规则重跑；只读模拟，非 CLI 调用）**

| 时点 | candidates | A 类 | B 类 | A 唯一名 |
|---|---|---|---|---|
| **op-003 之前（现状）** | **198** | **17** | **5** | **9 个**：`archive create`、`flow config_sync_stage`、`flow review_add`、`flow review_resolve`、`flow review_update`、`flow review_remove`、`stage deps`、`stage reset`、`stage remove` |
| **op-003 之后** | **194** | **0** | **0** | — |
| **C12 反向**（REQ-015 已改正、REQ-017 去标记） | — | **7** | **3** | 4 个：`archive create`、`stage deps`、`stage reset`、`stage remove` |

- **candidates 口径**：应用抑制后**全部行内反引号 span** 计数（含单 token、含解析通过者）；与 REQ-017 `:50` 的「34」**不是同一口径**（那是在旧「整 span 跳过」规则下的多 token 计数，且未含 REQ-017 本体）。**不得把 34 / 135 / 198 任何数字硬编码为断言**——candidates 只出现在人类输出，不构成契约。
- **A 类不再只有 4 个**（REV-010/013 的直接后果）：旧口径「4 个」正是被「任一下划线 token → 整 span 跳过」掩盖的结果——`flow review_add` / `flow config_sync_stage` 整体免检。新规则下现状 **17 条 / 9 个唯一名**，其中 **REQ-015 `:18` 四名与 `:11` 的 `flow config_sync_stage` 是本轮真实漏项**。
- **B 类唯一名 2 个**（`op create` / `op publish`），现状出现 5 次。
- **两类行性质不同，处置必须分开（Feel 裁定）**：
  1. **规范性接入清单**（REQ-015 `:11/:18/:19/:20/:21`）→ **改正为真实命令名，零标记**。理由：把错误命令名留在规范清单里 = 把 bug 保留在正文，下一个人照抄就再犯。差异表（抑制区内 `:51-76`）保留「原文怎么写」的原始记录 ⇒ **正文改正 + 差异表保留原文 = 审计链**（不丢痕迹）。
  2. **引用错误命令名作为 bug 例证**（REQ-017 `:11/:50`）→ **加行尾行内标记**。引用即目的；改掉例证会让 REQ 失去论证对象。
- **验收口径不写具体份数**：写「**全部需求正文（扫描时点实测份数）exit 0**」。当前实测 17 份；处置落地后 A 0 / B 0 → exit 0。
- **反向用例（强制，进 op-003 验收）**：去掉 REQ-017 的行尾标记 → 必须报出 **7 个 A 类（4 个唯一名）+ 3 个 B 类**。
- 零误报样本（新规则下解析成功，不得报）：`plan scheme`、`stage`、`flow review`、`openfeel config get`、`openfeel flow next --json`、`stage status --json`、`flow stage reset v1.5.6-stage-114 --to plan_pending`（`/`、`<`、`--`、点号版本号都在前缀串处自然截断）。

### 0.4 i18n 现状（双表成对，实测各 **1048** 条）

- zh-CN 消息键区段：`675-687`（`lint.i18n.*` 7 条 + `lint.kb.*` 6 条）；help 键区段：`956-961`（`help.lint` / `help.lint.i18n` / `.json` / `help.lint.kb` / `.json`）。
- en 对应区段：`647-659`（消息）、`914-918`（help）。
- `zh-CN.ts` 每条 `{ key, zh: '…', en: '' }`；`en.ts` 每条 `{ key, zh: '', en: '…' }`。`collectLintI18n` 只检 **zh 表 `zh===''`** 与 **en 表 `en===''`**、以及键集合互差 → **两表都必须加**，否则 `lint i18n` 报「中文独有/英文独有」并 exit 1。
- 计数 1048 是**实测条目数**（`grep "{ key: '"` 计数），**仓库内不存在 1048 的硬断言**（`grep -rn 1048` 零命中）；`lint i18n` 的 `total` 由 `zhMap.size` 现算。⇒ 文档口径写 1048 → **1055**（**+7** = `help.lint.req` / `help.lint.req.json` + `lint.req.okTmpl` / `failTitleTmpl` / `issueTmpl` / `suspectTmpl` + `lint.req.unclosedRegionWarn`（REV-011 未闭合区间警告）；需求正文只算了 help 两键 +2）。
  - **执行期纪律**：不要去找「1048 的断言」——它不存在；唯一权威是 `node bin/openfeel.js lint i18n` 的实跑输出（见 §11）。

### 0.5 契约计数现状（三处对齐）

| 位置 | 行 | 现状 | 本阶段目标 |
|---|---|---|---|
| `test/commands/knowledge.test.ts` | 397 / 401 | `toHaveLength(41)` / `toBe(40)` | **42 / 41** |
| `docs/json-contract.md` | 3 / 168 / 172 / 173 / 174 | 40 出口 / 41 注册 | **41 / 42** |
| `docs/commands.md` | 984 | 40 出口 / **43** 注册选项（=41+2 chore） | **41 / 44** |
| `src/cli/index.ts` 源码 | — | `option('--json'` 去重 = 41 | 新增 1 → **42** |

### 0.6 生成物与文档锚点

- `build.js:6` 注释即契约：模板编码后注入 `src/core/template-loader.ts` 与 `src/core/update.ts`（`build.js:24` 定义路径；`78-79` 为 `AUTO-GENERATED-BEGIN/END` 锚点）→ **禁手改生成物**，只改 `src/core/templates-data/skills/openfeel-cli-usage/SKILL.md` 后 `npm run build` ×2。
- `package.json` / `dsh/package.json` 版本 1.5.5（本阶段**不改**，批次收口统一改）。
- 历史快照**不动**：`.openfeel/manual/index.md`、`docs/dsh-cli-requirements-supplement-1.2.3.md`、`docs/agent-tool-compatibility-fix.md`、`docs/claude-code-adapter-plan.md`、`GETTING_STARTED.md:232/241/250`（旧版本小节）。

---

## 1. 接口与算法

### 1.1 分层：纯函数进 `src/core/lint-req.ts`，`lint.ts` 只做 I/O 与输出

**新增唯一源文件**：`src/core/lint-req.ts`（纯函数 + 常量；**不 import `commander`、不 import `../cli/index.js`**）。

理由：
1. 可单测（给定「文本数组 + 已构建树」即可断言，不碰文件系统、不碰 Commander 解析）；
2. 规避循环依赖（`cli/index.ts` → `commands/lint.ts`；若 `lint.ts` 反向 import `cli/index.js` 即成环）；
3. 未来被 `flow health` 复用时，只需**参数注入**树（`flow.ts` 的 `registerFlowCommand(program)` 同样持有根 program），不需要任何 import 改动。

```ts
// src/core/lint-req.ts
import { t } from './i18n.js';

/** 命令树节点（纯数据，便于断言与序列化） */
export interface CommandNode {
  name: string;              // 已注册名（'set-lang'，不含参数占位）
  children: CommandNode[];   // 声明序
}

/** Commander Command 的结构子集（结构类型，避免 core → commander 依赖） */
export interface CommandLike {
  name(): string;
  commands: readonly CommandLike[];
}

export interface LintReqFile { path: string; content: string }  // path 为项目根相对路径

export type LintReqIssueKind = 'unknown-command' | 'suspect-command-group';

export interface LintReqIssue {
  path: string;                       // '.openfeel/requirements/REQ-017.md'
  line: number;                       // 1-based
  span: string;                       // 原始 span，不含反引号
  kind: LintReqIssueKind;
  breakAt: string | null;             // A 类=断点处父命令的**完整内部路径**（'flow' / 'flow.stage'）；B 类=尾 token
  message: string;                    // 已本地化，与 JSON issues[].message 逐字相同
}

export interface LintReqReport {
  files: number;             // 扫描的需求文件数
  candidates: number;        // 通过前缀串过滤的候选 span 数（含解析成功者与单 token 非根名）
  issues: LintReqIssue[];    // ★ 只含 A 类（阻塞，驱动 ok 与退出码）；已排序
  suspects: LintReqIssue[];  // ★ 只含 B 类（advisory，不影响 ok 与退出码）；同一排序
  unknownCount: number;      // = issues.length
  suspectCount: number;      // = suspects.length
  suppressedLines: number;   // 被抑制标记跳过的行数（人类输出用；不进 JSON —— REV-011）
  unclosedRegions: Array<{ path: string; line: number }>;  // 未闭合的 ignore-start（stderr 警告源）
}

/** 根 program → 命令树（递归，保序） */
export function toCommandTree(root: CommandLike): CommandNode[];

/** 纯函数主入口：给定文本与树，返回报告（不读写盘） */
export function lintRequirementFiles(
  files: readonly LintReqFile[],
  tree: readonly CommandNode[],
  lang: string,
): LintReqReport;

/** 便利入口：读 `<projectPath>/.openfeel/requirements/*.md`（按文件名升序）后调上一函数 */
export function lintRequirements(
  projectPath: string,
  tree: readonly CommandNode[],
  lang: string,
): LintReqReport;

/** 导出常量（供测试断言与文档引用） */
export const LINT_REQ_PREFIX = 'openfeel';
export const LINT_REQ_MAX_PREFIX_TOKENS = 4;                       // 前缀串 token 上限
export const LINT_REQ_PREFIX_TOKEN_RE = /^[a-z][a-z0-9_-]*$/;      // ★ 允许下划线（REV-010）
export const REQ_CANDIDATE_RE = /`([^`\n]+)`/g;                    // 行内反引号，不跨行
export const MARK_IGNORE = /<!--\s*lint-req:ignore\s*-->/;
export const MARK_START  = /<!--\s*lint-req:ignore-start\s*-->/;
export const MARK_END    = /<!--\s*lint-req:ignore-end\s*-->/;
```

### 1.2 算法（确定顺序，无 IIFE 分支）

```
lintRequirementFiles(files, tree, lang):
  names = collectAllNames(tree)            // 全树命令名集合（B 类用）
  issues = []; suspects = []; candidates = 0; suppressedLines = 0; unclosed = []
  for file of files (输入顺序 = 文件名字典序):
    inRegion = false; regionStart = 0       // ★ 每个文件重置
    for (lineText, idx) of file.content.split('\n'):
      ln = idx + 1
      plain = stripInlineCode(lineText)     // 剥离 `…` 后的文本，仅用于标记匹配
      isStart = MARK_START.test(plain); isEnd = MARK_END.test(plain)
      isInline = MARK_IGNORE.test(plain)    // `ignore` 后必须紧跟空白+`-->`，天然不吞 -start/-end
      suppressed = inRegion || isStart || isEnd || isInline
      if (isStart && !isEnd) { inRegion = true; regionStart = ln }   // 同行 start+end → 自闭合
      if (isEnd) inRegion = false
      if suppressed { suppressedLines += 1; continue }               // ★ REV-011：抑制行计数
      for m of lineText.matchAll(REQ_CANDIDATE_RE):
        raw = m[1].trim()
        run = takePrefixRun(raw.split(/\s+/))     // ★ REV-010：前缀 token 串（见下）
        if run.length === 0 → continue            // `--json` / `<stageId>` / 大写开头 / 点号版本号
        if run.length > MAX_PREFIX_TOKENS → continue   // 5+ token 整体跳过（保持 1..4 候选定义）
        candidates += 1
        t2 = run[0] === PREFIX ? run.slice(1) : run
        if t2.length === 0 → continue
        verdict = resolve(t2, tree)
        if verdict.kind === 'break'   → issues.push(A issue)，breakAt = verdict.at
        else if verdict.kind === 'notroot' && t2.length >= 2 && names.has(t2.at(-1)) → suspects.push(B issue)，breakAt = t2.at(-1)
        // 其余（含单 token 非根名、解析成功）→ 静默跳过
    if inRegion → unclosed.push({ path: file.path, line: regionStart })   // ★ REV-011：未闭合不许静默
  sort issues 与 suspects **各自** by (path asc, line asc, span 出现序)
  return { files: files.length, candidates, issues, suspects,
           unknownCount: issues.length, suspectCount: suspects.length,
           suppressedLines, unclosedRegions: unclosed }

takePrefixRun(tokens):                    // ★ REV-010 核心：不做「整 span 跳过」
  run = []
  for tok of tokens:
    if !PREFIX_TOKEN_RE.test(tok) → break   // 首个不合形态的 token 即停（保留已收集的前缀）
    run.push(tok)
  return run
  // 允许：小写字母开头、仅 a-z 0-9 _ -（★ 下划线允许，才能抓到 flow review_add / flow config_sync_stage）
  // 触发停止：以 `-` 开头（`--json` / `-v`）、以 `<` 开头（`<stageId>`）、大写开头（`REV-001` / `X`）、
  //           数字开头、含 `.` `/` `:` `*` `,` `@` `$` `{}` `=` `#` `+` 反斜杠 等任何其他字符

resolve(tokens, tree):                    // 贪心下降，最多 4 步
  if !rootNames.has(tokens[0]) return { kind: 'notroot' }
  cur = tokens[0]
  for i in 1..tokens.length-1:
    children = treeByPath(cur)
    if !children.has(tokens[i]) return { kind: 'break', at: cur }   // at = 断点处父命令的**完整路径**（'flow' / 'flow.stage'）
    cur = cur + '.' + tokens[i]
  return { kind: 'ok' }                  // 停在父命令也 ok（'stage' / 'plan scheme' / 'flow review'）
```

**新规则举例（执行期可直接当用例）**

| span | 前缀串 | 判定 |
|---|---|---|
| `flow review_add` | `flow` `review_add` | **A**（`review_add` 不是 `flow` 的子命令，断在 `flow`） |
| `flow config_sync_stage` | `flow` `config_sync_stage` | **A**（断在 `flow`） |
| `flow stats --json` | `flow` `stats`（`--json` 处停） | **A**（断在 `flow`） |
| `flow stage sett --json` | `flow` `stage` `sett` | **A**（断在 `flow.stage`） |
| `openfeel flow next --json` | `openfeel` `flow` `next` | 剥前缀 → `flow next` → 通过 |
| `flow review add <rev-id>` | `flow` `review` `add` | 通过（停在叶子） |
| `flow.json` | `flow`（`.` 处停） | 通过（根命令） |
| `plan_review` | `plan_review`（单 token，允许下划线） | 静默（非根名 + 单 token） |
| `--json` / `<stageId>` | 空 | 不构成候选 |

**排序契约**（测试可断言）：`issues` 与 `suspects` **各自独立**先按 `path` 升序（`'REQ-002.md' < 'REQ-010.md'` 用 `localeCompare('en')` 或纯 `sort()` 皆可，**执行期固定一种并写进注释**），同文件按 `line` 升序，同 line 按 span 在行内出现序。两类**不混排**（各自数组内有序即可，跨数组顺序不构成契约）。

### 1.3 命令层接线（`src/commands/lint.ts`，+1 子命令 +1 print 函数）

```ts
import { lintRequirements, toCommandTree, type LintReqIssue } from '../core/lint-req.js';   // 唯一新 import

export function registerLintCommand(program: Command): void {
  // …既有 i18n / kb 不动…

  // lint req — 需求正文命令名存在性
  lint
    .command('req')
    .description('校验需求正文中的命令名（沿真实命令树解析）')
    .option('--json', t('help.lint.req.json', getCliLang(process.cwd())))
    .action((options: { json?: boolean }) => {
      const lang = getCliLang(process.cwd());
      // ★ 树来自 registerLintCommand 收到的根 program（运行期现建），不 import cli/index
      const report = lintRequirements(process.cwd(), toCommandTree(program), lang);
      // ★ REV-011：未闭合区间不许静默 —— stderr 一行/处，不改退出码（stdout 仍恰好一个 JSON 文档）
      for (const r of report.unclosedRegions) {
        console.error(t('lint.req.unclosedRegionWarn', lang, { path: r.path, line: String(r.line) }));
      }
      if (options.json) {
        const map = (i: LintReqIssue) => ({ path: i.path, message: i.message });   // 键序 path,message
        emitJson(withSchemaVersion({
          target: 'req',
          ok: report.issues.length === 0,     // ★ 只由 A 类决定（与 #38/#39 的 ok=issues.length===0 语义一致）
          issues: report.issues.map(map),     // A 类（阻塞）
          suspects: report.suspects.map(map), // B 类（advisory，不影响 ok/退出码）
          unknownCount: report.unknownCount,
          suspectCount: report.suspectCount,
        }));
      } else {
        printLintReq(report, lang);
      }
      // R1 口径：仅 A 类影响退出码（B 类低置信只提示）
      if (report.issues.length > 0) {
        process.exitCode = 1;
      }
    });
}
```

`printLintReq(report, lang)` 形态（与 kb 同源；人类行 = `'  ' + path + ' ' + message`；**成功态也要展示 suspects**）：

```
✅ 未发现不存在的命令名（共检查 {candidates} 个候选 / {files} 个需求文件；抑制 {suppressed} 行）
  低置信提示：
    .openfeel/requirements/REQ-017.md L11: `op create` → 疑似未知命令组（尾命令 `create` 已注册）
❌ 发现 {unknown} 个不存在的命令名（另有 {suspect} 条低置信提示；抑制 {suppressed} 行）
  .openfeel/requirements/REQ-017.md L11: `stage deps` → 命令不存在（断在 `stage`）
  .openfeel/requirements/REQ-017.md L11: `op create` → 疑似未知命令组（尾命令 `create` 已注册）
```

- **成功态（`ok:true`）若 `suspects` 非空，必须逐条打印**（否则用户只看到「✅ 未发现…」而错过 B 类提示）——见 §3.1、C4。
- **抑制行数**恒出现在首行（`{suppressed}` = `report.suppressedLines`），让「抑制了多少」可见（REV-011）。
- **未闭合区间**：每个 `unclosedRegions` 条目在 **stderr** 打一行 `lint.req.unclosedRegionWarn`（`⚠️ {path} L{line}: 区间标记未闭合…`），**不改退出码**、不进 JSON（JSON 键集仍 7 键）。

**文案硬约束**：message **只报「不存在 + 断点位置」**，**不得**出现任何近似纠错建议（禁止「你是不是想写 `flow stage set --deps`」这类猜测）——见 §9。低置信项（B 类）排在 A 类之后输出（人类输出先打 `issues` 再打 `suspects`；JSON 用两个独立键，顺序天然分离）。

`ok:false` 时仍打印失败标题 + 全量 issue 行后由 action 置 `exitCode=1`（**不 `process.exit`**，沿用 lint i18n/kb 与 errors.ts 范式）。

### 1.4 循环依赖的明确约束（执行期红线）

- **禁止**：`src/commands/lint.ts` 里 `import { program } from '../cli/index.js'` —— `cli/index.ts:102` import `registerLintCommand`，成环（ESM 循环在注册期拿到 `undefined`，症状是「树为空 → 全部候选被判 B/静默」）。
- **正确**：action 闭包捕获 `registerLintCommand(program)` 的形参 `program`；`toCommandTree` 在 action 内**运行期**调用（此时全部命令已注册完，见 `cli/index.ts:110-128` 先于任何 `parse`）。
- **将来被复用**（如 `flow health` 内联调用）：不要 import lint 命令模块，把**树作为参数**传：
  `flow.ts` 的 `registerFlowCommand(program)` 同样持有根 program → `lintRequirementFiles(files, toCommandTree(program), lang)`。若某调用点确实拿不到根 program，就在命令层注入 `() => toCommandTree(root)` 工厂，**仍不 import cli/index**。
- **测试红线**：`lint req` 的测试**不得**用 `new Command()` + 仅 `registerLintCommand`（`test/commands/lint.test.ts:46-48` 就是那种写法）——那样树只有 `lint/i18n/kb/req`，`stage deps` 会被误判。
- **测试树来源（REV 修正）**：**直接 `import { program as rootProgram } from '../../src/cli/index.js'`**（生产同源、模块顶层已注册全部 19 组，见 `cli/index.ts:110-128`/`309`）。**不要**照抄 `test/cli/json-contract.test.ts:86-101` 去手写注册序列——那里实际只注册 **14** 组（缺 `init` / `update` / `migrate` / `chore` / `dev`），T2 的「19 根命令」守卫会因此失败。
  - `json-contract.test.ts` 的 `#41` 用例继续用**该文件自己的隔离 program（14 组）**，因此其 fixture **只能使用这 14 组下的命令名**（如 `flow` / `stage` / `archive` / `plan` / `config` / `project` / `lint` 子树），不得用 `chore` / `dev` / `migrate` / `init` / `update` 下的名字。

---

## 2. 候选识别与边界

### 2.1 识别规则（REV-010 修订：**前导 token 串**解析，不再「整 span 跳过」）

| 规则 | 实现 |
|---|---|
| 载体 | **行内反引号**：`/`([^`\n]+)`/g`（行内代码本不跨行；跨行反引号不识别，记已知边界） |
| 切分 | span 两端 `trim()` 后按 `/\s+/` 切分（多空格/制表符归一） |
| **前缀 token 串** | 从**第一个 token** 起连续收集匹配 `^[a-z][a-z0-9_-]*$` 的 token；**首个不匹配即停**（保留已收集的前缀），**不是**丢弃整个 span |
| token 形态 | `^[a-z][a-z0-9_-]*$` —— **允许下划线**（否则 `flow review_add` / `flow config_sync_stage` 永远免检，正是本轮真缺陷形态） |
| 串长 | `1 ≤ run.length ≤ 4`；**`> 4` 整体跳过**（保持 REQ-017 的「1–4 token」候选定义，`flow review add a b` 不入候选） |
| 剥前缀 | 仅首 token === `openfeel` 时剥一次（见 §2.2） |

**触发「停止扩展」（→ 用已收集前缀判定）的 token 形态**：以 `-` 开头（`--json` / `-v`）、以 `<` 开头（`<stageId>`）、大写开头（`REV-001` / `X`）、数字开头、含 `.` `/` `:` `*` `,` `@` `$` `{}` `=` `#` `+` 反斜杠等任何其他字符。

**为什么不「整 span 跳过」**（REV-010）：旧规则里 `openfeel flow next --json`、`stage status --json`、`flow log --json` 这类**最常见引用**会因末尾的 `--json` 被整体免检，写错成 `flow stats --json` / `flow stage sett --json` 也永远不报；更严重的是下划线形态（`flow review_add`、`flow config_sync_stage`）被静默放过。改为前缀串后，这些全部落入 A 类判定。

**天然不误报（新规则下的实际行为）**：

| span | 前缀串 | 结果 |
|---|---|---|
| `flow.json` | `flow`（`.` 处停） | 根命令 → 通过 |
| `plan_review` | `plan_review`（单 token，允许下划线） | 非根名 + 单 token → **静默**（不是「形态排除」） |
| `stage-114` / `op-001` | 同上，单 token | 非根名 + 单 token → **静默**（不是形态排除） |
| `docs/**` | `docs` | 非根名 + 单 token → 静默 |
| `--json` / `<stageId>` | 空串 | 不构成候选 |
| `flow review add/resolve/update/remove` | `flow` `review`（第三个 token 含 `/` 停） | 通过（停在父命令 `flow review`） |
| `openfeel.js` | `openfeel`（`.` 处停） | 剥前缀后为空 → 跳过 |

### 2.2 剥前缀

- 仅当**首 token 严格等于** `openfeel` 时剥**一次**；`openfeel openfeel x` 剥后首 token 仍是 `openfeel`（非根命令）→ 走 B 类判定。
- 剥后只剩 0 token（span 就是 `openfeel`）→ 直接跳过。

### 2.3 为什么**不需要**第二份命令清单

1. 树在 action 运行时由捕获的根 `program` 现建（§1.4），注册面是唯一真源；
2. 测试侧 import **生产同源**的 `program as rootProgram`（`src/cli/index.ts`，19 组已在模块顶层注册），并加一条守卫断言（§5 T2）：树根命令名集合 == 冻结的 19 项；
3. 若维护静态清单，任何新命令（含本阶段 `lint req` 自身）都会让清单漂移，产生「真命令被报错」的假阳性——REQ-017 §目标2.3 明令禁止。

### 2.4 扫描范围

- 只扫 `<project>/.openfeel/requirements/*.md`（**一层，不递归**），按文件名升序。
  - **符号链接的实现约束（REV low #17）**：用 `readdirSync(dir, { withFileTypes: true })` 并只取 `d.isFile() === true` 的项（`isDirectory()`/`isSymbolicLink()` 均排除）；**不得**用 `existsSync` 或裸 `readdirSync` 后再 `readFileSync`（那会跟随链接）。对 `isSymbolicLink()` 记一条 best-effort 跳过（不报错、不计数）。
- 目录不存在 / 无 `*.md` → `files=0, candidates=0, issues:[], suspects:[]` → `ok:true` + exit 0（镜像 `lint kb` 的「无目录即通过」；不追加 noDir 文案以省 i18n 键）。
- **不扫**：`docs/**`、`.openfeel/flow-archive/**`、`.openfeel/plan/**`、`.openfeel/log/**`、`.openfeel/kb/**`（它们是历史/错误命令名的合法引用面，见 §9）。

---

## 3. 分级、文案、退出码、JSON

### 3.1 A / B 两类判定表

| 类 | 判定（剥前缀**之后**） | 落哪个键 | `ok` | 退出码 | message 模板 |
|---|---|---|---|---|---|
| **A** `unknown-command` | 首 token 是根命令，且逐词下降在某处断掉 | **`issues`**（阻塞） | `false` | **1** | `lint.req.issueTmpl`（含 `{span}` + `{break}`） |
| **B** `suspect-command-group` | 首 token **非**根命令，`n ≥ 2`，且**尾 token** 命中全树命令名集合 | **`suspects`**（advisory） | 不影响（恒 `true`） | **0** | `lint.req.suspectTmpl`（含 `{span}` + `{tail}`） |
| 通过 | 逐 token 全部命中（允许停在父命令） | 都不落 | — | — | — |
| 静默 | 单 token 且非根命令；或两端都不满足 A/B | 都不落 | — | — | — |

**两键分离是 Feel 裁定的最终方案**（覆盖早期「B 类也进 `issues`、`ok = A 类为 0`」方案）：`issues` 只装 A 类、`suspects` 只装 B 类。好处是 `ok === (issues.length === 0)` 对所有 lint 出口**语义完全统一**，不必「看 `target` 才知道 `ok` 是什么意思」；代价是 `target:'req'` 比其他 lint 出口多两个键（`suspects` 与两个计数），属**新出口 #41 的合法新增**（无历史消费者，不受「只增不改」约束），但必须在 `docs/json-contract.md` §16 显式登记。

`{break}` = 失败处**父命令的完整内部路径**（`stage deps` → `stage`；`archive create` → `archive`；`flow stage deps` → `flow.stage`），人类可据此一眼定位断点层级（REQ low #10）。

### 3.1.1 已知退化边界（REQ medium #5，**写清并接受**，不得隐瞒）

| 场景 | 行为 | 说明 |
|---|---|---|
| `flwo stage set`（首 token 拼错） | **B 类**（advisory，`ok:true`，exit 0） | 首 token 非根 + 尾 token `set` 命中全树命令名 → 只提示不阻塞 |
| `stagee deps` | **完全静默** | 首 token 非根 + 尾 token `deps` 不是命令名 → 既非 A 也非 B |
| `npm run lint` / `git status` / `pnpm add` | **B 类**（suspects 噪声） | 尾 token 是已注册名（`lint` / `status` / `add`）→ B 面固有噪声。正因如此 **B 类永不改变 `ok`/退出码**；需求正文引用外部工具命令是常态 |
| `flow review add x`（小写裸占位符） | **A 类**，`breakAt = 'flow.review.add'` | `x` 不是 `flow review add` 的子命令 → 断在 `flow.review.add`。占位符应写成 `<x>` / `X` / 带点号版本号，避免被当作未知子命令 |

**「零误报」的准确范围**：本计划中「零误报」**只对当前 17 份正文成立**（op-003 后 A=0 / B=0），不是对所有未来正文的普遍保证；B 类噪声面（外部工具命令）已通过「不影响 `ok` 与退出码」被隔离。

### 3.2 退出码（不新增错误码）

- A 类 > 0 → `process.exitCode = 1`；
- 只有 B 类 / 无 issue / 目录缺失 → **不改** `process.exitCode`（默认 0）；
- **不 `process.exit`**、不 `failCli`、不新增 `src/core/errors.ts` 码行（码表恒 13 行）、不改退出码 0/1/2/3 语义。

### 3.3 `--json` 文档（**出口 #41**，七键固定序）

```json
{
  "schemaVersion": 1,
  "target": "req",
  "ok": false,
  "issues": [
    { "path": ".openfeel/requirements/REQ-017.md", "message": "L11: `stage deps` → 命令不存在（断在 `stage`）" }
  ],
  "suspects": [
    { "path": ".openfeel/requirements/REQ-017.md", "message": "L11: `op create` → 疑似未知命令组（尾命令 `create` 已注册）" }
  ],
  "unknownCount": 1,
  "suspectCount": 1
}
```

- **完整键序（出口 #41）**：`schemaVersion,target,ok,issues,suspects,unknownCount,suspectCount`（**恒 7 键**；`schemaVersion` 恒首；无历史消费者，新增键不受「只增不改」约束）。
- `issues[]` / `suspects[]` 元素键序恒为 `path,message`（复用 `LintIssue` 形状）；空集恒 `[]`（非 `null`）。
- **`ok = (issues.length === 0)`** —— 与 `#38/#39` **语义完全一致**，全 lint 出口统一：`ok:false` ⇔ 有阻塞问题 ⇔ exit 1。`suspects` 不参与 `ok`、不参与退出码。
- **与其他 lint 出口的唯一差异（必须显式登记）**：`target:'req'` 多 3 个键（`suspects` / `unknownCount` / `suspectCount`）——A/B 两级语义无法塞进单一 `issues` 数组而不破坏 `ok` 不变量。⇒ `docs/json-contract.md` §5 第 41 行 + 新增 §16 逐字写明「`target:'req'` 比其他 lint 出口多两个键（A/B 分级），理由：A 类阻塞 / B 类 advisory 必须可分」。
- `path` = 项目根相对路径（`.openfeel/requirements/<file>`），与 `lint kb` 的 `.openfeel/kb/<file>` 同风格；`message` 与人类输出**同一份字符串**（人类行 = `'  ' + path + ' ' + message`），不含绝对路径/反斜杠/**不含任何近似纠错建议**。
- **抑制统计与未闭合警告不进 JSON**（REV-011）：`suppressedLines` 只进人类输出（首行 `抑制 {n} 行`）；未闭合区间只进 **stderr**（`lint.req.unclosedRegionWarn`）。⇒ JSON 键集**仍恒 7 键**，§16 需写明「抑制行数/未闭合警告走人类输出与 stderr，不新增 JSON 键」。
- `--json` 模式 stdout **恰好一个** JSON 文档；stderr 仅在未闭合区间时出现警告行（不是错误信封、不影响退出码）；不提供 `--fix` / `--warn-only` / `--no-fail`。

### 3.4 新增 i18n 键（**7 个**，双表成对）

| 键 | zh-CN（`zh-CN.ts` 插入点：:687 后 / :961 后） | en（`en.ts` 插入点：:659 后 / :918 后） |
|---|---|---|
| `help.lint.req` | `校验需求正文中的命令名（沿真实命令树解析）` | `Validate command names in requirement bodies (resolved against the real command tree)` |
| `help.lint.req.json` | `以 JSON 输出 { schemaVersion, target, ok, issues, suspects, unknownCount, suspectCount }` | `Output { schemaVersion, target, ok, issues, suspects, unknownCount, suspectCount } as JSON` |
| `lint.req.okTmpl` | `✅ 未发现不存在的命令名（共检查 {n} 个候选 / {files} 个需求文件；抑制 {suppressed} 行）` | `✅ No nonexistent command names (checked {n} candidate(s) in {files} file(s); {suppressed} suppressed line(s))` |
| `lint.req.failTitleTmpl` | `❌ 发现 {m} 个不存在的命令名（另有 {low} 条低置信提示；抑制 {suppressed} 行）` | `❌ Found {m} nonexistent command name(s) ({low} low-confidence hint(s); {suppressed} suppressed line(s))` |
| `lint.req.issueTmpl` | `L{line}: \`{span}\` → 命令不存在（断在 \`{break}\`）` | `L{line}: \`{span}\` → command not found (lost at \`{break}\`)` |
| `lint.req.suspectTmpl` | `L{line}: \`{span}\` → 疑似未知命令组（尾命令 \`{tail}\` 已注册）` | `L{line}: \`{span}\` → suspected unknown command group (tail \`{tail}\` is registered)` |
| `lint.req.unclosedRegionWarn`（REV-011） | `⚠️ {path} L{line}: 区间标记未闭合（ignore-start 无对应 ignore-end），已抑制到文件末尾` | `⚠️ {path} L{line}: unclosed ignore-start region (no matching ignore-end); suppressed to end of file` |

同时**改文案不改计数**：`help.lint`（zh-CN `:957` / en `:914`）追加「需求正文命令名」/`requirement command names`。

> 口径说明：REQ-017 §目标5 写「1048 → +2」，只数了 help 两键；实际还需 4 个输出文案键 + REV-011 的 1 个警告键。**以 +7（→1055）为准**，并在 CHANGELOG/VERSIONS 用实测值。

---

## 4. 抑制机制（两档）

### 4.1 标记字面量

| 档 | 标记 | 作用范围 |
|---|---|---|
| 行内 | `<!-- lint-req:ignore -->` | 该行**全部**候选 |
| 区间起 | `<!-- lint-req:ignore-start -->` | 起行自身 + 其后各行 |
| 区间止 | `<!-- lint-req:ignore-end -->` | 止行自身；`inRegion = false` |

### 4.2 精确匹配规则

1. **匹配对象**：先 `stripInlineCode(line)`（`line.replace(/`[^`]*`/g, '')`），再跑三个正则。
   - 目的：**写在反引号里的标记写法不生效**——REQ-017 正文 `:31/:32` 正是「在文档里引用标记语法」，若对原文匹配会让这两行自抑制（并可能吞掉同行真问题）。此为本阶段**有意**设定。
2. **大小写**：**区分大小写**。`<!-- LINT-REQ:IGNORE -->` 不生效（记入用例 T15）。
3. **空白容忍**：`<!--` 与 `-->` 内侧允许任意空白/制表符（`\s*`），如 `<!--   lint-req:ignore   -->` 生效；标记之外的多余文本（同行其它内容）不影响。
4. **`ignore` 与 `ignore-start` 不互吞**：`MARK_IGNORE` 要求 `ignore` 之后是 `\s*-->`，`ignore-start` 的 `-` 不匹配 → 不会把区间起行误判为行内标记。
5. **同行 start+end**：视为该行**自闭合**（抑制该行，不开启区间）。
6. **嵌套 start**：区间状态是布尔标志，**不累加深度**；区间内再遇 `start` 等于 no-op（仍处于区间）。
7. **孤 `end`（无 `start`）**：视为普通行——不报错、不改变区间状态（幂等置 false）。
8. **未闭合 `start`**（REV-011）：区间**延续到文件末尾（EOF）**，**但不许静默**——
   - 文件结束时仍 `inRegion` → 记入 `report.unclosedRegions`（含起行号）→ action 在 **stderr** 打一行 `lint.req.unclosedRegionWarn`（每处一行）；
   - **不改退出码**（仍是 0/0 或按 A 类）；人类输出首行显示「抑制 {suppressed} 行」，让抑制量可见；
   - JSON 键集**不变**（不新增 `suppressed` / `unclosed` 键，见 §3.3）；
   - 文件之间状态独立（每个文件 `inRegion=false` 起始）；
   - 用例归属：**T13（core 层）**断言 `issues:[]`、`unclosedRegions.length===1`、`suppressedLines>0`；**C8（命令层）**断言 stderr 含 `lint.req.unclosedRegionWarn` 文案且 exit 0。
9. **粒度**：抑制是**行级**的——被抑制的行不提取候选、不解析，因此 `issues` 与 `suspects` **都不产生**任何条目。
10. **已知边界（记录，不处理）**：围栏代码块（```` ``` ````）内的标记仍会生效（不做围栏感知）；若未来需要在文档里展示标记且不生效，用「反引号包裹」即可（规则 1）。

### 4.3 分类处置（本阶段必须做，见 §10 op-003）——**不是「一律补标记」**

Feel 裁定：两类行**性质不同**，处置必须分开。**规范性接入清单**要改正正文（留错误名 = 把 bug 留在正文）；**bug 例证**要加标记（引用即目的）。

#### 4.3.1 REQ-015：**五处**正文改正（`:11/:18/:19/:20/:21`），零标记

> **改写风格（REQ medium #8）**：每个命令**独立一个反引号 span**，**不在单 span 内用 `/` 并列**——`flow review add/resolve/...` 这种写法会被前缀串在 `/` 处截断成 `flow review`，改写后仍不受校验。拆分后每个 span 都是可校验的前缀串。

| 行 | before（现状片段） | after（改法） |
|---|---|---|
| `:11` | `…绕过 strict：`flow review add/resolve/update/remove`、`stage set/task/deps/reset/remove`、`op create/publish/attempt`、`archive create`、`flow config_sync_stage` 等。` | `…绕过 strict：`flow review add` / `flow review resolve` / `flow review update` / `flow review remove`、`stage set` / `stage task`、`flow stage set` / `flow stage reset` / `flow stage remove`、`plan scheme create` / `plan scheme publish`、`flow attempt`、`flow archive`、`config set`（`--sync-stages`）等。` |
| `:18` | `   - `flow review_add` / `flow review_resolve` / `flow review_update` / `flow review_remove`` | `   - `flow review add` / `flow review resolve` / `flow review update` / `flow review remove`` |
| `:19` | `   - `stage set` / `stage task` / `stage deps` / `stage reset` / `stage remove`` | `   - `stage set` / `stage task` / `flow stage set`（依赖写入用 `--deps`）/ `flow stage reset`（`--to <phase>`）/ `flow stage remove`` |
| `:20` | `   - `op create`（`plan scheme create`）/ `op publish` / `flow attempt`` | `   - `plan scheme create` / `plan scheme publish` / `flow attempt`` |
| `:21` | `   - `archive create`（版本归档）` | `   - `flow archive`（版本归档）` |

- **语义等价说明**（改法不是猜的，差异表 `REQ-015.md:54-67` 已给权威映射）：`stage deps` → `flow stage set --deps <ids...>`；`stage reset` → `flow stage reset <stageId> --to <phase>`；`stage remove` → `flow stage remove <stageId>`；`op create` → `plan scheme create`；`op publish` → `plan scheme publish`；`archive create`（版本归档）→ `flow archive`；**`flow review_add|resolve|update|remove` → `flow review add|resolve|update|remove`**；**`flow config_sync_stage` → `config set ... --sync-stages`**（差异表 `:67` 自己写明「无此命名」）。
- **`after` 取「裸命令 + 括号内说明参数」**：让 span 继续受 `lint req` 覆盖（`flow stage set` / `flow stage reset` / `flow stage remove` 均解析成功）。带参形式（`flow stage set --deps <ids...>`）的 span 会在 `--deps` 处截断、前缀仍是 `flow stage set` → 同样通过；但拆开写更可校验。
- **零标记**：这 5 行改完**不**加 `lint-req:ignore`。
- **审计链不丢**：差异表（抑制区内 `:51-76`）保留原文，`:82` 变更记录留痕 ⇒ **正文改正 + 差异表保留原文 = 完整审计链**。

#### 4.3.2 REQ-017：两处**行尾行内标记**，正文不改

| 行 | 处置 |
|---|---|
| `:11` | 行尾追加 `<!-- lint-req:ignore -->` —— 该行是「导致 `stage deps` / `stage reset` / `op create` / `archive create` 这类根本不存在的地方」的**例证**，引用错误名就是论证目的 |
| `:50` | 行尾追加 `<!-- lint-req:ignore -->` —— 该行是「实测基线：A 类 4 个 / B 类 7 个」的**度量记录**，同属例证 |

#### 4.3.3 保持不变

`REQ-015.md:51-76`（区间标记，差异表）与 `:82`（行内标记，变更记录）**原样不动**，不要重复抑制。

#### 4.3.4 验收口径

- 正向：**全部需求正文（扫描时点实测份数）exit 0**——不写死「N 份」（当前实测 17 份；份数随需求增长）。
- 反向（**强制，进 op-003 验收**）：去掉 REQ-017 `:11/:50` 的行尾标记 → `lint req` 必须报出 **7 个 A 类（4 个唯一名）+ 3 个 B 类**，否则标记失效或解析失效。
- 残余错误名（**强制，REQ-013 验收，**已按审计链收窄范围**——见下）：`grep -n "flow review_\|flow config_sync_stage" .openfeel/requirements` 的**所有命中必须落在 `REQ-015.md:51-76`（差异表）或 `:82`（变更记录）**；任何命中落在其余行 → 失败。
  - **事实依据**：`REQ-015.md:67` 是差异表的权威映射行（「`flow config_sync_stage` | **无此命名**；实际为 `config set ... --sync-stages`」），**必须**保留错误名才能充当审计记录；因此「全仓零命中」与「差异表保留原文」不可同时成立，判据取「抑制区外零命中」。

### 4.4 抑制标记的**使用约束**（硬要求）

1. **只允许**用于「正文按定义必须引用**错误命令名**」的场景：bug 例证 / 历史差异记录 / 错误示例。**不得**用来「掩盖正文里的错误命令名」——那属于 §4.3.1 的正文改正场景。
2. **执行期自查**：每新增一处标记，必须在**同一行**（行内标记）或**同一节**（区间标记）说明「为什么这里必须引用错误名」。现有标记均已满足（`REQ-015.md:52`「本节按定义要引用『错误命令名』」、`:82` 变更记录、`REQ-017.md:11/:50` 例证）。
3. 新增标记必须**同时**配反向验证（§5.2 C12）：删掉标记后能报出预期条数，否则视为无效使用。
4. 禁止用标记覆盖真实规范性内容（会把同一节里将来出现的新缺陷一起吞掉）；区间边界要贴住「引用面」，不要整章包裹。

---

## 5. 测试矩阵

### 5.1 `test/core/lint-req.test.ts`（新增，纯函数，**21 条**；op-001 交付）

| # | 用例名 | 断言要点 |
|---|---|---|
| T1 | 树构建：嵌套与带参命令名归一 | `plan → stage/scheme`、`config → set-lang`（源字符串 `'set-lang <lang>'`）、children 保序 |
| T2 | **守卫**：生产树根命令 == 冻结 19 项 | `toCommandTree(rootProgram)`（**import `program as rootProgram`**）根名排序后等于 19 项清单；且含 `lint→req` |
| T3 | 单 token 根命令通过 | `stage` / `flow` → 0 issue |
| T4 | 单 token 非根命令静默 | `create` / `deps` / `plan_review` → 0 issue（B 类要求 ≥2 token） |
| T5 | 停在父命令合法 | `plan scheme` / `flow review` → 0 issue |
| T6 | 前缀串 token 上限（**修正**） | `flow review add` 通过；**`flow review add a b`（5 token）** → 跳过、candidates 不增。⚠️ 旧文案的 `flow review add x` 是 **4 token**，会正常产生 A 类（`x` 非子命令），不能当「超限」用例 |
| T7 | 前缀串停止条件 / 单 token 静默（**修正**） | `flow.json`、`--json`、`<stageId>`、`docs/**`、`openfeel.js` → 0 issue；`plan_review` / `stage-114` / `op-001` **入候选但不报**（它们是单 token 非根名而静默，**不是形态排除**） |
| T8 | `openfeel` 前缀剥离 | `openfeel config get` / `openfeel lint req` → 0 issue |
| T9 | A 类四名（根级断点） | `stage deps` / `stage reset` / `stage remove` / `archive create` → `issues` 4 条，`breakAt` = `stage/stage/stage/archive`；`suspects` 空 |
| T9b | **断点全路径**（REQ low #10） | `flow stage deps` → A，`breakAt === 'flow.stage'`，`message` 含 `flow.stage` |
| T10 | B 类两名 | `op create` / `op publish` → `suspects` 2 条，`issues` 空、`unknownCount=0`、`suspectCount=2` |
| T11 | 行内抑制 | `` `stage deps` <!-- lint-req:ignore --> `` → 0 issue，`suppressedLines===1` |
| T12 | 区间抑制 | start/end 包住 3 行 A 类 → 0 issue；区间外同行仍报 |
| T13 | **未闭合区间 → EOF + 警告**（REV-011） | start 后两行 A 类、无 end → `issues:[]`、`unclosedRegions.length===1`、`suppressedLines>0`、未闭合警告文案可断言（不再只断言 exit 0） |
| T14 | 孤 `ignore-end` | 无 start 的 end 行不报错，其后 `stage deps` 仍被报 |
| T15 | 标记大小写敏感 + 写在反引号内不生效 | `<!-- LINT-REQ:IGNORE -->` 与 `` `<!-- lint-req:ignore -->` `` 都不抑制 |
| T16 | 排序确定性 | 两文件多条 issue → `issues`/`suspects` 各自 `path` 升序、同文件 `line` 升序 |
| T17 | **退化边界**（REQ medium #5） | `flwo stage set` → **B**（尾 token `set`）；`stagee deps` → **静默**；`npm run lint` → **B**（外部工具噪声面） |
| T18 | **REV-010 新规则命中** | `flow review_add` → A（断 `flow`）；`flow config_sync_stage` → A；`flow stats --json` → A；`flow stage sett --json` → A（断 `flow.stage`） |
| T19 | 空文件 / 无候选 | 空正文、仅空白行 → `candidates===0 && issues===[] && suspects===[]`，不抛错 |
| T20 | 同行多候选 | 同一行 `A + A` → 2 条 issues；同一行 `A + B` → issues 1 条 + suspects 1 条（两键不串） |

### 5.2 `test/commands/lint-req.test.ts`（新增，命令层，**14 条**；含 op 归属）

> 前置（`beforeEach`）：**`import { program as rootProgram } from '../../src/cli/index.js'`** + `rootProgram.exitOverride()`（生产同源树，19 组；**不要**手写 14 组的注册序列，见 §1.4 / REQ medium #7）；`process.cwd` mock 到 tmp；`tmp/.openfeel/requirements/` 下写 fixture 正文；`console.log` / `console.error` spy；`afterEach` 还原 `process.exitCode`。
> **spawn 纪律**：若某用例改为 spawn 真 CLI（而非进程内 parse），**必须显式传 `OPENFEEL_PREFLIGHT`**（如 `env: { ...process.env, OPENFEEL_PREFLIGHT: 'warn' }`）——继承宿主环境的 `off` 会让断言恒绿。

| # | 用例名 | 归属 |
|---|---|---|
| C1 | 目录缺失 / 空目录 → `ok:true,issues:[],suspects:[]` + exit 0 | op-002 |
| C2 | **真缺陷 6 例**（参数化：`stage deps` / `stage reset` / `stage remove` / `archive create` / `op create` / `op publish`） | op-002 |
| C3 | **A 类进 `issues`**：`ok:false`、`issues.length===1`、`suspects:[]`、`unknownCount===1`、**exit 1**、message 含 span 与断点 | op-002 |
| C4 | **B 类进 `suspects`**：`issues:[]`、`ok:true`、`suspects.length===2`、`suspectCount===2`、**exit 0**；**且人类输出必须出现 suspects 行**（成功态展示，REQ medium #9） | op-002 |
| C5 | **零误报 4 例**：`plan scheme` / `stage` / `flow review` / `openfeel config get` | op-002 |
| C6 | 行内标记 → exit 0 + 首行含「抑制 1 行」 | op-002 |
| C7 | 区间标记 → exit 0 | op-002 |
| C8 | **未闭合区间**：exit 0 + **stderr 含 `lint.req.unclosedRegionWarn` 文案** + 首行抑制行数 > 0（REV-011） | op-002 |
| C9 | **`--json` 七键形状**：键序 `schemaVersion,target,ok,issues,suspects,unknownCount,suspectCount`；`target:'req'`；元素均 `{path,message}`；空态 `[]`/`0`；**无 `suppressed`/`unclosed` 键** | op-002 |
| C10 | **全部真实正文 exit 0**：不 mock cwd，读真实 `.openfeel/requirements`（模块顶层 `REAL_CWD` 反守卫，照抄 `test/cli/json-contract.test.ts:57-59`）→ `files>0 && issues:[] && suspects:[]`（份数取实测，不硬编码） | **op-003 验收**（REV-012：依赖正文改正，不能放 op-002） |
| C11 | **A+B 混合不串键**：同一正文含 1 个 A + 1 个 B → `issues` 1 条 / `suspects` 1 条 / `ok:false` / exit 1 | op-002 |
| C12 | **反向用例**：取真实 `REQ-017.md` 副本，去掉 `:11/:50` 行尾标记（内存或临时项目）→ `unknownCount===7`、`suspectCount===3`；对照原文件 `0/0` | **op-003 验收**（REV-012） |
| C13 | **退化边界**（REQ medium #5）：`flwo stage set` → `suspects` 命中且 **exit 0**；`stagee deps` → 完全静默 | op-002 |
| C14 | **空文件 / 同行双候选**（REQ low #19）：空正文 → `candidates 0` + `ok:true`；同一行 A+A → `issues` 2 条；同一行 A+B → issues 1 + suspects 1 | op-002 |

### 5.3 既有测试改动

| 文件 | 行 | 改动 |
|---|---|---|
| `test/commands/knowledge.test.ts` | 384 / 397 / 401 | 用例名改「注册 --json 选项 **42** / 成功出口 **41**」；`toHaveLength(41)` → `42`；`toBe(40)` → `41`（`errorOnly` 逻辑不变） |
| `test/cli/json-contract.test.ts` | 1056 后 | 新增 `it('#41 lint req：七键 + issues/suspects 分离；A 类 ok:false+exit 1 / B 类 ok:true+exit 0', …)`；**用该文件自己的隔离 `program`（14 组）**，故 fixture 只用这 14 组下的命令名（`flow`/`stage`/`archive`/`plan`/`config`/`project`/`lint`），复用该文件既有 `doc()` 助手 |
| `test/commands/lint.test.ts` | 不动 | 它用 `new Command()` + 仅 `registerLintCommand`（46-48），不调用 `lint req` → 无影响（见 §1.4 测试红线） |

**新增用例合计 36 条**（core **21** + commands **14** + json-contract **1**），改动用例 1 条；不删除/不改语义其余用例。
- **op 归属（REV-012，写死）**：`test/core/lint-req.test.ts` 21 条与 `test/commands/lint-req.test.ts` 的 **C1~C9、C11、C13、C14（12 条 fixture 级）** 属 **op-002**；**C10、C12 属 op-003 验收**（依赖正文改正），op-002 落地时不得因它们未绿而判失败。
- `json-contract.test.ts` 的 `#41` 属 **op-004**（与计数同批）。

---

## 6. 契约计数与文档清单（逐文件逐行）

### 6.1 源码 / 测试 / i18n

| 文件 | 位置 | 改动 |
|---|---|---|
| `src/core/lint-req.ts` | **新增**（约 230-280 行） | §1.1 全部导出；纯函数、零 commander 依赖 |
| `src/commands/lint.ts` | 顶部 import 区（16 后） | `import { lintRequirements, toCommandTree } from '../core/lint-req.js'` |
| `src/commands/lint.ts` | 97 后 | 追加 `lint req` 子命令（§1.3） |
| `src/commands/lint.ts` | 223 后 | 追加 `printLintReq`（§1.3 文案） |
| `src/core/i18n-data/zh-CN.ts` | 687 后（消息 4 键）、961 后（help 2 键）、957 文案 | §3.4 |
| `src/core/i18n-data/en.ts` | 659 后、918 后、914 文案 | §3.4（**双表成对**，漏一侧 → `lint i18n` exit 1） |
| `test/core/lint-req.test.ts` | 新增 | 21 条（§5.1，op-001） |
| `test/commands/lint-req.test.ts` | 新增 | 14 条（§5.2；op-002 交付 12 条 fixture 级，op-003 验收 C10/C12） |
| `test/commands/knowledge.test.ts` | 384/397/401 | 42 / 41 |
| `test/cli/json-contract.test.ts` | 1056 后 | `#41 lint req` 用例（op-004；用该文件 14 组隔离树） |
| `package.json` / `dsh/package.json` | — | **不改**（批次收口统一改版本号） |

### 6.2 `docs/json-contract.md`（权威契约）

| 行 | 现状 | 改为 |
|---|---|---|
| 1 | `# OpenFeel CLI JSON 输出契约（v1.2.4）` | `（v1.5.6）` |
| 3 | 权威范围「40 个成功出口」 | **41** |
| 6 前 | — | 新增 bullet：`v1.5.6-stage-115 收口：新增出口 #41 lint req；计数 41 成功出口 / 42 注册 --json 选项；详见 §16` |
| 98 | `## §5 40 出口冻结表` | `## §5 41 出口冻结表` |
| 100 | `40 个成功 JSON 出口（#1~#40）` | 41 / `#1~#41` |
| 143 后 | 表末 #40 | 新增行：`| 41 | \`lint req\` | \`schemaVersion,target,ok,issues,suspects,unknownCount,suspectCount\` | \`target:"req"\`；\`issues[]{path,message}\`（A 类）；\`suspects[]{path,message}\`（B 类）；两个计数为 number；\`path = .openfeel/requirements/<file>\` | \`ok = (issues.length === 0)\`（与 #38/#39 一致）；\`suspects\` 不参与 ok/退出码；无需求目录 → \`ok:true,issues:[],suspects:[]\`；A 类 → \`ok:false\`+exit 1 |` |
| 147-164 | §6 登记 1~16 条 | 追加第 17 条：`v1.5.6-stage-115：新增出口 #41 lint req——target:'req' 比其他 lint 出口多出 \`suspects\` 与两个计数键（共 3 个新键：\`suspects\` / \`unknownCount\` / \`suspectCount\`；A 类阻塞 / B 类 advisory 必须可分）；\`ok = issues.length===0\` 与 #38/#39 完全一致；详见 §16` |
| 168-169 | `成功 JSON 出口 = 40 个（… + lint 2 + roadmap 1）`；`:169` 的 `flow 15 = …` 枚举**漏了 `flow retry`**（分项本来差 1） | 总数 → **41**；`flow 15` → **`flow 16`** 并在 `:169` 枚举补 `retry`；`lint 2` → **`lint 3`**（REQ low #13） |
| 170 | v1.2.4 新增 7 个 | 追加：`v1.5.6 新增 1 个：#41 lint req` |
| 172 | 注册 `--json` 选项 41；`lint kb` 与 `lint i18n` 各计 1 | **42**；补 `lint req` 亦各计 1 |
| 173 | 三处对齐 41 / 40+41 / #1~#40 / knowledge=41/40 | 42 / 41+42 / #1~#41 / knowledge=**42/41** |
| 174 | 「不计入 40 … 41」 | 41 / 42 |
| 370 | §15.4 `lint i18n\|kb` 细则 | 追加一句 `lint req` 见 §16（历史小节不改口径） |
| 文末 | （377 行结束） | 追加 `## §16 v1.5.6-stage-115 细则（lint req）`：**首段必须写「`target:'req'` 比其他 lint 出口多出 `suspects` 与两个计数键（共 3 个新键），理由：A/B 分级——A 类阻塞驱动 `ok` 与退出码，B 类 advisory 仅提示」**；再写 A/B 判定、`ok = issues.length === 0` 与 #38/#39 一致、抑制两档 + **使用约束**、**未闭合区间 → stderr 警告 + 人类输出抑制行数（不新增 JSON 键）**、扫描边界、排序、退出码、`path` 口径、无建议原则 |

### 6.3 `docs/commands.md`

| 行 | 改动 |
|---|---|
| 28 | 「不计入 40 个成功出口、也不计入 41 个注册选项」→ **41 / 42** |
| 870-872 | lint 代码块追加 `openfeel lint req [--json]     # 需求正文命令名存在性（真实命令树 + 剥 openfeel 前缀）` |
| 874 | `target ∈ {i18n,kb}` → `{i18n,kb,req}`；追加 req 段：**`target:'req'` 七键**（多 `suspects`/`unknownCount`/`suspectCount`，A 类进 `issues` 驱动 `ok`、B 类进 `suspects` 仅提示）；`ok = issues.length===0`；A 类 exit 1、B 类 exit 0；抑制标记两档 + 使用约束（只用于引用错误名）；只扫 `.openfeel/requirements/*.md`；不给纠错建议 |
| 876 | 退出码段追加：`lint req` 仅 A 类（未知命令）非 0；B 类（疑似命令组）不改退出码；未闭合区间仅 stderr 警告、不改退出码 |
| **982** | 标题 `## JSON 出口一览（v1.4.0 快照，无 JSON 出口变更）` → **失真**：新增 #41 后改为 `## JSON 出口一览（v1.5.6 快照，新增 #41）`（REQ low #14） |
| 984 | 「40 个成功出口 / 43 个注册选项」→ **41 / 44**（注明 44 = 42 `--json` + `chore --end`/`--status`）；`75 文件`基线句**不改**（历史口径） |
| 1025-1028 | 表格追加 `| 41 | \`lint req\` | \`lint req --json\` | \`schemaVersion,target,ok,issues,suspects,unknownCount,suspectCount\` |`；`:1028` 单列行「不计入 40 / 41」→ **41 / 42** |

### 6.4 其它文档

| 文件 | 位置 | 改动 |
|---|---|---|
| `CHANGELOG.md` | 7 前 | 新增 `## [1.5.6] - 2026-10-31` + `### Added`：`[stage-115] openfeel lint req（真实命令树 + 剥前缀 + 前缀 token 串解析 + A/B 分级 + 抑制两档）`；`### Changed`：`JSON 契约 41 成功出口 / 42 注册选项（#41，req 出口七键含 suspects/unknownCount/suspectCount）`、`docs/commands.md` 44 口径、i18n **1055** |
| `docs/VERSIONS.md` | 19 前 | English highlights 顶部加 `- **v1.5.6** — …` |
| `docs/VERSIONS.md` | 38 前 | 新增 `## v1.5.6 — 批次：…` 小节（用户视角：需求正文命令名校验、门禁语义、抑制标记用法） |
| `docs/GETTING_STARTED.md` | 3 | 「适用版本：v1.5.5 快照」→ v1.5.6（**仅当**批次发布口径要求；`:232/:241/:250` 历史小节不动） |
| `src/core/templates-data/skills/openfeel-cli-usage/SKILL.md` | 3 / 35 / 44 / 54 / 58 / 60 | description 追加 v1.5.6 能力；`:35` 表格 `lint i18n\|kb` → `lint i18n\|kb\|req`；当前契约口径 40/41 → **41/42** |
| `src/core/template-loader.ts` / `src/core/update.ts` | — | **禁手改**；`npm run build` ×2 自动重生成（`build.js:6/24`） |
| **不动**（历史快照） | — | `.openfeel/manual/index.md`、`docs/dsh-cli-requirements-supplement-1.2.3.md`、`docs/agent-tool-compatibility-fix.md`、`docs/claude-code-adapter-plan.md`、`GETTING_STARTED.md:232/241/250` |

---

## 7. 与 stage-114 的协同（同批 v1.5.6）

1. **落地顺序（写死）**：**stage-114 先执行**（它改 `flow.ts` / `stage.ts` / `plan.ts` / `req.ts`），**stage-115 在 114 之后执行**，并**以 114 完成后的文件**为准重定行号与计数基线（禁止按本文字面行号硬改）。
   - 定位命令：`grep -n "## \[1.5.6\]" CHANGELOG.md`、`grep -n "计数口径" docs/commands.md`、`grep -n "lint i18n\|kb" docs/commands.md src/core/templates-data/skills/openfeel-cli-usage/SKILL.md`。
   - 若 114 已开 `## [1.5.6]` 小节 → 115 **追加段落**，不再开第二个 `## [1.5.6]`。
   - **若顺序被迫反转（115 先落地）**：114 执行期**必须**重跑 `grep -n "注册选项" docs/commands.md docs/json-contract.md` 与 `grep -rn "40 个成功出口\|41 个注册" docs/ src/core/templates-data/skills/`，核对已被 115 改成 **41 成功出口 / 42 注册**（`commands.md` 记 **44**），严禁按旧值回写；114 新增的 preflight 段落不得覆盖 §5 第 41 行、§6 第 17 条与 §16。
2. **唯一冲突面**：`docs/commands.md`（同节插入 + 计数行）与 `CHANGELOG.md`（同版本小节），以及 i18n 计数值（114 零新键 ⇒ 数值只由 115 决定）。**源码无冲突**：114 改 `flow/stage/plan/req` + helper；115 改 `commands/lint.ts` + 新增 `core/lint-req.ts` + `i18n-data` 双表。
3. **合并后必须重跑**：两阶段都改 `docs/commands.md` 且都需重生成 `template-loader.ts`（115 改 SKILL 快照，114 若改 skills 同理）⇒ 合并后**重跑 `npm run build` ×2 + `node bin/openfeel.js lint i18n`**，以第二次 build 无 diff、`lint i18n` 通过为准。
4. **基线计数不受 114 影响**：114 零新增 `--json` 选项、零新增 i18n 键（其计划明示「本批次零新键」）⇒ 115 的口径恒为 **41→42 / 40→41 / 43→44 / 1048→1055**。
5. **错误码**：两阶段都**不新增**（码表恒 13 行；`docs/json-contract.md` §3 零改动）；`flow.json` schema 零改动。
6. **`lint i18n` 断言口径**：仓库内**没有** 1048 的硬断言（`grep` 零命中），只有运行时输出与文档记数。⇒ 115 落地后以**实测** `node bin/openfeel.js lint i18n` 的「{n} 键一致 / 共 {total} 键」写入 CHANGELOG/VERSIONS；预期 `total = 1048 + 7 = 1055`（114 若意外加键则累加，并在 exec 摘要记差异）。
7. **`REQ-015.md` 编辑归属（划清，防两个 executor 撞同一文件）**：
   - **114 只负责**：在「命令名与实现差异」节**追加行**（执行期发现新的不符时）+ `:82` 变更记录追加一行。
   - **115 只负责**：改正**摘要/目标清单**那几行（`:11` / `:18` / `:19` / `:20` / `:21`），**改正文、零标记**。
   - 串行执行：115 以「114 落地后」的 REQ-015 为基线；若 114 已动过这 5 行，115 按 §4.3.1 的语义重写并在 exec 摘要贴 before/after。
   - 差异表区间 `:51-76` 的标记**谁都不动**。

---

## 8. 验收命令（可复制粘贴，Git Bash；前置 `npm run build`）

```bash
# 8.0 构建（bin/openfeel.js 加载 dist）
npm run build

# 8.1 本仓全部需求正文：exit 0（op-003 处置落地后；份数取实测，不写死 N 份）
node bin/openfeel.js lint req; echo "exit=$?   # 期望 0"

# 8.2 --json 七键形状与键序（用 node 断言，不依赖 jq）
node bin/openfeel.js lint req --json | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const keys=["schemaVersion","target","ok","issues","suspects","unknownCount","suspectCount"];
if(!eq(Object.keys(o),keys))throw new Error("键序: "+Object.keys(o));
if(o.target!=="req"||o.ok!==true)throw new Error("值: "+JSON.stringify(o));
if(!Array.isArray(o.issues)||o.issues.length!==0)throw new Error("issues 应空");
if(!Array.isArray(o.suspects)||o.suspects.length!==0)throw new Error("suspects 应空");
if(o.unknownCount!==0||o.suspectCount!==0)throw new Error("计数应 0");
console.log("OK 8.2 json shape / 7 keys");});'

# 8.3 A 类复现（临时项目目录 → 零污染）：exit 1 + issues 有值 + suspects 空 + message 含 span 与断点
TMP=$(mktemp -d); mkdir -p "$TMP/.openfeel/requirements"
printf '# REQ-999\n\n执行 `stage deps` 即可。\n' > "$TMP/.openfeel/requirements/REQ-999.md"
node bin/openfeel.js --project "$TMP" lint req; echo "exit=$?   # 期望 1"
node bin/openfeel.js --project "$TMP" lint req --json \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);
if(o.ok!==false)throw new Error("ok 应 false");
if(o.issues.length!==1||o.suspects.length!==0)throw new Error("A 类只进 issues");
if(o.unknownCount!==1||o.suspectCount!==0)throw new Error("计数");
const m=o.issues[0].message;
if(!m.includes("stage deps")||!m.includes("stage"))throw new Error("message: "+m);
if(/你是不是想写|did you mean/.test(m))throw new Error("不得含纠错建议: "+m);
console.log("OK 8.3 A-class → issues");});'
rm -rf "$TMP"

# 8.4 B 类：ok:true + issues 空 + suspects 有值 + **exit 0**
TMP=$(mktemp -d); mkdir -p "$TMP/.openfeel/requirements"
printf '用 `op create` 建方案，再 `op publish`。\n' > "$TMP/.openfeel/requirements/REQ-998.md"
node bin/openfeel.js --project "$TMP" lint req >/dev/null; echo "exit=$?   # 期望 0（仅 B 类）"
node bin/openfeel.js --project "$TMP" lint req --json \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);
if(o.ok!==true)throw new Error("B 类不改 ok");
if(o.issues.length!==0)throw new Error("issues 应空");
if(o.suspects.length!==2||o.suspectCount!==2)throw new Error("suspects: "+o.suspects.length);
console.log("OK 8.4 B-class → suspects");});'
rm -rf "$TMP"

# 8.5 抑制两档 + 未闭合区间（三者都应 exit 0；未闭合还必须打 stderr 警告）
TMP=$(mktemp -d); mkdir -p "$TMP/.openfeel/requirements"
printf '`stage deps` <!-- lint-req:ignore -->\n' > "$TMP/.openfeel/requirements/REQ-997.md"
node bin/openfeel.js --project "$TMP" lint req | grep -q "抑制 1 行" && echo "inline exit=$? / OK: 抑制行数可见"
printf '<!-- lint-req:ignore-start -->\n`stage deps`\n`archive create`\n<!-- lint-req:ignore-end -->\n' \
  > "$TMP/.openfeel/requirements/REQ-997.md"
node bin/openfeel.js --project "$TMP" lint req >/dev/null; echo "region exit=$?   # 0"
printf '<!-- lint-req:ignore-start -->\n`stage deps`\n无 end 直到文件末尾\n' \
  > "$TMP/.openfeel/requirements/REQ-997.md"
node bin/openfeel.js --project "$TMP" lint req >/dev/null 2>/tmp/unclosed.err; echo "unclosed exit=$?   # 0（到 EOF）"
grep -q "未闭合" /tmp/unclosed.err && echo "OK: 未闭合警告可见" || echo "FAIL: 未闭合区间静默了（REV-011）"
rm -rf "$TMP"

# 8.5b **反向验证（强制，op-003 验收）**：去掉 REQ-017 的行尾标记 → 必须报出 7 个 A 类 + 3 个 B 类
TMP=$(mktemp -d); mkdir -p "$TMP/.openfeel/requirements"
sed 's/<!-- lint-req:ignore -->//g' .openfeel/requirements/REQ-017.md > "$TMP/.openfeel/requirements/REQ-017.md"
node bin/openfeel.js --project "$TMP" lint req >/dev/null; echo "exit=$?   # 期望 1"
node bin/openfeel.js --project "$TMP" lint req --json \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);
if(o.unknownCount!==7||o.suspectCount!==3)throw new Error("期望 7A/3B，实得 "+o.unknownCount+"A/"+o.suspectCount+"B");
const names=new Set(o.issues.map(i=>i.message.replace(/^L\d+: `([^`]+)`.*$/,"$1")));
if(names.size!==4)throw new Error("A 类唯一名应为 4："+[...names]);
console.log("OK 8.5b 反向验证 7A/3B");});'
rm -rf "$TMP"

# 8.6 零误报 4 例 + 新规则命中 4 例（后者必须 exit 1）
TMP=$(mktemp -d); mkdir -p "$TMP/.openfeel/requirements"
printf '`plan scheme` / `stage` / `flow review` / `openfeel config get`\n' > "$TMP/.openfeel/requirements/REQ-996.md"
node bin/openfeel.js --project "$TMP" lint req; echo "exit=$?   # 期望 0"
printf '`flow review_add` / `flow config_sync_stage` / `flow stats --json` / `flow stage sett --json`\n' \
  > "$TMP/.openfeel/requirements/REQ-995.md"
node bin/openfeel.js --project "$TMP" lint req --json \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);
if(o.unknownCount!==4)throw new Error("应 4 条 A，实得 "+o.unknownCount);
console.log("OK 8.6b REV-010 命中 4 条");});'
rm -rf "$TMP"

# 8.6c 残余错误名：只允许出现在抑制区（审计链），其余行零命中（REQ-013，收窄后判据）
BAD=$(grep -n "flow review_\|flow config_sync_stage" .openfeel/requirements/*.md \
      | grep -v "REQ-015.md:\(5[1-9]\|6[0-9]\|7[0-6]\|82\):")
[ -z "$BAD" ] && echo "OK: 抑制区外残余错误名零命中" || { echo "FAIL:"; echo "$BAD"; }
# 事实依据：REQ-015.md:67（差异表）必须保留「无此命名」的原文记录 → 不能要求全仓零命中

# 8.7 契约计数与新增测试（op-002 只跑到 C1~C9/C11/C13/C14 绿；C10/C12 在 op-003 后绿）
npx vitest run test/core/lint-req.test.ts test/commands/lint-req.test.ts \
                test/commands/knowledge.test.ts test/cli/json-contract.test.ts
# 期望：core 21 条 / commands 14 条全绿；knowledge 计数用例 42/41 通过；json-contract #41 通过

# 8.8 全门禁（逐条贴结果到 exec 摘要）；spawn 真 CLI 的用例必须显式传 env
export OPENFEEL_PREFLIGHT=warn   # 仅供本 shell 内 spawn 类用例；不得依赖宿主环境继承
npx tsc --noEmit && npx vitest run && npx eslint src test \
  && npm run build && npm run build \
  && node bin/openfeel.js lint i18n && node bin/openfeel.js lint kb \
  && node dsh/test/verify.js

# 8.9 零污染 / 生成物核对（用 diff 字节对比，不比行数——REQ low #16）
git diff --stat .openfeel/requirements    # 期望：REQ-015（:11/:18/:19/:20/:21）+ REQ-017（:11/:50）
git diff -U0 .openfeel/requirements/REQ-015.md .openfeel/requirements/REQ-017.md
git diff --stat src/core/template-loader.ts src/core/update.ts   # 期望：仅 build 产出的注入段变化
ls src/core/lint-req.ts test/core/lint-req.test.ts test/commands/lint-req.test.ts   # 三个新文件
```

> **合并后复跑**：若与 stage-114 合并落地，按 §7-3 重跑 `npm run build` ×2 + `node bin/openfeel.js lint i18n`（两阶段都改 `docs/commands.md` 并重生成 `template-loader.ts`）。

> 复现纪律：**不改仓库内需求正文做临时实验**（会污染 `.openfeel/requirements` 与 git 工作区）；一律用 `mktemp -d` + `--project`。若要验证「全部正文副本 exit 0」：`cp -r .openfeel/requirements "$TMP/.openfeel/"` 后 `--project "$TMP"`（份数取实测，不写死）。

---

## 9. 风险与不做（明确划界）

| 不做 | 理由 |
|---|---|
| 不扫 `docs/**` / `.openfeel/flow-archive/**` / `.openfeel/plan/**` / `log/**` / `kb/**` | 它们天然引用历史/错误命令名，且不是需求契约；扫了会有无法收敛的噪声（REQ-017 §不做） |
| 不改 `req add` 行为 | 正文是机械铺骨架 + 人工编辑；改 `req add` 会动既有输出契约且找错时机（REQ-017 §不做） |
| **不新增错误码** | `src/core/errors.ts` 13 行是契约（`docs/json-contract.md` §3 + 测试逐行断言）；复用 exit 1 |
| 不加 `--fix` / `--warn-only` / `--no-fail` 逃生阀 | 与 `lint i18n|kb` 一致（`docs/commands.md:876` 明示无逃生阀）；抑制走正文标记 |
| 不给 `issues[]` / `suspects[]` 加第三字段（如 `line` / `kind`） | 元素恒 `{path,message}` 两键（line/kind 已在 `message` 内）；新增的 3 个**顶层**键（`suspects`/`unknownCount`/`suspectCount`）只出现在 `target:'req'` 这唯一出口，属新出口合法新增，已在 §16 登记 |
| **不做近似纠错建议** | 只报「不存在 + 断点位置」，**禁止**「你是不是想写 `flow stage set --deps`」这类猜测——猜错会把人引到另一条错误命令上（REQ-017 §不做）。注意区分：**op-003 的正文改正**是人工按差异表规范化需求正文，**不是**运行时建议机制，两者不得混为一谈 |
| 不改 `lint i18n` / `lint kb` 任何行为 | 零回归；只加新子命令与 `help.lint` 文案 |
| 不 import `src/cli/index.js` | 循环依赖（§1.4） |
| 不改 `flow.json` / `status.md` / `.openfeel/dev/**` | 本阶段无状态面改动；状态只能经 `feel_*` |
| 不改 `package.json` 版本号 | 批次收口统一 |
| 不做围栏代码块感知、不做跨行反引号 | 收益低、会引入歧义；记为已知边界（§4.2-10、§2.1） |
| **不回到「整 span 跳过」**（REV-010） | 那会让下划线/`--json` 形态整体免检；前缀 token 串是唯一采纳的规则 |
| **不允许未闭合区间静默**（REV-011） | 必须 stderr 警告 + 抑制行数可见；否则一个漏写 `ignore-end` 就能让文件后半段永久免检 |
| 不为 B 类噪声做白名单（如排除 `npm` / `git` / `pnpm`） | B 类本就 advisory、不影响 `ok`/退出码；引入白名单等于第二份清单，必然漂移（§2.3 同理） |
| 不追求「零样式警告」式重构 | 范围护栏：只加 1 源文件 + 1 子命令 + 1 print 函数 + **36 条测试** + 文档；任何超出（重构 lint.ts、抽公共 print helper）转下批次 |

**风险登记**

| 风险 | 缓解 |
|---|---|
| 树为空（循环依赖/测试只注册 lint）→ 全量误判 B 或静默 | §1.4 红线 + T2 守卫（`rootProgram` 生产同源）+ C10（真实树）实例化 |
| op-003 的正文改正被误认为「篡改需求正文」 | REQ-015 五行是按差异表（`:54-67`）**规范化**，差异表原文保留 → 审计链完整；`git diff -U0 .openfeel/requirements` 在 exec 摘要逐行贴出；**零抑制标记**（无遮盖） |
| 抑制标记被滥用成「永久创可贴」 | §4.4 使用约束（只用于引用错误名 + 必须同节说明理由）+ **C12 强制反向用例** + §8.5b 反向验收 |
| 未闭合区间静默（REV-011） | `unclosedRegions` → stderr 警告（C8 断言）+ `suppressedLines` → 人类首行（T13/C8 断言） |
| 前缀串规则的退化边界被当成 bug | §3.1.1 逐条写清（`flwo stage set` → B；`stagee deps` → 静默；`npm run lint` → B 噪声）+ T17/C13 固化 |
| `target:'req'` 多 3 键未登记 → 契约漂移 | §16 首段 + §5 第 41 行逐字登记；`docs/commands.md:874` 同步；`json-contract.test.ts` #41 冻结七键键序 |
| `lint i18n` 因漏 en 侧键而 exit 1 | 双表成对（§3.4 表，7 键）；op-002 后立刻 `node bin/openfeel.js lint i18n` 自检 |
| spawn 测试因继承 `OPENFEEL_PREFLIGHT=off` 恒绿 | §5.2 spawn 纪律：显式传 env；§8.8 在 shell 内 `export OPENFEEL_PREFLIGHT=warn` |
| `build` 后生成物漂移被当手改 | 新文件/文档改完再 `build` ×2 验幂等；合并 114 后按 §7-3 复跑 |

---

## 10. op 拆分（建议方案，供 schemer）

| op | 内容 | 交付面 | 依赖 |
|---|---|---|---|
| **op-001** | 解析器纯函数模块（REV-010 前缀 token 串 + REV-011 抑制统计/未闭合记录）+ 单元测试 T1~T20（**21 条**） | **新增** `src/core/lint-req.ts`；**新增** `test/core/lint-req.test.ts` | — |
| **op-002** | `lint req` 命令面（I/O + 输出 + 退出码 + 七键 JSON + stderr 未闭合警告）+ i18n 双表 **7 键** + 命令级 **fixture 测试 C1~C9/C11/C13/C14（12 条）** | `src/commands/lint.ts`；`zh-CN.ts` / `en.ts`；**新增** `test/commands/lint-req.test.ts` | op-001 |
| **op-003** | **需求正文分类处置（Feel 裁定 + REV-013）**：<br>① **REQ-015 五处正文改正，零标记，且每个命令独立 span（不用 `/` 并列）**——`:11`（`archive create`→`flow archive`；`flow config_sync_stage`→`config set`（`--sync-stages`）；并把 slash 形式拆成独立 span）、`:18`（`flow review_add|resolve|update|remove` → `flow review add|resolve|update|remove`）、`:19`、`:20`、`:21`；依据差异表 `REQ-015.md:54-67`（**正文改正 + 差异表保留原文 = 审计链**）。<br>② **REQ-017 两处行尾标记**：`:11` / `:50` 追加 `<!-- lint-req:ignore -->`。<br>③ `REQ-015.md:51-76/:82` **不动**。<br>④ 验收：§8.1 全部正文 exit 0 + **§8.5b / C12 反向（7A/3B）** + **§8.6c 残余错误名（抑制区外零命中；`REQ-015.md:67` 差异表保留原文属白名单）**。<br>⑤ **归属边界**：114 只在差异节追加行 + `:82`，**115 只改这 5 行**（§7-7）。 | `.openfeel/requirements/REQ-015.md`（5 行正文）、`REQ-017.md`（2 行行尾注释） | op-002 |
| **op-004** | 契约计数 + 文档 + 生成物：`knowledge.test.ts` 42/41、`json-contract.test.ts` #41（七键，用该文件 14 组树）、`docs/json-contract.md`（§5 第 41 行/§6 第 17 条/§7 含 `flow 15→16`+`flow retry`/§16/表头）、`docs/commands.md`（28/870-876/**982**/984/1025-1028）、`CHANGELOG.md`、`VERSIONS.md`、`GETTING_STARTED.md:3`、SKILL 快照 + `npm run build` ×2 | 测试与文档、生成物 | op-002 |
| **op-005** | 全门禁 + 验收留档（§8.7~8.9 全跑，结果贴 exec 摘要；spawn 类用例显式传 `OPENFEEL_PREFLIGHT`） | 无代码改动 | op-003、op-004 |

**执行纪律**
1. 每个 op 落地后**立即** `npx tsc --noEmit && npx vitest run test/core/lint-req.test.ts test/commands/lint-req.test.ts`（不攒到最后）；op-002 后再加 `node bin/openfeel.js lint i18n`。**op-002 跑测试时 C10/C12 预期红**（它们属 op-003 验收，见 §5.3）。
2. 行号以**改动前** `grep -n` 重新确认（本计划为 2026-10-31 基线；**114 先执行** ⇒ 115 一律以 114 完成后的文件重定行号，见 §7-1）。
3. 禁止手改 `flow.json` / `status.md` / `.openfeel/dev/**`；禁止手改 `template-loader.ts` / `update.ts`。
4. 禁止在仓库内改需求正文做临时实验（§8 末尾纪律）；实验一律 `mktemp -d` + `--project`。
5. `fast` 模式仍需**一轮独立审查**（非自审）；审查重点：前缀 token 串是否真的允许下划线、`ok` 语义是否与 #38/#39 一致、`suspects` 是否只装 B 类、未闭合警告是否落地、§16 是否登记了多出的 3 键、双表 i18n 是否成对（7 键）、REQ-015 正文改正是否与差异表一致、生成物是否只经 build 变更。

---

## 11. 待执行期确认（本计划无法 100% 定死的点）

| 项 | 说明 |
|---|---|
| 文档行号 | §6 行号是 2026-10-31 基线；**114 先执行** ⇒ 115 一律以「114 完成后的文件」重新 `grep` 定位（§7-1；若顺序反转，114 必须重跑 `grep -n "注册选项"` 核对） |
| `lint i18n` 实测键数 | 计划口径 1048 → **1055**（+7，含 REV-011 的警告键）。**仓库内没有 1048 的硬断言**（`grep -rn 1048` 零命中），不要去找；唯一权威是 `node bin/openfeel.js lint i18n` 的实跑输出（114 若意外加键则累加，并在 exec 摘要记差异） |
| 正文份数 | 验收写「全部需求正文（扫描时点实测份数）exit 0」；当前实测 17 份，C10 断言 `files>0` 而非硬编码份数 |
| candidates 数字 | **198 / 194 / 34 / 135 都不是契约**，只写在本文档作实测参考；不得进断言（§0.3） |
| 退化边界 | §3.1.1 的 `flwo stage set`（B）/ `stagee deps`（静默）/ `npm run lint`（B 噪声）是**接受的行为**，不是待修 bug；若审查要求「全部拼写错误都报」，需改需求（超出本阶段范围） |
| op-003 的 REQ-015 明文改法 | `after` 文本以 §4.3.1 表为准（**每个命令独立 span、无 `/` 并列**）；若 114 已改过同几行，按语义重写并在 exec 摘要贴 before/after |
| `eslint` 可执行性 | `package.json` 无 `lint` script，沿用 stage-114 的 `npx eslint src test`；若本机无 eslint 配置则记录实际输出，不伪造通过 |
| `docs/commands.md:984` 的「75 文件」基线 | 本阶段不改（历史收口口径）；若批次要求新基线，执行期以 `ls test/**/*.test.ts` 实测后统一 |
| 排序比较器 | `issues` / `suspects` 各自升序的实现（`sort()` 字节序 vs `localeCompare('en')`）执行期固定其一并写注释；T16 只断言相对顺序 |
