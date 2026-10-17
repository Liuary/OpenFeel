# v1.2.2-stage-98 计划 — 文档与版本收口（v1.2.2 收官）

- **阶段**：`v1.2.2-stage-98`（v1.2.2 四阶段之四 · 收官）
- **依赖**：**hard: `v1.2.2-stage-95` / `v1.2.2-stage-96` / `v1.2.2-stage-97`**（全部功能与契约冻结后）
- **优先级**：P0（版本级终局包装：文档多载体 + CHANGELOG + 版本 **1.2.2** 全链路 + DSH 端到端契约验收 + 回填）
- **关联需求**：REQ-001（CLI 机器可读契约与调度决策下沉（DSH 适配器需求）；关联由 Feel 经 `openfeel req link` 执行）
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-17 ｜ **修订轮**：修订 1（REV-98-001~004：基线重登记 / 33 出口计数与验收口径 / 承接明细与 `--review-tier` 冲突裁定 / DSH 降级路径）
- **基线**：**HEAD `cdef4ae`**（stage-97 归档提交）+ 当前工作区；上游门禁登记值 **74 文件 / 1894 用例**、`lint i18n` **983**、`lint kb` **0 过期 / 614 引用**（REV-98-001 登记值；本会话复测 622，收口门禁以实测登记）、`--version` 1.2.1、flow.json `meta.revision 1261` / **21 stages**（stage-95~97 已归档，stage-98 当前）/ `reviews` 0。**实况复核**：本阶段门禁起点以 HEAD `cdef4ae` 实测为准；表 A A 类行号经 REV-98-001 实测确认现势有效。
- **定位**：把 v1.2.2（四阶段 95~98）收口为**可归档状态**——在全部契约冻结后完成三件事：
  1. **文档多载体**：README×3 / GETTING_STARTED / commands / `docs/json-contract.md` 定稿 / manual / `openfeel-cli-usage` skill 快照。
  2. **版本收口**：版本 **1.2.2** 全链路 A/B/C/D/E + `CHANGELOG [1.2.2]`。
  3. **端到端验收**：用 **33 个成功出口全量**（19 既有 + 14 本版新增）做契约断言，并输出 **11 项需求 → 出口映射视图**（每项需求列出其消费出口）；OpenFeel-DSH 真实消费（含降级路径）；roadmap/plan 回填；承接 REV 处置表。
- **收口纪律（承 v1.2.1-stage-93 / REV-85-006 定稿）**：**版本收口 op = 阶段最终 op**（版本号写入、CHANGELOG、验收、门禁、回填**同 op**）；版本号修改后至阶段结束**不再引入任何代码改动**；收口期不引入新功能。
- **范围（文件级）**：
  - **文档载体**：`README.md` / `README.zh-CN.md` / `README.en.md`；`docs/GETTING_STARTED.md`；`docs/commands.md`；`docs/json-contract.md`；`.openfeel/manual/{index.md,cli/commands.md,core/flow-manager.md,core/req.md}`；`src/core/templates-data/skills/openfeel-cli-usage/SKILL.md`。
  - **版本载体（A 类）**：`package.json:3`；`package-lock.json:3/:9`；`.openfeel/config.yaml:7`；`src/core/config.ts:436/:493`；`src/core/templates-data/agents-md/{zh-CN,en}.md:135`；`src/core/templates-data/claude/constraint/{zh-CN,en}.md:138`。
  - **生成物（B 类）**：`src/core/template-loader.ts` + `src/core/update.ts`（build 重生成）。
  - **传播（C 类）**：`CHANGELOG.md`；README×3；docs×2 + json-contract；cli-usage skill。
  - **回填**：`.openfeel/roadmap/v1.2.2.md`；`.openfeel/plan/v1/v1.2.2/plan.md`。
  - **验收材料**：`.openfeel/tmp/stage-98-*.md`（DSH 契约断言报告 / 版本收口清单 / 承接表）。
- **边界**：
  1. **收口期冻结**：除文档 / 版本载体 / 验收材料外零代码改动；版本号写入后零代码改动。
  2. **不新增功能 / 命令 / 字段 / 配置键**；发现缺口 → 记录评估，不擅自扩面。
  3. **A 类内容特征扫描兜底 + D 类 file:line 白名单**（禁广谱 sed）；`package-lock.json` 禁 `npm install`；`config.yaml` 禁整文件重写。
  4. **双生成物纪律**：`templates-data/**` 任何改动（cli-usage / agents-md / constraint）→ 同批 `npm run build`；`git status --porcelain src/` ⊆ produces。
  5. **零回归**：既有 19 个成功出口字段 / 人类输出 / phase 枚举 15 项 / `advanceAccepted` / full-fast 行为逐字不变；存量 `flow.json` 零注入。
  6. **不 `npm publish` / 不 `git push`**；不直写 `flow.json`；不推进 phase（由 Feel 经 CLI 执行）。
  7. **平台 / 外部仓库**：DSH 验收以只读消费为主；不修改 DSH 仓库源码（除验收脚本 / 报告，且不纳入本仓提交）。

