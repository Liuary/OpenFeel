# v1.1.5-stage-66 计划 — 全局部署版本事实源与检测核心

- **阶段**：`v1.1.5-stage-66`
- **依赖**：无
- **优先级**：P0（本版本基础阶段）
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-03
- **定位**：把 `~/.openfeel/update_state.json.openfeel_version` 从「首次写入、只写不读」改造为「**每次全局部署刷新 + 被读取比较**」，并新增可隔离测试的**结构化检测核心**与**门控策略纯函数**。本阶段**不接 CLI 展示层**（由 stage-67 完成）。
- **范围**：`src/core/setup.ts`、`src/core/update.ts`（写入侧刷新）、**新增** `src/core/deployment-check.ts`、`test/core/*`。
- **边界**：不改 `UpdateStateSchema`（字段已存在）；不改 state 文件路径/命名；检测核心**只读**全局 state、**不写盘**；不新增依赖；不接 CLI/命令面；不 `npm publish`/`git push`；不改 `flow.json`。

## KB 检索（`openfeel-check-kb`）

- 已加载 `openfeel-check-kb`。**高度相关条目**：
  - `kb/architecture.md #全局部署架构…双 state` → 全局 state 绝对路径 key，检测只针对 `~/.openfeel/update_state.json`。
  - `kb/troubleshooting.md #随包 postinstall 在用户端路径层级失效` → 不走 postinstall，改被动检测 + 显式命令。
  - `kb/patterns.md #init/update 重启提醒对称输出模式` → 门控沿用 `isTTY` 静默口径（本阶段仅实现纯策略，stage-67 应用）。
  - `kb/patterns.md #数据加载防御性类型守卫模式` → 检测读取容错（缺失/损坏/权限）。
- **无**「全局部署版本一致性检测」条目 → 归档时补沉 patterns。

---

## 一、背景与实测证据（唯一事实基准）

| 事实 | 源码位置 | 结论 |
|------|----------|------|
| `getOpenfeelVersion()` 读工具自身 `package.json` | `update-state.ts:73-78` | 可作为「CLI 版本」基准 |
| `openfeel_version` **仅首次创建 state 时赋值** | `update-state.ts:172`（`createGlobalUpdateState`）、`:199`（`createUpdateState`） | **既有安装永不刷新** → 必须补写入侧 |
| `setup` 保存全局 state 前只改 `last_update` | `setup.ts:106` | **不写** `openfeel_version` |
| `update` 保存全局 state 前只改 `last_update` | `update.ts:1776-1777` | **不写** `openfeel_version`；`newGlobalState = globalState ?? create...`（同引用） |
| `migrate` 仅回退字面量 / 备份 manifest 带版本 | `migrate.ts:278/309/508` | 非部署刷新点，不改 |
| 全局 state 路径 | `global-paths.ts:49-51`；`loadGlobalUpdateState` `update-state.ts:129-148` | 缺失与非法**均返回 `null`** → 检测层须用 `existsSync` 区分 |
| 项目 state 路径 | `update-state.ts:40`（`.openfeel/update_state.json`） | **不用于本检测**（只针对全局） |
| 无 commander 钩子 | `rg preAction|postAction|\.hook\(` 空 | 接入点由 stage-67 决定；本阶段不接 CLI |

> **关键缺陷链**：`npm i -g openfeel@X` → `~/.openfeel/update_state.json.openfeel_version` 仍为上次**首次创建**时的版本（甚至比上次 setup 还旧）→ 若直接比较将**永久误报**。故 D-A 定案为「**刷新 + 读取**」成对改造。

---

## 二、目标语义

| 维度 | 改前 | 改后 |
|------|------|------|
| `openfeel_version` 语义 | 首次创建时的时间点版本（陈旧） | **当前已部署全局资产的版本**（每次 `setup`/`update` 刷新） |
| 读取比较 | 无 | `checkGlobalDeployment()` 结构化返回 `ok`/`mismatch`/`missing`/`unknown` |
| 门控 | 无 | 纯函数 `shouldRunDeployCheck()`，输入 argv/isTTY/env/已提示标志 → 布尔 |
| CLI 展示 | — | **本阶段不做**（stage-67） |

