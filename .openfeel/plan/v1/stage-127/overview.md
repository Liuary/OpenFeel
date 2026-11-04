# v1.5.12-stage-127

## 目标

v1.5.11 门禁加固的**收尾批次**：修 5 个已实证缺陷，让门禁自证「可信」而不是「恒 stale」，并让测试不再污染真实宿主状态。

1. **A（P1，主因）** `guard-state` 身份字段与 stale 判定：`pid` / `hostStartedAt` / `loaded_hash` 只来自当前进程注册值，不再从旧工作区文件继承；`stale` 只按三元组对 `~/.openfeel/adapter-host-dsh.json` 判定，HMAC 失配降级为佐证（`hmac-warn`），不判 stale。
2. **B（P1）** dsh 测试隔离：全局 guard 目录新增 `OPENFEEL_GUARD_DIR`（宿主 marker 沿用 `OPENFEEL_ADAPTER_HOST_PATH`），测试统一指到临时目录，并断言跑完测试后真实 marker / 全局目录未被修改。
3. **C（P1）** 无活跃阶段时允许 `git commit` 提交「纯书账」：待提交路径集合全部落在 `.openfeel/` 内才放行（新 reason `git-commit-bookkeeping`），其余整树写维持拒绝。
4. **D（P2）** `setup --tools dsh --dsh-profile X` 显式指定 profile 时提示「仅部署了 X，其余保持原样」，默认（全部部署）行为不变。
5. **E（P2）** `feel_status` 标题按 `workflowGate.reason` 取文案：`guard-stale` / `guard-inactive` / `guard-cwd-unresolved` 不再误报「无活跃阶段」。

验收口径（真机可复验）：重启后 `feel_status.guard.stale === false` 且 `hostStartedAt === marker.started_at`；跑完 dsh 测试后真实 marker 字节不变；两阶段 done 时纯 `.openfeel/**` 提交成功、混入源码仍拒；多 profile 显式部署出现一行提示；门禁原因标题与原因一致。详见 `plan.md` §5。

## 依赖

无

## 操作方案

3 个 op，默认串行执行（op-001 / op-002 都改 `dsh/test/guard.js`，避免同文件冲突）：

- **op-001 — A + B（guard 状态身份自证 + 测试隔离）**
  文件：`dsh/lib/adapters/guard-state.js`、`dsh/lib/index.js`、`dsh/ADAPTER.md`、`dsh/test/{guard,verify,integration,contract}.js`。
  要点：新增 `setGuardRuntimeIdentity`（宿主启动时以当前 marker 写入进程内注册值）；`writeGuardState` 合并时**剥离旧文件的身份三键**、优先级 `patch > 运行时注册值 > 全局注册段兜底`；`guardStateDistrust` 改为「先三元组、后验签」，验签失败返回 `hmac-warn`（不判 stale）；`buildGuardSection` 新增 `signature` / `signatureWarning`；`globalGuardDir()` 支持 `OPENFEEL_GUARD_DIR`；测试顶部隔离 env 并新增「真实 marker 未被修改」断言。

- **op-002 — C（纯书账 git commit）**
  文件：`dsh/lib/guard.js`、`dsh/test/guard.js`。
  要点：`commit` 分类补 `gitSubcommand:'commit'`；新增 `commitOnlyOpenfeelBookkeeping()`，用 `git -c core.quotePath=false diff --name-only HEAD` ∪ `git ls-files --others --exclude-standard` 的路径集合判定是否全在 `.openfeel/` 内（无法判定 → 拒绝）；仅在 `allowsWholeTreeWrite` 拒绝后、`gitSubcommand === 'commit'` 时放行并记 `git-commit-bookkeeping`；其余整树写零放宽。

- **op-003 — D + E（多 profile 提示 + 门禁原因标题）**
  文件：`src/core/dsh-profile.ts`、`src/core/setup.ts`、`src/commands/setup.ts`、`src/core/i18n-data/{zh-CN,en}.ts`、`dsh/lib/adapters/workflow-gate.js`、`dsh/lib/tools/index.js`、`dsh/test/verify.js`、`test/{commands/setup,core/dsh-profile}.test.ts`。
  要点：`planDshDeployment` 返回 `allProfiles`，`SetupResult.dsh` 透传 `allProfileNames`；`setup` 在「≥2 profile 且指定了 `--dsh-profile`」时向 stderr 输出一行提示（新 i18n 键 `setup.dshProfileNarrowHint`）；新增 `workflowGateTitle()` 供 `feel_status` / `feel_next` 共用，`computeWorkflowGate` 契约不动，`guardWarnings` 避免与标题重复。

回滚：op 粒度文件集基本不重叠，任一 op 可单独 revert；详见 `plan.md` §6。
