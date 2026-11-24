# 开发账本（`dev_last.md` / `dev/current.md` / `.sync.json`）为何停滞、怎么自愈

> 研究日期：2026-11-24 ｜ 阶段：`v1.6.0-stage-132` ｜ 对应需求：REQ-059
> 范围：`src/core/dev-status.ts`、`src/core/dev/sessions.ts`、`src/commands/{dev,flow,stage,req}.ts`、`dsh/lib/adapters/**`、`dsh/lib/surface/prompt.js`（只读）。
> 边界：`.openfeel/dev/**` 正文按阶段边界禁读，故运行时数值一律标注来源（调研快照 / 本次实测）。

## 背景与问题

1. **症状**：`feel_status` 里 `statusSync.due` 长期为 true；`dev_last.md` 的 AUTO 块与 `dev/current.md` 停在几天前的快照，"最近在做什么"与真实工作完全脱节。
2. **换人/重启时的代价**：交接靠 `dev_last.md` 恢复上下文，读到的是过期状态，于是重复劳动或误判进度。
3. **结构性原因**：账本只有两个自动触发点——人工 `openfeel dev sync`，和 `flow advance` 成功后的 best-effort 同步。而现行流程要求**阶段长期停在 `exec_running`**、需求完成也不推进阶段 ⇒ 相位驱动那条路事实上永不触发。
4. **第二个原因**：提示里同时写着"要你跑 `openfeel dev sync`"与"禁止用 shell 跑 openfeel 写命令"，而工具面里根本没有 `feel_dev` ⇒ 死指令，遵守成本高于忽略。
5. **第三个原因**：唯一自动点的异常被 `try/catch` 静默吞掉，"同步失败"与"同步成功"在输出上无差别。

## 结论

1. 账本是"事件驱动 + 相位驱动"的混合体，但在需求导向下相位驱动已失效 ⇒ 必须在**所有写成功出口**上调用同步，而不是只挂在相位推进上。
2. `due` 全链路只是提示：CLI 侧不参与任何相位合法性判定，适配器侧只拼一行面板文案，模型没有任何被提醒的强制点。
3. 心跳文件（`sessions.json` / `guard-state.json`）每轮都在写，但它们**不碰** `.sync.json`、不写 AUTO 块 ⇒ "心跳很新、账本很旧"可以并存，不能把前者当账本在动的证据。
4. `blockChanged()` 忽略状态更新行后比对 ⇒ 状态未变则不重写文件，但 `.sync.json` 仍刷新。"文件没动"不等于"没同步"，两者要分开看。
5. 死指令只能靠新增 `feel_dev` 消除；靠改提示催促无效（见 `prompt-adherence-2026-11-24.md`）。
6. "陈旧即拒"的硬门必须后置：先让同步成为服务端默认行为，再谈门；且该门正常路径**不可复现**，只能以构造法单测取证。
7. `.sync.json` 属运行态不入库文件，陈旧在 git 里看不出来，只能看 mtime 或内容 ⇒ 人类排查时容易误判。

## 证据

- `src/commands/flow.ts:1391-1400` — 唯一自动同步点：`if (getDevStatus(p).due || isSyncNodePhase(options.to)) syncDevStatus(p)`，整段包在 `try { … } catch { /* best-effort */ }` 里；`:1392` 注释明写「状态记录不是门禁」。
- `src/core/dev-status.ts:143-164` — `getDevStatus()`：`meta === null → due=true`，否则 `now - Date.parse(last_sync) >= interval*60_000`（`interval` 缺省 30 分钟，可被 `.sync.json` 覆盖）。
- `src/core/dev-status.ts:244-256` — `blockChanged()`：过滤掉 `- 状态更新于：` 行后比对，状态未变则不重写文件（但 `.sync.json` 仍刷新）。
- `dsh/lib/surface/prompt.js:211` — 「…随后运行 `openfeel dev sync`（CLI 在节点/到期时也会自动同步）」；`:208-212` 是「状态与记录」整节。
- `dsh/lib/surface/prompt.js:191` — 同一块文本里「禁止用 shell 跑 `openfeel flow/stage/req` 写命令」：与 `:211` 直接冲突。
- 实测（2026-11-24 05:0x，`node -e` 调 `createTools`）：13 个 `feel_*` 工具里**没有 `feel_dev`** ⇒ 想同步只能走 shell，而 shell 又被上面那条禁止 ⇒ 死指令成立。
- `dsh/lib/guard.js:685` — `{ match: 'file', segments: ['dev', '.preflight.json'] }`：运行期文件"适配器进程内直写 + agent 工具写被拒"的现成范式，`feel_dev` / 派发台账照此办理。
- `src/core/repo-hygiene.ts:30` / `:32` — `sessions.json` 与 `.sync.json` 都在"运行态不入库"清单里（`dev clean` 负责补 `.gitignore` 并 `git rm --cached`）。
- `src/core/repo-hygiene.ts:5` — 注释记录了历史：`.sync.json`「每次 `flow advance` 都写，却不在 `.gitignore`」。
- 实测（2026-11-24 05:01）：`.openfeel/checkpoints/` 现有 **1433** 个快照，最新为 `v1.6.0-stage-132-20261124T050110152-exec_running.json` ⇒ 相位推进确实发生过，`flow advance` 侧的同步点会被触发（见"未验证项"第 2 条）。

