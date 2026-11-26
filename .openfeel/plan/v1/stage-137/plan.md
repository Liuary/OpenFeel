# v1.6.4-stage-137 计划（REQ-071 / fast 模式）

> 来源：需求正文 `.openfeel/requirements/REQ-071.md`（**判据源**，A71.1—A71.6）。本文件是执行前拆解与判据；判据编号只增不改，执行中变更按 §五 登记。
> 角色：`executor`＝T1—T4 + C6 全量门禁；`reviewer`＝独立复跑 C1—C6 与 diff 复核；`Feel`＝状态写操作与派单。单写者矩阵见 §2.0。
> **不包含**：`git push` / tag / `npm publish`（人类执行；push master 后 CI 自动发布 1.6.4）；不改 `flow.json` / `status.md` / `dist/**` / guard / 状态机；**零命令行为与 JSON 键集变更**（A71.6）。
> **修订记录（2026-11-26，评审 APPROVE_WITH_FIXES：2 blocking + 5 major）**：见 §五——同源计数入 T2、ADAPTER :291「四套→五套」、commands.md:304 同批、C2 键序断言、C4 四词逐条、版本九处。

## 一、目标与判据

### 1.0 事实锚点（2026-11-26 实测）

- **死文案**：`src/core/i18n-data/zh-CN.ts:1318-1319` / `en.ts:1271-1272` 仍写「以 frontmatter 为准」「default 遮蔽」；`frontmatter` 字面量全仓仅这 4 行，唯一引用方是 `src/commands/model.ts`，**零测试断言这两串**。
- **死分支**：`model.ts:76-78`（scope=default 的 inconsistent）、`:85-87`（inconsistent）、`:88-92`（shadowed）；`src/core/model-config.ts:244-248` 的 `byScope.default` 恒 `null`、`:254` 的 `inconsistent` 恒 `false` → 三分支不可达。
- **过期文档表述（新增，评审 #3）**：`dsh/docs/compat/commands.md:304` 仍写「the `inconsistent` notice never fires … the `model.get.shadowed` branch is retained but unreachable」——T1 删分支后该表述必须同批改为「两个分支已在 v1.6.4 删除（`inconsistent` / `byScope` 字段保留以稳定 JSON）」，否则代码与文档矛盾；该文件仅此一行在本次范围。
- **JSON 契约真实形状（A71.2 准星）**：`model get --json` = 键序 `schemaVersion,scope,agent,provider,model,source`（`test/cli/json-contract.test.ts:1098-1128` 锁定）；`model list --json` = 顶层 `schemaVersion,scope,agents`、条目 `agent,provider,model,source`（同测试 `:1103-1108`）；`get --scope default --json` 实测 `model:null` / `source:null` / exit 0（字段由 `toJsonModel` 判定，`model.ts:56-57`）。`byScope` / `inconsistent` 是**内部 API** `GetModelResult` 字段，由 `test/core/model-config.test.ts:101-113`、`:157-167` 锁定（三键 + `inconsistent===false`）。→ **只删 CLI 打印分支，绝不删这两个字段**（需求正文「`model --json` 的 byScope/inconsistent 键」是内部字段的简写）。
- **验证计数（T2 主战场，三文件同源）**：`dsh/ADAPTER.md:291`「四套验证」+ `:294-302` 仍写 53/129/180/10（标「v1.6.0 实测」，其中 :298-300 每行带该注记）；`dsh/README.md:306`「四套测试」、`:310-313` = 54/136/**191**/10、`:319`「当前 **191** 条」；`dsh/ACTION-GUIDE.md:79`「现行」半句 = 53/129/180/integration 10（前半句「存档 110 断言」是历史基线，保留）。本机 2026-11-26 实测：contract **54/54**、verify **136/136**、guard **193/193**、preflight **10/10**、integration 取不到 tools 服务 → **跳过 exit 0**（无可写断言数）。→ T2 同批把三处旧值全部改写，并把「四套」改「五套」。
- **config models**：`src/core/config.ts:105`（ModelsSchema）/`:115`（可选）/`:527`（null 预处理）语义不动，模板注释 `:575`/`:622` 已写「仅记录、不生效」；`.openfeel/config.yaml` **受 guard 保护**（agent 直写 = deny）→ 迁移只能人工编辑。落点 `docs/GETTING_STARTED.md:152-154`（`:154` 已写「不预设模型」块，新迁移节插在 :154 后）。
- **版本（九处，评审 #6 口径）**：① `package.json:3`；② `dsh/package.json:3`；③ `dsh/package.json:39` `requiresCli`；④ `package-lock.json:3` + `:9`；⑤ `CHANGELOG.md:1`；⑥ `docs/VERSIONS.md:20`（英文 highlight）；⑦ `docs/VERSIONS.md:62`（中文 `## v1.6.4` 段，插 v1.6.3 前）；⑧ `dsh/ADAPTER.md:18`（`requiresCli` ≥1.6.4）+ 文末新增 `## v1.6.4` 小节（历史小节逐字不改）；⑨ 新建 `docs/releases/v1.6.4.md`（仿 v1.6.3：来源阶段 stage-137 / REQ-071 / 变更摘要 / 验证命令 / CI 发布）。当前值均为 1.6.3；目标 **1.6.4（patch）**。`release --dry-run` **只**校验 ①②（两包版本相等）与 ⑤（CHANGELOG 顶部段），③④⑥⑦⑧⑨ 由 C5 人工逐条命中。
- **受影响测试**：`json-contract.test.ts`（#35/#36 键序）、`model-config.test.ts`（byScope/inconsistent）、`model.test.ts`（人类输出）——预期**全部不变绿**；无测试断言 ADAPTER 计数、README/ACTION-GUIDE 计数与这两条 i18n 文案。