**不变量**：`UpdateStateSchema`（`version:'1.0'`）不变；全局/项目 state 路径与双份路由不变；`setup`/`update` 的返回结构与输出不变；`saveGlobalUpdateState` 加锁 + 原子写不变。

---

## 三、变更点清单（编号 T）

### T1 — 写入侧刷新 `openfeel_version`（D-A）

- `src/core/setup.ts`：`setupGlobalFramework()` 在 `saveGlobalUpdateState(globalState)` **之前**，新增 `globalState.openfeel_version = getOpenfeelVersion();`（并补 import `getOpenfeelVersion`）。
- `src/core/update.ts`：`updateProject()` 在 `saveGlobalUpdateState(newGlobalState)` **之前**，新增 `newGlobalState.openfeel_version = getOpenfeelVersion();`（`getOpenfeelVersion` 已 import）。
- **语义**：无论 state 是既有（同引用）还是首次创建，部署结束后 `openfeel_version` 恒等于当前 CLI 版本。
- **不改**：`last_update` 逻辑、`files` 哈希更新、冲突标记、`.bak`、锁。

### T2 — 新增检测核心 `src/core/deployment-check.ts`

```ts
/** 全局部署一致性检测结果 */
export type DeployCheckStatus = 'ok' | 'mismatch' | 'missing' | 'unknown';

export interface DeployCheckResult {
  status: DeployCheckStatus;
  cliVersion: string;
  deployedVersion: string | null;
}

/** 检测全局部署版本与当前 CLI 版本是否一致（只读、不写盘） */
export function checkGlobalDeployment(options?: { currentVersion?: string }): DeployCheckResult;
```

- 逻辑：
  1. `cliVersion = options?.currentVersion ?? getOpenfeelVersion()`；
  2. 全局 state 路径 = `getGlobalUpdateStatePath()`；`existsSync` 为假 → `{ status: 'missing', deployedVersion: null }`；
  3. 文件存在 → `loadGlobalUpdateState()`；返回 `null`（Schema 非法/解析失败）→ `{ status: 'unknown' }`；
  4. 否则比较 `state.openfeel_version !== cliVersion` → `'mismatch'`（带 `deployedVersion`）/ `'ok'`；
  5. 任何读取异常 `try/catch` → `'unknown'`（静默，不抛）。
- **只读**：不调用任何 save/atomicWrite；不加锁（读共享文件由 `loadGlobalUpdateState` 既有容错保证）。

### T3 — 门控策略纯函数（D-B 的策略部分）

```ts
export interface DeployCheckGateInput {
  argv: string[];        // 进程参数（不含 node/bin）
  isTTY: boolean;        // process.stdout.isTTY
  env: NodeJS.ProcessEnv;
  alreadyWarned: boolean;
}

/** 是否应执行/输出被动部署提示（纯函数，便于单测矩阵） */
export function shouldRunDeployCheck(input: DeployCheckGateInput): boolean;
```

- 返回 `false` 的静默条件（任一）：
  - `!isTTY`（非交互/CI/测试）；
  - `argv` 含 `--json` 或 `--quiet`；
  - `argv` 含 `--version`/`-v`/`--help`/`-h`；
  - 首个非选项 token ∈ 部署修复类白名单 `{setup, update, init, migrate}`（避免「提示用户去做他正在做的事」）；
  - `env.CI` 为真值（按既有 CI 约定，如 `'true'`/`'1'`）或 `env.OPENFEEL_NO_UPDATE_CHECK` 真值；
  - `alreadyWarned === true`（每进程一次）。
- **纯函数**：不读全局 state、不写 IO，仅参数判定。

### T4 — 测试面（本阶段）

