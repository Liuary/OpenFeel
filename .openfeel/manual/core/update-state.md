# 增量更新状态模块（update-state）

> 模块文档，由归档官在归档时维护。对应源码：`src/core/update-state.ts`。

## 职责

管理 update_state.json 的读写、SHA-256 hash 追踪和冲突标记状态，为 `openfeel update` 的增量更新 + 冲突检测机制提供基础。**双 state 结构**（stage-37）：项目 `.openfeel/update_state.json`（项目资产）+ 全局 `~/.openfeel/update_state.json`（框架资产）。

## 核心 API

| 方法 | 功能 |
|------|------|
| `hashContent(content)` | 计算字符串的 SHA-256 hash（含 CRLF→LF 行尾归一化） |
| `getOpenfeelVersion()` | 获取工具自身版本号（从 package.json 读取） |
| `loadUpdateState(projectPath)` | 读取项目 update_state.json，Schema 校验失败返回 null |
| `saveUpdateState(projectPath, state)` | 持久化项目 update_state.json（原子写，不加锁） |
| `createUpdateState(projectPath, files)` | 首次 update 时创建初始项目 state |
| `loadGlobalUpdateState()` | 读取全局 `~/.openfeel/update_state.json`，复用 Schema，失败返 null |
| `saveGlobalUpdateState(state)` | 持久化全局 state（加锁 + 原子写） |
| `createGlobalUpdateState(files)` | 组装初始全局 state（不触碰文件系统） |
| `updateFileHash(state, path, content)` | 原地更新文件 hash，status=clean |
| `markFileConflict(state, path)` | 原地标记文件 status=conflict |
| `isLegacyFrameworkKey(key)` | 检测 key 是否为「旧框架 key」（`.opencode/` 或 `.opencode\` 前缀——即 **opencode 适配器**的 legacy 项目目录，兼容 Windows 反斜杠），供 migrate 拆分重键识别 |

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

`loadUpdateState()` / `loadGlobalUpdateState()` 在以下情况返回 null：
1. 文件不存在（首次 update）
2. Zod Schema 校验失败（版本升级后字段不兼容）
3. JSON 解析失败（文件损坏）

返回 null 时，调用方（`update.ts`）回退到"全量覆盖 + 重建 state"模式。**全局 state 首次降级须防全量覆盖**（见 kb/troubleshooting.md #update_state.json 降级风险排查）。

## 双 state 路由（stage-37）

| state | 路径 | key 形式 | 写入安全 |
|-------|------|----------|----------|
| 项目 state | `.openfeel/update_state.json` | 相对路径 | 原子写（单写者假设，不加锁） |
| 全局 state | `~/.openfeel/update_state.json` | 绝对路径 | 加锁（`globalLockPath('global-update-state')`）+ 原子写 |

调用方按 `isAbsolute(path)` 分流：绝对路径 → 全局 state，相对路径 → 项目 state。详见 kb/patterns.md #全局/项目双 state 路由模式。

## 设计原则

- **hash 算法**：SHA-256（Node.js 内置 crypto），不引入新 npm 依赖
- **行尾归一化**：`hashContent()` 在计算前执行 CRLF → LF 转换，确保跨平台 hash 一致
- **Zod 校验**：读写入口均经过 Zod Schema 校验，非法数据在入口处拒绝
- **文件原子性**：`saveUpdateState()` / `saveGlobalUpdateState()` 使用 `atomicWriteFileSync`（同目录 temp + fsync + rename），确保进程中断不产生半写文件；全局 state 额外加锁（跨项目共享、多写者），项目 state 不加锁（`openfeel update` 独占、单写者）。详见 `manual/core/fs.md`。

## 调用关系

```
src/commands/update.ts （命令层）
  └─ src/core/update.ts （编排层）
       └─ src/core/update-state.ts （状态层）
            ├─ .openfeel/update_state.json （项目数据层）
            └─ ~/.openfeel/update_state.json （全局数据层，经 global-paths.ts）
```

## 变更历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0.0-stage-32 | 2026-08-11 | 初始创建，含 hash 追踪 + 冲突标记 + Schema 校验 |
| v1.1.0-stage-37 | 2026-09-25 | 双 state：新增 `loadGlobalUpdateState` / `saveGlobalUpdateState` / `createGlobalUpdateState`（全局 `~/.openfeel/update_state.json`）；全局 state 加锁 + 原子写；全局资产 key 用绝对路径 |
| v1.1.0-stage-39 | 2026-09-25 | 新增 `isLegacyFrameworkKey`：识别旧项目 state 的 `.opencode/...` 旧框架 key，供 `openfeel migrate` 拆分重键（识别需移入全局 state 的框架条目）复用 |
