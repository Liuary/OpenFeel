# v1.5.6-stage-115 代码审查报告（openfeel-reviewer 独立审查）

> 审查对象：`src/core/lint-req.ts`、`src/commands/lint.ts`、i18n 双表、SKILL + 生成物、`test/{core,commands}/lint-req.test.ts`、`test/cli/json-contract.test.ts`、`test/commands/knowledge.test.ts`、`docs/{json-contract,commands,VERSIONS}.md`、`CHANGELOG.md`、`REQ-015/017.md`、`dsh/test/verify.js`
> 结论：**需修订**（high 1 / medium 1 / low 7 / blocking 1）
> Feel 自验基线：`lint req` exit 0（169 候选 / 0 A / 0 B / 抑制 29 行）；88 文件 / 2155 用例全绿；`lint i18n` 1057；`lint kb` 0；`dsh verify` 96/96；tsc 0；eslint 32 errors = HEAD 基线（新增行 0）。

## high + blocking

1. **[high][blocking] 带位置参数的合法命令行被判 A 类 → ok:false + exit 1**（`src/core/lint-req.ts:166`）
   - 实测：`openfeel stage set stage-01 --workflow-mode full`（`docs/GETTING_STARTED.md:105/:327` 逐字示例）、`config set-lang en`、`config get workflow_mode`、`model get openfeel-executor`、`knowledge search lint`、`req add lint-check` 全部落 issues。
   - 原因：`stage-01` 符合 token 形态 → 前缀串 `stage set stage-01` → `stage-01` 非子命令 → A。
   - 附加不一致：4-token 上限计的是含 `openfeel` 前缀的串，导致 `openfeel config set-lang en`（A）与 `openfeel config set execution_mode manual`（整体跳过）分类不一致。
   - **Feel 裁定修法（不采纳 reviewer 的三个选项）**：用 commander 的 `registeredArguments` 判定参数起点 + 歧义降级：
     1. 当前节点 `registeredArguments.length > 0` → 后续 token 视为位置参数，通过；
     2. 在「有参数节点」上失败时，若失败 token 命中全局已注册命令名集合 → 降级 **suspect**（advisory）；
     3. 否则视为参数，通过；
     4. 在「无参数节点」上失败 → 仍 **A 类硬错**（保住 `stage deps` / `flow config_sync_stage` / `flow review_add` / `flow stats --json`）。
   - 文案：`命令不存在（断在 X）` → `无法解析为命令路径（断在 X）`（对「命令存在、只是带参数」不是假陈述）。
   - 必测：11 条期望行为表（见 Feel 下发的消息 / plan §4）。

## medium

2. **[medium] REQ-017 正文规则过时**（`:22`、`:44`）：仍写 `^[a-z][a-z0-9-]*$` + 「下划线一律不入候选（天然排除 `plan_review`/`stage-114`/`op-001`）」，与实现（允许下划线）矛盾；`plan_review` 是候选、只因单 token 非根而静默；`stage-114`/`op-001` 从来不是形态排除。`:44` 的「i18n 1048 → +2」失效（实测 1050 → 1057，+7）。

## low

3. 区间状态机（`lint-req.ts:151-157`）：嵌套 start 覆盖 `regionStart`；已开启区间内的「同行 start+end」会提前关闭外层。
4. `suppressedLines` 把孤 `ignore-end` / 自闭合标记行计入「抑制 N 行」，口径需在注释 + §16.5 写清或只计内容行。
5. C10（`lint-req.test.ts:336`）断言真实正文 `suspects: []` 过紧——B 类设计上允许外部工具噪声，应只断言 `issues: []` / `unknownCount === 0` / exit 0。
6. C8（`:231-250`）缺 `--json` 形态锁定：应断言「7 键文档 + stderr 警告 + exit 0」。
7. `docs/commands.md:1132` 表后说明仍写「v1.3.0 快照」，与同节标题（v1.5.6）矛盾。
8. `dsh/ADAPTER.md:16`「v1.3.0 起仍 40 个成功出口」→ 应为 41。
9. `stage-115/status.md` 任务勾选与状态滞后（由 Feel 用 `feel_stage` 同步，禁手改）。

## 已核对通过（不构成问题）

- 正则 `^[a-z][a-z0-9_-]*$`、`takePrefixRun` 停扩展、**无**「整 span 跳过」；5 个反例实测符合预期。
- `ok === (issues.length === 0)` 恒成立（仅 B → ok:true/exit 0；A+B 同行 → ok:false/exit 1）。
- 未闭合区间 → stderr 警告；JSON 恒 7 键无新增键。
- 反引号内标记不生效（REQ-017:31/32 未自抑制；抑制 29 行 = 26 + 1 + 2）。
- 无循环依赖：`lint.ts` 不 import `cli/index.js`；树取 `registerLintCommand(program)` 入参；`core/lint-req.ts` 零 commander。
- 计数自洽：注册 42 / 出口 41 / docs 44；#41 断言七键 + 键序；§16 已登记多 3 键。
- i18n 7 键 zh/en 成对、无重复键、1057。
- REQ-015:11/:18-21 已改正零标记；REQ-017 仅 :11/:50 有有效标记；C10/C12 在 op-003 段且实跑通过；C12 用真实文件副本。
- 36 条新增 = 21 + 14 + 1，无 skip/only，断言到输出与退出码。
- `verify.js` 无条件写合成夹具 + 内容等价断言；`dsh/lib` 与 `dsh/package.json` 零改动。
- 生成物 `template-loader.ts` / `update.ts` 与 SKILL.md 逐字相等（31827 字符，反解转义比对）。
