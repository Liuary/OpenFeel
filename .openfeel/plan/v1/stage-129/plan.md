# v1.5.14-stage-129 计划（REQ-022 / fast 模式）

> 来源：`CultivationOpenRealm/docs/issues/openfeel-feedback-2026-11-07.md`（外部项目两天长会话实测）。
> 范围锁死：只修 **OpenFeel 仓库内可复现、可静态定位**的 OF-02 ~ OF-08；**OF-01 不在本仓**（auto-review 由 DSH 宿主提供，本仓库无该实现，已确认 `grep auto-review` 零命中），README/ADAPTER 不改宿主行为。

## 一、事实与根因（实测 / 源码定位）

| 项 | 根因（已定位） |
|---|---|
| OF-02 | `flow attempt --op op-002`（短 ID）在 `FlowManager.parseOpId`（`src/core/flow-manager.ts:1040`）需要 `stage.op-xxx` 形式，短 ID → `getOp` 返回 null → `recordAttempt` 静默 no-op；命令层仍打印 `[OK] … 已记录`（`src/commands/flow.ts:1425`）。归档不含任何 op 完成标记，`opsSummary.byState` 恒 `pending`。 |
| OF-03 | `.preflight.json` 的窗口硬编码 10 分钟（`src/core/preflight.ts:15`，`dsh/lib/adapters/preflight.js:9`）；长构建后写命令被 strict 拒（`preflight-required`），适配器层没有刷新通道。 |
| OF-04 | `git commit` 只认四相位（`dsh/lib/guard.js:3340` + `allowsWholeTreeWrite`）；版本归档后无活跃阶段（`done`）只剩「纯 `.openfeel/**` 书账」窄口（`:3359`），归档收尾涉及 `docs` / 源码 → 只能新建空阶段。 |
| OF-05 | 未识别命令落第 4 类 `undecidable` → `warn`（`dsh/lib/guard.js:3316-3321`）且**无白名单通道**（文案已写「已按默认策略告警放行」，故事实只有「不可配置」一条）。 |
| OF-06 | `suggestedCommand = legalNextPhases[0]`（`src/commands/flow.ts:238`）：`review_pending` 时第一个合法项是 `review_failed`（失败分支）；`archiving` 只给 `advance --to done`，不提 `stage verify` 前置。 |
| OF-07 | 阶段关联需求全部 done 但阶段仍 `exec_running` 时，`flow next` / `feel_status` 无任何提醒，一直当活跃阶段调度。 |
| OF-08.1 | `truncateCommand(command, limit = 200)`（`dsh/lib/guard.js:420`）截断 `guard.lastDecision.command`，长命令排查信息不足。 |

## 二、改法（逐项，锁定设计；已按计划审查修正）

### OF-02 op 状态落盘（P1）
1. **短 ID 解析**（`src/core/flow-manager.ts`）：`parseOpId` 对无 `.` 的引用依次尝试 ① `pipeline.current.stage` 的同名 op；② 全 stages **唯一**命中；歧义/未命中返回 `null`（不猜）。新增 `resolveOpRef(opId): { opId: string; stageId: string } | null`（或等价公开方法）供命令层拿「全名 + 候选」。
2. **`flow attempt` 未命中必须报错**（`src/commands/flow.ts` attempt 分支）：先 resolve；失败 → stderr 列出可用候选（`<stage>.op-xxx`），非 0 退出；draft 守卫用解析后的 stage（现对短 ID 会打印空 stage）。`recordAttempt` 保持既有返回契约（只写 `state/attempted_at/completed_at`，**不写 checkpoints**——验收不得声称 checkpoints 同步）。
3. **`flow retry` 短 ID 对齐**（`flow.ts:1833` 自带的 `lastIndexOf('.')` 拒绝）：改用同一解析器，消除同仓两套 op ID 语义。
4. **归档前提示**（`flow archive` 人类输出）：判据通过后、写盘前，若该版本待归档阶段存在 `state !== 'done'` 的 op，stderr 逐条提示（不阻断，不影响 `--json` 三键契约）。
5. `feel_op attempt` 无需改：CLI 现在以非 0 退出，适配器 `cli.write` 自会抛 `refusal`。

