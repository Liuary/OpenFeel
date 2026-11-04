# v1.5.11-stage-126 实现计划 — 写入门禁「判定面太窄 + 有零守卫绕过面」修复（fast）

- 阶段：`v1.5.11-stage-126`　需求：`REQ-019`　模式：**fast**
- 产物：本计划（plan.md）+ overview.md 的目标/操作方案两节
- 本阶段**不改任何** `src/**`、`dsh/**`、测试、文档；实现由后续 op 执行
- **v2 修订**：第一轮根因判断（「cwd 解析失败 → 静默放行」）**已推翻**，见 §1.1。根因改为「shell 零守卫 + 豁免过宽 + `.openfeel/**` 内部可自提权」；cwd/fail-closed 降级为防御纵深。新增 D-126-05 / D-126-06 两条真实漏洞修复。

---

## 1. 背景与根因（实测结论，不再重新论证）

用户反馈「DSH 经常跳过 OpenFeel 流程」。实测后确认：写入门禁**在跑**，但**判定面太窄**，且有一个**完全没守**的绕过面 —— 事实上等于没守。

### 1.1 第一次误判（必须留档，防止重演）

第一轮探针用的是 `src/_guardprobe.txt`，在 `review_pending` 下 `write` **成功**，由此得出「cwd 解析失败 → 静默放行」的结论。**该结论是错的**。审计日志给出铁证（`.openfeel/log/guard-audit.jsonl`）：

```json
{"event":"guard_allow","tool":"write","reason":"doc-asset","paths":["...\\src\\_guardprobe2.txt"]}
```

即：guard **正常执行了**、cwd 解析**成功**、走了 doc/asset 豁免分支。换成 `.ts` 立刻被拒：

> `OpenFeel 写入门禁：活跃阶段当前不在 exec_running（…=review_pending, …=plan_review），不能修改源码/文档。`

**两条教训（写进实现与文档）**：

1. **验证门禁必须用源码扩展名**（`.ts`/`.js`/`.py`…）。`src/*.txt` 命中 `DOC_EXTENSIONS`（`guard.js:44`），探针本身不构成源码探针，会得到假绿。
2. 看到「放行」不能只判定「guard 没跑」——先读 `guard-audit.jsonl` 的 `reason` 字段：`doc-asset` / `chore` / `bootstrap` / `general` 都代表**跑了但被豁免**。这也是 D-126-04 要落盘 `lastDecision` 的原因。

### 1.2 根因排序（按真实可利用率，主次分明）

| 序 | 根因 | 位置 | 为什么它更危险 |
|---|---|---|---|
| **A** | **shell（`bash`/`pwsh`）完全不在守卫面内** | `guard.js:23-28` `DEFAULT_MUTATING_TOOLS` | 不是「判定宽」，是**零判定**：`Set-Content src/x.ts`、`> src/x.ts`、`openfeel flow advance` 全部直通。`ADAPTER.md:38` 与 `cordis.patch.yml:39-40` 还把它写成「显式逃生通道」，等于书面授权 |
| **B** | **doc/asset 豁免过宽**（`isExemptPath`） | `guard.js:73-79` / `:118-125` / `:128-130` | 任何目录下的 `.md/.txt/.css/.html/.svg/.png/.jpg/.jpeg/.webp` 都豁免 ⇒ `src/x.md`、`src/x.css`、`src/assets/*` 在无 `exec_running` 时照样可写。**这正是 §1.1 误判的直接来源** |
| **C** | **`.openfeel/**` 内部只有 2 个受保护文件（自提权）** | `guard.js:490-491` `if (allInternal) return undefined;` + `isProtectedPath`(L222-226) | agent 可手写状态文件自提权：写 `.openfeel/chore.json`（未来 `expires_at`）→ 立刻拿到源码写窗口，**根本不用运行 `chore`**；写 `.openfeel/dev/.preflight.json` → 伪造「10 分钟内读过状态」直接过所有写命令的 preflight 门 |
| **D** | chore 的 60 分钟任意写窗口（含 `src/**`） | `chore.ts:120-136`；`guard.js:517-524` | 配合 C 可被凭空开启；单独看也是「合法外观的宽窗口」 |
| **E（防御纵深，非本因）** | cwd 解析失败时 `return undefined` 静默放行 | `guard.js:409-417`（`fallbackCwd` 来自未配置的 `config.cwd`，`:398`） | 当前实测**没有**触发。但这是一颗哑弹：宿主升级把 `agent.session.header.cwd` 拿掉时门禁会**无声消失**且无任何信号 |

**定位调整（重要）**：**D-126-01（cwd 链 + fail-closed）不作为主线**，改写为「防御纵深 + 可观测」——目标是「即使 cwd 拿不到也绝不静默放行，且第一时间看得见」。本次现象的主因是 **A + B + C**。

### 1.3 三条真实利用链（验收要逐条打掉）

1. **shell 直写**：`pwsh` → `Set-Content src/x.ts` → 无视相位。修：**D-126-02**（头号绕过面）。
2. **手写 chore.json 自提权**：`write .openfeel/chore.json`（`expires_at` 填未来）→ 下一步 `write src/x.ts` 被 `chore` 分支放行。修：**D-126-05**。协同：05 生效后 chore 窗口**无法再被手写伪造**；而 02 又会拒掉 agent 用 shell 起 `openfeel chore`（见 D-126-03）⇒ **chore 变成纯人类通道**，这正是它该有的形态。
3. **豁免借道**：`write src/x.md` / `src/x.css` 在无 `exec_running` 时成功。修：**D-126-06**（先判代码目录，再判扩展名）。

### 1.4 已核实的实现事实（本计划的事实基线，实现不得与此冲突）

| # | 断言 | 证据 |
|---|---|---|
| F1 | guard 回调拿到的 `execution` 形状 = `{ token, callId, rootCallId, name, signal, agent?, parent?, schema?, deferContext(), concludeTurn(), arguments }` | `dsh-tools/lib/index.js:3228-3301`；`prepareExecution` 在 `:3338` 以该对象调 `this.guardReason(exec)` |
| F2 | **没有** 顶层 `execution.cwd`，**没有** 顶层 `execution.session`；`agent` 只在 `exec.agent !== undefined` 时才注入（`:3246`） | 同上 |
| F3 | `agent.session` 真实存在；`session.header.cwd` **是可选的** | `dsh-agent/lib/index.js:515`；`dsh-session/lib/index.js:1197` |
| F4 | 文件写工具真实名：`write`（`file_path`+`content`）、`edit`（`file_path`+`old_string`+`new_string`） | `dsh-tool-fs/lib/index.js:550`、`:691` |
| F5 | shell 工具真实名：**`pwsh`** 与 **`bash`**；参数均为 `{ description, command, timeoutMs, workdir, run_in_background, sandbox_permissions }` | `dsh-tool-pwsh/lib/index.js:467`、`dsh-tool-bash/lib/index.js:494` |
| F6 | `str_replace_editor` 是真实包名工具 | `dsh-tool-str-replace-editor/lib/index.js:268` |
| F7 | **`apply_patch` 在本宿主根本不存在**；`shell` / `execute_command` / `exec` 同样不存在 | 遍历 app.asar 18,234 条目 + 全量扫描 `dsh-tool-*/lib/index.js` |
| F8 | `session.header.cwd` 在 web 会话里可能为空，链**不能假设非空** | `dsh-session/lib/index.js:1197` |
| F9 | 测试跑法：`cd dsh && node test/guard.js`（fake ToolExecution + 临时工作区）；另有 `contract.js` / `verify.js` / `integration.js`；仓库侧 `npx vitest run`。**断言数一律以实跑输出为准**（`test/guard.js` 末尾打印 `通过 N / M`），**不得在计划或文档里写死旧数字** | `dsh/ADAPTER.md:81-87`；`test/guard.js:21-30`（`check` + `node:assert/strict`）；`test/verify.js:38-96` |
| F10 | chore 改动面：`chore.ts`（ttl `:125`、record `:129-135`、log `:137-142`）+ i18n `flow.chore.*`（`zh-CN.ts:418-425`、`en.ts:392-399`）+ `test/commands/chore.test.ts` | 已读 |
| F11 | `chore.needNote` 文案**已承诺** `--ttl-min N`，但 `chore.ts` 从未实现该选项 | `zh-CN.ts:422` / `en.ts:396` vs `chore.ts:57-61` |
| F12 | `.openfeel/dev/` 已有运行时状态先例（`sessions.json`） | `.gitignore`；`dsh/lib/adapters/sessions.js:42-44` |
| F13 | 豁免判定**完全不看目录归属**：`isDocPath` 只看扩展名 + 根级 `docs/`；`isPresentationalAssetPath` 只看扩展名 + 任一层 `assets`/`public`；`isExemptPath` 是两者并集 ⇒ `src/x.md` / `src/x.css` / `src/assets/logo.svg` 全部豁免 | `guard.js:44`（`.txt` ∈ `DOC_EXTENSIONS`）、`:50-52`、`:73-79`、`:118-125`、`:128-130` |
| F14 | 受保护路径**只有两个**：`flow.json` 与 `.openfeel/**/status.md`；`.openfeel/**` 其余一切在 `:490-491` 整片放行（**早于**相位判定） | `guard.js:222-226`、`:490-491` |
| F15 | 审计条目格式 `{time, event, tool, reason, phase, paths}`（本次实证见 §1.1） | `guard.js:138-156` |

**F1+F2+F3 的推论（写进代码注释）**：`execution.session?.header?.cwd`、`execution.cwd`、`execution.agent?.cwd` 三条链**在本宿主恒为 undefined**，不进链（注释说明为何删掉，防后人好心加回）；真实可用的 6 环是 `env` → `agent-session` → `config` → `registry[sessionId]` → `process`（有条件）→ fail-closed。`agent` 缺失时 guard **拿不到任何 sessionId**（F2），此时直接走 `process` 条件环或 fail-closed —— **不设进程级「最近 cwd」兜底**（P1-4：跨项目串味会把 fail-closed 偷换成「按别的项目放行」）。

