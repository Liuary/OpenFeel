# 会话标识（session）

> 模块文档，由归档官在归档时维护。对应源码：`src/core/session.ts`（**v1.2.1-stage-86 op-002 新建**）。

## 职责

为 **CLI 运行日志**（start / done 行的 `session=` 字段）与 **流水线审计**（跨会话恢复标注 `session_id` / `resumed`）提供**会话标识**——把「人工（交互会话）」与「自动化（单进程）」区分开，并使「本次 phase 转换是否跨会话恢复」**显式可判**（替代分析层「phase 段 >20min」启发式）。

**叶子模块**：不 import `runtime-log` / `flow-manager`（二者均为本模块**消费方**，防 import 环 R-86-7）；仅依赖 `node:fs` / `node:path` / `node:crypto`。

## 核心 API

| 导出 | 签名 | 用途 |
|------|------|------|
| `SessionSource` | `type` | `'env' \| 'project' \| 'proc'`（来源枚举） |
| `SessionIdentity` | `interface` | `{ id: string; source: SessionSource }`（`id` 含来源前缀） |
| `getSessionIdentity` | `(opts?: { env?, projectPath? }) => SessionIdentity` | 解析当前会话标识（三级链；按 `projectPath` memoized） |
| `getSessionId` | `(opts?) => string` | = `getSessionIdentity(opts).id`（含来源前缀） |
| `resetSessionCache` | `() => void` | 清空 memo（**测试用**——模块态隔离） |

- `opts.env` 缺省 = `process.env`；`opts.projectPath` 缺省 = `process.cwd()`（内部 `resolve` 归一后作 memo 键）。

## 三级链（优先级降序）

| 级 | 条件 | 结果 `id` | 副作用 |
|:--:|------|-----------|--------|
| 1 `env` | harness 环境变量**实测命中**（`SESSION_ENV_CANDIDATES`；值须非空且 `trim` 非空） | `env:<值>` | best-effort 写项目续接文件（失败静默） |
| 2 `project` | env 未命中且续接文件 `session_id` 非空 | `project:<值>` | 只读 |
| 3 `proc` | 前两级皆未命中 | `proc:<uuid 前 8 位>` | **不写文件** |

- **候选名准入纪律（R-86-3）**：`SESSION_ENV_CANDIDATES` **仅录入实机实测命中者**——未实测命中的名字**不入代码**（不臆造）。当前清单 = `['CLAUDE_CODE_SESSION_ID']`（Claude Code 侧实测存在、UUID 形；opencode 侧无实测环境 → 未录入）。
- **续接文件**：`<projectPath>/.openfeel/tmp/session.json`（`{session_id, source:'env', started_at}`，`JSON.stringify(..., null, 2) + '\n'`）；`tmp/` 处 `.gitignore` 忽略域；**文件缺失 / JSON 损坏 / 值非法 → 视为无续接**（回落下一级）。
- **来源值前缀**：`env:` / `project:` / `proc:` 供**机器可判**来源（人工 vs 自动化）——`proc:` 级为**单进程**语义，**不参与跨会话判定**。

## 设计边界

| 边界 | 说明 |
|------|------|
| **失败静默** | 全部 IO `try/catch`——本模块任何失败**不得中断 CLI**（best-effort） |
| **`proc` 不落盘** | 保持「单进程」语义，**防**把自动化进程固化成跨会话会话 |
| **禁止 TTL 猜测** | 无过期 / 无轮换逻辑；轮换仅由「**env 值变化**」驱动 |
| **memoized** | 按 `projectPath` 缓存（同进程稳定）；`resetSessionCache()` 清零 |
| **已知副作用（open）** | env 命中即向 `<cwd>/.openfeel/tmp/` 写入（**不校验 cwd 是否为 OpenFeel 项目**）——已在 REV-86-010 登记，守卫口径（存在 `.openfeel/` 方写）留后续版本定稿 |

## 消费方

- `src/core/runtime-log.ts`：`logCliStart` / `logCliDone` 经 `getSessionId()` 落 `[session=…]` 后缀。
- `src/core/flow-manager.ts`：`computeResumed` 经 `getSessionId({ projectPath })` 取当前会话，与回扫的历史条目 `detail.session_id` 比对 → 追加可选 `resumed`。

## 变更历史

| 阶段 | 变更 |
|------|------|
| v1.2.1-stage-86 | **新建**：三级链 `getSessionIdentity` / `getSessionId` / `resetSessionCache` + `SessionSource` / `SessionIdentity`；`SESSION_ENV_CANDIDATES`（仅实测命中准入）；续接文件 best-effort 写；`proc` 不写盘；memoized |
