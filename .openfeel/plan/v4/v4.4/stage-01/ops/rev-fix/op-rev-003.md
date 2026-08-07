# op-rev-003：knowledge.ts 表头硬编码 i18n 化

- **阶段**：v4.4-stage-01（审查修复）
- **REV 引用**：对应 REV-003（`REV-v4.4-stage-01.md`）
- **前置**：无
- **负责 Agent**：Executor
- **最多重试**：3

## 目标

将 `src/commands/knowledge.ts` 中两处硬编码的中文表头数组替换为 `t()` 查表调用，使表格输出在 `en` 模式下显示英文列名。

## 实施步骤

### 步骤 1：在 `zh-CN.ts` 的 `knowledge` 域中新增 key

在 `src/core/i18n-data/zh-CN.ts` 的 `knowledge` 对象中追加以下 6 条 key（`en` 字段留空 `''`）：

- [ ] [FIX] **knowledge list 表头列名**（3 条）：

```typescript
'list.colCategory':     { key: 'knowledge.list.colCategory',     zh: '分类', en: '' },
'list.colTitle':        { key: 'knowledge.list.colTitle',        zh: '标题', en: '' },
'list.colDate':         { key: 'knowledge.list.colDate',         zh: '日期', en: '' },
```

- [ ] [FIX] **knowledge index 表头列名**（3 条）：

```typescript
'index.colDate':        { key: 'knowledge.index.colDate',        zh: '日期', en: '' },
'index.colCategory':    { key: 'knowledge.index.colCategory',    zh: '分类', en: '' },
'index.colTitle':       { key: 'knowledge.index.colTitle',       zh: '标题', en: '' },
```

> 虽然 list 和 index 三列语义相同，但分属不同上下文，使用独立 key 以便未来独立调优翻译。

### 步骤 2：在 `en.ts` 的 `knowledge` 域中新增对应的英文翻译

- [ ] [FIX] 在 `src/core/i18n-data/en.ts` 的 `knowledge` 对象中追加：

| key | en 值 |
|-----|-------|
| `knowledge.list.colCategory` | `'Category'` |
| `knowledge.list.colTitle` | `'Title'` |
| `knowledge.list.colDate` | `'Date'` |
| `knowledge.index.colDate` | `'Date'` |
| `knowledge.index.colCategory` | `'Category'` |
| `knowledge.index.colTitle` | `'Title'` |

（`zh` 字段均为 `''`。）

### 步骤 3：替换 `knowledge.ts` 中硬编码表头

在 `src/commands/knowledge.ts` 中：

- [ ] [FIX] **第 40 行**（knowledge list 表头）：
  ```typescript
  // 改前：
  const headers = ['分类', '标题', '日期', t('common.status', lang)];
  // 改后：
  const headers = [
    t('knowledge.list.colCategory', lang),
    t('knowledge.list.colTitle', lang),
    t('knowledge.list.colDate', lang),
    t('common.status', lang),
  ];
  ```

- [ ] [FIX] **第 155 行**（knowledge index 表头）：
  ```typescript
  // 改前：
  const headers = ['日期', '分类', '标题'];
  // 改后：
  const headers = [
    t('knowledge.index.colDate', lang),
    t('knowledge.index.colCategory', lang),
    t('knowledge.index.colTitle', lang),
  ];
  ```

### 步骤 4：自测验证

- [ ] 运行 `npm test`，确保 291 个测试全部通过
- [ ] 在 `zh-CN` 模式下执行 `openfeel knowledge list`，验证表头仍显示 `分类 | 标题 | 日期 | 状态`
- [ ] 在 `zh-CN` 模式下执行 `openfeel knowledge index`，验证表头仍显示 `日期 | 分类 | 标题`
- [ ] 在 `en` 模式下验证表头为英文列名

## 产出文件

- `src/core/i18n-data/zh-CN.ts`（`knowledge` 域新增 6 条 key）
- `src/core/i18n-data/en.ts`（`knowledge` 域新增 6 条 key，含英文翻译）
- `src/commands/knowledge.ts`（2 处硬编码表头替换为 `t()` 调用）

## 自测清单

- [ ] `npm test` 全量通过（291/291）
- [ ] `knowledge list` 中文表头：`分类 | 标题 | 日期 | 状态`
- [ ] `knowledge index` 中文表头：`日期 | 分类 | 标题`
- [ ] `knowledge list` 英文表头：`Category | Title | Date | Status`
- [ ] `knowledge index` 英文表头：`Date | Category | Title`
- [ ] `formatTable()` 的列宽计算不受影响（`t()` 返回字符串长度正常参与 `padEnd` 计算）
- [ ] 无 `[i18n] Missing key` 警告
