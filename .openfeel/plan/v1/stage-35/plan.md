# Plan — stage-35: 并发保护基础设施

> **版本**：v1.1.0-stage-35
> **创建日期**：2026-09-12
> **Planner**：独立 Planner（推理模型）
> **规模判定**：中大规模（3 个新增模块 + 约 10 个修改文件 + 并发测试；跨 core/fs、core、plan、workspace 多模块）
> **来源**：v1.1 架构改造第一阶段。调查确认当前**无任何跨进程并发保护**，且 `flow.json` 的 `.bak` 机制存在缺陷（`FlowManager.save()` 末尾用新内容覆盖 `.bak`，实际不保留上一版本）。

---

## 知识库参考

| 条目 | 路径 | 相关性 |
|------|------|--------|
| CLI 原子管理模式 | kb/patterns.md #CLI 原子管理模式 | **高度相关**。Agent 通过 CLI 操作数据文件的既有约束，本阶段为其补上底层写入原子性 |
| 手动 edit status.md 频繁失败 | kb/troubleshooting.md #手动 edit status.md 频繁失败 | **直接命中**。status.md 写入脆弱的历史痛点，本阶段用原子写 + 锁根治 |
| update_state.json 降级风险排查 | kb/troubleshooting.md #update_state.json 降级风险排查 | **高度相关**。`saveUpdateState` 是高风险写入点，需接入原子写 |
| 全局跨项目用户画像 YAML 配置模式 | kb/patterns.md #全局跨项目用户画像 YAML 配置模式 | 相关。`~/.config/openfeel/profile.yaml` 与 `~/.openfeel/config.json` 是高风险全局写入点 |
| 跨平台行尾归一化模式 | kb/patterns.md #跨平台行尾归一化模式 | 必须遵循。原子写/锁/哈希相关须注意 CRLF |
| 跨平台构建管线中的行尾归一化 | kb/patterns.md #跨平台行尾归一化模式 | 参考。Windows/Linux 行为差异 |
| WORKSPACE_DIRS 同步模式 | kb/patterns.md #WORKSPACE_DIRS 同步模式 | 参考。本阶段不新增 `.openfeel/` 子目录（锁文件放 `.openfeel/tmp/locks/`，属既有 tmp 目录） |

> ⚠️ 执行任务前，若知识库中有相关条目，务必参考。重复踩过的坑不可再犯。

---

## 背景与动机

OpenFeel 的多个命令会写入共享状态文件。在以下场景存在**跨进程竞态**：

1. **`flow.json` 写入**：多个 Agent/终端同时推进流水线，`save()` 的「写 tmp → rename」虽单进程安全，但无跨进程互斥，可能相互覆盖；且 `.bak` 在写入成功后被新内容覆盖，丧失备份价值。
2. **公共日志序号**：`public-logger.computeNextNnn()` 用「目录内最大 NNN + 1」，并发写入会分配相同序号，导致文件覆盖。
3. **op 序号**：`scheme.getNextOpId()` 同样用 max+1，并发创建 op 会重号。
4. **其它裸 `writeFileSync`**：`status.md`、`update_state.json`、全局 `profile.yaml`/`config.json`、`kb/index.md` 等写入无原子性，进程中断可致文件损坏。

本阶段建设统一底座，**不改业务语义**，仅替换写入机制，为 stage-36~39 的改造提供安全基础。

---

## 已确认决策（继承自 v1.1 大计划，不可更改）

- **D4**：统一原子写（唯一名 temp + rename，替换裸 `writeFileSync`）；跨进程文件锁（lockfile + 指数退避）；序号分配原子化（`O_EXCL` 独占创建）；覆盖高风险文件清单。

## Planner 补充决策（本阶段）

| # | 决策 | 理由 |
|---|------|------|
| S1 | 新建 `src/core/fs/` 子目录承载三个工具，**不引入任何第三方依赖**（用 `node:fs` / `node:crypto`） | 与项目「避免过度设计、不随意引第三方库」约束一致；`node:fs` 足够实现 |
| S2 | 原子写 temp 名采用 `.{basename}.{pid}.{random}.tmp`（同目录内，保证 rename 同卷原子） | 唯一名避免多进程 tmp 互相覆盖；同目录保证 rename 原子性 |
| S3 | 文件锁为**建议性锁（advisory）**：lock 文件 `openSync(lockPath, 'wx')` 独占创建，含 pid + 时间戳；陈旧锁（超过 TTL）可抢占 | 跨平台简单可靠；TTL 兜底进程崩溃残留 |
| S4 | 序号分配采用**目标文件独占创建（`O_EXCL`）+ 冲突重试**，而非「先算 max+1 再写」 | 从根上消除竞态，无需额外锁 |
| S5 | `flow.json` 的 `.bak` 改为**写前复制旧文件**，写成功后**不再覆盖** `.bak` | 修复现有缺陷，使 `.bak` 始终保留上一有效版本 |
| S6 | 锁文件集中存放于 `.openfeel/tmp/locks/`（不污染业务目录；tmp 已在 WORKSPACE_DIRS） | 保持目录整洁，避免锁文件散落 |
| S7 | 锁与原子写**仅接入高风险清单**，不全局替换所有 `writeFileSync` | 避免过度设计；低风险一次性写入（如 init 模板）保持简单 |

