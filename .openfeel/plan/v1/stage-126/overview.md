# v1.5.11-stage-126

## 目标

修复 DSH 写入门禁「**判定面太窄 + 有零守卫绕过面**」（REQ-019）。第一轮根因（「cwd 解析失败 → 静默放行」）已推翻：审计日志证明 guard 正常执行、cwd 解析成功，`src/_guardprobe.txt` 之所以写得进去是因为 `.txt` 命中 doc/asset 豁免（`{"event":"guard_allow","reason":"doc-asset",...}`）；换 `.ts` 立刻被拒。真实根因按可利用率排序：

1. **shell（`bash`/`pwsh`）完全不在守卫面内**（`guard.js:23-28`）—— 不是判定宽，是零判定；
2. **doc/asset 豁免完全不看目录**（`guard.js:128-130`）—— `src/x.md`、`src/x.css`、`src/assets/*` 在无 `exec_running` 时可写；
3. **`.openfeel/**` 内部只有 2 个受保护文件**（`guard.js:490-491` + `:222-226`）—— agent 可手写 `chore.json` / `dev/.preflight.json` **自提权**；
4. chore 的 60 分钟任意写窗口（`chore.ts:120-136`）；
5. cwd 解析失败时静默放行（`guard.js:409-417`）—— **实测未触发，降级为防御纵深**。

本阶段要做六件事（不可改形）：

| 决策 | 定位 | 优先级 |
|---|---|---|
| **D-126-05 受保护路径扩展**：`chore.json`、`dev/.preflight.json`、`dev/sessions.json`、`dev/guard-state.json`、`flow-archive/**`、`checkpoints/**`、`requirements/*.md`（建议含 `log/**`）agent 工具写一律拒、消息指向对应 CLI；**guard 只拦工具调用，适配器/CLI 的 fs 直写不受影响** | 堵自提权 | **P0** |
| **D-126-06 doc/asset 豁免收窄**：`src/**`、`test/**`、`scripts/**`、`dsh/**`、`bin/**` 内一律按源码门禁（**先判代码目录，再判扩展名**）；豁免只留 `docs/**`、`.openfeel/**`、根级 `README*/CHANGELOG*/LICENSE*`、显式 `assets/`、`public/` | 堵借道 | **P0** |
| **D-126-02 shell 覆盖**：`DEFAULT_MUTATING_TOOLS` 加真实名 `bash`/`pwsh`（`apply_patch`/`shell`/`execute_command`/`exec` 本宿主不存在，仅跨宿主防御条目）；四类判定 + 相对路径按 `workdir ?? guard cwd`；`OPENFEEL_SHELL_GATE` **默认 =「1/2 类拒 + 4 类告警」组合** | 堵头号绕过面 | **P0** |
| **D-126-03 chore 收窄**：TTL 60→30、实现 i18n 已承诺的 `--ttl-min`；默认不允许源码写入，需 `--source` 并落 log `detail.source_allowed=true`；与 05/02 协同后 **chore 变纯人类通道** | 窄化宽窗口 | P1 |
| **D-126-01 cwd 链 + fail-closed**：`OPENFEEL_GUARD_CWD` → `agent.session.header.cwd` → `config.cwd` → 登记表 `[sessionId]` → `process.cwd()`（**仅当含 `.openfeel/`**）→ fail-closed（**6 环；`registry-last` 已按 P1-4 删除**，跨项目串味会把 fail-closed 偷换成「按别的项目放行」）；**防御纵深，非本因** | 防将来无声失效 | P2 |
| **D-126-04 可观测**：写 `.openfeel/dev/guard-state.json`（registered/enforce/shellGate/cwd/cwdSource/degraded/**hostStartedAt/loaded_hash/pid**/resolvedAt/lastDecision），`feel_status`/`feel_next` 暴露 `guard` 段并**比对 boot/进程**不符即 `stale`；`registered=false` / cwd 失败 / `stale` → `workflowGate.required=true`；**cwd 解析失败固定落 `os.tmpdir()/openfeel-guard/guard-state.json`（绝不用 `process.cwd()`），审计同落全局 + stderr，禁止静默丢弃** | 支撑验证 | P1 |

