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

### ADR-007：Claude 全局约束维持单文件 CLAUDE.md（不拆短路由文件）
- **日期**：2026-10-11
- **状态**：accepted
- **决策**：Claude Code 全局约束**维持单文件 `~/.claude/CLAUDE.md`**（模板源 `templates-data/claude/constraint/{zh-CN,en}.md`，stage-71 部署），**本期不拆分为「短路由文件 + 分包」结构**；`feel` 编排纪律**不蒸馏进 CLAUDE.md**，由 `feel.md` 承载（裁定 B）。
- **上下文**：Q2 曾问「CLAUDE.md `@import` 是否支持家目录路径」——若支持则可把长约束拆为短路由（`@import` 分包），改善可维护性。v1.1.6-stage-69 实机验证确认 **`@import ~/` 家目录路径受支持**（troubleshooting 记录）。
- **理由**：① 支持 `@import ~/` 并不等于**应当**拆分——单文件 `CLAUDE.md` 部署/更新/比对链路更简单（对齐 opencode `AGENTS.md` 单文件既定模式）；② 拆分引入多文件一致性/传播/备份复杂度，收益（可维护性）在本期约束体量（≈≤700 行）下不显著；③ 本期聚焦「内容适配」而非部署编排重构，拆分留待未来按需评估。
- **后果 / 适用边界**：`CLAUDE.md` 体量以软断言（≤700 行）约束；`feel` 纪律外置 `feel.md` 已部分缓解体量。**支持 `@import ~/` 为已确认事实**，未来若约束体量显著增长可据此重估。
- **回滚**：无（纯决策，无代码/数据变更）；如需拆分为后续独立阶段评估。

### ADR-008：Claude 全局 `settings.json` 注入（反转蓝本 §四原「不写 settings.json」裁定）
- **日期**：2026-10-11
- **状态**：accepted（**反转** `docs/claude-code-adapter-plan.md` 蓝本 §四原裁定「不触碰 `~/.claude/settings.json`」）
- **决策**：把 `~/.claude/settings.json` 注入作为 `openfeel setup/update --tools claude` 的**一等能力**——与 CLAUDE.md/agents/skills **一并部署**。注入框架自有键 `agent:'feel'`（裁定 G：默认 agent）与 `permissions.defaultMode:'auto'`（裁定 F：automod = auto mode），其余键（`env`/`model`/`modelPicker`/`theme`/`apiKeyHelper` 等）**逐字保留**；采用**严格 JSON「读-深合并-写回」**（独立实现，不复用 jsonc/受管区），写入前置备份、备份失败即跳过 + `anomaly`、合并无变化即 `skipped`（幂等）、默认（不含 claude）**零触**。
- **上下文**：蓝本 §四基于「`settings.json` 为用户高频占用、改动风险高」的保守取舍，初版显式不写。v1.1.6-stage-71 已交付 `getClaudeSettingsPath()`（尊重 `CLAUDE_CONFIG_DIR`）与 claude 部署接线、`backup.ts` D-CFG 备份 fallback，为 settings 注入铺平。
- **理由**：① `agent:'feel'` 是「Claude 会话以 feel 编排」交付核心（否则 Claude 侧无统一主会话入口）；② `permissions.defaultMode:'auto'` 令 automod 能力对 Claude 生效；③ 用户键**逐字保留** + **写前备份**使「覆盖框架自有键」可人工还原，风险可控；④ 严格 JSON 深合并独立实现（格式决定解析器）而非复用 jsonc，语义清晰；⑤ 仅显式 `--tools claude` opt-in，默认零触保证非回归。
- **后果 / 适用边界**：`settings.json` 属「用户高频占用资产」→ 写策略为**读-深合并-写回**（见 kb/patterns）。`permissions` 下用户子键深合并保留；用户 `permissions` 非对象时整键替换（D-SET2 边界，备份保护）。**本期不新增 `uninstall` 命令**（Q6），仅文档化回滚（备份还原 / 手动删两键）；纯 `uninstall` 列入后续版本。
- **回滚**：`git revert` 对应 stage-73 commits（`1fe29b0`/`8b2fdeb`/`2b5c3e3`）；备份可人工还原；无数据迁移、无依赖树变动。

