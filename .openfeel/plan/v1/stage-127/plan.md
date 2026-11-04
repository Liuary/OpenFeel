# v1.5.12-stage-127 实现计划 v2 — v1.5.11 门禁加固收尾（5 个缺陷 + 3 P0 / 4 P1 / 5 P2 修正，fast）

- 阶段：`v1.5.12-stage-127`　需求：`REQ-020`　模式：**fast**（保留一轮代码审查）
- 产物：本计划（plan.md）+ `overview.md` 的目标/操作方案两节
- 本阶段**不改任何** `src/**`、`dsh/**`、测试、文档；实现由后续 op 执行
- **v2 修订说明**：计划审查 BLOCK 的 3 个 P0 均为实测缺陷（字段被白名单重建丢弃 / 多语句首条即 return / 路径集合漏 index-only），已核实并改写 §3-C 与 §4-op-002；4 个 P1、5 个 P2 一并落入对应 op 的「实施步骤」与「验收」。**不改变 op 顺序 001 → 002 → 003**。
- **外部问题报告（v3 并入）**：另一项目 `CultivationOpenRealm` 的 `docs/issues/openfeel-guard-stale-2026-11-05.md`（该路径相对其项目根，本计划未读取其全文，只采信父代理转述的结论：旧 `hostStartedAt` 覆盖、启动期 cwd 未解析 → 只写全局、后果为写入被拒、要求「不得以删 `guard-state.json` 作为官方修复步骤」与「重启后首次 `feel_*` 自愈」）。并入 §3-F（自愈入口）、§3-G（回归测试）、V15~V18。
- **v4 修订说明（第三次复审，1 P0 + 3 P1 + 3 P2，全部为实现口径）**：① `classifyShellCommand` 的 `undecidable` 硬编码修复 + `isSingleSimpleCommit` 改判**原始命令** + 直接 git 调用约束 + 真执行 payload 负向用例；② config/repo 选项的 `=`/附着形式解析（`-c` vs `-C` 大小写敏感）；③ 自动自愈加**存活判定 / 节流 / marker 缓存 / 审计上限 / 读次数 ≤2**（防多宿主 ping-pong）；④ V11/V16 改口径（自愈关闭或直接断言 state），V4 扩充 skip 条件；⑤ `:1257` 断言自相矛盾修正、`hostStartedAt` 文档化为诊断字段。**验收仍为 18 条（V1~V18）**。
- 事实基线：用户实测结论直接采信（v1.5.11 写入门禁在真机生效：`.NET 静态写` / `Set-Content` / `node -e` 含写 API / 写 `.openfeel/chore.json` 全部被拒；`openfeel flow status`、`git status`、`npx vitest` 放行），但每次重启后 `feel_status.guard.stale` 恒为 `true`。

---

## 1. 已核实的实现事实（本计划的事实基线，实现不得与此冲突）

| # | 断言 | 证据（已读源码） |
|---|---|---|
| F1 | `REGISTRATION_KEYS` 含身份三键 `hostStartedAt` / `loaded_hash` / `pid` | `dsh/lib/adapters/guard-state.js:81-90` |
| F2 | 写工作区状态合并序 `{...seed, ...(workspaceRaw ?? {}), ...patch}`：旧工作区文件把上一轮宿主的身份覆盖回来；`patch`（每次判定）只带 `pid` | `guard-state.js:176-183`；`dsh/lib/guard.js:2824-2834` |
| F3 | 注册段（宿主启动）写身份三键；此外每次判定写入都不刷新 `hostStartedAt`/`loaded_hash` | `dsh/lib/index.js:130-146`、`:207-218` |
| F4 | HMAC 密钥进程内随机；`guardStateDistrust` **先验签**、失败即 `staleReason:'hmac'`，三元组排后 | `guard-state.js:40`、`:57-78`、`:234-259`、`:276-278` |
| F5 | `globalGuardDir()` 无 env 覆盖；marker 路径已有 `OPENFEEL_ADAPTER_HOST_PATH` | `guard-state.js:102-109`；`dsh/lib/adapters/host-state.js:26-32` |
| F6 | `git commit` 分类为 `whole-tree` + `phases:['exec_running','archiving']` + `preservesWorktree:true`；无阶段在 `allowsWholeTreeWrite` 先拒 | `guard.js:2084-2094`、`:2676-2682`、`:2967-2972` |
| **F7（P0-1）** | `analyzeShellStatement` 在 `:2182-2191`、`classifyShellCommand` 在 `:2377-2388` **都用显式字段白名单重建对象**（`targets/wholeTree/wholeTreePhases/…`），新增字段不主动带就丢。实测 `classifyShellCommand({command:'git commit -m x',…}).gitSubcommand === undefined` | `guard.js:2179-2196`、`:2377-2388` |
| **F8（P0-2）** | `classifyShellCommand` 对语句 `for…of`（`:2325`），**首条 whole-tree 立即 `return`**（`:2377-2388`），后续语句不再分析；且该 return 把 `targets: []` 写死 → 重定向目标被丢弃 | `guard.js:2325`、`:2377-2388` |
| **F9（P0-3）** | `git diff --name-only HEAD` 是 **worktree ↔ HEAD**：`git add src/x.ts` 后 `git restore -W -s HEAD src/x.ts` 让 worktree 回到 HEAD，index 仍暂存 → 该差异**不可见** | 实测 + `guard.js:2729`（同类用法） |
| **F10（P1-3）** | marker 是用户级单文件 `~/.openfeel/adapter-host-dsh.json`，每次 `apply()` 覆盖 `started_at`、无 `pid`；多 profile / 多宿主互相重写 → `state.hostStartedAt < marker.started_at` **永久成立** | `host-state.js:95-104`；`guard-state.js:255-257` |
| **F11（P1-1/P1-2）** | `git -c user.name=x commit -m y`：`:2013-2021` 的跳过逻辑只 `index+=1`，`user.name=x` 被当成子命令 → 未识别 → `kind:'none'`（任意相位放行）；`-C/--git-dir/--work-tree` 被消费后仍按本 cwd 判 | `guard.js:2012-2021`、`:2179-2196`、`:2403-2404` |
| **F12（P2-2）** | `buildGuardSection` 在 `state === null` 早返回**恰好 4 键**（`registered/cwd/cwdSource/stale`），被 `dsh/test/guard.js:1263` 的 `deepEqual` 锁定 | `guard-state.js:292-294`；`dsh/test/guard.js:1263-1265` |
| **F13（P2-5）** | 注册写入工作区依赖 `config.cwd`（`index.js:207`）；cwd 不可解析时只写全局，工作区 state 要等**第一条门禁判定**才刷新 | `dsh/lib/index.js:194-218`；`guard.js:2812-2835` |
| F14 | 现有测试把旧语义写死：`hmac→stale`、`host-started-at→stale`、全局路径字面量 | `dsh/test/guard.js:1156`、`:1232-1266`、`:1616-1639` |
| F15 | `.openfeel` 常量由 `workspace.js` 导出，`guard.js:48` 已导入；`allowShell`（`:2912`）负责审计 + `recordDecision` | `guard.js:48`、`:2912-2916` |
| **F16（写拒写关系）** | **`guard.js` 不读 `guard-state`**（只 `import { globalGuardAuditPath, writeGuardState }`），门禁判定只有 cwd/相位/受保护路径/shell 分类；`feel_flow advance` 等 `feel_*` 走 CLI 子进程写 `flow.json`，不经 guard。故本仓库 **`guard-stale` 目前不可能成为拒写原因** | `guard.js:46`；全局 grep `guard-stale` 仅命中 `workflow-gate.js:53` 与 `tools/index.js:227`（均为**提示**，非拒绝） |

**根因一句话**：重启后 `stale` 恒真 = ① 身份字段被旧工作区文件覆盖（F2/F3）+ ② 跨进程验签必败（F4）；而 P1-3 又让「marker 被重写」单独触发 `host-started-at`（F10），三者叠加使自愈不可能。

