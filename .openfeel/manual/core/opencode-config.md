# 全局 opencode 配置合并模块（opencode-config）

> 模块文档，由归档官在归档时维护。对应源码：`src/core/opencode-config.ts`。

## 职责

提供框架级全局 opencode.jsonc 的内容对象、项目最小覆盖内容，以及 JSONC 解析 / 深度合并 / 序列化，供 init（首次写入）与 update（深度合并）共用。

## 核心 API

| 函数 | 功能 |
|------|------|
| `buildGlobalOpencodeFrameworkObj()` | 框架级全局 opencode.jsonc 内容对象：`$schema` + `default_agent: 'feel'` + `instructions: [getGlobalCoreMdPath()]`（绝对路径）+ `agent.{openfeel-vision,openfeel-reviewer}.model` 框架默认模型。**不写** `experimental.agent_manager_tool`（schema 未定义，见 kb/troubleshooting） |
| `buildProjectOpencodeJsoncObj()` | 项目 opencode.jsonc 最小覆盖：仅 `$schema`，不写 instructions/skills/default_agent（P2 稳健设计） |
| `parseJsonc(text)` | 剥离 `//` 行注释后 `JSON.parse`（状态机处理字符串/转义/注释三态；块注释会失败） |
| `deepMergeJsonc(base, overlay)` | 深度合并（overlay=框架覆盖 base=用户），五类字段规则 |
| `mergeGlobalOpencodeJsonc(raw)` | 组合：`parseJsonc` → `deepMergeJsonc(框架)` → `JSON.stringify` 序列化（注释不保留） |

## deepMergeJsonc 五类字段规则

| 字段 | 规则 |
|------|------|
| `instructions` | 数组拼接 + `Set` 去重，框架在前、用户在后，不覆盖 |
| `agent` | `mergeAgentDefaults`：仅增补缺失 agent（agent 级粒度），不重写既有 agent 内字段 |
| `skills` | 框架不写（全局 skill 自动发现），保留用户已有 |
| 纯对象（双方） | 递归 `deepMergeJsonc` |
| 标量 / 数组（非 instructions） | overlay 直接覆盖 |

> 结果以 `{ ...base }` 起步，用户未知字段 passthrough 保留。详见 kb/patterns.md #JSONC 深度合并模式。

## 变更历史

| 阶段 | 变更 |
|------|------|
| stage-37 | 初始创建；`parseJsonc` 从 update.ts 迁移至此（op-003 删本地副本改 import）；新增 `deepMergeJsonc` / `mergeGlobalOpencodeJsonc` / 双构建对象（REV-605「已存在不覆盖」语义 + REV-703 agent 级合并粒度） |
