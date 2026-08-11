# Plan — stage-32: openfeel update 增量更新 + 冲突标记机制

> **版本**：v1.0.0-stage-32
> **创建日期**：2026-08-11
> **Planner**：独立 Planner（推理模型 DeepSeek V4 Pro）
> **规模判定**：大规模（4 个 op、4 个文件变更含 1 个新增模块、跨模块架构变更——引入 hash 管理环和冲突文件系统、影响 Feel Agent 启动流程）
> **来源**：update 命令行为增强需求

---

## 知识库参考

| 条目 | 路径 | 相关性 |
|------|------|--------|
| 部署传播内容哈希比对模式 | kb/patterns.md #部署传播内容哈希比对模式 | **高度相关**。当前 `writeIfChanged()` 仅做全文字符串相等比对（`!==`），内容不同时直接覆盖，本需求将其升级为 hash 比对 + 冲突标记，是在此模式基础上的架构升级 |
| WORKSPACE_DIRS 同步模式 | kb/patterns.md #WORKSPACE_DIRS 同步模式 | **必须遵循**。新增 `update_conflicts/` 目录和 `update_state.json` 文件需同步更新 `WORKSPACE_DIRS` 数组和相关初始化逻辑 |
| init/update 重启提醒对称输出模式 | kb/patterns.md #init/update 重启提醒对称输出模式 | 与 OP4 Feel 启动冲突检测的提示输出风格保持一致，遵循 `isTTY` 检查模式 |
| 多语言模板数据管线 | kb/architecture.md | update 覆盖的 SKILL_DEFINITIONS 内容来自构建管线，冲突标记中的模板内容需引用正确的语言版本 |

---

## 背景与动机

当前 `openfeel update` 使用 `writeIfChanged()` 做简单内容比对：
- 内容相同 → skip（行为正确）
- 内容不同 → **直接覆盖**（用户手动修改静默丢失）

这导致 AI 工具的用户对手动调整过的 Agent 定义、Skill 定义、AGENTS.md 等文件在 `update` 时被静默覆盖，无任何提示和恢复手段。

**目标**：引入增量更新 + 冲突标记机制，保护用户手动修改不被静默丢失。

### 受影响文件（25 个）

| 类别 | 路径 | 数量 |
|------|------|:--:|
| 项目级 | `AGENTS.md` | 1 |
| 指令 | `.opencode/instructions/core.md` | 1 |
| Agent 定义 | `.opencode/agents/{feel,planner,schemer,executor,reviewer,feel-tester,utility,vision,archiver}.md` | 9 |
| Skill 定义 | `.opencode/skills/{agent-model-check,bug-acceptance,check-kb,get-bugs,get-stage-status,health,model-check,model-config,recover,roadmap,search-kb,sync-status,update-stage-status,wizard}/SKILL.md` | 14 |
| 平台配置 | `opencode.jsonc` | 1 |

### update_state.json 结构

```json
{
  "version": "1.0",
  "last_update": "2026-08-11T00:00:00.000Z",
  "openfeel_version": "1.0.7",
  "files": {
    "AGENTS.md": { "hash": "abc123...", "status": "clean" },
    ".opencode/agents/reviewer.md": { "hash": "def456...", "status": "conflict" }
  }
}
```

### 工作流程

```
openfeel update
  │
  ├─ 首次执行（无 update_state.json）
  │   ├─ 写入所有受管文件
  │   └─ 记录当前 hash → update_state.json（status=clean）
  │
  └─ 后续执行（已有 update_state.json）
      ├─ 对每个受管文件：
      │   ├─ hash 一致 → 用户未修改 → 安全覆盖 → 更新 hash
      │   └─ hash 不一致 → 用户已修改 → 拒绝覆盖 → 写入冲突标记文件
      └─ 输出冲突报告（conflicts 列表）
```

### 冲突文件格式（Git 风格）

```
<<<<<<< CURRENT (用户修改版)
{当前文件内容}
=======
{新模板内容}
>>>>>>> INCOMING (openfeel vX.X.X 更新)
```

冲突文件存放于 `.openfeel/update_conflicts/{相对路径}`，如：
```
.openfeel/update_conflicts/AGENTS.md
.openfeel/update_conflicts/.opencode/agents/reviewer.md
```

---

## 工作阶段

### Stage-32-01：update_state.json 读写模块