## KB 检索（`openfeel-check-kb`）

- `kb/patterns.md #版本号全链路收口清单模式：A 必改 / B 生成段 / C 传播 / D 禁改 / E 无载体` → T2 逐类核对。
- `kb/patterns.md #文档侧历史标记纳入版本收口禁改白名单：B 类双生成物 + 「残留=0」白名单化 + 收口 op 为最终 op` → ① B 类 = `template-loader.ts` **+** `update.ts`；② 残留 = 0 白名单化；③ 收口 op 最终。
- `kb/patterns.md #双主题收官端到端验收范式（隔离脚本 + 本仓复核二分）` → T3 验收法。
- `kb/patterns.md #README 与实现同步的检查清单（测试数/命令表/架构图/部署口径/旧版本号零残留）` → README×3 五面核对。
- `kb/patterns.md #部署型资产变更的多载体同步面清单` → 新命令面 / 新 JSON 出口的同步面。
- `kb/patterns.md #陈旧计数「全枚举」纪律` + `#同类缺陷一次全量扫描` → 测试数 / 出口计数 / 键数逐处判类。
- `kb/patterns.md #未来功能/未落地能力写入 skill 与文档须标注「提供版本」` → cli-usage / README 的「v1.2.2 起提供」标注。
- `kb/troubleshooting.md #改 templates-data 源须同批重生成的「双生成物」` + `#build「双生成物」禁手改的段二分` → B 类纪律。
- `kb/troubleshooting.md #断言串与落文逐字核对纪律` + `#多源文案同步陷阱` → 文档 / 断言 / 代码同批。
- `kb/troubleshooting.md #默认开启写真实用户目录的副作用防护` + `#子进程测试未设 cwd 致真实仓库污染` → DSH 验收隔离环境。
- **无**「DSH 适配器契约验收」既有条目 → 归档轮补沉 patterns。

---

## 一、实测清单（基线 HEAD `cdef4ae`）

### 表 A：版本载体（1.2.1 → 1.2.2）

| 类 | 事实（实测） | 位置 | 处置 |
|:-:|------|------|------|
| A1 | `package.json` `"version": "1.2.1"` | `package.json:3` | 改 `1.2.2` |
| A2 | `package-lock.json` root 两处 `1.2.1`（另含依赖自身 `1.2.1`，D 类禁改） | `package-lock.json:3/:9`（依赖版本如 `:765/:3101` 等） | 手改两处；**禁 `npm install`** |
| A3 | `.openfeel/config.yaml` `meta.version: 1.2.1` | `.openfeel/config.yaml:7` | **单行 edit** |
| A4 | `CONFIG_TEMPLATE_{ZH,EN}` 版本行 | `src/core/config.ts:436/:493` | 改 `1.2.2` |
| A5 | agents-md 版本行 ×2 语言 | `templates-data/agents-md/{zh-CN,en}.md:135` | 改 `1.2.2` |
| A6 | claude/constraint 版本行 ×2 语言 | `templates-data/claude/constraint/{zh-CN,en}.md:138` | 改 `1.2.2` |
| B | 双生成物 `template-loader.ts` + `update.ts` | `build.js` | `npm run build` 重生成；禁手改 |
| C1 | CHANGELOG 末节 = `## [1.2.1] - 2026-10-15`；无 `[1.2.2]` | `CHANGELOG.md:5` | 追加 `## [1.2.2]` |
| C2 | README 横幅 `最新版本 v1.2.1` + `v1.2.1 新增能力` 节 | `README.md:11/:51` | 横幅 → v1.2.2 + 新增 v1.2.2 节（历史节保留） |
| C3 | README.zh-CN / en 测试数行仍为 v1.2.1 快照值（测试文件数 / 用例数） | `README.zh-CN.md:230` / en 对应行 | 更新为收口门禁实测值（基线 **74 文件 / 1894 用例**） |
| C4 | GETTING_STARTED / commands 快照 v1.2.1；commands 未含 `flow next` / 全局 `--project` / 13 读命令 `--json` / 错误封装 / `--version --json` | `docs/GETTING_STARTED.md:3`；`docs/commands.md:3` | 快照 v1.2.2 + 新命令面补漏 |
| C5 | cli-usage skill 快照 v1.2.1；`description` 止于 v1.2.1 | `skills/openfeel-cli-usage/SKILL.md:3/:15/:38/:50` | 快照 v1.2.2 + 新增「v1.2.2 新增能力」节 |
| D | `src/**` 历史 `1.2.1` 残留（历史批注 / 依赖版本 / 测试注释） | 执行期 `rg "1\.2\.1"` 逐命中判类 | 白名单 file:line 显式枚举；禁广谱 sed |
| E | 非版本型文档 | — | 按需判类 |