---

## 2. 设计决策（照此实现，不得改形）

| # | 决策 | 取舍理由 |
|---|---|---|
| **D1** | **身份三键来源优先级**：`patch`（显式）> **进程内注册值**（`setGuardRuntimeIdentity`，`index.js` 启动时用当前 marker 设置）> **全局文件的注册段（弱兜底 + 降级告警）**。**旧工作区文件绝不提供这三个键**。`lastDecision` 等易变字段仍允许继承合并。 | 身份必须只来自当前进程的注册事实；全局文件可作兜底（R2 的告警落点），工作区旧文件绝不可信。 |
| **D2（P1-3）** | **`stale` 只认 `pid` + `loaded_hash`**：`pid` 缺失/不符 → stale；`loaded_hash`（双非空）不符 → stale。**`hostStartedAt` 不再参与 stale 判定**（继续写入、继续显示，仅作诊断/审计）。HMAC 失配降级为 `hmacWarn:true`（可见、不门禁）。 | marker 是用户级单文件、每次 `apply()` 重写（F10），时间比较在多 profile/多宿主下**必然误报且永不恢复**；跨进程识别由 `pid` 覆盖，代码版本由 `loaded_hash` 覆盖。取舍理由与残留风险见 §6-R1/R7。 |
| **D3** | **不做**「marker 写一次性随机盐」的跨进程可验证 HMAC。 | 改动面（marker schema / `setup --check` / CLI 读取 / 三处测试）远大于收益；伪造只影响显示。 |
| **D4（P0-1/2/3）** | **C 的放行面收窄为「单条、直接、纯 `.openfeel` 的 `git commit`」**，**七个必要条件同时成立**才放行：① `gitSubcommand === 'commit'`（**两处重建都透传**）；② 整条命令是**一条简单语句**（原始命令无 `$(`/反引号；`splitShellStatements` 单条；无重定向）；③ `classification.undecidable !== true`（**必须真透传，不得写死 false**）；④ **直接 git 调用**（以 `git` 开头、无 wrapper payload；nested 来源一律不放行）；⑤ 无 `-C`/`--git-dir`/`--work-tree` 仓库改写（含 `=`/附着形式）；⑥ `isProjectWorkspace` 且 `flow.ok`（fail-closed 不放行）；⑦ 路径集合（`git status --porcelain=v1 -z --untracked-files=all`）全部在 `.openfeel/` 下。 | 放行面每多一个维度就多一个后门：多语句、重定向、命令替换、嵌套 wrapper、仓库改写、index-only 差异都是实测可利用面。宁可误拒（有明确文案），不可误放。 |
| **D5** | **测试隔离 env**：`OPENFEEL_ADAPTER_HOST_PATH`（沿用）+ 新增 `OPENFEEL_GUARD_DIR`（覆盖 `globalGuardDir()`）。写进 `dsh/ADAPTER.md` 排障段，注明测试用、非安全边界。 | 复用既有变量，少改面；一个变量即可同时隔离状态与审计。 |
| **D6** | **标题单点化**：`workflowGate.js` 导出 `workflowGateTitle(gate)`，`feel_status` 与 `feel_next` 共用；`guard-*` 用门禁原因文案，`no-active-stage` 才用「无活跃阶段」；`guardWarnings` 不重复。 | 同一事实只允许一种说法。 |
| **D7（P2-1）** | `runtimeIdentity` 为空时：`seed` 保留 `globalRaw` 的**身份三键**作弱兜底，并在首次写时 stderr 一行 `[guard] guard-identity-unavailable`；`workspaceRaw` 的身份始终剥离。 | 兑现 R2 的告警承诺，不让「降级」成为空话。 |

---

## 3. 逐条实现要求

### A. guard-state 身份字段与 stale 判定（P1，主因）

**改哪儿**

1. `dsh/lib/adapters/guard-state.js`
   - 新增 `const IDENTITY_KEYS = ['hostStartedAt','loaded_hash','pid'];`（`:81-90` 旁）。
   - 新增模块级 `let runtimeIdentity = null;`、`let identityWarned = false;` 与导出 `setGuardRuntimeIdentity(identity)`（接受三键，缺项丢弃，非对象清空；只在内存）。
   - 重写 `writeGuardState` 合并段（`:171-186`）：
     ```js
     const seedRaw = globalRaw === null ? {} : pick(globalRaw, REGISTRATION_KEYS);
     const seed = seedRaw;                                  // 全局段兜底：**保留**身份（D7）
     const inherited = workspaceRaw === null ? {} : omit(workspaceRaw, IDENTITY_KEYS); // 工作区身份一律剥离
     if (runtimeIdentity === null && !identityWarned
         && (seed.hostStartedAt === undefined || seed.loaded_hash === undefined || !Number.isFinite(seed.pid))) {
       identityWarned = true;                                // 只警告一次
       process.stderr.write('[guard] guard-identity-unavailable：本进程未登记身份且全局段缺失，状态将按不可信处理。\n');
     }
     const next = {
       ...seed,            // 注册段兜底（D7：含身份，但可能来自旧宿主 → 会 stale，属降级事实）
       ...inherited,       // lastDecision 等易变字段继承
       ...(runtimeIdentity ?? {}),  // 当前进程注册事实（覆盖 seed）
       ...patch,           // 显式传入优先（注册段/测试）
       schemaVersion: GUARD_STATE_SCHEMA_VERSION,
       updatedAt: new Date().toISOString(),
     };
     ```
     保留 `delete next.source/hmac`、`signState`、原子写。
   - `guardStateDistrust`（`:234-259`）重排为：
     - `state === null` → `null`
     - `!Number.isFinite(state.pid)` → `{ reason:'pid-missing', severity:'stale', message }`
     - `state.pid !== pid` → `{ reason:'pid', severity:'stale' }`
     - marker 为对象且 `loaded_hash` 双方非空且不等 → `{ reason:'loaded-hash', severity:'stale' }`
     - **删除 `host-started-at` 分支**（P1-3）
     - 以上都过但 `verifyGuardStateSignature === false` → `{ reason:'hmac', severity:'warn' }`（不 stale）
     - 否则 `null`
   - `computeGuardStale`（`:276-278`）= `severity === 'stale'`。
   - `buildGuardSection`（`:290-326`）：
     - **`state === null` 分支保持** `{ registered:false, cwd:null, cwdSource:null, stale:false }` **恰 4 键**（P2-2；不得加 `signature`/`hmacWarn`）。
     - 非空分支：`stale` 由 severity 决定；新增 `signature:'valid'|'mismatch'`；**仅当三元组通过且验签失败**时加 `hmacWarn:true`；`staleReason` 仅在 stale 时写。
2. `dsh/lib/index.js`
   - `hostMarker = writeHostMarker(...)`（`:143`）之后、`registerGuard`（`:177`）之前：
     `setGuardRuntimeIdentity({ pid: process.pid, hostStartedAt: hostMarker?.started_at ?? new Date().toISOString(), loaded_hash: hostMarker?.loaded_hash ?? '' });`
   - 注册段 `writeGuardState`（`:207-218`）不变（显式三键，优先级最高）。
3. `dsh/lib/guard.js`
   - `recordDecision`（`:2812-2835`）不加身份字段、不读 marker（由 `runtimeIdentity` 提供）。

