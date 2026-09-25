# 控制区标记模块（managed-region）

> 模块文档，由归档官在归档时维护。对应源码：`src/core/managed-region.ts`。

## 职责

按文件类型提供受管区（managed region）的识别 / 包裹 / 替换原语，供 `openfeel update` 三态部署使用：控制区标记包裹受管内容，更新只覆盖区内，区外用户内容天然保留（D3 落地）。

四策略：

- **markdown**：`<!-- openfeel:begin --> … <!-- openfeel:end -->`
- **gitignore**：`# openfeel:begin … # openfeel:end`
- **frontmatter**：无标记，结构化字段合并（框架字段覆盖 + 用户字段 passthrough）
- **jsonc**：无标记，深度合并（本模块仅分派，复用 opencode-config.ts）

## 核心 API

| 函数 | 功能 |
|------|------|
| `detectFileType(filePath)` | 按扩展名/文件名分派类型（gitignore / jsonc / markdown / null） |
| `normalize(content)` | CRLF / CR → LF 行尾归一化 |
| `parseRegion(existing, type)` | 解析控制区，返回 `{ status: 'ok'\|'none'\|'malformed', regionContent? }` |
| `hasRegion(existing, type)` | 是否含完整成对标记（等价 status === 'ok'） |
| `extractRegion(existing, type)` | 提取区内内容（trim 后正文），无标记/异常 → null |
| `wrapRegion(content, type)` | 包裹内容为受管区（`{begin}\n{content}\n{end}\n`） |
| `replaceRegion(existing, incoming, type)` | 替换区内内容（保留区外），非 ok 状态抛错 |
| `splitFrontmatter(content)` | 分割 YAML frontmatter 与正文，无/失败 → null |
| `mergeFrontmatter(existing, incoming)` | 字段级浅合并（框架覆盖 + 用户 passthrough） |
| `serializeFrontmatter(frontmatter)` | 序列化为 `---\n{...}\n---\n`（保证末尾换行） |

## 关键设计

- **标记精确成对匹配**：整行 `trim()` 后比对，计数判定 none/ok/malformed（>1 对或不成对 → malformed）。与单行信号 `openfeel:generated` 天然区分（generated 单行、非成对、token 不同）。
- **正文规范化 = trim**：wrap/extract 均基于 trim 后正文，round-trip 幂等。
- **frontmatter 浅合并**：`{ ...existing, ...incoming }`，嵌套对象（permission）整体覆盖，不做深合并。
- **replaceRegion 防误用**：非 ok（none/malformed）状态直接抛错，避免调用方误删用户内容。

## 调用关系

```
src/core/update.ts（writeManagedFile 三态分派）
  └─ src/core/managed-region.ts（标记工具）
       ├─ 复用 yaml（frontmatter 解析/序列化）
       └─ jsonc 仅分派 → src/core/opencode-config.ts（parseJsonc/deepMergeJsonc）
```

## 变更历史

| 阶段 | 变更 |
|------|------|
| stage-38 | 初始创建，四策略（markdown/gitignore/frontmatter/jsonc）标记工具，供 writeManagedFile 三态接入 |
