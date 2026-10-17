# v1.3.0-stage-101 计划：单包分发 DSH 适配器 + `setup --tools dsh` + README 重构 + 1.3.0 收口

> **作者**：openfeel-planner ｜ **日期**：2026-10-17 ｜ **关联需求**：REQ-002
> **工作流**：fast（计划审查单轮 → 直接执行；无 scheme/test 相位）
> **基线**：OpenFeel `1.2.4`（npm 已发布）｜ DSH `0.2.0-rc.2` ｜ 分支 `master`
> **依据**：用户确认的「单包 + `openfeel setup --tools dsh`」路线；用户新增 3 条 README 需求（R1/R2/R3）；plan review 第 1 轮 3 阻塞 + 12 非阻塞（见 §11）。
> **禁止**：本计划不修改源码；执行阶段才动代码。`flow.json` / `status.md` 由 Feel 经工具维护。

---

## 0. 现状基线（计划输入）

| 项 | 事实 |
|---|---|
| 当前版本 | `package.json` / `package-lock.json` / `.openfeel/config.yaml` / `src/core/config.ts` 模板均为 **1.2.4** |
| npm 状态 | `openfeel@1.2.4` 已发布（registry `latest`，gitHead `e61ce2a`） |
| 测试基线 | `npm test` **75 文件 / 1941 用例**；`npx tsc --noEmit` 0；`lint i18n` **994**；`lint kb` 0 过期（649 引用） |
| JSON 契约 | **40 成功出口 / 41 注册选项 / 13 错误码**（本版**不新增错误码、不新增 JSON 出口**） |
| dsh 工作区 | **9 个未提交文件**（`dsh/ADAPTER.md`、`DSH-TODO.md`、`README.md`、`lib/adapters/workspace.js`、`lib/index.js`、`lib/tools/index.js`、`package.json`、`test/integration.js`、`test/verify.js`） |
| dsh 现状 | `dsh/package.json`：`name=openfeel-dsh`、`version=0.1.0`、`private=true`、`requiresCli=>=1.2.4`、`dsh.bundle.patch=./cordis.patch.yml` |
| DSH profile | `<DSH_HOME>/profiles/<name>/package.json`；本机 `~/.dsh/profiles/{web,desktop}`；字段 `dependencies` + `dsh.profile.bundles` |
| 适配器 bug（实测） | `dsh/lib/tools/shared.js` 的 `pushOption(argv, '', value)` 把空串当 flag 推入 argv；`feel_op create` 实测报 `too many arguments for 'create'. Expected 2 arguments but got 3`。受影响 6 处（§3.11） |
| README | 三份均含 v1.2.4~v1.1.2「新增能力」章节（`README.md:51-109`、`README.zh-CN.md:83-151`、`README.en.md:83-151`），待迁出 |
| 版本章节文件 | `docs/` 下无版本能力汇总；`CHANGELOG.md` 已有逐版本明细 |

**关键结论**：本阶段是 **CLI 功能 + 打包内容 + 文档结构 + 适配器缺陷修复** 变更，必须升 `1.3.0` 并发 npm；仅发布后的 tarball 才包含 `dsh/`。这与上一轮「adapter-only 改动不升版本」不矛盾：那一轮不改 CLI，本轮新增命令面、打包白名单与适配器修复。

---

## 1. 范围与非目标

### 1.1 范围（本阶段交付）

1. **单包分发**：根 `openfeel` 的 npm tarball 纳入 `dsh/` 运行必需文件（含 `dsh/ADAPTER.md`）。
2. **部署指令**：`openfeel setup --tools dsh [--dsh-profile <name>]`——把 `<openfeelRoot>/dsh` 以 `link:` 依赖写入 DSH profile、追加 `dsh.profile.bundles`、按需执行 `pnpm install`、提示重启 DSH 宿主。
3. **`update` 边界**：`openfeel update --tools dsh` 明确拒绝并指引 `setup`；`supportedTools` 增加 `dsh` 条目与项目可部署标记。
4. **适配器缺陷修复**：`pushOption(argv, '', value)` 空值当 flag → 新增 `pushPositional` 并替换 6 处；补 ≥4 条真实 CLI 断言（§3.11）。
5. **版本 1.3.0 收口**：A/B/C/D/E 载体、CHANGELOG、README、docs、manual、cli-usage skill、测试计数、版本残留扫描。
6. **README 重构 R1/R2/R3**：版本能力章节迁出到**单一** `docs/VERSIONS.md`（中文主文件 + 顶部 English highlights）；新增 DSH 安装说明；新增「需求驱动 + fast」推荐用法；三语 README 同步。
7. **测试与门禁**：`dsh-profile` 单测、命令层测试、文档结构测试、适配器三套测试、CI 适配器语法检查、`npm pack` 断言、全量门禁。

### 1.2 非目标（明确不做）

- **不**新建、不发布 `openfeel-dsh` npm 包；`dsh/package.json` 保持 `private: true`（本地 link 的包名载体）。
- **不**在根 `openfeel` 包声明 `dsh.bundle.patch`（bundle 身份仍是 `dsh/package.json` 的 `openfeel-dsh`）。
- **不**实现从 registry `plugin_manager install_bundle openfeel`（会把整个 CLI 装进 profile）；文档保留 `plugin_manager install_bundle <path>\dsh` 等价替代。
- **不**改 DSH 适配器运行逻辑，**除** §3.11 的 6 处 `pushPositional` 修复与测试/文档；其余 9 个未提交 dsh 改动按现状纳入。
- **不**新增 `--json` 成功出口；`setup --json` 仍只配合 `--check`；JSON 契约保持 40/41。
- **不**新增 `CliErrorCode`（`DSH_*` 不进入 `src/core/errors.ts` 与契约 §3；仅作为内部错误类 code，命令层映射到既有 `INVALID_ARGUMENT` / `INTERNAL_ERROR`）。
- **不**改 `setup --check` 诊断范围（不检测 DSH profile）。
- **不**实现 monorepo / 子目录回溯 / `openfeel project resolve`。
- **不**自动安装全局 OpenFeel CLI。

### 1.3 为什么单包 / 为什么不再发布 openfeel-dsh / 与上一轮关系

- **单包**符合产品定位：`dsh/` 是 OpenFeel 的一等适配器（与 `claude/`、`kilo/`、`.opencode/` 同级），适配器资产随包分发、默认不部署，由 `setup --tools dsh` 显式启用。
- **不发布独立包**：避免两条发布列车与双版本合同；DSH 侧通过本地 `link:` 消费同一份 `<openfeelRoot>/dsh`，升级 `npm i -g openfeel@latest` 即同步。
- **与上一轮结论**：上一轮「只改 dsh 适配器 → 不升 OpenFeel 版本」是因为 CLI/tarball 未变；本轮新增 `setup` 能力、修改 `files` 并修复适配器，属于 CLI 功能变更，**必须**升 1.3.0 并发布，否则用户拿不到 tarball 内的 `dsh/`。

---

## 2. `setup --tools dsh` 精确行为契约

### 2.1 命令面

```text
openfeel setup --tools dsh [--dsh-profile <name>] [--lang <zh-CN|en>]
openfeel setup --tools opencode,dsh
openfeel setup --check [--json]        # 既有：只读诊断，早退，不进入 dsh 分支
openfeel update --tools dsh            # 明确拒绝（见 §2.8）
```

- `--dsh-profile` 新增，仅对 `dsh` 生效；`--check` 时忽略（早退路径不变）。
- `--json` 无 `--check` 时保持现状（不产生成功 JSON）；dsh 错误经 `failCli` 输出 envelope（若显式传 `--json`）。
- 退出码：预检/用法/profile 类错误 `1`；备份/安装类错误 `3`；成功 `0`（含全部 skipped）。

### 2.2 DSH_HOME 与 profile 发现

新增 `src/core/dsh-profile.ts`，以下函数为单一权威：

| 函数 | 契约 |
|---|---|
| `resolveDshHome(): string` | `process.env.DSH_HOME?.trim()` 非空 → `resolve()` 该值；否则 `join(getHomedir(), '.dsh')`。**只经 `global-paths.getHomedir()` 取用户目录**（测试单点 mock）。 |
| `listDshProfiles(dshHome: string): DshProfile[]` | 读 `<dshHome>/profiles`；缺失 → `DshProfileError('DSH_HOME_NOT_FOUND')`；仅目录且含 `package.json` 者入选；按 name 字典序。空集 → `DSH_PROFILE_NOT_FOUND`。 |
| `selectDshProfiles(profiles, requested?: string): DshProfile[]` | `requested` 精确匹配；未命中 → `DSH_PROFILE_UNKNOWN`；缺省返回**全部**已发现 profile。 |
| `readDshProfilePackage(profile): ProfileJson` | 严格 `JSON.parse`；失败 → `DSH_PROFILE_INVALID_JSON`；非对象 / 无 `dsh` 对象 → `DSH_PROFILE_NOT_DSH`。 |

