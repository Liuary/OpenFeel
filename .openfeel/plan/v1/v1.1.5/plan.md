# OpenFeel v1.1.5 — 消除「升级 CLI 后静默加载旧全局部署」缺口

> **版本**：v1.1.5（W 级递增，功能版） | **创建日期**：2026-10-03 | **Planner**：openfeel-planner
> **规模判定**：**大规模**（2 阶段，跨 `core/update-state` / `core/setup` / `core/update` / `cli/index` / `cli/repl` / `commands/setup` 多模块，含命令面增量与版本收口）→ 走独立 openfeel-planner → openfeel-reviewer 完整流程。
> **定位**：补齐「`npm i -g openfeel@X` 后全局资产不自动刷新，且框架不检测不提示」的缺口。**不引入新架构层、不新增第三方依赖、不改既有 `--json` 契约**。
> **阶段计划**：`.openfeel/plan/v1/stage-66/plan.md`、`.openfeel/plan/v1/stage-67/plan.md`。
> **系列**：`v1`；阶段 ID 自 `v1.1.5-stage-66` 起（承接 v1.1.4 的 stage-65）。

---

## 一、背景与需求来源

- **需求主题（用户已确认）**：用户 `npm i -g openfeel@X` 后，全局资产（`~/.config/opencode/AGENTS.md`、agents、skills、`~/.config/opencode/opencode.jsonc`）**不会自动刷新**，须重跑 `openfeel setup` 并重启 harness 才生效；框架当前**完全不检测、不提示**，普通用户会一直加载旧全局资产（旧约束、旧 agent、旧 skill）。
- **用户确认**：本版本为**用户指定的新版本 v1.1.5**，目标即上述缺口的端到端消除。
- **知识库检索（`openfeel-check-kb`）**：已加载。相关条目：
  - `kb/architecture.md #全局部署架构：框架资产全局化 + 项目精简 + 双 state`（全局 state 于 `~/.openfeel/update_state.json`，绝对路径作 key；**检测须针对全局**）。
  - `kb/patterns.md #纯全局部署命令模式`（`setup` 纯全局、幂等可重跑）。
  - `kb/patterns.md #init/update 重启提醒对称输出模式`（`isTTY` 守卫、非交互静默 → 本版本提示沿用该口径）。
  - `kb/troubleshooting.md #随包 postinstall 在用户端路径层级失效`（**禁止**再走 `postinstall` 自动刷新路线）。
  - `kb/patterns.md #--dry-run 全链路零写盘`（`setup --check` 为只读，零写盘）。
  - **无**「全局部署版本一致性检测」条目 → 归档时补沉 patterns。

## 二、阶段概览

| 阶段 | 名称 | 覆盖裁定 | 依赖 | op 数（预估） |
|------|------|----------|------|:--:|
| `v1.1.5-stage-66` | 全局部署版本事实源与检测核心 | D-A / D-D | 无 | 3 |
| `v1.1.5-stage-67` | CLI 提示接入、`setup --check` 与版本收口 | D-B / D-C / D-E / D-F / D-G | **hard: stage-66** | 3 |

**执行顺序：66 → 67**（流水线串行；67 对 66 hard 依赖）。

## 三、源码核验结论（探索推断 vs 源码实际，以源码为准）

> 依据用户要求，逐项对照 `src/**`、`bin/**`、`package.json`、`test/**` 复核。**「不一致」处以源码为唯一事实基准**。