**测试（op-001 内改，注意 P1-4 的清理顺序）**
- 每个新用例都必须 `try { setGuardRuntimeIdentity(...) } finally { setGuardRuntimeIdentity(null); clearGuardState(...) }`——**模块级状态会跨用例泄漏**（P1-4）；`dsh/test/guard.js` 里凡是断言 `pid-missing` / `hmacWarn` 的用例，必须确认此前没有残留 identity。
- 新增回归（根因①）：设当前 identity → 预置带**旧 `hostStartedAt` + 旧 `pid`** 的 workspace 文件 → `writeGuardState(cwd, { lastDecision })`（不带身份）→ 断言产出三键等于注册值、`computeGuardStale(state, marker) === false`。
- 改 `:1616-1639`：篡改 `lastDecision` → `stale === false` + `hmacWarn === true` + `signature === 'mismatch'` + `staleReason === undefined`；伪造 `hmac` 同上；**删掉** `staleReason === 'hmac'` 旧断言；保留 `pid-missing`。
- 改 `:1232-1266`（v4-P2-1 修掉自相矛盾）：该用例先 `setGuardRuntimeIdentity({ pid: process.pid, hostStartedAt: <新值>, loaded_hash: 'aaa' })`；`:1257` 的局部 patch **只保留 `loaded_hash:'aaa'`，删掉 `hostStartedAt`**（原写法「同一 patch 显式传 300s 前的 `hostStartedAt` 又断言已刷新」自相矛盾）；写后断言 `hostStartedAt === 注册值`（由 runtimeIdentity 刷新）且 `stale === false`（`host-started-at` 不再判 stale，P1-3）。`pid` 由 runtimeIdentity 提供，不需再补。
- 正控/反控：三元组一致 + 验签失败 → `stale:false` + `hmacWarn:true`；同样验签失败但 `loaded_hash` 不符 → `stale:true` 且 **无** `hmacWarn`。
- `dsh/test/guard.js:1263` 的 4 键 `deepEqual` **保持原样**（P2-2 的守门断言）。

### B. dsh 测试隔离（P1）

**改哪儿**

1. `dsh/lib/adapters/guard-state.js:102-104`：`globalGuardDir()` 先读 `process.env.OPENFEEL_GUARD_DIR`（非空即用），否则 `join(tmpdir(),'openfeel-guard')`；`globalGuardStatePath` / `globalGuardAuditPath` 自动派生。
2. `host-state.js`：不加新变量，沿用 `OPENFEEL_ADAPTER_HOST_PATH`。
3. `dsh/ADAPTER.md`：门禁可见性段 + 排障段写两个 env（测试隔离用、宿主启动前设置、非安全边界）；同段写 ① 的 HMAC 取舍（`hmacWarn` 可见不门禁 + 残留敞口）与 D2 的「`hostStartedAt` 不参与 stale」；**并明确 `guard.hostStartedAt` 是诊断字段**——`stale:false` 时它仍可能是 state 里的旧值（v4-P2-2：不改 `buildGuardSection` 的键形状，用文档消歧，避免动 `deepEqual` 契约）。
4. 测试入口统一隔离（`integration.js` / `guard.js` / `verify.js` / `contract.js` 四个都设）：
   `mkdtempSync(join(tmpdir(),'feel-guard-iso-'))` → `process.env.OPENFEEL_GUARD_DIR = <tmp>/guard`、`process.env.OPENFEEL_ADAPTER_HOST_PATH = <tmp>/adapter-host-dsh.json`，退出清理。
   - `dsh/test/guard.js:1156` 写死字面量改为 `assert.equal(globalGuardDir(), <env 临时目录>)` + `assert.equal(globalGuardStatePath(), join(globalGuardDir(),'guard-state.json'))`；op-001 完成判据含 `grep -rn "openfeel-guard'" dsh/test/` 为空。
5. **确定性「真实状态未被写」断言（P2-3）**：不要只靠「前后字节 deepEqual」（宿主存活时会被外部启动重写而误红）。改为：
   - 跑测试前记录真实 marker 的 `{started_at, loaded_hash}` 与真实全局目录的**条目集合**；
   - 结束后：① 真实全局目录条目集合**必须完全相同**（只有本测试会创建这些文件，确定性）；② 真实 marker 的 `started_at` 与 `loaded_hash` 相同 → PASS；③ 若 `started_at` 变了但 `loaded_hash` 未变 → 判定为「另一个宿主启动」的已知噪声，打印 `skip: host-active`，**不判红**；④ `loaded_hash` 变了 → FAIL（说明写了别的适配器版本，真实污染）；
   - 另断言：隔离副本 marker 的 `started_at` 与真实 marker 的 `started_at` **不同**（证明写入确实去了临时目录）。

### C. `git commit` 无阶段时放行「纯书账」（P1；本批次最重，含 3 个 P0）

**改哪儿** —— `dsh/lib/guard.js`

**C.1 字段与标志透传（P0-1 + v4-P0①）**
- `classifyGitCommand` 的 `commit` 分支返回补 `gitSubcommand:'commit'`，并补 `repoOverride`（见 C.4）。
- `analyzeShellStatement` 的 whole-tree 返回对象（`:2182-2191`）**必须**带 `wholeTreeGitSubcommand: git.gitSubcommand`、`wholeTreeRepoOverride: git.repoOverride === true`，并**保留它本来就算好的 `undecidable`**（该函数在 `:2129-2143` 已对 `$(`、wrapper 内层不可判等置 `true`）。
- `classifyShellCommand` 的 whole-tree 重建（`:2377-2388`）**必须**：
  - 带 `gitSubcommand: analysis.wholeTreeGitSubcommand`、`repoOverride: analysis.wholeTreeRepoOverride === true`；
  - **把硬编码的 `undecidable: false`（`:2386`）改为 `undecidable: analysis.undecidable === true`**（v4-P0①）。当前写死 `false` 让「`undecidable !== true`」在 whole-tree 分支成为**死条件**：实测 `git commit -m "$(rm -rf src)"` 得到 `kind:'whole-tree', undecidable:false`。
- 嵌套 wrapper（`:2356-2364`）返回 `nested` 时字段天然透传，但**语义上 nested 来源一律不得放行**（见 C.2 ③），注释里写明「新增字段必须同时改这两处白名单」。

**C.2 单语句 + 命令替换 + 直接调用硬条件（P0-2 + v4-P0②③）**
- 新增 `isSingleSimpleCommit(command)`（**必须对原始 command 判定，不得先 `maskQuoted`**）：
  - `splitShellStatements(command).length === 1`；
  - `scanShellRedirections(command).targets.length === 0`；
  - **原始字符串**不含 `$(` 与反引号（v4-P0②）。**已知代价**：单引号内的 `$(` / 反引号也会被误拒（`git commit -m 'fix $(x)'`）——**接受**，文案提示改用双引号或去掉；绝不为了少误拒而漏检，因为双引号内 `$()` 在 bash 里是真替换、会真执行。
  - 可选：不含裸的 `&&`、`||`、`;`、`|`、`&`（`splitShellStatements` 已覆盖 `&& ; |`；再显式挡一次没有坏处）。
- **直接 git 调用**（v4-P0③）：`command.trim()` 必须以 `git` 开头（`/^git(\s|$)/`）**且** `extractWrapperPayload(command) === null`（没有 `bash -c` / `pwsh -Command` 之类外层 payload）。**凡来自 nested wrapper 的分类结果一律不放行**（即使内层是干净 commit）。
- 允许条件必须同时满足：`classification.gitSubcommand === 'commit'`、`classification.undecidable !== true`（C.1① 修好后才是真条件）、`isSingleSimpleCommit(shellCommand)`、直接 git 调用。

**C.3 路径集改用 status（P0-3）**
- `inspectCommitBookkeeping()` 改用：
  `git -c core.quotePath=false status --porcelain=v1 -z --untracked-files=all`
  - 先 `rev-parse --git-dir` + `--verify --quiet HEAD`（失败 → `null`）。
  - 按 `\0` 切分；每条 `entry.length >= 4`，`xy = entry.slice(0,2)`，`path = entry.slice(3)`。
  - `xy[0] === 'R' || xy[0] === 'C'` 时**下一项是原路径**，跳过（只取新路径）。
  - `offenders = paths.filter(p => p !== OPENFEEL_DIR && !p.startsWith(`${OPENFEEL_DIR}/`))`。
  - 返回 `{ ok:true } | { ok:false, offenders } | null`；`paths.length === 0` → `{ ok:true }`（交给 git 报 nothing to commit）。
  - `-z` 已关闭引号，不需要再处理引号；`core.quotePath=false` 作为双保险。
