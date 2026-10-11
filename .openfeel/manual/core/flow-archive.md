# 版本分片归档模块（flow-archive）

> 模块文档，由归档官在归档时维护。对应源码：`src/core/flow-archive/{archive-file,grouping,archive-ops}.ts`（**v1.2.0-stage-78 新建**）。

## 职责

`flow.json` 版本分片归档的**引擎面**（纯库层）：把「已收官版本」的 `stages` 条目 + 关联 `reviews` + 关联 `log` 三段移入独立归档文件 `.openfeel/flow-archive/{version}.json`，收缩活跃 `flow.json` 体积。本模块**只提供原语与纯函数**；命令面（`flow archive <version>` / `list` / `show`）归 `v1.2.0-stage-79`，消费点适配与存量迁移归 `v1.2.0-stage-80`。

**零常规路径触碰**：本模块产物仅被测试 import；`src/commands/**` / `src/cli/**` / `flow-manager.ts` 零 import（`rg "flow-archive" src/` 命中仅自身）。

## 模块分层

| 文件 | 职责 | 依赖 |
|------|------|------|
| `archive-file.ts` | 归档文件 schema 常量与类型（`ARCHIVE_SCHEMA_VERSION` / `ArchiveFile` / `ArchiveCounts`） | 仅 `import type` flow-manager（编译期擦除） |
| `grouping.ts` | 版本分组与切分**纯函数**（只读输入、不写盘、不加锁、不读环境） | `plan/path.ts` `parseStageId` |
| `archive-ops.ts` | 归档读写**IO 原语**与 `meta.archived_versions` 索引管理 | `fs/atomic-write.ts`、`fs/file-lock.ts`、`grouping.ts` |

## 归档文件 schema

`.openfeel/flow-archive/{version}.json`：

```jsonc
{
  "schemaVersion": 1,          // 写侧恒 ARCHIVE_SCHEMA_VERSION；读侧对未知值宽容
  "version": "v1.1.7",         // 被归档的版本前缀
  "archived_at": "ISO 8601",
  "stages": { /* stageId → StageData */ },
  "reviews": [ /* ReviewItem[] */ ],
  "log": [ /* LogEntry[] */ ],
  "counts": { "stages": 4, "reviews": 12, "log": 89 }  // 冗余展示；读侧缺失按实际长度回填（读时计算不写盘）
}
```

只增不改（无 unarchive）；同版本重归档 = **幂等覆盖写**（`backup:false`，无 `.bak`）。归档目录**不纳入 `WORKSPACE_DIRS`**、零 gitignore 改动、按需 `mkdirSync` 幂等创建。

## 核心 API

### archive-file.ts
| 导出 | 说明 |
|------|------|
| `ARCHIVE_SCHEMA_VERSION` | 归档 schema 版本常量（= 1） |
| `ArchiveFile` / `ArchiveCounts` | 归档文件结构 / 三段计数接口 |

### grouping.ts（纯函数）
| 导出 | 说明 |
|------|------|
| `versionOfStageId(stageId)` | stageId → 版本前缀（如 `v1.1.7`）；经 `parseStageId` 剥离 `-{stageDir}` 后缀（**禁自写正则**）；无法解析返回 `null` |
| `groupStagesByVersion(stages)` | 版本 → stageId 列表（稳定顺序 = 键遍历序；不可解析跳过） |
| `listArchivableCandidates(data)` | 可归档候选（版本 + stageId 列表 + `allDone`）；`allDone` 用**空集守卫** `length>0 && every(done)`；**不判 REV**（归命令层） |
| `splitForArchive(data, version)` | 按版本切分 → `{ archive, remainder }`；`stages` 全搬 / `reviews` 按 `op` 前缀（`<stageId>.op-NNN` 或 `<stageId>`，点号锚定正则剥离 opId） / `log` 按 `detail.stageName`（**缺失/不可解析一律保留**）；版本不存在 → 空 archive 不抛错；返回对象为原数据浅引用（调用方不得修改） |

### archive-ops.ts（IO 原语）
| 导出 | 说明 |
|------|------|
| `getArchiveDir(projectPath)` / `getArchiveFilePath(projectPath, version)` | 路径单点（`.openfeel/flow-archive/`）；**`getArchiveFilePath` 仅接受已校验 version**（REV-78-011） |
| `writeArchiveFile(projectPath, file)` | 独立锁 `flow-archive` 内原子写（`backup:false`）；非法 version **抛错零写盘**（路径穿越防御） |
| `listArchiveVersions(projectPath)` | 目录扫描 + 文件名合法校验；目录缺失 → `[]`；**字典序（非语义版本序）** |
| `readArchiveFile(projectPath, version)` | 缺失 / 损坏（解析失败）/ 非法 version / 合法 JSON 但非对象 → `null` 不抛；未知键保留；缺 `counts` 回填 |
| `addArchivedVersion(data, version)` | 幂等去重追加（返回是否新增）；**纯内存**，持久化由命令层 `save()` |
| `getArchivedVersions(data)` | 已归档版本索引副本；缺失/非数组 → `[]` |

## 关键约定

- **独立锁不嵌套**：归档写盘锁名恒 `flow-archive`（`.openfeel/tmp/locks/flow-archive.lock`），与 flow 锁**不嵌套**；「先写归档文件 → 后 flow save」为两次独立临界区，由命令层（stage-79）编排（裁定 P）。
- **零自写版本解析**：版本段一律经 `parseStageId`；版本字符串合法性用**探针法**复用同一解析器（`isValidVersionString(s) = versionOfStageId(`${s}-stage-00`) === s`）。
- **切分无损**：`splitForArchive` 硬性验收「各段 `archive ∪ remainder = 原集合`」（T4.2 双向断言）。
- **轻量索引**：`flow.json.meta.archived_versions: string[]`（追加 + 幂等去重）；供 stage-80 跨版本 deps 判定（展示层不读归档）。`flow-manager.ts` 仅可选字段声明 + `load()` 读侧补齐（REV-78-006；见下变更加「已知语义」）。

## 变更历史

| 阶段 | 变更 |
|------|------|
| v1.2.0-stage-78 | **新增本模块**（`archive-file.ts` / `grouping.ts` / `archive-ops.ts` + 单测）：归档文件 schema + 版本分组/切分纯函数 + IO 原语与索引；`flow-manager.ts` 最小追加 `FlowData.meta.archived_versions?: string[]` + `load()` 读侧补齐（REV-78-006，12 增/1 删，语义删除 0）。**已知语义**：存量 flow.json 于**下一次 `save()`** 会写入 `archived_versions: []`（读侧宽容，无兼容风险；「是否删除 load 补齐」留 stage-79/85 评估，REV-78-015）。阶段门禁 68 文件 / 1337 用例 0 failed、tsc 0、i18n 796（不变）、build ×2 幂等 |