| # | 用例 | 断言 |
|:-:|------|------|
| T4.1 | 既有全局 state（`openfeel_version='1.0.0'`）→ `setupGlobalFramework()` | 结束后 `openfeel_version === getOpenfeelVersion()` |
| T4.2 | 既有全局 state → `updateProject()` | 同上（且 `files` 哈希更新逻辑不回归） |
| T4.3 | 首次（state 不存在）→ `setup` | `openfeel_version === getOpenfeelVersion()` |
| T4.4 | `checkGlobalDeployment` 版本一致 | `status==='ok'` |
| T4.5 | 版本不一致（deployed `'1.0.0'` vs current） | `status==='mismatch'` + `deployedVersion==='1.0.0'` |
| T4.6 | 全局 state 文件缺失 | `status==='missing'` |
| T4.7 | 全局 state 存在但 Schema 非法（如 `version:'2.0'`） | `status==='unknown'`（**不**报错、**不**写盘） |
| T4.8 | 门控矩阵 | TTY/非 TTY、`--json`、`--quiet`、`--version`、`--help`、白名单命令、`CI=1`、`OPENFEEL_NO_UPDATE_CHECK=1`、`alreadyWarned` 各分支与期望一致 |
| T4.9 | 只读性 | 调用 `checkGlobalDeployment` 前后全局 state 文件 mtime + 字节不变（隔离 HOME） |

> 全部测试以 `vi.mock('node:os')` 隔离 homedir（复用 `setup.test.ts` 既有 `vi.hoisted` + `mkdtemp` 模式），**不得触碰真实 `~/.openfeel/`**。

### T5 — 门禁与阶段报告

- 本阶段门禁：`npm test` 全绿 `0 skipped / 0 failed`、`npx tsc --noEmit` = 0、`node bin/openfeel.js lint i18n` = **753**（本阶段**不新增键**）、`node bin/openfeel.js lint kb` = 0、`npm run build` 幂等。
- 输出阶段报告（`executor`/`archiver` 惯例）。

---

## 四、op 划分与执行顺序（**3 op**）

| op | 主题 | 覆盖 | 关键产出 | 依赖 |
|:--:|------|------|----------|------|
| **op-001** | 写入侧刷新 `openfeel_version` | T1+T4.1~T4.3 | `src/core/setup.ts`/`src/core/update.ts`；测试 | 无 |
| **op-002** | 检测核心 + 门控策略 | T2+T3+T4.4~T4.9 | 新增 `src/core/deployment-check.ts`；测试 | hard: op-001 |
| **op-003** | 门禁实跑 + 隔离 HOME 端到端 + 阶段报告 | T5 | 全门禁；报告 | hard: op-002 |

**顺序：op-001 → op-002 → op-003。**
> op-001 与 op-002 文件面不重叠（setup/update vs 新模块），但 op-002 的测试依赖 op-001 的刷新语义，故串行。

**边界声明**：不改 Schema；不改 state 路径；检测只读；不接 CLI；不新增依赖；不 `npm publish`/`git push`；不改 `flow.json`。

---

## 五、验收标准（阶段级）

1. **刷新**：已有全局 state 下 `setup`/`update` 后 `openfeel_version` == 当前 CLI 版本（T4.1~T4.3）。
2. **状态枚举**：`ok`/`mismatch`/`missing`/`unknown` 四态判定正确（T4.4~T4.7）。
3. **只读**：检测前后全局 state 零变更（T4.9）。
4. **门控矩阵**：全部静默/触发分支与预期一致（T4.8）。
5. **兼容**：`setup`/`update` 返回结构、输出、`files` 哈希逻辑不回归；`UpdateStateSchema` 零变更。
6. **无新增 i18n 键**：`lint i18n` 维持 **753**（本阶段不引入文案）。
7. **门禁**：`npm test` 全绿 `0 skipped / 0 failed`；`tsc` = 0；`lint kb` = 0；`npm run build` 成功且 `.opencode/**` 不复活。

