# v1.1.5-stage-67 计划 — CLI 提示接入、`setup --check` 与版本收口

- **阶段**：`v1.1.5-stage-67`
- **依赖**：**hard: `v1.1.5-stage-66`**（复用 `checkGlobalDeployment()` 四态结果与 `shouldRunDeployCheck()` 门控策略；stage-66 保证事实源可信）
- **优先级**：P0（本版本收官阶段）
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-03
- **定位**：把 stage-66 的检测核心接入 CLI 运行时（被动提示）+ 提供主动诊断命令 `setup --check [--json]` + 升级流程文档化 + 完成 **v1.1.5 版本收口**。
- **范围**：`src/cli/index.ts`（`runCli`）、`src/cli/repl.ts`（`startRepl`）、**新增** `src/cli/deploy-check-output.ts`（薄适配器）、`src/commands/setup.ts`（`--check`/`--json`）、`src/core/i18n-data/{zh-CN,en}.ts`、docs/README/manual/skill 权威源、版本载体、测试。
- **边界**：被动提示**只写 stderr、不写盘、不改退出码**；`setup --check` 只读；不破坏 `setup` 既有无参行为；不改既有 `--json` 契约；不新增依赖；不 `npm publish`/`git push`；不改 `flow.json`。

## KB 检索（`openfeel-check-kb`）

- 已加载 `openfeel-check-kb`。**高度相关条目**：
  - `kb/patterns.md #init/update 重启提醒对称输出模式`（`isTTY` 守卫、非交互静默）→ 被动提示沿用，且**补 `--json`/`--quiet`/CI 静默**。
  - `kb/patterns.md #纯全局部署命令模式`（`setup` 幂等、职责）→ `setup --check` 为只读诊断，不破坏部署语义。
  - `kb/patterns.md #CLI 自描述命令模式` / `#--dry-run 全链路零写盘` → `setup --check` 只读、`--json` 稳定结构与 `schemaVersion` 风格。
  - `kb/patterns.md #版本号全链路收口清单模式（A/B/C/D/E）` → 版本 `1.1.5` 逐类核对。
  - `kb/patterns.md #部署语境 vs 本仓语境命令口径二分` → 文档中 `openfeel setup`（部署语境）与 `node bin/openfeel.js`（本仓语境）措辞区分。
- **无**「被动版本漂移提示」条目 → 归档时补沉 patterns。

---

## 一、背景与实测证据（唯一事实基准）

| 事实 | 源码位置 | 结论 |
|------|----------|------|
| CLI 单一进程入口（`--version`/无参 REPL/有参 CLI） | `bin/openfeel.js:14-18` | 接入点应位于 `runCli`/`startRepl`，非 `bin` |
| `runCli()` 为 CLI parse 唯一包装 | `cli/index.ts:191-201` | 被动检测接入此处 |
| `startRepl()` 为无参 REPL 入口 | `cli/repl.ts:30` | REPL 起一次检测 |
| **无 commander 钩子** | `rg` 空 | 若在 `cli/index.ts` 顶层注册钩子，会波及全部 `test/**` 的 `program.parseAsync` → **不采用** |
| 既有 isTTY 静默先例 | `core/update.ts:1713`、`commands/flow.ts:513`、`core/backup.ts:132`、`core/init.ts:35` | 门控口径可对齐 |
| `flow status --json` 等 `--json` 契约含 `schemaVersion` | `commands/*` | 新 `--json` 须对齐 `schemaVersion` |
| i18n 域键：`setup.*`、`help.setup.lang`、`update.*` | `i18n-data/zh-CN.ts:596,913-918` | 新增键在两表成对；`lint i18n` 计数 |
| `setup` 命令当前无选项解析分支 | `commands/setup.ts:10-25` | 新增 `--check`/`--json` 分支为**前置只读短路**，不进入部署 |

---

## 二、目标语义