- 口径：**staged-only（index 有、worktree 无）必须能看到**——这是 `git diff HEAD` 的漏洞（F9），porcelain 的 `X` 位覆盖它。

**C.4 git 全局选项解析（P1-1 + v4-P1-2）**

`classifyGitCommand` 的跳过循环（`:2013-2021`）。**大小写敏感**：`-c`（config）与 `-C`（repo）是不同选项，**必须先判 `-C` 再判 `-c`**，否则 `-C/x` 会被 `-c` 前缀吞掉。

1. **仓库改写 → `repoOverride = true`**（v4-P1-2 补附着形式）：
   - 精确：`-C` / `--git-dir` / `--work-tree`；
   - 附着：`token.startsWith('-C=')`、`token.startsWith('--git-dir=')`、`token.startsWith('--work-tree=')`、以及 `token.startsWith('-C') && token.length > 2`（`-C/path`）。
   - 分离形式 `+2`（吞值），附着形式 `+1`（值已在本 token 内）。
2. **config 类 → 吞值后继续**（v4-P1-1 补附着形式）：
   - 分离：`-c` / `--config-env` → `index += 2`（吞掉值；`git -c user.name=x commit -m y` 必须能取到 `commit`）；
   - 附着：`-c=` / `-c<value>` / `--config-env=` → `index += 1`（值在本 token 内，**不得**再 `+2`，否则会把 `commit` 当值吞掉 → 判成 `kind:'none'` 任意相位放行）。
3. `commit` 返回 `repoOverride`；C 的放行条件要求 `repoOverride !== true`（`git -C ../other commit`、`git --git-dir=/x commit` 一律拒绝保底；文案说明「带 -C/--git-dir/--work-tree 的 commit 无法校验仓库归属」）。

**C.5 fail-closed 守卫（P2-4）**
- 放行前显式检查 `isProjectWorkspace(resolvedCwd) === true` **且** `readFlow(resolvedCwd).ok === true`；否则维持拒绝（`allowsWholeTreeWrite` 为 false 也可能是「非项目」或「flow 读不出」，不能一律当「无阶段」）。

**C.6 放行分支（`:2967-2973`）**
```js
if (!allowsWholeTreeWrite(resolvedCwd, enforce, classification.phases)) {
  const flow = readFlow(resolvedCwd);
  const canBeBookkeeping = classification.gitSubcommand === 'commit'
    && classification.repoOverride !== true
    && classification.undecidable !== true            // C.1① 修好后才是真条件
    && isSingleSimpleCommit(shellCommand)             // 原始命令判 $( / 反引号
    && isDirectGitInvocation(shellCommand)            // 以 git 开头 + 无 wrapper payload
    && isProjectWorkspace(resolvedCwd) && flow.ok;
  const scope = canBeBookkeeping ? inspectCommitBookkeeping(resolvedCwd) : null;
  if (scope !== null && scope.ok === true) return allowShell('git-commit-bookkeeping', []);
  // scope?.ok === false → 原文案主句 + 追加一行点名 offenders（前 5 条）
  return denyDecidable('shell-git-whole-tree', denyMessage);
}
```
- 安全阀文案（追加行，`t()` 内联，不新增 i18n 键）：
  `本次待提交路径含 .openfeel/ 之外的条目：<offenders 前 5 条>；该命令仅在提交纯书账时放行。`
- 原文案主句**逐字保留**（既有测试正则不受影响）。
- **nested 来源不放行**：即使内层是干净的 `git commit`，只要外层是 `bash -c` / `pwsh -Command`，本分支一律不成立（落回原拒绝）；理由：内层的语句分隔/替换在 wrapper 字符串里，无法用同一条 `isSingleSimpleCommit` 判定。

**测试（op-002 新增，必须含全部负向用例）**
- 正：无阶段 + 纯 `.openfeel/**` → `git commit -m x` **放行**且 `lastDecision.reason === 'git-commit-bookkeeping'`（**端到端**，走 `classifyShellCommand` → guard 回调，守 P0-1 的字段透传）。
- 负（每条都必须 DENY）：
  - 组合：`git commit -m x && git checkout -- .`、`git commit -m x; git clean -fdx`、`git commit -m x | cat`、`git commit -m x &`、`git commit -m x > src/x.ts`；
  - **会真执行的替换（v4-P0④）**：`git commit -m "$(rm -rf src)"`、`` git commit -m "`rm -rf src`" ``、`bash -c "git commit -m x; rm -rf src"`（nested）、`pwsh -Command "git commit -m x; rm -rf src"`（nested）——断言 reason 为 `shell-git-whole-tree` / `shell-indirect-exec` 且 **绝不出现 `git-commit-bookkeeping`**；
  - 仓库改写：`git -C ../other commit -am x`、`git -C=../other commit -m x`、`git --git-dir=/x commit -m x`、`git --work-tree=/x commit -m x`；
  - 路径集：`git commit -m x` 且暂存 `src/x.ts`（staged-only）、未跟踪 `src/new.ts`、非项目工作区 / `flow.json` 不可读。
- 正向边界：`git commit -m "a; b"` **放行**（引号内分号不拆语句）；`git -c user.name=x commit -m y`、`git -cuser.name=x commit -m y`、`git --config-env=a=b commit -m y` 必须**进入 commit 判定**（不再是 `kind:'none'`）；单引号 `-m 'fix $(x)'` **被拒**（已知代价，断言按「拒」写）。
- 回归：`git checkout -- .` / `reset --hard` / `clean -fdx` / `stash` 无阶段全部仍拒；有 `exec_running` 阶段 → 放行且 reason 仍 `git-worktree-write`；`classifyShellCommand('git commit -m "$(x)")` 的 `undecidable === true`（守住 C.1① 不被回退）。

### D. `setup --tools dsh --dsh-profile X` 多 profile 提示（P2）

**改哪儿**

1. `src/core/dsh-profile.ts`：`DshProfilePlan` 增加 `allProfiles: DshProfile[]`；`planDshDeployment`（`:348-365`）先 `listDshProfiles(home)` 再 `selectDshProfiles`，返回带 `allProfiles`（预检顺序与零写盘不变）。
2. `src/core/setup.ts`：`SetupResult.dsh`（`:30-35`）增加 `allProfileNames: string[]` 与 `profileScope:{deployed:string[];skipped:string[]}`；`:156-162` 透传。
3. `src/commands/setup.ts`（`:134-158`）：
   - 保留现有「未指定 profile 且 >1 → 全部部署」提示（`:137-141`）**逐字不变**；默认行为不变。
   - 新增：`allProfileNames.length >= 2 && options?.dshProfile !== undefined` → 一行提示到 **stderr**：
     `仅部署了 {deployed}，其余 profile（{rest}）保持原样；如需全部部署请去掉 --dsh-profile。`
   - **`--json` 形态**：`setup --json` 的 JSON 契约只在 `--check` 分支（`setup.ts:61-90`），部署分支（`:114-169`）不产出 JSON 且不走 `isJsonMode()`。因此：提示一律 stderr（零 stdout 污染）+ `profileScope` 作为非必需数据字段；**不新增部署分支的 stdout JSON 契约**，`--check --json` 字段零变化。
4. i18n：`zh-CN.ts`（`:1228-1233` 附近）与 `en.ts`（`:1184-1189` 附近）新增 `setup.dshProfileNarrowHint`（`{deployed}`/`{rest}`），键成对。

**测试**：两 profile + `--dsh-profile a` → `allProfileNames` 长度 2、部署只有 `a`、`profileScope.skipped` 含 `b`、提示在 **stderr**；不传 `--dsh-profile` → 两 profile 都部署且无该提示；`--check --json` 解析 stdout 单文档，字段与改动前一致。

### E. `feel_status` / `feel_next` 标题误报（P2）

**改哪儿**

