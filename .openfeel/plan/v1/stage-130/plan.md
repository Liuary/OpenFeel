# v1.5.15-stage-130 计划（REQ-023 / fast 模式）

> 来源：CultivationOpenRealm 反馈残留 —— `feel_req claim` 仍需显式 `--owner`；其 `.openfeel/.info.json` 为 `{"user":"unknown"}`，而 `git config user.name` = `Liuary`。

## 一、根因（已实测）

- `src/core/workspace/identity.ts:46-76` `getUserName`：
  - `.info.json` 的 `user` 只要**非空**就直接返回（`:54-55`），**`"unknown"` 这个哨兵被当成有效用户名**；
  - 因此永远不会走到 `git config user.name` 回退。
- `src/commands/req.ts:402-412`：`getUserName` 返回 `unknown` → 报「无法解析当前用户名；请显式传入 --owner」。
- 实测：`getUserName('.../CultivationOpenRealm')` → `unknown`；同目录 `git config user.name` → `Liuary`。
- `ensureInfoJson`（`:107`）只在 init 调用、且只修 `lang`：已有的 `unknown` 用户不会自愈。

## 二、改法

1. `getUserName`：
   - 读取 `.info.json` 的 `user` 后 **trim**；空串或（大小写不敏感）`unknown` → **视为未解析**，继续走 `git config user.name`；
   - git 名称同样 trim，非空且不是 `unknown` 才返回；
   - 全部失败仍返回 `'unknown'`（现有契约不变，命令层继续用哨兵拒绝并提示 `--owner`）。
2. `ensureInfoJson`：
   - 文件已存在时，除 `lang` 外再检查 `user`：若为空/`unknown`，用修复后的 `getUserName` 重新解析；解析成功（非 `unknown`）则写回，否则保持原样（不写 `unknown` 覆盖）。
   - 新建路径不变（`getUserName` 修复后自然写对）。
3. 不改 claim 命令层逻辑（哨兵拒绝语义保留）；`config.ts` 的 `user.name` 自动填充因复用 `getUserName` 自动受益。

## 三、测试（`test/core/workspace/identity.test.ts`）

新增 `describe('getUserName')`（真实临时 git 仓库，git 不可用则跳过该组）：
- `.info.json` `user:"unknown"` + git user.name=`Liuary` → `Liuary`（**本 bug 的回归锚**）；
- `.info.json` `user:"Unknown"` / `"  unknown  "` → 同样回落；
- `.info.json` `user:"Alice"`（正常值）+ git=`Liuary` → `Alice`（正常值不被覆盖）；
- 无 `.info.json` + git=`Liuary` → `Liuary`；
- `.info.json` `user:"unknown"` + 无 git 仓库 → `'unknown'`。

`ensureInfoJson` 新增：已有 `unknown` + git 可用 → 文件被修成 `Liuary` 且 `lang` 保留；git 不可用 → 文件不被改写（仍 `unknown`）。

## 四、验收

1. `npx vitest run test/core/workspace/identity.test.ts` 全绿（含上述新用例）。
2. `npm test` 全绿（基线 2370 + 新增）。
3. 真实冒烟：在临时目录（`.info.json`=unknown + `git config user.name` 设定）用新 CLI 执行 `openfeel req claim REQ-001`，**不带 `--owner` 成功**；无 git 时仍报「请显式传入 --owner」。
4. `tsc --noEmit` / `lint i18n` / `build` 通过；版本收口时 1.5.15（待用户确认发布）。

## 五、风险

- 真实用户名恰为 `unknown` 的用户会被当作未解析（哨兵语义，可接受；显式 `--owner unknown` 仍可用）。
- 测试依赖 git 可执行文件：沿用仓库既有「git 不可用则跳过」的写法，不引入假绿。

> 计划审查：self-review（单文件小修 + 回归锚明确，未派独立 reviewer；代码审查将派独立 reviewer）。