**多 profile 策略（N1）**：缺省部署**全部**已发现 profile（本机 web + desktop）；写入阶段 **fail-fast**（某 profile 备份/写入/安装失败 → 停止后续，已完成的保持并在错误 `detail.completed` 中列出）。TTY 下若同时存在多个 profile 且未传 `--dsh-profile`，打印一次提示：`setup.dshMultiProfileHint`（「检测到多个 DSH profile（{profiles}），将全部部署；可用 --dsh-profile 窄化」）。

### 2.3 profile `package.json` 合并规则（字段级）

```ts
interface ProfileJson {
  dependencies?: Record<string, string>;
  dsh?: {
    profile?: { bundles?: string[]; [k: string]: unknown };
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

export function buildDshProfileMerge(
  json: ProfileJson,
  adapterDir: string,
): { next: ProfileJson; changed: boolean; changes: Array<'dependency' | 'bundle'> };
```

- 结构校验：
  - 顶层不是普通对象 → `DSH_PROFILE_INVALID_SHAPE`；
  - `dsh` 缺失或非对象 → `DSH_PROFILE_NOT_DSH`（**不猜测**、不创建 `dsh` 根键）；
  - `dsh.profile` 缺失 → 创建 `{}`；`dsh.profile.bundles` 缺失 → `[]`；两者类型不对 → `DSH_PROFILE_INVALID_SHAPE`；
  - `dependencies` 缺失 → 创建 `{}`；非对象 → `DSH_PROFILE_INVALID_SHAPE`。
- 写入值：
  - `dependencies['openfeel-dsh'] = 'link:' + toPosix(adapterDir)`；已有不同值 → 覆盖并记 `changes.push('dependency')`。
  - `dsh.profile.bundles`：去重后追加 `'openfeel-dsh'`；保留既有顺序；缺则记 `changes.push('bundle')`。
- 序列化：`JSON.stringify(next, null, 2) + '\n'`；与原文逐字比较，不同才写（格式会被统一为 2 空格）。
- 纯函数不得触碰文件系统；`adapterDir` 由调用方解析（便于单测）。

### 2.4 备份 / 锁序 / 幂等 / 回滚（REV-001 / N12）

**锁序（硬约束）**：**禁止**在 `withFileLock(globalLockPath('dsh-profile-...'))` 内调用 `backupFileBeforeWrite` / `appendUpdateInfo` / `notifyBackupIfTTY`——它们分别取 `backup` / `update-infos` 锁，会与 profile 锁嵌套（参 `claude-settings.ts:78-96`、`setup.ts:69` 的既有锁序）。固定顺序：

1. **锁外预读（只读）**：读取 profile `package.json` 原文 → `buildDshProfileMerge`（快照判断）；若 `changed === false` 且 link 有效 → `skipped`（**不备份、不锁、不 install、不预检 pnpm**）。
2. **锁外备份**：需要变更时 `backupFileBeforeWrite(pkgPath, { command: 'setup' })` + `appendUpdateInfo('backed', { absolutePath, backupRel, command: 'setup' })` + TTY `notifyBackupIfTTY`。备份失败 → `DSH_BACKUP_FAILED`（该 profile **零写盘**；命令层映射 `INTERNAL_ERROR`/3）。
3. **锁内重读 + 合并 + 按需 pnpm 预检 + 写**：
   ```ts
   withFileLock(globalLockPath(`dsh-profile-${safeName}`), () => {
     const lockedOriginalText = readFileSync(pkgPath, 'utf-8');       // N12 回滚基准
     const lockedJson = JSON.parse(lockedOriginalText);
     const merge = buildDshProfileMerge(lockedJson, adapterDir);
     const needsInstall = merge.changed || !isLinkValid(profileDir, adapterDir);
     if (needsInstall) resolvePnpmCommand();                          // N2：仅在需要 install 时预检
     if (merge.changed) atomicWriteFileSync(pkgPath, JSON.stringify(merge.next, null, 2) + '\n');
     return { lockedOriginalText, changed: merge.changed, needsInstall };
   });
   ```
   - 锁内若已是最新（预读后被其它进程改为最新）→ 跳过写（备份可能多余，沿用既有语义）。
   - pnpm 缺失且需要 install → 在**写之前**抛 `DSH_PNPM_MISSING`（零写盘）。
4. **释放锁后 install**：仅当 `needsInstall` 为真时执行 `runPnpmInstall(profileDir)`（§2.5）。
5. **回滚**：install 失败/超时且本次有写 → `atomicWriteFileSync(pkgPath, lockedOriginalText)` 恢复；`appendUpdateInfo('anomaly', { absolutePath, note: 'dsh_install_failed_rolled_back' })`；抛 `DshProfileError('DSH_PNPM_INSTALL_FAILED', { profile, stdoutTail, stderrTail, manualCommand })`。回滚写失败 → 错误同时含原错误与回滚错误。`node_modules` 残留**不**回滚（说明：下次 `pnpm install` 收敛）。
6. **幂等**：二次运行（unchanged + link 有效）→ `skipped`，无备份、无锁、无 pnpm 预检、无 install。
7. **fail-fast（N1）**：多 profile 顺序处理；任一失败停止后续；错误 `detail.completed` 列出已完成 profile，部分写入可诊断。

### 2.5 `pnpm install` 调用与 Windows 兼容（N2）

- **预检时机**：仅在 `needsInstall`（`changed || !isLinkValid`）时，于锁内写盘前调用 `resolvePnpmCommand()`；幂等重跑（unchanged + link 有效）**不预检 pnpm**，缺 pnpm 也不失败。
  ```ts
  spawnSync('pnpm', ['--version'], { shell: process.platform === 'win32', encoding: 'utf8', timeout: 30_000 });
  ```
  非 0 / ENOENT → `DSH_PNPM_MISSING`（提示 `npm i -g pnpm`、DSH 自带 pnpm 路径、或手动在 profile 目录执行；零写盘）。
- **安装**：
  ```ts
  spawnSync('pnpm', ['install', '--prefer-offline'], {
    cwd: profileDir,
    shell: process.platform === 'win32',   // 让 pnpm.cmd 经 PATHEXT 解析
    encoding: 'utf8',
    timeout: 180_000,
    env: { ...process.env, CI: '1' },       // 非交互
  });
  ```
  - `shell: true` 仅 Windows 启用；args 固定、无用户输入，无注入面。
  - 非 0 / `error.code === 'ETIMEDOUT'` → 截取 stdout/stderr 尾部（≤2000 字符）进错误 `detail`；命令层映射 `INTERNAL_ERROR`/3。
- **跳过条件**（两者同时满足）：`changed === false` 且 `realpathSync(<profile>/node_modules/openfeel-dsh) === realpathSync(adapterDir)`（不存在或异常 → 视为不满足）。
- 安装成功后不更新全局 `update_state.json` 的资产 hash（DSH profile 不属于受管资产，见 §2.7/REV-003）。

### 2.6 OpenFeel 包根与适配器目录推导

| 函数 | 契约 |
|---|---|
| `getOpenfeelRootDir(): string` | `createRequire(import.meta.url).resolve('../../package.json')` 的 `dirname`（与 `getOpenfeelVersion` 同法；`src/core` 与 `dist/core` 均指向包根）。 |
| `getDshAdapterDir(): string` | `join(getOpenfeelRootDir(), 'dsh')`；校验 `dsh/package.json` 存在且 `name === 'openfeel-dsh'`；失败 → `DSH_ADAPTER_MISSING`（提示升级 openfeel ≥1.3.0 或从仓库运行）。 |
| `toLinkSpec(adapterDir: string): string` | `'link:' + adapterDir.replace(/\\/g, '/')`；路径含空格由 pnpm 处理（测试覆盖）。 |

### 2.7 输出、结果与全局状态（REV-003 / N3）

`SetupResult` 扩展：

```ts
interface SetupResult {
  created: string[];
  updated: string[];
  skipped: string[];
  appended: string[];
  dsh?: {
    home: string;
    profiles: Array<{
      name: string;
      path: string;
      action: 'updated' | 'skipped';
      backupRel?: string;
      install: 'installed' | 'skipped';
    }>;
  };
}
```

