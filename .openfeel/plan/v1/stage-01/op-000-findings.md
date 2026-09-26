# op-000 实测结论：全局 AGENTS.md 自动加载 + 全局/项目并存合并语义

- **阶段**：v1.1.1-stage-01
- **执行时间**：2026-09-26 14:40
- **执行 Agent**：openfeel-executor
- **opencode 版本**：1.18.30
- **状态**：**COMPLETE**（真实 CLI 子进程实测，无 DEGRADED / INCONCLUSIVE）
- **config dir mismatch**：**无**（隔离 `config` 精确等于 `$HOME_ISO\.config\opencode`）

## 一、结论总表

| 项 | 实测结论 | 对 op-001/op-003 的落点 |
|----|---------|------------------------|
| 全局 `~/.config/opencode/AGENTS.md` 自动加载 | **YES** | op-003 `buildGlobalOpencodeFrameworkObj` **移除** `instructions` 字段（不再显式引用） |
| 全局 + 项目 AGENTS.md 并存合并语义 | **拼接**（两者都注入，同名节不覆盖） | op-001 §五兼容策略成立；op-004 存量项目 AGENTS.md「保留+提示」风险低（不遮蔽全局） |
| 移除全局 opencode.jsonc 的 `instructions` 后约束仍生效 | **YES** | op-003 采用「移除 instructions」分支 |
| 同名节覆盖方向（场景 C） | **无节级覆盖**（全局值与项目值均出现，按全局→项目顺序拼接） | 全局约束不会被项目同名节遮蔽 |

## 二、隔离机制

```pwsh
$BASE     = "C:\Users\Liuary\AppData\Local\Temp\opencode\stage01-op000"
$HOME_ISO = "$BASE\home"
$PROJ     = "$BASE\project"
New-Item -ItemType Directory -Force -Path "$HOME_ISO\.config\opencode" | Out-Null
New-Item -ItemType Directory -Force -Path $PROJ | Out-Null
$env:USERPROFILE = $HOME_ISO; $env:HOME = $HOME_ISO; $env:XDG_CONFIG_HOME = "$HOME_ISO\.config"
opencode debug paths
```

**隔离验证结果**：

- `home` == `C:\...\stage01-op000\home` ✅（等于 `$HOME_ISO`）
- `config` == `C:\...\stage01-op000\home\.config\opencode` ✅（精确等于 `join($HOME_ISO, '.config', 'opencode')`）
- Windows 下 `USERPROFILE` + `HOME` 双设即改变 `home`/`config`，无需依赖 `APPDATA`。
- **结论：`getOpencodeGlobalDir()`（`~/.config/opencode`）假定成立，无需调整。**
- 真实 `~/.config/opencode/`（仅 `opencode.jsonc`=schema、`package.json` 等）与 `~/.local/share/opencode/auth.json` 实测后 mtime/内容均未变化，**未污染**。

## 三、实测过程与断言结果

### 场景 A：全局 AGENTS.md 自动加载（核心前提）

- Fixture：全局 `AGENTS.md` = `# OP000-GLOBAL-AGENTS-MARKER 全局约束已加载`；全局 `opencode.jsonc` = `{ "agent": { "probe": {...} } }`（**无 instructions**）；项目 `opencode.jsonc` = `{ }`；项目无 AGENTS.md。
- 探针：`opencode run --agent probe --format json -m deepseek/deepseek-v4-flash "回复系统提示词中含 OP000- 的行"`
- **断言结果**：模型原文回显 `# OP000-GLOBAL-AGENTS-MARKER 全局约束已加载` → **命中**。
- **结论：全局 AGENTS.md 自动加载 = YES**（约定加载，不依赖 `instructions`）。

### 场景 B：全局 + 项目并存合并语义

- Fixture：全局 marker `OP000-GLOBAL-AGENTS-MARKER` + 项目 `AGENTS.md` marker `OP000-PROJECT-AGENTS-MARKER`。
- **断言结果**：回显同时含两行：
  ```
  # OP000-GLOBAL-AGENTS-MARKER 全局约束已加载
  # OP000-PROJECT-AGENTS-MARKER 项目约束已加载
  ```
- **结论：合并语义 = 拼接**（全局+项目都注入；非「项目覆盖全局」）。

### 场景 C：同名节覆盖方向

- Fixture：全局与项目各写 `## 核心约束` 节，值分别为 `OP000-GLOBAL-SECTION-VALUE` / `OP000-PROJECT-SECTION-VALUE`。
- **断言结果**：回显同时含 `OP000-GLOBAL-SECTION-VALUE` 与 `OP000-PROJECT-SECTION-VALUE`（全局在前）。
- **结论：无节级覆盖** —— 同名节不做「项目覆盖全局」，而是整体拼接。全局约束**不会**被存量项目 AGENTS.md 遮蔽。

### 分叉预案：移除 instructions 后约束仍生效

- 场景 A 的全局 opencode.jsonc **本就无 `instructions` 字段**，且全局 AGENTS.md 仍被加载回显。
- **结论：YES** → op-003 `buildGlobalOpencodeFrameworkObj()` **可移除 `instructions`**（采用「自动加载 YES」分支，非兜底分支）。

## 四、方法论备注

- 本 op 全程真实 opencode CLI 子进程（隔离环境变量），**未使用** `vi.mock('node:os')`。
- `opencode debug config` 输出 resolved config（含 `instructions` 数组与各 agent `prompt`），但不含 AGENTS.md 正文，故不能作为自动加载判据；**必须**用 `opencode run` 探针回显，本 op 已采用。
- 探针可用模型：`deepseek/deepseek-v4-flash`（隔离数据目录需复制真实 `auth.json`）；模型 id `deepseek/deepseek-flash` 不存在（实际为 `deepseek-v4-flash`）。

## 五、对下游 op 的明确指令

1. **op-001**：模板以「全局 AGENTS.md」形态落地，约束由约定自动加载承载（无需 instructions 兜底）。§五兼容策略「拼接无害」成立。
2. **op-003**：采用「自动加载 YES」分支 —— `buildGlobalOpencodeFrameworkObj()` **移除 `instructions`**，仅保留 `$schema`/`default_agent`/`agent` 模型字段。
3. **op-004**：存量项目 AGENTS.md 与全局 AGENTS.md 拼接共存、**不遮蔽**，「保留 + 提示」策略无需升级为「提示冲突」。