**`process.cwd()` 不得无条件进链（P4，附理由）**：宿主进程 cwd 很可能是安装目录 / 界面目录，不是会话工作区。无条件把它当根会**同时**造成「误拒」和「误放」：那目录无 `.openfeel/`、`enforce=always` 下 bootstrap 例外不成立 ⇒ 所有写都被拒（明明在别的正常项目里）；反之若恰好是另一个 OpenFeel 项目 ⇒ 按错项目的 flow.json 判定并放行（明明本会话只读）。因此**只有 `process.cwd()` 目录本身含 `.openfeel/` 时才采用**（`cwdSource: 'process'`），否则跳过该环直接 fail-closed。**此理由必须写进 `resolveGuardCwd` 的注释**。

---

## 2. 设计决策

**优先级与定位（照此排序实现，不得改形）**

| 决策 | 定位 | 优先级 | 落点 |
|---|---|---|---|
| D-126-05 受保护路径扩展 | 堵住**自提权** | **P0** | op-001 |
| D-126-06 doc/asset 豁免收窄 | 堵住**借道**（且是误判来源） | **P0** | op-001 |
| D-126-02 shell 覆盖 | 堵住**零守卫绕过面** | **P0** | op-002 |
| D-126-03 chore 收窄 | 窄化宽窗口 + 与 05/02 协同 | **P1** | op-004 |
| D-126-01 cwd 链 fail-closed | **防御纵深**（非本因） | **P2** | op-003 |
| D-126-04 可观测（guard-state） | 支撑 01 的可验证性 + 全局自曝 | **P1** | op-003 |

### D-126-05 受保护路径扩展（**P0，最容易被利用 / 自提权**）

**现状**：`guard.js:490-491` `if (allInternal) return undefined;` 让 `.openfeel/**` 任意文件在任意相位可写；`isProtectedPath`（`guard.js:222-226`）只护 `flow.json` 与 `.openfeel/**/status.md`。于是 agent 可以手写状态文件**自提权**：

1. 手写 `.openfeel/chore.json`（`expires_at` 填未来）→ 立刻获得源码写窗口，**不需要运行 `chore`**；
2. 手写 `.openfeel/dev/.preflight.json` → 伪造「10 分钟内读过状态」，直接满足所有 CLI 写命令的 preflight 准入；
3. `flow-archive/*.json` / `checkpoints/*.json` / `requirements/*.md` 被手改后与 `flow.json` 不一致，要等 `health` 才发现（甚至一直没发现）。

**要求**：把下列路径加入**受保护路径**（agent 的 `write`/`edit`/shell 一律拒，消息指向对应 CLI）：

| 路径 | 归属 | 拒绝时的指引 |
|---|---|---|
| `.openfeel/chore.json` | chore 写窗口 | 由**人类**在外部终端 `openfeel chore "<说明>"` / `openfeel chore --end` |
| `.openfeel/dev/.preflight.json` | preflight 账本 | `feel_status` / `feel_next`（自动记录） |
| `.openfeel/dev/sessions.json` | 多会话登记 | `feel_*` 自动心跳 |
| `.openfeel/dev/guard-state.json` | 门禁自检 | 无需手写；看 `feel_status` 的 `guard` 段 |
| `.openfeel/flow-archive/**` | 版本归档 | `feel_archive action=create` |
| `.openfeel/checkpoints/**` | 相位快照 | `feel_checkpoint`（读/恢复） |
| `.openfeel/requirements/*.md` | 需求人读副本 | `feel_req action=add|set|claim|...` |
| `.openfeel/log/guard-audit.jsonl` | **审计证据（单文件保护）** | 无需手写；由 guard 自动追加 |

**`.openfeel/log/**` 的最终口径（v3 定稿）**：**不做整目录保护**（`.openfeel/log/` 下其它文件仍可写，避免打断现有工作流），**只单独保护 `guard-audit.jsonl`** —— 否则 agent 可以截断/伪造审计把证据抹掉。guard 自己的 append 走 `fs`，不经工具，不受影响。

**实现要点**：

- 扩展 `isProtectedPath(absolute, cwd)`（`guard.js:222-226`）：保留现有 `flow.json` / `**/status.md` 判定，追加前缀集合 `PROTECTED_OPENFEEL_PATHS`；路径段比对复用 `normalizeTarget` + 大小写归一化，防 `.OPENFEEL/CHORE.JSON` 绕过（Windows/macOS 大小写不敏感）。
- 受保护判定位于 `guard.js:452-458`，**早于** `allInternal` 早返回（`:490-491`）与相位判定 ⇒ 加集合即生效，**不要**修改 `allInternal` 的放行语义（`.openfeel/plan/**`、`.openfeel/log/**`（除 `guard-audit.jsonl`）、`.openfeel/kb/**` 仍任意相位可写，保持现有工作流）。
- **不误伤的关键（写进注释）**：guard **只拦工具调用**；适配器与 CLI 自己用 `fs` 直写（`guard-state.json`、`sessions.json`、`guard-audit.jsonl`、CLI 写 `flow.json`/`preflight`/`chore.json`/归档）**完全不受影响**，因为它们不经过 `write`/`edit`/shell 工具。**不要**在 `writeGuardState` / `touchSession` / `recordGuardAudit` / CLI 侧加任何豁免开关。
- 对应**防自锁回归**（R9）：`dsh/test/guard.js` 必有一条断言 —— 调用 `writeGuardState` / `touchSession` / `recordGuardAudit` 后文件确实写入成功（不经工具路径）。

### D-126-06 doc/asset 豁免收窄（**P0，本次误判的直接来源**）

**现状**：`isExemptPath`（`guard.js:128-130`）= `isDocPath` ∪ `isPresentationalAssetPath`，**完全不看目录归属**（F13）⇒ `src/anything.md`、`src/x.css`、`src/assets/logo.svg` 在无 `exec_running` 时也能写。

**要求**：**代码目录内一律按源码门禁** —— 判定顺序改为「**先判目录，再判扩展名**」：

1. 新增 `CODE_DIRECTORIES = ['src','test','scripts','dsh','bin']` 与 `isCodeDirectoryPath(absolute, cwd)`（工作区**根级**目录段比对，大小写归一化）。
2. `isExemptPath(absolute, cwd)` 改为：
   - `isCodeDirectoryPath(...)` → **返回 false**（该目录内任何扩展名都不豁免，含 `.md`/`.css`/`.png`/`assets/**`）；
   - 否则按现有 `isDocPath` / `isPresentationalAssetPath` 判定（`docs/**`、`.openfeel/**`、根级文档、显式 `assets/`、`public/` 继续豁免）。
3. 根级文档显式白名单：`README*` / `CHANGELOG*` / `LICENSE*`（**仅工作区根级**；`src/README.md` 仍按源码门禁）。
4. `.openfeel/**` 不受影响（`allInternal` 早返回在前）。
5. 研究产物闸（`guard.js:504-516`，`docs/research/**`）语义不变。
6. 注释必须写明**为什么**：`src/*.md` 同样是仓库内容（可被 import / 被脚本读取），且它正是上一轮「门禁失效」假象的来源；豁免只应给「人读产物」，不给「代码目录里的任何文件」。

**与 D-126-02 的关系**：叠加后 `src/x.md` 经 `write` 被拒、经 `pwsh`/`bash` 也被拒（shell 分支复用同一 `decideForTargets`），无借道。

### D-126-02 覆盖 shell 工具（**P0 头号绕过面；默认 = 1/2 类拒、4 类告警，不是单一开关**）

**工具名（已核实 F4-F7）**：

- 真机存在：`bash`、`pwsh`（必须加，最关键的两条）
- 真机存在但未必注册：`str_replace_editor`（已在列表内）
- 真机**不存在**：`apply_patch`、`shell`、`execute_command`、`exec` → 保留为**跨宿主防御条目**（**不是本宿主的实现目标**）。注释必须写明「本宿主不存在，仅为跨宿主防御 —— 不要为它写实现，也不要以为它已生效」。

`DEFAULT_MUTATING_TOOLS`（`guard.js:23-28`）与 `normalizeConfig` 的重复默认列表（`dsh/lib/index.js:72-74`）**两处必须同步**，否则 profile 传空数组会回落到旧列表。

**命令文本解析**：新增 `extractShellCommand(args)`（读 `command`，兼容 `script`/`cmd`；同时读 `workdir`）。

- **路径基准（硬要求）**：命令里的相对路径一律按 **`workdir ?? guard cwd`** 解析：`baseDir = resolve(guardCwd, workdir ?? '.')`，目标经 `normalizeTarget(baseDir, target)` 归一化后送判定。否则在子目录里跑 `pwsh` 会把目标解析到错误的项目根（误放/误拒）。

四类判定：

1. **硬拒（任何相位）**
   - 命令写 `.openfeel/flow.json` / `.openfeel/**/status.md`，以及 D-126-05 新增的全部受保护路径
   - 用 shell 跑 `openfeel flow|stage|req|chore` 的**写**子命令（含 `chore` 的**开启**）
   - 只读白名单（放行）：`status / next / current / overview / phases / mode / log / metrics / health / recover / list / show / board / retry / checkpoint list / plan stage list / plan scheme list`
   - `chore --status` / `chore --end` **放行**（只读 / 收口）；`chore "<note>"`（开启）**拒**（见 D-126-03 协同）
   - 其它 `openfeel` 子命令（`init` / `setup` / `dev sync` / `kb` / `model` / `archive list`）**放行**：不是 `flow.json` 的写近路，且 `dev sync` / `init` 属 CLI 权威路径（写 `.openfeel/**` 本就允许）
   - **【P1-1 新增】编码/间接执行形态一律硬拒**（这些形态无法可靠静态判定目标，一律不给「未判定就放行」的出口）：
     - PowerShell：`-EncodedCommand` / `-EncodedArguments`、`iex` / `Invoke-Expression`、`powershell -Command` / `pwsh -c`
     - POSIX：`bash -c` / `sh -c` / `zsh -c` 且 payload 非空、`eval`
     - 解释器内联：`node -e` / `--eval` / `-p`、`python -c`、`perl -e`、`ruby -e`、`php -r`
     - 拒绝消息写明「请直接把命令写在 shell 工具里（不要嵌套一层解释器）」