- **只放 `dsh`（REV-003）**：DSH profile 结果**不** push 到 `created/updated/skipped/appended`；命令层单独打印（§3.4）。`setup.ts:134-137` 的 hash 循环因此自然不含 profile `package.json`。
- **全局部署版本（N3）**：仅当 `tools` 含 `opencode` 或 `claude` 时，执行现有「刷新 `globalState.openfeel_version` + save」逻辑；**纯 `--tools dsh` 整段跳过** `update_state.json` 的版本事实写入（不改变 `~/.openfeel/update_state.json`）。混合组合（`opencode,dsh`）按 opencode 语义刷新。
- 命令层打印（来自 `r.dsh`）：
  - `setup.dshProfilesTmpl`（home + 数量）；
  - 每 profile：updated/skipped + `link:<path>` + `bundles += openfeel-dsh`；
  - `pnpm install`：完成 / 跳过；
  - `请重启 DSH 宿主以加载适配器（host module 不走热加载）`。
- **退出码**：预检/用法/profile 类错误 `1`；备份/安装类错误 `3`；成功 `0`。
- **重启 harness 文案**：按 `tools` 拼接 `opencode / Claude Code / DSH`；仅 opencode 时输出与现有逐字一致。
- `--check` 路径完全不进入 dsh 分支；`--tools dsh --check` 仍只做全局部署诊断（不写 DSH profile）。

### 2.8 `update --tools dsh` 处置

- `src/commands/update.ts` 在 `parseToolList` 之后、`existsSync(targetPath)` / auto-init **之前**：
  ```ts
  if (toolsParsed?.tools.includes('dsh')) {
    console.error(t('update.dshNotAllowedTmpl', lang));
    process.exit(1);   // 零写盘、不 auto-init
  }
  ```
- `update` 的非法值提示中 `valid` 列表改为 `supportedTools.filter(t => t.projectDeployable !== false)`；`selectTools()` 同样过滤，交互列表不出现 dsh。
- `updateProject()` 防御性保持仅 `opencode` / `claude`；仅 `dsh` 时返回空结果（命令层已拦截）。

### 2.9 错误映射（REV-002）

**不新增 `CliErrorCode`**：`DSH_*` 仅作为 `DshProfileError` 的内部 code（测试/日志用），命令层统一映射到既有两码，并保持 `src/core/errors.ts` 13 码表与 `docs/json-contract.md` §3 不变。

| 内部 code | 命令层 code | kind | exit | `detail.reason` | 写盘 |
|---|---|---|:--:|---|---|
| `DSH_HOME_NOT_FOUND` | `INVALID_ARGUMENT` | refusal | 1 | `dsh-home-not-found` | 零 |
| `DSH_PROFILE_NOT_FOUND` | `INVALID_ARGUMENT` | refusal | 1 | `dsh-profile-not-found` | 零 |
| `DSH_PROFILE_UNKNOWN` | `INVALID_ARGUMENT` | refusal | 1 | `dsh-profile-unknown` | 零 |
| `DSH_PROFILE_INVALID_JSON` | `INVALID_ARGUMENT` | refusal | 1 | `dsh-profile-invalid-json` | 零 |
| `DSH_PROFILE_NOT_DSH` | `INVALID_ARGUMENT` | refusal | 1 | `dsh-profile-not-dsh` | 零 |
| `DSH_PROFILE_INVALID_SHAPE` | `INVALID_ARGUMENT` | refusal | 1 | `dsh-profile-invalid-shape` | 零 |
| `DSH_ADAPTER_MISSING` | `INVALID_ARGUMENT` | refusal | 1 | `dsh-adapter-missing` | 零 |
| `DSH_PNPM_MISSING` | `INVALID_ARGUMENT` | refusal | 1 | `dsh-pnpm-missing` | 零 |
| `DSH_BACKUP_FAILED` | `INTERNAL_ERROR` | internal | 3 | `dsh-backup-failed` | 零（该 profile） |
| `DSH_PNPM_INSTALL_FAILED` | `INTERNAL_ERROR` | internal | 3 | `dsh-pnpm-install-failed` | 已回滚 |

- 映射函数：`dshErrorToCli(err: DshProfileError): { code: 'INVALID_ARGUMENT' | 'INTERNAL_ERROR'; detail: { reason; ... } }`（`src/core/dsh-profile.ts` 导出，纯函数）。
- 命令层：`failCli({ code, message, detail: dshErrorToCli(err).detail, stderrLines: [err.message] })`；`INTERNAL_ERROR` 走 internal/3，消息附手动命令（pnpm install）。
- 保留 `DshProfileError.code` 供测试断言与日志；**不**进入 envelope 的 `error.code`。

---

## 3. 文件改动清单（执行阶段按此落地）

### 3.1 新增 `src/core/dsh-profile.ts`

导出：

- 类型：`DshProfile`、`DshProfilePlan`、`DshProfileResult`、`DshProfileErrorCode`、`SetupDshOptions`。
- 错误类：`export class DshProfileError extends Error { code: DshProfileErrorCode; detail?: Record<string, unknown> }`。
- 函数：
  - `resolveDshHome()`、`listDshProfiles(dshHome)`、`selectDshProfiles(profiles, requested?)`、`readDshProfilePackage(profile)`
  - `buildDshProfileMerge(json, adapterDir)`（纯函数）
  - `isLinkValid(profileDir, adapterDir)`（`realpathSync` 比较，异常 → false）
  - `planDshDeployment(options: { dshProfile?: string }): DshProfilePlan`（预检：home → profiles → 逐个读取/结构校验 → adapter；**不预检 pnpm**；零写盘）
  - `applyDshDeployment(plan, lang): DshProfileResult[]`（§2.4 锁序；fail-fast；返回每 profile 结果）
  - `resolvePnpmCommand()`、`runPnpmInstall(profileDir)`
  - `getOpenfeelRootDir()`、`getDshAdapterDir()`、`toLinkSpec(adapterDir)`
  - `dshErrorToCli(err)`（REV-002 映射）
- 不 import `node:os` 的 `homedir`（经 `global-paths.getHomedir()`）。

### 3.2 修改 `src/core/update.ts`

- `ToolEntry` 增加可选 `projectDeployable?: boolean`（缺省 `true`）。
- `supportedTools` 追加：
  ```ts
  {
    id: 'dsh',
    name: 'DeepSeek Harness',
    description: 'DSH 适配器 — 通过 openfeel setup --tools dsh 部署到 DSH profile（全局部署，不用于项目 update）',
    enabled: false,
    projectDeployable: false,
  }
  ```
- `selectTools()` 的 choices 过滤 `t.projectDeployable !== false`。
- `parseToolList()` 不变（dsh 自动成为合法值）。
- 注意：`SKILL_DEFINITIONS` 是 build 生成区，**禁止手改**。

### 3.3 修改 `src/core/setup.ts`

- 签名扩展（向后兼容）：
  ```ts
  export function setupGlobalFramework(
    lang: 'zh-CN' | 'en' = 'zh-CN',
    tools: string[] = ['opencode'],
    options: { dshProfile?: string } = {},
  ): SetupResult
  ```
- 分支顺序：
  1. 若 `tools.includes('dsh')` → `planDshDeployment(options)`（预检；失败直接抛，**未写任何东西**）；
  2. opencode 分支（原样）；
  3. claude 分支（原样）；
  4. `applyDshDeployment(...)`，结果只写入 `result.dsh`（**不** push 到 created/updated/skipped，REV-003）；
  5. 全局 state 收尾（N3）：`const touchesGlobalAssets = tools.includes('opencode') || tools.includes('claude')`；仅当为真时执行现有 hash 循环 + `openfeel_version` 刷新 + `saveGlobalUpdateState`；纯 dsh 跳过整段。
- `SetupResult` 增加 `dsh?` 字段（接口扩展，不破坏既有调用）。

### 3.4 修改 `src/commands/setup.ts`

- 新增 `.option('--dsh-profile <name>', t('help.setup.dshProfile', ...))`。
- `--check` 早退路径不变。
- `parseToolList` 后把 `options.dshProfile` 传入 `setupGlobalFramework`。
- `try/catch DshProfileError` → `const mapped = dshErrorToCli(err); failCli({ code: mapped.code, message: err.message, detail: mapped.detail, stderrLines: [err.message] })`。
- 输出：既有 created/updated/skipped/appended 打印之后，若 `r.dsh` 存在，**单独**打印：
  - `setup.dshProfilesTmpl`（含数量、home）；
  - 每 profile 一行（updated/skipped + link + bundles）；
  - `setup.dshInstallOkTmpl` / `setup.dshInstallSkipTmpl`；
  - `setup.dshRestartHint`。
- 多 profile TTY 提示（N1）：`--dsh-profile` 未指定且 `r.dsh.profiles.length > 1` 时打印 `setup.dshMultiProfileHint`。
- restart harness 组合改为 `DSH` 参与拼接（见 §2.7）。

### 3.5 修改 `src/commands/update.ts`

