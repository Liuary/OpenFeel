# 增量更新状态模块（update-state）

> 模块文档，由归档官在归档时维护。对应源码：`src/core/update-state.ts`。

## 职责

管理 `.openfeel/update_state.json` 的读写、SHA-256 hash 追踪和冲突标记状态，为 `openfeel update` 的增量更新 + 冲突检测机制提供基础。

## 核心 API

| 方法 | 功能 |
|------|------|
| `hashContent(content)` | 计算字符串的 SHA-256 hash（含 CRLF→LF 行尾归一化） |
| `getOpenfeelVersion()` | 获取工具自身版本号（从 package.json 读取） |
| `loadUpdateState(projectPath)` | 读取 update_state.json，Schema 校验失败返回 null |
| `saveUpdateState(projectPath, state)` | 持久化 update_state.json（缩进 JSON，末尾换行） |
| `createUpdateState(projectPath, files)` | 首次 update 时创建初始状态 |
| `updateFileHash(state, path, content)` | 原地更新文件 hash，status=clean |
| `markFileConflict(state, path)` | 原地标记文件 status=conflict |

## 数据结构

`update_state.json`（`.openfeel/` 下，纳入 `.gitignore`）：

```json
{
  "version": "1.0",
  "last_update": "2026-08-11T...",
  "openfeel_version": "1.0.6",
  "files": {
    ".opencode/agents/feel.md": { "hash": "abc123...", "status": "clean" },
    ".opencode/agents/reviewer.md": { "hash": "def456...", "status": "conflict" }
  }
}
```

- `version`：状态文件格式版本号（当前固定 "1.0"）
- `last_update`：最近一次 update 的 ISO 时间戳
- `openfeel_version`：写入时的工具版本号
- `files`：受管文件的 {相对路径 → {hash, status}} 映射
- `status` 枚举：`clean`（工具管理，无用户修改）| `conflict`（用户修改，拒绝覆盖）

## 降级策略

`loadUpdateState()` 在以下情况返回 null：
1. 文件不存在（首次 update）
2. Zod Schema 校验失败（版本升级后字段不兼容）
3. JSON 解析失败（文件损坏）

返回 null 时，调用方（`update.ts`）回退到"全量覆盖 + 重建 state"模式。

## 设计原则

- **hash 算法**：SHA-256（Node.js 内置 crypto），不引入新 npm 依赖
- **行尾归一化**：`hashContent()` 在计算前执行 CRLF → LF 转换，确保跨平台 hash 一致
- **Zod 校验**：读写入口均经过 Zod Schema 校验，非法数据在入口处拒绝
- **文件原子性**：writes 使用 `writeFileSync`（同步），确保与调用方的顺序一致性

## 调用关系

```
src/commands/update.ts （命令层）
  └─ src/core/update.ts （编排层）
       └─ src/core/update-state.ts （状态层）
            └─ .openfeel/update_state.json （数据层）
```

## 变更历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0.0-stage-32 | 2026-08-11 | 初始创建，含 hash 追踪 + 冲突标记 + Schema 校验 |
