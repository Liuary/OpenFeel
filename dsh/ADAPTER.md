# DSH 适配器

> ✅ 已实现（OpenFeel v1.3.2 / DSH 0.2.0-rc.2+；硬门禁依赖 `ctx.tools.guard`，缺失时降级为提示）。

- **安装（推荐，单包）**：`npm i -g openfeel@latest` → `openfeel setup --tools dsh`
  （写入 DSH profile 的 `link:<openfeelRoot>/dsh` 依赖与 `dsh.profile.bundles`，按需 `pnpm install`），
  然后**重启 DSH 宿主**。适配器随 `openfeel` 包分发，不需要单独发布 `openfeel-dsh`。
- **开发态**：把本目录作为 DSH bundle 装进 profile —— `package.json` 的 `dependencies` 加
  `"openfeel-dsh": "link:<repo>/dsh"`，`dsh.profile.bundles` 加 `"openfeel-dsh"`，然后
  `pnpm install`。**改代码后需重启 DSH 宿主**（Loader 按 URL 缓存 ESM 模块）。
- **安装（另一种）**：经 DSH 插件管理器 `install_bundle` 装 `link:<repo>/dsh`；`file:` 会拷贝，
  改代码后须重装。
- **落点**：`ctx.tools`（15 个 `feel_*` 工具）、`ctx.commands`（`/feel`）、
  `ctx.systemPrompt`（`<feel_mode>` 纪律段 + 每轮提醒段）。不写任何领域状态。