1. `dsh/lib/adapters/workflow-gate.js`：新增 `workflowGateTitle(gate)`（`guard-inactive` / `guard-cwd-unresolved` / `guard-stale` / `no-active-stage` 四个文案，其余回落 `gate.message`）；`computeWorkflowGate` **一字不改**。
2. `dsh/lib/tools/index.js`：
   - `:324`（`feel_status`）用 `workflowGateTitle(snapshot.workflowGate)`；
   - `:382-385`（`feel_next`）**同样**用同一 helper 替换 `⚠ ${plan.workflowGate.message}`（两处必须一致）；
   - `guardWarnings`（`:219-236`）加 `{ skipGateCovered }`：`reason` 以 `guard-` 开头时跳过 `registered===false` 与 `stale`，保留 `degraded`；两处调用都传；
   - **`hmacWarn` 一行提示也在这里**：`stale === false && guard.hmacWarn === true` → `⚠ 门禁状态签名失配（仅提示，不影响判定）；如显示异常可完全重启宿主。`（不审计、不置 stale、不进 `workflowGate`）。该行的渲染归 op-003，op-001 只产出字段。

**测试**：`workflowGateTitle` 四 reason 单测（`guard-*` 标题不含「无活跃阶段」）；`guardWarnings` 的 `hmacWarn` 单测；`feel_status` 与 `feel_next` **两处**都有 summary 关键词断言。

### F. 受支持的自愈入口（对应外部报告「方向 D」）

#### F.0 先定清：`guard-stale` 该不该硬拒写

**事实（F16）**：本仓库 `guard.js` **不读** `guard-state`，门禁判定只有 cwd / 相位 / 受保护路径 / shell 分类；`feel_flow advance` / `feel_stage` / `feel_op` / `feel_req` 走 CLI 子进程写 `flow.json` 等，**不经 guard**。所以本仓库里 `guard-stale` 只产生两处**提示**（`workflowGate.required` 与 `guardWarnings`），从未拒写 —— 这也是我们这边 `feel_flow advance` 能过的原因。外部项目被拒的原因不在本仓库这段代码，需其 `guard-audit.jsonl` 的 `reason` 字段佐证（估计是别的适配器版本或 preflight，不复制该行为）。

**决策（写死，不再摇摆）**：
1. **`hostStartedAt` 永不作为拒写依据**——v2 已把它从 stale 判定删除（D2），本批次进一步明确它只是诊断字段。
2. **`pid` / `loaded_hash` 不符**：只把状态标 `stale:true` 并让 `workflowGate` 提示，**本批次不新增任何「guard-stale → 拒写」的门**。
   - 理由：适配器文件刚更新（`setup` 写完、宿主未重启）时 `loaded_hash` 会短暂不符；若此时拒写，会把**所有** `feel_*` 与文件写一起锁死，而且首条写入被拒 → 状态永不刷新 → **鸡生蛋死锁**，与「重启后首次 `feel_*` 自愈」直接冲突。
   - 若将来确需拒写，**必须同时满足三条**：① 只在 `pid`/`loaded_hash` 真不符时触发；② **先落新状态（自愈）再判**，绝不先拒后写；③ 必须有本节的显式自愈入口兜底。本批次**不采纳**，记为后续需求的显式待决项。
3. 验收口径因此是「**不得因 guard-stale 拒写**」而非「按 stale 拒绝」（V16/V17）。

#### F.1 命令选择（写死）：`feel_verify action=health fix=true`

- **不新增** `openfeel setup --repair-guard`；复用已存在的 `feel_verify` health + `fix` 语义。CLI 侧 `openfeel flow health --fix` **保持原语义**（只对账 `status.md` 状态字段，`src/commands/flow.ts:2478` 附近），**不扩到 guard-state**——因为 CLI 不知道宿主 pid，改不出可信的 `pid`。
- **修复实现在适配器进程内**（`dsh/lib/tools/index.js` 的 `feel_verify` handler），只有它同时握有：当前宿主 `process.pid`、启动时的 marker、可解析的 `resolved.cwd`。

**实施要点**

1. `dsh/lib/adapters/guard-state.js` 新增（导出）：
   - `guardAuditPath(root)` → `join(root, '.openfeel', 'log', 'guard-audit.jsonl')`（与 `guard.js` 的落点同名同格式）。
   - `repairGuardState(root, { hostMarker, pid, actor, auto })`：
     - `hostMarker` 为空/null → `{ ok:false, reason:'marker-missing' }`（**明确报错**，不静默）。
     - `state = readGuardState(root)`；`old = { pid: state?.pid, loaded_hash: state?.loaded_hash, hostStartedAt: state?.hostStartedAt }`。
     - 新身份只用 `{ pid: pid（= 当前宿主进程）, hostStartedAt: hostMarker.started_at, loaded_hash: hostMarker.loaded_hash }`；**不接受任何外部传入的身份值**。
     - 若 `old` 已与新身份一致 → `{ ok:true, changed:false }`（幂等，不写盘、不审计）。
     - 写盘：`writeGuardState(root, identityPatch)` —— 借助现有合并语义**保留** `lastDecision`/`cwd`/`cwdSource`（工作区身份被剥离、显式 patch 覆盖身份）；`state === null` 时补 `registered:true`、`cwd: resolved.cwd`、`cwdSource:'repair'`。追加 `repairedAt`、`repairSource: auto ? 'self-heal' : 'feel_verify'`。
     - 追加一行审计到 `guardAuditPath(root)`：`{time, event:'guard_repair', decision:'allow', reason:'guard-repair', tool:'feel_verify'|'feel_status', auto:bool, old:{pid,loaded_hash,hostStartedAt}, new:{...}, cwdSource}`（**含旧值与新值**）。
     - 返回 `{ ok:true, changed:true, old, next }`。
   - `maybeSelfHealGuardState(root)`（自动自愈，**必须带下方四条约束，否则会变成多宿主 ping-pong 写**）：
     - `process.env.OPENFEEL_GUARD_SELF_HEAL === 'off'` 时直接返回（测试/逃生阀）。
     - **节流**：模块级 `Map<root, lastCheckAt>`，同一 root **60s 内只检查一次**；命中节流直接返回。
     - **marker 缓存**：按 `{path, mtimeMs, size}` 缓存 `readHostMarker()` 结果，未变化时**零读盘**。
     - `state = readGuardState(root)`；非 workspace 来源或 `state === null` → 返回。
     - **活着的异 pid 不自动修（关键）**：`state.pid !== process.pid` 时用 `process.kill(state.pid, 0)` 判存活——
       - 返回成功（活着）**或**抛 `EPERM`（活着但无权限）→ **跳过自愈**，只留显式 `feel_verify action=health fix=true`；
       - 抛 `ESRCH`（进程已死）→ 允许自愈（正是「上一轮宿主留下的状态」）；
       - 理由：两个活宿主共享同一工程时会互相把对方 `pid`/`loaded_hash` 写进 state（ping-pong 写 + `guard_repair` 审计无界增长），且会用共享 marker 的 `loaded_hash` 覆盖另一个宿主的真实值。
     - `state.pid === process.pid && state.loaded_hash === marker.loaded_hash` → 已是可信，直接返回（幂等不写盘）。
     - 否则 `repairGuardState(root, { hostMarker: marker, pid: process.pid, auto: true })`；任何异常吞掉（best-effort，绝不阻断 `feel_*`）。
     - **审计上限**：自动自愈的 `guard_repair` **每宿主启动至多一条**（模块级 `autoRepairAudited` 标记；后续自动修复仍写 state，但不追加审计），避免审计无界增长；显式修复按「实际发生变更」各记一条（幂等时不写）。
     - **读次数上限**：每次自动检查 **≤2 次同步小 JSON 读**（1 次 `readGuardState` + marker 缓存未命中时 1 次 `readHostMarker`）；节流命中或 marker 缓存命中时为 0~1 次。