### 1.1 判据表（A71.1—A71.6）

| 判据 | 要求 | 取证 |
|---|---|---|
| **A71.1** | i18n 死文案清零；`model.ts` 的 inconsistent/shadowed 三分支删除；`dsh/docs/compat/commands.md:304` 同步为「分支已删（字段保留）」 | C1 |
| **A71.2** | `get/list --json` 键集与键序不变；`get --scope default --json` = `model:null,source:null`,exit 0；`byScope.default` 恒 null、`inconsistent` 恒 false 保留 | C2 |
| **A71.3** | 同源三文件计数统一：`dsh/ADAPTER.md:291-302`（五套）= contract 54 / verify 136 / guard 193 / preflight 10 / integration 跳过，标 2026-11-26 快照；`dsh/README.md:306/:310-313/:319` 与 `dsh/ACTION-GUIDE.md:79` 同值 | C3 |
| **A71.4** | 文档有 config `models:` 迁移提示：可整段删、受 guard 保护需人改、删后重启会话；`init` 新项目无该段 | C4 |
| **A71.5** | 全量门禁全绿；1.6.4 lockstep（`requiresCli >=1.6.4`），九处版本引用 + CHANGELOG/VERSIONS/ADAPTER/release notes 同批；push 后 CI 发布 | C5、C6 |
| **A71.6** | 零行为变更：不动 model-config 语义 / guard / flow / JSON 键集；仅 1.6.4 阶段执行 | C2 + diff 复核 |

### 1.2 可复现命令（仓库根，pwsh）