| # | 探索推断 | 源码实际（位置） | 判定 |
|:--:|----------|------------------|:--:|
| **1** | `openfeel_version` **只写不读**，写入点含 `update-state.ts:73-78/:172/:199`、`setup.ts:106`、`update.ts:1724`、`migrate.ts:278,309,508` | `getOpenfeelVersion()` 读工具自身 `package.json`（`update-state.ts:73-78`）✓；但 **`openfeel_version` 字段仅在 `createGlobalUpdateState`（`:172`）/`createUpdateState`（`:199`）赋值**（首次创建），以及 `migrate.ts:278/309/508`（备份 manifest / 全局 state 首次回退字面量）。`setup.ts:106` 与 `update.ts:1776-1777` **只写 `last_update`，不写 `openfeel_version`**；`update.ts:1724` 的 `getOpenfeelVersion()` 用于冲突文件头部渲染，非 state 写入 | **部分不一致**：字段实为**首次创建时写一次**，之后 `setup`/`update` 均**不刷新** → 直接复用会产生「永久假漂移」 |
| **2** | 全仓 `src/` 无读取/比较 `openfeel_version` | 全仓 `rg "openfeel_version"` 命中仅：Schema 定义、`create*` 赋值、`migrate` manifest/字面量、测试 fixture。**无任何比较/读取消费** | **一致** |
| **3** | 无 `doctor`/`checkUpdate`/`latestVersion` | `rg` 确认 `src/`、`bin/` 无这三者；亦无任何 registry 联网查询 | **一致** |
| **4** | 无 `postinstall` | `package.json:13-18` scripts 仅 `build`/`test`/`test:coverage`/`dev`；`test/core/release-metadata.test.ts:16,23` 断言 `scripts.postinstall` 为 `undefined` 且 `scripts/patch-inquirer.js` 已删除 | **一致**（**禁止**复活 postinstall 路线） |
| **5** | 被动重启提示仅两处 | `setup` 无条件提示（`commands/setup.ts:24`，未加 isTTY 守卫）；`update` 条件式（全局 agent 确有更新 + `process.stdout.isTTY`，`core/update.ts:1713-1720`） | **一致**（两处均只在「用户已主动执行部署命令」后提示，**不覆盖 npm 升级后的静默期**） |
| **6** | `flow health` 只查项目流水线，与全局部署无关 | `commands/flow.ts` / `core/flow-manager.ts` 的 health 仅比对 `flow.json` 与各阶段 `status.md` | **一致** |
| **7** | `update_infos.md` 仅被 feel agent 启动提示词消费 | `core/update-infos.ts`（`appendUpdateInfo:175`）写；消费点 `core/template-loader.ts:1722-1736`（feel.md zh 生成段） | **一致** |
| **8** | 职责边界：`setup`=首次全量、`update`=增量，但两者都含全局部署段 | `manual/core/setup.md:40` 如此描述；`core/setup.ts:29-109` 与 `core/update.ts:1638-1710` 均部署全局 AGENTS.md/agents/skills/jsonc | **一致** |
| **9**（补充核验） | — | **无任何 commander `preAction`/`postAction` 钩子**（`rg` 空）；`bin/openfeel.js` 为单一进程入口（`--version`/无参 REPL/有参 CLI）；`runCli()`（`cli/index.ts:191`）是 CLI parse 唯一包装；`startRepl()`（`cli/repl.ts:30`）为无参 REPL 入口 | **新增接入点**：检测须接在 `runCli()`/`startRepl()`，**不可**在 `cli/index.ts` 顶层注册钩子（否则所有 `test/**` 的 `program.parseAsync` 都会被触发，造成测试面污染） |
| **10**（补充核验） | — | 全局 state 路径 `getGlobalUpdateStatePath()` = `~/.openfeel/update_state.json`（`global-paths.ts:49-51`）；项目 state 为 `.openfeel/update_state.json`（`update-state.ts:40`）。`loadGlobalUpdateState()` 对「文件缺失」与「Schema 校验失败」**均返回 `null`**（`update-state.ts:129-148`），需在检测层用 `existsSync` 区分 | **双份已确认**：检测**只针对全局**；缺失 vs 损坏须区分 |

### 决定性结论（D-A 的前提）

`~/.openfeel/update_state.json.openfeel_version` **不可原样复用**：它只在首次创建 state 时写入，`setup`/`update` 后续执行**从不刷新**。若直接拿它比较，已安装用户每次 upgrade 后（甚至重跑 `setup` 后）都会永久误报漂移。因此 **D-A 必须配合「写入侧刷新」**——这也是本版本事实源可靠性的根因修复。

## 四、范围

- **核心**：`src/core/update-state.ts`（若需辅助读取/存在性判定）、`src/core/setup.ts`（写入侧刷新）、`src/core/update.ts`（写入侧刷新）、**新增** `src/core/deployment-check.ts`、`src/cli/index.ts`（`runCli` 接入）、`src/cli/repl.ts`（`startRepl` 接入）、`src/commands/setup.ts`（`--check [--json]`）。
- **测试**：`test/core/*`、`test/cli/*`、`test/commands/*` 新增/修改。
- **文案**：`src/core/i18n-data/{zh-CN,en}.ts`（新增键须显式登记新基线）。
- **模板/skill**：`src/core/templates-data/opencode/skills/openfeel-cli-usage/SKILL.md`（权威源）+ `npm run build` 传播。
- **文档**：`README.{zh-CN,en}.md`、`docs/GETTING_STARTED.md`、`docs/commands.md`、`.openfeel/manual/core/setup.md`。
- **版本**：`package.json`、`package-lock.json`、`.openfeel/config.yaml`、`src/core/config.ts`（zh/en 模板）、`templates-data/agents-md/{zh-CN,en}.md`、`CHANGELOG.md`；`.openfeel/plan/v1/v1.1.5/plan.md`、`.openfeel/roadmap/v1.1.5.md`、`plan/index.md`、`plan_log.md`。

