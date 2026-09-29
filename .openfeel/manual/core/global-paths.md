# 全局路径模块（global-paths）

> 模块文档，由归档官在归档时维护。对应源码：`src/core/global-paths.ts`。

## 职责

集中解析「平台适配器」与 openfeel 的全局路径（基于用户主目录），作为 init/update 全局部署的路径基础。**仅此模块 import `node:os` 的 `homedir()`**（N4）：测试 mock `node:os` 一处即隔离全部全局路径。下表加粗标注的路径为 **opencode 适配器**版本（实现细节，保留）。

## 核心 API

| 函数 | 返回路径 |
|------|----------|
| `getOpencodeGlobalDir()` | `~/.config/opencode` |
| `getGlobalAgentsDir()` | `~/.config/opencode/agents` |
| `getGlobalSkillsDir()` | `~/.config/opencode/skills` |
| `getGlobalOpencodeJsoncPath()` | `~/.config/opencode/opencode.jsonc` |
| `getGlobalAgentsMdPath()` | `~/.config/opencode/AGENTS.md`（v1.1.1 框架约束唯一权威；opencode 适配器） |
| `getGlobalCoreMdPath()` | `~/.config/opencode/openfeel/core.md`（v1.1.1 起废弃，仅兼容检测/清理） |
| `getGlobalUpdateStatePath()` | `~/.openfeel/update_state.json` |
| `getGlobalUpdateInfosPath()` | `~/.openfeel/update_infos.md` |
| `getAuthJsonPath()` | `~/.local/share/opencode/auth.json` |
| `getGlobalBackupRootPath()` | `~/.openfeel/backup`（部署覆盖前备份统一根，stage-46） |

所有函数基于 `homedir()`（`node:os`）+ `join`（`node:path`）拼接，返回绝对路径（不含 `~` 字面量）。

## 设计要点

- **homedir 单点封装**：既有代码中 `homedir()` 分散于 4 处（config.ts / identity.ts / file-lock.ts / resolver.ts）；本模块集中平台适配器相关路径（当前：opencode 适配器），其余 4 处**默认不收纳**（D37-1：避免扩大范围、过度设计）。
- **update_infos.md 仅解析路径**：其读写逻辑属 stage-38，本阶段仅提供路径解析函数。

## 调用关系

```
src/core/init.ts（deployOpencode 全局部署）
src/core/update.ts（updateProject 全局部署 + 双 state）
src/core/update-state.ts（全局 state 读写）
  └─ src/core/global-paths.ts（路径基础）
```

## 历史残留：全局 `config.json` 死映射的安全清理

`~/.openfeel/config.json` 的 `projects` 字段记录「项目绝对路径 → 语言」映射。历史上 `update.test.ts` 缺 `vi.mock('node:os')`、`identity.test.ts` 以「保存/恢复」伪隔离方式运行，曾向该文件写入大量 `openfeel-update-test-*`、`openfeel-identity-*` 临时项目键（实测约 **455 条**），形成指向已不存在目录的**死映射**。

- **根因已修复**（v1.1.2-stage-43 op-004）：`identity.test.ts` 已改为 N4 单点 mock（`vi.mock('node:os')`），`update.test.ts` 早已隔离 → 死映射**不再增长**。
- **已于 v1.1.2-stage-48 op-006 清理完毕**（455 → 0；`projects` 现为空，`lang="zh-CN"` 保留）：一次性脚本 `.openfeel/tmp/clean-dead-lang-mappings.mjs`（**不纳入 `src/` / npm `files`**）；备份 `~/.openfeel/config.json.bak.2026-09-29T14-04-13-412Z`（38546 B，**含 455 条原映射，可直接覆盖还原**）。
- **本框架不自动清理、不新增清理 CLI**（裁定）：操作用户真实环境不可逆，且属历史残留、非发布阻塞。
- 未来若再现同类残留，按以下**四步保护**执行（**不可省**）：
  1. **匹配式必须是末段匹配**——`projects` 的键是**绝对路径**、测试前缀位于**路径末段**（形如 `C:\Users\<user>\AppData\Local\Temp\openfeel-update-test-XXXXXX`）。正确：`k.split(/[\\/]/).pop().startsWith('openfeel-update-test-')`；**错误**：字面前缀 `k.startsWith('openfeel-update-test-')`（实测 **0 命中**，会造成**假性通过**）。收紧变体：额外要求父目录为 `os.tmpdir()` / 系统临时目录。
  2. **隔离副本先行**：复制真实文件到临时目录试跑（先 `--dry-run` 再实跑），**断言删除数恰为预期**（455）——仅「无真实键被删」不足以证明成功（0 命中会假性通过）；同时断言删后 `projects` 剩余键数为 0、JSON 合法。
  3. **带时间戳备份**（`config.json.bak.{ISO ts}`，绝不覆盖既有备份）后执行真实文件。
  4. **执行后复核**：`projects` 剩余键数 + JSON 合法性 + `config list-projects` 可读 + 备份可解析且含原数据（验证可还原性）。脚本对 JSON 解析失败须**中止且不写盘**，写出前 `JSON.stringify` → `JSON.parse` 自校验。

> 测试隔离三重防线：N4 单点 mock（代码） + `identity.test.ts` 隔离守护用例（只读断言真实文件 mtime/SHA-256 不变） + 本节（人工清理指引）。采集沉淀详见 `kb/troubleshooting.md #真实环境一次性数据清理规范`。

## 变更历史

| 阶段 | 变更 |
|------|------|
| stage-37 | 初始创建，集中解析 opencode/opencode 全局路径（N4 homedir 单点封装）；op-001 落地，供 op-002/003/004 复用 |
| stage-40 | 新增 `getAuthJsonPath()`（`~/.local/share/opencode/auth.json`），供模型 provider 校验读取 auth.json 顶层 key（REV-1505） |
| v1.1.1 | 新增 `getGlobalAgentsMdPath()`（全局 AGENTS.md，框架约束唯一权威）；`getGlobalCoreMdPath()` 标记废弃（仅兼容检测/清理） |
| stage-46 | 新增 `getGlobalBackupRootPath()`（`~/.openfeel/backup`，部署覆盖前备份统一根；零行为变更） |
| v1.1.2-stage-43 | 文档化全局 `config.json` 死映射的安全清理步骤（BUG-004 收口：N4 隔离修复 + 不自动清理裁定） |
| v1.1.2-stage-48 | 死映射**已清理**（455→0，op-006，含备份 `config.json.bak.2026-09-29T14-04-13-412Z`）；清理指引升级为**四步保护**（末段匹配陷阱 + 删除数断言 + 备份 + 可还原复核） |