> **目标**：建立 `.openfeel/update_state.json` 的读写 API，为后续 hash 比对和冲突检测提供基础。
> **前置依赖**：无
> **涉及文件**：1 个新增文件

| # | 任务 | 描述 | 涉及文件 |
|---|------|------|----------|
| 1 | 新增 update_state.json 读写模块 | Zod Schema 校验 + 读/写/初始化/更新单文件 hash 的纯函数 | NEW: `src/core/update-state.ts` |

### Stage-32-02：update 核心 merge 逻辑改造

> **目标**：改造 `writeIfChanged()` 为 `writeWithMergeDetection()`，引入 hash 比对的增量更新逻辑。
> **前置依赖**：OP1（需要 `update-state.ts` 的读写 API）
> **涉及文件**：1 个修改文件

| # | 任务 | 描述 | 涉及文件 |
|---|------|------|----------|
| 2 | 改造 update.ts 写入逻辑 | 替换 `writeIfChanged()` 为三态逻辑（不变/安全覆盖/冲突拒绝），集成 `update-state.ts` 的 hash 读/写 | MODIFY: `src/core/update.ts` |

### Stage-32-03：冲突文件写入 + CLI 报告

> **目标**：冲突发生时生成 Git 风格冲突标记文件，并通过 CLI 输出冲突报告。
> **前置依赖**：OP2（需要改造后的 merge 逻辑区分 clean/conflict 状态）
> **涉及文件**：3 个文件（2 修改 + 1 修改结构定义）

| # | 任务 | 描述 | 涉及文件 |
|---|------|------|----------|
| 3 | 冲突文件写入 | 实现 `writeConflictFile()`：生成冲突标记文件到 `.openfeel/update_conflicts/` | MODIFY: `src/core/update.ts` |
| 4 | CLI 冲突报告 | `UpdateResult` 新增 `conflicts` 字段，命令层输出冲突摘要和解决指引 | MODIFY: `src/commands/update.ts` |
| 5 | 工作区目录扩展 | `WORKSPACE_DIRS` 新增 `update_conflicts`，`createWorkspace()` 自动创建该目录 | MODIFY: `src/core/workspace/structure.ts` |

### Stage-32-04：Feel 启动时冲突检测集成

> **目标**：Feel Agent 启动时读取 `update_state.json`，检测到冲突后提示用户处理。
> **前置依赖**：OP1（需要 `update_state.json` 存在并被正确维护）
> **涉及文件**：1 个文件（Agent 定义）

| # | 任务 | 描述 | 涉及文件 |
|---|------|------|----------|
| 6 | Feel Agent 启动冲突检测 | 在 feel.md「记忆加载」节后新增「冲突检测」步：读取 `update_state.json`，有 conflict → 输出提示，引导用户处理 | MODIFY: `.opencode/agents/feel.md`（及对应模板 `templates-data/agents/{zh-CN,en}/feel.md`） |

---

## 详细技术方案

### OP1：update_state.json 读写模块

**新增文件**：`src/core/update-state.ts`

**Zod Schema**：

```typescript
import { z } from 'zod';

const FileStateSchema = z.object({
  hash: z.string(),
  status: z.enum(['clean', 'conflict']),
});

export const UpdateStateSchema = z.object({
  version: z.literal('1.0'),
  last_update: z.string(),
  openfeel_version: z.string(),
  files: z.record(z.string(), FileStateSchema),
});

export type UpdateState = z.infer<typeof UpdateStateSchema>;
export type FileState = z.infer<typeof FileStateSchema>;
```

**导出函数**：

| 函数 | 签名 | 职责 |
|------|------|------|
| `loadUpdateState(projectPath: string)` | `UpdateState \| null` | 读取 `update_state.json`，不存在返回 null，校验失败返回 null（降级为安全模式） |
| `saveUpdateState(projectPath: string, state: UpdateState)` | `void` | 写入 `update_state.json`（序列化为缩进 JSON） |
| `createUpdateState(projectPath: string, openfeelVersion: string, files: Record<string, string>)` | `UpdateState` | 首次 update 时创建：遍历 files 计算各文件 SHA-256 hash，生成初始状态 |
| `updateFileHash(state: UpdateState, relativePath: string, content: string)` | `void` | 原地修改 state 中单个文件的 hash 和 status（为 clean） |
| `markFileConflict(state: UpdateState, relativePath: string)` | `void` | 原地修改 state 中单个文件的 status 为 conflict |
| `hashContent(content: string)` | `string` | 计算字符串的 SHA-256 hex（使用 Node.js 内置 `crypto`） |