- dsh 拒绝（§2.8），位置在 auto-init 之前。
- valid 列表过滤 `projectDeployable !== false`。

### 3.6 i18n（`src/core/i18n-data/zh-CN.ts` + `en.ts`，逐键双语）

新增/修改键（建议文案，执行阶段可微调但需 zh/en 对齐）：

| key | zh | en |
|---|---|---|
| `help.setup.tools`（改） | 部署工具列表（逗号分隔，如 opencode,claude,dsh；默认仅 opencode；非法值报错退出 1） | Deploy target tools (comma-separated, e.g. opencode,claude,dsh; defaults to opencode only; invalid value exits 1) |
| `help.setup.dshProfile` | DSH profile 名称（如 web / desktop）；缺省部署到全部已检测 profile | DSH profile name (e.g. web / desktop); defaults to all detected profiles |
| `setup.dshProfilesTmpl` | DSH 适配器：{home}（{count} 个 profile） | DSH adapter: {home} ({count} profile(s)) |
| `setup.dshProfileUpdatedTmpl` |   ~ {name}：已更新 {path}（openfeel-dsh → link:{adapter}；bundles += openfeel-dsh） |   ~ {name}: updated {path} (openfeel-dsh -> link:{adapter}; bundles += openfeel-dsh) |
| `setup.dshProfileSkippedTmpl` |   - {name}：已是最新，跳过 {path} |   - {name}: up to date, skipped {path} |
| `setup.dshInstallOkTmpl` |   pnpm install 完成：{path} |   pnpm install completed: {path} |
| `setup.dshInstallSkipTmpl` |   pnpm install 跳过：依赖未变化且链接有效 |   pnpm install skipped: dependency unchanged and link valid |
| `setup.dshMultiProfileHint` | 检测到多个 DSH profile（{profiles}），将全部部署；可用 --dsh-profile 窄化。 | Multiple DSH profiles detected ({profiles}); deploying to all. Use --dsh-profile to narrow. |
| `setup.dshRestartHint` | 请重启 DSH 宿主以加载适配器（host module 不走热加载）。 | Restart the DSH host to load the adapter (host modules are not hot-reloaded). |
| `setup.dshHomeMissingTmpl` | 未检测到 DSH profile 目录：{dir}。请先安装/启动 DSH，或设置 DSH_HOME。 | DSH profiles directory not found: {dir}. Install/start DSH first, or set DSH_HOME. |
| `setup.dshProfileMissingTmpl` | DSH profiles 目录下没有可识别 profile（需含 package.json）：{dir}。 | No recognizable DSH profile (package.json) under: {dir}. |
| `setup.dshProfileUnknownTmpl` | 未找到 DSH profile「{name}」；可用：{profiles}。 | DSH profile "{name}" not found; available: {profiles}. |
| `setup.dshProfileInvalidJsonTmpl` | DSH profile 的 package.json 不是合法 JSON：{path}（{err}）。 | DSH profile package.json is not valid JSON: {path} ({err}). |
| `setup.dshProfileNotDshTmpl` | {path} 不是 DSH profile（缺少 dsh 配置）；拒绝修改。 | {path} is not a DSH profile (missing dsh config); refusing to modify. |
| `setup.dshProfileInvalidShapeTmpl` | DSH profile 结构非法（{field} 类型错误）：{path}。 | Invalid DSH profile shape ({field}): {path}. |
| `setup.dshAdapterMissingTmpl` | 当前 openfeel 安装未包含 DSH 适配器（{path}）；请升级到 ≥1.3.0 或从仓库运行。 | This openfeel install does not include the DSH adapter ({path}); upgrade to ≥1.3.0 or run from the repo. |
| `setup.dshPnpmMissingTmpl` | 未找到 pnpm；请 npm i -g pnpm，或先在 {path} 手动执行 pnpm install。 | pnpm not found; run npm i -g pnpm, or run pnpm install manually in {path}. |
| `setup.dshPnpmFailedTmpl` | pnpm install 失败（{path}）；已回滚 profile package.json。手动重试：cd {path} && pnpm install。 | pnpm install failed ({path}); profile package.json rolled back. Retry manually: cd {path} && pnpm install. |
| `setup.dshBackupFailedTmpl` | DSH profile 备份失败，已跳过写入：{path}（{err}）。 | DSH profile backup failed; write skipped: {path} ({err}). |
| `update.dshNotAllowedTmpl` | update 不支持 dsh（DSH 适配器是全局部署）；请使用 openfeel setup --tools dsh。 | update does not support dsh (the DSH adapter is global); use openfeel setup --tools dsh. |

> 新增约 **16** 个键；`lint i18n` 计数预计 994 → ~1010（以实测为准，收口时回填文档）。

### 3.7 根 `package.json` 与 `dsh/package.json`

根 `package.json`：

```json
"files": [
  "dist",
  "bin",
  "schemas",
  "dsh/lib",
  "dsh/cordis.patch.yml",
  "dsh/package.json",
  "dsh/README.md",
  "dsh/ADAPTER.md",
  "dsh/docs"
]
```

- 不加入 `dsh/test/`（运行不需要）；`dsh/ADAPTER.md` 加入（N5：README 链接它）。
- 版本收口时 `"version": "1.3.0"`。

`dsh/package.json`：

- `"version": "1.3.0"`（与根包 lockstep；仍 `private: true`，不发布）。
- `"openfeel.requiresCli": ">=1.3.0"`。
- 其余字段不变；`dsh.bundle.patch` 保持。

### 3.8 测试与 CI 文件

| 文件 | 动作 |
|---|---|
| `test/core/dsh-profile.test.ts` | **新增**（§6.1） |
| `test/commands/setup.test.ts` | **扩展**（§6.1） |
| `test/commands/update.test.ts` | **扩展**（§6.1） |
| `test/core/update.test.ts` | **扩展**（§6.1） |
| `test/core/release-metadata.test.ts` | **扩展**（§6.1） |
| `test/core/docs-structure.test.ts` | **新增**（§6.1） |
| `.github/workflows/ci.yml` | build-and-test 增加适配器语法检查（N8）：`find dsh/lib -name '*.js' -print0 \| xargs -0 -n1 node --check` |
| `dsh/test/verify.js` | 增加 ≥4 条 `pushPositional` 真实 CLI 断言（§3.11） |

### 3.9 文档与手动维护清单（详见 §4/§5）

- `README.md` / `README.zh-CN.md` / `README.en.md`：瘦身 + DSH 节 + 推荐用法 + 顶部版本/索引行 + 测试计数；顶部「当前适配 harness」行加入 DSH（N6）。
- 新增 `docs/VERSIONS.md`（**仅此一个**，中文主文件 + 顶部 English highlights，N7）；`docs/index.md` 登记一项。
- `CHANGELOG.md`：新增 `[1.3.0]`（含适配器 `pushPositional` 修复），顶部注明与 VERSIONS 的分工。
- `docs/commands.md`：setup/`--dsh-profile`、update 拒绝 dsh、命令表。
- `docs/GETTING_STARTED.md`：推荐用法 + DSH 安装速览（指向 README/`dsh/README.md`）。
- `.openfeel/manual/cli/setup.md`、`.openfeel/manual/core/setup.md`、`.openfeel/manual/cli/commands.md`、`.openfeel/manual/index.md`、**新增** `.openfeel/manual/core/dsh-profile.md`。
- `src/core/templates-data/skills/openfeel-cli-usage/SKILL.md`：v1.3.0 快照 + `setup --tools dsh` + 推荐用法；改源后 `npm run build`。
- `dsh/README.md`、`dsh/ADAPTER.md`：安装改为「单包 + setup --tools dsh」，保留开发 link 说明；**`../docs/...` 相对链接改 GitHub 绝对 URL 或注明「仓库内文档」**（N11），避免 npm 包内断链；`dsh/DSH-TODO.md` 保持历史交接记录（可加一行「已被单包方案取代」）。
- `.openfeel/dev/current.md`：收口时更新近期记录（非门禁）。

### 3.10 生成物（只由 build 生成，禁手改）

- `src/core/template-loader.ts`（`AGENTS_MD_TEMPLATES` / `CLAUDE_CONSTRAINT_TEMPLATES` 等锚点区）。
- `src/core/update.ts`（`SKILL_DEFINITIONS` 锚点区）。
- 变更源（templates-data、skills）后执行 `npm run build`，并跑两次确认幂等（dist / 生成物 hash 稳定）。

### 3.11 适配器缺陷修复：`pushOption(argv, '', value)` 空参 bug（新增范围）

**根因**：`dsh/lib/tools/shared.js` 的 `pushOption(argv, flag, value)` 在 `flag === ''` 时仍把 `''` push 进 argv，导致 CLI 多一个空位置参数。实测 `feel_op create` 报 `too many arguments for 'create'. Expected 2 arguments but got 3`。