| 维度 | 改前 | 改后 |
|------|------|------|
| 被动检测 | 无 | 任意命令（`runCli`）/REPL（`startRepl`）运行时检测；TTY + 非 json/quiet + 非 CI → stderr 提示；**每进程一次** |
| 主动诊断 | 无 | `openfeel setup --check [--json]`（只读；一致 exit 0，否则 exit 1） |
| 提示内容 | — | 「全局部署版本 X ≠ CLI 版本 Y，请运行 `openfeel setup` 并重启 harness」/「全局部署缺失，请运行 `openfeel setup`」 |
| 版本 | 1.1.4 | **1.1.5**（全链路收口） |

**不变量**：`setup` 无参行为/输出/退出码不变；既有命令 `--json` 输出不变；被动提示不改退出码、不写盘。

---

## 三、变更点清单（编号 T）

### T1 — CLI 被动提示接入（D-B / D-C）

- **新增** `src/cli/deploy-check-output.ts`：
  ```ts
  /** 被动部署检测的运行期适配器：读进程上下文 → 门控 → 渲染 stderr 提示 */
  export function emitGlobalDeployCheck(options?: {
    argv?: string[]; isTTY?: boolean; env?: NodeJS.ProcessEnv; warned?: { value: boolean };
  }): void;
  ```
  - 组装 `DeployCheckGateInput`（默认取 `process.argv.slice(2)` / `process.stdout.isTTY` / `process.env` / 模块级 `warned`）；
  - `shouldRunDeployCheck()` 为假 → 直接返回（静默）；
  - 为真 → `checkGlobalDeployment()`：
    - `mismatch` → `process.stderr.write(t('update.globalStaleWarnTmpl', lang, { deployed, cli }))`；
    - `missing` → `t('update.globalMissingWarnTmpl', lang)`；
    - `ok`/`unknown` → 静默；
  - 命中提示后置 `warned.value = true`（每进程一次）。
  - 异常全捕获 → 静默（**绝不**影响主命令）。
- **接入** `src/cli/index.ts` 的 `runCli()`：`program.parse()` **之前**调用 `emitGlobalDeployCheck()`。
- **接入** `src/cli/repl.ts` 的 `startRepl()`：`console.log(repl.welcome)` **之后**调用一次（warned 置位，后续 REPL 内命令不再触发）。
- **语言**：`getCliLang(process.cwd())`。
- **注**：**不**在 `cli/index.ts` 顶层注册 commander 钩子（避免测试面污染，见 §一）。

### T2 — 主动诊断 `openfeel setup --check [--json]`（D-E）

- `src/commands/setup.ts` 增选项 `.option('--check', t('help.setup.check', lang))`、`.option('--json', t('help.setup.json', lang))`。
- action 内**前置短路**：`options.check === true` → 执行 `checkGlobalDeployment()`：
  - 文本模式（默认）：
    - `ok` → 输出「全局部署版本 {v}（与 CLI 一致）」，`process.exitCode = 0`；
    - `mismatch` → 输出「全局部署版本 {deployed} ≠ CLI 版本 {cli}，请运行 `openfeel setup` 并重启 harness」，`process.exitCode = 1`；
    - `missing` → 输出「未检测到全局部署，请运行 `openfeel setup`」，`process.exitCode = 1`；
    - `unknown` → 输出「全局部署状态无法判定（state 缺失或损坏）」，`process.exitCode = 1`（**显式命令**下可报告，区别于被动静默）。
  - `--json` → 单文档 `{ schemaVersion: '1.0', status, cliVersion, deployedVersion }`（stdout 纯 JSON），退出码同上。
- `--check` 为真时**不执行**任何部署（零写盘、不触碰全局目录）。
- 无 `--check` 时行为与现状**逐字不变**。

### T3 — 升级流程文档化（D-G）

| # | 文件 | 改动 |
|:-:|------|------|
| T3.1 | `README.{zh-CN,en}.md` | 新增「升级 openfeel」小节：`npm i -g openfeel@最新` → **须重跑 `openfeel setup`** → 重启 harness；说明被动提示与 `setup --check` |
| T3.2 | `docs/GETTING_STARTED.md` | 命令表补 `setup --check`；新增「升级后为何需重跑 setup」说明 |
| T3.3 | `docs/commands.md` | `setup` 节补 `--check [--json]`；快照标注同步 `v1.1.5` |
| T3.4 | `.openfeel/manual/core/setup.md` | 明确 `setup`/`update` 的全局部署均刷新 `openfeel_version`；补检测语义（四态）与升级流程 |
| T3.5 | `templates-data/opencode/skills/openfeel-cli-usage/SKILL.md`（权威源） | 补 `setup --check [--json]` + 升级流程 + 被动提示说明；`npm run build` 传播 |

