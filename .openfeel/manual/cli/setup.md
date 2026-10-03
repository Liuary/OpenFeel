# setup 命令（cli/setup）

> 模块文档，由归档官在归档时维护。对应源码：`src/commands/setup.ts`。

## 命令

```bash
node bin/openfeel.js setup [--lang <zh-CN|en>]
node bin/openfeel.js setup --check [--json]   # 只读诊断全局部署一致性（不部署）
```

> ⚠️ 本仓执行一律用 `node bin/openfeel.js <cmd>`；全局 `openfeel` 可能命中旧版（如 1.1.1）。

纯全局部署 OpenFeel 框架配置（全局 `AGENTS.md` + agent + skill + 全局平台适配器配置（`opencode.jsonc`，当前适配器）），**不建立项目 `.openfeel/`**，幂等可重跑。带 `--check` 时转为**只读诊断**，不执行部署。

## 选项

| 选项 | 说明 |
|------|------|
| `--lang <lang>` | Agent 提示词语言（`zh-CN` 或 `en`），默认 `zh-CN` |
| `--check` | **只读**诊断全局部署版本与 CLI 版本一致性；**零写盘**、不进入部署（前置短路） |
| `--json` | 配合 `--check`：输出单文档纯 JSON `{ schemaVersion: 1, status, cliVersion, deployedVersion }` |

## 行为

### 默认（部署）

- 调用 `setupGlobalFramework(deployLang)`，输出创建的全局文件；末尾提示「请重启当前 harness（opencode）以加载新的全局配置」。
- 与 `init` 的区别：`setup` 纯全局（跨项目框架层）；`init` 只做项目初始化（工作区 + 项目平台适配器配置文件 `opencode.jsonc`）。

### `--check`（主动诊断，v1.1.5）

- 复用 `checkGlobalDeployment()`（见 [全局部署一致性检测](../core/deployment-check.md)），四态**显式报告**并设置退出码：

| 状态 | 文本输出 | `--json` | 退出码 |
|------|----------|----------|:--:|
| `ok` | 已部署版本与 CLI 一致 | `status: 'ok'` | 0 |
| `mismatch` | 「已部署 {X} ≠ CLI {Y}，请运行 `openfeel setup` 并重启 harness」 | `status: 'mismatch'` | 1 |
| `missing` | 「未检测到全局部署，请运行 `openfeel setup`」 | `status: 'missing'` | 1 |
| `unknown` | 「全局部署状态无法判定（state 缺失或损坏）」 | `status: 'unknown'` | 1 |

- **零写盘**：`--check` 为真时在任何部署动作**之前** `return`（不触碰全局目录、不生成 `.bak`）。
- 退出码用 `process.exitCode`（非 `process.exit`）；`--check` 为假时行为与默认逐字不变。
- **被动提示 vs `--check`**：被动提示（任意命令运行时）仅 `mismatch`/`missing` 走 stderr、`unknown` 静默、不改退出码；`--check` 为显式命令，四态全报告。

## 调用关系

```
src/commands/setup.ts（registerSetupCommand）
  ├─（默认）src/core/setup.ts（setupGlobalFramework）
  └─（--check）src/core/deployment-check.ts（checkGlobalDeployment）
```

## 变更历史

| 阶段 | 变更 |
|------|------|
| v1.1.1 | 初始创建：注册 `openfeel setup`（纯全局部署），在 `src/cli/index.ts` 中注册 |
| v1.1.5 | 新增 `--check [--json]` 只读诊断（四态、零写盘、退出码 0/1）；接入 `checkGlobalDeployment`；无 `--check` 行为逐字不变 |