**hash 算法**：SHA-256（Node.js 内置 `crypto.createHash('sha256')`），不引入新 npm 依赖。

**降级策略**：`loadUpdateState()` 返回 null 时，调用方回退到"全量覆盖 + 重建 state"模式（即首次 update 行为）。

**关键实现细节**：

```typescript
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

/** 计算字符串的 SHA-256 哈希 */
export function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

/** update_state.json 在项目中的相对路径 */
const STATE_FILE = '.openfeel/update_state.json';

/** 获取 update_state.json 的绝对路径 */
function getStatePath(projectPath: string): string {
  return resolve(projectPath, STATE_FILE);
}

/** 读取 update_state.json，不存在或校验失败返回 null */
export function loadUpdateState(projectPath: string): UpdateState | null {
  const statePath = getStatePath(projectPath);
  if (!existsSync(statePath)) {
    return null;
  }
  try {
    const raw = readFileSync(statePath, 'utf-8');
    const data = JSON.parse(raw);
    const result = UpdateStateSchema.safeParse(data);
    if (!result.success) {
      // 校验失败 → 降级为 null（首次 update 行为）
      console.warn(`[update] update_state.json schema mismatch, treating as first update: ${result.error.message}`);
      return null;
    }
    return result.data;
  } catch {
    // parse 失败 → 降级
    return null;
  }
}

/** 创建初始 update_state.json */
export function createUpdateState(
  projectPath: string,
  openfeelVersion: string,
  files: Record<string, string>,
): UpdateState {
  const fileEntries: Record<string, FileState> = {};
  for (const [path, content] of Object.entries(files)) {
    fileEntries[path] = {
      hash: hashContent(content),
      status: 'clean',
    };
  }
  return {
    version: '1.0',
    last_update: new Date().toISOString(),
    openfeel_version: openfeelVersion,
    files: fileEntries,
  };
}
```

---

### OP2：update 核心 merge 逻辑改造

**修改文件**：`src/core/update.ts`

**核心变更**：替换 `writeIfChanged()` 为 `writeWithMergeDetection()`，引入三态返回。

**`UpdateResult` 扩展**：

```typescript
export interface UpdateResult {
  created: string[];
  updated: string[];
  skipped: string[];
  conflicts: string[];   // 新增：冲突文件相对路径列表
}
```

**新函数 `writeWithMergeDetection()`** 替换原 `writeIfChanged()`：

```typescript
/**
 * 带冲突检测的写入函数
 * 行为：
 *  - 文件不存在 → created
 *  - 文件已存在 + hash 匹配 update_state 中记录 → 安全覆盖 → updated
 *  - 文件已存在 + hash 不匹配 → 拒绝覆盖 → conflicts
 *  - 文件已存在 + 不在 update_state 管理中 → 安全覆盖 → updated
 *  - 文件已存在 + update_state 不存在或损坏 → 安全覆盖 → updated（降级为旧行为）
 */
function writeWithMergeDetection(
  filePath: string,
  content: string,
  relativePath: string,
  updateState: UpdateState | null,
  result: UpdateResult,
): void {
  if (!existsSync(filePath)) {
    // 文件不存在 → 新建
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, 'utf-8');
    result.created.push(relativePath);
    return;
  }

  const existing = readFileSync(filePath, 'utf-8');

  // 内容相同 → skip
  if (existing === content) {
    result.skipped.push(relativePath);
    return;
  }

  // 检查 update_state 中是否有该文件的记录
  const fileState = updateState?.files[relativePath];
  if (fileState) {
    // 有记录 → 比对 hash
    const currentHash = hashContent(existing);
    if (currentHash === fileState.hash) {
      // hash 一致 → 用户未修改 → 安全覆盖
      writeFileSync(filePath, content, 'utf-8');
      result.updated.push(relativePath);
      return;
    }
    // hash 不一致 → 用户已修改 → 冲突！
    result.conflicts.push(relativePath);
    return;
  }

  // 无记录（降级路径：update_state 损坏或旧版本）→ 安全覆盖
  writeFileSync(filePath, content, 'utf-8');
  result.updated.push(relativePath);
}
```

**`updateProject()` 改动点**：