### T4 — 版本收口 1.1.4 → 1.1.5（A/B/C/D/E）

> 见大计划 §五清单。要点：`package.json:3`、`package-lock.json:3`/`:9`（root 两处，禁 `npm install`）、`.openfeel/config.yaml:7`（**单行 edit，禁整文件重写**）、`src/core/config.ts` zh/en 模板、`templates-data/agents-md/{zh-CN,en}.md`；`npm run build` 传播 B 类生成段；`CHANGELOG.md` 追加 `## [1.1.5]`；`docs/commands.md:3` 快照版本。

### T5 — 测试面（本阶段）

| # | 用例 | 断言 |
|:-:|------|------|
| T5.1 | 版本不一致 + TTY + 普通命令（如 `flow status`） | stderr 出现提示且含 `openfeel setup`；退出码不变 |
| T5.2 | 版本一致 | stderr **无**提示 |
| T5.3 | 非 TTY | 静默 |
| T5.4 | `--json` | stdout 为纯 JSON（可 `JSON.parse`），stderr 无提示 |
| T5.5 | `--quiet` | 静默 |
| T5.6 | `setup`/`update`/`init`/`migrate`（白名单） | 不触发被动提示 |
| T5.7 | `CI=1` / `OPENFEEL_NO_UPDATE_CHECK=1` | 静默 |
| T5.8 | 全局部署缺失 | 提示「请运行 `openfeel setup`」 |
| T5.9 | state 损坏 | 被动静默 |
| T5.10 | 每进程一次（连续两次调用 `emitGlobalDeployCheck`） | 仅首次输出 |
| T5.11 | `setup --check` 一致 | 退出 0，输出含两版本 |
| T5.12 | `setup --check` 不一致/缺失 | 退出 1 |
| T5.13 | `setup --check --json` | `{schemaVersion,status,cliVersion,deployedVersion}`，纯 JSON，退出码正确 |
| T5.14 | `setup --check` 只读 | 执行前后全局 state 文件 mtime + 字节不变 |
| T5.15 | `setup` 无参回归 | 部署输出与改前一致（现有 setup 测试全绿） |

> 测试统一 `vi.mock('node:os')` + 隔离 HOME；集成层可经 `runCli` 注入 argv/env（或直接单测薄适配器）。

### T6 — 门禁与阶段报告

- 全门禁实跑：`npm test`、`npx tsc --noEmit`、`lint i18n`、`lint kb`、`npm run build`、`--version`。
- 复核 `roadmap/v1.1.5.md`、`plan/v1/v1.1.5/plan.md` 版本值一致；`plan/index.md` / `plan_log.md` 回填；阶段报告。

---

## 四、op 划分与执行顺序（**3 op**）

| op | 主题 | 覆盖 | 关键产出 | 依赖 |
|:--:|------|------|----------|------|
| **op-001** | 被动提示接入 + i18n | T1+T5.1~T5.10 | `cli/deploy-check-output.ts`、`cli/index.ts`、`cli/repl.ts`、i18n 2 键；测试 | hard: stage-66 |
| **op-002** | `setup --check [--json]` | T2+T5.11~T5.15 | `commands/setup.ts`、i18n 5 键；测试 | hard: op-001 |
| **op-003** | 文档 + skill + 版本收口 + 门禁 + 报告 | T3+T4+T6 | README/docs/manual/skill；版本载体；build；全门禁；阶段报告 | hard: op-002 |

**顺序：op-001 → op-002 → op-003。**

**i18n 键（显式登记，+8 → 新基线 761；op-002 实产 `setup` 键 6 个，较预估 +1，新增 `setup.checkUnknownTmpl`）**：
- `update.globalStaleWarnTmpl`、`update.globalMissingWarnTmpl`（被动提示，2）
- `setup.checkOkTmpl`、`setup.checkMismatchTmpl`、`setup.checkMissingTmpl`、`setup.checkUnknownTmpl`（`--check` 文本，4）
- `help.setup.check`、`help.setup.json`（命令帮助，2）