### ADR-009：settings 注入冲突策略（D-SET）—— 框架自有键覆盖 + 备份保护
- **日期**：2026-10-11
- **状态**：accepted
- **决策**：当用户既有 `settings.json` 已设 `agent` 与框架 `agent:'feel'` 冲突时，**框架自有键原位覆盖**（`--tools claude` 为**显式 opt-in**，写前备份使原值可人工还原）；用户 `permissions` 下其它子键（`allow`/`deny` 等）**深合并保留**，仅补/覆盖 `defaultMode`；序列化固定 `JSON.stringify(obj, null, 2) + '\n'`，**依赖 JS 对象插入序、不显式排序**（保用户键序 + 二次运行字节幂等）。
- **理由**：备选「skip + warn（保守）」被否——当用户恰有 `agent` 键时会**静默不交付**（违反 settings 注入为交付核心）；`--tools claude` 为显式选择，覆盖 + 备份保护是「显式 opt-in + 可还原」的合理组合。**不显式排序**——排序会重排用户既有键（churn + 与「逐字保留」精神相悖）。
- **后果 / 适用边界**：用户 `permissions` 为空/缺失 → 从空对象合并；为非对象（如字符串）→ 以 `{defaultMode:'auto'}` 替换该键（原值仅可经备份还原，D-SET2 边界）。已知行为留痕（REV-73-002）：幂等重跑仍产生新备份（备份先于幂等判定，对齐既有 jsonc 无条件备份口径）。
- **回滚**：`git revert` 对应 stage-73 commits；备份可人工还原。

### ADR-010：新增 fast（快速迭代）工作流模式 —— 双转移表 + 模式标记驱动
- **日期**：2026-10-11
- **状态**：accepted
- **决策**：在既有完整流水线（full）之外新增 **fast 模式**（`workflow_mode: full|fast`，**默认 fast**）。fast 快线 = `plan_pending→plan_review→plan_passed→exec_running→review_pending→[review_failed↺]→review_passed→archiving→done`（跳过 `scheme_*`/`test_*` 共 **6 个 phase**；**计划审查 `plan_review` 不跳过**——reviewer 单轮必过，与代码审查同级；**保留 reviewer 单轮 + 失败回环为质量底线**）。〔**2026-10-11 需求变更 T7 修订**：原口径为「`plan_pending→plan_passed`（**跳过 `plan_review`**）共 7 个 phase / fast 表 8 条目」，现修订为含 `plan_review`、fast 表 **9 条目**（8 流转键 + `done`）；实施归 `v1.1.7-stage-76` T7（op-005）并已归档。〕实现三原则：① **phase 枚举零新增**；② **双转移表 + 表选择单一权威**（`getValidTargets` 唯一读点按 stage→mode→表选择，防第二信源）；③ **骨架全量铺 + 标记驱动**（plan/ops/deps/status 全量铺，减 Agent 接力不减结构）。模式作用域**阶段级**、记忆**项目级**（最后选择）；标记载体 `config.yaml defaults.workflow_mode` → `status.md「工作流模式」` → `flow.json` 可选冗余（**不参与级联**）。同步裁定：**部署级默认 `auto_advance: enabled`**（`DEFAULT_CONFIG` 由 disabled 翻转，与模式无关）。
- **理由**：完整流水线每阶段多轮接力成本高、迭代慢；fast 面向轻量变更。备选（新建 phase 枚举 / 单表 + 运行时判空）被否——前者破坏自描述一致性，后者引入第二信源。保留 reviewer 因审查是框架硬性纪律。骨架全量铺而非裁剪，因落盘是 CLI 机械操作不耗 Agent，裁剪反会破坏审计链完整性。
- **后果 / 适用边界**：fast 下 `flow phases` 须显式标注各模式表与差异（存在视图 vs 推进白名单语义保留）；`pipeline.yaml` 继续覆盖 full 表，fast 用内置表（本仓不启用 `fast_transitions`）；本仓 v1.1.7 自举期**全 full** 验证（防归因混淆）。
- **回滚**：`git revert` 对应 v1.1.7 各 stage commits；`workflow_mode` 字段移除后行为回落到既有 full 单表。
- **[需求变更 2026-10-11 修订｜已落地]**：fast 链**不再跳过 `plan_review`**——新链 = `plan_pending → plan_review → plan_passed → exec_running → review_pending → [review_failed ↺] → review_passed → archiving → done`（跳过 **6 项** / **9 节点** / fast 表 **9 条目** = 8 流转键 + `done`）；「计划审查单轮必过，与代码审查同级」。**已于 `v1.1.7-stage-76` T7（op-005）实施并归档**：引擎 `FAST_TRANSITIONS` 8→9 条目（`plan_pending → ['plan_review']` + 新增 `plan_review` 键）+ 文案 5 处（`config.ts`×3 + i18n×2）+ stage-74 断言 **14 点位**同步 + 全量扫描收口（旧口径归零）；单一取表点传导，未改 full 表 / phase 枚举 / 命令面。本 ADR 上文「跳过 `plan_review`／7 个 phase／7 流转键 / 8 条目」口径**已被本轮变更取代**（正文已就地修订并加注）。配套 supersede：`kb/architecture.md` #双模式转移表选择、`kb/index.md`、`manual/core/flow-manager.md`、`manual/index.md`、`kb/patterns.md` #工作流快线必经计划审查（归档官于 stage-76 归档执行）。

