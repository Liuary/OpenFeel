# model 命令组（model）

> 模块文档，由归档官在归档时维护。对应源码：`src/commands/model.ts`。

## 职责

注册 `openfeel model` 命令组，提供三层级 agent 模型的命令行读写入口，接入 i18n 双语输出。

## 命令面

```
node bin/openfeel.js model set <agent> <model> [--scope default|global|project] [--build] [--force]
node bin/openfeel.js model get <agent> [--scope default|global|project]   # 无 --scope 展示生效值
node bin/openfeel.js model list [--scope default|global|project]          # 无 --scope 展示生效值
```

> ⚠️ 本仓执行一律用 `node bin/openfeel.js <cmd>`；全局 `openfeel` 可能命中旧版（如 1.1.1）。

- 默认 `--scope`：`project`（改动最小、最安全）。
- `set` 调用 `setAgentModel`；`get`/`list` 调用 `getAgentModel`/`listAgentModels`。

## 关键行为

- **非 TTY 守卫（REV-1504）**：`--scope default` 在非 TTY 下必须显式 `--force` 或 `--build`，否则拒绝退出 1。
- **default 层源码就位预判（REV-1703）**：`isFrameworkSourceReady()` 复用 core 层路径推导，不受 cwd 影响。
- **build 触发（REV-1604）**：default 写入后 `--build` 触发 `execSync('npm run build')`；未带 `--build` 仅提示 `needsBuild`。
- **遮蔽提示（REV-1701）**：get 时 project/global 被 default frontmatter 遮蔽时额外输出提示。
- **校验三段式错误**：provider 硬校验 + model-id 软校验 + 错误输出含「原因 + provider 列表 + 示例」。

## i18n 集成

help/错误文案走 `t()`（域 `help.model.*`、`model.*`）；`model.get.shadowed` 键为 stage-40 新增（i18n 键 490 键对称）。

## 变更历史

| 阶段 | 变更 |
|------|------|
| stage-40 | 初始创建。set/get/list + --scope + --build + --force + 非 TTY 守卫 + 遮蔽提示 |