1. 函数签名不变，内部初始化时加载 `update_state.json`
2. `conflicts` 初始化为空数组
3. 所有 `writeIfChanged()` 调用替换为 `writeWithMergeDetection()`
4. 逻辑结束后：若 conflicts 为空 → 更新 `update_state.json` 中所有 changed 文件的 hash；若 conflicts 非空 → 保持原 state 不变，仅将冲突文件状态标记为 conflict
5. 将 `conflicts` 加入返回值

**关键集成位置**（`updateProject()` 内）：

```typescript
// 在函数开头：
const state = loadUpdateState(projectPath);
const isFirstUpdate = state === null;

// ... 原有逻辑，所有 writeIfChanged 替换为 writeWithMergeDetection ...

// 在函数末尾（return 之前）：
if (result.conflicts.length === 0) {
  // 无冲突 → 更新 state
  const newState = state ?? createUpdateState(projectPath, getOpenfeelVersion(), {});
  newState.last_update = new Date().toISOString();
  // 更新所有 clean 文件的 hash（created 和 updated 的文件）
  for (const relPath of [...result.created, ...result.updated]) {
    const absPath = resolve(projectPath, relPath);
    if (existsSync(absPath)) {
      const newContent = readFileSync(absPath, 'utf-8');
      updateFileHash(newState, relPath, newContent);
    }
  }
  saveUpdateState(projectPath, newState);
} else {
  // 有冲突 → 标记冲突文件状态
  const newState = state ?? createUpdateState(projectPath, getOpenfeelVersion(), {});
  for (const relPath of result.conflicts) {
    markFileConflict(newState, relPath);
  }
  saveUpdateState(projectPath, newState);
}
```

**向后兼容处理**：
- `opencode.jsonc` 的补丁模式合并逻辑（`buildUpdatedJsonc()` / `replaceSkillsFieldInJsonc()`）**保持不变**——仅写入路径走冲突检测
- 首次 update 无 `update_state.json` → 自动创建并记录当前 hash → 状态 clean

---

### OP3：冲突文件写入 + CLI 报告

**冲突文件写入**（`src/core/update.ts` 新增）：

```typescript
/**
 * 写入冲突标记文件到 .openfeel/update_conflicts/
 * 格式：Git 风格冲突标记
 */
function writeConflictFile(
  projectPath: string,
  relativePath: string,
  currentContent: string,
  incomingContent: string,
  openfeelVersion: string,
): void {
  const conflictsBase = resolve(projectPath, '.openfeel', 'update_conflicts');
  mkdirSync(conflictsBase, { recursive: true });

  const conflictPath = resolve(conflictsBase, relativePath);
  mkdirSync(dirname(conflictPath), { recursive: true });

  const conflictContent = [
    `<<<<<<< CURRENT (用户修改版)`,
    currentContent,
    `=======`,
    incomingContent,
    `>>>>>>> INCOMING (openfeel v${openfeelVersion} 更新)`,
  ].join('\n');

  writeFileSync(conflictPath, conflictContent, 'utf-8');
}
```

**CLI 冲突报告**（`src/commands/update.ts`）：

在现有 created/updated/skipped 输出之后，新增 conflicts 输出：

```typescript
if (result.conflicts.length > 0) {
  console.log(t('update.conflicts', lang));
  for (const item of result.conflicts) {
    console.log(`  ⚠ ${item}`);
  }
  console.log(t('update.conflictsHint', lang));
}
```

**新增 i18n 键**（`zh-CN.ts` + `en.ts`）：

| 键 | zh-CN | en |
|------|------|------|
| `update.conflicts` | 检测到冲突（文件已被手动修改，拒绝覆盖） | Conflicts detected (files have been manually modified, overwrite refused) |
| `update.conflictsHint` | 冲突文件已写入 .openfeel/update_conflicts/，请手动合并后重新运行 update | Conflict files written to .openfeel/update_conflicts/. Please merge manually, then re-run update. |

**工作区目录扩展**（`src/core/workspace/structure.ts`）：

```typescript
const WORKSPACE_DIRS = [
  'plan',
  'kb',
  'dev',
  'log',
  'code_review',
  'bugs',
  'users',
  'tmp',
  'manual',
  'update_conflicts',  // ← 新增
];
```

> **参考**：kb/patterns.md #WORKSPACE_DIRS 同步模式——新增目录须同步更新 WORKSPACE_DIRS 数组。

---

### OP4：Feel 启动时冲突检测集成

**修改文件**：`templates-data/agents/{zh-CN,en}/feel.md`（源模板）、`.opencode/agents/feel.md`（部署文件）

