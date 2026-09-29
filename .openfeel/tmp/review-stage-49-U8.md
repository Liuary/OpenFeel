# v1.1.2-stage-49 U8 审查报告 — 部署与更新链路

> 审查单元：U8（op-008）| 审查官：openfeel-reviewer（GLM 异种推理）| 日期：2026-09-29
> 范围：12 个 `.ts`（`update/setup/migrate/init/backup/managed-region/update-state/update-infos/fs{atomic-write,file-lock,sequence}/utils/path`）
> 配套 REV：`.openfeel/users/Liuary/code_review/REV-v1.1.2-stage-49-U8.md`

## 一、取证方法与环境

| 要素 | 值 |
|------|-----|
| 命令环境 | Windows 11 (win32) / PowerShell 7 (pwsh) / node v24.18.1 / ripgrep 15.2.0 |
| 仓库基线 | git `20670b8 chore: 阶段归档 v1.1.2-stage-48`，`dist/` 与 `src/` mtime 同步（15:07:03 ≥ 15:07:01） |
| 实测方式 | 隔离 HOME（`USERPROFILE`/`HOME` 指向 `%TEMP%\openfeel-u8-review`）+ 临时项目 + `node bin/openfeel.js` 定向命令；未跑 `npm run build`/`npm test` 全量（并发门控） |
| 静态取证 | `rg` 调用点/锁作用域/分支定位 + 全文 read 12 源文件 + 9 个测试文件 |
| 基线核对 | 实测前后对真实 `~/.config/opencode`（3689 files, sha256 B4DEA4E2…）、`~/.config/openfeel`（1 file, 611F5916…）、仓库 `.openfeel/config.yaml`（867F7942…, mtime 639262319833111407）三者 hash **完全一致**；真实 `~/.openfeel/update_state.json` 有一例外，见 §六偏差披露 |

## 二、必查项逐项结论（12 项）

### 1. writeManagedFile 五分支（update.ts:1420-1521）✅ 通过

| 分支 | 位置 | 行为 | 写盘 | 备份 | update_infos | 返回值 |
|------|------|:--:|:--:|:--:|:--:|--------|
| created | :1440-1443 | 目标不存在，写 composeManagedContent 全文 | ✅ | 无需（新建） | 无 | `'created'` |
| updated（ok） | :1479-1493 | frontmatter 合并 + replaceRegion；全文比对（REV-901）无变化 → skipped | ✅（有变化时） | ✅ runPreWriteBackup | backed | `'updated'` |
| updated（adopt） | :1495-1505 | region=none + state hash 匹配 → 全量写新框架内容 | ✅ | ✅ | backed | `'updated'`（注释「等价 created 记为 updated」） |
| appended | :1506-1514 | region=none + hash 不匹配/无 state → 末尾追加 wrapRegion | ✅ | ✅ | appended | `'appended'` |
| malformed | :1517-1520 | 不写盘、不追加 | ❌ | 无 | anomaly | `'skipped'` |

- `runPreWriteBackup`（:1453-1477）：`BackupError` → `anomaly(note='backup_failed')` + 返回 `'skipped'` 不写盘；非 BackupError 上抛。✅ 与 manual/core/backup.md B3 一致。
- `ManagedAction = 'created'|'updated'|'skipped'|'appended'`（:1413），adopt 并入 updated、malformed 归 skipped——返回值自洽 ✅。
- `deployGlobalAsset`（:1529-1536）= writeManagedFile 的全局资产等价封装（stateKey=绝对路径、isGlobal:true），**生产调用点 9 处**：`setup.ts:42/49/58`、`update.ts:1625/1633/1642`、`migrate.ts:489/495/503`，`command` 三链路分别透传 `'setup'/'update'/'migrate'` ✅（op-008 所列行号已漂移 2-60 行，调用点数量与结构一致）。

### 2. 备份机制（backup.ts）✅ 通过