2. `dsh/lib/tools/index.js`：
   - 在 `target()`（所有 `feel_*` 的公共入口，`resolveWorkspace` 之后）加：`if (workspace.initialized) maybeSelfHealGuardState(workspace.projectRoot);` —— 满足报告要求「**重启后首次 `feel_*` 调用自愈**」，且**不要求任何手工删文件**。
   - `feel_verify`：`action === 'health' && fix === true` 时，先 `repairGuardState(resolved.cwd, { hostMarker: readHostMarker(), pid: process.pid, actor:'feel_verify' })`，把结果放进 `data.health.guardRepair`，并在 summary 里：成功 → `门禁自证已修复（旧 pid/hash → 新 pid/hash）`；失败 → `⚠ 门禁自愈失败：<reason>（marker 缺失请重启宿主）`，**错误可见、不静默**。
   - 显式修复**以当前宿主为准**（`pid = process.pid`）；计划/文档注明：**多宿主同工程时不要用显式修复**（它会把 state 归到当前宿主），自动自愈在活 pid 场景已自动跳过。
3. `dsh/ADAPTER.md`：新增「门禁自愈」段：命令（`feel_verify action=health fix=true`）、自动自愈时机（首个 `feel_*`）、`OPENFEEL_GUARD_SELF_HEAL=off` 逃生阀、**明确写「官方修复路径不需要删除 `.openfeel/dev/guard-state.json`」**（外部报告的硬要求）。

**兼容性说明（必须写进计划/注释）**：`.openfeel/dev/guard-state.json` 是**受保护路径**（针对 `write`/`edit` 等**工具写**，由 guard 拒绝）；而 repair 走的是**适配器进程内的 `fs` 直写**，不是工具写，**不经过 guard**，因此不存在自锁；同理 CLI 侧 fs 直写也不被拦。安全性由「身份只能来自 marker + 当前 pid」保证，agent 无法通过 repair 注入任意 pid/loaded_hash。

### G. 回归测试（对应外部报告「方向 E」，≥5 条，全部落在 op-001）

新增到 `dsh/test/guard.js`（沿用临时工作区 + `withGuardEnv`；每条都 `try/finally setGuardRuntimeIdentity(null)` + `clearGuardState`）：

| # | 用例 | 断言 |
|---|---|---|
| G1 | **启动期 cwd 未解析 → 全局注册 → 工作区首次写入**：先写全局 state（带当前 marker 身份）且不写工作区；预置一个工作区旧 state（旧 `hostStartedAt`/旧 `pid`）；设 `runtimeIdentity`；调用 `writeGuardState(cwd, { lastDecision })` | 工作区 state 的 `hostStartedAt === marker.started_at`、`pid === process.pid`（**当前宿主**），`computeGuardStale === false` |
| G2 | 工作区已有旧 `hostStartedAt` + 全局新注册 | `stale === false`（旧值不覆盖新 seed） |
| G3 | 适配器文件变更（`loaded_hash` 不同） | **仍 `stale === true`**（这条**不能放宽**） |
| G4 | **模拟完全重启**：旧工作区 state（旧身份）+ 新 marker（`started_at` 更晚、同 `loaded_hash`） | `stale === false`（不再因 `host-started-at` 误报） |
| G5 | 旧状态缺 `pid` / HMAC 异常 | 缺 pid → `staleReason === 'pid-missing'`（fail-closed）；HMAC 失配（三元组一致）→ `stale === false` + `hmacWarn === true`（v2 语义） |

**自愈入口测试（同 op-001）**：
- `repairGuardState`：旧 state（旧 pid/旧 hash）→ repair → `stale === false`、`lastDecision`/`cwd`/`cwdSource` **逐字段保留**、`guard-audit.jsonl` 末行 `event:'guard_repair'` 且含 old/new；重复调用 → `changed:false` 且不新增审计（幂等）。
- `marker` 缺失 → `repairGuardState` 返回 `{ok:false, reason:'marker-missing'}`，且**不写盘**。
- `state === null` + marker 存在 → repair 写出新 state 且 `stale === false`。
- `maybeSelfHealGuardState`：stale-by-identity → 自愈后 `stale === false`；`OPENFEEL_GUARD_SELF_HEAL=off` 时不写盘；fresh 时不写盘（幂等）。
- **并发/成本约束（v4-P1-3，全部要有测试）**：
  - **活着的异 pid 不自动修**：mock 一个存活 pid（用当前测试进程的 pid 写入 state，但把 `process.pid` 视角模拟成另一个 → 或直接 `process.kill(<真实存活pid>,0)` 分支断言）→ `maybeSelfHealGuardState` **不写盘**；显式 `repairGuardState` 仍可修。
  - **死 pid 可自动修**：state.pid 写一个必然 `ESRCH` 的 pid（如 `2^31-1` 附近不可用 pid）→ 自动修复生效。
  - **节流**：连续两次调用，第二次在 60s 内 → 第二次不读/不写（用读计数 mock 或 `changed:false` + 文件 mtime 不变断言）。
  - **marker 缓存**：mtime+size 未变 → 不重复解析（读计数断言）。
  - **审计上限**：同一进程内多次自动修复 → `guard_repair` 自动条目**至多 1 条**；显式修复每次实际变更加 1 条。
  - **读次数上限**：单次自动检查 ≤2 次同步读（可用包装计数断言）。

---

## 4. 操作方案拆分（3 个 op，顺序固定 001 → 002 → 003）

### op-001 — A + B + F + G：guard 状态身份自证 + stale 判定 + 测试隔离 + 自愈入口

**文件**：`dsh/lib/adapters/guard-state.js`、`dsh/lib/index.js`、`dsh/lib/tools/index.js`（仅 `target()` 与 `feel_verify` 两处；与 op-003 同文件但不同区段，靠串行执行隔离）、`dsh/ADAPTER.md`、`dsh/test/{guard,verify,integration,contract}.js`

**实施步骤**
1. `guard-state.js`：`IDENTITY_KEYS` / `setGuardRuntimeIdentity` / `identityWarned`；重写 `writeGuardState` 合并段（工作区身份剥离、全局段兜底 + 降级 stderr）；重排 `guardStateDistrust`（只认 pid + loaded_hash，删 host-started-at）；`computeGuardStale`；`buildGuardSection`（null 分支保持 4 键，非空分支加 `signature`/`hmacWarn`）；`globalGuardDir` env。
2. `index.js`：启动时 `setGuardRuntimeIdentity`（marker 之后、registerGuard 之前）。
3. **§3-F 自愈**：`guardAuditPath` / `repairGuardState` / `maybeSelfHealGuardState`（guard-state.js，含存活判定 / 节流 / marker 缓存 / 审计上限 / 读次数 ≤2）+ `target()` 内的自动自愈 + `feel_verify health fix=true` 显式修复（tools/index.js）。
4. `dsh/ADAPTER.md`：两个 env + ① HMAC 取舍 + D2（hostStartedAt 不参与 stale）+ 「门禁自愈」段（**官方修复不要求删文件**）+ `OPENFEEL_GUARD_SELF_HEAL=off`。
5. 测试：四个入口设隔离 env；`guard.js:1156` 改走函数；`:1616-1639` 改 hmac 语义；`:1232-1266` 改 host-started-at 语义；新增身份继承回归 + 正控/反控；**§3-G 的 G1~G5 与自愈入口测试全部补齐**；所有临时 identity 用例 `try/finally setGuardRuntimeIdentity(null)`（P1-4）；新增确定性「真实状态未写」断言（P2-3）。

**验收**
- `node dsh/test/guard.js` / `verify.js` / `integration.js` / `contract.js` 全绿。
- 定点回归：旧身份覆盖 / hmac 降级正控 / 三元组失配不被降级掩盖 / host-started-at 不再误报，四条都在。
- **§3-G 的 G1~G5 全绿**（G3 的 `loaded_hash` 失配必须仍 stale）；自愈入口四条 + 并发/成本六条测试全绿（活 pid 跳过 / 死 pid 可修 / 节流 / marker 缓存 / 审计上限 / 读次数 ≤2）。
- `grep -rn "openfeel-guard'" dsh/test/` 为空；ADAPTER.md 有 env、取舍、自愈段。
- 真实 marker 与真实全局目录：条目集合完全不变（或 `skip: host-active`），隔离副本 `started_at` ≠ 真实 marker。