```powershell
# C1（A71.1）—— 死文案/死分支清零，契约字段保留，doc 表述同步
Select-String -Path src/core/i18n-data/zh-CN.ts,src/core/i18n-data/en.ts -Pattern 'frontmatter'        # 0 行
Select-String -Path src/commands/model.ts -Pattern 'inconsistent|shadowed'                            # 0 行
Select-String -Path src/core/model-config.ts -Pattern 'inconsistent: false|byScope'                   # ≥2 命中
Select-String -Path dsh/docs/compat/commands.md -Pattern 'removed in v1\.6\.4'                        # ≥1 命中
Select-String -Path dsh/docs/compat/commands.md -Pattern 'retained but unreachable|never fires'       # 0 行（负向）
npx tsc --noEmit; npx vitest run test/commands/model.test.ts test/core/model-config.test.ts
# C2（A71.2）—— 键序 / 恒 null / 恒 false 不变（executor 跑，reviewer 复跑）
$g = node bin/openfeel.js model get openfeel-executor --json | ConvertFrom-Json
(($g.PSObject.Properties.Name) -join ',') -eq 'schemaVersion,scope,agent,provider,model,source'      # True
$d = node bin/openfeel.js model get openfeel-executor --scope default --json | ConvertFrom-Json
($d.scope -eq 'default') -and ($null -eq $d.model) -and ($null -eq $d.source) -and ($LASTEXITCODE -eq 0)  # True
$l = node bin/openfeel.js model list --json | ConvertFrom-Json
(($l.PSObject.Properties.Name) -join ',') -eq 'schemaVersion,scope,agents'                           # True
(($l.agents[0].PSObject.Properties.Name) -join ',') -eq 'agent,provider,model,source'                # True
npx vitest run test/cli/json-contract.test.ts test/core/model-config.test.ts
# C3（A71.3）—— 先跑后写，数字照抄输出；三文件同源逐行断言
cd dsh; node test/contract.js; node test/verify.js; node test/guard.js; node test/preflight.js; node test/integration.js; cd ..
# 期望逐行：contract 通过 54/54、verify 通过 136/136、guard 通过 193/193、preflight 通过 10/10、integration 跳过
Select-String -Path dsh/ADAPTER.md -Pattern '五套'                                     # ≥1（:291）
Select-String -Path dsh/ADAPTER.md -Pattern '54|136|193|preflight|跳过|2026-11-26'      # 5 行数字/状态逐条命中
Select-String -Path dsh/ADAPTER.md -Pattern '53|129|180|四套|v1\.6\.0 实测'             # 0 行（负向）
Select-String -Path dsh/README.md -Pattern '193'                                       # ≥2（:312 与 :319）
Select-String -Path dsh/README.md -Pattern 'node test/preflight.js|integration.js.*跳过'  # ≥2
Select-String -Path dsh/README.md -Pattern '191|四套测试'                              # 0 行（负向）
Select-String -Path dsh/ACTION-GUIDE.md -Pattern 'contract 54|verify 136|guard 193|preflight 10|integration 跳过'  # ≥5（:79）
Select-String -Path dsh/ACTION-GUIDE.md -Pattern 'contract 53|verify 129|guard 180|integration 10'                # 0 行（负向）
# C4（A71.4）—— 四词逐条（A71.4 四要素＝实际词；若落稿改用「不预设模型 / 平台提供」等表述，词表按实际词同步）
Select-String -Path docs/GETTING_STARTED.md -Pattern 'models.*段'      # ≥1（容忍 `models:`/`models` 反引号写法）
Select-String -Path docs/GETTING_STARTED.md -Pattern '整段删除'         # ≥1
Select-String -Path docs/GETTING_STARTED.md -Pattern '受 guard 保护'    # ≥1
Select-String -Path docs/GETTING_STARTED.md -Pattern '重启会话'         # ≥1
Select-String -Path docs/GETTING_STARTED.md -Pattern '^\s*models:\s*$'  # 0 行（负向：不给可抄的模型名）
# C5（A71.5）—— 九处版本引用逐条命中
node -p "require('./package.json').version+'/'+require('./dsh/package.json').version+'/'+require('./dsh/package.json').openfeel.requiresCli"
node bin/openfeel.js --version
Get-Content CHANGELOG.md -TotalCount 1
Select-String -Path package-lock.json -Pattern '"version": "1\.6\.4"'                   # 2 行（:3 / :9）
Select-String -Path docs/VERSIONS.md -Pattern '^## v1\.6\.4'                           # 1 行（中文段）
Select-String -Path docs/VERSIONS.md -Pattern 'v1\.6\.4'                               # ≥2（英文 highlight + 中文段）
Select-String -Path dsh/ADAPTER.md -Pattern 'requiresCli.*1\.6\.4|^## v1\.6\.4'         # ≥2（:18 + 文末新节）
Test-Path docs/releases/v1.6.4.md                                                      # True
node scripts/release.mjs --dry-run --skip-build   # 只校验两包 pkg + CHANGELOG 顶部，不含 requiresCli/lockfile/VERSIONS/ADAPTER/release notes
# C6（A71.5/A71.6）全量门禁 —— executor 跑，reviewer 独立复跑
npx tsc --noEmit; npm test; npm run build; npm run build
cd dsh; node test/contract.js; node test/verify.js; node test/guard.js; node test/preflight.js; node test/integration.js; cd ..
node bin/openfeel.js lint i18n; node scripts/release.mjs --dry-run --skip-build
```

