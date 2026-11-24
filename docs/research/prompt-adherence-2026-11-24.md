# feel_mode 指令为何被忽略：根因排序、三档改造与 A/B 判据

> 研究日期：2026-11-24 ｜ 阶段：`v1.6.0-stage-132` ｜ 对应需求：REQ-060（并支撑 REQ-057）
> 范围：`dsh/lib/surface/prompt.js`、`dsh/lib/tools/index.js`、`dsh/lib/adapters/**`、`dsh/lib/guard.js`（只读）；DSH 本体侧结论来自 `app.asar` 解包的调研摘要。
> 本项目 `feel_mode: enabled`（完整模式），因此下面的症状不是 Free Mode 造成的。

## 背景与问题

1. **症状**：提示里明写「你是调度者，不是执行者」「按建议派发（DSH 用 `subagent` / `workflow`）」，主会话仍然自己读源码、改文件、跑测试；几十轮后上下文爆掉。
2. **第二次症状**：提示里的记账要求（运行 `openfeel dev sync`）从未被真正执行，账本长期陈旧（见 `dev-ledger-2026-11-24.md`）。
3. **要回答的问题**：到底是"提示写得不够狠"，还是"流程里根本没有后果"？如果是后者，继续加字等于把规则藏得更深。
4. **本次改造的触发点**：在把"主会话只调度"列为硬约束之前，先要给出可量化、可 A/B 的根因判断。
5. **一个反证**：preflight（先读后写）与写入门禁（需活跃阶段）遵守率很高——这两条恰好是**唯一带结构性拒绝**的两条。说明"有后果"比"写得多"有效。

## 根因排序（按杠杆）

1. **无强制后果（决定性）**：全链路只有两条规则带结构性拒绝——preflight 与写入门禁。"派子 agent""更新账本""建 todo"没有任何检查点，违反成本为 0。
2. **指令脱耦**：所有规则只活在 prose 里；工具返回的"下一步"恒指向另一个读工具，模型永远收不到"该派发了"这个动作型信号；写入门禁的判据里**没有任何一项检查会话角色**，所以"主会话不许自己写"在结构上无法表达。
3. **自我矛盾的提示**：同一块文本既说"调度者不执行"，又说"一次 edit 改多处""建 todo 并汇报"（都在教自己动手）；done 门口径新旧两条并存；"要你跑 dev sync"与"不许 shell 跑写命令"并存。
4. **次要但真实**：体量与位置（全文 79 行、13 节、51 处加粗，关键 4 行占比约 6%，且后面还排着大量第一方工具指导）、与运行时不符的运维内容（退出码、shell 档位）、版本号噪声。

**可执行判断**：先补后果与反馈闭环（T2），再瘦身文本（T1）；只瘦身不补后果，等于把规则藏得更深。

## 结论

1. 提示不是"不够长"，是**没有后果**：唯一被遵守得好的规则恰好是唯一会报错的两条。
2. 唯一那条最重要的禁令（调度者不执行）埋在第二段，之后 11 节不再复述，且后面紧跟反向鼓励 ⇒ 文本内部权重互相抵消。
3. 派发指令与工具面脱耦：`next` 恒指向读工具，模型拿到的是"继续读"，不是"该派发了"。
4. 记账指令是死指令：要求跑 CLI，却没有对应工具，且同一块文本禁止用 shell 跑写命令。
5. 因此改造顺序是 T2（反馈闭环）> T1（结构重写）> T3（硬门禁，本次按裁定②只做到台账 + 强提示）。
6. 可量化：`main_write_ratio` / `subagent_per_req` / `first_status_step` / `sync_gap` / `violation_rate` 五项先补埋点，再谈遵守率。

## 证据