**v3 收口补强（计划审查 P1 六条）**

| 项 | 结论 |
|---|---|
| P1-1 git 工作区写 | `git checkout --` / `restore` / `reset --hard\|--merge` / `stash pop\|apply` / `clean` / `apply` 并入**第 2 类**按目标判定；`git commit` 无 `exec_running` 阶段 → 拒。**编码/间接执行形态**（`-EncodedCommand`/`iex`/`bash -c`/`node -e`/`python -c`）并入**第 1 类硬拒**；变量字面量按第 2 类、不可解析走第 4 类；文档写死「**第 4 类只防误写、不防蓄意**」 |
| P1-2 构建产物 | `BUILD_ARTIFACT_GLOBS` 补 `build/**`、`out/**`、`target/**`、`.next/**`、`*.tsbuildinfo`；验收 10 扩成 `vitest`/`npm run build`/`cargo build`/`tsc -b`/`git status` |
| P1-3 ttl 上限 | `--ttl-min` **硬上限 30**，越界/非整数/`≤0` → exit 1 且零写盘；不允许任何途径改回更长 |
| P1-4 删 `registry-last` | 进程级单标量跨项目串味；登记表只按 sessionId；非 `agent-session` 来源必须 `degraded:true` + stderr 告警 |
| P1-5 验证分工 | **部署由 executor，端到端判定由顶层会话（Feel/用户）**；executor 只交「部署 + 离线全绿 + 审计样本」 |
| P1-6 可判定化 | 验收 12 改为「注入式单测 + 真机断审计行」；验收 16 的 `process.chdir` 注入移进 `dsh/test`（+`try/finally`），真机只验「`hostCwd` 不被采用」 |

**v4 微调（定点复审三条）**：① **P0-4** `guard-state.json` 增自证三键 `hostStartedAt`/`loaded_hash`/`pid`（复用 `host-state.js:88-89`），`feel_status` 比对不符 → `stale` + `workflowGate.required`；**cwd 解析失败时固定写 `os.tmpdir()/openfeel-guard/guard-state.json`**（工作区外，绝不用 `process.cwd()`），`feel_status` 在 cwd 缺失时也读该全局文件，`recordGuardAudit(null)` 同落全局 + stderr `[guard] audit-unavailable` —— 否则最需要证据时会被 try/catch 静默丢弃。② 审计样本**只能来自真实判定路径**，**禁止用 `write`/`edit` 伪造 `guard-audit.jsonl`**（它在受保护名单里，会被拒）。③ 变量口径消歧：**单次字面量赋值** → 第 2 类；**拼接/派生**（`$d='src'; Set-Content "$d/x.ts"`）→ 第 4 类 `warn`（与 R4 一致）。

**一句话判据**：真实 DSH 顶层会话里，非 `exec_running` 相位用 `write`、`pwsh`/`bash`、**`git checkout/restore/reset/stash pop/clean`** 改 `src/**` 都必须被拒且工作区无变化；手写 `.openfeel/chore.json` / `dev/.preflight.json` / `log/guard-audit.jsonl` 必须被拒；拿不到 cwd 时门禁显式拒绝并自我暴露，而不是静默放行。

**验证铁律**：① 探针必须用源码扩展名（`.ts`）—— 用 `.txt`/`.md` 会命中豁免分支得到假绿（§1.1 教训）；② 每条结论都要在 `guard-audit.jsonl` 里核对对应一行（`event`/`decision`/`reason`/`cwdSource`），不能只看工具表面报错。

## 依赖

无（本阶段只出计划；实现在后续 op 执行）

## 操作方案