### ADR-011：新增「需求（requirement）流转系统」—— 四层模型 + 需求状态机 + 认领协议
- **日期**：2026-10-11（**2026-10-13 实施完成**：v1.2.0 双主题八阶段 `stage-78~85` 闭环，需求流转系统端到端落地；`--version`=1.2.0）
- **状态**：**accepted**（研究定稿 → v1.2.0 实施验收通过）
- **决策**：在「版本 roadmap → 阶段 stage → 方案 op」三层之上**插入需求层**，将线性计划范式升级为四层：`版本 → 需求 REQ-NNN → 计划 stage(15-phase) → 方案 op`。**需求 = 排期与调度层；计划 = 对某项明确需求的具体实现**。四条架构抉择（均采纳推荐项）：
  1. **状态模型 = 双层**：需求层保留粗粒度状态 `draft → scheduled → in_progress → done`（+ `blocked` / `cancelled` / `rejected`）；`in_progress` 的内部进度**由关联阶段的 15-phase 聚合**，工序单一事实源仍在 `phase`（对齐 ADR-003）；需求 `done` 由「全部关联阶段 done」聚合判定并同事务回写，避免双写漂移。
  2. **存储 = flow.json 内**：`flow.json` 新增顶层 `requirements` 字段（类比 `reviews`），复用 `FlowManager` 的 `withFileLock` + revision 乐观锁 + `atomicWriteFileSync{backup}` + 审计日志；需求正文落 `.openfeel/requirements/REQ-NNN.md`（人读），机读状态权威在 `flow.json`。
  3. **需求↔计划 = 1:N**：`stage.requirement_id` 单值、**可空**（存量阶段为 `null` = 遗留无需求）；一个需求由若干阶段实现（stage 单属一需求）。
  4. **认领 = 轻量原子**：`owner` + `claimed_at` 字段，`req claim` 做占用校验（防并发覆盖），**无 TTL/心跳**；替代现有「描述性责任字段」的并发覆盖风险。
  命令面：新增顶层命令 `openfeel req`（`add`/`list`/`show`/`claim`/`release`/`set`/`link`/`advance`/`board`/`next`）。落地路径（调研确认最小改动）：新建 `src/commands/req.ts` + `src/core/req/` + `src/cli/index.ts` 两行注册，**不触碰** `build.js`/`package.json`；`--json` 沿用 `schemaVersion:1` 约定。
- **理由**：现状唯一流转实体是阶段，一个版本 = 一串阶段跑完，版本内若干需求无独立身份/生命周期/排期/认领；`flow.json` 无 `requirements` 字段。需求层解耦「排期调度」与「执行工序」。备选被否：**派生单层**（无独立状态机，无法表达未排期/已认领/取消等前置态）；**独立完整状态机**（与阶段机双状态源，复杂度高）；**独立 `requirements.json`**（引入第二状态文件与跨文件一致性风险，需新 health 对账）；**M:N**（聚合语义模糊）；**完整认领**（TTL/心跳对单机场景过度）。
- **后果 / 适用边界**：`workflow_mode`（full/fast）与需求层**正交**——需求可分别由 full/fast 阶段实现。`artifact-graph`（产物图）与流水线**脱钩**，不作需求地基，仅可借其拓扑排序算法。向后兼容：新增可选字段，存量阶段 `requirement_id=null` 不破坏现有流水线；`mapPhaseToAgent` 责任派生继续服务阶段层。
- **回滚**：尚未实施（proposed）；若实施后回滚，`git revert` 对应 commits + 移除 `req` 命令注册两行；`flow.json` 的 `requirements` 字段为空/缺失时所有既有命令行为不变。