**修复**：

1. `dsh/lib/tools/shared.js` 新增：
   ```js
   export function pushPositional(argv, value) {
     if (value === undefined || value === null || value === '') return;
     argv.push(String(value));
   }
   ```
   `pushOption` 保持不变（仍用于真正的 flag）。
2. `dsh/lib/tools/index.js` 替换以下 6 处 `pushOption(argv, '', ...)` → `pushPositional(argv, ...)`（行号为当前工作区快照，执行时以搜索为准）：
   - L489 `feel_op create`（title）
   - L524 `feel_op register`（op）
   - L741 `feel_checkpoint list`（stage）
   - L1007 `feel_verify config_get`（key）
   - L1099 `feel_plan scheme_list`（stage）
   - L1115 `feel_plan roadmap_show`（version）
3. `dsh/test/verify.js` 增加 **≥4 条真实 CLI 断言**：
   - `feel_op create` → 实际 argv 无空参数，不出现 `too many arguments`；
   - `feel_plan scheme_list`（带/不带 stage）→ 命令成功且 stage 正确传递；
   - `feel_plan roadmap_show`（带/不带 version）→ 空态/指定版本语义正确；
   - `feel_verify config_get`（带 key）→ 走 `config get <key> --json`，不出现空参数。
4. 运行适配器三套：`node dsh/test/contract.js`、`node dsh/test/verify.js`、`node dsh/test/integration.js`（asar 提取缺失时按既有跳过逻辑说明）。
5. 纳入 1.3.0 提交；`dsh/lib` 已随包分发，无需额外发布物。

---

## 4. 版本 1.3.0 收口清单

### 4.1 A 类：版本载体（逐文件逐行）

| # | 文件:行（当前） | 字段 | 改为 |
|--:|---|---|---|
| 1 | `package.json:3` | `version` | `1.3.0` |
| 2 | `package-lock.json:3` | `version` | `1.3.0` |
| 3 | `package-lock.json:9`（`packages[""]`） | `version` | `1.3.0` |
| 4 | `.openfeel/config.yaml:7` | `meta.version` | `1.3.0` |
| 5 | `src/core/config.ts:436` | 中文模板 `meta.version` | `1.3.0` |
| 6 | `src/core/config.ts:493` | 英文模板 `meta.version` | `1.3.0` |
| 7 | `src/core/templates-data/agents-md/zh-CN.md:135` | 「当前 v1.2.4」 | `v1.3.0` |
| 8 | `src/core/templates-data/agents-md/en.md:135` | 「currently v1.2.4」 | `v1.3.0` |
| 9 | `src/core/templates-data/claude/constraint/zh-CN.md:138` | 「当前 v1.2.4」 | `v1.3.0` |
| 10 | `src/core/templates-data/claude/constraint/en.md:138` | 「currently v1.2.4」 | `v1.3.0` |
| 11 | `dsh/package.json:3` | `version` | `1.3.0` |
| 12 | `dsh/package.json:35` | `openfeel.requiresCli` | `>=1.3.0` |

> 预期 A 类 = **9 文件 / 12 处**（package-lock 2 处、config.ts 2 处、templates 4 处、dsh 2 处）。执行时以 `rg "1\.2\.4"` 实测校正。

### 4.2 B 类：生成物（`npm run build` 重生成，禁手改）

- `src/core/template-loader.ts`：agents-md / claude constraint 版本串。
- `src/core/update.ts`：`SKILL_DEFINITIONS`（cli-usage skill 更新）。
- 校验：build ×2 幂等；`npx tsc --noEmit` 0。

### 4.3 C 类：变更记录

- `CHANGELOG.md` 新增 `## [1.3.0] - 2026-10-17`：
  - **Added**：`setup --tools dsh`（单包 DSH 部署）、`--dsh-profile`、DSH 适配器随包分发、README 推荐用法（文档新增）。
  - **Changed**：README 版本章节迁出到 VERSIONS；`update --tools dsh` 拒绝；dsh 适配器 `requiresCli`。
  - **Fixed**：`pushOption(argv, '', value)` 空参 bug（6 处）→ `pushPositional`；适配器 workspace 不回溯 / prompt 注入等既有未提交修复（按实际归类）。
  - 顶部加一行：逐版本明细 = CHANGELOG；面向用户能力概览 = `docs/VERSIONS.md`。
- 新增 `docs/VERSIONS.md`：面向用户能力概览（**唯一文件**，中文主文件 + 顶部 English highlights；不写测试计数/REV/文件级细节），每个版本链接 CHANGELOG。

### 4.4 D 类：文档载体

- `README.md` / `README.zh-CN.md` / `README.en.md`（§5）。
- `docs/commands.md`：setup 节补 `--dsh-profile` 与 DSH 行为；update 节注明拒绝 dsh；全局选项表/命令表。
- `docs/GETTING_STARTED.md`：推荐用法 + DSH 速览 + 版本快照 `v1.3.0`。
- `docs/index.md`：新增「版本与发布」表（**只有** `VERSIONS.md` + `CHANGELOG.md` 两项）。
- `.openfeel/manual/`：`cli/setup.md`、`core/setup.md`、`cli/commands.md`、`index.md`、新增 `core/dsh-profile.md`。
- `src/core/templates-data/skills/openfeel-cli-usage/SKILL.md`：快照 `v1.3.0`、能力描述、setup 命令面、推荐用法；build 注入。
- `dsh/README.md` / `dsh/ADAPTER.md`：安装路径、版本要求、外链改绝对 URL（N11）。

### 4.5 E 类：计数与残留扫描（N9）