### 表 B：文档载体现状

| # | 载体 | 现状 | 结论 |
|:-:|------|------|------|
| B1 | `docs/json-contract.md` | stage-95 新建；stage-96/97 增量维护 | 本阶段定稿（**19 既有 + 14 本版新增 = 33 成功出口全表**；注册选项 34） |
| B2 | `docs/commands.md` | v1.2.1 快照，无 v1.2.2 命令面 | 补 `flow next` / 全局 `--project` / 13 读命令 `--json` / 错误封装 / `--version --json` / `archive --json` / `reviewTier` 消歧 |
| B3 | `docs/GETTING_STARTED.md` | v1.2.1 快照 | 新增「v1.2.2 能力速览」+ 最小示例（`flow next` / `--project` / 错误 envelope / 读命令 JSON） |
| B4 | README×3 | v1.2.1 横幅 + 能力节 | 新增 v1.2.2 节；三载体逐节同构；测试数更新 |
| B5 | manual | `cli/commands.md` / `core/flow-manager.md` / `core/req.md` 需核对 | 新增 `flow next` / 错误层 / 全局 `--project` / `req list` 扩展；命名核对禁新建重复页 |
| B6 | cli-usage skill | v1.2.1 快照；无 v1.2.2 节 | 快照 v1.2.2 + 新节 + 出口计数订正（全枚举） |
| B7 | `docs/v1.2.2-requirements.md` | 需求原文（已入仓） | 不改；作为验收依据引用 |

### 表 C：端到端验收面（33 出口全量 + 11 项需求映射）

| # | 面 | 清单 | 断言 |
|:-:|------|------|------|
| C1 | 既有 19 个成功出口（stage-96 后基线） | flow status/overview/current/metrics/phases/mode/**next**/ops list/archive/archive list/archive show/health + req list/show/split/board/next + instructions + setup --check | 字段零破坏、首键、类型、人类模式不变 |
| C2 | 11 项需求 → 出口映射视图（本版新增 14 个成功出口；其余为既有出口扩展 / 选项 / 失败出口） | 13 读命令面 `--json`；`req list` 扩展；`flow archive --dry-run --json`；`archive <stage> --json`；`--version --json`；错误 envelope；全局 `--project`；`flow status`/`flow phases` 扩展；P0-1 `flow next`（已含于 C1 基线） | 字段存在/类型/值/退出码；需求→出口映射逐项可追溯；DSH 真实消费或降级脚本 |
| C3 | 错误矩阵 | refusal / internal / 并发 / 非法参数 / 未初始化 × zh/en | `code`/`kind`/退出码 |
| C4 | 多项目 | 目录 A 启动 `--project B` | 目标项目解析 |
| C5 | 决策矩阵 | 15 phase | `flow next` 字段与 advance 接受集 |
| C6 | 零回归 | v1.2.1 既有命令 | 逐字 / 契约级回归 |

### 表 D：门禁基线

| 项 | 起点（stage-97 完成后复核） | 阶段末目标 |
|----|------|------|
| `npm test` | **74 文件 / 1894 用例**（HEAD `cdef4ae` 实测） | 全绿；新基线逐项登记 |
| `npx tsc --noEmit` | 0 | 0 |
| `lint i18n` | **983**（HEAD `cdef4ae` 实测） | 新基线（新增文档模板键 / 文案键逐键列名） |
| `lint kb` | **0 过期 / 614 引用**（REV-98-001 登记值；本会话复测 622） | 0 过期 |
| `npm run build` | ×2 幂等 | ×2 幂等；`git status --porcelain src/` ⊆ produces |
| `--version` | 1.2.1 | **1.2.2** |
| 契约测试 | #1~#33（33 个成功出口全量） | **#1~#33 全绿** |
| A 类残留 | 10 处 | **0**（白名单化） |
| 人类输出 | 基线快照 | 逐字不变 |

---

## 二、目标语义与不变量