**边界声明**：被动提示只写 stderr、不写盘、不改退出码；`setup --check` 只读；`setup` 无 `--check` 行为不变；不新增依赖；不 `npm publish`/`git push`；不改 `flow.json`。

---

## 五、验收标准（阶段级）

1. **被动提示**：§七.4/§七.5 的出现与静默矩阵全通过（T5.1~T5.10）。
2. **每进程一次**：REPL/连续调用仅提示一次（T5.10）。
3. **主动命令**：`setup --check` 退出码与输出正确，`--json` 稳定且 stdout 纯 JSON（T5.11~T5.13）。
4. **只读**：`setup --check` 与被动检测零写盘（T5.14）。
5. **兼容**：`setup` 无参行为与既有 `--json` 契约不回归（T5.15）。
6. **文档**：README×2 / GETTING_STARTED / commands / manual / skill 五载体「升级流程」一致（T3）。
7. **版本**：`--version` == `package.json` == **1.1.5**；`CHANGELOG` 含 `[1.1.5]`；A 类载体 `1.1.4` 残留 **0**。
8. **门禁**：`npm test` 全绿 `0 skipped / 0 failed`；`tsc` = 0；`lint i18n` = **761（显式登记新基线）**；`lint kb` = 0；`npm run build` 成功且 `.opencode/**` 不复活。

---

## 六、风险与回滚

| # | 风险 | 影响 | 缓解 / 回滚 |
|:-:|------|------|-------------|
| R-1 | 提示污染 stdout/`--json` | 高 | 提示走 stderr；`--json` 静默；T5.4 断言纯 JSON |
| R-2 | 接入点波及测试（parseAsync 触发检测） | 中 | 接入在 `runCli`/`startRepl`，**非**顶层钩子；薄适配器可注入上下文单测 |
| R-3 | `setup --check` 误触发部署或 backup | 高 | 前置短路，`--check` 分支直接 return；T5.14 零写盘 |
| R-4 | 新增键未登记基线致门禁口径漂移 | 低 | §四显式登记 **761**；大计划 §七同步 |
| R-5 | 文案双表不成对 / `help.setup.*` 遗漏 | 低 | `lint i18n` 非 0 退出即拦截 |
| R-6 | 版本收口遗漏载体（package-lock/config.ts/agents-md） | 低 | 依 KB A/B/C/D/E 清单逐条；`1.1.4` 残留 0 断言 |
| R-7 | `.openfeel/config.yaml` 被整文件重写损坏 | 中 | 仅单行 `edit`，禁 `write` |

**回滚**：`git revert <sha>`；无数据迁移；版本回退仅需改回版本载体。

---

## 七、边界（不做）

1. 不改 `bin/openfeel.js` 安装链路；不复活 `postinstall`。
2. 不在 `cli/index.ts` 顶层注册 commander 钩子。
3. 不做联网版本查询；不做逐文件哈希被动检测。
4. 不新增第三方依赖；不改 CI workflow；不 `npm publish`/`git push`；不改 `flow.json`。
5. 不把被动提示设为可改变退出码；`setup --check` 不设 `--fix`。

---

## 八、裁定项（本阶段需明确）

| # | 议题 | **建议** | 依据 |
|:-:|------|----------|------|
| **D-B** | 检测范围 | 任意命令 + REPL 一次；强门控；每进程一次 | 覆盖最大化 vs 噪音 |
| **D-C** | 通道/文案 | **stderr** + zh/en i18n + 指向 `openfeel setup` | 保护 stdout/`--json` |
| **D-E** | 显式命令 | `setup --check [--json]`，**不新增顶层命令** | 最小命令面 |
| **D-F** | 缺失/损坏 | 缺失提示 setup；损坏被动静默、`--check` 显式报告 | 避免 Schema 演进误报 |
| **D-G** | 文档 | 五载体统一升级流程 | 一致性 |

## 九、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-03 | openfeel-planner | 初稿：T1~T6；3 op；验收 8 条；i18n 新基线登记 760；裁定 D-B/D-C/D-E/D-F/D-G；版本收口归 op-003 |