---

## 工作阶段（op 级）

### 概览

| op | 主题 | 变更目标 | 文件数 |
|----|------|----------|:--:|
| op-001 | 统一原子写工具 | NEW `fs/atomic-write.ts` + test | 2 |
| op-002 | 跨进程文件锁 | NEW `fs/file-lock.ts` + test | 2 |
| op-003 | 序号分配原子化 | NEW `fs/sequence.ts` + test | 2 |
| op-004 | 高风险写入接入 | 约 10 个既有模块接入 + 测试更新 | ~12 |

### 依赖图

```
op-001（atomic-write）──hard──┐
                              ├──→ op-004（高风险接入）
op-002（file-lock）──hard─────┤
                              │
op-003（sequence）──soft──────┘
```

- op-001、op-002、op-003 互不依赖，可并行（文件冲突域不相交）。
- op-004 硬依赖 op-001、op-002（使用原子写与锁），soft 依赖 op-003（序号接入 public-logger / scheme）。

---

### op-001：统一原子写工具

> **目标**：提供唯一名 temp + rename 的原子写 API，替换高风险路径的裸 `writeFileSync`。
> **前置依赖**：无
> **规模**：2 文件（1 新增源码 + 1 新增测试）

| # | 任务 | 描述 | 涉及文件 |
|---|------|------|----------|
| 1 | 原子写实现 | 新建 `src/core/fs/atomic-write.ts`，导出 `atomicWriteFileSync(filePath, content, options?)`：确保父目录存在 → 写同目录唯一名 temp（`.{basename}.{pid}.{random}.tmp`）→ `fsyncSync` → `renameSync` 覆盖目标；失败时清理 temp。附 `atomicWriteJson(filePath, obj)`（`JSON.stringify(obj, null, 2) + '\n'`）与 `atomicWriteYaml`（可留待 op-004 需要时补） | NEW `src/core/fs/atomic-write.ts` |
| 2 | 单元测试 | 覆盖：新建文件、覆盖已有文件、父目录不存在自动创建、写入中断（模拟）不留半成品、temp 名唯一性、CRLF 内容原样保留 | NEW `test/core/fs/atomic-write.test.ts` |

> **验证**：`npm test`（atomic-write.test.ts 通过）。
> **注意**：temp 文件必须与目标**同目录**（跨卷 rename 非原子）；中文注释；标识符英文。

### op-002：跨进程文件锁

> **目标**：提供 `withFileLock` 建议性锁，串行化高风险共享写入。
> **前置依赖**：无
> **规模**：2 文件（1 新增源码 + 1 新增测试）

| # | 任务 | 描述 | 涉及文件 |
|---|------|------|----------|
| 1 | 文件锁实现 | 新建 `src/core/fs/file-lock.ts`，导出 `withFileLock<T>(lockPath, fn, options?): T`：`mkdirSync(dirname)` → `openSync(lockPath, 'wx')` 成功即持锁，写入 `{pid, time}`；失败则指数退避重试（默认初始 10ms、上限 500ms、总超时 5s）；陈旧锁（mtime 超过 TTL，**默认值待实测确定**，见下方 TTL 定值）可抢占删除后重试；`finally` 释放（`unlinkSync`）。同步 API（与现有同步写入风格一致） | NEW `src/core/fs/file-lock.ts` |
| 2 | 单元测试 | 覆盖：正常加解锁、锁被占用时重试、超时抛错、陈旧锁抢占、异常路径释放、并发子进程互斥（可用 `child_process` 起多个进程写同一计数文件验证串行） | NEW `test/core/fs/file-lock.test.ts` |

> **验证**：`npm test`（file-lock.test.ts 通过，含并发子进程用例）。
> **注意**：Windows 下 `unlinkSync` 对被占用文件可能抛错，释放需 try/catch 容错；锁文件路径集中 `.openfeel/tmp/locks/{name}.lock`。
> **TTL 定值（REV-006）**：TTL 不得硬编码 30s 了事。Schemer 须实测最长临界区耗时（大 `flow.json` 序列化 + 公共日志「读-改-写」+ 全局配置写入），据此设定 TTL（建议 ≥ 最长临界区 P99 的 2~3 倍），或改用「持有期间心跳续期」方案；实测数据回填本 op，并同步更新「遗留风险 #1」。