| 维度 | 内容 |
|------|------|
| 版本事实源 | `package.json version = 1.2.2`（`--version` 直读）；`config.yaml meta.version = 1.2.2`；`--version --json.version = 1.2.2` |
| 文档覆盖面 | v1.2.2 全语义：`flow next` / 全局 `--project` / 13 读命令 `--json` / 错误封装 / `--version --json` / `flow archive` 判据明细 / `archive --json` / `reviewTier` 消歧；每条以 `--help` 实测为准 |
| 契约验收 | **33 个成功出口全量**（19 既有 + 14 本版新增）+ **11 项需求映射视图**；DSH 真实消费或降级脚本；契约 / 错误 / 决策 / 多项目 / 零回归五矩阵 |
| 回填 | roadmap v1.2.2 状态与里程碑；大计划最小追加（实况登记） |
| 承接 | upstream v1.2.1 pending REV / BUG 逐条去向三分 |

**不变量**：

1. **收口 op 为最终 op**：版本号 / CHANGELOG / 验收 / 门禁 / 回填同 op；其后零代码改动。
2. **A 类残留 = 0** 且白名单化；D 类 file:line 显式枚举；禁广谱 sed。
3. **B 类双生成物**同批 build；`--porcelain src/` ⊆ produces。
4. **文档与实现一致**：关键命令面以 `--help` 实测为准；关键句全仓 `rg` 兜底。
5. **零回归**：既有 19 个成功出口契约测试全绿；人类输出快照 diff 空；存量 `flow.json` 零注入。
6. **不引入代码改动**（除版本载体 / 文档模板 / 生成物）；缺口记录不扩面。
7. **DSH 验收隔离**：`OPENFEEL_LOG=0` + 隔离 fixture；不写真实用户目录；DSH 仓库只读。

---

## 三、变更点清单（编号 T）

### T1 — 文档多载体

- **README×3**：
  - `README.md:11` 横幅 → v1.2.2；`README.md:51` 起历史 v1.2.1 节保留；其后新增「v1.2.2 新增能力」节（`flow next` / 全局 `--project` / 13 读命令 `--json` / 错误封装 / `--version --json` / `archive --json` / `reviewTier` 消歧）。
  - `README.zh-CN.md` / `README.en.md`：新增 v1.2.2 节（与主 README 同构）；测试数行 → 本阶段门禁实测值（起点 74 / 1894）。
  - 纪律：zh/en 逐节同构；历史标记保留；命令表按 `--help` 实测。
- **`docs/GETTING_STARTED.md`**：快照行 → v1.2.2；新增「v1.2.2 能力速览」小节（`flow next` / `--project` / 错误 envelope / 读命令 JSON 最小示例）。
- **`docs/commands.md`**：快照行 → v1.2.2；补 `flow next` / 全局 `--project` / 13 读命令 `--json` / `--version --json` / `archive --json` / `flow archive --dry-run --json` 判据明细 / `flow phases` 消歧字段 / 错误封装格式。
- **`--review-tier` help 文案勘误（收口冻结裁定）**：`flow advance --help` 现文「缺省=按模式派生」与实现「缺省 full」不一致；本阶段**不改源码 help 字符串**（收口期冻结零代码改动），仅在 `docs/commands.md` / `.openfeel/manual/cli/commands.md` 登记实际语义「缺省 full」；源码文案订正显式转 **v1.2.3 首个规划阶段**（具体 stageId 由下一版规划确定）。
- **`docs/json-contract.md`**：定稿（**19 既有 + 14 本版新增 = 33 成功出口全表**；注册选项 34；legacy error 判别；迁移边界）。
- **manual**：`cli/commands.md`（新命令/选项）、`core/flow-manager.md`（flow next / 调度属性）、`core/req.md`（req list 扩展）；命名核对禁新建重复页；变更历史追加 v1.2.2-stage-98 行。
- **cli-usage skill**：`:3` description 追加 v1.2.2 摘要；`:15` 快照 → v1.2.2；`:38` 表行；`:50` 起新增「v1.2.2 新增能力」节（能力名 + 「v1.2.2 起提供」标注）；出口计数（**成功出口 33 / 注册选项 34**）/ 测试数（**74 / 1894**）全枚举订正。
- **纪律**：文档改动后同批 `npm run build`（cli-usage / agents-md / constraint 均在 templates-data）。

### T2 — CHANGELOG `[1.2.2]` + 版本 1.2.2 全链路 A/B/C/D/E