**插入位置**：在「记忆加载」节（`## 记忆加载`）之后，「决策追加」（`## 决策追加`）之前，新增一个「冲突检测」节。

**新增内容**（中文版）：

```markdown
## 冲突检测

Feel 启动时检测 `.openfeel/update_state.json`（若文件存在）：

1. 遍历 `files` 字段，查找 `status=conflict` 的条目
2. 若存在冲突：
   - 输出冲突列表和解决指引：
     ```
     ⚠️ 检测到 openfeel update 冲突：
       {file1}
       {file2}
     冲突文件已保存在 .openfeel/update_conflicts/ 目录。
     请手动合并冲突后运行 openfeel update 更新状态。
     ```
   - 若终端为 TTY 交互环境，询问用户是否要现在处理（打开冲突目录或跳过）
   ```
3. 不阻塞 Feel 主体流程——冲突提示后照常进入主循环
```

**双向同步**：修改源模板后运行 `npm run build` 自动注入到 `template-loader.ts`，`openfeel update` 部署到 `.opencode/agents/feel.md`。

**isTTY 检查**：遵循 kb/patterns.md #init/update 重启提醒对称输出模式，仅在 TTY 环境输出提示。

---

## 约束与设计决策

| # | 约束 | 处理方式 |
|---|------|----------|
| 1 | 不引入新 npm 依赖 | hash 用 Node.js 内置 `crypto` / `createHash('sha256')` |
| 2 | opencode.jsonc 补丁合并逻辑不变 | `buildUpdatedJsonc()` 保持不变，仅写入路径走新的冲突检测 |
| 3 | 向后兼容 | 首次 update 无 `update_state.json` → 自动创建并记录 hash → clean |
| 4 | 降级安全 | `update_state.json` 读取/校验失败 → 回退为"全部覆盖"（旧行为），不阻塞 update |
| 5 | SHA-256 vs 全文比对 | 选择 hash 比对而非全文比对：因为需要区分"内容相同"（skip）和"内容不同但用户未改"（安全覆盖）。`writeIfChanged` 中的 `===` 比对仍保留用于快速 skip |
| 6 | update_state.json 的 git 策略 | 加入 `.gitignore`，不纳入版本管理（每个开发者的本地状态独立） |
| 7 | 冲突解决后的 hash 更新 | 用户手动合并后重新运行 `openfeel update`，hash 自动更新为 clean |

---

## 测试策略

| 测试场景 | 验证点 |
|----------|--------|
| 首次 update | `update_state.json` 被创建，所有文件 hash 记录正确，status 均为 clean |
| 二次 update（无手动修改） | 所有文件 hash 一致 → 安全覆盖，update_state 更新 |
| 二次 update（手动修改某文件） | 被修改文件触发冲突，写入 `.openfeel/update_conflicts/`，未被修改的文件正常覆盖 |
| update_state.json 损坏 | 降级为全部覆盖 + 重建 state |
| update_state.json 不存在 | 视为首次 update |
| Feel 启动（无冲突） | 静默，不干扰正常启动 |
| Feel 启动（有冲突） | 输出冲突列表 + 指引 |

---

## 执行顺序

```
OP1 (update-state.ts)
  └─→ OP2 (update.ts merge 改造) [hard 依赖]
        └─→ OP3 (冲突文件 + CLI) [hard 依赖]
OP4 (Feel 集成) [soft 依赖 OP1]
```

OP4 可在 OP1 完成后与 OP2/OP3 并行开发（仅读取 `update_state.json`，不依赖 OP2/OP3 的改造产物）。

---

## 预期产出

| 产出 | 路径 |
|------|------|
| 新增模块 | `src/core/update-state.ts` |
| 修改核心 | `src/core/update.ts` |
| 修改命令 | `src/commands/update.ts` |
| 修改结构 | `src/core/workspace/structure.ts` |
| 新增 i18n | `src/core/i18n-data/zh-CN.ts` (+2 键)、`src/core/i18n-data/en.ts` (+2 键) |
| Agent 更新 | `templates-data/agents/{zh-CN,en}/feel.md`、`.opencode/agents/feel.md` |
| 计划文档 | `.openfeel/plan/v1/stage-32/plan.md`（本文件） |
| 操作方案 | `.openfeel/plan/v1/stage-32/ops/{op-001..op-004}.md`（由 Schemer 细化） |