- **三步保护**：判存（:89 existsSync→null）→ ts 探测+mkdir（:95-104，撞名 `-2/-3` 绝不覆盖）→ 副本 atomicWriteFileSync（:111）→ manifest 读改写（:113/:62-77）。全部在 `withFileLock(globalLockPath('backup'))` **单一临界区内**（:92）✅ REV-005。
- **`{ts}` 缓存**（cachedTs :36）：进程内首次生成后复用 ✅（单测 backup.test:98 验证）；同毫秒撞名 `-N` ✅（backup.test:113 fake timers 验证）。CLI 每命令独立进程 → 每命令独立 ts 目录（实测两进程产生两个 ts 目录）。⚠️ manual「每次命令一个独立目录」在 REPL 同进程多命令场景实为「每进程一个」（REV-U8-012 措辞条目）。
- **manifest**：以 source 绝对路径为 key，同 ts 内重复备份覆盖同 key 条目（同一次部署会话内可接受；观察项）。
- **备份接入覆盖**：`backupFileBeforeWrite` 全仓 5 处调用 = init.ts:300（package.json）/migrate.ts:524（全局 jsonc）/update.ts:1455（受管资产）+1650（全局 jsonc）/setup.ts:65（全局 jsonc），与 manual「接入链路表」逐行一致 ✅。**绕过直写核查**：update-infos/update-state（豁免，manual 在案）、writeConflictFile（新建冲突标记，非覆盖）、项目 opencode.jsonc（仅缺失时写）、init config.yaml（不再覆盖，无写盘）——无漏网直写 ✅。
- **resetBackupSetCache**：仅清 cachedTs，测试隔离用，生产不调用 ✅ 与 manual 一致。

### 3. 事务边界与失败语义 ✅ 通过（A/B 分流实测双证）

- **setup**（setup.ts:39-99）：资产（27 文件）→ jsonc（备份在锁外→锁内 read-merge-write）→ state/hash。jsonc BackupError → anomaly + 跳过继续（:85-91）；非 BackupError 上抛。state 最后统一落盘，半途失败 → 文件已写但 state 未更新 → 下次 update 走「无记录」降级，因文件即最新内容，重建 state 后 hash 匹配，无实际损害 ✅。
- **update**（update.ts:1564-1761）：同 setup 结构；末尾双 state 路由（isAbsolute→全局，否则项目）+ 持久化（:1726-1758）✅。appended 亦记 hash（D38-1）防重复追加 ✅（update.test:294 三次序列验证）。
- **init**（init.ts:249-322）：package.json 仅在「实际将写」时备份；BackupError → 不写盘 + anomaly + skipped ✅（init.test:195）。
- **migrate**（migrate.ts:438-584）：备份（项目内 backupLegacy）→ 全局部署 try/finally（:487-542，**finally 回填 manifest.globalStateKeys**，REV-1405）→ state 拆分 → 清理 → assignee → 清理旧备份。**jsonc BackupError 无 catch → fail-fast**（:524）✅ manual REV-011-B。
- **A/B 分流实测**（隔离环境，`~/.openfeel/backup` 置为文件注入 BackupError）：
  - `migrate` → `迁移中止，可执行 rollback 回滚：备份失败…`，exit=1 ✅ fail-fast
  - `update` → `已跳过全局 opencode.jsonc 写入，继续其余步骤`，exit=0 + anomaly(backup_failed) 已记 ✅
  - `setup` → exit=0 ✅
  - fail-fast 后 `rollback` 收敛：恢复 legacy 文件、全局 state 无残留 key（实测 manifest.globalStateKeys=27，回滚后 agents/skills key 残留=0）✅
- **半途不一致评估**：update/setup 的 state 落盘在最后且文件内容自洽；migrate 的 finally 回填保证 rollback 信息不丢——逐链路均收敛 ✅。

### 4. 锁作用域 ✅ 通过

- 锁种类：`backup`、`global-opencode-jsonc`、`update-infos`、`global-update-state`（均 `~/.openfeel/locks/{name}.lock`，global-paths.ts:56）。
- **嵌套分析**：三链路 jsonc 备份均在 jsonc 锁**之外/之前**完成（setup.ts:64-70、update.ts:1649-1656、migrate.ts:523-529 注释+代码双证）→ 无 backup 锁嵌套 jsonc 锁 ✅。`withFileLock` 内部不调用其他 `withFileLock`（backup 锁内只有 fs 操作）✅。同步锁（sleepSync 阻塞），同线程嵌套同名锁会自死锁——全仓未发现嵌套用法 ✅。
- **释放保障**：finally + token 归属校验（file-lock.ts:172-184），单测覆盖异常释放/token 不匹配不误删（file-lock.test:40/62）✅。TTL 3000ms < timeout 5000ms，陈旧锁 rename 原子抢占（:87-111）✅。