- `dsh/lib/surface/prompt.js:163-167` — 「你的角色：调度者，不是执行者」段（关键 4 行；后面紧跟 11 节细则）。
- `dsh/lib/surface/prompt.js:172` — 「按建议派发（DSH 用 `subagent` / `workflow` 工具）」：纯自然语言，无工具/门禁绑定。
- `dsh/lib/surface/prompt.js:233` — 「批量优先：一条 shell 做多件事、一次 edit 改多处」；`:237` — 「开始即建 todo 列表并持续更新…向用户汇报」：与"调度者不执行"同权、方向相反。
- `dsh/lib/surface/prompt.js:227` — 「全部关联阶段 done 时需求自动收口」；`:228` — 「关联阶段须已进入 `exec_running` 及之后相位即可完成…不必先 done」：**同一节两条互斥口径**。
- `dsh/lib/surface/prompt.js:191` 与 `:211` — 「禁止用 shell 跑 `openfeel flow/stage/req` 写命令」 vs 「随后运行 `openfeel dev sync`」（且工具面没有 `feel_dev`）。
- 实测（2026-11-24 05:0x，`renderFeelPrompt({language:'zh-CN',feelMode:{value:'enabled'}})`）：**5023 字符 / 79 行 / 13 个 `##` 节 / 51 处加粗**。按 1 汉字≈1 token 估 ≈2.4k–2.5k tokens（未接真实 tokenizer）。
- `dsh/lib/tools/index.js:335` — `feel_status` 描述结尾「做任何推进/委派前先调用它」：唯一的调用点提示，且只说"调我"，不说"调完必须派子 agent"。
- `dsh/lib/adapters/workflow-gate.js:18` — `computeWorkflowGate` 只产出 `{required, reason, message, actions}` 文案，**不拒写**：这是"有提示、无后果"的最小样本。
- `dsh/lib/guard.js:664-667` — guard 的边界声明（只拦 agent 工具调用）：它是最强的一条链路，也反证"有结构性拒绝才被遵守"。
- `dsh/lib/tools/index.js:863-896` — `feel_req` 定义块（`:868` 的 action 枚举 + `:869-896` 参数）：说明"工具描述即约束"是能落地的位置（新规则应写进工具描述与返回体，而不是加长 prose）。

## 改造动作（三档）

**T1 提示词结构重写（约 0.5 天，可行性高）**
目标 ≤1200 字符 / ≤25 行，五节：① 身份 + 唯一硬规则（≤140 字符）；② 每轮 3 个**可判定**检查点（本轮第一条工具调用是 `feel_status`；任何写文件前必须已成功派发过子 agent；流转后必须 `feel_dev sync`）；③ 三条三段式禁令（条件 → 必须动作 → 违反形态，含错误码）；④ 状态写唯一通道（五个 `feel_*`）；⑤ 收尾。移出：workflow 模式表 → `feel_flow action=phases`；preflight/退出码/shell 档位/版本号 → 删；dispatch 模板 → `feel_next().dispatch`；细化纪律 → skill 渐进披露。
**代价**：四份同源副本必须同批镜像（`prompt.js`、`src/core/template-loader.ts`、claude/opencode 的 `feel.md`），否则再次分叉。

**T2 运行时提醒与反馈闭环（1–2 天，收益最大）**
① 每次工具结果后附 1 行「阶段 X/相位 Y｜下一步：`subagent(goal=…)`」；② `feel_status` / `feel_next` 的 `next` 改**动作型**（`nextAction.kind ∈ dispatch|command|idle`），不再恒指 `feel_next`；③ 新增 `feel_dev` 把死指令变成可执行动作；④ 易变状态（活跃阶段/相位/待办）走 `systemPrompt.context()`（user 快照、逐请求刷新），**不要**塞进静态 section（静态段一变就失去前缀复用）。
**代价**：每轮固定多 1–2 行 token；注入频率要控（仅写类工具后或每 N=5 步一次）。

**T3 硬门禁（3–5 天，最可靠；本次按用户裁定②不落地角色门）**
主会话禁写源码（读 `exec.agent.session.header.origin !== 'subagent'`，需给审计补 `origin`/`delegationDepth`）；无阶段禁一切非 feel 工具；账本服务端强制。误伤面（只读调研、chore 通道、人类手改）需白名单与逃生阀。
**本次范围内的等价物**：`feel_dispatch` 派发台账 + `feel_status.nextAction` 强提示（T9），不做拒写。