### OF-03 preflight 长任务（P1）
1. **阈值单源**：`src/core/preflight.ts` 新增 `getPreflightMaxAgeMs(env)`（`OPENFEEL_PREFLIGHT_MAX_AGE_MS` 正整数才生效，缺省 10 分钟），`checkPreflight` 使用它；`PREFLIGHT_MAX_AGE_MS` 保持导出（测试锚点）。`src/core/process-health.ts:172` 的默认参数改走 `getPreflightMaxAgeMs()`，避免 `flow health` 与闸门漂移。
2. `dsh/lib/adapters/preflight.js` 按同一 env 计算 `ok`（JS 侧独立读取，阈值语义与 CLI 文档同步）。
3. **适配器写前自愈一次**（`dsh/lib/adapters/cli.js` `write()`）：本地账本缺失/过期时，先 `this.run(['flow','next','--json'], { cwd: options.cwd ?? this.cwd })` **吞异常**（无 flow.json 时 `flow next` 会 `NO_INIT`），再执行写入。**禁止递归调用 `write()`**；刷新失败照旧执行，让 CLI 拒绝作权威。
4. 文档：ADAPTER.md / prompt 的 preflight 段补 `OPENFEEL_PREFLIGHT_MAX_AGE_MS`，并写明「自愈只在本地账本过期时触发，刷新即真实读状态」。

### OF-04 归档收尾提交（P1）
1. `dsh/lib/guard.js` 整树写分支：**纯书账窄口保持在前**（既有 `git-commit-bookkeeping` 优先），其后新增 **`git-commit-idle`** 放行理由——单条直连 commit + 无 repo 改写（`-C`/`--git-dir`/`--work-tree`/非白名单 `GIT_*`）+ 无 `-c`/`--config-env` + 可判定 + **flow 可读且无任何非 done 阶段** +（`stages` 空集 **或** `pipeline.phase === 'done'`）+ 实际仓库根 = 工作区自身（复用 `inspectCommitBookkeeping` 的 `repoMismatch`）。
   - 语义：`done` 阶段（归档后）与「归档后无阶段」两种收尾场景可提交；`stages` 非空且 phase 非 done（有活跃阶段）仍走原四相位判定。
   - 夹具兼容：既有 `done` 负例（`gitProject` + 单个 done 阶段、无 `pipeline` 键）不满足 idle 条件 → 仍拒；`noStageFlow` + 纯 `.openfeel/**` 因书账在前 → reason 仍 `git-commit-bookkeeping`。
2. 保持四相位放行与书账窄口不变；`plan_*`/`scheme_*`/`review_pending`/`test_pending` 等**有活跃阶段**时仍拒。
3. `flow archive`（人类输出）在写盘前 `git status --porcelain` 非空时提示「先提交再归档」；`--json` 不变。
4. 文档说明：与 `flow advance --to done` 可能自带的自动提交分工，避免重复提交（ADAPTER.md / prompt）。

### OF-05 undecidable 白名单（P2）
1. `OPENFEEL_SHELL_ALLOW`：`||` 分隔的**整条命令**白名单；比较前折叠空白，**整条全等**才算命中（禁止子串——否则 `rm -rf x && npm run build` 会被顺带放行）；命中且分类为 `undecidable`/`warn` → 放行，审计 `decision: allow, reason: shell-allowlisted`。
2. 现状文案（`dsh/lib/guard.js:3319`）已含「已按默认策略告警放行」→ **不再改文案**（OF-05 的事实只有「无白名单通道」成立）。
3. 不把白名单挂到 `deny` 判定（编码/间接执行、受保护路径、openfeel 写命令、有活跃阶段的整树写**永不**被白名单绕开）。

### OF-06 建议命令一致性（P2）
1. 通过路径优先：`review_pending` → `review_passed` 优先于 `review_failed`；`test_pending` → `test_passed` 优先于 `test_failed`；其余保持 `legalNextPhases[0]`。`legalNextPhases` 数组顺序**不变**（测试有 `toEqual`）。
2. `archiving`：`suggestedCommand` 仍 `advance --to done`，guards 新增前置提示「先 `openfeel stage verify --stage <id> …`，否则 done 门拒绝」。
3. `dsh/lib/adapters/dashboard.js` `planNextStep`：`toolCall.arguments.to` 改为从 CLI 权威 `suggestedCommand` 解析 `--to <phase>`，失败才回退 `nextPhases[0]`。

### OF-07 悬挂阶段提醒（P2）
`flow next`（人类 + `--json` guards 末位）新增：**要求 ≥1 条关联需求**（空集不触发），且全部为终态（复用 `isTerminalRequirementStatus`，禁止第二份状态表），阶段相位 ∈ {exec_running, review_passed, test_passed} 时，提示「关联需求已全部完成，可考虑阶段收口/归档」。与 OF-06 的 archiving 前置提示定序：archiving 提示在前、悬挂提示在后（固定末位顺序）。

### OF-08.1 截断放宽（P3）
`truncateCommand` 缺省上限 200 → 500（`lastDecision` 与审计共用）；同步把 `dsh/test/guard.js` 的 `≤200` 断言改用 >500 字符夹具。

