# 决策记录（ADR）

> 长期技术/架构决策（技术选型、架构方向、跨会话有效的设计取舍）以 ADR 轻量格式记录于此。
> 会话临时决策（流程调整、单次取舍）记录在 .openfeel/users/{username}/dev_last.md 的「决策历史」节，不写入本文件。
> 写入时机：Feel 做出长期技术/架构决策时，同步追加一条 ADR 记录。

## ADR 模板

### ADR-{NNN}：{决策标题}
- **日期**：{yyyy-mm-dd}
- **状态**：proposed / accepted / superseded / deprecated
- **决策**：{一句话描述采纳的决策内容}
- **理由**：{为什么这样决策，含备选方案及取舍分析}

## ADR 记录

### ADR-001：技术栈选型 TypeScript (Node.js ≥20)
- **日期**：2026-08-15
- **状态**：accepted
- **决策**：OpenFeel 采用 TypeScript（Node.js ≥20）实现，核心依赖 Commander / Zod / YAML / fast-glob。
- **理由**：CLI 工具需类型安全与丰富生态；Zod 提供运行时校验，YAML 兼顾可读性与工具链成熟度。

### ADR-002：仓库自身不再保留项目级部署资产（supersede N1）
- **日期**：2026-10-01
- **状态**：accepted（**supersede `kb/architecture.md` 的 N1 决策「仓库自身 `.opencode/` 不动」**）
- **决策**：OpenFeel **仓库自身**不再保留项目级部署资产——删除根 `AGENTS.md`、根 `opencode.jsonc`、`.opencode/{agents,skills,ADAPTER.md}`，并删除 `build.js` 步骤 8（自举重生成，防复活）；上述资产改由全局 `openfeel setup` 幂等部署（17 skill / 9 agent / 全局 `AGENTS.md`）。
- **上下文**：N1（2026-09-25）出于「项目精简仅指 init 新项目」的取舍，令仓库自身 `.opencode/` 作为构建产物/自举实例保留，并依赖 `build.js` 步骤 8 每次重生。
- **理由**：① 全局部署已完备（`setup` 幂等，含 `openfeel-cli-usage` skill 与全部纪律节）；② 消除「项目级与全局」双份资产漂移；③ 移除 `build.js` 步骤 8 以消除复活负担。备选（保留双份）被否，因漂移与维护成本高于收益。
- **后果 / 适用边界**：**缓解**——`.opencode/` 运行时目录（`node_modules`/`package.json`/`package-lock.json`/`.gitignore`）**保留**；项目级约束由全局 `AGENTS.md` 承载（重启会话生效）；各 agent `.md` 自带 `external_directory: "allow"` 不受根 `opencode.jsonc` 删除影响。**适用边界**：**目标项目**的 `.opencode/` 相关语义与 B 类保留清单**不受影响**（本决策仅针对 OpenFeel 仓库自身）。
- **回滚**：`git checkout <sha> -- AGENTS.md opencode.jsonc .opencode/` 恢复项目级资产 + `git revert` 恢复 `build.js` 步骤 8，随后 `npm run build` 复活受管实例；全局无需回滚（`setup` 向后兼容）。

### ADR-003：`status` 定义为 `phase` 的粗粒度投影（单一事实源 = `phase`），移除 `test_enabled`
- **日期**：2026-10-03
- **状态**：accepted
- **决策**：`flow.json` 的 `status` 字段定义为 `phase`（15 相位）的**粗粒度投影**，`phase` 为唯一事实源；`mapPhaseToStageStatus` 对任何**非 `done`** 相位**不得**返回 `'done'`（`review_passed` 恒返回 `'review_passed'`）；`autoRepairInconsistency` 仅允许 **phase→status** 修正，**绝不**由 `status` 前推 `phase`；移除已被 15 相位模型架空的 `test_enabled` 配置键。
- **理由**：根因链——`test_enabled=false` → `mapPhaseToStageStatus('review_passed')='done'` → 下一步 `advance --to test_pending` 入口 `autoRepairInconsistency` 强制 `phase='done'` → `no-path` 锁死（确定性，Pantheogen 整周期 6/6 复发）。`test_enabled` 仅影响 status 投影、与 phase 转移图无关，保留即制造终态假象与误导线。备选「保留为 deprecated no-op」被否（字段仍误导且无消费点）。
- **后果 / 适用边界**：存量 `config.yaml` 残留 `test_enabled` 行按非受管扩展键读入、不报错不崩溃；`config set test_enabled` 报无效键。`stage set --status` 增加值域校验（拒绝相位值）。
- **回滚**：`git revert` 对应 stage-62 commits；存量键无需迁移。