## 五、版本收口清单（1.1.4 → 1.1.5，A/B/C/D/E，归 stage-67 op-final）

> 依据 `kb/patterns.md #版本号全链路收口清单模式`；以内容特征判定，不以行号为准。

- **A 手工载体**：`package.json:3`、`package-lock.json:3`/`:9`（root 两处，禁 `npm install` 重生成）、`.openfeel/config.yaml:7`（单行增量，禁整文件重写）、`src/core/config.ts`（zh/en `CONFIG_TEMPLATE_*` 各一处）、`src/core/templates-data/agents-md/{zh-CN,en}.md`（「当前 v1.1.x」行）。
- **B 生成段**：`src/core/template-loader.ts`（由 build 从 A 类权威源重生成，**禁手改**）。
- **C 传播**：`CHANGELOG.md` 追加 `## [1.1.5]`。
- **D 禁改**：`src/**` 历史批注（`v1.1.x-stage-*` 示例）、依赖自身版本、`manual` 变更历史、`test/**` 注释。
- **E 无载体**：`README*` / `docs/**`（`docs/commands.md:3` 快照标注同步为 `v1.1.5`）。
- **CLI `VERSION` 常量不存在**：`--version` 直读 `package.json`；`release-metadata.test.ts` 已断言无 `VERSION` 导出。

## 六、边界（不做）

1. 不新增第三方依赖；**不复活 `postinstall`**（KB 已记其用户端静默失效）；不改 `bin/openfeel.js` 安装链路；不改既有命令的 `--json` 契约（新增 `setup --check --json` 须含 `schemaVersion`）。
2. 不破坏既有命令行为：`setup`/`update`/`init`/`migrate` 的输出与退出码不变；被动提示**只写 stderr、不写盘、不改退出码**。
3. 不 `npm publish`、不 `git push`；**不直写 `flow.json`**（阶段注册/推进由 Feel 经 CLI 完成）。
4. 不做联网版本查询（无 registry 调用，避免引入网络依赖与隐私面）。
5. 不做逐文件哈希漂移的高成本检测（见 D-D 裁定）。
6. 不改 CI workflow；不改 `.opencode/**`（构建产物）。

## 七、全局验收标准（版本级）

1. **门禁**：`npm test` 全绿（基线 **61 文件 / 1087 用例 / 0 skipped** → 因新增用例而增加，`0 failed`）；`npx tsc --noEmit` = **0**；`node bin/openfeel.js lint i18n` = **753 + 新增键**（实产 **+8 → 761**，**已显式登记新基线**）；`node bin/openfeel.js lint kb` = **0 过期**；`npm run build` 成功且幂等、`.opencode/**` 不复活。
2. **写入侧刷新（决定性）**：已有全局 state（含旧 `openfeel_version`）下执行 `setupGlobalFramework()` 或 `updateProject()` 后，`~/.openfeel/update_state.json.openfeel_version` **== 当前 CLI 版本**。
3. **检测正确性**：`checkGlobalDeployment()` 在「部署版本 == CLI 版本」→ `ok`；「!=」→ `mismatch`；「全局 state 缺失」→ `missing`；「state 存在但 Schema 非法」→ `unknown`。
4. **被动提示出现**：版本不一致时，TTY + 非 `--json`/`--quiet` 下，任意普通命令（如 `flow status`）向 **stderr** 输出提示且包含 `openfeel setup`；进程退出码不被改变。
5. **静默矩阵**：版本一致 / 非 TTY / `--json` / `--quiet` / `--version` / `--help` / CI / `OPENFEEL_NO_UPDATE_CHECK=1` / 部署修复类命令（`setup`/`update`/`init`/`migrate`）——**均静默**（stdout 与 stderr 均无该提示）。
6. **每进程一次**：一个 REPL 会话内多次执行命令，提示**只出现一次**。
7. **主动命令**：`setup --check` 在一致时输出已部署/CLI 版本并退出 **0**；不一致/缺失时退出 **1**；`--json` 输出稳定单文档（含 `schemaVersion`）且 stdout 为纯 JSON。
8. **向后兼容**：`setup`/`update` 既有无参行为与输出不回归；既有命令 `--json` 输出逐字节/结构不变；不新增依赖（`package.json.dependencies` 不变）。
9. **版本**：`node bin/openfeel.js --version` == `package.json.version` == **1.1.5**；`CHANGELOG` 含 `[1.1.5]`；全链路 A 类载体 `1.1.4` 残留 **0**。

## 八、风险总览