### 明确不做
- OF-01（DSH 宿主 auto-review）、OF-08.2（由 OF-02 自然消失，不改字段名）、OF-08.3（模板 `待补充` 语义：保留告警，避免把未填充伪装成已填充）。

## 三、文件清单

| 文件 | 动作 |
|---|---|
| `src/core/flow-manager.ts` | 短 op ID 解析 |
| `src/commands/flow.ts` | attempt 未命中报错 / suggestedCommand 优先级 / archiving verify 前置提示 / archive 未完成 op + 脏区提示 |
| `src/core/preflight.ts` | 窗口 env 可配（`getPreflightMaxAgeMs`） |
| `src/core/process-health.ts` | 默认参数改走 `getPreflightMaxAgeMs()`（单源） |
| `dsh/lib/adapters/preflight.js` | 同窗口语义（env） |
| `dsh/lib/adapters/cli.js` | 写前 stale preflight 自愈一次 |
| `dsh/lib/adapters/dashboard.js` | `planNextStep` 的 `toolCall` 跟随 CLI `suggestedCommand` |
| `dsh/lib/guard.js` | idle commit 通道 / 白名单（不改 warn 文案）/ 截断 500 |
| `dsh/test/guard.js`、`dsh/test/integration.js` | 新增用例 + 受影响旧断言（≤200 / done 负例）更新 |
| `src/core/i18n-data/zh-CN.ts`、`en.ts` | 新提示键（中英双语） |
| `test/commands/flow.test.ts`、`test/commands/preflight-gate.test.ts` 等 | 新增/更新用例 |
| `dsh/ADAPTER.md`、`dsh/lib/surface/prompt.js`、`docs/commands.md` | 文档同步（10 分钟表述 / 白名单 / idle commit） |
| `CHANGELOG.md`、`docs/VERSIONS.md`、`README*.md`、`package.json` / `dsh/package.json` / `package-lock.json` | 版本 1.5.14 收口 |
| `src/core/templates-data/skills/openfeel-cli-usage/SKILL.md` + `npm run build` | 能力串同步（注入副本由 build 生成） |

## 四、验收（可复验）

1. `flow attempt --op op-00x`（短 ID，当前阶段内）→ `state=done`、`attempts=1`、`attempted_at/completed_at` 有值；不存在/歧义 → 非 0 退出且 stderr 列出候选，不再打印成功；`flow retry --op op-00x` 同样接受短 ID。
2. `flow archive` 对未完成 op 有提示且退出码 0（不改变判据）；脏区提示不影响 `--json`。
3. `OPENFEEL_PREFLIGHT_MAX_AGE_MS=1800000` 下 20 分钟旧账本仍 `ok`（`flow health` 与 `flow next` 同判定）；适配器在过期账本上执行一次写命令 → 自动刷新后成功。
4. `dsh/test/guard.js`：`done` 阶段或无阶段 + 真实仓库 + `docs/**` 待提交 → `git-commit-idle` 放行；有 `plan_review` 活跃阶段 → 仍拒；纯 `.openfeel/**` 仍 `git-commit-bookkeeping`；`OPENFEEL_SHELL_ALLOW` 整条命中放行、子串不命中；编码/间接执行与受保护路径不受影响。
5. `flow next`：`review_pending` 建议 `--to review_passed`；`archiving` guards 含 verify 前置；关联需求全完成（≥1 条）时 guards 含收口提示；`legalNextPhases` 顺序不变。
6. `npm test` 全绿（基线 2358 用例）；`node dsh/test/guard.js`、`node dsh/test/integration.js`（可跳过）、`node dsh/test/contract.js`、`node dsh/test/verify.js` 全绿；`npm run build` 通过一致性校验；`node bin/openfeel.js lint i18n` 通过。

## 五、风险

- **R1（高）** idle commit 通道会放宽「done 一律拒」的既有语义 → 锁死条件（无活跃阶段 + 空 stages 或 `pipeline.phase==='done'` + 六项约束），并保留既有 `done` 负例夹具（有 stages 无 pipeline 键 → 仍拒）。
- **R2（中）** `parseOpId` 全局唯一搜索可能把「另一个阶段同名 op」误解析 → 先当前阶段、再唯一命中、歧义即 null，且测试覆盖歧义用例。
- **R3（中）** `flow next` guards 追加会打乱既有 order 断言 → 固定在末位追加（archiving 提示先于悬挂提示），按需更新测试。
- **R4（低）** preflight 自愈会把「agent 未读状态」的证据刷新掉 → 只在本地账本过期时触发，刷新即真实 `flow next`，`preflight` 段仍可见年龄；`OPENFEEL_PREFLIGHT_MAX_AGE_MS` 给长构建留出显式窗口。
