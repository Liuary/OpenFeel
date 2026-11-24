# DSH 适配器的 feel_mode 注入、派发契约与"强制"边界

> 研究日期：2026-11-24 ｜ 阶段：`v1.6.0-stage-132` ｜ 对应需求：REQ-057（并支撑 REQ-060）
> 范围：`dsh/lib/**`（openfeel-dsh 适配器）只读；DSH 本体相关结论来自调研摘要，未在本轮复读。
> 用户裁定（写进设计边界）：**主会话只做派发台账 + 强提示，不做 guard 硬拦截**。

## 背景与问题

1. **症状**：主会话在做本该派发的活儿——读源码、改文件、跑测试；几十轮后上下文被细节塞满，交接只能靠重读会话。
2. **三处提示都在，但都不生效**：`feel_mode` 段落写明"调度者，不是执行者"并给出"按建议派发"；`feel_next` 返回完整 `dispatch` 模板与 `[HANDOFF: …]` 标记。主会话仍然自己干。
3. **根因判断**：三处提示都**没有后果**。唯一带后果的链路是 preflight 与写入门禁，而写入门禁的判据里没有任何一项检查"谁在写"（会话角色）。
4. **第二个缺口**：派发没有记录。事后无法回答"这一轮到底派没派、派给谁、目标是什么"。`dispatch.goal` 至今是一个占位串。
5. **本次改造要解决的是"可核对"而不是"拦住"**：把派发变成有记录的动作，把提示里的死指令换成可执行工具。

## 结论

1. 提示只有一个注入点：`prompt.js` 渲染文本 → `index.js` 用 `ctx.systemPrompt.section` 装配，每轮重算。改提示只改一处、重启宿主即生效。
2. 派发契约是**适配器自产**：`buildDispatchTemplate` 完全本地生成，CLI 侧无对应出口；其中 `goal` / `boundaries.write` 仍是占位串，导致模板不可直接粘贴。
3. 派发目前零记录、零回执；`feel_status` / `feel_next` 的"下一步"恒指向另一个读工具，模型收不到"该派发了"的信号。
4. 硬约束的唯一可落点是 `ctx.tools.guard`（收整个 `ToolExecution`，含 `agent`）；DSH 侧有 `session.header.origin` 可区分主会话与子 agent。**本次按裁定不做角色门**，只做台账 + 提示。
5. 工具面数量被三处测试断言锁死（当前 13 个）：新增工具必须同批改 `contract.js` / `verify.js` / `integration.js` 与文档。
6. 受保护路径是"适配器直写 + agent 工具写被拒"的成熟范式，新增 `.openfeel/dev/dispatch.jsonl` 直接照抄。
7. 给正文开通道（`feel_req action=body`）是本次唯一"新增写能力"的改动，必须同批改 guard 的拒绝文案，否则引导与能力不一致。

## 证据

- `dsh/lib/surface/prompt.js:163-167` — 「你的角色：调度者，不是执行者」整段（关键 4 行）。
- `dsh/lib/surface/prompt.js:172` — 「按建议派发（DSH 用 `subagent` / `workflow` 工具），或经 `feel_flow action=advance` 推进」：**纯自然语言，无任何工具或门禁与之绑定**。
- `dsh/lib/surface/prompt.js:191` 与 `:211` — 同一块文本里「禁止用 shell 跑 `openfeel flow/stage/req` 写命令」与「随后运行 `openfeel dev sync`」并存（且没有 `feel_dev` 工具可调）。
- `dsh/lib/adapters/dispatch.js:17` — `goal: '<一句话目标：要达成什么，可验收>'`：派发模板的 goal 至今是占位串。
- `dsh/lib/adapters/dispatch.js:24-25` — `neverRead` / `neverWrite` 已含 `dev_last*`、`dev/current.md`、`status.md`、`flow.json`：边界已成形，缺的是被执行与记录。
- `dsh/lib/adapters/workflow-gate.js:18` — `computeWorkflowGate(snapshot)` 是纯函数，返回 `{required, reason, message, actions}`；只被拼进 summary，**不拒写**。
- `dsh/lib/guard.js:664-667` — 边界声明：guard **只拦 agent 的工具调用**（write/edit/shell）；适配器与 CLI 的 `fs` 直写不经过 guard。
- `dsh/lib/guard.js:674-692` — `PROTECTED_OPENFEEL_PATHS` 条目真实结构是 `{ match: 'file'|'dir'|'md', segments, hint }`；`:688` 的 `log/guard-audit.jsonl` 是"进程内直写 + 工具写被拒"的现成范式。
- `dsh/lib/tools/index.js:335` — `feel_status` 描述结尾「做任何推进/委派前先调用它」：唯一的调用点提示，且只说"调我"，不说"调完必须派子 agent"。
- `dsh/lib/tools/index.js:863-896` — `feel_req` 定义块：`:868` 的 `action` 枚举 18 值、`:869-896` 的参数声明；新增 `body` 必须改枚举 + switch（`:904-1146`）。
- 实测（2026-11-24 05:0x，`node -e` 调 `createTools({cli:{}})`）：工具共 **13 个** —— `feel_status / next / flow / stage / op / req / checkpoint / archive / kb / verify / review / plan / model`，**无 `feel_dev`、无 `feel_dispatch`**。