### ADR-012：v1.2.2 CLI 机器可读契约与「扩展优先」原则
- **日期**：2026-10-17
- **状态**：accepted（v1.2.2 四阶段 95~98 实施并验收完成）
- **决策**：按 OpenFeel-DSH 适配器 11 项需求（P0×3 / P1×4 / P2×4）升级 CLI 契约，并确立**扩展优先原则**：
  1. **OpenFeel 本体必须保持正常可用**；如非必要**只扩展、不修改**（新增字段/退出码/选项优先，既有语义零改动）。
  2. **确实必须修改时，原适配必须同步跟进**——opencode / Claude Code 适配模板、`openfeel-cli-usage` skill、docs / manual / README 须在同一版本内更新，不得让既有消费者静默失效。
  3. **退出码扩展为 0/1/2/3**：0 成功；1 预期拒绝（含门禁/相位非法/用法错误）；2 并发写冲突（既有语义不变）；3 内部错误。`kind`（refusal/internal）为分类权威，退出码为冗余信号；并发冲突 `kind=refusal`。
  4. **legacy 错误载荷只增不改**：`{schemaVersion,error:'...'}` 末尾追加顶层 `errorKind`，`error` 恒为 string、既有键序不变；`typeof doc.error` 为双形态判别规则。
  5. **档位只增不改**：`reviewTier` 保留为展示值，新增 `displayReviewTier` / `effectiveReviewTier`；三处输出（`flow phases` / `flow status.stages[]` / `flow next`）一致。
  6. **全局 `--project`**：根选项 + `runCli` 预扫描 chdir 单点；`knowledge dedup` 本地 `--project` 保留（不收敛）。
  7. **契约冻结**：`docs/json-contract.md` 为单一权威；`schemaVersion` 恒首键；成功出口 33 / 注册选项 34（v1.2.2）；`flow advance --json` 仅失败出口不计入成功出口。
- **理由**：适配器不应镜像 Agent 编制或解析中文文本；决策权威应在 CLI；扩展优先可最大化兼容既有 OpenCode / Claude Code / DSH 消费者。备选（直接重映射退出码 / 全量改新 envelope / 收敛本地 `--project`）均破坏既有消费者，被否。
- **后果 / 适用边界**：新增出口/字段为增量，既有行为与人类输出保持；版本收口后零业务代码改动。转出 v1.2.3：REV-95-009 并发 JSON 退出机制统一、`flow advance --help --review-tier` 文案、DSH `PHASE_AGENT` 镜像退役、锁超时 E2E 测试钩子。
- **回滚**：`git revert` v1.2.2 四个阶段归档 commits（`25ebc4e` / `87df0b7` / `cdef4ae` / `861f0b5`）；版本号与文档载体随 revert 回退；无数据迁移、无依赖树变动。

### ADR-013：v1.2.3 补丁收口 —— 转出项不挂账 + 并发 JSON 退出统一 + 测试 seam 门控
- **日期**：2026-10-17
- **状态**：accepted（v1.2.3-stage-99 实施并验收完成）
- **决策**：
  1. **转出项不跨版本挂账**：v1.2.2 收口期因「版本写入后零业务代码改动」冻结而转出的项，由紧随其后的补丁版本 **v1.2.3** 一次收口，不无限期延后。
  2. **并发 JSON 退出统一**：`handleConcurrentConflict` 的 JSON 分支改为「输出 envelope → `process.exitCode=2` → `return`」，与 `failCli` 语义一致；非 JSON 模式与退出码 2 语义零改动；10 个调用点全枚举，禁止 fallthrough。
  3. **锁超时测试 seam**：仅 `OPENFEEL_TEST_MODE=1` 生效，函数体内读取 + 显式 options 优先；生产默认 5000/3000ms 不变；用于稳定覆盖 `INTERNAL_ERROR/internal/3`。
  4. **REV-97-006 纯等价重构**：命令层 `req show` / `req set --workflow-mode` 的内联 `requirement_id` 过滤改用 `listLinkedStages`；core `allLinkedStagesDone` / `hasLinked` 等 done 判定原语保留。