2. **源码/文档写**：识别重定向（`>` `>>` `2>` `&>`）、`tee`、`Out-File`/`Set-Content`/`Add-Content`/`New-Item`/`Copy-Item`/`Move-Item`/`Remove-Item`/`Rename-Item`、`sed -i`、`patch`、`rm`/`del`/`mv`/`cp`/`touch`/`mkdir`、**以及全部 git 工作区写子命令** → 提取目标路径（按 `baseDir` 解析）→ **复用与文件工具完全相同的判定**：把 `guard.js:448-552` 判定体抽成 `decideForTargets({ name, targets, resolvedCwd, normalizedCwd, ... })`，文件分支与 shell 分支调用同一函数（`exec_running` 要求、doc/asset 豁免、`docs/research/**` 入口闸、受保护路径、chore 策略，全部零复制）
   - **【P1-1 新增】git 工作区写**（这是最隐蔽的一条：非 `exec_running` 相位下能把源码「恢复/丢弃/还原」而绕过一切文件门禁）：
     | 命令 | 处理 |
     |---|---|
     | `git checkout -- <paths>` / `git checkout <rev> -- <paths>` / `git restore [--staged] <paths>` | 按 `<paths>` 走第 2 类判定（无 paths → 视作整树 → 拒） |
     | `git reset --hard [<rev>]` / `git reset --merge` | 整树 → 拒（除非有 `exec_running`） |
     | `git stash pop` / `git stash apply` | 目标未知 → 视为整树写 → 拒（除非有 `exec_running`） |
     | `git clean`（含 `-fd`/`-x`） | 删除整树未跟踪文件 → 拒（除非有 `exec_running`） |
     | `git apply <patch>` | 解析 patch 头目标，按第 2 类判定（复用 `parsePatchTargets`） |
     | `git commit` | **无 `exec_running` 阶段时拒**（否则等于用提交把状态写进仓库）；有 `exec_running` 放行 |
     | `git status` / `log` / `diff` / `show` / `branch`（只读）/ `remote -v` / `fetch` | 放行 |
   - **变量间接（口径写死，v4 消歧一行）**：
     - **单次字面量赋值**（同一命令内把**完整字面量路径**赋给变量后直接使用）：`$f='src/x.ts'; Set-Content $f` / `F=src/x.ts; echo x > "$F"` → 解析出字面量，按**第 2 类**判定
     - **拼接 / 非单次字面量**（`$d='src'; Set-Content "$d/x.ts"`、`$f = Join-Path $root 'x.ts'`、变量取自管道/文件/环境变量）→ **第 4 类 `warn`**（与 R4 一致；**明确不做字符串求值/拼接推导**，避免「看起来能算」的半成品解析）
     - 一句话判据：**只有「一次字面量赋值得到完整目标路径」才算第 2 类**；任何拼接、派生、跨语句取值一律第 4 类
3. **构建/测试产物豁免**（**P1-2 已补齐**）：`dist/**`、`build/**`、`out/**`、`target/**`（Rust）、`.next/**`、`node_modules/**`、`coverage/**`、`.openfeel/tmp/**`、`*/.cache/**`、`*.tsbuildinfo`、`pnpm-lock.yaml`、`package-lock.json` → 不触发拒绝（保证 `npx vitest` / `npm run build` / `cargo build` / `tsc -b` / `npm install` 不被误杀）。必须**全部目标命中豁免**才放行，混合目标从严
4. **无法判定目标**（目标来自运行时数据、跨进程变量等）→ 见下「默认组合」

**第 4 类的书面口径（必须同时写进 ADAPTER.md）**：**第 4 类只防误写、不防蓄意**。编码/嵌套执行形态已在第 1 类堵死；能走到第 4 类的只剩「目标来自运行时数据」这一类，默认 `warn`（放行 + 审计 + stderr），要更严就设 `OPENFEEL_SHELL_GATE=strict`。

**`OPENFEEL_SHELL_GATE` 三档语义** —— guard 创建时读一次，默认值 = 「**1/2 类拒、4 类告警**」组合，**不是单一开关**：

| 取值 | 第 1 类（受保护 / openfeel 写子命令） | 第 2 类（可解析的源码/文档写） | 第 4 类（目标不可判定） |
|---|---|---|---|
| **默认（未设）** | 拒 | 拒（按 `decideForTargets` 正常判定） | **告警放行**（审计 + stderr 一行） |
| `strict` | 拒 | 拒 | **拒** |
| `warn` | **告警放行** | **告警放行** | 告警放行 |
| `off` | 放行 | 放行 | 放行（shell 完全不守） |

- 实现用两个常量表达默认组合，而非单一枚举：`SHELL_GATE_DECIDABLE = 'deny'`（1/2 类）+ `SHELL_GATE_UNDECIDABLE = 'warn'`（4 类）；`strict`/`warn`/`off` 只允许放宽或收紧这两个默认。
- `warn` 下受保护路径也降级为告警是**有意的显式取舍**：默认组合已把 1/2 类堵死，只有用户显式设 `warn` 才降级；降级事实必须写进 `guard-state.json`（`shellGate: 'warn'`）与审计，可反查。
- **`off` / `warn` 只作用于 shell 分支**，文件工具分支（`write`/`edit`/`str_replace_editor`）**不受**影响。

### D-126-03 chore 收窄（`src/commands/chore.ts`）

- TTL `60 → 30` 分钟（`chore.ts:125`）
- 实现 i18n 已承诺的 `--ttl-min N`（F11），默认 30；**上限硬定 30 分钟（P1-3）**：`N > 30`、非数字、`N <= 0`、小数 → **直接拒绝并 exit 1**（i18n 新键 `flow.chore.ttlTooLong`），消息写「上限 30 分钟，与收窄口径一致」。**不允许任何途径把窗口改回更长**（含环境变量、config）；`--ttl-min` 只允许把窗口改**短**（`1..30`）
- 默认**不允许源码写入**；要改源码必须 `openfeel chore --source "<note>"` 显式声明，写 log `detail.source_allowed = true`
- `ChoreRecord` 增字段 `source_allowed?: boolean`（`true` 才写盘，省略即 false）
- guard 侧读 `chore.json`（`readActiveChore`，`guard.js:164-176`）按该字段判定：`source_allowed !== true` 时源码目标走正常相位判定，拒绝文案给 `openfeel chore --source "<说明>"`
- **与 D-126-05 的协同（写进文档）**：`chore.json` 进入受保护路径后，agent **无法再手写伪造写窗口**；D-126-02 又拒掉 agent 用 shell 起 `openfeel chore`（仅放行 `--status`/`--end`）⇒ **chore 窗口变成纯人类通道**：必须由用户在外部终端显式 `openfeel chore "<说明>"`（或 `--source`）开启。这是设计意图（写权限只能由人授予），不是功能退化；拒绝消息里要写出这条人类路径
- **冲突消解（本计划裁定，见 §7.1 待复核）**：D-126-02 第 1 类原本就把 `chore` 列为「shell 跑即拒」，而旧验收 13 又假设 agent 自己 `openfeel chore --source`。二者冲突，按**更严的一侧**裁定：**agent 不能开启 chore**；验收 13 改为「用户外部终端开启 → 会话内验证」

### D-126-01 cwd 解析链 + fail-closed（**防御纵深，非本因；P1/P3/P4 已拍板**）

> **定位（v2 修订）**：本条**不是**本次「跳过流程」的根因（实测 cwd 解析成功，见 §1.1）。价值是**第二道保险 + 可观测**：即使宿主升级拿掉 `agent.session.header.cwd`、或 `config.cwd` 被清空，门禁也**绝不静默放行**，而是 fail-closed 并在 `guard-state.json` 里自曝。实现优先级排在 05/06/02 之后，**不得**被当作主线叙述或验收。

**实现位置**：`dsh/lib/guard.js`，替换 L413-415，抽成 `resolveGuardCwd(execution, options) → { cwd, source, failure }`。

解析顺序（取第一个可用值，逐条记录 `source`）：

0. **`OPENFEEL_GUARD_CWD`** 环境变量（P3：**最高优先级逃生阀**）→ `source: 'env'`。设了就直接用，**仍走完全相同的路径判定**（受保护 / `exec_running` / doc-asset 豁免 / chore 策略一条不少）。用途：宿主升级拿掉 `agent.session.header.cwd` 时救急，不必改 profile + 重启。非空即生效。
1. `execution.agent?.session?.header?.cwd` → `source: 'agent-session'`（**实测唯一可用链路**，F3）
2. `config.cwd` → `source: 'config'`（当前 `cordis.patch.yml` 未配）
3. **会话登记表 `[sessionId]`** → `source: 'registry'`（主键 `execution.agent?.session?.id`；**只在 agent 存在但 `header.cwd` 为空时命中**）
4. `process.cwd()`：**仅当该目录本身含 `.openfeel/`** 时采用 → `source: 'process'`；否则**跳过**（理由见 §1.4 末段，写进注释）
5. **全部失败 → 拒绝（fail-closed）**

**已删除 `registry-last`（进程级单标量兜底）—— P1-4 定稿**：它是「全局最近一次登记」，多窗口/多项目时会**跨项目串味**：窗口 A 在项目 P1（`exec_running`）登记过，窗口 B 在项目 P2（`review_pending`）拿不到 cwd 时就会用 P1 的 cwd 去判定 B 的写入 ⇒ 按 P1 的 flow **放行 B 的源码写**。这是把「fail-closed」偷换成「按别的项目放行」，比静默放行更危险。当前实测 `agent.session.header.cwd` 可用，不需要这个兜底；**不要以「更稳」为由把它加回来**。

**登记表写入点（两处，P1：正常 Feel 会话一进来就有 cwd）**：

- ① `dsh/lib/index.js` 提示装配段（`currentAgent(ctx)` 现有路径，L100-108 / L203-207）：拼 `<feel_mode>` 时 `recordSessionCwd(agent?.session?.id, agent?.session?.header?.cwd)`；**只有 sessionId 与 cwd 都非空才写**（写入点本身不产生「当前 agent ≈ 所有会话」的误记）
- ② `dsh/lib/tools/index.js` 每次 `feel_*`（现成 `touchSessionFile` 调用点，L280 / L339）：`recordSessionCwd(exec?.agent?.session?.id, resolved.sessionCwd)`

