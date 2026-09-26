# setup 命令（cli/setup）

> 模块文档，由归档官在归档时维护。对应源码：`src/commands/setup.ts`。

## 命令

```bash
openfeel setup [--lang <zh-CN|en>]
```

纯全局部署 OpenFeel 框架配置（全局 `AGENTS.md` + agent + skill + 全局 `opencode.jsonc`），**不建立项目 `.openfeel/`**，幂等可重跑。

## 选项

| 选项 | 说明 |
|------|------|
| `--lang <lang>` | Agent 提示词语言（`zh-CN` 或 `en`），默认 `zh-CN` |

## 行为

- 调用 `setupGlobalFramework(deployLang)`，输出创建的全局文件；末尾提示「请重启 opencode 以加载新的全局配置」。
- 与 `init` 的区别：`setup` 纯全局（跨项目框架层）；`init` 只做项目初始化（工作区 + 项目 `opencode.jsonc`）。

## 调用关系

```
src/commands/setup.ts（registerSetupCommand）
  └─ src/core/setup.ts（setupGlobalFramework）
```

## 变更历史

| 阶段 | 变更 |
|------|------|
| v1.1.1 | 初始创建：注册 `openfeel setup`（纯全局部署），在 `src/cli/index.ts` 中注册 |
