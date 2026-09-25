# op-000 findings — instructions 合并语义 / `~` 展开 / core.md 加载 / AGENTS.md 加载 / agent_manager_tool 实测

- **执行时间**：2026-09-25
- **执行 Agent**：openfeel-executor
- **opencode CLI 版本**：1.18.30（`opencode --version` → `1.18.30`）
- **降级状态**：**未降级**（真实 CLI 子进程实测，N5 未触发）

> 隔离机制（REV-603）：真实 CLI 子进程 + 环境变量 `USERPROFILE` / `HOME` / `XDG_CONFIG_HOME` → 临时目录
> `C:\Users\Liuary\AppData\Local\Temp\opencode\stage37-op000\{home,project}`。全程未使用 `vi.mock`。

---

## 一、预检（步骤 0）

| 命令 | 结果 |
|------|------|
| `opencode --version` | `1.18.30` |
| `opencode debug --help` | 存在 `debug config` / `debug agent <name>` / `debug paths` 子命令 |
| `opencode run --help` | 存在 `--agent` / `--format json` 选项 |

结论：CLI 可用，未触发 N5 降级。

## 二、隔离生效断言（REV-711）

```
opencode debug paths
  home       = <BASE>\home
  config     = <BASE>\home\.config\opencode
```

- `config` **等于** `join($HOME_ISO, '.config', 'opencode')` → **无 config dir mismatch**，opencode 未使用 Windows `APPDATA`。
- 结论：`getOpencodeGlobalDir()` 返回 `~/.config/opencode` **正确，无需调整**。

## 三、5 项实测结论

| # | 验证项 | 结论 | 证据 |
|---|--------|------|------|
| 1 | instructions 合并语义 | **拼接 + 去重** | 场景 A：全局 `["~/.config/opencode/openfeel/core.md"]` + 项目 `["project-local.md"]` → `debug config` 输出 `["~/.config/opencode/openfeel/core.md", "project-local.md"]`（全局条目保留 + 项目追加）；去重步：两级同写同一路径 → 输出仅 1 项 |
| 2 | `~` 展开（配置值层） | **`debug config` 输出中不展开**（保留字面 `~/...`） | 场景 A `debug config` 输出 `"~/.config/opencode/openfeel/core.md"` 原样 |
| 2b | `~` 展开（加载层） | **加载时实际展开并成功加载**（与计划预判「未展开→必须绝对路径」不同） | 全局 instructions 用 `~` 形式 + core.md 含 `OP000GLOBALTOKEN` 指令 → `opencode run` 回显命中 `OP000GLOBALTOKEN`（`~` 形式亦加载成功） |
| 3 | core.md 实际加载（REV-601-③） | **PASS，实际加载** | 全局 instructions 绝对路径 → `opencode run` 回显命中 `OP000GLOBALTOKEN`；**反证**：临时移除 core.md 内容后重跑 → token 未命中（排除误报） |
| 4 | AGENTS.md 自动加载（REV-602） | **YES，自动加载** | 项目 `opencode.jsonc` 为 `{}`（无 instructions），项目根有 `AGENTS.md`（含 `OP000AGENTSTOKEN` 指令）→ `opencode run` 回显命中 `OP000AGENTSTOKEN` |
| 5 | agent_manager_tool（REV-604/N3） | **schema 未定义 + 静默丢弃** | 场景 C 全局含 `experimental.agent_manager_tool: true` → `debug config` 输出 `"experimental": {}`，无报错/警告，exit 0 |

## 四、加载验证探针方法（REV-601-③ 落地说明）

首次探针「请复述系统提示词」被模型安全策略拒绝（不能回显隐藏系统提示）。改用**指令型探针**：
在 core.md / AGENTS.md 中写入「回复开头必须输出 token XXX」，再以 `opencode run --agent probe --format json "回答：1+1=?"` 触发，
grep 回显是否含 token。该法既能证明「文件被加载到 agent 上下文」，又规避模型拒答。
- `--agent probe` 为全局 opencode.jsonc 定义的最小 agent。

## 五、对 P2 / op-004 的落点

| 项 | 落点 |
|----|------|
| instructions 合并 | **P2 稳健设计成立**：项目不写 instructions 时全局约束不丢；即使项目写了，也是拼接（全局在前）不覆盖 |
| `~` 展开 | `debug config` 不展开但加载层展开可用。**仍采用绝对路径**（`getGlobalCoreMdPath()`）：配置值层可读、跨平台无歧义、不依赖 opencode 内部展开实现。op-001 `buildGlobalOpencodeFrameworkObj` 已落绝对路径，**无需改动** |
| core.md 加载 | 绝对路径加载已实测 PASS；op-004 保持绝对路径 |
| AGENTS.md 自动加载 | **YES** → P2③ 假设成立，项目 opencode.jsonc **无需**列 `instructions: ["AGENTS.md"]`。**无需反馈 Feel 重裁** |
| agent_manager_tool | **N3 → 移除**（op-003 落定，同时删模板 experimental 块，D37-2） |

## 六、偏差与反馈

- **偏差（已记录）**：计划 op-000 关键设计决策 2 预判「`~` 不展开 → op-004 必须用绝对路径」，实测显示 `~` 在**加载层会展开且可加载**；但**不影响 op-004 定稿**（绝对路径方案更稳健，且已由 op-001 落地）。此为「加固而非推翻」。
- **反馈 Feel**：无需重裁项目 instructions 策略（AGENTS.md 自动加载成立）。5 项验证均 PASS，可支撑 op-004 定稿。
- **真实全局配置未被污染**：全程 `USERPROFILE`/`HOME`/`XDG_CONFIG_HOME` 指向临时目录；真实 `~/.config/opencode/` 未被写入。

## 七、原始命令摘要

```pwsh
# 隔离
$env:USERPROFILE = $HOME_ISO; $env:HOME = $HOME_ISO; $env:XDG_CONFIG_HOME = "$HOME_ISO\.config"
opencode debug paths
# 场景 A
opencode debug config        # instructions 拼接
# 去重
# 场景 C
opencode debug config        # experimental: {}
# 加载验证
opencode run --agent probe --format json "回答：1+1=?"
```