**不做两轮部署、不设 observe 模式（P1）**：门禁**直接生效**，测量通过观测完成 —— `guard-state.json` 每次判定都写 `{ cwd, cwdSource, decision, reason, tool, paths, at }`，部署后**第一条判定**即可看出链是否命中。删掉「取不到 cwd 就 `return undefined`」的 L415 分支。**cwd 解析失败时证据不会丢**：`writeGuardState(null)` / `recordGuardAudit(null)` 落到 `os.tmpdir()/openfeel-guard/`（见 D-126-04），`feel_status` 也会读该全局文件 —— 否则「第一条判定即暴露」在 fail-closed 场景下会落空。

拒绝文案：

> `OpenFeel 写入门禁：无法确定会话工作区（cwd 解析失败），已按 fail-closed 拒绝本次写入。修复（任一）：① profile 的 cordis.patch.yml 给 openfeel-feel 配 cwd: "<项目绝对路径>"；② 设环境变量 OPENFEEL_GUARD_CWD 后重启；③ 重启会话让提示装配登记 cwd。诊断：feel_status 的 guard 段（.openfeel/dev/guard-state.json）。`

附加要求：

- `source ∈ {env, agent-session, config, registry, process}` 原样进 `guard-state.json.cwdSource` 与 `guard-audit.jsonl`。
- **非 `agent-session` 来源必须显式告警（P1-4）**：`env`/`config`/`registry`/`process` 每次命中都在 stderr 打一行 `[openfeel-guard] cwdSource=<source>（非会话直读，可能是降级路径）`，并在 `feel_status.guard` 里带 `degraded: true`；`process` 额外提示「最弱一环」。
- 注释必须写清：为何删掉那三条恒 undefined 的链、为何删掉 `registry-last`（P1-4 理由）、为何 `process.cwd()` 要带 `.openfeel/` 前置条件（P4）、`OPENFEEL_GUARD_CWD` 是逃生阀不是常规路径。

### D-126-04 让「门禁是否真的生效」可见（**P0-4 v4：必须自证、且 cwd 失败也有落点**）

- 适配器注册 guard 后写 `.openfeel/dev/guard-state.json`，字段**完整版**：
  `{ schemaVersion:1, registered, enforce, shellGate, cwd, cwdSource, degraded, resolvedAt, hostStartedAt, loaded_hash, pid, lastDecision: { at, tool, decision, reason, paths, cwd, cwdSource, command? } }`
- **可自证三键（P0-4，复用 `host-state.js:88-89` 口径）**：
  - `hostStartedAt`：本进程/本次 `apply()` 的启动时刻（与 `writeHostMarker` 的 `started_at` 同源同值）
  - `loaded_hash`：`hashLoadedAdapter(adapterRoot)`（`host-state.js:65-74` 现成函数，直接复用，不另算）
  - `pid`：`process.pid`
  - **`feel_status` 必须比对**：读 `~/.openfeel/adapter-host-dsh.json`（`readHostMarker`）与当前 `process.pid`/boot 时刻；`loaded_hash` 不一致、`hostStartedAt` 早于当前宿主启动、或 `pid` 与当前进程不符 → `guard.stale = true` 并在 summary 明说「门禁来自旧进程/旧适配器，判定不可信，请重启宿主」，同时 `workflowGate.required = true`
- **cwd 解析失败时的落点（P0-4 写死，不许静默丢弃）**：
  - `cwdSource === 'unresolved'` 时，`writeGuardState` **固定写** `join(os.tmpdir(), 'openfeel-guard', 'guard-state.json')`（工作区外，**绝不用 `process.cwd()`**），`hostCwd` 只作**诊断字段**保留
  - `writeGuardState(root = null)` 与 `recordGuardAudit(cwd = null)` 在路径为空时**不得**通过 try/catch 静默吞掉 —— 那正好是最需要证据的时刻（与 §:224「第一条判定即暴露」自相矛盾）。`recordGuardAudit` 同样落到该全局目录（`.jsonl`），并在 stderr 打一行 `[guard] audit-unavailable` 作为二次兜底
  - **`feel_status` / `feel_next` 在 cwd 缺失时必须也读这个全局文件**（读取顺序：工作区 `.openfeel/dev/guard-state.json` → `os.tmpdir()/openfeel-guard/guard-state.json`；后者命中时 `guard.degraded = true` 且 `guard.source = 'global-fallback'`），否则「fail-closed 发生了」这件事在系统里**无处可查**
  - 全局目录用 `mkdirSync(..., { recursive: true })` 失败时，退化为 stderr 三行结构（`at`/`tool`/`reason`/`cwdSource`），**永不静默**
- `registered`/`enforce`/`shellGate`/`cwd`/`cwdSource`/`degraded`/`resolvedAt`/`hostStartedAt`/`loaded_hash`/`pid` 注册时写一次；`lastDecision` 在**每次拒绝/放行**后更新（同步、best-effort；与 `recordGuardAudit` 同一失败策略，但**不允许**「路径为空就跳过」）。**P1：这条记录就是「测量」本身**。
- `feel_status` / `feel_next` 返回 `guard` 段（工作区与全局两处都缺 → `{ registered:false, cwd:null, cwdSource:null, stale:false }`），compact 档也带。
- `registered === false`、`cwd === null` **或** `stale === true` 时 `workflowGate.required = true` 并给修复动作。
- **`lastDecision.reason` 必须能区分「跑了但豁免」（`doc-asset` / `chore` / `bootstrap` / `general`）与「门禁没跑」** —— 这正是 §1.1 误判的解药。
- `dsh/ADAPTER.md` 与 `dsh/cordis.patch.yml` 注释同步更新，**`ADAPTER.md:38`「pwsh / bash 默认不守，是显式逃生通道」整句必须删掉**。
- `.gitignore` 增 `.openfeel/dev/guard-state.json`。
- **`os.tmpdir()` 的跨平台注意**：全局落点是**进程级临时目录**，多用户/多宿主共存时按 `pid` 区分（文件名 `guard-state.json` 内已有 `pid` 字段，不另开子目录；如遇并发写冲突只影响诊断，不影响判定）。

---

## 3. 文件改动清单

### 3.1 op-001 — 判定核心收紧（D-126-05 受保护路径 + D-126-06 豁免收窄）

| 文件 | 动作 | 改什么（逐处） |
|---|---|---|
| `dsh/lib/guard.js` | 修改 | ① 新增 `PROTECTED_OPENFEEL_PATHS` 并扩展 `isProtectedPath`(L222-226)：追加 `chore.json`、`dev/.preflight.json`、`dev/sessions.json`、`dev/guard-state.json`、`flow-archive/**`、`checkpoints/**`、`requirements/*.md`、**`log/guard-audit.jsonl`（单文件，不整目录）**（路径段比对 + 归一化）；② 新增 `CODE_DIRECTORIES = ['src','test','scripts','dsh','bin']` 与 `isCodeDirectoryPath()`；③ 改写 `isExemptPath`(L128-130) 为「先判代码目录 → 命中即 false；否则 doc/asset 判定」，并加根级 `README*`/`CHANGELOG*`/`LICENSE*` 白名单；④ 受保护路径的拒绝文案按归属给出对应 CLI（映射表 `guard.js` 内常量）；⑤ **纯重构**：把 L448-552 判定体抽成 `decideForTargets()`（供 op-002 的 shell 分支复用，逐行搬迁不改语义）；⑥ 注释写明 D-126-05「只拦工具调用、不拦 fs 直写」与 D-126-06「先目录后扩展名」的理由 |
| `dsh/test/guard.js` | 修改 | 新增用例：`chore.json` / `dev/.preflight.json` / `dev/sessions.json` / `dev/guard-state.json` / `flow-archive/x.json` / `checkpoints/x.json` / `requirements/REQ-1.md` / **`log/guard-audit.jsonl`** 在 **`exec_running` 相位**下仍被拒（受保护优先于相位）；`.openfeel/log/x.md` **放行**（不整目录保护，v3 结论）；`src/x.md` / `src/x.css` / `src/assets/logo.svg` 在 `plan_review` 下拒；`docs/x.md`、根级 `README.md`、`public/logo.svg` 放行；`src/docs/x.ts` 仍按源码门（零回归）；**防自锁**：`writeGuardState`/`touchSession`/`recordGuardAudit` 直写后文件存在（不经工具） |

### 3.2 op-002 — shell 覆盖（D-126-02）

| 文件 | 动作 | 改什么（逐处） |
|---|---|---|
| `dsh/lib/guard.js` | 修改 | ① `DEFAULT_MUTATING_TOOLS`(L23-28) 加 `bash`/`pwsh`（+ 防御条目 `apply_patch`/`shell`/`execute_command`/`exec`，注释写明「本宿主不存在，仅跨宿主防御，勿写实现」）；② 新增 `SHELL_TOOLS` 常量；③ 新增 `extractShellCommand()`（`command` + `workdir`）、`classifyShellCommand()`（`baseDir = resolve(guardCwd, workdir ?? '.')`）、`SHELL_WRITE_PATTERNS`、`GIT_WORKTREE_WRITE_PATTERNS`（含 `checkout --`/`restore`/`reset --hard`/`stash pop|apply`/`clean`/`apply`/`commit` 的独立规则）、`INDIRECT_EXEC_PATTERNS`（`-EncodedCommand`/`iex`/`Invoke-Expression`/`-c`/`eval`/`node -e`/`python -c` 等）、`LITERAL_VAR_ASSIGN_RE`（同命令内字面量变量）、`BUILD_ARTIFACT_GLOBS`（**补齐 `build/**`、`out/**`、`target/**`、`.next/**`、`*.tsbuildinfo`**）、`OPENFEEL_READONLY_VERBS`；④ shell 入口：`SHELL_TOOLS.has(name)` 时走 shell 分支，1/2 类判定复用 op-001 抽出的 `decideForTargets()`（`git apply` 复用 `parsePatchTargets`）；⑤ guard 构造期读 `OPENFEEL_SHELL_GATE`，用 `SHELL_GATE_DECIDABLE='deny'` + `SHELL_GATE_UNDECIDABLE='warn'` 表达默认组合；⑥ `recordGuardAudit`(L138-156) 增 `cwdSource`/`command`（截断 ≤200 字符） |
| `dsh/lib/index.js` | 修改 | `normalizeConfig`(L72-74) 默认 `mutatingTools` 与 guard.js 同步；新增 `shellGate` 配置项归一化（未设 → 默认组合；`strict`/`warn`/`off` 透传）；把 `shellGate` 传给 `createOpenFeelGuard` |
| `dsh/test/guard.js` | 修改 | `pwsh`/`bash` 写源码在 `plan_review` → 拒；`Set-Content .openfeel/chore.json` → 拒（1 类硬拒）；`openfeel flow advance` → 拒、`openfeel flow current` → 放行；`openfeel chore "x"` → 拒、`openfeel chore --end` → 放行；**`git checkout -- src/a.ts` / `git restore .` / `git reset --hard` / `git stash pop` / `git clean -fd` → 拒；`git commit -m x` 无 exec 阶段 → 拒、`exec_running` → 放行；`git status|log|diff` → 放行**；**`pwsh -EncodedCommand …`/`iex …`/`bash -c "…"`/`node -e …`/`python -c …` → 第 1 类拒**；**`$f='src/x.ts'; Set-Content $f` → 按第 2 类拒；不可解析变量 → warn + 审计**；`Set-Content dist/x`、`Set-Content target/x`、`Set-Content .next/x` → 放行；`=strict` 让第 4 类也拒、`=warn` 让 1/2 类降为告警；`bash` 带 `workdir:'sub'` 时 `echo x > ../src/a.ts` 按 `sub` 解析 |