### 5. init 语义 ✅ 通过（实测三证）

- config.yaml 已存在 → `skipped.push('…保留用户配置')` 无写盘无备份（init.ts:180-189）✅ stage-47 BUG-002 收口。
- 实测：用户自定义四键 config.yaml 经 `init` ×2 **字节不变**（SHA256 前后一致）、CLI 输出 skipped 提示、update_infos 无 backed 条目 ✅。
- package.json 备份块（:298-316）保留正确：仅实际写时备份、BackupError 不写盘 ✅。skipped 透传链路闭合：initWorkspaceCore→initProject→commands/init.ts:56-58 输出 ✅。

### 6. migrate 链路 ✅ 通过（dry-run/执行/rollback 实测）

- legacy 检测五判据（:97-150）+ 框架同源判定（REV-007，normalizeAgentName/remapSkillName 归一化）✅ 实测旧名 planner.md 被正确归 framework、custom-agent.md 归 custom。
- 备份/回滚：backupLegacy 三类改写（jsonc/state/flow.json）+delete 型均入 manifest ✅；rollbackMigration 逆向恢复 + 仅删本次全局 state key（REV-1302）✅ 实测恢复 4 文件、全局 state 无残留。
- 项目自定义资产保留 ✅ 实测 custom-agent.md 原位保留。
- state 拆分重键 ✅（agents 新名/skills 补前缀/core.md→AGENTS.md 三规则 + unmapped 保留待人工）。
- **`--dry-run` 真不写盘** ✅：快照级单测（migrate.test:144）+ 实测 `.opencode` 未动；dry-run 分支在 backupLegacy 之前 return（:458-465）。

### 7. update_infos.md ✅ 基本通过（一处累积缺口）

- 三类条目（:41-56）+ `SECTION_PREFIXES` 读侧短前缀匹配（stage-47，紧邻 SECTION_TITLES 定义，:52-56）+ 迁移约束注释 ✅。
- 勾选语义：`- [x]` → resolved=true，解析/写回一致 ✅（update-infos.test:210）。
- 向后兼容：旧格式无尾部段正常解析 ✅（update-infos.test:185）。
- **累积评估**：anomaly 有路径级去重（REV-1103，:172-184）；appended/backed **无去重且 `clearUpdateInfos` 生产零调用**——文件只增不减（backed 不去重有测试背书 = 有意历史记录设计，但 resolved 条目永不清理）→ **REV-U8-001**（建议清理策略或文档化手工清理）。
- 实测附加证据：malformed 文件连续 2 次 update → anomaly 节 planner 条目仅 1 条（**REV-1103 去重行为正确，但无单测断言** → REV-U8-004）。

### 8. 实现 × 断言矩阵（完整表见 §四）

结论：五分支/备份三分区/锁四路径/migrate 五判据+rollback/dry-run/BUG-002 均有**强断言**；缺口 4 处（REV-U8-004/005/007 + markFileConflict 死代码路径），全部非阻塞。

### 9. 文档-实现对齐（抽查 11 处）✅ 通过（2 处措辞条目）

| # | 文档表述 | 实现证据 | 结论 |
|---|---------|---------|:--:|
| 1 | backup.md 接入链路表 5 行 | 5 处调用点逐一对应 | ✅ |
| 2 | backup.md REV-011 A/B 分流 | 实测 exit 0/0/1 + 代码 catch 有无 | ✅ |
| 3 | backup.md BUG-002 不再覆盖 | init.ts:180-189 + 实测字节不变 | ✅ |
| 4 | backup.md B2 {ts} 撞名 -N 绝不覆盖 | backup.ts:95-104 + 单测 | ✅（「每命令」措辞见 REV-U8-012） |
| 5 | init.md initWorkspaceCore 不再覆盖计入 skipped | init.ts:181-184 | ✅ |
| 6 | update.md writeManagedFile 三态描述 | update.ts:1420-1521 | ✅ |
| 7 | update-state.md 双 state 结构 | update-state.ts:89-153 | ✅ |
| 8 | update-infos.md 三类条目+note 语义 | update-infos.ts:15/41-56 | ✅ |
| 9 | managed-region.md 四策略 | managed-region.ts:7-11/22-25 | ✅ |
| 10 | migrate.md 事务/回滚描述 | migrate.ts:438-656 | ✅ |
| 11 | managed-region.ts:182 注释「字段级白名单」 | 实现为全量 spread 浅合并无白名单 | ⚠️ REV-U8-011（注释措辞） |