- **CHANGELOG**：追加 `## [1.2.2] - <日期>`（插于 `## [1.2.1]` 之前）：
  - **Added**：`flow next [--json]`（决策权威）；全局 `--project <path>`；13 个读命令面 `--json`；`--version --json`；`archive <stage> --json`；`flow status --json.stages[]` 调度属性；`flow phases --json` 消歧字段；`req list --json` 关联阶段/进度；`flow archive --dry-run --json` 判据明细。
  - **Changed**：JSON 输出契约冻结（`schemaVersion` 首键 / null 占位 / 键序稳定）；`instructions --json` 追加 `schemaVersion`。
  - **Fixed / Security**：无（本版为契约增量）。
  - **兼容说明**：既有 19 个成功出口字段零破坏；人类输出不变；存量 flow.json 零迁移。
  - **Documentation**：README×3 / GETTING_STARTED / commands / json-contract / manual / cli-usage。
- **A 类逐处**（6 载体 / 8 文件 / 10 处）：按表 A A1~A6；实施前内容特征扫描兜底（`rg "当前 v1\.2\.1"` / `rg '"version": "1\.2\.1"'` 逐命中判类）。
- **B 类**：`npm run build` 重生成双生成物；本阶段 templates-data 改动（README 不涉及 / cli-usage / agents-md / constraint）同批。
- **D 类白名单（file:line 显式枚举）**：依赖自身版本（package-lock）、`src/**` 历史批注、`test/**` 注释、`docs/phase-*/**`、文档侧「v1.2.1 起提供」历史标记；执行期扫描差额登记。
- **E 无载体**：按需判类。
- **验证**：`node bin/openfeel.js --version` = **1.2.2**；`--version --json.version` = 1.2.2；A 类残留 = 0；`src/` 剩余命中 ⊆ 白名单；build ×2 幂等。

### T3 — DSH 端到端契约验收

- **隔离脚本**（`OPENFEEL_LOG=0` + 隔离 fixture / 临时 HOME；报告落 `.openfeel/tmp/stage-98-e2e.md`）：
  1. **既有 19 个成功出口（stage-96 后基线，含 `flow next`）**：逐个执行 `--json`，断言单文档 / 首键 / 键集 / 类型；人类模式快照不变。
  2. **本版 14 个新增成功出口 + 11 项需求映射视图**：13 读命令面；`req list` 扩展；`flow archive --dry-run --json` 判据（合格 / 不合格 / 零写盘）；`archive <stage> --json`；`--version --json`；错误 envelope（refusal/internal/并发/zh-en）；全局 `--project` 多目录；P0-1 `flow next` 字段与 15 phase 矩阵已含于 C1 基线，映射视图逐项引用。
  3. **DSH 真实消费**：在 OpenFeel-DSH 仓库（只读）运行其适配器契约断言 / 启动自检，消费 **33 个成功出口全量 + 11 项需求映射视图**；断言不再依赖 `PHASE_AGENT_MAP` 镜像与中文文本正则；记录命令 + 版本 + 环境三要素。
  4. **零回归**：v1.2.1 既有命令逐字 / 契约级回归；本仓复核 **21 阶段**与 flow.json 零注入。
  5. **降级路径（REV-98-004）**：DSH 仓库不可只读检出时，改用本仓隔离 fixture 上的「适配器视角消费脚本」（按 DSH `lib/adapters/cli.js` 消费面逐出口断言 33 个成功出口 + 错误矩阵）；报告显式登记「DSH 真实消费未执行 + 原因 + 补验窗口（归档后 ≤ 1 个版本内）」；三要素记录义务不变；不作为本阶段唯一阻塞项。
- **报告**：契约矩阵 / 错误矩阵 / 决策矩阵 / 多项目 / 零回归五表；DSH 消费记录（或降级脚本记录 + 未执行登记 + 补验窗口）。
- **纪律**：验收须在收口 op 内（与 T2 同 op）；隔离环境防真实用户目录副作用。

### T4 — roadmap / plan 回填 + 承接 REV 处置表

- `.openfeel/roadmap/v1.2.2.md`：状态「规划中」→ **「已归档」**；里程碑 M49~M52 → done（补归档 commit）；进度表回填。
- `.openfeel/plan/v1/v1.2.2/plan.md`：**最小追加**（修订记录 + 实况登记；不重写正文）。
- **承接 REV 处置表**：上游 v1.2.1 官方空账 + 用户台账 pending（REV-92 / REV-94）+ stage-95~97 新增 REV 逐条三分（含 REV-95-005/008 实证闭环、REV-95-009 再转出、REV-96-008 本阶段订正、REV-97-006 台账保留、`--review-tier` 文案拆分处置）；判据 = 上游『转下阶段』条目零丢失。
- 纪律：回填属主会话 / 归档面协同项；flow.json / phase 推进仍归 Feel（CLI）。