## 二、任务拆解

### 2.0 单写者矩阵（严格串行）

| 文件 | 写者 | 说明 |
|---|---|---|
| `src/commands/model.ts`、`src/core/i18n-data/{zh-CN,en}.ts`、`dsh/docs/compat/commands.md`（**仅** :304） | **仅 T1** | 删三分支 + 两键双侧同删 + 该行改「分支已删（字段保留）」；`model-config.ts` 只改注释 |
| `dsh/ADAPTER.md`（**仅** :291-302「验证」段，含 :291 四套→五套）、`dsh/README.md`（**仅** :306、:310-313、:319）、`dsh/ACTION-GUIDE.md`（**仅** :79 现行半句） | **仅 T2** | 三文件同源计数一次改完；不碰其它段 |
| `docs/GETTING_STARTED.md`（**仅** :154 之后新迁移节） | **仅 T3** | 一段说明，不改 init 流程描述 |
| `CHANGELOG.md`、`docs/VERSIONS.md`、`docs/releases/v1.6.4.md`、`dsh/ADAPTER.md`（:18 + 文末 `## v1.6.4`）、`package.json`、`dsh/package.json`、`package-lock.json` | **仅 T4** | **在 T2 之后**；ADAPTER 只碰 :18/文末，**不得重写 :291-302**（同文件分区写） |
| **不改** | — | `src/core/model-config.ts` 逻辑、`src/core/config.ts`、guard、flow、`test/**`（预期无需改测试）、`README×2`（根 README.zh-CN/README.en）、`docs/commands.md` |

### T1（=A71.1/A71.2）死文案 + 死分支 + doc 表述
- `model.ts` 删 `:76-78` / `:85-87` / `:88-92` 三段；**保留** `toJsonModel`（`:38-69`，含 default 兜底判定）与 `model-config.ts` 的 `inconsistent`/`byScope.default` 字段（只把注释改成「契约字段，v1.6.4 起仅内部保留」）。
- i18n `model.get.inconsistent`、`model.get.shadowed` **zh/en 双侧同删**（A71.1 的彻底解；需求允许保留键位改文案 → 唯一退化路径见 G1）；**不做**：不删 `GetModelResult` 字段、不改 `emitJson` 键、不改测试。
- `dsh/docs/compat/commands.md:304`：`the inconsistent notice never fires … the model.get.shadowed branch is retained but unreachable` → `the inconsistent / model.get.shadowed branches were removed in v1.6.4 (the inconsistent / byScope fields stay for JSON stability)`；**只改这一行**。
- **负责/验收**：executor；C1 + C2。