## 三、六维度裁定

| 维度 | 结论 | 要点 |
|------|------|------|
| 正确性 | ✅ | 五分支/五调用点/三链路时序/事务边界/锁作用域全部实证通过；A/B 分流与 manual 裁定一致 |
| 规范性 | ✅（1 措辞） | 注释完备（错误路径/分支意图均有）；REV-U8-011 一处注释与实现不符；无过度抽象（fs 三件套均有真实调用方：sequence→public-logger/plan-scheme，atomic-write→全链，file-lock→四锁） |
| 安全面 | ✅（1 防御缺失） | REV-U8-007 computeBackupRel 无 `..` 逃逸防御（调用方当前均保证路径域，防御性缺口）；update_infos/update_state 写入全程锁+原子写 ✅；rmSync 均限项目内路径 ✅ |
| 完整性 | ✅ | 12 文件全覆盖；备份接入无绕过直写；skipped 透传 init/update 闭合（setup 命令层缺输出 → REV-U8-002） |
| 一致性 | ⚠️（3 处） | REV-U8-002（setup 命令层 skipped 不输出 vs init/update 输出）；REV-U8-006（migrate 项目备份 UTC+无撞名保护 vs backup.ts 本地时区+撞名保护）；REV-U8-009（saveUpdateState 无锁 vs saveGlobalUpdateState 有锁） |
| 过度设计 | ⚠️（1 处） | REV-U8-003 `atomicWriteJson` 生产零调用（预留 API）；`writeConflictFile/getIncomingContent` 为 conflicts 恒空下的兼容保留（注释在案，不算缺陷） |

## 四、实现 × 断言矩阵（U8 专项，与 U5 交叉）

| 实现行为 | 测试断言位置 | 强度 |
|----------|-------------|:--:|
| created 分支 | update.test:490, setup.test:52 | 强 |
| updated 区内替换+区外逐字符保留 | update.test:503 | 强 |
| adopt（hash 匹配全量写） | update.test:534（含 backed 断言） | 强 |
| skipped 无变化（REV-901） | update.test:523 | 强 |
| appended + 幂等 + infos | update.test:274/335/651 | 强 |
| malformed 不写盘 + 修复后走 updated（REV-1001） | update.test:669 | 强 |
| 资产备份失败→未写+anomaly | update.test:607, setup.test:126 | 强 |
| jsonc 备份失败 A 分流（setup/update） | setup.test:149, update.test:630 | 强 |
| **jsonc 备份失败 B 分流（migrate fail-fast）** | **无**（REV-U8-005；本审查 CLI 实测补证 exit=1） | 缺口 |
| **finally 回填 manifest.globalStateKeys（REV-1405）** | **无**（REV-U8-005；实测补证 27 keys 回填+rollback 收敛） | 缺口 |
| backup 不存在→null / global / project 分区 | backup.test:57/63/86 | 强 |
| ts 复用 / 撞名 -2 / 绝不覆盖 | backup.test:98/113 | 强 |
| BackupError 可识别（含 filePath） | backup.test:133 | 强 |
| backup 跨进程并发（REV-005） | backup.test:166（dist 依赖条件执行） | 中 |
| **同 ts manifest 多文件累积** | 仅间接（update.test:598 双文件） | 中 |
| **computeBackupRel `..` 逃逸防御** | **无**（实现亦无防御，REV-U8-007） | 缺口 |
| 锁互斥/超时/陈旧抢占/token 归属 | file-lock.test:34-74 | 强 |
| 锁跨进程 4×25 | file-lock.test:76（条件执行） | 强 |
| migrate 五判据 / REV-007 | migrate.test:89/114 | 强 |
| dry-run 快照级不写盘（REV-1307） | migrate.test:144/160 | 强 |
| state 拆分重键（REV-1303/911） | migrate.test:171 | 强 |
| rollback 收敛（REV-1201/1302） | migrate.test:306 | 强 |
| cleanOldBackups（REV-1206） | migrate.test:340 | 强 |
| parseRegion 四态 / CRLF / N6 | managed-region.test:50-102 | 强 |
| replaceRegion 防误用（REV-1007） | managed-region.test:133/137 | 强 |
| frontmatter 边界（REV-1005/1008/非深合并） | managed-region.test:156/184/178 | 强 |
| update-infos 三类+兼容+勾选+节序 | update-infos.test（17 it） | 强 |
| **anomaly 去重（REV-1103）** | **无**（REV-U8-004；本审查 CLI 实测补证 2 次 update→1 条） | 缺口 |
| 双 state 路由（绝对/相对） | update.test:382 | 强 |
| init BUG-002（字节不变+skipped+无 backed） | init.test:165 | 强 |
| init package.json 备份失败 | init.test:195 | 强 |
| atomic-write（temp 唯一/失败清理/CRLF 原样/S5） | atomic-write.test（8 it） | 强 |
| sequence（O_EXCL/空占位/并发） | sequence.test（8 it） | 强 |
| markFileConflict（conflicts 恒空死路径） | 无直接断言（兼容保留） | — |