### T5 — 门禁 + 收口

- **门禁全量（收口 op；顺序固定）**：`npm run build` ×2（幂等）→ `npm test`（0 skipped / 0 failed；新基线逐项登记；**契约测试 #1~#33 全绿**）→ `npx tsc --noEmit` = 0 → `lint i18n`（新基线逐键列名）→ `lint kb` = 0 → `--version` = 1.2.2 → A 类残留复核（白名单化）→ 人类输出快照 diff 空。
- **收口动作**：`ops/**` 精确 `git add`（禁 `-A`）；终局报告（契约矩阵 / 错误矩阵 / 决策矩阵 / 多项目 / 零回归 / 版本收口清单 / 承接三分）落 `.openfeel/tmp/`；归档轮落点登记（kb 补沉 + manual 面 + cli-usage 快照去向 + `flow archive v1.2.2` 前置：本阶段 done 后由 Feel/主会话执行）。
- **流程面移交**：`status.md` 经 `openfeel stage` CLI；权限不足移交主会话登记不阻塞。

---

## 四、开放问题（方案期 / 执行期定稿）

- **Q1**：DSH 验收执行方式——DSH 仓库是否可在本机只读检出；契约断言脚本落点（本仓 `.openfeel/tmp/` vs DSH 仓库）；是否需要 DSH 侧最小改动（仅验收脚本）。**降级判据（REV-98-004，已定稿）**：① DSH 不可得时，以本仓隔离 fixture 上的「适配器视角消费脚本」按 DSH `lib/adapters/cli.js` 消费面逐出口断言 33 个成功出口 + 错误矩阵；② 报告显式登记「DSH 真实消费未执行 + 原因 + 补验窗口（归档后 ≤ 1 个版本内）」；③ 三要素记录义务不变；④ 不将真实消费作为唯一阻塞项（与 T3.5 同源）。
- **Q2**：`flow archive v1.2.1` 是否在本版收口前由 Feel 执行（当前 `archived_versions` 止于 v1.1.7）；本版不将其作为前置。
- **Q3**：README×3 的 v1.2.2 节篇幅与结构（与 v1.2.1 节同构；是否需要单独小节列 13 读命令）。
- **Q4**：测试数 / 出口计数 / 键数的全枚举订正清单（`1894` / `74` / `19` / `983` 等同族串逐处判类；本版新增计数 `14` / `33` / `34` 同批核对）。
- **Q5**：承接 REV 中用户台账 pending 条目的最终去向（本阶段处置 / 转后续 / 台账保留）；判据源以归档时实测为准。REV-95-005/008 已实证闭环、REV-95-009/REV-96-008/REV-97-006 与 `--review-tier` 文案裁定见 §七。

## 五、验收要点（阶段级）

1. **文档**：README×3 / GETTING_STARTED / commands / json-contract / manual / cli-usage 全载体同步；命令面与 `--help` 实测一致；zh/en 同构；「v1.2.2 起提供」标注在位。
2. **版本**：A 类 10 处逐处改毕 + 残留 0（白名单化）；B 双生成物 build 重生成 + ×2 幂等；C 传播全载体；D 白名单 file:line 显式枚举；`--version` = **1.2.2**；`--version --json.version` = 1.2.2。
3. **端到端**：**33 个成功出口全量**（19 既有 + 14 本版新增）契约断言全绿 + **11 项需求映射视图**逐项可追溯；错误 / 决策 / 多项目 / 零回归矩阵通过；DSH 真实消费记录在位，或按 T3.5 降级路径登记（未执行原因 + 补验窗口）。
4. **零回归**：既有 19 个成功出口字段零破坏；人类输出快照 diff 空；存量 `flow.json` 零注入；phase 枚举 / `advanceAccepted` 不变。
5. **回填**：roadmap 状态 / M49~M52；大计划最小追加。
6. **承接**：三分结论零灭失；新增 REV 逐条去向。
7. **门禁**：表 D 阶段末目标逐项达成；收口 op = 最终 op；`ops/**` 精确入管。
8. **流程**：所有阶段关联 REQ-001；终局报告五表 + 版本清单 + 承接表落盘；`flow archive v1.2.2` 前置条件登记（执行归 Feel）。
9. **计数口径**：成功出口 **33** / 注册选项 **34**；`docs/json-contract.md` §7、`json-contract.test.ts` #1~#33 与验收矩阵逐项对齐。

## 六、风险