四个 op，`op-001 → op-002 → op-003 → op-004` 串行（`dsh/lib/guard.js` 是公共改点，串行避免冲突；001 无依赖，应最先合入）。详见 [plan.md](plan.md) §3-§4。

| op | 标题 | 决策 | 落点 | 验证 |
|---|---|---|---|---|
| op-001 | 判定核心收紧 | D-126-05 + D-126-06 | `dsh/lib/guard.js`（`PROTECTED_OPENFEEL_PATHS`/`isProtectedPath`（含 `log/guard-audit.jsonl` 单文件）、`CODE_DIRECTORIES`/`isCodeDirectoryPath`/`isExemptPath` 改写、抽 `decideForTargets`）、`dsh/test/guard.js` | `node test/guard.js` 全绿；contract/verify/integration 零回归；含防自锁断言 |
| op-002 | shell 覆盖 | D-126-02 | `dsh/lib/guard.js`（`SHELL_TOOLS`、`extractShellCommand`、`classifyShellCommand`、git 工作区写规则、编码形态规则、`workdir` 基准、补齐的产物豁免、`OPENFEEL_SHELL_GATE` 默认组合）、`dsh/lib/index.js`（默认列表同步 + `shellGate`）、`dsh/test/guard.js` | 同上 + **反向项必测**：`npx vitest` / `npm run build` / `cargo build` / `tsc -b` / `git status` / `git commit -m "fix src/x.ts"`（有 exec 阶段时）不误杀 |
| op-003 | cwd fail-closed + 可观测 | D-126-01 + D-126-04 | 新建 `session-cwd-registry.js`（只按 sessionId）、`guard-state.js`；`guard.js`（`resolveGuardCwd` + 降级告警）、`index.js`（注册段 + 提示装配登记）、`tools/index.js`（`guard` 段）、`workflow-gate.js`、`.gitignore`、`test/verify.js` | `node test/verify.js` + `guard.js` + `integration.js` + `npx vitest run` |
| op-004 | chore 收窄 | D-126-03 | `src/commands/chore.ts`（含 `--ttl-min 1..30` 上限校验）、`src/core/i18n-data/{zh-CN,en}.ts`（含 `chore.ttlTooLong`）、`dsh/lib/guard.js`（chore 策略）、`test/commands/chore.test.ts` | `npx vitest run test/commands/chore.test.ts test/core/i18n.test.ts` |

**执行纪律**：001 先补**红色用例**再改判定；抽 `decideForTargets` 后跑全绿才进下一步；不做两轮部署、不设 observe 模式（fail-closed 直接生效，`guard-state.json` 的 `cwdSource` 即「测量」）；命中 `unresolved` 时用 `OPENFEEL_GUARD_CWD` 救急，而不是改回 fail-open。

**部署与验证分工（P1-5）**：executor 做「实现 + 离线全绿 + `npm run build` + 部署 + 交审计样本」；**§5B/§5D/§5E 的端到端判定由 Feel/用户在重启后的顶层会话执行**（子会话的 `agent.session.header.cwd` 与顶层不同，且 guard 只在宿主重启时重注册）。

**拍板点已定稿（见 [plan.md](plan.md) §7）**：P1 先可观测后生效；P2 shell gate 默认组合；P3 `OPENFEEL_GUARD_CWD` 逃生阀；P4 `process.cwd()` 条件采用；v2-1/2/3（01 降级、05/06 新增、chore 纯人类通道）；v3-1~v3-7（git 与编码形态、构建产物、ttl 上限、删 `registry-last`、验证分工、可判定化、6 环与断言计数）。§7.1 已改为**已定结论**：不整目录保护 `log/**`、**单文件保护 `guard-audit.jsonl`**、**保护 `requirements/*.md`**、**定稿 chore 为纯人类通道**。验收 **27 条**（A 1-4 / B 5-17 / C 18-19 / D 20-23 / E 24-27）。