### op-003：序号分配原子化

> **目标**：消除 `public-logger` 与 `scheme` 的 max+1 竞态。
> **前置依赖**：无
> **规模**：2 文件（1 新增源码 + 1 新增测试）

| # | 任务 | 描述 | 涉及文件 |
|---|------|------|----------|
| 1 | 原子序号实现 | 新建 `src/core/fs/sequence.ts`，导出 `reserveSequence(opts): { seq: number; fileName: string; path: string }`：在目标目录以 `openSync(candidate, 'wx')` 逐个尝试（从当前 max+1 起），EEXIST 则递增重试（上限 N 次）；返回已独占创建的文件路径（调用方随后原子写内容）。另提供 `nextSequence(dir, matcher)` 纯计算辅助 | NEW `src/core/fs/sequence.ts` |
| 2 | 单元测试 | 覆盖：空目录从 1 开始、已有文件从 max+1、并发子进程各自取得不同序号、达到重试上限抛错、padStart 格式（3 位） | NEW `test/core/fs/sequence.test.ts` |

> **验证**：`npm test`（sequence.test.ts 通过）。
> **注意**：`public-logger` 文件名含 `{date}-{username}-{NNN}`，`scheme` 为 `op-NNN_{title}`；序号工具需支持自定义候选名生成回调（由 op-004 传入）。
> **空文件占位与 max+1 语义（REV-009）**：`reserveSequence` 先以 `O_EXCL` 创建空文件、再写内容；若进程在两步间崩溃会留下**空文件**，但其文件名仍含有效序号（`op-NNN_…` / `{date}-{username}-NNN`），下游 `getNextOpId` / `computeNextNnn` 的 `max+1` 扫描仍能正确取到该序号并递增，**不会重号或回退**；空文件仅表现为一条空记录，可由后续清理或忽略。
> **max+1 逻辑的定位（REV-009）**：`getNextOpId` / `computeNextNnn` 的 `max+1` **不再作为分配器**，仅作为 `reserveSequence` 内部的**候选起点（单进程快速路径）**；最终分配权归 `O_EXCL` 独占创建 + EEXIST 重试。op-004 接入时保留纯计算辅助 `nextSequence(dir, matcher)` 生成候选起点，替换原 `getNextOpId`、`computeNextNnn` 的直接分配语义。

### op-004：高风险写入接入

> **目标**：将原子写 / 锁 / 原子序号接入高风险清单，修复 `.bak` 缺陷。
> **前置依赖**：op-001（hard）、op-002（hard）、op-003（soft）
> **规模**：约 10 个源码模块 + 测试更新