| # | 风险 | 影响 | 缓解 |
|:-:|------|------|------|
| R-98-1 | **版本收口误改**（广谱 sed 伤及 D 类 / package-lock 被 npm install 重写 / config.yaml 整文件重写） | 高 | 内容特征扫描兜底 + file:line 白名单 + 单行 edit + 禁 `npm install` |
| R-98-2 | **文档-实现发散**（新命令面 / 字段名与实现不一致） | 高 | 文档以 `--help` / 实测 JSON 为准；关键句 `rg` 兜底；DSH 验收交叉 |
| R-98-3 | **B 类漏 build**（templates-data 改动未重生成） | 中 | 同批 `npm run build` + `--porcelain` ⊆ produces + ×2 幂等 |
| R-98-4 | **陈旧计数再遗漏**（74/1894/19/983 等同族串及 14/33/34 新增计数） | 中 | 全枚举双路扫描 + 逐处判类（零未判类） |
| R-98-5 | **DSH 验收环境副作用**（写真实用户目录 / 污染 DSH 仓库） | 中 | `OPENFEEL_LOG=0` + 隔离 fixture + DSH 只读；报告落本仓 tmp |
| R-98-6 | **契约验收覆盖不足**（只测新出口，漏既有 19） | 高 | 五矩阵逐项枚举；既有 19 个成功出口契约测试全绿作为门禁 |
| R-98-7 | **收口期越界**（发现缺口擅自扩面） | 中 | 冻结边界 + 缺口记录评估；审查核对 diff 面 |
| R-98-8 | **i18n 死键 / 漏键**（文档模板键 / 新文案） | 中 | zh/en 双份同批 + 消费点接入 + lint 逐键列名 |
| R-98-9 | **flow archive v1.2.1 前置未满足** | 低 | 不作为 v1.2.2 前置；登记由 Feel 决策 |
| R-98-10 | **DSH 环境不可得导致收官阻塞** | 中 | T3.5 降级路径（适配器视角消费脚本 + 阻断登记 + 补验窗口）；真实消费非唯一阻塞项 |
| R-98-11 | **`--review-tier` help 文案与收口冻结冲突** | 低 | 本阶段仅文档载体登记实际语义「缺省 full」；源码 help 订正转 v1.2.3 首个规划阶段，禁改源码（T1 边界） |

**回滚**：文档 / CHANGELOG / 版本载体均为文本，可 revert；B 类回滚 = 源文件 revert + build；无数据格式破坏。

## 七、承接 REV 与处置表（REV-85-002 固化口径）

- **判据源**：`.openfeel/flow.json`（`reviews: 0` 官方空账）+ `.openfeel/users/Liuary/code_review/{REV-92,REV-94,REV-95,REV-96,REV-97,REV-98}.md` + stage-95~97 各阶段承接表 + 本阶段实测。
- **上游 v1.2.1 收口**：三 BUG（BUG-002 / 011 / 007）已处置；E-89-6 已订正；其余 pending 按三分。

| 上游条目 | 优先级 | 去向 | 依据 |
|---------|:--:|------|------|
| REV-94-005（status.md 旧文案） | low | **本阶段核对 / 转主会话**（status.md 由 CLI 维护，不在文档轮改） | 流程态遗留 |
| REV-94-006（plan 未入管） | low | **本阶段核对**（v1.2.2 阶段计划均随归档入管） | 审计链 |
| REV-94-007（旧部署实例模板默认值） | low | **台账保留**（部署侧语义，本版不涉） | stage-94 留痕 |
| REV-92-005（门禁未独立复跑） | medium | **本阶段闭合**（收口门禁独立复跑 + 证据登记） | 本阶段 T5 |
| REV-92-006（BFS 报错语义） | low | **台账保留**（非本版范围） | stage-93 已评估 |
| REV-86-009 / 010 / REV-90-011 / 89-008 / 91-010 | low / medium | **台账保留 / 转主会话**（承 stage-93 三分） | 非本版范围 |
| **REV-95-005**（roadmap:31 旧口径） | low | **已闭环（实证登记）** | `roadmap/v1.2.2.md` P1-2 行已改为「保留本地 `--project` 声明…（C2 扩展路径优先；REV-95-005 口径）」 |
| **REV-95-008**（锁等待超时归类契约边界） | low | **已闭环（实证登记）** | `docs/json-contract.md` §14.1 + `test/cli/error-envelope.test.ts` ⑩a/⑩b（锁超时 → `INTERNAL_ERROR/internal/3`） |
| **REV-95-009**（并发 envelope `process.exit(2)` 退出机制） | low | **评估记录 + 再转出 → v1.2.3** | 收口期冻结零代码改动；保持 `handleConcurrentConflict` 现状（`never` 语义 / 0/1/2 零改动）；机制改造阶段由下一版规划确定 |
| **REV-96-008**（ops 残留旧阶段数陈旧计数） | low | **本阶段处置**（随 `ops/**` 归档订正为 **21 阶段**） | 计划已有 `ops/**` 入管项；归档时同批订正 |
| **REV-97-006**（`req show` / `req split` 既有内联过滤） | low | **台账保留**（收口期禁改；后续版本） | stage-97 承接表；非本阶段文档/版本面 |
| **stage-96 遗留**（`flow advance --help --review-tier` 文案陈旧） | low | **拆分处置**：文档面本阶段登记勘误；源码 help 订正 **转 v1.2.3 首个规划阶段** | 收口期冻结零代码改动：`docs/commands.md` / manual 注明实际语义「缺省 full」；不改 `flow.ts` help 字符串 |
| 其余已闭合条目 | — | **零动作**（登记） | 台账实测 |