### op-002 — C：无阶段 `git commit` 只放行单条纯书账

**实施步骤**
1. `classifyGitCommand`：commit 补 `gitSubcommand` / `repoOverride`；**分离值** `-c`/`--config-env` `+2`、**附着** `-c=`/`-cV`/`--config-env=` `+1`；`-C`/`--git-dir`/`--work-tree` 的精确与 `=`/附着形式都标 `repoOverride`（先判 `-C` 再判 `-c`，大小写敏感）。
2. `analyzeShellStatement`（`:2182-2191`）与 `classifyShellCommand`（`:2377-2388`）两处白名单补 `gitSubcommand` / `repoOverride` 透传；**`:2386` 的 `undecidable:false` 改为 `analysis.undecidable === true`**（v4-P0①）。
3. 新增 `isSingleSimpleCommit(command)`（**原始命令**判 `$(`/反引号，不 mask；单引号误拒可接受）+ `isDirectGitInvocation(command)`（`/^git(\s|$)/` 且无 wrapper payload）+ `inspectCommitBookkeeping(resolvedCwd)`（porcelain -z 解析，含 R/C 跳过原路径）。
4. 放行分支（`:2967-2973`）按 C.5/C.6 组合**七条件**（含 undecidable / 直接调用 / 路径集）；nested 来源一律不放行；offenders 文案追加；其他整树写零放宽。
5. 测试：正向端到端 + 全部负向（多语句/管道/后台/重定向/**`$()` 与反引号真执行 payload**/嵌套 wrapper/仓库改写**含 `=` 形式**/staged-only/未跟踪源码/非项目/flow 坏）+ `-c` 与 `--config-env` **分离与附着两种形式** + 引号内分号边界 + 单引号 `$(` 的已知误拒断言。

**验收**
- 端到端放行且 `reason === 'git-commit-bookkeeping'`（走 `classifyShellCommand`，守 P0-1）。
- 全部负向用例逐条 DENY（含两条**真执行 payload** 与嵌套 wrapper，reason 绝不出现 `git-commit-bookkeeping`）；offenders 文案点名前 5 条。
- `classifyShellCommand('git commit -m "$(x)")` 的 `undecidable === true`；`git -c=u=x commit`、`git --config-env=a=b commit` 进入 commit 判定；`git -C=/x`、`git --git-dir=/x` 标 `repoOverride`。
- `git -c user.name=x commit -m y` 进入 commit 判定；`git -C ../other commit` 拒绝。
- 其它整树写与有阶段路径零回归。

### op-003 — D + E：setup 多 profile 提示 + 门禁原因标题

**实施步骤**
1. `dsh-profile.ts` / `core/setup.ts` / `commands/setup.ts` / i18n 两个文件：`allProfiles` → `allProfileNames` + `profileScope`；stderr 提示；默认行为不变。
2. `workflow-gate.js` `workflowGateTitle`；`tools/index.js` 两处（`:324` 与 `:382-385`）+ `guardWarnings` 的 `skipGateCovered` 与 `hmacWarn` 一行。
3. 测试：setup 两 profile 场景、`--check --json` 零变化、`workflowGateTitle` 四 reason、两处 summary 断言。

**验收**
- `npx vitest run` 全绿；`verify lint --target i18n` 无缺失键；提示只在 stderr 出现一次；`--check --json` 字段零变化；`feel_status` 与 `feel_next` 标题同源。

**依赖关系**：`dsh/test/guard.js` 被 op-001 与 op-002 改动，`dsh/lib/tools/index.js` 与 `dsh/test/verify.js` 被 op-001 与 op-003 改动，故**整体串行** `001 → 002 → 003`（同文件不同区段，串行可避免冲突；若并行，`tools/index.js` 的 summary 段与 `target()` 段必须由不同人复核）。

---

## 5. 验收清单（每条都可在真机复验；共 18 条）

| # | 验收项 | 复验方式（真机） | 期望 |
|---|---|---|---|
| V1 | 重启后 stale 为 false（**P2-5 修正**） | 完全重启宿主 → 先触发一次门禁判定（`git status` 即 `shell-no-write`，会写 `lastDecision`；或任一写工具被拒/放行均可）→ `feel_status` | `guard.stale === false`；`guard.hostStartedAt === marker.started_at`；`guard.pid` 为当前宿主；**若 profile 配了 cwd，注册时即已刷新，可跳过触发步骤** |
| V2 | 跨进程读取不误判 | 另一进程只读 state，再对比宿主 `feel_status` | `stale === false`；失配只出 `hmacWarn:true`（+ `signature:'mismatch'`），不影响 `workflowGate` |
| V3 | 旧身份不继承 | 把 workspace state 的 `hostStartedAt`/`pid` 改旧（测试副本）→ 触发一次判定 | 三键刷新为当前注册值；`stale === false` |
| V4 | 测试不污染真实状态（**P2-3 + v4-P2-3 确定性判据**） | 记录真实全局目录条目集合与真实 marker `{started_at,loaded_hash}` → 跑四个 dsh 测试 → 再记录 | ① 真实 marker `loaded_hash` 变 → **FAIL**；② `loaded_hash` 不变但 `started_at` 或**全局目录条目集合**变化 → `skip: host-active`（活宿主的 fail-closed 判定也会写全局目录，不判红）；③ 两者都不变 → PASS；④ 隔离副本 `started_at` ≠ 真实 marker |
| V5 | 纯书账可提交（端到端） | 两阶段 done + 只改 `.openfeel/**` → `git commit -m x` | 成功；`guard-audit.jsonl` 有 `git-commit-bookkeeping`；证明 `gitSubcommand` 透传有效 |
| V6 | 混入源码仍拒且点名 | 同上再改 `src/anything.ts` → `git commit -a` | 拒绝；主句保留 + 追加行点名 `src/anything.ts` |
| V7 | 组合与替换形态全部拒（**P0-2 + v4-P0④**） | `git commit -m x && git checkout -- .`、`; git clean -fdx`、`\| cat`、`&`、`> src/x.ts`、**`git commit -m "$(rm -rf src)"`**、**`bash -c "git commit -m x; rm -rf src"`** | **逐条 DENY**，reason `shell-git-whole-tree` / `shell-indirect-exec`，**绝不出现 `git-commit-bookkeeping`**；两条替换 payload 必须真执行前被拒（不是仅 `undecidable` 提示） |
| V8 | staged-only 拒绝（**P0-3**） | `git add src/x.ts` → `git restore -W -s HEAD src/x.ts` → 无阶段 `git commit -m x` | 拒绝；文案点名 `src/x.ts` |
| V9 | 仓库改写与 config 选项（**P1-1/P1-2 + v4-P1-1/P1-2**） | `git -C ../other commit -am x`、`git -C=../other commit -m x`、`git --git-dir=/x commit -m x`、`git --work-tree=/x commit -m x`；`git -c user.name=x commit -m y`、`git -c=user.name=x commit -m y`、`git --config-env=a=b commit -m y`（有阶段） | 前四条拒绝保底且文案说明；后三条走正常 commit 判定（**不得** `kind:'none'` 直放） |
| V10 | 多 profile 提示与 JSON 契约 | 两 profile → `setup --tools dsh --dsh-profile <a>`；再 `setup --check --json` | stderr 一行列出被跳过 profile；stdout 人类输出不变；`--check --json` 字段零变化 |
| V11 | 标题两处一致（**v4-P1-4 改口径**） | 用 `OPENFEEL_GUARD_SELF_HEAL=off` 的独立宿主（否则自愈会在展示前修掉 stale），或直接对 state 文件 + `computeGuardStale` 构造三种 reason → 再 `feel_status` **与** `feel_next` | 两处标题一致且按 reason 区分、不出现「无活跃阶段」；真正无阶段时两处仍显示「无活跃阶段」；**不依赖自动自愈失效** |
| V12 | HMAC 降级可见且不倒灌 | 构造验签失败（三元组一致）→ `feel_status`；再改坏 `loaded_hash` | 前者 `hmacWarn:true` + `stale:false` + summary 一行；后者 `stale:true` 且无 `hmacWarn` |
| V13 | marker 重写不再误报（**P1-3**） | 把真实 marker 的 `started_at` 改成未来时间（`loaded_hash` 不变，测试副本）→ `feel_status` | **`stale === false`**（旧实现 `host-started-at` 必红）；`hostStartedAt` 仅作显示 |
| V14 | 零回归 | `npx vitest run`；`cd dsh && node test/{guard,verify,contract,integration}.js` | 全绿；断言数以实跑输出为准；`guard-state` 空态仍恰 4 键（`verify.js` 的 `deepEqual`） |
| V15 | **不删文件也能自愈**（外部报告硬要求） | 完全不删、不手改任何 `guard-state.json` → 完全重启宿主 → **首次** `feel_*`（如 `feel_status`） | 首次调用后 `guard.stale === false`；`hostStartedAt === marker.started_at`、`pid` 为当前宿主；无任何「请删除 guard-state.json」文案 |
| V16 | `loaded_hash` 失配仍 stale（**v4-P1-4 改口径**） | `OPENFEEL_GUARD_SELF_HEAL=off` 的独立宿主，或直接对 state 文件 + `computeGuardStale(state, marker)` 断言（与 G3 同口径） | `stale === true` / `staleReason === 'loaded-hash'`；**且不因此拒写**（写操作照常，仅提示；见 F.0） |
| V17 | guard-stale 不再拒写 | 人为制造 `pid` 不符 / `loaded_hash` 不符 → 执行 `feel_flow advance`（或任一 `feel_*` 写）与一次文件写 | 写入**不被 guard-state 拒绝**（本仓库不读 state，F16）；`feel_status` 仅提示；`host-started-at` 单独变化**永不**拒写 |
| V18 | 显式自愈入口 | 构造旧身份 state（保留 `lastDecision`/`cwd`）→ `feel_verify action=health fix=true` | 修复后 `stale === false`；`lastDecision`/`cwd`/`cwdSource` 逐字段保留；`.openfeel/log/guard-audit.jsonl` 末行 `event:'guard_repair'` 含 old/new；marker 缺失时报 `marker-missing` 且不写盘；**活着的异 pid** 只能通过显式入口修（自动自愈应跳过，见 G 表补充） |