### T2（=A71.3）验证计数三文件同批
- `dsh/ADAPTER.md`：**:291**「契约 / 行为 / 门禁 / 真实注册表 **四套**验证」→「… / 写前自愈 / 真实注册表 **五套**验证」；`:294-302` 改实测 5 行——contract **54** / verify **136** / guard **193** / preflight **10** / integration「取不到 tools 服务时跳过，exit 0」，各数字行标「2026-11-26 实测」并删掉 `v1.6.0 实测`。
- `dsh/README.md`：`:306`「四套测试」→「五套测试」；`:310-313` 改为 contract 54 / verify 136 / guard **193** / **新增 `node test/preflight.js`（10 项）** / integration「跳过（取不到 tools 服务时 exit 0）」；`:319`「当前 **191** 条」→ **193**；`:320` 的「15 个工具」保持（integration 具备 tools 服务时的断言，不属本次改写）。
- `dsh/ACTION-GUIDE.md:79`：**只改「现行」半句** → `contract 54 / verify 136 / guard 193 / preflight 10 / integration 跳过`；「存档 110 断言」半句保留（明标 v1.2.3 存档基线，不改历史数字）。
- 计数**先跑后写**（C3 第一条命令），禁止照抄本计划数字；三文件一次改完（同源，避免只改一处再漂）。**负责/验收**：executor；C3（逐行精确 + 负向零命中）。

### T3（=A71.4）config models 迁移提示
- `docs/GETTING_STARTED.md:154` 后新增：① 旧项目 `.openfeel/config.yaml` 可能残留 `models:` 段，**不生效**（只读 Awareness 兼容）；② 用编辑器**整段删除**（含缩进子行）——该文件受 guard 保护，agent 工具写入会被拒，必须人工改；③ 删后**重启会话**让 guard / 适配器重新读取配置，`openfeel config get --all --json` 可确认 defaults 仍五键；④ `openfeel init` 新项目（v1.6.2 起）已无该段。不给可抄的 `models:` 示例（C4 负向断言）；不改 `docs/commands.md` 与 `config.ts` 注释（已正确，A71.6 最小面）。**负责/验收**：executor；C4（四词逐条）。

### T4（=A71.5）版本与发布文档（九处）
- **版本锁步**：① `package.json:3` → 1.6.4；② `dsh/package.json:3` → 1.6.4；③ `dsh/package.json:39` `requiresCli` → `>=1.6.4`；④ `package-lock.json:3`/`:9` → 1.6.4。
- **文档**：⑤ `CHANGELOG.md` 顶部 `## [1.6.4] - 2026-11-26`（Changed：死文案/死分支 + doc 表述、ADAPTER 五套计数、迁移提示、版本）；⑥ `docs/VERSIONS.md:20` 英文 highlight 新 bullet；⑦ `docs/VERSIONS.md:62` 中文 `## v1.6.4` 段（插在 v1.6.3 前）；⑧ `dsh/ADAPTER.md:18` `requiresCli` ≥1.6.4 + 文末新增 `## v1.6.4` 小节（历史小节逐字不改）；⑨ 新建 `docs/releases/v1.6.4.md`（仿 v1.6.3）。
- **不做**：不改 README×2 / `docs/commands.md`（本轮无行为与契约变化）；不改 `dsh/ADAPTER.md:291-302`（T2 已写）。**负责/验收**：executor；C5。

## 三、严格串行

`T1 → C1/C2 → T2 → C3 → T3 → C4 → T4 → C5 → C6（executor）→ reviewer 独立复跑 C1—C6`。

- 不并行：T2/T4 同文件（`ADAPTER.md` 分区写：T2 只写 :291-302，T4 只写 :18 + 文末新节）；T4 的 `release --dry-run` 依赖 CHANGELOG 段 + 两包版本 + lockfile 同时就位，三者缺一即 exit 1。每步收尾立即取证，不攒到最后；T2 计数必须先跑 C3 再落文档，三文件一次改完。
- reviewer 只读复核：抽 C2 键序/`--scope default`、C3 三文件逐行计数与负向零命中、C4 迁移提示与负向、C5 九处版本引用，并按 diff 确认「零行为变更」（A71.6），不新增写文件。

## 四、风险

