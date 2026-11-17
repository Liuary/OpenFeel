# OpenFeel 使用反馈（CulaHub）

> 来源：下游使用项目 CulaHub（UE 5.8 开放世界），连续 66 轮自动推进后的反馈
> 原文位置：`CulaHub/docs/openfeel-usage-feedback.md`
> 归档日期：2026-11-17（原文照录，未改动；核实结论见 [02-culahub-feedback-eval.md](02-culahub-feedback-eval.md)）
> 涉及版本：v1.5.22（两包 lockstep：`openfeel` / `openfeel-dsh`）

---

## 一页摘要

| # | 类别 | 问题 | 建议 | 优先级 |
| --- | --- | --- | --- | --- |
| 1 | 高频操作 | 每条 REQ 需 8 次工具调用才能收口 | 提供 `feel_req complete` 一次收口 | 高 |
| 2 | 门禁 | 写入门禁误伤 `git rm --cached` 这类维护操作 | 区分"改文件内容"与"改 git 索引" | 高 |
| 3 | 交接 | `dev/current.md` 不会自动更新，整轮跑完仍是模板 | 阶段推进/目标完成时自动生成交接摘要 | 高 |
| 4 | 仓库卫生 | `.openfeel/dev/*` 运行态文件被 git 跟踪，状态常年脏 | `openfeel init` 保证它们未被跟踪 | 中 |
| 5 | 审查粒度 | 改一行文档也要 review+verify 才能 done | docs/tests-only 允许 `review_tier=skip` 并记 `trivial` | 中 |
| 6 | API 语义 | `review_*` 的 `result` 字段注释为"未使用，保留占位" | 删除或在 `review_resolve` 中真正使用 | 中 |
| 7 | 阶段视图 | 阶段长期 `exec_running`，缺"阶段内还差什么"汇总 | `feel_stage status` 加 REQ 完成度/最近活跃 | 中 |
| 8 | 需求终止 | cancelled/rejected 也算未完成，阶段无法 done | 提供显式 `feel_req abandon --reason` | 中 |
| 9 | 上下文 | `feel_next` 不含活跃 goal/round | 输出里带上 goal id / 轮次 | 低 |
| 10 | 验收 | A1–A16 判据无内置载体，只能自建 JSON + 脚本 | 内置 `criteria` 注册表，供 `stage verify` 引用 | 中 |
| 11 | 经验沉淀 | 反复踩的坑没有自动入库提示 | 同一致命失败≥2 次时提示 `feel_kb add` | 低 |
| 12 | 独立审查 | 审查记录需手填 `by=` | 派发 prompt 携带 reviewer 标识并自动回填 | 低 |
| 13 | 可发现性 | 工具描述长但缺最小示例 | 提供 `feel_help <topic>` 或 `feel_next` 附单条示例 | 低 |

---

## 二、详细条目

### 1. 每条 REQ 的固定开销太大

**现象**：一个"小功能 + 一次提交"的完整记账是：

```
feel_req add → claim → link → advance(scheduled) → advance(in_progress)
→ verify → review → advance(done)
```

**影响**：66 轮里这类调用占了相当比例的轮次，对"每完成一个小功能就提交"的节奏尤其不友好。

**建议**：提供 `feel_req complete <id> --verify=pass --review=pass --by=... --note=...`，一次完成 verify+review+done；或允许 `add` 时带 `auto_claim=true, stage=<id>`。

---

### 2. 写入门禁误伤维护操作

**现象**（真实报错）：

```
Error: OpenFeel 写入门禁：禁止手改 OpenFeel 受保护的流程文件。
- `.openfeel/dev/guard-state.json` 是门禁自检状态，由 guard 自动写入；请看 feel_status 的 guard 段。
```

触发命令是：

```powershell
git rm --cached .openfeel/dev/guard-state.json .openfeel/dev/sessions.json ...
```

这条命令**不改文件内容**，只改 git 索引（目的是把运行态文件移出跟踪）。

**影响**：想自助清理仓库卫生时被拦住，只能让用户手动做。

**建议**：门禁按"是否写文件内容"判断；对 `git rm --cached` / `git update-index --skip-worktree` 这类纯索引操作放行，或提供 `feel_dev clean` 工具。

---

### 3. `dev/current.md` 不会自动维护

**现象**：整套流程跑完 66 轮，`.openfeel/dev/current.md` 仍是初始化模板（"总进度：初始化完成，等待计划创建"），最后由我手写交接摘要并提交。