| # | 风险 | 影响 | 缓解 |
|:-:|------|------|------|
| R-1 | 复用 `openfeel_version` 但遗漏写入侧刷新 → 永久假漂移 | **高** | D-A 定案「刷新 + 读取」成对；§三核验已锁定；stage-66 专测（验收 2） |
| R-2 | 在每个命令运行检测污染测试（读真实 homedir / stderr 噪音） | 中 | 接入点置于 `runCli()`/`startRepl()`（**非** `cli/index.ts` 顶层钩子）；检测只读全局 state；门控含非 TTY/CI 静默；单测注入 mock homedir |
| R-3 | 提示污染 `--json` stdout 契约 | 高 | 提示走 **stderr**；`--json` 直接静默；专测断言 stdout 纯 JSON |
| R-4 | 检测阈值误报（Schema 演进/损坏 state） | 中 | 缺失 vs 损坏分离（`unknown` 静默，不提示）；仅 `mismatch`/`missing` 触发 |
| R-5 | 新增键推高 i18n 基线未登记 | 低 | 显式登记新基线（**761**）于大计划 §七与 stage-67 §五 |
| R-6 | 全局 state 为跨项目共享文件，读取须容错（权限/占用） | 低 | 读取全程 `try/catch`，异常 → `unknown` 静默；不写不锁 |

**回滚**：按阶段 `git revert <sha>`；无数据迁移、无依赖树变动、无 schema 变更；版本回退仅需改回版本载体。

## 九、裁定项（需用户/Feel 明确）

| # | 议题 | **建议结论** | 备选 | 归属 |
|:-:|------|--------------|------|:--:|
| **D-A** | 版本事实源 | **复用 `~/.openfeel/update_state.json.openfeel_version` + 补写入侧刷新**（每次 `setup`/`update` 全局部署后置为当前 CLI 版本）。零 schema 变更、零新文件、语义即「已部署版本」 | ① 专用部署清单（版本+文件哈希）——更全但与既有 `files` 哈希重复、面更大；② 仅 mtime——不可靠（tar/npm mtime、时钟）；③ 原样复用——**不可行**（永久假漂移） | stage-66 |
| **D-B** | 检测时机/范围 | **任意命令运行**（接在 `runCli()`；REPL 在 `startRepl()` 起一次），但强门控：仅 TTY、非 `--json`/`--quiet`/`--version`/`--help`、非 CI、`OPENFEEL_NO_UPDATE_CHECK` 未设、`setup`/`update`/`init`/`migrate` 跳过；**每进程仅一次** | ① 仅特定命令（覆盖面小）；② 每次会话一次（REPL 语义） | stage-67 |
| **D-C** | 提示通道与文案 | **stderr**（保护 `--json`/stdout 契约）；zh/en i18n；文案含「已部署 X / CLI Y」+ 指向 `openfeel setup` + 重启 harness | 复用 `setup.complete` 文案（语义不符） | stage-67 |
| **D-D** | 检测粒度 | **版本号不一致 + 全局部署缺失**为触发；**不做**逐文件哈希被动检测（成本高、与已存在的 conflicts 机制重复、噪音大）。哈希漂移留待未来显式 `--check --deep` | 逐文件哈希（高成本/噪音）；仅版本（漏缺失与部分文件陈旧） | stage-66 |
| **D-E** | 是否新增显式命令 | **不新增顶层命令**；以 `openfeel setup --check [--json]` 提供主动诊断（最小命令面），与被动提示并存 | ① 新增 `openfeel doctor`（命令面膨胀）；② 仅被动提示（不可自动化） | stage-67 |
| **D-F** | 边界情形 | ① 全局部署缺失 → 提示 setup；② `npm i -g` 后未 setup → 版本不一致 → 提示；③ `openfeel update` 视为**刷新全局资产并刷新事实源**（已含全局段），归入跳过提示的部署类；④ state 损坏 → `unknown` **静默**；⑤ 降级（部署版本 > CLI）亦按 `!=` 提示 | 仅处理「不一致」（漏缺失）；对损坏也提示（噪音） | stage-66/67 |
| **D-G** | 文档 | README zh/en + `docs/GETTING_STARTED.md` + `docs/commands.md` + `manual/core/setup.md` + `openfeel-cli-usage` skill 统一「升级流程：`npm i -g` → `openfeel setup` → 重启 harness」 | 仅 skill | stage-67 |

## 十、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-03 | openfeel-planner | 初稿：2 阶段（66~67）；源码核验表 10 项（**关键不一致**：`openfeel_version` 仅首次写入、`setup.ts:106`/`update.ts:1724` 写入点推断不实）；裁定 D-A~D-G；全局验收 9 条；版本收口清单；基线门禁实测（`lint i18n` 753 / `lint kb` 0-327 引用 / `--version` 1.1.4）；**未注册阶段 / 未直写 flow.json**（由 Feel 经 CLI 执行） |