- **R1 删分支打穿 JSON 契约 / 文档与代码矛盾**：删的是打印分支不是字段；`inconsistent` / `byScope.default` 保留，C2 锁键序 + `--scope default` null + `model-config.test.ts` 三键断言。`dsh/docs/compat/commands.md:304` 同批改「分支已删（字段保留）」，C1 负向断言旧表述零命中；`toJsonModel` 的 default 兜底（`:60-66`）、`config.ts` 的 ModelsSchema 只读兼容、`docs/commands.md:1122`「人类输出不变」均不动（三行不可达，该表述仍成立）。若 executor 顺手删字段或漏改 :304 → 立即回退（A71.2/A71.1 硬门）。
- **R2 删 i18n 键引发 lint/引用残留**：双侧同删 + `Select-String 'frontmatter'` 零命中（C1）；`lint i18n` 检查两侧键一致，漏删一侧即红。若 lint/评审要求保留 → **G1**：保留两键、文案改「框架不提供 default 层（v1.6.3 起）」/「the framework no longer has a default layer」。
- **R3 计数再次漂移**：同源三文件（ADAPTER / README / ACTION-GUIDE）已全部纳入 T2 一次改写，C3 负向断言 `53/129/180/191/四套/v1.6.0 实测` 全零命中；将来任一测试增断言 → 仍由 T2 单写者复跑 C3 再改（不新增写者）。ACTION-GUIDE 的「存档 110 断言」是历史基线，**不得改**。
- **R4 版本九处引用漏改**：① `package.json:3`；② `dsh/package.json:3`；③ `dsh/package.json:39` `requiresCli`；④ `package-lock.json:3`/`:9`；⑤ `CHANGELOG.md:1`；⑥ `docs/VERSIONS.md:20`（英文）；⑦ `docs/VERSIONS.md:62`（中文）；⑧ `dsh/ADAPTER.md`（:18 + 文末新节）；⑨ 新建 `docs/releases/v1.6.4.md`。`release --dry-run --skip-build` **只**自动校验 ①②⑤（两包 pkg 版本相等 + CHANGELOG 顶部段）；③④⑥⑦⑧⑨ 由 C5 逐条人工命中。
- **R5 ADAPTER.md 双任务写**：T2 只动 :291-302、T4 只动 :18 + 文末新节；顺序 T2→T4，T4 不得重写验证段（reviewer 按分区核 diff）。

## 五、变更记录

- 2026-11-26 创建（planner，依据 REQ-071 A71.1—A71.6）：T1 死文案/死分支、T2 ADAPTER 计数、T3 config models 迁移提示、T4 版本与发布文档；严格串行 T1→T2→T3→T4→C6。
- 2026-11-26 修订（planner，评审 APPROVE_WITH_FIXES：2 blocking + 5 major）：①（blocking）T2 单写者扩为三文件同源计数（ADAPTER :291-302 / README :306+:310-313+:319 / ACTION-GUIDE :79），C3 增逐行精确断言 + 负向 `53/129/180/191/四套/v1.6.0 实测` 零命中；②（blocking）`:291`「四套验证」→「五套验证」纳入 T2 写入范围（:291-302），T4 不得重写；③（major）`dsh/docs/compat/commands.md:304` 同批改为「两分支已在 v1.6.4 删除（保留 JSON 键位）」；④（major）C2 增 `get --scope default --json` → model/source null、`get --json` 六键序、`list --json` 键序断言；⑤（major）C4 改四词逐条 Select-String（实际词按 A71.4 四要素）+ 负向 `^\s*models:\s*$` 0 命中；⑥（major）版本「七处」改「九处」并列全，注明 `release --dry-run` 只校验两包 pkg + CHANGELOG、其余人工 C5。
- **关键决策**：① i18n 两键**双侧删除**（非改文案），G1 为唯一退化路径；② A71.2 按**真实契约**取证——CLI `--json` 键集/键序与内部 `byScope/inconsistent` 字段分别锁定（需求正文表述是内部字段简写）；③ ADAPTER 验证段扩为 **5 套**（含 preflight 10、integration 跳过），三文件同源计数同批；④ 同源旧计数全部入 T2（不再「默认不动」），ACTION-GUIDE 存档基线半句保留。
