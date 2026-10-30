# v1.3.4-stage-105 计划 — 修复分发链路断点（适配器透传 / setup --check 三态 / 部署标记）

- **阶段**：`v1.3.4-stage-105`（fast 模式补丁版本）
- **关联需求**：REQ-006
- **输入**：`OpenFeelHarness/docs/feedback/openfeel-1.3.3-retest.md`（1.3.3 复测：P0-2 半修、setup/check 死循环、「文件新但宿主旧」不可检测）
- **基线**：v1.3.3（HEAD `b7745d9`，已发布）；测试 78 文件 / 1998 用例；dsh 46+42+83+10=181
- **定位**：1.3.3 的修复已真实存在于产物，但**分发链路**有三处断点，用户仍无法闭环。本版只修这三处，绝不扩面。

## 一、问题与修法

### ① 适配器 `review_add` 未透传 `--stage`（P0-2 半修）

- **现状**：`dsh/lib/tools/index.js` `case 'review_add'` 只 `pushOption(argv, '--op', args.op)`；CLI 已支持 `--stage`（1.3.3），适配器却仍要求 `--op` → `feel_flow review_add --stage` 永远报「请提供 --op 或 --stage」。
- **修法**：`op` / `stage` 二选一校验（都缺 → `FeelError(kind: usage, code: FEEL_BAD_USAGE)`）；有 `op` 透传 `--op`，否则透传 `--stage`；`stage` 参数描述补充 `review_add`。同步 `dsh/README.md` / `ADAPTER.md`。
- **验收**：`feel_flow review_add --stage <id> --title x` 成功建 REV；`--op` 旧路径零回归；两者都缺 → usage 错误。

### ② `setup --check` 无法区分「文件旧」与「文件已新但宿主未重启」

- **现状**：`checkGlobalDeployment` 只比 `update_state.openfeel_version` 与 CLI 版本；适配器修复在宿主重启前不生效（host module 不热加载），用户只能看到「版本不一致 → 跑 setup → 仍不一致」。
- **修法**（新增第三态 `restart-required`）：
  1. `update_state.json` 增**可选** `adapters: { dsh: { version, hash, deployed_at } }`（Zod optional，旧文件零迁移）。
  2. `setup` 在 dsh 部署成功时写入 `adapters.dsh`（hash = 适配器 `lib/**/*.js` 的规范化 sha256）并刷新 `openfeel_version`。
  3. DSH 适配器 `apply()` 启动时把「本进程实际加载的适配器 hash + 版本 + 启动时间」写入 `~/.openfeel/adapter-host-dsh.json`（best-effort，失败静默）。
  4. `checkGlobalDeployment`：有 `adapters.dsh` 时——版本不一致 → `mismatch`；版本一致但宿主 marker 缺失或 hash 不一致 → `restart-required`；都一致 → `ok`。无 `adapters.dsh`（opencode/claude）维持版本比较。
  5. `setup --check` 人类文案与 `--json.status` 增 `restart-required`（exit 1，明确「请完全退出并重启宿主」，不再指引跑 setup）。
- **hash 一致性**：TS 侧 `src/core/adapter-hash.ts` 与适配器侧 `dsh/lib/adapters/host-state.js` 同算法（文件集 `lib/**/*.js`，相对路径 POSIX 排序，CRLF→LF，逐文件 sha256 后拼接再 sha256）；根仓测试 `test/core/adapter-hash.test.ts` 直接比较两侧对真实 `dsh/` 目录的输出，确保 parity。
- **验收**：
  - `setup --tools dsh` 后 `--check` 不再报「版本不一致」（state 已刷新）；
  - 模拟「宿主未重启」（marker hash = 旧值）→ `restart-required` + 重启文案；
  - 模拟重启后（marker hash = 新值）→ `ok` / exit 0；
  - `--json` 顶层键序不变、status 可取值扩展。

### ③ `setup` 在「已是最新 / 跳过」分支不刷新部署标记（P1-6）

- **现状**：`setupGlobalFramework` 仅 `opencode/claude` 时刷新 `openfeel_version`；纯 `--tools dsh` 即使成功部署也不写 state → check 永远 mismatch。
- **修法**：只要本次有任一部署面（opencode/claude/dsh）成功，就刷新 `last_update` / `openfeel_version`；dsh 额外写 `adapters.dsh`。`files` 哈希不受影响。
- **验收**：既有全局 state（旧 version）→ `setup --tools dsh` → state.version == CLI 版本；`--check` = ok 或 restart-required（取决于 marker）。

## 二、影响与边界

- 不改 CLI 相位机 / REV 语义 / 写入门禁；不动 1.3.3 已闭环行为。
- `update_state.json` Schema 仅**追加可选字段**；旧文件、旧测试 fixture 继续合法。
- hash 失败 / marker 读写失败 → 降级为现有版本比较（`ok`/`mismatch`），不抛、不阻塞。
- 不实现「review_passed 带整改项通过」新语义（复测报告列为可选，本版不做）。
- 版本号写入后若代码审查发现问题，允许一次修复后重跑门禁（登记偏差）。

## 三、涉及文件

- 适配器：`dsh/lib/tools/index.js`、`dsh/lib/index.js`、`dsh/lib/adapters/host-state.js`（新）、`dsh/test/verify.js`、`dsh/README.md`、`dsh/ADAPTER.md`
- CLI：`src/core/update-state.ts`、`src/core/global-paths.ts`、`src/core/adapter-hash.ts`（新）、`src/core/setup.ts`、`src/core/deployment-check.ts`、`src/commands/setup.ts`、i18n
- 测试：`test/core/update-state.test.ts`、`test/core/deployment-check.test.ts`、`test/core/setup.test.ts`、`test/commands/setup.test.ts`、`test/cli/json-contract.test.ts`、`test/core/adapter-hash.test.ts`（新）
- 收口：版本载体 + `CHANGELOG` + `docs/VERSIONS.md` + README×3 + `docs/commands.md` + `dsh/README.md` + `.openfeel/dev/current.md`

## 四、验收门禁

- `npm test` 全绿（0 failed / 0 skipped）；`tsc --noEmit` 0
- `node dsh/test/{guard,contract,verify,integration}.js` 全绿（断言数按新增更新）
- `npm run build` ×2 幂等；`lint i18n` / `lint kb` 0
- 三态专项：`mismatch` / `restart-required` / `ok` 三场景命令级断言（隔离 HOME）
- 真实链路：`node bin/openfeel.js setup --tools dsh`（隔离 DSH_HOME）→ `setup --check` 状态正确
- `--version` = 1.3.4；版本归档 v1.3.4；push 后 CI `publish` 成功、注册表 1.3.4

## 五、风险

| 风险 | 缓解 |
|---|---|
| TS/JS hash 算法漂移 | 双侧同算法 + 真实目录 parity 测试（`adapter-hash.test.ts`） |
| 新增 `restart-required` 破坏 check 消费者 | 只扩展 status 取值；JSON 键集/键序不变 |
| dsh-only setup 刷新 version 被旧语义依赖 | 旧「纯 dsh 不刷新」仅注释约定、无测试硬断言；更新 setup 测试 |
| 宿主 marker 写盘被沙箱拒绝 | best-effort try/catch，缺失按 `restart-required` 提示（可操作） |