### 3.3 op-003 — cwd 链 fail-closed（D-126-01）+ 可观测（D-126-04）

| 文件 | 动作 | 改什么（逐处） |
|---|---|---|
| `dsh/lib/adapters/session-cwd-registry.js` | **新建** | `Map<sessionId, {cwd, at}>`（**无进程级 `lastCwd`，P1-4 已删**）；导出 `recordSessionCwd`、`lookupSessionCwd`、`resetCwdRegistry`。零依赖、纯内存、上限 50、全 try/catch |
| `dsh/lib/adapters/guard-state.js` | **新建** | `guardStatePath(root)`、`globalGuardStatePath()`（= `join(os.tmpdir(),'openfeel-guard','guard-state.json')`）、`readGuardState(root)`（**工作区优先，缺失/`root=null` 时回退全局**；两者都缺/损坏 → 默认对象）、`writeGuardState(root, patch)`（`root=null` 时写**全局路径**，绝不写 `process.cwd()`；temp+rename 原子写 + `mkdirSync` 递归；**失败不得静默**：全局也写不成时 stderr 三行结构）、`clearGuardState`（测试用，含全局路径） |
| `dsh/lib/guard.js` | 修改 | ① 删除 L413-415，新增 `resolveGuardCwd()`（`env → agent-session → config → registry → process(仅含 `.openfeel/`) → fail-closed`，含 P4 与「为何删 registry-last」注释）；② 非 `agent-session` 来源每次 stderr 告警一行 + `degraded:true`；③ 每次决策后 `writeGuardState(cwd ?? null, { lastDecision: {...} })`，`decision ∈ allow|deny|warn`；**cwd 失败时 `cwd:null` + `cwdSource:'unresolved'`，落点走 `writeGuardState(null, …)` → 全局临时目录**，`hostCwd` 仅作诊断字段；④ `recordGuardAudit(cwd=null)` 改走全局 `.jsonl` + stderr `[guard] audit-unavailable`，**禁止静默吞** |
| `dsh/lib/index.js` | 修改 | ① 注册处（L160-178）注册成功后写 `guard-state.json` 注册段（`enforce`/`shellGate`/`cwd`/`cwdSource`/`degraded`/`resolvedAt`/**`hostStartedAt`/`loaded_hash`/`pid`**——后三个由 `host-state.js` 的 `writeHostMarker` 同源产出，直接复用 `hashLoadedAdapter`，不另算），`ctx.tools.guard` 缺失 → `registered:false` + warn 日志；② **提示装配段**（L203-207）`recordSessionCwd(...)` |
| `dsh/lib/tools/index.js` | 修改 | ① `feel_status`(L280)/`feel_next`(L339) `recordSessionCwd(...)`；② `feel_status`(L271-292)/`feel_next`(L316-347) 增 `snapshot.guard = readGuardState(resolved.cwd)`（**cwd 缺失时该函数自行回退全局**，`guard.source='global-fallback'`）；③ **stale 比对**：用 `readHostMarker()` 的 `loaded_hash`/`started_at` + 当前 `process.pid` 与 `guard` 段比对，不符/更早/超期 → `guard.stale=true`；④ `compactStatusSnapshot`(L152-204) 增 `guard` 字段；summary 在 `registered===false` 时 `⚠ 写入门禁未生效`、在 `stale===true` 时 `⚠ 门禁来自旧进程/旧适配器，判定不可信`、在 `degraded===true` 时提示 cwd 降级来源 |
| `dsh/lib/adapters/workflow-gate.js` | 修改 | `computeWorkflowGate(snapshot)` 读 `snapshot.guard`：`registered === false` → `{required:true, reason:'guard-inactive'}`；`cwd === null` → `{required:true, reason:'guard-cwd-unresolved'}`；`stale === true` → `{required:true, reason:'guard-stale'}`；各给修复动作。**无 `guard` 字段时行为完全不变**（零回归） |
| `dsh/test/guard.js` | 修改 | cwd 全链失败 → 拒且文案含 `cordis.patch.yml`；`OPENFEEL_GUARD_CWD` → `cwdSource=env`；`config.cwd` → `cwdSource=config`；**`process.cwd()` 无 `.openfeel/` → 不被采用**（`process.chdir()` 到临时空目录 + `try/finally`，P1-6）；**非 agent-session 来源触发 stderr 告警**；**cwd 失败时 guard-state 落到 `os.tmpdir()/openfeel-guard/guard-state.json` 且 `cwd:null`/`cwdSource:'unresolved'`**（断言全局文件存在、工作区路径不存在）；**`recordGuardAudit(null)` 写全局 `.jsonl` + stderr `audit-unavailable`**；注册后 `registered:true` 且含 `hostStartedAt`/`loaded_hash`/`pid` |
| `dsh/test/verify.js` | 修改 | `feel_status`/`feel_next` 的 `guard` 段形状（含 `stale`/`degraded`/`source`）；`workflowGate` 在 `registered:false`、`cwd:null`、`stale:true` 三种注入下 `required === true`（用副本注入假 guard-state / 假 host-marker，不写真实项目） |
| `.gitignore` | 修改 | 增 `.openfeel/dev/guard-state.json` |
| `dsh/cordis.patch.yml` | 修改 | L39-40：删「pwsh/bash 默认不守（显式逃生通道）」，改写为「默认受守：`bash`/`pwsh` 与文件工具同面；`OPENFEEL_SHELL_GATE` 默认 = 1/2 类拒 + 4 类告警（含 git 工作区写与编码执行形态）」；补 `cwd:` 示例（缺省时 fail-closed + 三条修复路径）、`OPENFEEL_GUARD_CWD` 与 `shellGate` 的排障说明 |
| `dsh/ADAPTER.md` | 修改 | L31-41：删 L38 整句；补「门禁三层」叙述（受保护路径 / 代码目录不豁免 / shell 四类 + git 工作区写表 + 编码执行形态 + 三档语义 + `workdir` 基准 + **「第 4 类只防误写、不防蓄意」**）；补 cwd 链（含已删 `registry-last` 的理由）与 `OPENFEEL_GUARD_CWD`、非 `agent-session` 降级告警；L40 chore 改「30 分钟上限 / `--source` 才允许源码 / 纯人类通道」；L50/L57 附近补 `guard` 段与 `guard-state.json`；L65 目录表增 `lib/adapters/guard-state.js`、`session-cwd-registry.js`；L76/L83-87 断言计数按实测更新（**跑完再写数字，不写死旧数**） |

### 3.4 op-004 — chore 收窄（D-126-03）

| 文件 | 动作 | 改什么（逐处） |
|---|---|---|
| `src/commands/chore.ts` | 修改 | ① `ttl` `:125` 60→30；② 新增 `.option('--ttl-min <n>')` 与 `.option('--source')`（`:57-61`）；③ **`--ttl-min` 校验：`1..30` 整数，越界/非整数/≤0 直接 `console.error` + `process.exit(1)`**（i18n `flow.chore.ttlTooLong`），不写盘；④ `ChoreRecord` 增 `source_allowed?: boolean`；⑤ record `:129-135` 按 `--source` 写 `source_allowed: true`；⑥ log `:137-142` 的 `detail` 增 `source_allowed`（显式 `false` 也写）；⑦ `--status` 输出（`:80-88`）标注是否允许源码及剩余分钟 |
| `src/core/i18n-data/zh-CN.ts` / `en.ts` | 修改 | 新增 `chore.sourceStartedTmpl`（已允许源码写入）与 **`chore.ttlTooLong`**（`--ttl-min` 上限 30 的拒绝文案）；`chore.needNote` 补 `--source` 与 `--ttl-min 1..30` 用法；**两文件键一一对应**（`feel_verify action=lint target=i18n`） |
| `dsh/lib/guard.js` | 修改 | chore 分支（L517-524）并入 `decideForTargets` 策略：`chore.source_allowed !== true` 时源码目标**不**放行、继续走相位判定，拒绝文案追加「或由人类执行 `openfeel chore --source "<说明>"`」 |
| `test/commands/chore.test.ts` | 修改 | ① 默认 `expires_at - started_at === 30min`；② **`--ttl-min 10` → 10min；`--ttl-min 31`/`999`/`0`/`abc`/`1.5` → exit 1 且 `chore.json` 不存在**（P1-3）；③ `--source` → `chore.json.source_allowed === true` 且 log `detail.source_allowed === true`；④ 无 `--source` → 不写字段且 log 记 `false`；⑤ 现有「开启/收口/stages 数不变」用例零回归 |

**不动**：`package.json` 版本号（留给发布节点）、`.openfeel/flow.json`、任何 `status.md`。

---

## 4. op 拆分（4 个）

### op-001 `判定核心收紧：受保护路径 + 豁免收窄`（D-126-05 + D-126-06）

- **范围**：§3.1
- **依赖**：无（最先落，纯判定改动、零结构性风险，且是 P0 自提权/借道的直接修复）
- **执行顺序**：先补 `dsh/test/guard.js` 的**失败用例**（红）→ 扩展 `isProtectedPath` → 改写 `isExemptPath` → 抽 `decideForTargets()`（纯重构，全绿才继续）→ 跑绿
- **验证**：`cd dsh && node test/guard.js`；`node test/contract.js`、`node test/verify.js`、`node test/integration.js` 零回归
- **失败回滚**：`git checkout dsh/lib/guard.js dsh/test/guard.js`；运行时 `enforce: project|off`

### op-002 `shell 覆盖（头号绕过面）`（D-126-02）

- **范围**：§3.2
- **依赖**：op-001（需要 `decideForTargets` 与扩展后的受保护集合）
- **执行顺序**：`SHELL_TOOLS` + 工具名 → `extractShellCommand`/`classifyShellCommand`（含 `workdir` 基准）→ **第 1 类补编码/间接执行形态** → **第 2 类补 git 工作区写**（含 `git commit` 相位策略）→ **第 3 类补 `build/out/target/.next/*.tsbuildinfo`** → 接入 `decideForTargets` → `OPENFEEL_SHELL_GATE` 默认组合 → `index.js` 两处同步 → 用例跑绿
- **验证**：`node test/guard.js`（含 `pwsh`/`bash` 写 `src/x.ts` 被拒、git 五连被拒、编码形态被拒、变量字面量按第 2 类判）、`contract/verify/integration` 零回归
  - **必测的反向项（不误杀）**：`npx vitest run <单文件>`、`npm run build`、**`cargo build`**、**`tsc -b`**、`openfeel flow current`、`openfeel chore --end`、`git status|log|diff`、`git commit -m "fix src/x.ts"`（**消息里的路径**不得触发拒绝；提交本身在有 `exec_running` 时才是放行的）
- **失败回滚**：`git checkout dsh/lib/guard.js dsh/lib/index.js dsh/test/guard.js`；运行时 `OPENFEEL_SHELL_GATE=off` 恢复 pre-change 行为

### op-003 `cwd 链 fail-closed（防御纵深）+ 可观测`（D-126-01 + D-126-04）

- **范围**：§3.3
- **依赖**：op-001（判定体已抽出）；与 op-002 在 `guard.js` 有代码交叉，**建议串行**（002 先）
- **执行顺序**：`session-cwd-registry.js`（**只按 sessionId，无 `lastCwd`**）→ 两处登记（提示装配 / `feel_*`）→ `guard-state.js` → `resolveGuardCwd` + fail-closed + 非 `agent-session` 告警 → `index.js` 注册段 → `tools/index.js` 暴露 `guard` → `workflow-gate.js` → 用例
- **不做两轮部署、不设 observe 模式**：门禁直接生效；部署后第一条判定即写 `cwdSource` 完成「测量」；命中 `unresolved` 时用 `OPENFEEL_GUARD_CWD` 救急，**不改回 fail-open**
- **验证（可离线部分）**：`node test/guard.js`（含 cwd 降级/`env`/`config`/`process` 条件/告警/落盘）、`node test/verify.js`（`guard` 段 + `workflowGate`）、`node test/integration.js`、`npx vitest run`
- **失败回滚**：删两个新文件 + revert 四处读取；`workflowGate` 扩展在无 `guard` 字段时零影响

### op-004 `chore 收窄`（D-126-03）

- **范围**：§3.4
- **依赖**：op-001（`decideForTargets` 内的 chore 策略）；与 op-002 只经 `guard.js` 文本耦合，串行执行
- **执行顺序**：`chore.ts`（含 `--ttl-min` 上限校验）→ i18n 两文件（含 `chore.ttlTooLong`）→ `guard.js` chore 策略 → `npx vitest run test/commands/chore.test.ts test/core/i18n.test.ts` → 全量 `npx vitest run`
- **验证**：上述 vitest（含 `--ttl-min 31/999/0/abc/1.5` 全部 exit 1 且零写盘）；`dsh/test/guard.js`（`source_allowed` 缺失拒 `src/**`、存在放行）；`node test/verify.js` 零回归
- **失败回滚**：revert 四文件；`--source`/`--ttl-min` 是纯增量，回滚只需还原 `ttl = 60` 与删选项

**op 依赖图**：`op-001 → op-002 → op-003 → op-004`（串行；001 是唯一无依赖项，应最先合入）。若必须并行：002 与 003 可分支并行但**同一文件 `guard.js` 会冲突**，建议按 001→002→003→004 顺序落地。

### 部署与端到端验证的分工（**P1-5 定稿**）

| 角色 | 做什么 | 不做什么 |
|---|---|---|
| **executor（子会话）** | 实现四个 op；跑离线全绿；`npm run build` + 部署 `dsh/` 到 `%APPDATA%\npm\node_modules\openfeel\dsh\`；**提供证据**：`guard-audit.jsonl` 行样本、`test/guard.js` 输出、部署件与仓库的字节一致性（`Get-FileHash` 对比） | **不承担 §5B 的判定**。子会话的 `agent.session.header.cwd` 与顶层会话不同，且 guard 只在宿主重启时重新注册 —— 子会话跑出来的「放行/拒绝」不代表重启后的顶层会话行为 |
| **Feel / 用户（顶层会话，重启后）** | 执行 §5B 全部条目（5-17）与 §5D（20-27）的**真机判定**；把每次实测的 `guard-audit.jsonl` 行贴回阶段记录 | 不写代码 |
| **单测（离线）** | 承接**不可在运行宿主里做的事**：`process.chdir()` 注入、假 `guard-state.json` 注入、fake ToolExecution 全部分支 | 不冒充真机验收 |

> 结论：**部署由 executor 做，判定由顶层会话做**。executor 完成时只报告「已部署 + 离线全绿 + 审计样本」，不声称端到端通过。
>
> **审计样本的合法来源（v4，必须遵守）**：样本**只能来自真实判定路径** —— ① 离线 `dsh/test/guard.js` 里的 fake `ToolExecution` 调用；② 真机上真实发生的拒绝/放行。**禁止用 `write`/`edit` 伪造 `guard-audit.jsonl`**：该文件已在受保护名单（D-126-05）里，用工具补样本会被 guard 自己拒掉，执行者会卡死；需要补样本就重跑一次真实判定，或直接贴已有行。

---

## 5. 验收清单

### A. 单元/契约（可离线，全部 op 结束后必须全绿）

1. `cd dsh && node test/guard.js` 全绿，覆盖 §3 各 op 表格列出的全部分支（受保护路径、代码目录豁免、shell 四类 + git 工作区写 + 编码执行形态 + 变量间接、`workdir` 基准、**cwd 6 环降级**（`env`/`agent-session`/`config`/`registry`/`process`/fail-closed）、chore 策略、guard-state 落盘、防自锁）。
2. `node test/contract.js` / `node test/verify.js` / `node test/integration.js` 零回归。
3. `npx vitest run` 全绿（含 `test/commands/chore.test.ts`、`test/core/i18n.test.ts`）。
4. `feel_verify action=lint target=i18n` 无新增问题。

### B. 端到端（**真实 DSH 会话**，本次需求的唯一有效验收）

> **执行者（P1-5）**：本节全部条目由 **Feel/用户（重启后的顶层会话）** 执行，**不是 executor**。executor 只交「已部署 + 离线全绿 + 审计样本」（分工见 §4 末表）。原因：子会话的 `agent.session.header.cwd` 与顶层不同，且 guard 只在宿主重启时重新注册。
>
> 前置：改完 `npm run build` + 重新部署 `dsh/` 到 `%APPDATA%\npm\node_modules\openfeel\dsh\`，**重启 DSH 宿主**，在**顶层会话**验证。
> **铁律：探针必须用源码扩展名**（`.ts`）。用 `.txt`/`.md` 会命中豁免分支得到假绿（§1.1 的教训）。
> 每条都要在 `.openfeel/log/guard-audit.jsonl` 里核对**对应的一行**（`event` / `decision` / `reason` / `cwdSource`），不能只看工具表面报错。
> **审计样本只能来自真实判定路径**（离线 fake `ToolExecution` 或真机真实拒绝/放行）；**禁止用 `write`/`edit` 伪造 `guard-audit.jsonl`** —— 它在受保护名单里，补样本会被拒，重跑一次真实判定即可。

5. **写源码被拒（核心）**：阶段停在 `review_pending`，`write src/_guardprobe.ts` →
   - 预期报错含 `OpenFeel 写入门禁：活跃阶段当前不在 exec_running（…=review_pending），不能修改源码/文档。请先 feel_flow action=advance 推进到 exec_running。`
   - 断言：`src/_guardprobe.ts` **不存在**；`guard-audit.jsonl` 最新行为 `event: guard_deny`
6. **shell 被守（头号项）**：`pwsh` 执行 `Set-Content src/_guardprobe.ts 'x'` → 拒（文案含 `不能修改源码/文档`）；`bash` 执行 `echo x > src/probe.ts` → 拒；两文件均未生成
7. **只读放行**：`pwsh` 执行 `Get-Content .openfeel/flow.json`、`openfeel flow current`、`git status` → 放行
8. **state 近路被拒**：`pwsh` 执行 `openfeel flow advance --stage <id> --to done` → 拒，文案含 `禁止用 shell 跑 openfeel 写命令`
9. **受保护路径硬拒（写入目标维度）**：`Set-Content .openfeel/flow.json x` → 拒；`Copy-Item src/a.ts .openfeel/flow.json`（目标是受保护）→ 拒。反向：`Copy-Item .openfeel/flow.json $env:TEMP\f.json`（目标在工作区外、源只读）→ 放行
10. **构建/测试不误杀（P1-2 已扩）**：`npx vitest run test/commands/chore.test.ts`、`npm run build`、**`cargo build`**、**`tsc -b`**、`git status` → 全放行（`dist|build|out|target|.next|node_modules|coverage|*.tsbuildinfo` 均在豁免表内）
11. **可见性（含自证三键）**：`feel_status` 返回 `guard: { registered:true, enforce:'always', shellGate:'default(1/2=deny,4=warn)', cwd:'C:\\…\\OpenFeel', cwdSource:'agent-session', degraded:false, stale:false, hostStartedAt, loaded_hash, pid, resolvedAt, lastDecision:{ tool:'write', decision:'deny', reason, cwdSource, ...} }`；`hostStartedAt`/`loaded_hash` 与 `~/.openfeel/adapter-host-dsh.json`（`started_at`/`loaded_hash`）**一致**、`pid` 等于宿主进程 → `stale === false`；`workflowGate.required` 不被 guard 误触发
12. **fail-closed 可见（P1-6 + P0-4 改写）**：
    - **离线**：`test/guard.js` 用 fake ToolExecution 注入「无 `agent` + 无 `config.cwd` + 未设 `OPENFEEL_GUARD_CWD`」→ 断言拒绝文案列三条修复路径；**并断言落点是全局路径** `os.tmpdir()/openfeel-guard/guard-state.json`（`cwd:null`、`cwdSource:'unresolved'`），而**不是** `process.cwd()`；`recordGuardAudit(null)` 写全局 `.jsonl` 且 stderr 有 `[guard] audit-unavailable`
    - **真机**：不伪造 `guard-state.json`。改为：真机发一次写入 → `guard-audit.jsonl` 该行 `event/decision/cwdSource` 与预期一致；`guard-state.json.lastDecision` 与审计**同源同值**
    - **判据**：`registered === false`、`cwd === null`、`stale === true` 三种情形下 `feel_status.workflowGate.required === true` 且 actions 含修复动作（`test/verify.js` 注入假 state / 假 host-marker 断言）
13. **chore 收窄（人类通道）**：由**用户在外部终端**执行 `openfeel chore "文案"` → 输出 `ttl=30`；会话内 `write src/x.ts` **被拒**（文案含 `openfeel chore --source`）、`write docs/x.md` 放行；用户再 `openfeel chore --source "行为调整"` 后 `write src/x.ts` 放行且审计 `reason=chore`，`chore.json` 含 `"source_allowed": true`；会话内 `openfeel chore "x"`（agent 用 shell 起窗口）→ **拒**，`openfeel chore --end` → 放行；外部终端 `openfeel chore --ttl-min 45` → **exit 1 且不生成 chore.json**
14. **审计可查**：`guard-audit.jsonl` 每行含 `cwdSource`；shell 拒绝行含 `command` 片段（≤200 字符）
15. **`OPENFEEL_GUARD_CWD`（P3）**：指向**另一个** OpenFeel 工作区（该区 `exec_running`，本会话项目 `review_pending`）后重启 → 本会话 `write src/x.ts` **被放行**，`guard-state.json` 的 `cwdSource === 'env'` 且 `degraded === true`（非 agent-session 必须告警）；移走后恢复拒绝
16. **`process.cwd()` 不得被无条件采用（P4，P1-6 改写）**：
    - **离线**（唯一能做 chdir 注入的地方）：`dsh/test/guard.js` 内用 `process.chdir(空目录)` + `try/finally` 恢复 → 断言 `cwdSource !== 'process'`、判定走 fail-closed
    - **真机**：只验「`hostCwd` 存在但不被采用」——`feel_status.guard.hostCwd` 有值，而 `guard.cwd`/`lastDecision.cwd` **不等于**宿主启动目录；`cwdSource` 不为 `process`
17. **`workdir` 基准**：子目录下 `workdir:'test'` 执行 `echo x > ../src/a.ts` → 解析为 `<项目>/src/a.ts` 并按相位拒；`echo x > ./tmp/a.ts` → `test/tmp/a.ts`

### C. 反证（防「又静默失效」）

18. 删除 `guard-state.json` 后 `feel_status` → `guard.registered === false`（**不再假装生效**），`workflowGate.required === true`；**再验 stale**：把 `~/.openfeel/adapter-host-dsh.json` 的 `loaded_hash` 改成假值（或 `started_at` 设成很久以前）→ `guard.stale === true`、summary 明说「门禁来自旧进程/旧适配器」、`workflowGate.required === true`（证明「适配器已更但宿主未重启」这种老bug 现在能被看见）
19. **（P1-4 改写）** 正常会话 `cwdSource === 'agent-session'` 且 `degraded === false`；一旦是 `env`/`config`/`registry`/`process` → **必须** `degraded === true` 且 stderr 有一行告警（不能无声降级）。`registry-last` 已删除，不应再出现该取值

### D. 自提权与借道（**v2 新增，本轮真实漏洞**）

20. **手写 chore 窗口被拒**：`write .openfeel/chore.json`（内容 `expires_at` 填未来 1 小时）→ **拒**，文案指向人类 `openfeel chore`；随后 `write src/x.ts` **仍然被拒**（证明窗口没被开启）；磁盘上该文件内容**未变**
21. **伪造 preflight 被拒**：`write .openfeel/dev/.preflight.json`（伪造当前时间）→ **拒**；同理 `write .openfeel/dev/sessions.json`、`.openfeel/dev/guard-state.json`、`.openfeel/flow-archive/*.json`、`.openfeel/checkpoints/*.json`、`.openfeel/requirements/REQ-*.md`、**`.openfeel/log/guard-audit.jsonl`** → 全部拒（shell 与 `write` 两条路径都测一次）；对照：`write .openfeel/log/notes.md` → **放行**（不整目录保护）
22. **豁免不再覆盖代码目录**：无 `exec_running` 阶段时 `write src/x.md` / `src/x.css` / `src/assets/logo.svg` → **全部被拒**（文案同源码门禁）；`write docs/x.md`、根级 `write README.md`、`write public/logo.svg` → 放行
23. **shell 写源码被拒（与 6 互补的独立断言）**：`bash`/`pwsh` 用 `Set-Content` / `>` 写 `src/x.ts` → 被拒且文件未生成；同一命令写 `src/x.md` → **也被拒**（证明 06 与 02 叠加生效，无借道）

### E. shell 绕过面补强（**v3 新增，P1-1**）

24. **git 工作区写被拒**：`review_pending` 下 `git checkout -- src/a.ts`、`git restore .`、`git reset --hard`、`git stash pop`、`git clean -fd` → **全部被拒**，且 `git status --porcelain` 前后**无变化**（源码没被恢复/丢弃）；`git apply patch.diff`（含 `src/` 目标）→ 拒；`git commit -m "x"` 在无 `exec_running` 阶段 → **拒**，在有 `exec_running` 阶段 → 放行；`git status` / `git log --oneline -3` / `git diff` → 放行
25. **编码/间接执行形态硬拒**：`pwsh -EncodedCommand <base64>`、`iex "Set-Content src/x.ts 1"`、`Invoke-Expression …`、`bash -c "echo 1 > src/x.ts"`、`sh -c "…"`、`node -e "require('fs').writeFileSync('src/x.ts','1')"`、`python -c "open('src/x.ts','w').write('1')"` → **第 1 类硬拒（任何相位）**；拒绝文案提示「直接把命令写在 shell 工具里，不要嵌套解释器」
26. **变量间接的口径（证明「第 4 类只防误写、不防蓄意」）**：
    - 可解析字面量：`$f='src/x.ts'; Set-Content $f '1'` / `F=src/x.ts; echo 1 > "$F"` → 按**第 2 类**拒（`review_pending` 下）
    - 不可解析：`$p = Get-Content list.txt | Select-Object -First 1; Set-Content $p '1'` → **warn 放行**，`guard-audit.jsonl` 该行 `decision:"warn"`、`reason:"shell-undecidable"`，stderr 有一行提示；把 `OPENFEEL_SHELL_GATE=strict` 后同一命令 → **拒**
27. **审计不可抹**：`write` / `Set-Content` 写 `.openfeel/log/guard-audit.jsonl` → **拒**；随后检查该文件**行数与末行时间戳未变**（证据没被截断/伪造）；`recordGuardAudit(null)`（cwd 不可解析）时审计写入全局 `os.tmpdir()/openfeel-guard/audit.jsonl` 且 stderr 有 `[guard] audit-unavailable` —— 不允许「最需要证据时静默丢弃」

---

## 6. 风险与回滚

| # | 风险 | 影响 | 缓解 |
|---|---|---|---|
| R1 | **fail-closed 把写全堵死**（D-126-01 上线后）：若 `agent.session.header.cwd` 恒空且 `agent` 缺失，链只剩 `config.cwd` / `registry` | 阻塞所有写（含 `.openfeel/**`） | 登记表**提示装配 + 每次 `feel_*`** 双点写入；每次判定写 `guard-state.json`，第一条判定即暴露命中环；命中 `unresolved` 时用 `OPENFEEL_GUARD_CWD`（P3）救急，**不改回 fail-open**；`enforce=project|off` 可整体降级 |
| R2 | `process.cwd()` 被误用为根 | 误拒（空目录 + `enforce=always`）或误放（另一 OpenFeel 项目） | P4：仅当该目录含 `.openfeel/` 才采用；`hostCwd` 诊断字段 + `feel_status.guard` 可见 |
| R2b | `OPENFEEL_GUARD_CWD` 被误设（指向过期/错误工作区） | 按错项目判定 | 只作逃生阀：`cwdSource:'env'` + `degraded:true` 显眼；文档写明「排障专用，用完移除」 |
| R2c | **`registry-last` 跨项目串味**（若被后人加回） | A 项目 `exec_running` 的 cwd 用于 B 项目 `review_pending` 的判定 ⇒ 放行 B 的源码写 | **已删除（P1-4）**，`session-cwd-registry.js` 不导出、不保留 `lastCwd`；注释写明禁止加回的理由；`test/guard.js` 不测该行为 |
| R3 | shell 文本解析误杀：`git commit -m "fix src/foo.ts"`、`grep -n ">"`、`echo "a>b"` | 正常命令被拒 | 只在「写意图 token + 目标路径」同时命中时判定为写；引号内文本先剥除；`git commit` 只按 `exec_running` 判定（不看消息文本）；第 4 类未判定一律 `warn`；`=warn|off` 可逐级降级；**op-002 必测 R3 的 9 条反向用例** |
| R4 | 蓄意绕过：真正的残余面只剩「目标来自运行时数据」 | 门禁可被蓄意绕过 | **编码/嵌套执行形态已并入第 1 类硬拒（P1-1）**；第 4 类只覆盖「目标不可静态解析」，默认 `warn` + 审计，`=strict` 拒绝。文档必须写「第 4 类只防误写、不防蓄意」 |
| R5 | 热路径 IO：每次工具调用多一次 `guard-state.json` 写 | 轻微延迟 | 只在决策后写、原子写、try/catch；与 `guard-audit` 同策略；不做跨文件锁 |
| R6 | chore 收紧 + 变纯人类通道 + `--ttl-min` 上限是**行为破坏** | 既有 agent 工作流变化 | 拒绝文案直给人类操作路径与 `1..30` 范围；`CHANGELOG` 记一条 |
| R7 | 测试计数 / 文档漂移 | 文档谎报 | 文档计数**只**取本次实跑输出（`test/guard.js` 末尾打印 `通过 N / M`），禁止写死旧数 |
| R8 | `dsh/lib/index.js` 与 `guard.js` 各有一份默认 mutating 列表，只改一处 | 新列表失效 | 列为 op-002 完成判据：grep 两处列表一致 |
| **R9** | **受保护路径收窄误伤适配器自身**（D-126-05） | 适配器/CLI 写 `guard-state.json`、`sessions.json`、`guard-audit.jsonl` 被自己拦住 → 门禁自锁 | guard **只拦工具调用**；fs 直写不经 guard。op-001 必须加**回归**断言：调用 `writeGuardState` / `touchSession` / `recordGuardAudit` 后文件确实写入成功 |
| **R10** | **豁免收窄的日常摩擦**（D-126-06）：`src/*.md`、`dsh/ADAPTER.md`、`test/*.md` 在非 `exec_running` 相位不能再随手写 | 计划/文档阶段写代码目录里的 md 被拒 | 这是**有意的**（正是本次漏洞）；解法是把文档放 `docs/` 或推进到 `exec_running`；拒绝文案直接给这两条出路 |
| **R11** | 受保护路径与 `allInternal` 早返回顺序搞反，导致保护失效 | 自提权仍可行 | op-001 用例必须在 **`exec_running` 相位**下断言受保护路径仍被拒（相位放行不能盖过保护） |
| **R12** | **git 工作区写规则误伤**：`git stash`/`git checkout -b`/`git switch` 等非写工作区命令被误判 | 正常分支操作被拒 | 白名单式枚举：只拦 `checkout --`/`restore`/`reset --hard|--merge`/`stash pop|apply`/`clean`/`apply`/`commit`；`checkout -b`/`switch`（**不覆盖工作区内容**）放行；op-002 必须逐条测这 8 条 |

**回滚（按成本从低到高）**

1. 运行时止血：profile `enforce: off`（或 `project`）→ 重启；`OPENFEEL_SHELL_GATE=off` 恢复 pre-change 的 shell 行为（不重启无效）
2. op 级：`git revert` 该 op 的提交（001→002→003→004 串行，可逐个回退）
3. 版本级：归档前整体 revert；`guard-state.json` 是旁路文件，删掉只影响可见性

**本阶段不动**：`flow.json`、任何 `status.md`、版本号。部署由 executor 在 op 完成后执行，**端到端判定由顶层会话（Feel/用户）执行**（见 §4 分工表）。

---

## 7. 已拍板（Feel 定稿，executor 照此执行）

| # | 结论 | 落点 |
|---|---|---|
| **P1** | 「先可观测、后生效」，**不做两轮部署、不设 observe 模式**。cwd 链 = `OPENFEEL_GUARD_CWD` → `agent.session.header.cwd` → `config.cwd` → 登记表 `[sessionId]` → `process.cwd()`（有条件）→ fail-closed；登记表两处写入；`guard-state.json` 每次判定写 `{cwd, cwdSource, decision, reason, tool, paths, at}` | D-126-01、§3.3、§5 验收 11/12/15/16/19 |
| **P2** | `OPENFEEL_SHELL_GATE` **默认 =「1/2 类拒、4 类告警」组合**，不是单一开关；`strict`=4 类也拒；`warn`=全部只告警；`off`=完全不管 shell | D-126-02 三档表、§3.2、§5 验收 6/8/10/23 |
| **P3** | 加 `OPENFEEL_GUARD_CWD` 作**最高优先级逃生阀**（`cwdSource:'env'`、`degraded:true`，仍走同样路径判定） | D-126-01 第 0 环、R2b、§5 验收 15 |
| **P4** | `process.cwd()` **有条件保留**：仅当该目录本身含 `.openfeel/` 时采用（`cwdSource:'process'`），否则跳过 → fail-closed | §1.4 末段、D-126-01、§5 验收 16 |
| **附加 1** | shell 相对路径按 **`workdir ?? guard cwd`** 解析 | D-126-02「路径基准」、§5 验收 17 |
| **附加 2** | `apply_patch`/`shell`/`execute_command`/`exec` 仅作**跨宿主防御条目**，本宿主不存在，不写实现 | D-126-02 工具名段、§3.2 ① |
| **附加 3** | 验收补 `OPENFEEL_GUARD_CWD` / `process.cwd()` 条件 / `workdir` 基准三条 = 验收 15/16/17 | §5 |
| **v2-1** | D-126-01 降级为**防御纵深**，不是本次根因；主线是 05/06/02 | §1.2、§2 优先级表 |
| **v2-2** | D-126-05 受保护路径扩展 + D-126-06 豁免收窄新增（均 P0） | §2、§3.1、§5 验收 20/21/22 |
| **v2-3** | chore 变**纯人类通道**（05 防手写 + 02 拒 shell 开启） | D-126-03 协同段、§5 验收 13 |
| **v3-1（P1-1）** | shell 第 2 类**并入全部 git 工作区写**（`checkout --`/`restore`/`reset --hard|--merge`/`stash pop|apply`/`clean`/`apply`），`git commit` 按 `exec_running` 判；**编码/间接执行形态并入第 1 类硬拒**；变量字面量按第 2 类、不可解析走第 4 类；文档写死「第 4 类只防误写、不防蓄意」 | D-126-02 第 1/2/4 类、§3.2、R3/R4/R12、**验收 24/25/26** |
| **v3-2（P1-2）** | `BUILD_ARTIFACT_GLOBS` 补 `build/**`、`out/**`、`target/**`、`.next/**`、`*.tsbuildinfo` | D-126-02 第 3 类、**验收 10** |
| **v3-3（P1-3）** | `--ttl-min` **上限硬定 30**，`>30`/非整数/`≤0` 直接 exit 1 且零写盘；不允许任何途径改回更长 | D-126-03、§3.4、§5 验收 13 |
| **v3-4（P1-4）** | **删除 `registry-last`（进程级单标量）**：跨项目串味会「按别的项目放行」；登记表只按 sessionId；非 `agent-session` 来源必须 `degraded:true` + stderr 告警 | D-126-01、§3.3、R2c、§5 验收 19 |
| **v3-5（P1-5）** | **部署由 executor，端到端判定由顶层会话（Feel/用户）**：executor 只交「部署 + 离线全绿 + 审计样本」，不声称端到端通过 | §4「部署与端到端验证的分工」、§5B 前置 |
| **v3-6（P1-6）** | 验收 12 改为「注入式单测 + 真机断审计行」；验收 16 的 `process.chdir` 注入**移进 `dsh/test`**（+`try/finally`），真机只验「`hostCwd` 不被采用」 | §5 验收 12/16 |
| **v3-7（P2 ①②）** | cwd 链统一表述为「**6 环**（含 fail-closed，已删 registry-last）」；测试断言数**一律以实跑输出为准**，文档不得写死 | §5 A1、§1.4 F9、R7 |
| **v4-1（P0-4）** | `guard-state.json` 自证三键 `hostStartedAt`/`loaded_hash`/`pid`（复用 `host-state.js:88-89`），`feel_status` 比对 boot/进程不符 → `stale:true` + `workflowGate.required`；**cwd 解析失败时固定落 `os.tmpdir()/openfeel-guard/guard-state.json`（绝不用 `process.cwd()`）**，`feel_status` 在 cwd 缺失时也读该全局文件；`recordGuardAudit(null)` 同样落全局 + stderr `[guard] audit-unavailable`，**禁止静默丢弃** | D-126-04、§3.3、§5 验收 11/12/18/27 |
| **v4-2（文字）** | 审计样本**只能来自真实判定路径**；**禁止用 `write`/`edit` 伪造 `guard-audit.jsonl`**（它在受保护名单里，会被拒） | §4「部署与端到端验证的分工」、§5B 前置 |
| **v4-3（文字）** | 变量口径消歧：**单次字面量赋值** → 第 2 类；**拼接/派生/运行时取值**（`$d='src'; Set-Content "$d/x.ts"`）→ **第 4 类 `warn`**（与 R4 一致，不做字符串求值） | D-126-02「变量间接」、§5 验收 26 |

### 7.1 已定结论（v3 收口，不再是待复核项）

1. **`.openfeel/log/**`**：**不做整目录保护**；**只单独保护 `.openfeel/log/guard-audit.jsonl`** —— 否则审计可被截断/伪造，「门禁是否真的拦过」将无法自证。guard 自身 append 走 fs，不受影响。验收 21/27 覆盖。
2. **`requirements/*.md`**：**纳入受保护**（CLI 生成的人读副本，手改会与 `flow.json` 漂移）。拒绝时指向 `feel_req action=...`。
3. **chore 纯人类通道**：**采纳并定稿** —— agent 既不能手写 `chore.json`（05），也不能用 shell 起 `openfeel chore`（02）；只有 `--status`/`--end` 放行。若将来需要 agent 自助开窗，必须**新开需求**给 `chore` 一个受控入口（例如带 preflight + 审计的 `feel_chore` 工具），不得在本阶段偷偷放宽。

### 7.2 仍开放的实现选择（executor 自决并在 op 报告注明）

shell 命令文本里引号内内容的剥离策略（最小状态机 vs 简单分词）；`command` 审计片段截断长度（建议 ≤200 字符）；`PROTECTED_OPENFEEL_PATHS` 用数组前缀匹配还是正则（建议数组 + 归一化段比对，便于逐条加注释）；git 子命令的识别用逐条正则还是「按 argv 分词后看前 2 个 token」（建议后者，误判更少）。