- **理由**：v1.2.2 已冻结契约与版本；补丁版本是最小风险路径。测试 seam 门控避免生产行为泄漏；等价重构不改变任何输出。
- **后果 / 适用边界**：v1.2.3 为 semver 合法补丁号（不使用四段 `1.2.2.1`）；33 成功出口 / 34 注册选项与退出码 0/1/2 语义不变；存量 flow.json 零迁移。
- **回滚**：`git revert` v1.2.3 归档 commit（`ea9aa68`）及版本分片归档 commit；版本号回退 1.2.2；无数据迁移。

### ADR-014：v1.2.4 补丁收口 —— 归档覆盖保护 + 读命令 JSON 全覆盖
- **日期**：2026-10-17
- **状态**：accepted（v1.2.4-stage-100 实施并验收完成）
- **决策**：
  1. **A1 数据安全优先**：`archive <stage>` 对已有归档文件**拒绝覆盖**（`ARCHIVE_EXISTS` / `kind=refusal` / exit 1 / 零写盘），存在性检查**先于任何写盘**；新增 `--force` 显式覆盖；保护为**归档文件级**（`v1.2.0-stage-78` 与 `stage-78` 派生不同目标文件，互不触发）。
  2. **A2~A5 读命令 JSON 全覆盖**：`plan stage list`、`model list|get`、`flow retry`、`lint kb|i18n`、`roadmap show` 全部 `--json`；`config get --all --json` 一次取全量（不再因缺 key 拒绝）。
  3. **计数权威**：**40 成功出口 / 41 注册 `--json` 选项**；源码 / 契约 §5/§7 / 计数测试三处同步；`lint kb` 与 `lint i18n` 为两个独立 Commander 子命令，各计 1；`config get --all` 与 `archive --force` 为既有出口/选项扩展，不新增出口。
  4. **DSH 边界**：`dsh/` 适配器纳入 OpenFeel 版本管理但**代码归属 DSH 侧**；OpenFeel 不直接修改 `dsh/`，不将其纳入 lint/build/发布扫描；剩余 DSH 消费改造（`cli.text`→`cli.json`、`requiresCli` 升级）由 DSH 自行执行。
- **理由**：A1 是唯一会造成不可逆数据丢失的缺陷；拒绝覆盖 + `--force` 是最小、最安全的修复。读命令 JSON 全覆盖消除适配器最后的文本回显。计数口径必须三处同步，避免再次漂移。
- **后果 / 适用边界**：既有出口与退出码语义零改动；`--force` 为显式 opt-in；存量归档与 flow.json 零迁移；`dsh/` 零 diff。
- **回滚**：`git revert` v1.2.4 归档 commit（`1797df2`）及版本分片归档 commit；版本号回退 1.2.3；无数据迁移。

### ADR-015：v1.2.0 版本分片补做归档 —— 14 个版本书账对齐
- **日期**：2026-10-17
- **状态**：accepted（Feel 经 `openfeel flow archive` 补做）
- **决策**：对 v1.2.0 八个 done 阶段执行 `flow archive v1.2.0` 补做版本分片：产物 `.openfeel/flow-archive/v1.2.0.json`（8 stages / 0 reviews / 153 log），`meta.archived_versions` 追加 `v1.2.0`，flow.json 中该版本阶段移除。**不补刷 op 尝试记录**（25 个 op 保持 pending / attempts=0），历史原貌留档。
- **理由**：v1.2.0 收官期（2026-10-13）沿用「手工生成阶段摘要、不运行 `openfeel archive` CLI」的先例，版本分片从未创建；2026-10-17 补归档 v1.2.1~v1.2.4 时漏掉 v1.2.0，导致 8 个 done 阶段长期驻留 flow.json，与其余 13 个版本不一致。补做判据当前满足：全部阶段 done、0 blocking REV（`flow archive --dry-run` eligible=true）。
- **后果 / 适用边界**：`pipeline.phase` 由归档逻辑按活跃集重算，空集 → `active`（`archive-ops` 既有语义，非异常）；flow.json 阶段数归零、log 361→209；v1.2.0 各阶段摘要（`.openfeel/log/archive-v1.2.0-stage-78.md`~`85.md`）不受影响；无源码 / 契约 / 命令行为变更。
- **回滚**：`git revert` 本次提交；或从 `flow.json.bak`（归档前快照）恢复 flow.json 并删除 `flow-archive/v1.2.0.json`、从 `meta.archived_versions` 移除 v1.2.0。