### ADR-004：故障恢复分层 —— 精准复位优先、全量快照回退为最后手段
- **日期**：2026-10-03
- **状态**：accepted
- **决策**：把恢复能力分层——① `flow stage reset <id> --to <phase>`（**允许回退**，受合法 phase 值域 + `to=done` 的 blocking REV 检查约束，不触发归档 commit）；② `flow checkpoint restore <file> --stage <id>`（**仅回退该阶段子树**，其它阶段逐字节不动）+ `--dry-run` 差异预览（零写盘）；③ 无 `--stage` 的全量 `checkpoint restore` 保留为**最后手段**；④ `flow advance` **不**回写 `status.md`，`flow health --fix` 为唯一批量对账回写入口。
- **理由**：原 `restore` 为全量覆盖，多阶段并行时存在跨阶段连带回退风险且无差异预览（Pantheogen 6 次锁故障全靠全量 restore 兜底）。分层后日常用精准复位、必要时用选择性快照回退、全量仅兜底。`advance` 不回写 status.md 以避免双写入口耦合（status.md 与 flow.json 的漂移由 `health --fix` 统一对账）。
- **后果 / 适用边界**：`reset` 是 `advance` 的对称复位能力，不受正向转移表限制但受值域/REV 约束；快照生成/命名/清理（20 上限）不变。
- **回滚**：`git revert` 对应 stage-65 commits；无数据迁移。

### ADR-005：新建阶段骨架初值取 `config.yaml` 默认值（`defaults`）
- **日期**：2026-10-03
- **状态**：accepted
- **决策**：`plan stage add` / `ensureStageSkeleton` 生成的 `status.md` 中 `执行模式`/`自动推进` 初值取 `config.yaml.defaults`（缺失回退内置 `DEFAULT_CONFIG`），并提供 `--exec-mode/--auto-advance` 显式覆盖；同时 `config set/get` 接受 `defaults.X ≡ X`，`config set <key> <v> --sync-stages` 支持批量同步既有阶段。
- **理由**：原实现**硬编码** `manual`/`disabled`（非文档推断的「取运行时 effective 值」），导致每个新建阶段都需手工 `stage set --auto-advance enabled` 校正。取项目默认即可消除逐个校正。
- **后果 / 适用边界**：**不改**有效值级联优先序（`status.md 局部 > config 默认 > profile > builtin`）；本决策仅影响**骨架初值**与**显式批量同步**。
- **回滚**：`git revert` 对应 stage-63 commits；无数据迁移。

### ADR-006：全局部署版本一致性检测（消除「升级 CLI 后静默加载旧全局部署」缺口）
- **日期**：2026-10-03
- **状态**：accepted
- **决策**：新增全局部署版本一致性检测，端到端消除「`npm i -g openfeel@X` 后全局资产不自动刷新且框架不检测不提示」的缺口。要点：
  1. **版本事实源**：复用 `~/.openfeel/update_state.json.openfeel_version`，**并补写入侧刷新**——每次 `setup`/`update` 全局部署后将字段置为当前 CLI 版本（该字段原仅首次建 state 时写入，不刷新会永久假漂移）。
  2. **检测**：新增 `src/core/deployment-check.ts`，返回四态 `ok`/`mismatch`/`missing`/`unknown`（只读、不锁、不写盘；`missing` 与 `unknown` 用 `existsSync` 分离；不逐文件哈希）。
  3. **被动提示**：任意命令经 `runCli()`/`startRepl()` 接入（**非顶层 commander 钩子**），仅 TTY + 非 `--json`/`--quiet`/`--version`/`--help`/CI/`OPENFEEL_NO_UPDATE_CHECK`、且非部署类命令时，向 **stderr** 提示（含部署/CLI 版本 + 指向 `openfeel setup` + 重启），**每进程一次**、**不改退出码**。
  4. **主动诊断**：`openfeel setup --check [--json]`（一致 exit 0；mismatch/missing/unknown exit 1；`--json` 纯 JSON + `schemaVersion:1`；零写盘）。**不新增顶层命令**。
  5. **不做**：联网版本查询、`postinstall` 自动刷新（KB 记其用户端静默失效）、逐文件哈希被动检测。
- **理由**：全局模板仅在会话启动时读取，升级 CLI 不重部署则静默加载旧 agent/skill/AGENTS.md（本轮 v1.1.4 发布后实测踩坑）。四态 + 强门控平衡可发现性与噪音；stderr 保护 `--json` 契约。
- **后果 / 适用边界**：检测针对**全局** state（项目 state 不参与）；state 损坏 → `unknown` 静默；降级（部署>CLI）按 `mismatch` 提示。
- **回滚**：`git revert` 对应 stage-66/67 commits；无 schema/依赖/数据迁移。