---

## 6. 风险与回滚

| 风险 | 影响 | 缓解 | 回滚 |
|---|---|---|---|
| **R1** HMAC 降级后重写 `guard-state.json` 不再 stale（**① 审计留档，五条理由**） | 只影响显示；判定每次现读 `flow.json` | `hmacWarn:true` + 一行提示可见；文档写明「状态文件不是判定依据」；`lastDecision` 与审计交叉可查 | 恢复 `guardStateDistrust` 验签优先 |
| **R2** `runtimeIdentity` 未设置 | 状态缺三键 → stale | 全局段兜底 + 首次写 stderr `[guard] guard-identity-unavailable`（D7/P2-1，**有落点**） | 无需回滚 |
| **R3** C 的 status 解析被 git 格式影响 | 误拒 | `-z` + `core.quotePath=false`；R/C 跳过原路径；解析失败 `null → 拒绝` | 删分支 |
| **R4** env 被误当安全边界 | 文档误导 | ADAPTER.md 明确测试用、非边界 | 文档回退 |
| **R5** 三个 op 顺序错乱 | 同文件冲突 | 固定串行 001→002→003；逐 op 提交/审查 | op 粒度 revert |
| **R6** 标题文案影响既有断言 | 测试误红 | 只断言关键词；两处同一 helper | 恢复旧调用 |
| **R7（P1-3 残留）** 只认 pid + loaded_hash：若重启后 PID 复用且适配器文件未变，旧状态可能被当新鲜 | 极窄（PID 复用 + 同版本 + 重启窗口） | 状态文件每次判定都会重写，窗口是一次判定的时间；`updatedAt` 仍在文件里可人工核对 | 加 marker pid 再做时间比较（单开需求） |
| **R8（P0 类回归）** C 的七条件组合写漏一条即变后门 | 放行面扩大 | 每条条件在计划里有对应负向用例；评审按「七条件 × 负向用例」逐条对照 | 删该条组合条件即回到拒绝 |
| **R9（自愈入口）** repair 写的是「受保护路径」，且是唯一由 agent 可触发的状态改写 | 若身份可被注入，等于开了提权口 | 身份**只能**来自 marker + 当前 pid（不接受工具参数）；审计落盘含 old/new；`OPENFEEL_GUARD_SELF_HEAL=off` 可关；repair 只改身份字段，不改 `lastDecision`/判定依据；guard-state 本就不参与判定（F16） | 关闭 `target()` 自愈调用与 `feel_verify` 修复分支（两处单行） |
| **R10（F.0 决策）** 不新增拒写门 → 真不可信时也不拦 | 显示上 stale，实际写入不受影响 | 门禁判定不依赖状态文件；若未来要拦，必须按 F.0 三条（先自愈再判、仅 pid/hash、必有兜底） | 无需回滚 |
| **R11（自愈）** 两个活宿主共享同一工程 → 自动自愈互相改写（state 的 pid/hash ping-pong + 审计无界） | 状态抖动、审计膨胀 | 自动自愈加**存活判定**（活着的异 pid 一律不修）、**每 root 60s 节流**、**marker mtime+size 缓存**、**每宿主启动至多一条自动审计**、**读次数 ≤2**；显式修复要求用户确认多宿主场景 | 关闭 `target()` 自愈调用（单行） |
| **R12（P0 类回归）** `undecidable` 透传若被评审判为「过严」而回退成 `false` | 替换 payload 重新可被放行 | 测试钉死：`classifyShellCommand('git commit -m "$(x)").undecidable === true`；代码注释写明「**不得**改回 false」 | 保留测试，回退即红 |

**R1 的取舍理由（① 采纳项，五条，写进 ADAPTER.md 与 `guard-state.js` 注释）**：
1. 密钥进程内随机（`guard-state.js:40`），跨进程读必然失配；拿它当不可信判据 = 每次重启误报——比漏报更伤（训练用户忽略告警）。
2. `guard-state` 不参与任何判定（判定用 cwd + `flow.json`），伪造收益极低。
3. 真正防伪造在写入面：受保护名单 + shell 第 1 类硬拒。
4. 残留敞口只有 shell 第 4 类（无法静态判定目标）默认告警放行，可用 `OPENFEEL_SHELL_GATE=strict` 收紧，非本需求新增。
5. 因此三元组一致 → `stale:false`；hmac 失配只加 `hmacWarn:true` + 一行提示；三元组也不符 → 才 stale。

**回滚总原则**：每个 op 文件集基本不重叠，可单独 revert；C 若被判定风险过高，删掉放行分支即回到 v1.5.11 行为。

---

## 7. 边界（本阶段不做）

- 不改 `src/**`/`dsh/**` 源码、测试、文档（实现由 op 执行）；不改 `flow.json` / `status.md` / `dev_last*` / `dev/current.md`。
- 不做 marker 盐、不改 HMAC 算法、不改 `guard-state.json` schema 版本（新增字段可选，读取端容忍缺失）。
- **不新增「guard-stale → 拒写」门**（F.0 决策）；**不扩 `openfeel flow health --fix` 的 CLI 语义**（修 guard-state 只在适配器进程内做）。
- 不把「无阶段」放行面扩散到 `commit` 之外；不新增部署分支 stdout JSON 契约。
- 不改 DSH profile 默认部署行为（默认仍全部部署）。
