# REV-v4-stage-04：体验优化审查条目

> 审查阶段：v4-stage-04 | 审查时间：2026-07-05 | 审查范围：op-001 ~ op-006

## 审查总结

| 维度 | 结论 | 说明 |
|------|------|------|
| 正确性 | ✅ 通过 | 6 个 op 实现均符合方案目标 |
| 规范性 | ✅ 通过 | 符合 AGENTS.md 编码规范 |
| 安全性 | ✅ 通过 | 无注入/越权/泄露风险 |
| 完整性 | ✅ 通过 | 方案声明产出全部到位，无遗漏 |
| 一致性 | ✅ 通过 | 内部模式一致，外部兼容现有架构 |

**验证结果**：
- `npm run build`：✅ 通过
- `npm test`：✅ 225/227 通过（2 失败为 init.test.ts 已有缺陷）
- `openfeel stage status` / `set` / `task`：✅ CLI 命令正常
- `openfeel flow metrics` / `recover` / `overview`：✅ CLI 命令正常
- 备份文件 `.openfeel/tmp/status.v4-stage-04.bak`：✅ 存在

---

## REV-001：kb-dedup.ts tokenize() 标记去除正则无实际效果

- **状态**：pending
- **优先级**：low
- **阻塞**：false（代码优化建议，不影响功能正确性）
- **提出人**：Reviewer
- **提出时间**：2026-07-05 17:04
- **关联 op**：op-003

### 问题描述

`src/utils/kb-dedup.ts` 第 108 行 `tokenize()` 函数中的正则表达式：

```typescript
const cleaned = text.replace(/^\[[+-]\](?!\s*\()/gm, '');
```

意图是去除行首的 `[+]` / `[-]` 标记，注释写「避免禁用标记变化影响匹配」。但实际调用链中：

1. `parseKbFile()` 将 `content` 字段解析为正文内容（不含 `## [+] 标题` 行）
2. `findSimilarEntries()` 传入的 `entry.content` 已是纯正文，不含 `[+]` 标记
3. `target` 参数也是待归档的新正文内容，不含标记

因此该正则表达式在正常使用时永远不会匹配到任何内容，属于**死代码**。

### 影响

- 不影响功能：标记已在 `parseKbFile` 层正确分离，相似度计算使用纯正文是正确的
- 代码可读性问题：注释与实际行为不一致，后续维护者可能产生困惑

### 建议

- 移除该行 `replace()` 调用并更新注释，说明标记已在 `parseKbFile` 层分离
- 或保留并修正注释，标注「兜底处理：若未来 content 字段变更为含标题行」

---

## REV-002：MetricsStore.getInstance() dataDir 参数忽略提示缺失

- **状态**：pending
- **优先级**：low
- **阻塞**：false（优化建议，测试已有 resetInstance() 兜底）
- **提出人**：Reviewer
- **提出时间**：2026-07-05 17:04
- **关联 op**：op-002

### 问题描述

`src/core/metrics.ts` 第 53-60 行 `getInstance()` 方法在单例已创建后忽略后续传入的 `dataDir` 参数：

```typescript
static getInstance(dataDir?: string): MetricsStore {
  if (!MetricsStore.instance) {
    MetricsStore.instance = new MetricsStore(
      dataDir ?? resolve(process.cwd(), '.openfeel'),
    );
  }
  return MetricsStore.instance;
}
```

当一个调用使用 `getInstance('/path/A')` 创建实例后，另一个调用 `getInstance('/path/B')` 不会生效——返回的仍是使用 `/path/A` 的实例。

### 影响

- 测试场景：已有 `resetInstance()` 方法正确处理，测试不受影响
- 生产场景：CLI 始终使用 `process.cwd()` 作为工作目录，不会出现不同 dataDir 的情况
- 实际风险：极低

### 建议

添加 JSDoc 注释说明「单例创建后 dataDir 参数不再生效，测试使用 resetInstance() 切换」，或在检测到 dataDir 不一致时输出 `console.debug` 调试信息。

