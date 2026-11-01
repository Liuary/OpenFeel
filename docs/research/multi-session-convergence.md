# 多会话并行：冲突来源与收束方案（研究）

> 状态：研究稿（v1.5.8 / REQ-028 期间调研）。**P0 三项已由 REQ-029 落地**（见 §5）。目标：回答「多个会话同时做不同需求时，如何安全收束」。

## 1. 今天观察到的真实事故

| # | 现象 | 根因 |
|---|---|---|
| 1 | 提交 `356c13a chore: 阶段归档 v1.5.8-stage-123` 实际包含隔壁会话的插件发布改动（`docs/market/**`、`docs/research/**`、`dsh/package.json`）与全局状态（checkpoints / log / kb / flow.json） | `autoCommitOnDone` 用 `git add -A`（[flow-manager.ts:1790](src/core/flow-manager.ts#L1790)）**全量扫荡工作树**，不区分会话 / 需求 |
| 2 | 同一批源码文件（`req.ts` / `flow-manager.ts` / `aggregate.ts` / i18n）被两个会话并发编辑，`git status` 无法区分归属 | 无工作树隔离，无写作用域声明 |
| 3 | `REQ-026` 阶段已 done 并归档，需求仍是 `draft` | 聚合回写只从 `scheduled/in_progress` 起步；`draft` 永远不被收口 |
| 4 | `pipeline.current` 指向 `stage-123`（done），而 `stage-122` 仍在 `exec_running`；`feel_next` 以 done 阶段为焦点 | `pipeline.current` 是单指针，后建阶段直接抢占；焦点选择规则未排除 done |
| 5 | 一个会话的阶段处于 `exec_running`，另一个会话即可修改任意源码 | guard 只检查「全局是否存在 exec_running 阶段」（[guard.js:536](dsh/lib/guard.js#L536)），**无会话/需求作用域** |

## 2. 现有原语盘点

| 能力 | 现状 | 缺口 |
|---|---|---|
| `flow.json` 写入 | 进程锁 + 磁盘 revision CAS + 原子写 + `.bak` | 状态安全，但**工作树完全共享** |
| 需求认领 | `owner` + `claimed_at`；他人 claim → `already_claimed` | **无租约/TTL**，会话死后认领永久占用，无法判活 |
| 会话标识 | `src/core/session.ts` 由 env/project 推导 | **设计上明确无 TTL/轮换**，无会话注册表 |
| `status.md` Worktree 段 | 已有「工作模式 / 分支名 / Session 名称 / 合并状态 / 清理策略」字段 | **没有命令使用**（预留位） |
| 阶段自动提交 | stage done → `git add -A` + commit | 污染其他会话改动；提交消息与内容不符 |
| guard | 全局活跃阶段 → 放行源码写 | 无 session/需求级作用域；无法发现重叠写 |
| 需求收口 | 聚合：全部关联阶段 done → 自动 done（仅 scheduled/in_progress 起算） | `draft` 不覆盖；多需求 stage 未支持（REQ-028） |

## 3. 失败模式分类

1. **文件写冲突**：两会话改同一文件，后写覆盖先写（无检测）。
2. **提交污染**：A 的 done 把 B 的未完成改动一起提交，回滚/审查失真。
3. **状态交错**：`pipeline.current` 抢占、重复建阶段、按需求建阶段（stage-123 即例）。
4. **归属漂移**：需求未收口、claim 僵尸、会话与需求映射丢失。
5. **门禁失真**：一个会话的阶段为所有会话的写入开锁。

## 4. 方案矩阵

| 方案 | 做法 | 成本 | 收益 | 风险 |
|---|---|---|---|---|
| **A. 工作树隔离** | `git worktree` 每会话/需求一个分支与目录；status.md 的 Worktree 字段落地 | 中高（命令/合并/清理） | 文件冲突根除 | 合并冲突处理、磁盘占用、测试环境重复 |
| **B. 提交作用域** | 提交时用 `git status --porcelain` + 归属清单（REQ/stage 声明或 session 清单）过滤路径，**禁止 `-A`** | 低 | 立刻消除提交污染 | 需定义「归属」来源（见 C/D） |
| **C. 写作用域声明** | claim 时声明 `paths` glob；guard 校验目标是否落在本会话/需求的 glob 内，越界拒绝 + 审计 | 中 | 事前防冲突 | glob 维护成本；跨需求共享文件需例外 |
| **D. 会话登记 + 租约** | `.openfeel/dev/sessions.json`：sessionId / cwd / branch / claims / lastSeen（心跳）；requirement claim 带 TTL（默认 2h），过期可抢占 | 中 | 可观测、可判活、可回收 | 心跳频率与误判；与「session 无 TTL」设计原则需区分（会话标识 ≠ 认领租约） |
| **E. 串行化 / merge queue** | 单写者锁或「完成→入队→集成会话合并」 | 中高 | 冲突收敛到最后一步 | 吞吐下降 |
| **F. 状态对账** | stage done 时把关联 `draft` 需求推进到 done（或显式 `req sync`）；`pipeline.current` 选择规则排除 done；`feel_verify recover` 检测 stale | 低 | 修掉今天的 REQ-026 / 焦点漂移 | 需定义「自动收口」的边界 |
| **G. 可观测** | `feel_status` 增加 sessions（owner/cwd/lastSeen/claims）与「脏文件归属」；guard 在重叠时警告 | 低 | 人/Agent 可判断 | 只读信息，不解决问题 |

## 5. 推荐路线（分阶段）

**P0（本批，低风险）— 状态：已实现（v1.5.8 / REQ-029）**
1. **B 提交作用域**：`autoCommitOnDone` 改为提交「本阶段/本需求归属路径」；至少先过滤 `.openfeel/checkpoints/**`、`dev/sessions.json`、其它会话的未跟踪文件；无法判定归属时**不自动提交**，提示人工。
   → **已实现**：`shouldAutoCommit()`（纯决策，注入 git 探针）+ 会话登记 `.openfeel/dev/sessions.json`（`src/core/dev/sessions.ts`）；存在其它存活会话 → 跳过提交并告警（不做 `git add -A`）；无改动 / 非 git 仓库 → 跳过；提交排除 `:(exclude).openfeel/checkpoints/**`，消息附 `session=<id>`。`dev/sessions.json` 已入 `.gitignore`（无需 pathspec 过滤）。
2. **F 收口规则**：stage done 时，把关联且 `draft` 的需求按 `draft → scheduled → in_progress → done` 推进（写审计 `requirement_auto_done`，当前函数已有该 action）；`pipeline.current` 优先非 done 阶段。
   → **已实现（`pipeline.current` 部分）**：被推进阶段是 current 且推进到 `done` 时，current 切到插入序第一个非 done 阶段（op 置空），全 done 保持现状。`draft` 需求收口部分仍属后续批次（见 §7 第 2 条）。
3. **G 可观测**：`feel_status` 增 `sessions`（读 claim owner + `.openfeel/dev/sessions.json`）与 `dirtyOwners`（按最近触碰/声明路径推断），guard 重叠告警。
   → **已实现（`sessions` 部分）**：`feel_status` / `feel_next` 返回 `sessions`；每次 `feel_*` 执行 upsert 心跳（失败静默）。`dirtyOwners` 与 guard 重叠告警仍属后续批次。

**P1**
4. **D 会话登记 + 需求租约**：`feel_req claim` 写 `lease_until`（可配，默认 2h）；`feel_status` 显示存活；过期允许抢占并审计；guard 对「同一路径两会话」警告。

**P2**
5. **A 工作树隔离**：`openfeel worktree start <stage> [--branch]` / `merge` / `cleanup`，落 status.md 字段；guard 按会话 worktree 路径识别；需求 done = 提交 + 合并 + 验证记录（REQ-027 门）。
6. **E merge queue**：发布前由单一集成会话合并、跑全量测试、归档。

## 6. 收束协议（约定层，与工具同步落地）

1. 需求 done 判据：① 有指向 REQ 的提交；② 验证记录 pass（REQ-027）；③ 无 blocking REV。
2. 阶段保持开启，不在单个需求完成时关闭；发布由用户确认 + 单一集成会话执行。
3. 每会话 claim 时声明写作用域；越界写必须广播/协调。
4. 跨会话合并只由 Feel（集成者）执行：先 `feel_verify recover`，再全量测试，冲突交 owner。
5. 冲突不可自动解决时：暂停写 → 拆分文件/需求 → 重新排期（记录 `blocked` 原因）。

## 7. 今日可立即执行

1. 隔壁会话停写（或等其完成通知）；我的多需求子 agent 跑完后统一 scoped commit。
2. 收口 `REQ-026`（draft → done）。
3. 给 `autoCommitOnDone` 加「归属过滤」保护——至少不再把 `.openfeel/checkpoints/**` 与其他会话的改动混入阶段归档提交。