| # | 任务 | 描述 | 涉及文件 |
|---|------|------|----------|
| 1 | flow.json save 改造 | `FlowManager.save()`：写前复制旧文件到 `.bak`（保留上一版本）；用 `atomicWriteFileSync` 写目标；写成功后**不再**覆盖 `.bak`；整个 save 包在 `withFileLock(.openfeel/tmp/locks/flow.lock)` 内 | `src/core/flow-manager.ts` |
| 2 | flow.json 恢复路径同步 + restoreCheckpoint 接入（REV-002） | `repair` / `checkpoint restore` 中的备份与恢复逻辑同步适配新 `.bak` 语义（写前复制），避免回归；**`restoreCheckpoint`（约 L429）不再直接 `writeFileSync` 写 flow.json，改为 `withFileLock(.openfeel/tmp/locks/flow.lock)` + `atomicWriteFileSync`，`.bak` 语义与 S5 保持一致**（写前复制、写成功后不覆盖） | `src/core/flow-manager.ts` |
| 3 | 公共日志接入 | `PublicLogger.writeLog`：用 `reserveSequence` 取序号；条目与 `day_index.md`/`index.md`/`log.md` 更新在锁内 + 原子写；锁粒度 `log.lock` | `src/core/public-logger.ts` |
| 4 | op 序号接入 | `scheme.getNextOpId` 改用 `reserveSequence`（候选名 `op-NNN_{slug}.md`）；`createScheme` 写入 op 文件用原子写 | `src/core/plan/scheme.ts` |
| 5 | status.md / overview.md 接入 | `plan/stage.ts` 的 status.md / overview.md 写入改原子写；`addStage` 的 flow.json 同步已由 FlowManager.save 覆盖 | `src/core/plan/stage.ts` |
| 6 | 状态/配置写入接入 | `update-state.ts:saveUpdateState`、`config.ts:writeProfile`/`writeDefaultConfig`、`workspace/identity.ts:setGlobalConfig`、`workspace/knowledge.ts` 的 `kb/index.md` 写入 → 原子写；全局配置写入加锁（`global-config.lock`） | `src/core/update-state.ts`、`src/core/config.ts`、`src/core/workspace/identity.ts`、`src/core/workspace/knowledge.ts` |
| 7 | 归档/指标接入 | `archive/merge.ts` 摘要写入、`metrics.ts` 指标写入 → 原子写 | `src/core/archive/merge.ts`、`src/core/metrics.ts` |
| 8 | 测试更新 | 更新受影响的现有测试（flow-manager `.bak` 断言、public-logger 序号、scheme 序号）；新增「连续 save 后 `.bak` == 上一版本」「并发写不丢更新」用例 | `test/core/flow-manager.test.ts`、`test/core/plan/scheme.test.ts`、`test/core/update.test.ts` 等 |
| 9 | flow.json 写入路径全量审计（REV-002） | 逐一审计所有写 `flow.json` 的代码路径（`save` / `restoreCheckpoint` / `initFlow`，及 `repair` 等间接路径），在方案/代码注释中标注是否接入 `withFileLock` + `atomicWriteFileSync` 及理由；`initFlow` 若为首次创建（无并发读者）可不加锁，但仍须原子写并注明依据 | `src/core/flow-manager.ts` |
| 10 | flow.json 乐观并发校验（乐观并发修订） | flow.json 引入 revision 标识；`FlowManager` 在 load 时记录 revision，`save()` 在锁内比对磁盘当前 revision，不一致则抛出并发冲突错误并中止保存；命令层捕获后向用户报错提示重试。**详细实现设计由 Schemer 在 op-004 方案中给出** | `src/core/flow-manager.ts` + 命令层 |

> **验证**：`npm run build && npm test` 全绿；并发写不损坏文件、不产生交错；并发 load-modify-save 通过乐观并发校验**显式报错**而非静默覆盖（无静默丢失更新）；无重号。
> **注意**：
> - 锁的获取范围要小（仅包裹「读-改-写」临界区），避免长事务阻塞。
> - `update_state.json` 的拆分（全局/项目）属 stage-39，本 op 仅替换写入机制，**不改路径**。
> - `kb/index.md` 若为追加型写入，需在锁内完成「读 → 拼接 → 原子写」，避免并发覆盖。

---

## 约束与设计决策

| # | 约束 | 处理方式 |
|---|------|----------|
| 1 | 不引入第三方依赖 | 仅用 `node:fs` / `node:crypto` / `node:path` |
| 2 | 避免过度设计 | 三个小工具，每个至少 3 处复用；低风险写入不接入 |
| 3 | 同步 API 风格 | 与现有同步写入保持一致，不改为异步 |
| 4 | 跨平台 | Windows `rename`/`unlink` 差异需容错；测试覆盖 |
| 5 | 临界区最小化 | 锁只包裹读-改-写，不包裹业务计算 |
| 6 | 不改业务语义 | 仅替换写入机制，输出内容不变 |
| 7 | flow.json 不直写 | Planner 不操作 flow.json；本阶段代码改造由 Executor 实施 |
| 8 | 中文注释 | 新增模块头部与公共方法须中文注释 |

---

## 测试策略

| 验证点 | op | 方式 |
|--------|----|------|
| 原子写正确性 | op-001 | 单元测试（新建/覆盖/父目录/中断/唯一名/行尾） |
| 文件锁互斥 | op-002 | 单元测试 + 并发子进程串行验证 |
| 序号无重号 | op-003 | 单元测试 + 并发子进程 |
| flow.json `.bak` 保留上一版本 | op-004 | 连续两次 save，断言 `.bak` == 第一次内容 |
| flow.json 所有写入路径受保护（REV-002） | op-004 | 审计 `save` / `restoreCheckpoint` / `initFlow`；`restoreCheckpoint` 加锁 + 原子写用例 |
| 乐观并发校验（乐观并发修订） | op-004 | 构造 load 后外部修改 flow.json 再 save → 断言抛冲突错误；revision 正常递增；无 revision 的旧文件兼容处理 |
| 高风险写入原子性 | op-004 | 现有测试回归 + 新增并发用例 |
| 全量回归 | op-004 | `npm run build && npm test` |