---

## REV-003：同批次多 Agent prompt 文件 CLI 约束声明风格不统一

- **状态**：pending
- **优先级**：low
- **阻塞**：false（风格建议，不影响可用性）
- **提出人**：Reviewer
- **提出时间**：2026-07-05 17:04
- **关联 op**：op-004

### 问题描述

op-004 在 4 个 Agent prompt 中增加了 `openfeel stage` CLI 约束声明，但声明风格存在不一致：

| Agent 文件 | 表述 |
|-----------|------|
| feel.md (line 52) | `阶段状态更新须通过 \`openfeel stage\` 命令（\`status\`/\`set\`/\`task\`），禁止直接 \`edit\` status.md。` |
| executor.md (line 155) | `更新 status.md 必须通过 \`openfeel stage\` CLI 命令（\`status\`/\`set\`/\`task\`），禁止直接 \`edit\` status.md。参见 kb/troubleshooting.md #格式匹配脆弱。` |
| schemer.md (line 109) | `须指示 Executor 通过 \`openfeel stage\` CLI 命令操作 status.md，而非手动 \`edit\`。` |
| reviewer.md (line 78) | `应指示执行者通过 \`openfeel stage\` CLI 命令操作 status.md，而非直接 \`edit\`。` |

feel.md 和 executor.md 列出了子命令（`status`/`set`/`task`），而 schemer.md 和 reviewer.md 则未列出。schemer.md 使用「手动 edit」而其他文件使用「直接 edit」。

### 影响

不影响功能，但同类约束在 4 个文件中表述不一致会降低一致性感受。

### 建议

统一为一种表述风格，建议参考 feel.md 版本（最完整：含子命令枚举 + 禁止 edit）。

---

## FAST-PASS-001：op-001 Reviewer / Feel Tester 快速通道

- **状态**：resolved
- **优先级**：low
- **阻塞**：false（快速通道标记，非阻塞）
- **提出人**：Reviewer
- **提出时间**：2026-07-05 17:04
- **关联 op**：op-001

### 验证结论

op-001（reviewer.md + feel-tester.md 快速通道）方案与实现一致性验证：

| 检查项 | 结果 |
|--------|------|
| reviewer.md 含「快速通道」节 | ✅ 通过（line 44-63） |
| feel-tester.md 含「快速验收」节 | ✅ 通过（line 32-49） |
| 三要素判定条件一致 | ✅ 通过（200行 / 全通过 / ≥80%） |
| 代码行数阈值一致（200行） | ✅ 通过 |
| 覆盖率阈值一致（80%） | ✅ 通过 |
| reviewer 命中时 blocking=false | ✅ 通过 |
| tester 命中时快速验收放行 | ✅ 通过 |
| 二者交叉引用条件一致 | ✅ 通过 |

> 注：op-001 仅修改 2 个 Markdown 文件（~20 行变更），自身满足快速通道三要素条件。

---

## 审查结论

**审查通过（review_passed）**。未发现阻塞性问题。3 条非阻塞 REV + 1 条 FAST-PASS 标记保持 open 跟踪，pipeline 可直接推进到 test_pending。

### 逐 op 结论

| OP | 状态 | REV 数 | 阻塞数 |
|-----|------|--------|--------|
| op-001 | ✅ 通过 | 1 (FAST-PASS) | 0 |
| op-002 | ✅ 通过 | 1 | 0 |
| op-003 | ✅ 通过 | 1 | 0 |
| op-004 | ✅ 通过 | 1 | 0 |
| op-005 | ✅ 通过 | 0 | 0 |
| op-006 | ✅ 通过 | 0 | 0 |

### 处理记录

| 时间 | 操作者 | 说明 |
|------|--------|------|
| 2026-07-05 17:04 | Reviewer | 初审完成，提交 REV-001~003 + FAST-PASS-001 |
