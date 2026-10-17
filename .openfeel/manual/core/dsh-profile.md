# dsh-profile 模块（dsh-profile）

> 模块文档，由归档官在归档时维护。对应源码：`src/core/dsh-profile.ts`（v1.3.0-stage-101）。

## 职责

把 `openfeel` 包内的 `dsh/`（DSH 适配器）以 `link:` 依赖写入 DSH profile 的 `package.json`、追加 `dsh.profile.bundles`、按需执行 `pnpm install`。**只做安装编排**：相位/门禁/归档等权威仍在 OpenFeel CLI；DSH 适配器运行时仍通过子进程调用 CLI。

## 输入

- `DSH_HOME`（env，非空则 `resolve`）或 `~/.dsh`；profile 目录 = `<DSH_HOME>/profiles/<name>/`（须含 `package.json`）。
- 适配器目录 = `<openfeelRoot>/dsh`（`getOpenfeelRootDir()` 经 `createRequire(import.meta.url).resolve('../../package.json')`；`src/core` 与 `dist/core` 均指向包根）。

## 核心 API

| 函数 | 功能 |
|------|------|
| `resolveDshHome()` | `DSH_HOME` 优先并绝对化，否则 `<home>/.dsh`（经 `global-paths.getHomedir()`） |
| `listDshProfiles(home)` | 只收含 `package.json` 的目录，按 name 排序；缺目录/空集抛内部错误码 |
| `selectDshProfiles(profiles, name?)` | 缺省全部；按 name 精确；未知抛 `DSH_PROFILE_UNKNOWN` |
| `readDshProfilePackage(profile)` | 严格 JSON；无 `dsh` 对象 → `DSH_PROFILE_NOT_DSH` |
| `buildDshProfileMerge(json, adapterDir)` | **纯函数**：写 `dependencies['openfeel-dsh']=link:<adapterDir>` + `dsh.profile.bundles` 追加；返回 `{next, changed, changes}`；不改文件 |
| `planDshDeployment(options)` | 预检：home → profiles → 逐个结构校验 → adapter；**不预检 pnpm**、零写盘 |
| `applyDshDeployment(plan)` | **锁外备份** → 锁内重读/合并/按需 `resolvePnpmCommand` / 原子写 → 解锁后 install；fail-fast；失败回滚 |
| `getOpenfeelRootDir()` / `getDshAdapterDir()` / `toLinkSpec()` | 包根 / 适配器目录（校验 name） / 正斜杠 `link:` spec |
| `dshErrorToCli(err)` | 内部 `DSH_*` → `INVALID_ARGUMENT`（预检类）或 `INTERNAL_ERROR`（备份/安装类）+ `detail.reason` |

## 锁序（硬约束）

`backupFileBeforeWrite` / `appendUpdateInfo` / `notifyBackupIfTTY` **必须在 profile 锁外**（它们各自取 `backup` / `update-infos` 锁；嵌套会违反既有锁序）。锁内仅：重读 → 合并 → 按需 pnpm 预检 → 原子写；释放锁后 install。

## 错误映射

| 内部 code | CLI code | kind / exit | reason |
|---|---|---|---|
| HOME / PROFILE / STRUCTURE / JSON / ADAPTER / PNPM_MISSING | `INVALID_ARGUMENT` | refusal / 1 | `dsh-*` |
| BACKUP_FAILED / PNPM_INSTALL_FAILED | `INTERNAL_ERROR` | internal / 3 | `dsh-backup-failed` / `dsh-pnpm-install-failed` |

不新增 `CliErrorCode`，不改变 JSON 契约 13 码 / 40 出口 / 41 选项。

## 幂等与零副作用

- unchanged + link 有效 → skipped：不备份、不加锁、不预检 pnpm、不 install。
- 所有测试用临时 `DSH_HOME` + mock HOME；**真实 `~/.dsh` 零副作用**。
- 混合组合（`opencode,dsh`）非原子：全局资产先写，DSH 失败不回滚全局资产（文档化）。

## 变更历史

| 阶段 | 变更 |
|------|------|
| v1.3.0-stage-101 | 初始创建：单包 DSH 部署（`setup --tools dsh`）、profile 合并/预检/锁序/回滚/错误映射 |