---

## 六、风险与回滚

| # | 风险 | 影响 | 缓解 / 回滚 |
|:-:|------|------|-------------|
| R-1 | 刷新点选错（save 前/后顺序）导致仍写旧值 | 高 | 明确「**save 之前**赋值」；T4.1~T4.3 专测 |
| R-2 | 检测核心误判非法 state 为 mismatch | 中 | 缺失/非法分离：非法 → `unknown` 静默；T4.7 |
| R-3 | 测试触碰真实全局目录 | 中 | 统一 `vi.mock('node:os')` + 隔离 HOME；T4.9 前后零 diff |
| R-4 | 门控纯函数与 stage-67 实际 argv 口径不一致 | 低 | 输入结构由本阶段定义并文档化；stage-67 复用同一函数 |
| R-5 | 与 stage-67 对 `setup.ts`/`update.ts` 改动冲突 | 低 | hard 依赖保证串行；stage-67 不改写入侧 |

**回滚**：`git revert <sha>`；无 schema/数据迁移。

---

## 七、边界（不做）

1. 不接 CLI（无 stderr 提示、无钩子）——归 stage-67。
2. 不新增 `setup --check` 命令——归 stage-67。
3. 不做逐文件哈希漂移检测；不做联网查询。
4. 不新增第三方依赖；不改 CI；不 `npm publish`/`git push`；不改 `flow.json`。
5. 不创建除本阶段外的 op。

---

## 八、裁定项（本阶段需明确）

| # | 议题 | **建议** | 依据 |
|:-:|------|----------|------|
| **D-A** | 事实源 | **复用 `openfeel_version` + 写入侧刷新** | §一 缺陷链；原样复用不可行 |
| **D-D** | 检测粒度 | **版本不一致 + 部署缺失**；不做逐文件哈希 | 成本/噪音权衡；conflicts 机制已覆盖文件级 |
| **D-F(部分)** | state 损坏 | **`unknown` 静默**（不提示） | 避免 Schema 演进误报 |

## 九、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-03 | openfeel-planner | 初稿：T1~T5；3 op；验收 7 条；裁定 D-A/D-D/D-F(部分)；锁定「写入侧刷新」为该阶段决定性交付 |
| 2026-10-03 | openfeel-executor | stage-66 交付：写入侧刷新（setup/update）+ `deployment-check.ts` 四态检测 + 门控纯函数；新增「集成契约」供 stage-67 复用（R-4） |
| 2026-10-03 | openfeel-archiver | 归档复核：按 REV-002 **就地调序**恢复正文节序为 八→九→十（executor 依 op-003 方案 T5.2a 将「集成契约」插入修订记录之前，致 八→十→九）；内容零改动，仅节序调整 |

## 十、交付给 stage-67 的集成契约（stage-66 落地）

> 由 op-003 固化；stage-67 **复用同一函数**，不得另行定义检测/门控。

- **检测核心**：`src/core/deployment-check.ts`
  - `checkGlobalDeployment({ currentVersion? }) => { status: 'ok'|'mismatch'|'missing'|'unknown'; cliVersion: string; deployedVersion: string|null }`
  - 只读、不锁、不写盘；`unknown` 静默（不提示）。
- **门控纯函数**：`shouldRunDeployCheck({ argv, isTTY, env, alreadyWarned }) => boolean`
  - `true` = 允许输出被动提示；`false` = 静默。
  - 静默条件：非 TTY / 已提示 / `--json` / `--quiet` / `--version` / `-v` / `--help` / `-h` /
    首 token ∈ {setup,update,init,migrate} / `CI` 真值 / `OPENFEEL_NO_UPDATE_CHECK` 真值。
- **接入点（stage-67）**：`runCli()` / `startRepl()`（**非** `cli/index.ts` 顶层钩子）。
- **触发语义**：仅 `mismatch`/`missing` 提示；`ok`/`unknown` 静默；提示走 stderr；每进程一次。