> **关键确认**：现有测试中与 `.bak`、公共日志序号、op 序号相关的断言需逐一核对（flow-manager.test.ts / scheme.test.ts / update.test.ts）。并发测试在 CI（Linux）与本地（Windows）均应稳定；若子进程方案在 CI 上不稳定，退化为同进程多 worker 模拟。

---

## 执行顺序

```
op-001 (atomic-write)  ┐
op-002 (file-lock)     ├─ 可并行（文件冲突域不相交）
op-003 (sequence)      ┘
        │
        ▼
op-004 (高风险接入)  [hard: op-001/002, soft: op-003]
```

建议执行批次：
- **批次 1**（可并行）：op-001、op-002、op-003（三个独立工具模块）
- **批次 2**：op-004（统一接入，文件冲突域集中在既有模块）

---

## 预期产出

| 产出 | 路径 |
|------|------|
| 计划文档 | `.openfeel/plan/v1/stage-35/plan.md`（本文件） |
| 依赖声明 | `.openfeel/plan/v1/stage-35/deps.yaml`（由 Schemer 细化） |
| 操作方案 | `.openfeel/plan/v1/stage-35/ops/op-{001..004}.md`（由 Schemer 细化） |
| 原子写工具 | `src/core/fs/atomic-write.ts`（新增）+ `test/core/fs/atomic-write.test.ts` |
| 文件锁 | `src/core/fs/file-lock.ts`（新增）+ `test/core/fs/file-lock.test.ts` |
| 原子序号 | `src/core/fs/sequence.ts`（新增）+ `test/core/fs/sequence.test.ts` |
| 高风险接入 | `flow-manager.ts`、`public-logger.ts`、`plan/{stage,scheme}.ts`、`update-state.ts`、`config.ts`、`workspace/{identity,knowledge}.ts`、`archive/merge.ts`、`metrics.ts` |

---

## 遗留风险

1. **锁 TTL 取值（REV-006 修订）**：TTL 过短会误抢活跃锁，过长会阻塞崩溃残留。**不采用固定 30s**：由 Schemer 实测最长临界区耗时（大 `flow.json` 序列化 + 公共日志「读-改-写」+ 全局配置写入）后据实设定（建议 ≥ 最长临界区 P99 的 2~3 倍），或改用心跳续期方案；必要时可配置。
2. **Windows 文件占用**：`unlinkSync` 释放锁时若被占用会抛错；须容错并依赖 TTL 兜底。Schemer 需明确释放失败的处理路径。
3. **`reserveSequence` 与内容写入的原子性缺口**：序号文件先被独占创建（空文件），随后才写内容；若进程在两步之间崩溃，会留下空文件占据序号。缓解：写入内容使用原子写；空文件可被后续清理或视为已用（不重号优先）。Schemer 需在方案中说明该权衡。
4. **并发测试稳定性**：CI 环境子进程调度差异可能致 flaky；建议设置合理重试与超时，必要时降级为同进程模拟。
5. **性能影响**：每次 save 增加 fsync + rename + 锁开销；对高频 `flow status`（只读）无影响，仅写入路径有开销，需确认可接受。
6. **`kb/index.md` 写入路径**：需确认 knowledge.ts 是否为追加型，若是，锁内读-改-写不可省略。
7. **Checkpoint 写入/清理并发竞态（REV-003 分析结论）**：`saveCheckpoint` 直接 `writeFileSync` 快照、`cleanupCheckpoints` 删除最旧快照、`restoreCheckpoint` 读取快照，三者均未加锁。**分析**：① 快照文件名含毫秒级时间戳，并发写不同名，写入互不覆盖；② 清理按文件名升序删最旧，可能与「读取中」的快照竞争删除，但 `restoreCheckpoint` 已先 `existsSync` + 读取内容 + `JSON.parse` 校验，最坏结果是恢复失败返回 `false`，**不会损坏 `flow.json`**；③ 快照本身为 best-effort（写失败静默跳过）。**决定**：快照文件写入改用 `atomicWriteFileSync`（防半写快照），但**不接入 flow 全局锁**（避免把长序列化纳入临界区、放大锁竞争）；清理竞态接受并以「读取失败即返回 false」兜底。理由：快照是可选恢复能力、非一致性关键路径，加锁收益低而阻塞风险高。
8. **flow.json load-modify-save 丢失更新边界（乐观并发修订）**：仅靠写互斥锁 + 原子写无法防止两个会话各持旧快照、后保存者覆盖前者的丢失更新。**已通过乐观并发校验缓解**——`save()` 在锁内比对磁盘 revision，不一致时显式抛出并发冲突错误并中止保存（命令层提示用户重试），不静默覆盖。**自动重试 / 冲突合并留待后续**（本阶段不做）。
