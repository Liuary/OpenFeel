# 版本能力概览 — OpenFeel

> 本文是**面向用户的版本能力概览**：每个版本「是什么、能做什么、如何升级」。
> 逐版本完整明细（Added / Changed / Fixed、技术细节、阶段 ID）见 [CHANGELOG.md](../CHANGELOG.md)。
> 两者分工：**VERSIONS = 用户视角摘要；CHANGELOG = Keep a Changelog 明细**。本文不记录测试计数与内部审查编号。
> 覆盖范围：README 曾展示的版本（v1.1.2 起）；更早版本（v1.0.0 / v1.1.0 / v1.1.1）见 [CHANGELOG.md](../CHANGELOG.md)。

## 发布节奏（批次发布，v1.5.3 起）

- **小功能与补丁合并到同一批次**：一个版本只做一组相关改动，完成后统一 push + CI publish；禁止「做完一个小功能就发一版」。
- **批次开始时锁定范围**：REQ + 阶段任务即范围；中途新增项记入下一批次（紧急缺陷除外）。
- **版本号**：批次默认 `patch`；含用户可见新能力/契约变更时 `minor`；发布前必须全门禁通过（测试 / dsh / tsc / i18n / kb / build ×2）。
- **紧急例外**：安装/发布/安全类阻断可单独 patch，但需在 CHANGELOG 标注并评估同批次未完成项。

## English highlights

OpenFeel is a CLI for AI-agent development process governance. Recent releases:

- **v1.5.15** — Owner-resolution fix: a persisted `"user": "unknown"` sentinel in `.openfeel/.info.json` no longer blocks the fallback to `git config user.name`, so `feel_req claim` works without an explicit `--owner` again; `ensureInfoJson` also heals such existing files when a git identity is available (never writes `unknown` as a result).
- **v1.5.14** — Feedback-fix batch from a two-day external session: op results actually land now (`flow attempt` / `flow retry` accept short op IDs, and mismatch/ambiguity fails loudly with candidates instead of a silent no-op), the preflight window is configurable (`OPENFEEL_PREFLIGHT_MAX_AGE_MS`) and the DSH adapter self-heals a stale ledger once before a write, an archive-idle `git commit` channel (`git-commit-idle`) covers the post-archive cleanup commit, `flow next` prefers the pass path (`review_passed` / `test_passed`) and warns before `archiving → done` (run `stage verify`) and when all linked requirements are terminal, `OPENFEEL_SHELL_ALLOW` whitelists exact undecidable shell commands, and guard audit/`lastDecision` commands keep 500 chars instead of 200.
- **v1.5.13** — Commit-phase widening: `git commit` is now allowed in `exec_running|review_passed|test_passed|archiving`, so you can commit right after review or test pass instead of first advancing to `archiving` (the write side is unchanged — source writes still require `exec_running`, and `review_pending` / `test_pending` / `*_failed` / `plan_*` / `scheme_*` / `done` stay rejected, with a commit-specific denial message that lists the four allowed phases). Also fixes the `openfeel-cli-usage` skill frontmatter being truncated at a bare `#` ("exit #43" → "exit No.43"): the parsed `description` grows from 2455 to 2766 chars, so the v1.5.10 / v1.5.11 / v1.5.12 capability chains finally appear in the skill's frontmatter, with a new S6 regression test using the production `splitFrontmatter` and a frontmatter-only `/\s#/` check.
- **v1.5.12** — Guard recovery & git boundaries (fixes the `guard.stale`-never-recovers bug reported by an external project): the guard marker's identity keys (`pid` / `hostStartedAt` / `loaded_hash`) now come only from the current runtime and `stale` is decided by `pid` + `loaded_hash` alone (the `host-started-at` false positive is gone; an HMAC mismatch downgrades to `hmacWarn` instead of `stale`) — **deleting `guard-state.json` is no longer needed**. Supported self-heal repairs only dead-pid states (live foreign pids and `loaded_hash` mismatches stay untouched) and is also available explicitly on the DSH side via `feel_verify action=health fix=true` (missing/incomplete marker → `marker-incomplete`, zero writes). Also: dsh test isolation via `OPENFEEL_GUARD_DIR`, a seven-condition allowance for pure bookkeeping `git commit` (all pending paths under `.openfeel/**`), a whitelist for the git external-execution surface (`-c` / `--config-env` and `GIT_*`), a multi-profile notice for `setup --tools dsh`, and `feel_status` / `feel_next` headlines that no longer say "no active stage" for guard reasons.
- **v1.5.11** — Write-gate hardening (shipped together with v1.5.10 as npm **1.5.11**; `1.5.10` was not published on its own): shell tools (`bash` / `pwsh`) are now gated with four outcomes — hard-deny protected paths and `openfeel` write commands, judge source / git-workspace writes by target, exempt build artifacts (`npx vitest` / `npm run build` / `git status` keep working), and warn when undecidable; the protected-path list grows (`chore.json`, `dev/.preflight.json`, `dev/sessions.json`, `dev/guard-state.json`, `pipeline.yaml`, `config.yaml`, `metrics.json`, `flow-archive/**`, `checkpoints/**`, `requirements/*.md`, `log/guard-audit.jsonl`, `dsh/cordis.patch.yml`); doc/asset exemptions no longer apply inside code directories; Win32 path normalization (trailing dots / ADS / 8.3 short names); six-link cwd resolution with fail-closed and a `guard-state.json` self-check (`pid` / `loaded_hash` / HMAC) surfaced as `feel_status.guard`; `chore` shrinks to a human-only channel (30-minute cap, `--source` required for source writes, `--ttl-min 1..30`).
- **v1.5.10** — Project dashboard: `openfeel dashboard [--json] [--out] [--open]` aggregates requirements / stages / release gates / archives / blocking REVs / health / metrics into a single self-contained HTML file (default `.openfeel/tmp/dashboard.html`; zero external links, zero network, zero executable scripts); `dashboard --json` is JSON exit #43 (contract at 43 success exits / 44 registered `--json` options).
- **v1.5.9** — Cleanup batch: manual/template/skill snapshots refreshed to v1.5.8, eslint errors cleared (35 → 0), v1.5.7 version archive backfilled, and pitfalls fixed (README capability text, adapter `sessions.stage` clearing semantics, `chore.json` ignored).
- **v1.5.8** — Requirement-first batch: archiver gathers completed requirements, writes `docs/releases/<version>.md` and harness-aware skills; stages hold multiple requirements (`requirements[]`); multi-session P0 (sessions registry, auto-commit pollution guard, current-stage rule, `feel_status.sessions`); completion requires review + verification evidence at both requirement and stage level; completed requirements travel into version archives with a monotonic `last_req_seq` counter, plus `req release-check` / `req rollover` (carried_from) and an `--allow-unfinished` archive gate.
- **v1.5.7** — Requirement-first release: a stage is a long-lived **version container** (stays in `exec_running`, holds many requirements); requirement completion is decoupled from stage closure (`req advance --to done` works with zero linked stages, or while linked stages are at/after `exec_running`); stages are archived/released only after the user confirms. Adapter prompt and gates now say so, and `feel_status` defaults to a compact snapshot (`detail: "full"` for the full one). Also: `plan stage add` / `flow stage add` refuse to silently reuse an archived stage's plan directory.
- **v1.5.6** — Batch release: preflight now covers all state-write commands (34 commands / 36 gate sites in one shared helper), `--dry-run` is never gated (10 commands), `flow repair` / `flow checkpoint restore` stay usable when `flow.json` is unreadable, and strict rejections are zero-write (including `flow.json.bak` and `config.yaml`). Also new: `openfeel lint req` (JSON exit #41) validates command names in requirement bodies against the real command tree (A-class blocking / B-class advisory), with in-line and region suppression markers. Process-health proxies (`flow metrics`): resumed ratio / `plan_pending → plan_review` dwell / last-preflight age in the human block only (`--json` unchanged), plus adapter `observability` (`feel_status`/`feel_next`), with zero runtime overhead and no self-measurement.
- **v1.5.5** — Batch release: CLI preflight ledger (`flow next` / `flow status` record `.preflight.json`; write commands check a 10-minute window), adapter defaults to strict preflight (`feel_status`/`feel_next` expose `preflight`), prompt bans shell state-write commands and requires independent review (self-review must be marked).
- **v1.5.4** — Batch release: stage log summaries (`flow log`: last transition / last error / resume count), adapter snapshot `revision` / `stale`, observability metrics (`flow metrics`: log entries/bytes), and a gate-abuse hint when a stage sits in `plan_pending` for more than 10 minutes. No JSON contract changes.
- **v1.5.3** — Batch release: dispatch/return contract (`feel_next.dispatch`: goal/context/boundaries/returnFormat; subagents never read state files, return ≤10 lines), recovery bundle (`feel_status.recovery`: lastTransition / handoff / nextAction), structured handoff (`done / next / block`) and no-op sync when state is unchanged. Release cadence is now batched (see "发布节奏").
- **v1.5.2** — Workflow entry gate: `feel_status`/`feel_next` expose `workflowGate` when no stage is active; `docs/research/**` writes are rejected without an active stage (chore cannot bypass), with a denial audit event. Includes the dispatch/persistence research doc and the 1.5.3/1.5.4 iteration plan.
- **v1.5.1** — Release hotfix: the v1.5.0 release script accidentally rewrote `natural-compare` in `package-lock.json` to a non-existent `1.5.0`, breaking CI `npm ci`; the lock is repaired (functionality identical to v1.5.0).
- **v1.5.0** — Workflow slimming: only Feel writes state (`dev_last*` / `dev/current.md` / `status.md` / `flow.json`); subagents never read or write them; logs are no longer mandatory (brief records only, flow log capped at 200); status records update at start / turning point / end or every 30 minutes via `openfeel dev sync` (CLI auto-syncs on `flow advance`); `feel_next`/`feel_status` expose `statusSync.due`.
- **v1.4.0** — Write-gate tiering + `chore` micro-change channel: static presentational assets (`.css/.scss/.html/.svg/.png/.jpg/.jpeg/.webp`, `assets/**`, `public/**`) are writable in any phase like docs (mixed targets stay strict); `openfeel chore "<note>"` opens a 1-step, 60-minute write window without creating a stage (no `flow.json.stages` entry; `--end`/`--status`), and guard writes an audit line for every exemption.
- **v1.3.5** — Unified shell-tool guidance: on Windows prefer `bash` (Git Bash), then `pwsh` (PowerShell 7); macOS/Linux use `bash`; avoid defaulting to `cmd.exe`. Added to the DSH Feel system prompt and the OpenFeel global constraint templates (`agents-md` / `claude` constraint / `openfeel-tool-usage` skill).
- **v1.3.4** — Distribution-chain fixes: the DSH `feel_flow review_add` now forwards `--stage` (stage-level REVs work without ops); `openfeel setup --check` gains a `restart-required` state (adapter fingerprint deployed vs loaded) so upgrades no longer loop; `setup --tools dsh` now refreshes `update_state.json` even when profiles are already up to date.
- **v1.3.3** — Fast-mode structural fixes from field feedback: stage-level review entries (`flow review add --stage`) so reviews work without ops; rework edge `review_passed → exec_running` (`flow advance --reason`); risk-tiered write guard (new files in an uninitialized workspace, `docs/**` and doc/note paths allowed; source still requires `exec_running`); `plan stage add` focuses atomically; status.md becomes a derived view; stage-ID ↔ plan-directory mapping documented.
- **v1.3.2** — DSH activation + write guard: `ctx.tools.guard()` denies `edit` / `write` / `apply_patch` / `str_replace_editor`; non-OpenFeel workspaces get a bootstrap prompt, and `enforce=always` blocks writes until `openfeel init` (`project` / `off` opt-out).
- **v1.3.1** — DSH deploy hotfix: `setup --tools dsh` now runs `pnpm install` with `--no-frozen-lockfile`, so stale profile lockfiles no longer block deployment.
- **v1.3.0** — The DSH adapter now ships inside the `openfeel` package; `openfeel setup --tools dsh` installs it into DSH profiles. README was slimmed: version notes moved here.
- **v1.2.4** — Data-safe `archive <stage>` overwrite protection (`ARCHIVE_EXISTS` / `--force`), JSON output for the remaining read commands, and `config get --all`.
- **v1.2.2 / v1.2.3** — Machine-readable JSON contract (`flow next`, error envelopes, exit codes 0/1/2/3) and its concurrency/test-seam fixes.
- **v1.2.1** — Requirement intake/splitting (`req`), three workflow modes (`full` / `fast` / `general`), review tiers.
- **v1.2.0** — Version-shard archiving (`flow archive`) and requirement flow (`req`).
- Upgrade: `npm i -g openfeel@latest` → `openfeel setup` → restart the harness.

## v1.5.15 — owner 缺省链修复（unknown 哨兵回落 git config）

- **问题**：`.openfeel/.info.json` 一旦持久化成 `{"user":"unknown"}`（init 时 git 未配置），`getUserName` 会把它当真实用户名直接返回，**不再回落 `git config user.name`**，于是 `feel_req claim` 永远要求显式 `--owner`。
- **修复**：`unknown`（trim + 大小写不敏感）与空串都视为「未解析」，继续读 `git config user.name`；两源皆无时才返回哨兵 `unknown`，`req claim` 仍给出「请显式传 --owner」的可操作提示。
- **自愈**：`ensureInfoJson` 遇到已存在的 `user` 为空/`unknown` 且 git 身份可用时写回真实用户名（`lang` 与正常用户值不覆盖；git 不可用时不写 `unknown`）。

## v1.5.14 — 外部长会话反馈修复（op 落盘 / preflight / 归档收尾 / 门禁体验）

- **op 结果真正落盘（OF-02）**：`flow attempt --op op-001` / `flow retry --op op-001` 支持当前阶段短 ID（当前阶段优先 → 全 stages 唯一命中）；未找到或歧义会列出候选并非 0 退出，不再「打印成功但什么都没写」。`flow advance --op` 回显解析后的 `stage.op`。
- **归档前可见性**：`flow archive` 人类模式会在写盘前提示候选阶段内未完成的 op 与工作区未提交改动；`--json` 载荷不变。
- **长任务不再被 preflight 打断（OF-03）**：窗口可用 `OPENFEEL_PREFLIGHT_MAX_AGE_MS` 放宽（缺省仍 10 分钟），CLI / `flow health` / 适配器同源；适配器写命令前若账本过期，会先真实读一次状态再写。
- **归档后可以收尾提交（OF-04）**：新增 `git-commit-idle`——无活跃阶段（`stages` 空或 `pipeline.phase=done`）时，单条直连且无仓库改写的 `git commit` 可提交 docs/源码收尾（纯 `.openfeel/**` 仍走书账窄口）。
- **建议命令与提醒更准（OF-05 ~ OF-08）**：`flow next` 建议改走通过路径（`review_passed` / `test_passed`），`archiving` 前提示先 `stage verify`，关联需求全部终态时提示阶段可收口；`OPENFEEL_SHELL_ALLOW` 可白名单**整条**不可判定命令；门禁审计命令截断 200 → 500 字符。

## v1.5.13 — 提交相位放宽与 skill frontmatter 修复

- **`git commit` 允许相位扩展**：`exec_running|archiving` → **`exec_running|review_passed|test_passed|archiving`**。审查通过或测试通过后即可提交，**不必先推进到 `archiving`**；写侧未放宽（源码写与整树 git 写仍只认 `exec_running`），未通过相位（`review_pending` / `test_pending` / `*_failed` / `plan_*` / `scheme_*` / `done`）仍拒，拒绝时会按 commit 分叉并列出四个允许相位。
- **`openfeel-cli-usage` skill frontmatter 修复**：`SKILL.md` 的 `description` 是未加引号 YAML 标量，`出口 #43` 里的裸 `#` 被当成注释起点，解析值停在 2455 字符——v1.5.10 / v1.5.11 / v1.5.12 三段能力串与触发末句全部丢失。改为 `出口 No.43` 后解析长度回到 **2766**，能力串全部可见；并新增 S6 回归测试（生产 `splitFrontmatter` + 2766 长度锚 + frontmatter 段专属 `/\s#/` 阴性断言 + 注入副本同步）。

## v1.5.12 — 门禁自愈与 git 边界（`guard-stale` 修复）

- **修复 `guard.stale` 重启后永久为 true**（外部项目报告的缺陷）：`guard-state.json` 的身份三键（`pid` / `hostStartedAt` / `loaded_hash`）只来自当前运行时，不再继承旧文件；`stale` 判定只认 `pid` + `loaded_hash`，删除 `host-started-at` 误报（多 profile / 多宿主下时间比较必然误报），HMAC 失配只降级为 `hmacWarn` 可见提示、不再判 stale。**此刻起不再需要删掉 `.openfeel/dev/guard-state.json` 来恢复门禁。**
- **受支持自愈**：重启后首次任意 `feel_*` 自动修复（只针对 `pid` 缺失 / `pid` 已死的陈旧状态；活异 pid 与 `loaded_hash` 失配保持不动——前者防多宿主互写，后者是「适配器已更新但宿主未重启」的信号）；DSH 侧显式入口 `feel_verify action=health fix=true`（`dry_run` 零写盘，结果见 `data.health.guardRepair`）；marker 缺失 / 不完整 → 明确报 `marker-missing` / `marker-incomplete` 且零写盘；`OPENFEEL_GUARD_SELF_HEAL=off` 可关闭自动自愈。
- **dsh 测试隔离**：新增 `OPENFEEL_GUARD_DIR`（沿用 `OPENFEEL_ADAPTER_HOST_PATH`），四套 dsh 测试不再覆写真实宿主的 marker / guard-state。
- **`git commit` 纯书账放行**：单语句、直连 git、无重定向与进程替换、无 `-c` / `-C` / `--git-dir` / `--work-tree`、无改写仓库的 env、无不可判定形态、且待提交路径全在 `.openfeel/**` —— 七条件全满足才放行。
- **git 外部执行白名单**：`-c` / `--config-env` 与 `GIT_*` 环境前缀改为白名单（只放 `user.name` / `user.email` / `color.*` / `core.quotepath` / `core.autocrlf` / `core.safecrlf` / `i18n.*` 与 `GIT_AUTHOR_*` / `GIT_COMMITTER_*` 六项），其余硬拒。
- **可读性修复**：`setup --tools dsh` 在显式 `--dsh-profile` 且还有其他 profile 时于 stderr 提示「其余保持原样」，`SetupResult.dsh.profileScope` 记录 deployed / skipped；`feel_status` / `feel_next` 不再把 `guard-stale` 等门禁原因误报成「无活跃阶段」。

## v1.5.11 — 写入门禁加固（shell 守卫 / 受保护路径 / fail-closed / chore 收窄）

- **与 v1.5.10 同批发布**：npm 上线版本为 **1.5.11**，`1.5.10` 未单独发布。
- **shell 纳入守卫**：`bash` / `pwsh` 四类判定——受保护路径与 `openfeel` 写命令**硬拒**；源码与 git 工作区写按目标判定；构建产物（`dist` / `build` / `out` / `target` / `.next` 等）豁免；不可判定只告警。`npx vitest` / `npm run build` / `git status` 不误杀。
- **受保护路径扩展**：`chore.json`、`dev/.preflight.json`、`dev/sessions.json`、`dev/guard-state.json`、`pipeline.yaml`、`config.yaml`、`metrics.json`、`flow-archive/**`、`checkpoints/**`、`requirements/*.md`、`log/guard-audit.jsonl`、`dsh/cordis.patch.yml` 只能经 CLI 写入，堵住 agent 手写状态文件自提权。
- **豁免收窄**：代码目录（`src` / `test` / `scripts` / `dsh` / `bin`）内 `.md` / `.css` / `assets/*` 不再按文档放行——先判目录、再判扩展名。
- **cwd 六环 + fail-closed**：解析不到工作区时显式拒绝并自我暴露（`guard-state.json` 落 `os.tmpdir()` 全局路径 + stderr 告警），不再静默放行；`.openfeel/dev/guard-state.json` 记录 `pid` / `loaded_hash` / HMAC，`feel_status` / `feel_next` 的 `guard` 段对不上即 `stale`。
- **Win32 路径归一化**：尾点 / ADS / 8.3 短名在判定前归一，路径别名不再绕过。
- **`chore` 收窄为纯人类通道**：窗口上限 30 分钟（`--ttl-min 1..30`），源码写入须显式 `--source`。
- **升级**：`npm i -g openfeel@latest` → `openfeel setup` → **完全退出并重启宿主**（guard 只在宿主重启时重新注册）。详见 [CHANGELOG](../CHANGELOG.md#1511---2026-11-04)。

## v1.5.10 — 项目看板（dashboard）

- **新增 `openfeel dashboard [--json] [--out <file>] [--open]`**：聚合需求看板（7 状态）/ 阶段进度 / 版本发布门与归档历史 / 阻塞 REV 与流程健康，默认生成**单文件自包含 HTML**（`.openfeel/tmp/dashboard.html`），零外链、零网络请求、零可执行脚本，双击 `file://` 即可打开。
- **`dashboard --json`（成功出口 #43）**：10 键固定序；与 `--out` / `--open` 互斥；**快照命令**（`health.ok=false` 仍 exit 0）。
- **兼容性**：JSON 契约升为 **43 成功出口 / 44 注册 `--json` 选项**；既有 42 个出口零改动。
- **与 v1.5.11 同批发布**：`1.5.10` 未单独发布。
- **升级**：`npm i -g openfeel@latest` → `openfeel setup`。详见 [CHANGELOG](../CHANGELOG.md#1510---2026-11-04)。

## v1.5.7 — 需求导向：阶段长期开启 + 需求完成与阶段关闭解耦

- **阶段 = 版本容器**：默认按当前小版本开一个阶段并**保持 `exec_running`**，一个阶段容纳多个需求；不再「每做一个需求就建/推进/关闭阶段」。无开启阶段时才开新阶段。
- **需求完成与阶段关闭解耦**：`req advance --to done` 在零关联阶段时可直接完成，或关联阶段已进入 `exec_running` 及之后相位（`plan_*` / `scheme_*` 仍拒绝）；聚合自动收口语义不变（零关联仍不误判）。
- **归档 / 发布只在用户确认后**：只有用户明确「归档/发布这个版本」时才推进阶段到 review/test/archiving/done 并 `feel_archive create`；AI 可在需求规模足够时**建议**归档，但不得自行归档或发布。
- **适配器**：提示段、`workflowGate` 与写入门禁文案改为需求导向；`feel_status` 默认 compact（`detail:"full"` 取全量，转移表用 `feel_flow action=phases|mode` 现取）。
- **阶段目录防复用**：`plan stage add` / `flow stage add` 目标目录已被其它阶段（完整 stageId）占用或该阶段已归档时拒绝，并给出建议新编号。

## v1.5.6 — 批次：preflight 写命令全覆盖 + 需求正文命令名校验

- **需求正文命令名校验（新增）**：`openfeel lint req [--json]` 扫 `.openfeel/requirements/*.md` 里的行内反引号命令名，剥 `openfeel` 前缀后沿**真实命令树**解析。**A 类**（命令路径无法解析，如 `stage deps` / `flow review_add`）→ 报错并 **exit 1**；**B 类**（疑似命令组 / 参数写成命令名，如 `op create` / `archive create`）→ 只提示、**exit 0**（advisory 永不阻塞）。带位置参数的正常写法**不会误报**（`openfeel stage set stage-01` / `config get workflow_mode` / `model get openfeel-executor`）。`--json` 恒七键（比其它 lint 出口多 `suspects` / `unknownCount` / `suspectCount`）。
- **抑制标记（两档）**：行内 `<!-- lint-req:ignore -->`、区间 `<!-- lint-req:ignore-start -->` … `<!-- lint-req:ignore-end -->`；**只用于正文按定义要引用错误命令名**的场合（bug 例证 / 历史差异记录），不用于掩盖真实错误名。漏写 `ignore-end` 会在 **stderr** 告警（不静默、不改退出码），人类输出首行显示「抑制 N 行」。
- **覆盖到全部状态写命令**：34 个命令 / 36 个门位统一收敛到单一 helper（`src/commands/shared/preflight-gate.ts`）；`src/core/preflight.ts` 判定源零改动。
- **顺序约定**：参数校验先于 preflight（非法 `REV-999` / `op-999` / 阶段 ID / `--to` 先报参数错误）；`stage task --add` 与 `flow review update` 等此前不可达 / 被遮蔽的门位补齐。
- **dry-run 免门（10 处）**：`--dry-run` 永不被门拒绝，保住「试探 → `flow next` → 真执行」路径；其中 `flow repair --dry-run --backup` 会**跳过备份**（预览模式不写任何文件，也避免用损坏的 `flow.json` 覆盖原本可用的 `.bak`）。
- **恢复通道（2 处）**：`flow repair` / `flow checkpoint restore` 在 `flow.json` 不可读时放行（否则 strict 永久死锁）；状态可读时仍受门。
- **零写盘**：strict 拒绝时 `flow.json` / `status.md` / `config.yaml` / 归档与 `.bak` 全部不落盘（含 `repair --backup`、`config set --sync-stages`）。
- **流程健康（新增，零运行时开销）**：`flow metrics` **人类输出**追加「流程健康」三行——resumed 比例（分母只含带布尔 `resumed` 的 `advance_stage_phase`，`reset_stage_phase` 不计入）、`plan_pending → plan_review` 平均停留（窗口内逐事件配对，锚点复用唯一实现）、最近 preflight 年龄（只读账本，**不刷新**账本）。窗口 = 最近 200 条日志；0 样本输出「无数据 / 无样本」而非 `0.0%`（「没测到」≠「测到为零」），resumed 行恒外显「另有 N 条不可判定」。
- **适配器 `observability`（只增不改）**：`feel_status` / `feel_next` 追加 `observability`（`stale` + `preflightAgeMs` / `preflightOk` 复制副本 + `statusSync` 三键 + 一句摘要）。`preflight` 账本在 snapshot **之前**读取，年龄反映「上一次读状态 → 现在」，不会被本次调用刷成 ~0。
- **兼容性**：无新增错误码；**JSON 契约新增出口 #41 `lint req`（41 成功出口 / 42 注册选项）**，既有 40 个出口键集/键序/类型零改动、错误码表恒 13 行；`flow metrics --json` 键集恒 `schemaVersion,agents`（健康块仅人类输出）；适配器既有字段全部保留、新字段尾部追加。36 个门位中 4 个所属命令注册了 `--json`（`flow advance` / `flow archive` / `req split` / `flow health --fix`；后两者为 legacy 三键，拒绝值 `preflight-required`）；`chore` / `dev sync` / `config set-lang` / 顶层 `archive <stage>` / 顶层 `migrate` 不在接入面（排除清单见 [commands.md](commands.md#preflight-写命令闸v156)）。
- **已评估、显式降级到 1.5.7**：`preflight` 拒绝次数 / `feel_next` 调用次数 / 主会话直写与自审占比——都需要新增埋点或写盘计数器，违反「零运行时开销」边界，本批次不做。
- **升级**：`npm i -g openfeel@latest` → `openfeel setup` → **完全退出并重启宿主**。详见 [CHANGELOG](../CHANGELOG.md#156---2026-10-31)。

## v1.5.5 — 批次：preflight 账本 + 适配器补闸 + 禁止 shell 写状态 + 审查独立性

- **preflight 账本**：`flow next` / `flow status` 记录 `.openfeel/dev/.preflight.json`；`flow advance` / `plan stage add` / `req add` / `req claim` 写前校验 10 分钟窗口。
- **默认策略**：用户 shell `warn`（仅 TTY 提示，不破坏脚本）；DSH 适配器 `strict`（未读状态拒绝，`detail.reason=preflight-required`）。
- **提示段**：状态写操作只能用 `feel_*`；禁止 shell 跑 `openfeel flow/stage/req` 写命令；fast 单轮审查也应由独立 reviewer，自审标 `self-review`。
- **兼容性**：无 JSON 契约变更（拒绝走既有 `INVALID_ARGUMENT`）；`feel_status`/`feel_next` 新增 `preflight` 字段。
- **升级**：`npm i -g openfeel@latest` → `openfeel setup` → **完全退出并重启宿主**。详见 [CHANGELOG](../CHANGELOG.md#155---2026-10-31)。

## v1.5.4 — 批次：日志摘要 + 快照 revision/stale + 指标 + 闸门滥用提示

- **阶段日志摘要**：`flow log` 人类输出追加当前阶段的最近转换 / 最近失败 / resume 次数（从最近 200 条日志派生，不新增存储）。
- **快照 revision/stale**：`feel_status` / `feel_next` 返回 `revision` / `snapshotAt` / `stateUpdatedAt` / `stale`；`flow next` 缺失降级时明确提示。
- **观测指标**：`flow metrics` 人类输出追加 `flow.log` 条目/字节与活跃阶段数。
- **闸门滥用提示**：`plan_pending` 停留 >10 分钟时提示推进或合并/取消，避免为过闸建空阶段。
- **兼容性**：`flow next --json` / `flow metrics --json` 键集不变。
- **升级**：`npm i -g openfeel@latest` → `openfeel setup` → **完全退出并重启宿主**。详见 [CHANGELOG](../CHANGELOG.md#154---2026-10-31)。

## v1.5.3 — 批次：派发契约 + 恢复包 + 结构化交接 + 同步去重

- **派发/返回契约**：`feel_next.dispatch` 给出 goal/context/boundaries/returnFormat；子 agent 禁读 `dev_last*` / `current.md` / `status.md` / `flow.json`，返回 ≤10 行；主会话只保留摘要。
- **恢复包**：`feel_status.recovery` 聚合 lastTransition、交接摘要（≤600 字）、nextAction；新会话一次调用即可恢复，无需先读全文。
- **结构化交接**：`dev_last` 交接摘要使用 `done: / next: / block:` 固定键；恢复包直接读取。
- **同步去重**：AUTO 状态未变时不重写 `dev_last`，只刷新同步时间，减少无意义写。
- **发布节奏**：改为批次发布（见文首「发布节奏」），本版为 1.5.3 批次统一发布。
- **升级**：`npm i -g openfeel@latest` → `openfeel setup` → **完全退出并重启宿主**。详见 [CHANGELOG](../CHANGELOG.md#153---2026-10-31)。

## v1.5.2 — 流程入口闸（研究/方案不得跳过阶段）

- **违规根因**：把「调研」当纯只读任务，跳过 `feel_status` 与阶段创建；`docs/**` 原本任意相位可写，研究/方案产物没有阶段要求，写入门禁也无摩擦。
- **入口闸**：`feel_status` / `feel_next` 在无活跃阶段时返回 `workflowGate`（required/reason/message/actions），summary 前置警告。
- **研究产物守卫**：无活跃阶段写 `docs/research/**` 被拒；错误信息给出建阶段命令；chore 不能绕过；拒绝事件写 `guard-audit.jsonl`（`event=guard_deny`）。
- **提示段**：新增「流程入口」硬规则（先 `feel_status`；不得以调研/只读为由跳过阶段；纯只读问答例外）。
- **调研**：`docs/research/dispatch-persistence-2026-10-31.md` 给出 1.5.3（统一派发/返回契约 + 恢复包）与 1.5.4（结构化交接 + 日志索引）顺序。
- **升级**：`npm i -g openfeel@latest` → `openfeel setup` → **完全退出并重启宿主**（适配器为 host module）。详见 [CHANGELOG](../CHANGELOG.md#152---2026-10-31)。

## v1.5.1 — 发布链路热修（package-lock）

- v1.5.0 发版脚本误把 `package-lock.json` 中 `natural-compare` 的 `1.4.0` 替换为不存在的 `1.5.0`，CI `npm ci` 失败。
- 本版仅修复锁文件三处；功能与 v1.5.0 完全一致。升级方式同 v1.5.0。

## v1.5.0 — 工作流瘦身（Only-Feel 写状态 / 日志降级 / 30 分钟 CLI 同步）

- **只有 Feel 写状态**：`dev_last*`、`dev/current.md`、`status.md`、`flow.json` 只由 Feel（主会话）更新；子 agent 一律不读不写，上下文由派发 prompt / 交接文档提供。
- **日志降级**：日志不强制；`flow.json.log` 由 CLI 自动维护（最近 200 条）。跨会话信息写 ≤5 行交接摘要；`openfeel-logging` / `openfeel-memory` 不再要求逐操作 / 会话结束写档。
- **节点 + 30 分钟同步**：`openfeel dev sync` 写 `dev_last.md` 的 CLI 受管简要状态块；`flow advance` 在首次 / 超过 30 分钟 / 节点相位自动同步；适配器 `feel_next` / `feel_status` 返回 `statusSync.due`，到期时只提示更新交接摘要。
- **兼容性**：不改相位机 / 审查 / 归档语义；无新增 JSON 出口；`dev_last.md` 手写内容保留。
- **升级**：`npm i -g openfeel@latest` → `openfeel setup` → **完全退出并重启宿主**。详见 [CHANGELOG](../CHANGELOG.md#150---2026-10-31)。

## v1.4.0 — 写入门禁分层 + chore 微变更通道

- **静态展示资源与 doc 同层**：`.css/.scss/.html/.svg/.png/.jpg/.jpeg/.webp` 与 `assets/**`、`public/**` 在任意相位（含全部阶段 done）可写，不要求活跃阶段；**混合目标从严**（同时含源码与静态资源 → 按源码规则）。
- **源码底线不变**：`.rs/.ts/.js/.py` 等仍严格要求 `exec_running`；`.openfeel/flow.json` 与 `**/status.md` 仍禁止手改。
- **审计**：豁免放行与 chore 放行写 `.openfeel/log/guard-audit.jsonl`（谁、何时、写了哪些路径、相位/原因）。
- **`openfeel chore "<说明>"`**：承认「单文件、无接口变化、可肉眼验证」的微变更——无活跃阶段时开启 60 分钟写窗口（源码也可写），`--end` 收口、`--status` 查看；**不写入 `flow.json` 的阶段列表**，只留日志与 ephemeral `chore.json`；存在活跃阶段时拒绝（不绕过相位门）。
- **兼容性**：无新增 JSON 出口（`chore` 无 `--json`）；注册选项 41 → 43；相位机 / REV / 归档语义不变。
- **升级**：`npm i -g openfeel@latest` → `openfeel setup` → **完全退出并重启宿主**（DSH 的 host module 不热加载）。详见 [CHANGELOG](../CHANGELOG.md#140---2026-10-30)。

## v1.3.5 — 统一 shell 工具推荐（Windows：Git Bash → PowerShell 7）

- **推荐口径**：Windows 下优先 `bash`（Git Bash），其次 `pwsh`（PowerShell 7）；macOS / Linux 使用 `bash`；默认不用 `cmd.exe`；同一任务内保持同一 shell，路径与转义按该 shell 书写。
- **落点**：① DSH Feel 系统提示（`<feel_mode>` 中文/英文各新增「命令执行」节）；② OpenFeel 全局约束模板（`agents-md` 与 `claude/constraint` 的跨 Agent 工具使用约束第 5 条）；③ `openfeel-tool-usage` skill 的工具名映射表注记。
- **边界**：仅提示与文档层；不改任何 CLI 命令、相位机、写入门禁或审查/归档语义。
- **升级**：`npm i -g openfeel@latest` → `openfeel setup`（刷新全局约束）→ **完全退出并重启宿主**（DSH 的 host module 不热加载）。详见 [CHANGELOG](../CHANGELOG.md#135---2026-10-30)。

## v1.3.4 — 分发链路修复（适配器透传 / setup --check 三态 / 部署标记）

- **`feel_flow review_add` 透传 `--stage`**：DSH 适配器此前只透传 `--op`，导致 `feel_flow action=review_add --stage <id>` 始终报「请提供 --op 或 --stage」。v1.3.4 起 `op` / `stage` 二选一（皆缺 → `FEEL_BAD_USAGE`），fast 无 op 场景可直接在工具层挂阶段级 REV。
- **`setup --check` 三态化**：新增 `restart-required`——区分「适配器文件旧」（`mismatch`，重跑 `setup`）与「文件已新但宿主仍加载旧适配器」（`restart-required`，只需**完全退出并重启宿主**）。检测方式：`setup` 把适配器 `lib/**` 指纹写入 `update_state.adapters.dsh`，适配器在宿主启动时把实际加载指纹写入 `~/.openfeel/adapter-host-dsh.json`，`check` 比对两者。
- **部署版本标记修复**：`setup --tools dsh`（含「已是最新、跳过」分支）部署成功后刷新 `openfeel_version` / `last_update` 并写入 `adapters.dsh`，消除「setup 成功但 check 永远 mismatch」的死循环。
- **兼容性**：`update_state.json` 仅追加可选 `adapters` 字段（旧文件零迁移）；`setup --check --json` 键集/键序不变（`status` 取值扩展）；CLI 相位机 / REV 语义 / 写入门禁不变。
- **升级**：`npm i -g openfeel@latest` → `openfeel setup`（会刷新部署标记）→ **完全退出并重启宿主**；若 `setup --check` 报 `restart-required`，重启即可，无需重跑 `setup`。详见 [CHANGELOG](../CHANGELOG.md#134---2026-10-30)。

## v1.3.3 — fast 模式结构性修复（反馈 13 项）

- **审查挂载点下沉**：`flow review add --op` 改可选，新增 `--stage <id>`；fast 阶段没有 op 时挂**阶段级 REV**（`op = stageId`，新增 `ReviewItem.stage`），blocking 门与 `archive <stage>` 摘要都能正确归属。
- **fast 返工边**：`review_passed → exec_running` 成为合法转移（`flow advance --reason "<整改原因>"` 落审计）；`review_pending → exec_running` 的同深度多义有显式 tie-break（仍优先经 `review_failed`，行为不回归）。full 表不变。
- **写入门禁按风险分层**：空工作区、全部为新增文件（`apply_patch` 须全部 `*** Add File:`）→ 放行并提示补账本；`docs/**` 与文档类扩展（`.md/.mdx/.txt/.rst/.adoc`）在无活跃阶段 / 非 `exec_running` 也可写（混合目标从严）；源码仍要求 `exec_running`。
- **聚焦与单一真源**：`plan stage add` 注册后原子设置 `pipeline.current.stage`；`flow next` 在 current 为空时从 `stages` 只读派生；`advance` 将受管字段（状态 / 责任 Agent / 更新时间）派生写入 `status.md`；DSH 序列化器只对真环标记 `[循环引用]`（重复引用正常输出）。
- **模板 / 配置 / 档位**：`instructions` 增加包内置 schema 回退（空白项目可用）且 `--change` 可选；`execution_mode=auto + auto_advance=disabled` 的静默无效组合在 `flow advance` / `flow next` 告警；`flow advance` 成功输出回显生效审查档位。
- **体验**：`init` 目录惰性化（核心 4 + dev 2，其余按需创建）；阶段 ID 归一化与 `plan/` 目录映射文档化，`plan stage add` 回显实际目录；归档时非 git 仓库显式告警（不再静默「跳过 commit」）。
- **升级**：`npm i -g openfeel@latest` → `openfeel setup`；已有项目无需迁移（`ReviewItem.stage` 为可选字段，旧 REV 照常）。详见 [CHANGELOG](../CHANGELOG.md#133---2026-10-30)。

## v1.3.2 — DSH 激活与写入门禁

- **`ctx.tools.guard` 写入门禁**：同步拒绝 `edit` / `write` / `apply_patch` / `str_replace_editor`。`.openfeel/**` 流程产物任意阶段可写（`flow.json` / `status.md` 除外）；外部源码要求 `exec_running`；无活跃阶段拒绝（general 需求例外）。
- **非项目 bootstrap**：`activation=auto` 时未初始化工作区注入短提示（只读可进行；写文件按 `enforce` 说明），不再静默。
- **默认 `enforce=always`**：无 `.openfeel` 时也拒绝文件写入，防止绕过 `openfeel init`；`project` / `off` opt-out。
- **边界**：`pwsh` / `bash` 默认不守，仍是显式逃生通道；`apply_patch` 混合/无头保守拒绝。
- **升级**：`npm i -g openfeel@latest` → `openfeel setup --tools dsh` → 重启 DSH。详见 [CHANGELOG](../CHANGELOG.md#132---2026-10-24)。

## v1.3.1 — DSH 部署热修复（frozen-lockfile）

- **`setup --tools dsh` 修复**：profile 的 `openfeel-dsh` `link:` 目标变化会使 `pnpm-lock.yaml` 过期；内部 `pnpm install` 增加 `--no-frozen-lockfile`，不再被 `ERR_PNPM_OUTDATED_LOCKFILE` 阻断。
- **行为边界**：保留写前备份、失败回滚 `package.json`、幂等跳过与多 profile fail-fast；失败时 lockfile / `node_modules` 可能保留部分更新，下一次 `setup` 收敛。
- **升级**：`npm i -g openfeel@latest` → `openfeel setup --tools dsh` → 重启 DSH。详见 [CHANGELOG](../CHANGELOG.md#131---2026-10-17)。

## v1.3.0 — DSH 适配器单包分发 + README 重构

- **DSH 适配器随包分发**：`openfeel` npm 包现已包含 `dsh/` 运行文件；不再需要单独的 `openfeel-dsh` 包。
- **`openfeel setup --tools dsh`**：把适配器以 `link:` 依赖写入 DSH profile、追加 `dsh.profile.bundles`、按需执行 `pnpm install`，并提示重启 DSH 宿主。支持 `--dsh-profile <name>` 窄化；默认部署全部已检测 profile。
- **`openfeel update --tools dsh`**：明确拒绝并指引使用 `setup`（DSH 是全局部署，不属于项目 update）。
- **适配器位置参数修复**：修复 6 处把空字符串当 flag 的问题（`feel_op create` / `register`、`checkpoint list`、`config effective`、`scheme list`、`roadmap show` 带位置参数时不再错误）。
- **README 瘦身**：版本能力章节迁出至本文件，由 README 索引；新增 DSH 安装说明与「需求 + 快速迭代」推荐用法。
- **升级**：`npm i -g openfeel@latest` → `openfeel setup --tools dsh`（可选 `--tools opencode,dsh`）→ 重启 DSH。详见 [CHANGELOG](../CHANGELOG.md#130---2026-10-17)。

## v1.2.4 — 归档覆盖保护 + 读命令 JSON 收口

- **归档覆盖保护（数据安全）**：`openfeel archive <stage>` 对已存在的归档文件默认拒绝覆盖（`ARCHIVE_EXISTS`、零写盘），显式 `--force` 才覆盖。
- **`plan stage list --json`**：阶段调度视图（七键）。
- **`model list|get --json`**：模型配置的 provider / model / 生效来源。
- **`flow retry` / `lint i18n|kb` / `roadmap show --json`**：低频只读面结构化。
- **`config get --all --json`**：一次取全量项目配置，不再要求 key。
- **升级**：`npm i -g openfeel@latest`；JSON 契约与退出码语义保持兼容。详见 [CHANGELOG](../CHANGELOG.md#124---2026-10-17)。

## v1.2.3 — 补丁：并发 JSON 退出与测试 seam

- **并发 JSON 退出统一**：冲突时输出 envelope 并置退出码 2，避免 Windows 管道截断。
- **`--review-tier` help 文案订正**：缺省 = `full`（零裁剪）。
- **`req` 过滤单点化**：行为不变，减少双实现。
- **锁超时 E2E 测试钩子**：仅测试环境生效，生产超时默认值不变。
- **升级**：补丁版本，直接升级即可。详见 [CHANGELOG](../CHANGELOG.md#123---2026-10-17)。

## v1.2.2 — 机器可读 JSON 契约与调度决策下沉

- **`flow next --json`**：负责 Agent、合法下一相位、建议命令、守卫与阻塞审查。
- **全局 `--project <path>`**：任意命令锚定项目。
- **13 个读命令 `--json`**：结构化输出全面补全。
- **错误封装**：`{schemaVersion,error:{code,kind,message,detail}}`；退出码 0/1/2/3。
- **`--version --json`**、`flow archive --dry-run --json`、`reviewTier` 消歧。
- **升级**：既有 JSON 字段只增不改，人类输出不变。详见 [CHANGELOG](../CHANGELOG.md#122---2026-10-17)。

## v1.2.1 — 需求拆分、三模式与审查档位

- **三模式 `full` / `fast` / `general`**：`general` 仅需求级；模式可逐阶段覆盖与切回。
- **需求接取与拆分**：`req split` 拆分即发布；并行认领；需求与版本解绑。
- **审查档位 `--review-tier`**：与模式正交，裁剪审查关但恒保留代码审查 / 测试 / 归档关。
- **新 agent `openfeel-explorer`**：只读调研路由。
- **模型默认值统一 + 部署非破坏性**：用户主权 `model` 键不被覆盖。
- **升级**：旧项目零迁移；`general` 仅需求级合法。详见 [CHANGELOG](../CHANGELOG.md#121---2026-10-15)。

## v1.2.0 — 版本分片归档与需求流转

- **`flow archive`**：按版本把 `flow.json` 切分到 `.openfeel/flow-archive/{version}.json`；判据 = 全部阶段 done 且无 blocking REV。
- **`openfeel req`**：需求 7 状态与 10 子命令；全部关联阶段 done 时自动收口；认领无 TTL。
- **兼容**：旧 `flow.json` 无需迁移。
- **升级**：直接升级；归档命令按需使用。详见 [CHANGELOG](../CHANGELOG.md#120---2026-10-13)。

## v1.1.2 — 自描述、阶段治理与结构化输出

- **自描述**：`flow phases [--json]` 输出合法相位与转移表。
- **阶段治理**：`flow stage remove`、`plan stage add --deps`、stageId 校验与冲突检测。
- **配置有效值**：`config effective` 输出来源链。
- **结构化输出**：`flow status/current/health/metrics/overview --json`。
- **纠正 / 清理命令面**：scheme remove/rename/publish、ops list、health --fix、knowledge dedup、lint 非 0 退出。
- **部署与备份**：覆盖前自动备份；输出编码自适应；运行日志。
- **升级**：直接升级。详见 [CHANGELOG](../CHANGELOG.md#112---2026-10-11)。

---

> 更早版本（v1.0.x / v1.1.0 / v1.1.1 等）见 [CHANGELOG.md](../CHANGELOG.md) 与 [docs/index.md](index.md)。