- **三分结论**：**本阶段处置/闭合 5（REV-92-005、REV-94-006、REV-95-005、REV-95-008、REV-96-008）／显式转出 3（REV-94-005 → 主会话；REV-95-009 → v1.2.3；`--review-tier` 源码 help 订正 → v1.2.3）／台账保留 4（REV-92-006、REV-94-007、REV-97-006、REV-86 家族合并计，其中部分转主会话）＋拆分处置 1（`--review-tier` 文档载体登记在本阶段）→ 零灭失成立**（以归档时实测清单为准）。

## 八、op 拆分建议（供 openfeel-schemer 定稿；`est_ops = 3`）

| op | 内容 | 主要文件 | 依赖 |
|:--:|------|------|------|
| `op-001` | **T1 文档多载体**（README×3 / GETTING_STARTED / commands / json-contract 定稿 / manual / cli-usage 快照）+ 同批 build | 文档载体 + `templates-data/skills/openfeel-cli-usage/SKILL.md` + 双生成物 | hard: stage-97 |
| `op-002` | **T3 DSH 端到端验收**（五矩阵 + 真实消费 + 报告） | `.openfeel/tmp/stage-98-*.md` + 隔离脚本（tmp） | hard: op-001（文档定稿后；也可与 op-001 并行，若文件不冲突——但收口恒串行） |
| `op-003` | **T2 版本收口 + T4 回填 + T5 门禁（阶段最终 op）**：CHANGELOG / A 类 10 处 / B 类 build / C 核对 / D 白名单 / roadmap+plan 回填 / 门禁 / `--version` 1.2.2 / 终局报告 / 承接三分 / `ops/**` 入管 | `CHANGELOG.md`、版本载体、templates-data 版本行、roadmap/plan、`.openfeel/plan/v1/stage-98/ops/**` | hard: op-001 / op-002 |

- **文件冲突（mutual_exclusion）**：op-001 与 op-003 均触碰 templates-data / 双生成物 → 串行；op-003 为收口（恒末位）。
- **降级方案（2 op）**：验收并入收口 op（stage-85 先例）→ op 数 = 2；取舍须在方案期显式登记。
- **op 级依赖与文件清单由 openfeel-schemer 落 `ops/deps.yaml`**。

## 九、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-17 | openfeel-planner | 初稿：依据大计划 §六/§八/§十一/附录 A「stage-98」+ DSH 需求 + 源码实测（4 表 30+ 项）；变更点 T1~T5；开放问题 Q1~Q5；风险 R-98-1~9；承接三分；op 拆分 3 项（含 2 op 降级）。**只写本计划文档**（未改源码 / 未直写 flow.json / 未推进 phase）。 |
| 2026-10-17 | openfeel-planner | **修订 1（REV-98-001~004 收尾）**：① 基线同步 HEAD `cdef4ae`、74 文件 / 1894 用例、`lint i18n` 983、`lint kb` 0 过期 / 614 引用、flow.json `meta.revision 1261` / 21 stages。② 计数口径：成功出口基线统一为 **19**（表 C1 补 `flow next`）；阶段数统一为 **21**；验收改为 **33 个成功出口全量 + 11 项需求映射视图**，表 D 增「契约测试 #1~#33 全绿」。③ §七补 REV-95-005/REV-95-008 实证闭环、REV-95-009 → v1.2.3、REV-96-008 本阶段订正、REV-97-006 台账保留、`--review-tier` 文案拆分处置（文档本阶段 / 源码 → v1.2.3），三分结论更新。④ Q1/T3.5 增 DSH 降级判据（适配器视角消费脚本 + 阻断登记 + 补验窗口）；新增 R-98-10/11。**只改本计划文档**。 |
