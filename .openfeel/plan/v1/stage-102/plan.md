# v1.3.1-stage-102 计划：修复 setup --tools dsh 的 frozen-lockfile 部署失败

## 1. 根因（实测）

`openfeel setup --tools dsh` 的 `runPnpmInstall()` 以 `env: { ...process.env, CI: '1' }` 执行：

```ts
spawnSync('pnpm', ['install', '--prefer-offline'], { cwd, env: { ...process.env, CI: '1' } })
```

pnpm 在 `CI=1` 且存在 lockfile 时默认启用 `--frozen-lockfile`。当 profile 的 `package.json` 中 `openfeel-dsh` 的 `link:` 目标发生变化（例如从旧的 `OpenFeel-DSH/plugin` 切到 `<global>/openfeel/dsh`），lockfile 的 specifier 与 manifest 不一致，安装立即以 `ERR_PNPM_OUTDATED_LOCKFILE` 失败；命令层回滚 profile `package.json`，部署无法完成。

本次本机升级即复现：web profile lockfile 指向旧 junction，desktop 指向仓库路径；`setup --tools dsh` 两次失败，手动 `pnpm add` 修复 lockfile 后才走通。

## 2. 修复

`src/core/dsh-profile.ts` 的 `runPnpmInstall()`：

```ts
spawnSync('pnpm', ['install', '--prefer-offline', '--no-frozen-lockfile'], { ... })
```

- `--no-frozen-lockfile` 允许 pnpm 更新 profile lockfile，覆盖 `CI=1` 的默认 frozen 行为。
- 不改变 `--prefer-offline`、超时（180s）、`CI=1` 非交互、失败回滚、stdout/stderr 截断与错误映射。
- 不改变 `resolvePnpmCommand` 预检（`pnpm --version`）。

## 3. 测试

1. `test/core/dsh-profile.test.ts`：在 install 调用用例中断言 `spawnSync` 的 `argv` 为 `['install', '--prefer-offline', '--no-frozen-lockfile']`（或至少包含 `--no-frozen-lockfile`），并覆盖失败回滚仍成立。
2. 既有「install 失败回滚」「幂等跳过」「多 profile fail-fast」用例保持通过。
3. 命令层 `test/commands/setup.test.ts` 的 install 失败用例保持通过（mock 依据队列）。

## 4. 版本 1.3.1 收口

A 类载体（与 1.3.0 同清单）：
- `package.json` / `package-lock.json`（2 处）
- `.openfeel/config.yaml`
- `src/core/config.ts`（2 个模板）
- `src/core/templates-data/agents-md/{zh-CN,en}.md`
- `src/core/templates-data/claude/constraint/{zh-CN,en}.md`
- `dsh/package.json`（version + `requiresCli: ">=1.3.1"`）

B 类：`npm run build` 重生成 `template-loader.ts` / `update.ts`（禁手改）。
C 类：`CHANGELOG.md` 新增 `## [1.3.1] - 2026-10-17`（Fixed：frozen-lockfile）。
D 类：README×3 版本横幅、`docs/GETTING_STARTED.md` / `docs/commands.md` 快照、`docs/VERSIONS.md` 新增 1.3.1 条目、manual 相关记录、cli-usage skill 快照 → build。
E 类：测试计数、i18n 计数不变；残留扫描仅 A 类载体 + 当前快照。

## 5. 门禁与发布

```powershell
npm run build   # ×2 幂等
npx tsc --noEmit
$env:NO_COLOR=''; npm test
node bin/openfeel.js lint i18n
node bin/openfeel.js lint kb
node bin/openfeel.js --version   # 1.3.1
npm pack --dry-run --json        # dsh 文件仍在包内、无 dsh/test
node dsh/test/contract.js / verify.js / integration.js
```

- 提交：`fix(setup): pnpm install 加 --no-frozen-lockfile（v1.3.1）` + 版本/归档提交。
- push master → CI `build-and-test` → `publish`（1.3.1）。
- 发布后：`npm i -g openfeel@1.3.1` → 两个 profile 已指向全局 `dsh`，`setup --tools dsh` 应 skipped；重启 DSH 生效。

## 6. 验收

- [ ] `runPnpmInstall` 参数含 `--no-frozen-lockfile`；单测断言覆盖。
- [ ] 在 lockfile 过期的临时 profile 上 `setup --tools dsh` 成功（不依赖手动 `pnpm add`）。
- [ ] 全量测试全绿、tsc 0、lint 0、build 幂等、pack 断言通过。
- [ ] 1.3.1 发布；隔离环境 `openfeel --version` = 1.3.1。
- [ ] 阶段/版本归档，无活跃阶段。

## 7. 回滚

- `git revert` 1.3.1 提交；重新发 1.3.2；已部署 profile 无需回滚（link 仍指向全局 `openfeel/dsh`，包版本随全局升级）。