**影响**：跨会话恢复高度依赖这个文件；如果不手写，新会话只能靠 `feel_status.recovery` + git log 重建上下文。

**建议**：在 `feel_stage advance`（相位推进）和 goal 完成时自动生成 ≤20 行摘要；或提供 `feel_handoff write` 工具。

---

### 4. 运行态文件被 git 跟踪

**现象**：`.gitignore` 已包含 `.openfeel/dev/guard-state.json`，但文件在早期提交中被跟踪，`.gitignore` 对已跟踪文件无效，导致 `git status` 长期显示 modified。

**建议**：`openfeel init` 时保证运行态文件从未进入索引；已存在的仓库提供 `feel_verify health --fix-index` 自动 `git rm --cached`。

---

### 5. 审查粒度对文档改动过重

**现象**：改一行文档、改一个测试注释，也要走 `verify` + `review` 才能 `done`。

**建议**：`review_tier=skip` 允许对 `docs/**`、`tests/**` 的改动跳过审查（审计记录标 `trivial`），代码改动仍强制。

---

### 6. `review_*` 的 `result` 是死字段

**现象**：工具描述里写着 `result`（"未使用，保留占位"）。

**影响**：调用方容易误以为必须传，或误以为它会驱动状态。

**建议**：删除该参数，或让 `review_resolve` 用它决定 open/closed。

---

### 7. 阶段缺"进度视图"

**现象**：阶段长期 `exec_running`（符合设计），但 `feel_stage status` 只给状态字段，不告诉你"这个阶段关联了多少需求、完成多少、卡在哪"。

**建议**：输出中加：关联 REQ 的 `done/total`、最老的 `in_progress` 需求、最近一次相位变更时间。

---

### 8. 需求终止不彻底

**现象**：cancelled/rejected 仍被计入"未完成"，导致阶段永远无法 done（这是保守但会卡住）。

**建议**：提供 `feel_req abandon <id> --reason=...`，语义为"主动放弃并移出门禁"，与 cancelled（用户取消）区分。

---

### 9. `feel_next` 缺 goal 上下文

**现象**：`feel_next` 给相位/Agent/工具建议，但不含当前 goal id、轮次、剩余轮次。

**建议**：顶层加 `goal: {id, round, maxRounds}`，减少调度者对账成本。

---

### 10. 验收判据没有一等公民

**现象**：我们把 A1–A16 写成 `Tools/acceptance-map.json` + `Tools/acceptance.ps1`（解析日志判断 PASS/FAIL/PENDING），才能一键回答"一期验收过没过"。

**建议**：内置 `criteria` 注册表（id/标题/关联测试/当前状态/证据），`feel_stage verify` 可直接引用；这也是"done 门"从"测试绿"升级为"判据绿"的自然路径。

---

## 三、证据（原文摘录）

**REQ 收口序列（每功能重复）**：

```
add → claim → link → advance scheduled → advance in_progress
→ verify → review → advance done
```

**门禁拦截原文**：

```
Error: OpenFeel 写入门禁：禁止手改 OpenFeel 受保护的流程文件。
- `.openfeel/dev/sessions.json` 由 feel_* 自动心跳维护：请勿手写。
- `.openfeel/dev/.preflight.json` 由 feel_status / feel_next 自动记录：请勿手写。
```

**交接文件实际内容（整轮结束后）**：

```
# 当前进度
> 总进度：初始化完成，等待计划创建。
```

---

## 四、希望保留的优点

1. **写入门禁 + 乐观锁 + 退出码 2 重试语义**：多次避免手改 `flow.json`，并发冲突可预期
2. **`feel_next` 的派发契约**（goal/context/boundaries/returnFormat）：子 agent 输出被约束在 10 行，主会话上下文没有被淹没
3. **`feel_req` 的 done 门（必须 review+verify）**：让"审查+验证"真的执行，而不是口号
4. **审计日志**：事后能查谁在何时改了状态，配合 `feel_verify recover` 恢复很实用

---

## 五、如果只改三件

1. **`feel_req complete` 一条命令收口**（直接减少每功能 5–6 次调用）
2. **运行态文件默认不入库**（`init` 保证未跟踪 + 已建仓库可一键修复）
3. **`dev/current.md` 自动生成交接摘要**（跨会话恢复不依赖用户记忆）