映射到计划：T9（工具面与台账）、T10（提示重写 + 每轮 reminder）、T8（账本服务端同步）。

## 可量化指标与 A/B 判据

指标（先补埋点，再谈遵守率）：
1. `main_write_ratio` = 主会话写源码次数 / 总写次数（**前置条件**：`guard-audit.jsonl` 增加 `origin` / `delegationDepth`）。
2. `subagent_per_req` = 每个需求内 `subagent` 工具调用数。
3. `first_status_step` = 会话首条 `feel_status` 出现在第几步（合规期望 = 1）。
4. `sync_gap` = `.openfeel/dev/.sync.json` 的 `last_sync` 间隔分布（适配器侧已有只读实现）。
5. `violation_rate` = guard deny 数 / 写尝试数，按 `reason` 分组（审计已含 reason）。
6. `ctx_peak` / `compactions` = 上下文峰值与自动压缩次数（`ctx.tokenMeter`）。

**最小 A/B**：2×10 个同规模任务（同模型、同温度、同 workspace 起点）；A = 当前提示词，B = T1（≤1200 字符）+ T2（每步 1 行 reminder）。配对比较上述指标。
**建议判据**：`main_write_ratio` 从 >0.8 → <0.3；`subagent_per_req` ≥ 1；`first_status_step` ≤ 2；`sync_gap` 全部 < 30 min；`violation_rate` 的派发类拒绝应下降、受保护路径类不得上升。
**样本量**：10 对只够看方向；正式结论建议 ≥30 对，并报配对中位数差而非均值（耗时/比例均受极值污染）。

## 未验证项

- **token 数是估算**：未接真实 tokenizer；渲染体积实测为 **5023 字符**（调研摘要记 5008，差 15 字符，未定位差异来源——可能是测量子串不同或期间有改动）。
- **DSH 本体侧证据未复读**：段落顺序（`FEEL_PROMPT_ORDER=40`）、第一方 `SECTION_ORDERS`、`post-execute` 范式、工具结果 `details` 上限等，均来自 `app.asar` 只读解包的调研摘要，行号为解包文本行号。
- **`main_write_ratio` 目前测不了**：`guard-audit.jsonl` 没有记 `origin`，无法区分主会话与子 agent 写入；需先补埋点（T9 的 spike 若读不到 header 则该项继续不可测）。
- **A/B 未跑**：上述阈值是建议判据，不是实测结论；`sync_gap < 30 min` 依赖 T8 落地。
- **KV 缓存与 reminder 代价**：未测"每轮 reminder"对前缀复用命中率的实际影响。
- **副本是否真的同源**：`prompt.js` 与 `template-loader.ts` / claude / opencode 的四份文本当前是否逐字一致，未做 sha256 比对（T10 计划新增 parity 测试）。

## 复现/验证方法

- 体积与结构（本次命令）：`node -e "import('./dsh/lib/surface/prompt.js').then(m=>{const s=m.renderFeelPrompt({language:'zh-CN',feelMode:{value:'enabled'}});console.log(s.length,s.split('\n').length,(s.match(/\*\*/g)||[]).length/2,(s.match(/^## /gm)||[]).length)})"` → 复现 5023 / 79 / 51 / 13。
- 自相矛盾：`git grep -n "自动收口" -- dsh/lib/surface/prompt.js`（对照同处的 done 门口径）；`git grep -n "dev sync\|禁止用 shell" -- dsh/lib/surface/prompt.js`。
- "有提示无后果"：对照 `dsh/lib/adapters/workflow-gate.js:18`（只产出文案）与 `dsh/lib/guard.js:664-667`（唯一硬拒点）。
- 反向鼓励：`git grep -n "一次 edit 改多处\|建 todo" -- dsh/lib/surface/prompt.js`。
- 落地后：`dsh/test/verify.js` 的提示段断言（体积/段落）通过；`feel_status.nextAction.kind` 三态断言；四份副本 sha256 相等（T10 新增 parity 测试）。