## 改造动作

- **T9**（派发台账）：新建 `dsh/lib/adapters/dispatch-ledger.js`（读写 `.openfeel/dev/dispatch.jsonl`，仿 `sessions.js` 的原子 temp+rename，24h prune / 上限 200 行）；新增 `feel_dispatch` 工具；该文件加入 `PROTECTED_OPENFEEL_PATHS`（照 `:688` 的 `{match:'file', segments:['dev','dispatch.jsonl'], hint}` 结构）。判据 **A7**。
- **T9**（死指令变可执行）：新增 `feel_dev`（`action: sync|status` → `cli.write(['dev','sync'])` / `cli.json(['dev','status'])`）；工具计数 13 → 15，同批改三处断言 + `dsh/README.md` / `ADAPTER.md`。
- **T9**（正文通道）：`feel_req` 加 `action=body`（参数 `section/text/file/force`），走 `cli.write`；同批把 `PROTECTED_HINTS.requirements`（`dsh/lib/guard.js:749-752`）文案改为指向 `feel_req action=body`。
- **T9**（模板去占位）：`dsh/lib/adapters/dispatch.js:17` 用真实 `stage` / `phase` / 目标 agent 填充 goal 与 `boundaries.write`，返回可直接粘贴的 prompt。
- **T10**（提示重写 + 运行时提醒）：`renderChinese` / `renderEnglish` 压到 ≤1200 字符 / ≤25 行；四份同源副本（`src/core/template-loader.ts`、claude/opencode 的 `feel.md`）同批镜像；每步用 `tools/post-execute` 附 1 行「下一步」，不可用则降级到 `systemPrompt.context`。判据 **A10**。
- **plan §5.6**（`next` 动作化）：`feel_status` 保留 `next` 字符串、新增 `nextAction.kind ∈ dispatch|command|idle`；`feel_status.dispatch = {required, records, missing}`，`required` 恒 true（提示级，不硬拦）。

## 未验证项

- **`session.header.origin` / `delegationDepth` 在适配器侧能否读到**：研究只确认 DSH 侧字段存在、适配器现只读 `session.header.cwd`。T9 规划 20 行 spike；读不到就省略这两个审计字段，**不得**因此改审计 schema 版本。
- **`ctx.tools.post-execute` + `additionalContexts` 在适配器侧是否可注册**：`dsh/lib/index.js` 目前只用 `ctx.tools.guard`；T10 第 1 步做 30 行 spike。
- **角色门（方案 A）与派发凭据门（方案 B）的可行性**：只做过代码面论证，未实测；本次按裁定②不落地。
- **`feel_dispatch` 的 TTL / 去重语义**（同 lead + task + goal 5 分钟去重）：设计值，未压测。
- **DSH 本体的段落顺序、`SECTION_ORDERS`、`post-execute` 范式**：来自 `app.asar` 只读解包的调研摘要，本轮未复读，行号为解包文本行号。

## 复现/验证方法

- 工具面（本次命令）：`node -e "import('./dsh/lib/tools/index.js').then(m=>console.log(m.createTools({cli:{}}).map(t=>t.name).join(',')))"` → 13 个、无 `feel_dev`。
- 模板占位仍在：`git grep -n "一句话目标" -- dsh/lib/adapters/dispatch.js`。
- 提示只有自然语言：`git grep -n "按建议派发\|调度者，不是执行者" -- dsh/lib/`。
- 门禁边界：读 `dsh/lib/guard.js:664-667`（只拦 agent 工具）与 `:674-692`（名单结构）。
- 只提示不拒写：读 `dsh/lib/adapters/workflow-gate.js:18-94`，确认返回值只有文案与 actions。
- T9/T10 落地后：`cd dsh && node test/contract.js && node test/verify.js && node test/guard.js && node test/integration.js` 全 exit 0；`feel_dispatch(...)` 后 `.openfeel/dev/dispatch.jsonl` 增 1 行，用 `write` 工具直写该文件应被 deny。