- `npm test` 实际文件数/用例数回填 README×3、VERSIONS（如提及）、GETTING_STARTED（如提及）。
- `lint i18n` 实际键数回填文档（README/GETTING_STARTED/commands 中如有）。
- `lint kb` 引用数仅记录，不改门槛。
- JSON 契约保持 **40/41、13 错误码**；`docs/json-contract.md` **不**升版（无契约变更）。
- **残留扫描范围（N9）**：仅扫 **A 类载体（§4.1）+ 当前快照文档**（README×3、`docs/VERSIONS.md`、`docs/commands.md`、`docs/GETTING_STARTED.md`、`.openfeel/manual/**`、cli-usage skill 源）；**不**拿全仓 grep 当门禁。
  ```powershell
  rg "1\.2\.4" package.json package-lock.json .openfeel/config.yaml src/core/config.ts `
     src/core/templates-data/agents-md src/core/templates-data/claude/constraint `
     dsh/package.json README.md README.zh-CN.md README.en.md docs/VERSIONS.md `
     docs/commands.md docs/GETTING_STARTED.md .openfeel/manual src/core/templates-data/skills/openfeel-cli-usage
  ```
  白名单：`CHANGELOG.md` / `docs/VERSIONS.md` 的历史版本条目、`docs/dsh-cli-requirements-supplement-1.2.3.md`、`docs/OPENFEEL-1.2.3-UPDATE.md`、`dsh/docs/compat/**`、manual 的历史标签、`.openfeel/plan|log|flow-archive|dev/current_archive` 等历史记录。除白名单外命中必须为 0。

---

## 5. README 重构（用户新增 R1/R2/R3）

### 5.1 R1：版本章节迁出（N7：单一 VERSIONS 文件）

**新文件**：`docs/VERSIONS.md`（**只建一个**，中文主文件）

- 顶部：`# 版本能力概览` + 分工声明 + **English highlights**（3~5 条英文短段落，覆盖最新 v1.3.0 与链接，供英文读者快速了解）。
- 版本条目（**v1.3.0 → v1.2.4 → v1.2.3 → v1.2.2 → v1.2.1 → v1.2.0 → v1.1.2**，最新在上）：
  - 每条：主题一句 + 3~6 条能力 bullet + 升级提示 + `详见 [CHANGELOG](CHANGELOG.md#...)`。
  - **不写**：测试计数、REV/BUG 编号、文件级改动、阶段 ID（这些留在 CHANGELOG）。
- **分工声明**（写入 VERSIONS 顶部与 CHANGELOG 顶部各一句）：
  - VERSIONS = 面向用户的版本能力概览（是什么、能做什么、如何升级）；
  - CHANGELOG = Keep a Changelog 明细（逐版本 Added/Changed/Fixed、技术细节）；
  - 两者不重复：VERSIONS 每版只放用户视角摘要，细节链接 CHANGELOG。

**README 迁移**：

- `README.md`：删除 `## v1.2.4 新增能力（补丁）` 至 `## v1.2.0 新增能力`（当前 `:51-109`）全部版本章节。
- `README.zh-CN.md`：删除 `## v1.2.4 新增能力（补丁）` 至 `## v1.1.2 新增能力`（当前 `:83-151`）。
- `README.en.md`：删除 `## What's New in v1.2.4 (Patch)` 至 `## What's New in v1.1.2`（当前 `:83-151`）。
- 三份 README 顶部（nav 行之后）统一加一行：
  - 中文：`> 📚 版本能力概览：[docs/VERSIONS.md](docs/VERSIONS.md) ｜ 逐版本明细：[CHANGELOG.md](CHANGELOG.md)`
  - 英文：`> 📚 Version capability overview (Chinese with English highlights): [docs/VERSIONS.md](docs/VERSIONS.md) | Per-version details: [CHANGELOG.md](CHANGELOG.md)`
- `docs/index.md` 只登记一项：`VERSIONS.md`（另列 `../CHANGELOG.md` 链接，不作为 docs 文件）。

### 5.2 R2：DSH 适配器说明（三语 README，N6/N11）

在三份 README 的 Claude Code 适配器节之后新增「DSH 适配器（v1.3.0 起）」：

```text
npm i -g openfeel@latest          # 1. 安装/升级（单包，已含 dsh/）
openfeel setup --tools dsh        # 2. 部署到 DSH profile（默认全部 profile；可 --dsh-profile web）
# 3. 重启 DSH 宿主
```

必须说明：

- **单包**：不发布独立 `openfeel-dsh`；适配器随 `openfeel` 包分发，默认不部署。
- `setup --tools dsh` 会写入 `<DSH_HOME>/profiles/<name>/package.json`：
  - `dependencies["openfeel-dsh"] = "link:<openfeelRoot>/dsh"`；
  - `dsh.profile.bundles += "openfeel-dsh"`；
  - 在 profile 目录按需执行 `pnpm install`（依赖未变化且链接有效时跳过）。
- 前提：DSH `0.2.0-rc.2`、Node ≥20.17、存在 DSH profile、全局 `openfeel` 可用。
- 升级：`npm i -g openfeel@latest` → 重启 DSH（link 指向同一路径，随包更新）。
- 开发态可用 `link:` 直接指向仓库 `dsh/`（见 [dsh/README.md](dsh/README.md)）。
- `openfeel update --tools dsh` 不适用（全局部署）。
- 链接到 `dsh/README.md` 与 `dsh/ADAPTER.md`；**外链用 GitHub 绝对 URL**（N11）。
- 三份 README 顶部「当前适配 harness」行加入 **DSH（`--tools dsh`，v1.3.0 起）**（N6）。

### 5.3 R3：推荐用法（三语 README，靠前位置，N10）

在「安装/快速开始」之后新增「推荐用法：需求驱动 + 快速迭代（fast）」：

```bash
openfeel req add "接入 DSH 适配器" --workflow-mode fast   # 1. 发布需求
openfeel req claim REQ-NNN                                # 2. 认领
openfeel plan stage add vX.Y.Z-stage-NN --workflow-mode fast   # 3. 建 fast 阶段
openfeel req link --stage vX.Y.Z-stage-NN --requirement REQ-NNN # 4. 关联
openfeel flow next                                        # 5. 按调度迭代
```

- 说明：**默认推荐 fast**（日常迭代：计划审查 + 代码审查各单轮，跳过 scheme/test）；
- `full` 适合大改动/架构变更（完整六关）；
- `general` 适合无流水线的零散任务；
- 需求关联阶段后，全部阶段 done 自动收口需求；
- 明确写：**不要默认推荐 full**。
- 示例统一使用占位符 `REQ-NNN` / `vX.Y.Z-stage-NN`（不绑定具体版本）。

**替换**：把现有独立「快速迭代模式（v1.1.7 起）」节并入本节（保留模式细节但避免重复），或保留该节并在其后紧接推荐用法；执行时二选一，优先合并去重。

### 5.4 三语同步与验收（N7）

- 三份 README 的**章节顺序**一致：标题 → nav → 版本/索引行 → 简介 → 安装 → 推荐用法 → 快速开始 → Claude 适配器 → DSH 适配器 → 命令参考 → 核心概念 → 架构 → 开发 → 许可。
- 新测试 `test/core/docs-structure.test.ts`：
  - 三份 README 均含 `docs/VERSIONS.md` 与 `CHANGELOG.md` 链接；
  - 三份 README 均含推荐用法标题 + `req add` + `fast` 字样；
  - 三份 README 均含 `setup --tools dsh` 且链接 `dsh/README.md`；
  - 三份 README **不含** `## v1.2.4 新增能力` / `## What's New in v1.2.4` 标题；
  - `docs/VERSIONS.md` 存在且含 `v1.3.0`；`CHANGELOG.md` 含 `## [1.3.0]`；
  - `docs/index.md` 登记 `VERSIONS.md`；**不**存在 `docs/VERSIONS.en.md`（防回退）。
- README 测试计数/版本横幅在**最终收口**统一更新（三份一致；以实测计数为准）。

---

## 6. 测试与门禁

### 6.1 新增/扩展测试用例

**`test/core/dsh-profile.test.ts`（隔离 HOME + 临时 DSH_HOME + mock `node:child_process`）**

1. `resolveDshHome`：`DSH_HOME` 优先（相对路径 resolve）；未设 → `<mockHome>/.dsh`。
2. `listDshProfiles`：只收目录且含 `package.json`；空/缺失 → 对应错误码。
3. `selectDshProfiles`：缺省全部；`--dsh-profile web` 精确；未知 → `DSH_PROFILE_UNKNOWN`。
4. `buildDshProfileMerge`：新增 dependency + bundle；保留其它字段；`changes` 正确；二次调用 `changed=false`；重复 bundle 去重。
5. 非法 JSON → `DSH_PROFILE_INVALID_JSON`，文件字节不变。
6. 无 `dsh` 对象 → `DSH_PROFILE_NOT_DSH`，零写。
7. `dependencies`/`bundles` 类型错误 → `DSH_PROFILE_INVALID_SHAPE`，零写。
8. `getDshAdapterDir`：`dsh/package.json` 缺失/name 不符 → `DSH_ADAPTER_MISSING`。
9. `link:` spec 使用正斜杠；含空格路径不抛。
10. **锁序/幂等（B1/N2/N12）**：
    - unchanged + link 有效 → 无备份文件、无锁/无 pnpm 预检、无 install；
    - changed → 锁外备份 + 锁内重读/写；install 失败 → 回滚到**锁内重读原文**；
    - 锁内重读发现已被外部改为最新 → 跳过写（备份可多余）。
11. **错误映射（B2）**：`dshErrorToCli` 输出 `INVALID_ARGUMENT`/1（8 个 reason）与 `INTERNAL_ERROR`/3（2 个 reason）；`CLI_ERROR_CODES` 仍 13 项。
12. **多 profile fail-fast（N1）**：全部成功；第二个失败 → 第一个保持、后续不处理、`detail.completed` 可诊断。
13. **备份失败（N4）**：`backupFileBeforeWrite` 抛 BackupError → 该 profile 零写盘、映射 `INTERNAL_ERROR`/3。
14. **pnpm 延迟预检（N2）**：unchanged + link 有效 + pnpm 缺失 → 成功 skipped；changed + pnpm 缺失 → `INVALID_ARGUMENT`/1 零写；`setup --tools opencode`（无 dsh）不预检 pnpm、不失败。
15. **全局状态（N3/REV-003）**：纯 dsh 不改 `update_state.json`（不存在或字节不变）；`opencode,dsh` 刷新 `openfeel_version`；`update_state.json.files` 不含 profile `package.json`。
16. **零副作用（N4）**：所有路径在临时目录；断言未写入真实 `~/.dsh`。

**`test/commands/setup.test.ts`（扩展）**

1. `setup --tools dsh` + 临时 DSH_HOME/profile → exit 0；`dependencies["openfeel-dsh"]` 与 `bundles` 正确；pnpm 被调用（mock）。
2. `--dsh-profile web` 只改 web；多 profile 未指定时 TTY 提示（mock `process.stdout.isTTY`）。
3. 无 profile → exit 1，零写盘。
4. 非法 JSON → exit 1，零写盘。
5. `setup --tools opencode,dsh`：dsh 预检失败 → opencode 也未部署（零写盘）。
6. 默认 `setup`（不含 dsh）不触碰 DSH_HOME。
7. `--check` 早退仍成立（不写 profile）。
8. JSON 模式：dsh 预检错误 → envelope `INVALID_ARGUMENT`/refusal/1，`detail.reason` 正确；备份/安装错误 → `INTERNAL_ERROR`/internal/3。

**`test/commands/update.test.ts`（扩展）**

1. `update <path> --tools dsh` → exit 1，不 auto-init、不写盘。
2. 非法值提示的 valid 列表不含 dsh。

**`test/core/update.test.ts`（扩展）**

1. `supportedTools` 含 `dsh`、`enabled=false`、`projectDeployable=false`。
2. 既有 opencode/claude 断言不变。

**`test/core/release-metadata.test.ts`（扩展）**

1. 根 `files` 含 `dsh/lib`、`dsh/cordis.patch.yml`、`dsh/package.json`、`dsh/README.md`、`dsh/ADAPTER.md`、`dsh/docs`。
2. `dsh/package.json` version === 根 version；`requiresCli === '>=' + 根 version`；`private === true`。

**`test/core/docs-structure.test.ts`（新增）**：见 §5.4。

### 6.2 全量门禁（执行阶段必跑，顺序固定）

```powershell
npm run build
npm run build                     # 幂等：生成物无 diff
npx tsc --noEmit                  # 0
npm test                          # 全绿；记录文件/用例数
node bin/openfeel.js lint i18n    # 0；记录键数
node bin/openfeel.js lint kb      # 0 过期；记录引用数
node bin/openfeel.js --version    # 1.3.0
npm pack --dry-run --json         # 断言 dsh 文件在包内
node bin/openfeel.js setup --tools dsh --help   # 选项存在
```

`npm pack` 断言（脚本或人工）：

- 包内必须含：`dsh/lib/index.js`、`dsh/lib/adapters/cli.js`、`dsh/lib/adapters/workspace.js`、`dsh/lib/adapters/dashboard.js`、`dsh/lib/tools/index.js`、`dsh/lib/tools/shared.js`、`dsh/lib/surface/{command,prompt}.js`、`dsh/cordis.patch.yml`、`dsh/package.json`、`dsh/README.md`、`dsh/ADAPTER.md`、`dsh/docs/**`。
- 包内**不**含：`dsh/test/**`（除非有意）。

**CI（N8）**：`.github/workflows/ci.yml` 的 `build-and-test` job 增加一步（放在 Test 之前或之后均可）：

```yaml
      - name: Adapter syntax check
        run: find dsh/lib -name '*.js' -print0 | xargs -0 -n1 node --check
```

### 6.3 隔离与零副作用

- 所有新增测试 mock `node:os.homedir`（沿用 `test/core/setup.test.ts` 模式）并设置临时 `DSH_HOME`；`afterEach` 清理。
- **真实 `~/.dsh` 零副作用**：测试前后断言临时目录外无新文件；执行阶段手动跑 `setup --tools dsh` 时只允许在显式 `--dsh-profile`/临时 `DSH_HOME` 下验证。
- 跑 `git status --porcelain` 前后核对：仅预期文件变化（含 dsh 未提交改动、docs、tests、build 生成物）。

### 6.4 适配器测试（§3.11）

- `cd dsh`：
  ```powershell
  node test/contract.js
  node test/verify.js       # 含新增 pushPositional ≥4 条断言
  node test/integration.js
  ```
- `find dsh/lib -name '*.js' -print0 | xargs -0 -n1 node --check`（本地与 CI 同命令）。
- 预期 contract 42 / verify 66+ / integration 10 全绿（以实际为准；asar 提取缺失时按既有跳过逻辑说明）。

---

## 7. 发布步骤与回滚

### 7.1 提交与阶段收口

1. 执行 `op`（fast 模式可把 §3 拆为多个执行单元；`plan scheme` 可省略）。
2. 完成 §6 全部门禁，回填 §4.5 计数与 §5 文档。
3. `git add` 预期文件（**包含 9 个未提交 dsh 改动 + §3.11 修复**；**不**纳入无关工作区文件）；提交（建议 2 个 commit：`feat: setup --tools dsh + 单包分发 + 适配器 pushPositional 修复` / `docs: README 重构 + 1.3.0 收口`，或 1 个合并提交）。
4. 阶段归档：`openfeel archive <stage>` 生成摘要（注意 `ARCHIVE_EXISTS`；如需覆盖显式 `--force`），Feel 推进 `archiving → done`。
5. 版本归档：`openfeel flow archive v1.3.0`（判据：全部阶段 done + 无 blocking REV），再提交归档产物。

### 7.2 push 与 CI 发布

```powershell
git push origin master
# CI: build-and-test（含适配器 node --check）→ publish job 比对 version(1.3.0) vs npm latest(1.2.4) → npm publish
npm view openfeel version                 # 期望 1.3.0
npm i -g openfeel@1.3.0                   # 隔离环境 smoke
openfeel --version                        # 1.3.0
```

- publish job 已有 token secret `OPENFEEL_AUTO_NPM`；单一包复用，无需改 CI。
- 发布后验证 tarball 含 `dsh/`（本地 `npm pack` 已断言；可下载 dist.tarball 复核）。
- **不**触发 `openfeel-dsh` 发布（不存在该包）。

### 7.3 回滚

- **代码/文档**：`git revert` 本次提交；重新发 `1.3.1`（前向修复优先）。
- **npm**：仅在灾难场景且发布 72h 内考虑 `npm unpublish openfeel@1.3.0 --force`；否则发布 1.3.1 覆盖 `latest`。
- **DSH profile**：`setup --tools dsh` 写前备份在 `~/.openfeel/backup/`；可用备份恢复 profile `package.json`，或手动移除 `dependencies["openfeel-dsh"]` + `bundles` 条目后 `pnpm install`。
- **适配器**：link 指向全局包；回退 CLI 版本并重启 DSH 即回退适配器（含 `pushPositional` 修复）。

---

## 8. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| DSH 官方建议“不手改 profile / 不手跑 pnpm” | 安装器绕过 DSH 管理路径 | 明确 `setup --tools dsh` 是用户显式安装动作（类比 `~/.claude` 部署）；文档同时给 `plugin_manager install_bundle <path>\dsh` 替代；写前备份 |
| Windows 符号链接权限 | pnpm `link:` 失败 | 失败提示回落 `file:` 或 `plugin_manager`；错误信息给手动命令 |
| DSH 进程 PATH 缺少 npm 全局 bin | 适配器找不到 `openfeel` CLI | README/`dsh/README.md` 记录 `command` 绝对路径配置；`setup` 输出提示 `openfeel --version` 验证 |
| 多 profile 默认全写 | 用户只想改 web | `--dsh-profile` 窄化；TTY 提示；输出逐 profile 报告；备份可恢复 |
| profile `package.json` 重排格式 | 用户 diff 噪音 | 统一 2 空格 + 尾换行；输出标记 `updated`；测试断言语义字段 |
| 锁序回归（备份/update-infos 锁嵌套） | 死锁风险 | §2.4 固定锁序；测试断言 unchanged 路径无备份、备份失败零写 |
| 错误码误入契约 | JSON 契约 13 码漂移 | §2.9 映射表；测试断言 `CLI_ERROR_CODES` 仍 13 项 |
| 版本载体遗漏 | 版本不一致 | §4.1 清单 + **限定范围**残留扫描（N9）+ `release-metadata` 测试 |
| 生成物手改 | build 覆盖/漂移 | 只改 `templates-data`/skills 源，`npm run build` 重生成；build ×2 幂等 |
| i18n 键双语不对称 | `lint i18n` 失败 | 同一提交内 zh/en 成对新增；门禁强制 |
| README 重构链接失效/信息丢失 | 用户文档回归 | §5.4 文档结构测试 + docs/index 登记 + 人工核对；VERSIONS 保留全部历史版本 |
| 适配器空参 bug 漏修 | `feel_op create` 等 6 处失败 | §3.11 6 处替换 + ≥4 真实 CLI 断言 + 适配器三套测试 + CI `node --check` |
| pnpm install 网络/超时 | 部署失败 | 180s 超时；失败回滚 + 手动命令；零依赖包降低风险 |
| `--check` 语义被扩展 | 既有用户预期变化 | 明确非目标：`--check` 不检测 DSH；仅在 dsh 部署分支生效 |
| 单包版本节奏绑死 | 小适配器修复也要发 CLI | 接受该取舍（用户决策）；适配器改动仍可先随 CLI 补丁版发布 |

---

## 9. DoD 验收清单

- [ ] `openfeel setup --tools dsh`（隔离 HOME + 临时 DSH_HOME）成功：profile `package.json` 写入 `link:<root>/dsh` + `bundles`，按需 `pnpm install`；二次运行全 skipped（无备份/无 pnpm 预检/无 install）；**真实 `~/.dsh` 零副作用**。
- [ ] `--dsh-profile web` 只改指定 profile；多 profile 未指定时 TTY 提示一次；未知 profile → exit 1 零写盘。
- [ ] 非法 JSON / 非 DSH profile / 结构非法 → exit 1 零写盘（`INVALID_ARGUMENT` + `detail.reason`）。
- [ ] 无 DSH profile / 适配器缺失 → exit 1 零写盘（含 opencode 组合场景）。
- [ ] **pnpm 延迟预检**：unchanged + link 有效 + 无 pnpm → 成功 skipped；changed + 无 pnpm → exit 1 零写；`setup --tools opencode` 不预检 pnpm。
- [ ] **备份失败** → 该 profile 零写盘，`INTERNAL_ERROR`/exit 3 + `detail.reason=dsh-backup-failed`。
- [ ] **install 失败** → profile `package.json` 回滚到锁内重读原文，`INTERNAL_ERROR`/exit 3 + `detail.reason=dsh-pnpm-install-failed`，错误含手动命令。
- [ ] **update_state（REV-003/N3）**：`update_state.json.files` 不含 profile `package.json`；纯 dsh 不改 `openfeel_version`/全局 state；`opencode,dsh` 正常刷新。
- [ ] `openfeel update --tools dsh` → exit 1，不 auto-init、零写盘。
- [ ] **JSON 契约**：`CLI_ERROR_CODES` 仍 13 项；`docs/json-contract.md` 无新增错误码/出口；dsh 错误 envelope 使用 `INVALID_ARGUMENT`/`INTERNAL_ERROR`。
- [ ] **适配器修复（§3.11）**：6 处 `pushPositional` 替换；`feel_op create` 不再报 `too many arguments`；`dsh/test/verify.js` ≥4 条真实 CLI 断言通过；三套适配器测试全绿；CI `node --check` 通过。
- [ ] `npm pack --dry-run` 包含全部 dsh 运行文件 + `dsh/ADAPTER.md`，且不含 `dsh/test/**`（除有意）。
- [ ] `npm run build` ×2 幂等；`npx tsc --noEmit` 0；`npm test` 全绿；`lint i18n` 0；`lint kb` 0 过期；`--version` = 1.3.0。
- [ ] A 类 9 文件 / 12 处全部更新；**限定范围**残留扫描仅白名单命中（N9）。
- [ ] README×3：版本章节已迁出、顶部索引行、推荐用法（`req add` + fast + 占位符）、DSH 安装节、harness 行含 DSH、测试计数更新。
- [ ] `docs/VERSIONS.md`（唯一，中文 + English highlights）存在并含 v1.3.0；`CHANGELOG [1.3.0]` 存在；`docs/index.md` 只登记 `VERSIONS.md`；不存在 `VERSIONS.en.md`。
- [ ] `docs/commands.md` / `GETTING_STARTED.md` / manual（含新增 `core/dsh-profile.md`）/ cli-usage skill 同步；`dsh/README.md`、`dsh/ADAPTER.md` 外链为绝对 URL。
- [ ] 9 个 dsh 未提交改动 + §3.11 修复纳入提交；`openfeel-dsh` **未**发布 npm。
- [ ] push master 后 CI（含适配器语法检查）发布 1.3.0；`npm view openfeel version` = 1.3.0；隔离环境 `npm i -g openfeel@1.3.0 && openfeel --version` 通过。
- [ ] 阶段/版本归档完成，`flow.json` 无残留活跃阶段。

---

## 10. 执行顺序建议（fast）

1. **op-001 核心**：`dsh-profile.ts` + `update.ts` + `setup.ts` + `commands/setup.ts` + `commands/update.ts` + i18n。
2. **op-002 适配器修复**：`dsh/lib/tools/shared.js` 新增 `pushPositional` + `dsh/lib/tools/index.js` 6 处替换 + `dsh/test/verify.js` ≥4 断言；跑适配器三套测试。
3. **op-003 测试**：`dsh-profile.test.ts` + 命令层扩展 + `release-metadata` 扩展 + docs 结构测试；跑定向测试。
4. **op-004 文档**：README×3 + `docs/VERSIONS.md` + CHANGELOG + docs/commands + GETTING_STARTED + docs/index + manual + skill 源 + dsh 文档 + CI 语法检查。
5. **op-005 版本收口**：A 类载体 + `npm run build` ×2 + 全量门禁 + 计数回填 + 残留扫描。
6. **op-006 归档发布**：提交、阶段归档、版本归档、push、发布验证。

> fast 模式无 scheme/test 相位；上述 op 可作为执行任务拆分，也可直接按 §3~§7 顺序执行。计划审查单轮后进入 `exec_running`。

---

## 11. 修订记录（plan review 第 1 轮）

| # | 来源 | 处置 | 落点 |
|---|---|---|---|
| B1 | REV-001 锁序 | **已改**：`backupFileBeforeWrite` / `appendUpdateInfo` / `notifyBackupIfTTY` 全部移到锁外；锁内**重新读取** → 合并 → 按需 pnpm 预检 → 仅 changed 写；锁内重读原文作为回滚基准（N12）；释放锁后 install。 | §2.4 |
| B2 | REV-002 错误码 | **已改**：不新增 `CliErrorCode`；预检/用法/profile → `INVALID_ARGUMENT`/1（8 个 `detail.reason`）；备份/install → `INTERNAL_ERROR`/3（2 个 reason）；内部 `DshProfileError.code` 保留但映射后不进入 envelope。 | §2.9、§6.1.11、§9 |
| B3 | REV-003 update_state | **已改**：DSH 结果只放 `SetupResult.dsh`，不 push 到 created/updated/skipped；hash 循环自然不含 profile；补 `update_state.json.files` 断言。 | §2.7、§3.3、§3.4、§6.1.15 |
| N1 | 多 profile | **已并入**：预检全部选中；写阶段 fail-fast，已完成保持并记 `detail.completed`；TTY 多 profile 提示一次；测试 12 改为 fail-fast 语义。 | §2.2、§2.4.7、§6.1.12、§3.6 |
| N2 | pnpm 延迟预检 | **已并入**：仅在 `changed \|\| link 无效` 时预检；幂等重跑不因缺 pnpm 失败；锁内写前检查；测试覆盖。 | §2.4.3、§2.5、§6.1.14 |
| N3 | dsh-only 不刷新全局部署版本 | **已并入**：仅 `tools` 含 opencode/claude 时刷新 `openfeel_version` 并 save；纯 dsh 整段跳过；测试覆盖。 | §2.7、§3.3、§6.1.15 |
| N4 | 补测试 | **已并入**：备份失败零写；无 dsh 不预检 pnpm；真实 `~/.dsh` 零副作用。 | §6.1.13/14/16、§6.3 |
| N5 | files 加 ADAPTER.md | **已并入**：根 `files` 增加 `dsh/ADAPTER.md`；pack 断言与 release-metadata 测试同步。 | §3.7、§6.1、§6.2、§9 |
| N6 | README harness 行 | **已并入**：三份 README 顶部「当前适配 harness」加入 DSH。 | §5.2 |
| N7 | 单一 VERSIONS 文件 | **已改**：只建 `docs/VERSIONS.md`（中文主文件 + 顶部 English highlights）；README×3 均链它（英文标注中文）；`docs/index.md` 仅一项；docs 结构测试同步；删除 `VERSIONS.en.md` 计划。 | §5.1、§5.4、§4.4、§9 |
| N8 | CI 适配器语法检查 | **已并入**：build-and-test 增加 `find dsh/lib -name '*.js' -print0 \| xargs -0 -n1 node --check`。 | §3.8、§6.2、§7.2 |
| N9 | 残留扫描限定 | **已改**：仅扫 A 类载体 + 当前快照文档；历史 `docs/commands.md` / `json-contract.md` / `GETTING_STARTED` / `dsh/README` / manual 历史标签进白名单；不做全仓 grep 门禁。 | §4.5 |
| N10 | README 占位符 | **已并入**：示例统一 `REQ-NNN` / `vX.Y.Z-stage-NN`。 | §5.3 |
| N11 | dsh 文档外链 | **已并入**：`dsh/README.md` / `ADAPTER.md` 的 `../docs/...` 相对链接改 GitHub 绝对 URL 或注明仓库内文档。 | §3.9、§5.2 |
| N12 | 回滚基准 | **已并入 B1**：锁内重读原文作为 install 失败回滚基准。 | §2.4.3/2.4.5 |
| NEW | 适配器 `pushOption('', value)` 空参 bug | **已并入**：新增 `pushPositional`；替换 6 处（L489/L524/L741/L1007/L1099/L1115）；`dsh/test/verify.js` ≥4 条真实 CLI 断言；纳入 1.3.0 与 `dsh/lib` 入包。 | §0、§1.1、§3.11、§6.4、§9、§10 |

**仍需用户/Feel 决策项：0**（保留 4 个默认决策：多 profile 全部、自动 pnpm、单一 VERSIONS 文件、dsh version 同步 1.3.0）。