## 改造动作

- **T8**（同步铺面）：把 `src/commands/flow.ts:1391-1400` 抽成 `maybeSyncDevStatus(projectPath): {synced, due, error?}`，**异常不再吞**（返回 `error`，由调用方输出一行 stderr）；在 `stage set/task/verify`、`req advance/complete/review/verify/body` 的成功出口各调一次。判据 **A9**。
- **T8**（陈旧门）：`advanceStagePhase` 入口先同步、再在 done 门之后判 `due`，条件 `targetPhase === 'done' && fromPhase !== 'done'`；失败抛 `DEV_SYNC_STALE`，`allowGateOverride` 放行并在 `detail.gate_overrides` 追加 `'dev_sync'`。判据 **A9b**（只认构造法单测：注入 `syncDevStatus` 抛错，或把临时工作区 `.openfeel/dev/` 置只读）。
- **T9**（`feel_dev`）：`action: sync|status` → `cli.write(['dev','sync'])` / `cli.json(['dev','status'])`，把死指令变成可执行动作；工具计数 13 → 15。
- **T10**（提示改写）：把记账要求写成三段式（条件 → 必须动作 → 工具名 `feel_dev`），删掉"CLI 会自动同步"这类会让模型合理偷懒的表述。
- **T13**（文档）：`docs/commands.md`、`dsh/README.md` 工具表、`dsh/ADAPTER.md` 工具数 13 → 15 同批更新。

## 未验证项

- **`.sync.json` 的当前值**：`last_sync` / `interval_minutes` 的具体数字来自调研快照（记 2026-11-20T12:18Z、30 分钟），本次按边界禁读 `.openfeel/dev/**`，未复点。
- **"需求导向下账本永不自动同步"这一结论的时效**：它依赖"11-20 之后零相位推进"；写稿时（11-24 05:01）已出现 stage-132 的 `exec_running` checkpoint，故该前提需要复测 `.sync.json` 才能确认症状是否仍在。
- **自动同步点的测试覆盖**：`src/commands/flow.ts:1393-1400` 目前零覆盖，T8 要补。
- **时间语义**：`blockChanged()` 忽略状态更新行 ⇒ AUTO 块里的时间戳会持续过期，人读易误判"几天没动"；是否统一为 `.sync.json` 的时间口径未定，若做成硬门须先解决。
- **失败可见化的形态**：`error` 由调用方 `console.warn` 一行，还是进 `--json` 的 envelope 字段，未定。

## 复现/验证方法

- 调用点穷举：`git grep -n "syncDevStatus" -- src/` —— 调用应只有 `src/commands/dev.ts`（人工）与 `src/commands/flow.ts:1396`（自动）两处。
- 判定链：读 `src/core/dev-status.ts:143-164`（due）与 `:244-256`（去重），确认"文件不重写但元数据刷新"的语义。
- 死指令：`git grep -n "dev sync" -- dsh/lib/` 与工具名清单命令（13 个、无 `feel_dev`）对照。
- 运行态不入库：`git grep -n "sync.json\|sessions.json" -- src/core/repo-hygiene.ts`。
- 落地后（A9）：先 `feel_stage action=set ...` 或 `feel_req action=advance ...`，再读 `.openfeel/dev/.sync.json` 的 `last_sync` —— 应前进且 `due=false`；随后 `feel_dev({action:'sync'})` exit 0。
- A9b 只能单测复现（写出口已自动同步 ⇒ `due` 恒 false），**不得**以"理论上会拦"充数：在 `test/core/flow-manager.test.ts` 注入 `syncDevStatus` 抛错后 `advanceStagePhase(stage,'done')`，断言抛 `DEV_SYNC_STALE`，且 `allowGateOverride` 时 `detail.gate_overrides` 含 `'dev_sync'`。