**U5 交叉引用**：本单元 9 个测试文件的隔离纪律（`vi.hoisted` + `vi.mock('node:os')`、mkdtemp 隔离 HOME、afterEach 清理、spawnSync 子进程 env 覆盖）合规良好——隔离与断言质量的横切判定归 U5（`.openfeel/tmp/review-stage-49-U5.md`），本单元仅判「实现分支 ↔ 断言对应」。

## 五、REV 发现清单（12 条，全部非阻塞）

详见 `REV-v1.1.2-stage-49-U8.md`。摘要：U8-001 update_infos 累积无清理；U8-002 setup 命令层 skipped 不输出；U8-003 atomicWriteJson 零调用；U8-004 REV-1103 无单测；U8-005 migrate fail-fast/finally 回填无单测；U8-006 migrate 项目备份 UTC+无撞名保护；U8-007 computeBackupRel 无逃逸防御；U8-008 jsonc 不可读时降级二次抛错；U8-009 项目级 saveUpdateState 无锁；U8-010 rollback 强制 cwd；U8-011 mergeFrontmatter 注释措辞；U8-012 文档行号/措辞漂移（op-008 行号、update.ts 行数、manual B2「每命令」）。

## 六、覆盖度、局限与过程偏差披露

**覆盖**：12 源文件全文 read；9 测试文件全文核对；CLI 定向实测 12 组（setup×2/update×5/migrate×5/init×2/rollback×3/A-B 分流注入×4/anomaly 去重/BUG-002/manifest/双备份）。

**局限**：
1. 未跑 `npm test` 全量（并发门控）；条件执行测试（backup 并发、锁跨进程）未在本次实跑，采信单测代码级核对。
2. 锁超时（timeoutMs 场景）未注入实测；REPL 同进程多命令的 ts 复用为逻辑推理。
3. mergeGlobalOpencodeJsonc 内部算法归 U3（opencode-config.ts），本单元仅验证其在三链路的调用语义。

**⚠️ 过程偏差披露（1 起，须如实记录）**：
- 第二次 rollback 实测调用（workdir=隔离项目）**遗漏重设 `USERPROFILE`/`HOME`**（bash 工具每次调用为独立进程，env 不延续），`rollbackMigration` 的全局 state 还原步骤（migrate.ts:630-636）对**真实** `~/.openfeel/update_state.json` 执行了一次「删除 0 个 key + 原样重写」（manifest.globalStateKeys 全为隔离路径，与真实 27 key 零交集）。
- **损害评估**：内容级无变化——实测读取确认真实 state 仍为 27 个真实 `.config\opencode` key、`openfeel_version: 1.1.1`、`last_update: 2026-09-26`（未被本次触碰改写）、无任何隔离路径 key 混入；仅文件 mtime 更新（23:11:10）。数据完整性未受损。
- **整改**：后续实测调用已全部补齐 env 隔离并完成基线复核；此偏差同时实证了 REV-U8-010（rollback 强制 cwd、无参数守卫外的误操作面）在真实环境中的表现。
- 其余三处真实路径基线（`~/.config/opencode`、`~/.config/openfeel`、仓库 config.yaml）前后 hash 完全一致 ✅。