- **契约**：CLI 的 `--json` 出口以 [`docs/json-contract.md`](https://github.com/Liuary/OpenFeel/blob/master/docs/json-contract.md) 为**单一权威**
  （v1.6.1 起 51 个成功出口 / 52 个注册 `--json` 选项）；本适配器只消费、不重实现。
- **升级**：`npm i -g openfeel@latest` → 重启 DSH。适配器版本要求见 `package.json`
  的 `openfeel.requiresCli`（≥1.6.0；`req body` / `feel_req body` / 五个新门禁码是硬依赖）。

## 设计边界

OpenFeel 采用「核心层 + 适配器层」架构（`claude/`、`kilo/`、`.opencode/`、`dsh/`）。本适配器：

- **不拥有**领域状态：`flow.json` 的 revision 乐观并发、文件锁、相位转移表、需求 done 门、
  REV 阻塞门、版本归档判据，全部由 `openfeel` CLI 执行。
- **不镜像** Agent 编制：负责 Agent 由 `openfeel flow next --json.responsibleAgent` 权威给出；
  适配器不维护 `PHASE_AGENT_MAP` 副本。
- **不解析**中文文本：优先消费 `--json`；失败读 `error.kind` / `error.code` / `error.detail`。
- **不 shadow** 既有能力：DSH 已有的 `subagent` / `workflow` / `todo_write` 照常使用；
  `feel_next` 只给「该谁做」，实际派发交给 DSH。
- **写入门禁**（v1.3.3；v1.5.11 收窄为**三层**）：用 DSH `ctx.tools.guard()` 同步拒绝。
  - **第 1 层 · 文件工具**：`edit` / `write` / `apply_patch` / `str_replace_editor`。
  - **第 2 层 · shell**：`bash` / `pwsh`（默认受守，四类判定见下）。
  - **第 3 层 · 受保护路径**：`.openfeel/flow.json`（含 `.bak`）、`**/status.md`、`.openfeel/chore.json`、
    `dev/.preflight.json` / `dev/sessions.json` / `dev/guard-state.json` / **`dev/dispatch.jsonl`（v1.6.0 派发台账）**、`flow-archive/**`、
    `checkpoints/**`、`requirements/*.md`、`log/guard-audit.jsonl` —— **任意相位硬拒**
    （D-126-05：防 agent 手写状态/写窗口自提权），拒绝文案指向对应的人类 CLI 路径。
    `dev/dispatch.jsonl` 只能由 `feel_dispatch`（适配器进程内 fs 直写）维护；`requirements/*.md` 的提示文案指向 `feel_req action=body`。
  其余分层：
  - **bootstrap 例外**：工作区无 `.openfeel/` 时，全部目标为「新增文件」（`apply_patch` 还要求全部为
    `*** Add File:`）→ 放行并提示补账本；已存在文件、`.openfeel/**`、Update/Delete/Move 仍拒绝；
  - **doc/note 不绑相位**：`docs/**` 与 `.md/.mdx/.txt/.rst/.adoc` 在无活跃阶段或非 `exec_running`
    相位也可写；**代码目录（`src` / `test` / `scripts` / `dsh` / `bin`）内任何扩展名都不豁免**
    （`src/x.md` / `src/assets/logo.svg` 一样按源码判，D-126-06）；**混合目标从严**（任一源码 → 按源码规则）；
  - 源码（`src/**` 等）要求 `exec_running`；`dist|build|out|target|.next|node_modules|coverage|*.tsbuildinfo`
    等构建/测试产物不触发判定（保证 `npm run build` / `cargo build` / `tsc -b` 不被误杀，仍需全部目标命中）；
  - **v1.4.0 静态展示资源**：`.css/.scss/.html/.svg/.png/.jpg/.jpeg/.webp` 与 `assets/**`、`public/**` 与 doc
    同层放行（根级 `README*` / `CHANGELOG*` / `LICENSE*` 亦豁免）；豁免放行写 `.openfeel/log/guard-audit.jsonl`；
  - **v1.5.11 chore 写窗口（纯人类通道）**：窗口**上限 30 分钟**（`--ttl-min 1..30`，只能改短；越界/非整数
    直接 exit 1 且零写盘），默认只放行 doc/静态资源，**只有 `--source` 才允许源码**
    （`chore.json.source_allowed: true`；旧记录缺该字段视为未授权）。shell 门禁拒 agent 开启 chore、
    `chore.json` 又在受保护名单 ⇒ 窗口只能由人类在外部终端 `openfeel chore [--source] "<说明>"` 开启；
  - **shell 四类判定**（`bash` / `pwsh`；相对路径按 `workdir ?? guard cwd` 解析）：
    ① **硬拒**：受保护路径、`openfeel flow|stage|req|chore` 的**写**子命令（`--status` / `--end` 放行；
    引号程序名 / `node <cli 路径>` / `Start-Process openfeel` / 任何 `chore` + `--source` 同样命中）、
    以及编码/嵌套执行形态（`-EncodedCommand`、`iex`/`Invoke-Expression`、`bash -c`、`eval`、`node -e` 等）
    与 `.NET` 静态写方法（**正面判定**：`IO.File|Directory|StreamWriter|Compression.*` 等可写类型上
    方法不在只读白名单即拒 —— `WriteAllTextAsync` / `[IO.File]::Open('x','Create')` 一并命中）、
    `New-Object` 写对象、`Add-Type` 动态编译；
    ② **按目标路径判**（与文件工具共用同一 `decideForTargets`）：重定向 / `tee` / `Set-Content` / `New-Item` /
    `Copy-Item` / `Remove-Item` / `sed -i` / `rm` / `mkdir` / `robocopy` / `xcopy` /
    下载器输出（`curl -o` / `iwr -OutFile` / `wget -O`）/ `certutil -urlcache|decode` /
    格式化改写（`prettier --write`、`eslint --fix`、`gofmt -w`；**无写标志的 `prettier --check` /
    `eslint src` 判确认只读**），以及**全部 git 工作区写**
    （`checkout --`、`restore`、`reset --hard`、`stash`（含 `push`）、`clean`、`apply`、
    不在允许相位的 `commit`（`exec_running|review_passed|test_passed|archiving`）；整树写还要求 `.openfeel/**` 无未提交差异，
    `git clean` / `stash -u` 额外要求**无未跟踪文件**（`checkpoints/`、新 plan 目录），
    带 `-x` 的 `clean` 还要求**审计 `log/guard-audit.jsonl` 与 `chore.json` 不存在**
    —— 这两类文件被 .gitignore 忽略，`ls-files` 看不见，但 `clean -fdx` 会删掉；
    `git commit` 不覆盖工作区，不受这条限制）；
    ③ **产物豁免**（同上面的构建/测试产物表）；④ **无法判定** → 默认告警放行（审计 + stderr）。
    **例外（v1.5.12 / op-002 纯书账）**：无上述四相位（`exec_running` / `review_passed` /
    `test_passed` / `archiving`）时，`git commit` 仅在
    **单条、直接、无重定向/`$()`/反引号**，且 `git status --porcelain -z` 的待提交路径**全部**落在
    `.openfeel/**` 下才放行（允许原因 `git-commit-bookkeeping`，审计可查）；出现外部路径则拒并点名前
    5 条。带 `-C` / `--git-dir` / `--work-tree` 的 commit 一律拒（仓库归属无法校验）；
    **归档收尾提交（v1.5.14 / OF-04）**：上述书账窄口不命中时，若**无任何非 done 阶段**且
    （`stages` 为空集 **或** `pipeline.phase === 'done'`），同一条「单条直连 commit、无 `-C`/`-c`、
    可判定、仓库根 = 工作区」约束下，允许提交 `docs` / 源码等收尾改动（原因 `git-commit-idle`）。
    它比四相位门窄：有活跃阶段时永不生效；`plan_*` / `scheme_*` / `review_pending` / `test_pending`
    仍拒。与 `flow advance --to done` 的自动提交分工：自动提交可能已包含这些改动，先看
    `git status` 再决定是否需要 `git-commit-idle` 这一次提交；
  - **默认 fail-closed（op-005）**：**无法确认「这条命令不写」就落第 4 类**，不再把未识别命令
    当作 `no-write` 静默放行。审计的 `kind` 因此能区分 `none`（确认只读）与 `undecidable`。
    「确认只读」需要正面证据：命中只读白名单、已知构建/测试工具（`npx vitest` / `npm run build` /
    `cargo build` / `tsc -b` 仍放行），否则一律第 4 类 —— 包括 `npx <任意>`、`node <脚本>`、
    `python <脚本>`、不可解析的 `& $var`、`$()`/反引号命令替换；
  - **第 4 类的书面口径**：默认 `warn`（审计 + stderr），要更严就设 `OPENFEEL_SHELL_GATE=strict`。
    **白名单（v1.5.14 / OF-05）**：`OPENFEEL_SHELL_ALLOW` 用 `||` 分隔**整条命令**（折叠空白后全等匹配，禁止子串），命中的第 4 类命令按 `shell-allowlisted` 放行（`strict` 下同样生效）；第 1/2 类 deny 永不接受白名单。
    **已知敞口**：第 4 类默认放行意味着「蓄意用未识别写法」仍能写盘（只是留痕）——
    典型是 `node <脚本>`、`npx <任意>`、`$()`/反引号里再嵌一层不透明执行；
    门禁的目标是让**默认路径**不静默 —— 需要硬保证时把宿主设成 `strict`（第 4 类也拒）；
  - **`OPENFEEL_SHELL_GATE` 三档**（缺省 = 「1/2 类拒 + 4 类告警」组合，不是单一开关）：`strict` 第 4 类也拒；
    `warn` 第 1/2/4 类全部降级为告警放行；`off` shell 完全不解析。**只影响 shell 分支**，文件工具不受影响；
    `warn`/`off` 的降级事实写进 `guard-state.json.shellGate` 与审计，可反查；
  - **cwd 解析六环**（fail-closed）：① `OPENFEEL_GUARD_CWD`（env，**最高优先逃生阀**，非空即生效）→
    ② `agent.session.header.cwd` → ③ `config.cwd`（`cordis.patch.yml` 的 `cwd:`）→ ④ 会话登记表 `[sessionId]` →
    ⑤ `process.cwd()`（**仅当该目录本身含 `.openfeel/`**）→ ⑥ 全部失败 → 拒绝。已删除 `registry-last`
    （进程级单标量，多项目会「按别的项目放行」）；非 `agent-session` 来源 stderr 告警 + `feel_status.guard.degraded=true`；
  - `enforce=always`（默认）对非 OpenFeel 工作区也拦截，可用 `project` / `off` opt-out。
- **审查归属**（v1.3.3 / v1.3.4）：REV 可挂 op（`stageId.op-xxx`）或挂 stage（`op = stageId`，无 op 的 fast 场景）；
  `feel_flow action=review_add` 的 `op` / `stage` 二选一透传（v1.3.4，两者皆无 → `FEEL_BAD_USAGE`）；
  stage 级 REV 参与 blocking 门，但**不参与** `flow attempt` / `flow retry`。
- **宿主加载指纹**（v1.3.4）：`apply()` 启动时把适配器 `lib/` 指纹写入
  `~/.openfeel/adapter-host-dsh.json`（`OPENFEEL_ADAPTER_HOST_PATH` 可覆盖，测试用）；
  CLI `setup --check` 据此区分「文件旧」与「文件已新但宿主未重启」。
- **门禁可见性**（v1.5.11 / D-126-04；v1.5.12 / stage-127 身份自证）：注册 guard 时写
  `.openfeel/dev/guard-state.json`（`registered` / `enforce` / `shellGate` / `cwd` / `cwdSource` /
  `degraded` / `resolvedAt` / `hostStartedAt` / `loaded_hash` / `pid`），每次放行/拒绝更新 `lastDecision`；
  `feel_status` / `feel_next` 返回 `guard` 段（compact 档也带）。
  **身份三键只来自当前进程**（`setGuardRuntimeIdentity` 在 `apply()` 写完 marker 后登记）或显式 patch，
  **旧工作区文件里的身份一律剥离、绝不继承**（重启后不再因旧 `hostStartedAt` 恒 `stale`）。
  **stale 只认 `pid` + `loaded_hash`**：`pid` 缺失/不符、`loaded_hash` 缺失（`loaded-hash-missing`）、
  或双方非空的 `loaded_hash` 不符 → `guard.stale=true`
  并让 summary 明说「门禁来自旧进程/旧适配器」，同时 `workflowGate.required=true`（**不拒写**，见 §F.0 决策）。
  `guard.hostStartedAt` 是**诊断字段**：`stale:false` 时它仍可能是 state 里的旧值（不改 `guard` 段键形状，
  避免动 `deepEqual` 契约）；时间比较在多 profile/多宿主下必然误报，故不参与判定。
  **HMAC**（进程内密钥，不落盘）跨进程必然失配，因此只降级为可见信号：`guard.signature='valid'|'mismatch'`；
  `pid`/`loaded_hash` 都通过而验签失败时加 `guard.hmacWarn=true`（不置 stale、不进 `workflowGate`、不进 summary 门禁）。
  残留敞口：伪造只影响显示；跨进程识别由 `pid` 覆盖，代码版本由 `loaded_hash` 覆盖。
  cwd 解析失败时不静默丢弃：状态与审计固定落 `os.tmpdir()/openfeel-guard/`（`cwd:null`、`cwdSource:'unresolved'`；
  `OPENFEEL_GUARD_DIR` 可覆盖，测试隔离用），`feel_status` 在工作区文件缺失时也读该全局文件并标 `degraded=true`。
- **门禁自愈**（v1.5.12 / stage-127；op-005 加固）：官方修复路径**不需要删除** `.openfeel/dev/guard-state.json`。
  - **自动**：重启后**首次任意 `feel_*`** 即尝试修复（`target()` 公共入口，best-effort，异常绝不阻断）。
    **只对「`pid` 缺失 / `pid` 已死（`ESRCH`）」自动修**：活着的异 pid（含 `EPERM`）跳过（两个活宿主共享
    同一工程会互相覆盖）；**同 pid 的 `loaded_hash` 失配绝不自动修**——那是「适配器已更新但宿主没重启」的
    信号，必须在展示前保留（`stale` 保持），交由完全重启或显式入口。marker 不完整（缺 `started_at` /
    空 `loaded_hash`）时自动修也会以 `marker-incomplete` 拒绝且零写盘。
    同一 root 60s 节流（**检查成功后才记时间**，异常不占窗口；节流表上限 64，LRU）；
    marker 按 `{path, mtimeMs, size}` 缓存；单次自动检查 3~4 次同步小 JSON 读
    （state 1 + marker 0~1 + 修复写盘内部 `writeGuardState` 的 global/workspace 2）；自动 `guard_repair`
    审计每宿主启动至多 1 条（**取舍**：多 root 时只第一条自动修复进审计，其余只写 state；要逐 root 追溯用显式入口）。
  - **显式**：`feel_verify action=health fix=true`（`dry_run` 不写盘）→ 结果在 `data.health.guardRepair`，
    summary 明示成功/失败；marker 缺失报 `marker-missing`、marker 不完整报 `marker-incomplete`，均**零写盘**。
    身份**只来自 marker + 当前宿主 `process.pid`**，不接受任何工具参数（agent 无法注入 pid/loaded_hash）。
  - **逃生阀**：`OPENFEEL_GUARD_SELF_HEAL=off` 关闭自动自愈（显式入口仍可用）。
  - **审计**：修复追加 `.openfeel/log/guard-audit.jsonl`（`event:'guard_repair'`，含 old/new；幂等时不写）。
    该文件本身是受保护路径（工具写被 guard 拒），而 repair 走适配器进程内 `fs` 直写、不经 guard，故无自锁。
  - **多宿主同工程时不要用显式修复**（会把 state 归到当前宿主）；自动自愈在活 pid 场景已自动跳过。
- **测试隔离 env（非安全边界）**：`OPENFEEL_GUARD_DIR`（覆盖全局 guard 目录，状态+审计一起隔离）与
  `OPENFEEL_ADAPTER_HOST_PATH`（沿用，覆盖宿主 marker 路径）应在宿主启动前设置；
  `dsh/test/{guard,verify,contract,integration}.js` 各自指向 `mkdtempSync` 临时目录，并断言真实状态未被改写。
  该断言按**逐文件内容**比对（name + size + mtime + sha256）：内容变 → FAIL；仅新增/删除文件或
  `started_at` 变 → `skip: host-active`；全不变 → PASS。`dsh/test/guard-isolation.js` 自带这三条自测。
- **生效条件（重要）**：门禁在 `apply()` 时注册，**部署/更新后必须完全重启 DSH 宿主**才生效
  （重启会话不够，Loader 按 URL 缓存 ESM 模块）；重启后首条判定即写 `guard-state.json`，
  可用 `feel_status.guard` 核对 `registered` / `cwdSource` / `stale`（`stale` 由 pid/loaded_hash 判定，可自愈）。
- **命令执行推荐**（v1.3.5）：系统提示段新增「Windows：优先 `bash`（Git Bash），其次 `pwsh`（PowerShell 7）；macOS/Linux 用 `bash`；默认不用 `cmd.exe`」；同一任务保持同一 shell。
- **状态与记录**（v1.5.0；v1.6.0 收口）：只有 Feel 写状态；子 agent 不读不写 `dev_last*` / `current.md` / `status.md` / `flow.json`；日志不强制；`feel_next` / `feel_status` 暴露 `statusSync.due`（30 分钟）。**同步入口是 `feel_dev action=sync`（工具），不是 shell**——`/feel` 与提示段都不再让 agent 跑 `openfeel dev sync`（写命令经 shell 会被门禁拒）；`stage set` / `req advance|complete|review|verify|body` / `flow advance` 成功出口已自动同步（v1.6.0 / REQ-059），`due` 通常已为 `false`。
- **流程入口闸**（v1.5.2）：`feel_status` / `feel_next` 在无活跃阶段时返回 `workflowGate`；无阶段写 `docs/research/**` 被拒（chore 不能绕过；拒绝写 `guard-audit.jsonl`，`event=guard_deny`）。
- **派发/恢复**（v1.5.3）：`feel_next.dispatch`（goal/context/boundaries/returnFormat；子 agent 禁读状态文件、返回 ≤10 行）；`feel_status.recovery`（lastTransition / handoff / nextAction）。
- **快照/空转**（v1.5.4）：`feel_status` / `feel_next` 返回 `revision` / `snapshotAt` / `stale`；`plan_pending` 停留 >10 分钟提示空转。
- **preflight**（v1.5.5）：CLI 执行器默认 `OPENFEEL_PREFLIGHT=strict`；`feel_status` / `feel_next` 返回 `preflight`；写命令要求窗口内读过状态。**窗口可配（v1.5.14 / OF-03）**：`OPENFEEL_PREFLIGHT_MAX_AGE_MS`（毫秒，正整数，缺省 10 分钟）同时作用于 CLI 闸门、`flow health` 与适配器视图；适配器写命令前若本地账本缺失/过期，会先真实执行一次 `flow next --json` 自愈（仅一次、失败不阻断，CLI 闸门仍是唯一权威）。
- **观测摘要**（v1.5.6）：`feel_status` / `feel_next` 返回 `observability`（`stale` + `preflightAgeMs`/`preflightOk` 复制副本 + `statusSync` 三键 + 摘要）；`preflightAgeMs`/`preflightOk` **只复制不重算**（权威仍是顶层 `preflight`）。**账本先于 snapshot 读取**（`readPreflightInfo` 早于 `readSnapshot`）——`flow status --json` / `flow next --json` 会在 `--json` 早返回前写账本，读晚了会把本次调用刚写的账本当历史（`age≈0`），指标在测自己。读取次数不变、零新增 I/O。
- **`feel_status` 输出瘦身**（v1.5.7）：默认返回 **compact** 快照（`project` / `pipeline` / `focus` / `mode` 的 current+source+skippedPhases / `stages` / `statusSync` / `workflowGate` / `preflight` / `recovery` 的 lastTransition+nextAction+hasDevLast / `revision`+`snapshotAt`+`stale`），去掉了 `mode.transitionsByMode`（三份转移表）、`recovery.handoff`（交接全文）、`observability`（与顶层字段重复的副本）。需要完整快照时传 `detail: "full"`；转移表/模式来源可随时用 `feel_flow action=phases` / `action=mode` 现取。`with_requirements` 语义不变（compact 档同样只在显式请求时带 `requirements`）。
- **需求导向**（v1.5.7）：阶段 = 版本容器，长期保持 `exec_running`、容纳多个需求；提示段 / `workflowGate` / 写入门禁文案统一为「无开启阶段 → 默认按当前小版本开阶段；不要每完成一个需求就推进/关闭阶段；归档/发布只在用户确认后」。需求完成门同时解耦（零关联可显式完成；关联阶段进入 `exec_running` 及之后即可完成）。
- **多会话收束 P0**（v1.5.8 / REQ-029）：`feel_status` / `feel_next` 末位追加 `sessions`（`[{id, cwd, lastSeen, stage}]`，读 `.openfeel/dev/sessions.json`；文件缺失 → `[]`）；**每次 `feel_*` 执行**都 upsert 一条本会话心跳（读写失败静默、不阻断主流程）。该文件是运行时状态（`.gitignore` 忽略），与 CLI 侧 `src/core/dev/sessions.ts` **同一格式**（`{ schemaVersion: 1, sessions }`）；CLI 的 `autoCommitOnDone` 据此在检测到其它存活会话时跳过自动提交。
- **完成必审验**（v1.5.8 / REQ-027）：`feel_req` 新增 `action=review`（`result`/`by`/`note`/`independent`）与 `action=verify`（`result`/`kind`/`by`/`note`/`evidence`），`feel_stage` 新增 `action=verify`（仅 archiving 相位）；需求 `done` 门要求 review + verification 均 `pass`，阶段 `archiving → done` 要求阶段验证 `pass` 且关联需求全部 `done`（`--force` 不绕过）。review 缺省按**自我审查**处理并显式传 `--self`（归档摘要标注 `self-review`）。
- **需求随版本归档 + 发布门**（v1.5.8 / REQ-030）：归档前先 `feel_req action=release-check`（只读，恒 exit 0）；该版本仍有未完成需求时缺省拒绝归档，先 `feel_req action=rollover`（`from`/`to`/`id`|`all`）顺延，或 `feel_archive action=create` 显式 `allow_unfinished=true`。归档会把该版本**终态**需求移入归档文件；`feel_req action=list` 传 `include_archived=true` 合并查看，`action=show` 对已归档需求回退读归档文件（`archived: true`）。需求 ID 由 `flow.json.meta.last_req_seq` 单调分配，归档后不复用。

## v1.6.0：派发台账、提示词预算与每轮提醒

### 工具面（15 个，v1.6.0 新增 2 个）

| 工具 | 覆盖的 CLI | 能力域 |
|---|---|---|
| `feel_dispatch` | 无 CLI（适配器进程内直写 `.openfeel/dev/dispatch.jsonl`） | **派发台账**：`{stage, phase, targetAgent, role, goal, files, returnFormat, taskId?}` → 追加一行 JSONL 并返回 `dispatchId`；同 `leadSessionId + taskId + goal` 在 5 分钟内去重；24h / 上限 200 行清理 |
| `feel_dev` | `dev sync`（`cli.write`）/ `dev status`（文本 + 读 `.sync.json`） | **开发账本**：`action=sync|status`；返回 `{ok, lastSync, due, changed, wrote}` |

其余 13 个见 [`README.md`](README.md) 的工具表；`feel_req` 另新增 `action=body`（`cli.write(['req','body',...])`，走 T2 的正文写入口）。

### 提示词预算（`lib/surface/prompt.js`，v1.6.0 / T10）

| 语言 | enabled | disabled（含 Free Mode 附录） | 判据 |
|---|---|---|---|
| `zh-CN` | **720 字符 / 14 行** | **837 字符 / 17 行** | ≤1200 字符 且 ≤25 行 |
| `en` | **1027 字符 / 13 行** | **1143 字符 / 16 行** | 同上 |

正文常量 `FEEL_BODY_ZH` / `FEEL_BODY_EN` 是单一源：`src/core/template-loader.ts` 与 claude/opencode 四份 `feel.md` 用 `<!-- feel-prompt-parity:begin/end -->` 包住同一段文本，`test/cli/feel-prompt-parity.test.ts` 断言 5 处 sha256 一致（防副本分叉）。

### 每轮提醒：首选档不可用 → 降级 1（已落地）

| 档位 | 机制 | 结论 |
|---|---|---|
| 首选 | `ctx.tools.post-execute` → `additionalContexts` | **不可用**：`additionalContexts` 需 `UserMessage`（`createUserMessage` 来自 `@deepseek-ai/dsh-llm`），适配器零运行时依赖、profile 是 `link:`，`realpath` 上溯解析不到该包（`MODULE_NOT_FOUND`）。`post-execute` 仍注册为**只观察**（记步数 / 判断写类工具），不改结果 |
| **降级 1（采用）** | `ctx.systemPrompt.context({name:'openfeel-feel-next', order: FEEL_PROMPT_ORDER+5, text})` | 每次装配求值的函数；**写类工具之后**或**每 5 步**注入一行 `阶段 <stage> / <phase>｜下一步：subagent(goal=…)`，其余请求返回空串（零 token 开销） |
| 降级 2 | 只在 `feel_*` 返回体加 `nextLine` | 未采用（覆盖率低） |

spike 原始证据（含 upgrade 条件）见 `.openfeel/tmp/stage-132/spike.md`；两处注册都以 `typeof … === 'function'` 守卫，宿主不支持时静默降级为无提醒。

### 派发台账 schema（`.openfeel/dev/dispatch.jsonl`）

每行一条 UTF-8 / LF JSON（读侧跳过畸形行；文件不存在视同空）：

```json
{"dispatchId":"d-0001","ts":"2026-11-24T04:31:52.000Z","leadSessionId":"<session.id>","origin":"root","stage":"v1.6.0-stage-132","phase":"exec_running","targetAgent":"executor-a-cli","role":"executor","taskId":"T5","goal":"<一句话任务，含验收命令>","files":["src/core/plan/path.ts"],"returnFormat":"≤10 行：结论/改动文件/验证/阻塞","dispatchDepth":1}
```

- **写入者唯一**：适配器 `lib/adapters/dispatch-ledger.js`（原子 temp + rename，仿 `sessions.js`）；该文件在 `PROTECTED_OPENFEEL_PATHS` 内，agent 工具直写 → `deny`。
- **`origin` / `dispatchDepth`**：按 schema 保留缺省 `root` / `1`；**从宿主会话头读取的路径未在真实宿主验证**（spike T9 遗留），因此不构成实测证据，也不据此改审计 schema 版本。
- **`feel_status.dispatch`** = `{required, records, missingRoles}`：`required` 恒 `true`（**提示级，不做硬拦**，用户裁定②）；`records` = 24h 内行数；`missingRoles` = 本快照应有但台账缺的 agent 角色。`feel_status` / `feel_next` 另给动作型 `nextAction`（`{kind:'dispatch'|'command'|'idle', tool, goal, prompt, reason}`），`next` 字符串键保留以不破坏既有断言。

## v1.6.1：派发闭环、遵守率、guard wrapper 与文档白名单

> 基线：CLI `1.6.1`（`openfeel.requiresCli >=1.6.1`）；工具面**仍 15 个**（新增的是 action，不是工具）。

### 工具面增量（15 个，计数不变）

| 工具 | v1.6.1 增量 |
|---|---|
| `feel_dispatch` | **`action=finish`**：按 `dispatchId` **原地补写** `closing{status:'done'\|'failed', artifacts[], durationMs, summary}` + 行顶层 `closedAt`；行数 / 行序 / 其余行字节不变；重复 finish 内容相同 → `ok:true, changed:false`（`ts` / `closing` / `closedAt` 不二次改写）；未知 id → 报错。`durationMs` 缺省 = `now - Date.parse(ts)`（非负整数，解析失败 → 0）。 |
| `feel_status` | `dispatch` 汇总升到 **7 键**：`{required, total, sincePhase, open[], closedRatio, missingRoles, records[]}`（旧四键保留）。`open[]` = 当前 `stage` 范围内无 `closing` 或 `closing.status!=='done'` 的派发；`closedRatio` = `closing.status==='done'` 条数 / `total`（`total===0` → `null`，不出现 NaN）；`missingRoles` **改按 `closing.status==='done'`** 判定（旧「有 record 即算」作废）；`records[]` 透出 `closing` / `closedAt`。 |
| `feel_verify` | **`action=adherence`**：调 `openfeel lint adherence --json`（CLI 出口 #51），返回四指标 `{main_write_ratio, subagent_per_req, sync_gap, violation_rate}`，每键 `{value, definition}`；样本不足 → `value:null` 且不抛错。**不新增工具、不新增 `openfeel verify` 顶层命令**。 |
| `feel_req` | `action=body`（v1.6.0 起；v1.6.1 起 `text` **走 `os.tmpdir()` 临时文件 + `--file`**，argv 零 `--text`，`finally` 清理）；`action=add` 可带 `plan` 参数写正文 `## 初步规划` 小节。**已知缺口**：适配器当前没有 `action=plan`，也没有 `body --from` 透传——需求级计划请用 `openfeel req plan <id> [--force]`（CLI 出口 #50），多节导入请用 `openfeel req body <id> --from <md>`。 |

### 派发台账 schema v2（`.openfeel/dev/dispatch.jsonl`）

v1.6.0 的 13 键（`dispatchId,ts,leadSessionId,origin,stage,phase,targetAgent,role,taskId,goal,files,returnFormat,dispatchDepth`）**零改动**；v1.6.1 只在闭环后追加两个**可选**字段（旧行缺省即未闭环）：

```json
{"dispatchId":"d-0001","ts":"…","leadSessionId":"<session.id>","origin":"root","stage":"v1.7.0-stage-133","phase":"exec_running","targetAgent":"executor-a","role":"executor","taskId":"E13","goal":"…","files":["docs/commands.md"],"returnFormat":"≤10 行","dispatchDepth":1,"closing":{"status":"done","artifacts":["docs/commands.md"],"durationMs":123456,"summary":"文档对账完成"},"closedAt":"2026-11-25T02:00:00.000Z"}
```

- `closing` **恰 4 键固定序**：`status` / `artifacts` / `durationMs` / `summary`；`closedAt` 是**行顶层**字段（不塞进 `closing`）。
- 兼容：读侧跳过畸形行，缺 `closing` 视为未闭环；`summarizeDispatch` 输出 `closing:null` / `closedAt:null`。
- 写入者唯一（适配器进程直接 fs，temp+rename）；文件在 `PROTECTED_OPENFEEL_PATHS` 内，工具直写 → `deny`。

### 遵守率四指标（`feel_verify action=adherence`）

| 指标 | 分子 / 分母 | 样本窗口 |
|---|---|---|
| `main_write_ratio` | `origin=root` 的写调用 /（root + 子 Agent 派生 `subagent\|delegated` + `origin` 缺失计 unknown） | `.openfeel/log/guard-audit.jsonl` 全量 |
| `subagent_per_req` | `role=executor` 且 `closing.status='done'` 的派发数 / `status='in_progress'` 的需求数 | 台账 24h / 200 行 + 当前 `flow.json` |
| `sync_gap` | 现在 − `.openfeel/dev/.sync.json` 的 `last_sync`（毫秒 ÷ 60000，取整分钟；缺失/不可解析 → null） | 最近一次同步时刻（单点，无平均） |
| `violation_rate` | `decision='deny'` 条数 / 全部 guard 决策（`allow\|deny\|warn`） | `guard-audit.jsonl` 全量 |

> 口径单点在 `src/core/adherence.ts`；`value` 为 number 或 `null`，**绝不 NaN / Infinity**；**只读观测、恒 exit 0**（低遵守率不是门禁、不产生 deny）。

### guard wrapper 静态分类（REQ-067）

`bash` / `pwsh` 命令文本里的 wrapper 会**读脚本内容**（`MAX_SCRIPT_BYTES = 64KB`，超限不做部分读取）后按**同一套** `classifyShellCommand` 递归分类（`WRAPPER_MAX_DEPTH = 4`，触顶即不可判定）：

- **解析面**（v1.6.1 实测，四种 + 内联）：`pwsh|powershell -File|-f <脚本>` 与同 token 的 `-File:<脚本>`；`pwsh|powershell <脚本>`（**位置参数**，中间开关值如 `-ExecutionPolicy Bypass` 不丢载体）；`cmd [/d|/q|/e:on 等前置开关] [/c|/k] <脚本>`（前置开关不吃掉载体，`/c:x.cmd` 同 token 也认）；`bash|sh|zsh|dash|fish|ksh <脚本>`（第一个非旗标参数；`-c` 走内联递归）；`source <脚本>` / `. <脚本>`（**只在命令位**识别，避免 `rg source x.sh` 误判；只认已知脚本扩展名）；`node <脚本>` 见下条。
- 命中 openfeel 写动词 → class 1 `deny`；可解析出受保护 / 源码目标 → class 2 `deny`；内容确认只读（`readonly.ps1` / `build.ps1` / 只读 `node -e`）→ `allow`，**不写 deny 审计**（不误杀）。
- **`.cmd` / `.bat` 用 cmd 语义**（不拿 PowerShell 表硬套）：`copy` / `move` **只算目标**（源只读，否则误杀 `copy src\a.ts dist\`）、`xcopy` / `robocopy` 第二个位置参数是目标、`del` / `erase` / `ren` / `rename` / `rd` / `rmdir` / `rm` **全部位置参数都算写**；`>` / `>>` 重定向统一按写处理。
- **`node` 默认不读内容** → `undecidable`（`node test/guard.js` 正文里本来就有 openfeel 字面量，读内容会误杀）；只有脚本路径落在 `scripts/**`、或文件名含 `release` / `publish` / `commit` 时才读内容分类，且这类高风险脚本**内容不可判定时按 class 1 拒绝**（发布/提交类脚本要求人类在外部终端执行）；内联 `node -e` / `bash -c` 仍走原递归。
- 编码：只接受 **UTF-8（含 BOM，严格校验）** 与 **UTF-16（BOM 或 NUL 启发式）**；**GBK 等双字节编码刻意不解码**（解错会给出假安全）→ 一律 `undecidable`。
- 不可判定（不存在 / 非文件 / 超限 / 编码不明 / `node` 默认不读）→ 第 4 类 `SHELL_GATE_UNDECIDABLE = warn`，**必须写审计**：`event:'guard_deny'` 之外的不可判定行带 `kind:'undecidable'` + `detail:{wrapper, scriptPath, class:'undecidable', reason}`；命中 1/2 类时 `detail.class` 为 `class1`/`class2`、`reason:'wrapper-write'`。`strict` 档下不可判定改为 `deny`。
- **仍存绕过面（如实记录，未封）**：
  - `python <脚本>` / `deno run` / `bun <脚本>` 等解释器**不读脚本内容**，只落 `undecidable`（默认 `warn` 放行；只有 `strict` 才拒）——经它们真写文件时默认只留告警；
  - `bash < x.sh`（stdin 重定向）没有位置参数载体，内容不被读取（实测落 `undecidable`，`scriptPath` 记为 `<`）；
  - PowerShell 调用符 `& ./x.ps1` 与 `if` / `foreach` / `{}` 等**控制流块**不在解析面内（落 `undecidable`，块内写命令不被分类）；
  - GBK 等双字节编码的 `.cmd` / `.ps1` 按设计不解码（`undecidable`，`strict` 拒）；
  - 变量拼接 / 运行时生成的动态命令同样只能到 `undecidable`。

### 文档 / 夹具写白名单相位（REQ-062）

`DOC_WRITE_PHASES = ['review_passed', 'test_passed']`（`exec_running` 本就放行，不在名单内）：

- **放行**：`docs/**`、工作区根级 `*.md`（`README.md` / `CHANGELOG.md` 等）、`test/fixtures/**`、`dsh/test/fixtures/**`；审计 `reason:'doc-asset-phase'`。
- **仍拒**：`src/**`（含 `src/*.md` / `*.svg`）、`test/core/**` / `test/commands/**`（夹具 ≠ 测试代码）、以及所有受保护路径。
- 判定发生在**相位层**（`dsh/lib/guard.js` 的命令分类 / 相位判定区）；`CODE_DIRECTORIES` / `isCodeDirectoryPath` / `isExemptPath` **未改**，豁免不扩散到源码树。

## 目录

| 路径 | 内容 |
|---|---|
| `lib/guard.js` | 写入门禁：三层（文件工具 / shell 四类 / 受保护路径）、`enforce`、bootstrap 新增放行、doc/asset 分层、apply_patch 目标解析、cwd 六环 fail-closed |
| `lib/adapters/guard-state.js` | 门禁自证：`.openfeel/dev/guard-state.json`（注册态 + `lastDecision`）与 cwd 失败时的全局落点 |
| `lib/adapters/session-cwd-registry.js` | 会话 cwd 登记表（只按 `sessionId`，**无 `lastCwd`** 进程级兜底） |
| [`ACTION-GUIDE.md`](ACTION-GUIDE.md) | **给 OpenFeel 本体的操作指南**：剩余 5 项待办、验收标准、边界约定 |
| `lib/index.js` | 插件入口（`name` / `inject` / `apply` / `normalizeConfig`） |
| `lib/adapters/cli.js` | CLI 执行器：可执行文件解析、UTF-8/无色/无日志、退出码与 envelope 语义 |
| `lib/adapters/workspace.js` | 会话工作区 → OpenFeel 项目根 |
| `lib/adapters/dashboard.js` | 状态快照（消费 `flow next --json`）+ 「下一步」决策 |
| `lib/adapters/dispatch-ledger.js` | 派发台账（`.openfeel/dev/dispatch.jsonl` 读写 / 去重 / prune，v1.6.0） |
| `lib/adapters/next-action.js` | 动作型 `nextAction` 纯函数 + 每轮提醒状态（v1.6.0 / REQ-060） |
| `lib/adapters/host-state.js` | 宿主启动标记：适配器 `lib/` 指纹写入 `~/.openfeel/adapter-host-dsh.json`（v1.3.4） |
| `lib/tools/index.js` | **15** 个工具与 CLI argv 翻译 |
| `lib/tools/shared.js` | 输出封装、参数编译、渲染 |
| `lib/surface/command.js` | `/feel` 人类命令 |
| `lib/surface/prompt.js` | `<feel_mode>` 系统提示段（v1.6.0 压到 ≤1200 字符 / ≤25 行） |
| `test/` | 契约 / 行为 / 门禁 / 真实注册表 四套验证（断言数随版本增长，以 `dsh/test/*` 实测输出为准） |
| `docs/compat/` | OpenFeel v1.2.1 逆向兼容性契约（6 份；仅供回归参照，权威以 [docs/json-contract.md](https://github.com/Liuary/OpenFeel/blob/master/docs/json-contract.md) 为准） |

## 验证

```bash
cd dsh
node test/contract.js      # 53 — DSH schema 契约（真实 assertSupportedJsonSchema；v1.6.0 实测）
node test/verify.js        # 129 — 行为（真实 CLI + 真实 .openfeel 副本；v1.6.0 实测）
node test/guard.js         # 180 — 写入门禁（fake ToolExecution + 临时工作区；v1.6.0 实测）
node test/integration.js   # 10 — 真实 cordis + 真实 ToolRuntime 挂载（取不到 tools 服务时跳过，exit 0）
```

## 发布说明

v1.3.0 起，本目录的运行文件（`lib/`、`cordis.patch.yml`、`package.json`、`README.md`、
`ADAPTER.md`、`docs/`）**已包含**在根 `openfeel` 的 `package.json` `files` 内，随
`npm publish openfeel` 分发；不单独发布 `openfeel-dsh` 包。仍不包含 `dsh/test/`。
对 `tsc`（`src/**/*.ts`）、`vitest`（`test/**/*.test.ts`）、`build.js`
（`src/core/templates-data/**`）均无影响。

详细说明见 [README.md](README.md)。
