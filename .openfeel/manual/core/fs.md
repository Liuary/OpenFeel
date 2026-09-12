# 并发保护工具模块（fs）

> 模块文档，由归档官在归档时维护。对应源码：`src/core/fs/atomic-write.ts` + `src/core/fs/file-lock.ts` + `src/core/fs/sequence.ts`。

## 职责

为多进程 / 多 Agent 并发写共享状态文件提供统一的**写入安全底座**，由三个零第三方依赖的小工具组成：

| 工具 | 文件 | 职责 |
|------|------|------|
| 原子写 | `atomic-write.ts` | 同目录唯一名 temp + fsync + rename，避免进程中断致文件半写 / 损坏 |
| 建议性文件锁 | `file-lock.ts` | `O_EXCL` 独占创建 + 指数退避 + 陈旧锁抢占 + token 归属校验，串行化跨进程「读-改-写」 |
| 序号原子化 | `sequence.ts` | `O_EXCL` 独占占号 + EEXIST 递增重试，消除 `max+1` 分配竞态 |

仅依赖 `node:fs` / `node:crypto` / `node:path` / `node:os`。

## 核心 API

### atomic-write.ts

| 方法 | 功能 |
|------|------|
| `atomicWriteFileSync(filePath, content, options?)` | 原子写文件：确保父目录 → 写同目录唯一名 temp（`.{basename}.{pid}.{rand}.tmp`）→ `fsyncSync` → `renameSync` 覆盖；失败清理 temp 后抛出。`options.backup:true` 时写前复制旧文件为 `{file}.bak`、写成功后不再覆盖 |
| `atomicWriteJson(filePath, obj, options?)` | 原子写 JSON（`JSON.stringify(obj, null, 2) + '\n'`） |
| `buildTempName(filePath)` | 构造同目录唯一 temp 名（导出供测试 / 诊断） |
| `AtomicWriteOptions` | `{ encoding?, fsync?, backup? }` |

### file-lock.ts

| 方法 / 常量 | 功能 |
|------|------|
| `withFileLock<T>(lockPath, fn, options?)` | 同步执行 fn，获取 / 释放建议性锁；`options` 含 `timeoutMs`（默认 5000）、`staleMs`（默认 3000）、`initialBackoffMs`（10）、`maxBackoffMs`（500） |
| `projectLockPath(projectPath, name)` | 项目级锁路径 `.openfeel/tmp/locks/{name}.lock` |
| `globalLockPath(name)` | 全局锁路径 `~/.openfeel/locks/{name}.lock` |
| `LOCK_TIMEOUT_MS_DEFAULT` / `LOCK_STALE_MS_DEFAULT` 等 | 默认常量集中定义 |

### sequence.ts

| 方法 / 常量 | 功能 |
|------|------|
| `reserveSequence({dir, candidate, parse, start?, maxAttempts?})` | 以 `O_EXCL` 独占创建空文件占号，返回 `{seq, fileName, path}`；`candidate` 生成候选名、`parse` 仅从文件名解析序号 |
| `nextSequence(dir, parse)` | 纯计算「最大已用序号 + 1」，仅作候选起点（非分配器） |
| `SEQUENCE_MAX_ATTEMPTS_DEFAULT` | 默认最大尝试次数 1000 |

## 设计要点

- **同目录 temp**：`rename` 仅同卷原子，temp 必须与目标同目录；跨卷 rename 会退化为「复制 + 删除」。
- **内容零改写**：原子写不归一化行尾、不增删字符，`content` 原样落盘。
- **`.bak` 语义（S5）**：`backup:true` 写前复制旧文件、写成功后不触碰，使 `.bak` 始终保留「上一个已落盘版本」。
- **锁为建议性（advisory）**：非强制锁；陈旧锁用**原子 `rename` 抢占**（并发只有一个成功），释放前读回 `token` 校验归属，避免误删他人锁。
- **TTL 基于实测**：`staleMs = 3000ms` 由实测最长临界区 P99 ≈ 8.14ms 取大余量（368×P99）；`staleMs < timeoutMs` 保证崩溃残留可在等待窗口内被抢占。同步 API 下事件循环被阻塞，心跳续期不可行。
- **序号 `max+1` 降级为候选起点**：最终分配权归 `O_EXCL` 独占创建 + EEXIST 重试；`parse` 回调必须只解析文件名（空文件占位仍计入，不重号）。
- **Windows 容错**：`renameSync` 目标被独占句柄打开时可能抛 `EPERM/EBUSY`；`unlinkSync` 释放失败 try/catch 静默忽略，靠 TTL 兜底。
- **锁不嵌套**：同一进程不可对同一 lockPath 嵌套调用；共享写点各自取一把锁。

## 接入范围

高风险共享写入点接入（flow.json、公共日志、status.md、op 序号、全局配置、kb/index.md）；低风险一次性写入（init 模板、日志骨架）保持裸 `writeFileSync`。

## 变更历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.1.0-stage-35 | 2026-09-12 | 初始创建（原子写 + 建议性文件锁 + 序号原子化三工具 + 高风险写入接入） |
