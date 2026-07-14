# 代码审查索引

## v4.3-stage-01（模板文件化重构 + 纪律强化）

| REV | 标题 | 状态 | 优先级 | blocking |
|-----|------|------|--------|----------|
| REV-001 | op-007/008 依赖链不完整，应依赖 op-006 而非 op-005 | pending | high | true |
| REV-002 | feel.md 日志纪律插入位置锚点不精确 | pending | medium | true |
| REV-003 | op-005 CRLF 归一化缺失导致 B64 往返不一致 | pending | high | true |
| REV-004 | op-006 步骤 3/5 原子性和消费方不明确 | pending | medium | true |
| REV-005 | 三种模板存储格式不一致（B64 vs 模板字符串） | pending | medium | false |
| REV-006 | loadAgentTemplate 语言回退逻辑不完整，错误信息不准确 | pending | medium | true |
| REV-007 | op-002 模板字符串反转义方案不明确 | pending | medium | true |
| REV-008 | op-007 目录存在性描述与实际不符 | pending | low | false |
| REV-009 | templates-data/ git 管理策略未明确 | pending | low | false |
| REV-010 | op-006 遗漏 init.ts 等其他消费方验证 | pending | high | true |

### 统计
- 总计：13 条（方案审查 10 + 代码审查 3）
- 阻塞：7 条 | 非阻塞：6 条
- pending：13 | fixing：0 | resolved：0 | closed：0

#### 代码审查新增（2026-07-12）

| REV | 标题 | 状态 | 优先级 | blocking |
|-----|------|------|--------|----------|
| REV-011 | loadAgentTemplate 回退后错误信息 lang 值不准确 | pending | medium | false |
| REV-012 | templates-data/ 下冗余空子目录 | pending | low | false |
| REV-013 | loadTemplate API 对 core-instructions 返回 Base64 而非明文 | pending | medium | false |

---

## v4.3-stage-02（REV-004 修复 project.ts）

| REV | 标题 | 状态 | 优先级 | blocking |
|-----|------|------|--------|----------|
| REV-001 | 入口路径节三条路径的处理方式未细化 | closed | medium | true |
| REV-002 | 方案未显式声明技术栈节的处理策略 | closed | low | false |
| REV-003 | 自测清单缺少正向场景和边界场景 | closed | medium | true |
| REV-004 | 「目录结构节补全一致性」描述模糊 | closed | low | false |
| REV-005 | else 分支文案比方案更具体 | closed | low | false |

### 统计
- 总计：5 条
- 阻塞：2 条 | 非阻塞：3 条
- pending：0 | fixing：0 | resolved：0 | closed：5

---

## v4.3-stage-03（英文内容产出 + 双语交互）

| REV | 标题 | 状态 | 优先级 | blocking |
|-----|------|------|--------|----------|
| REV-001 | Batch 2 并行安全 — op-002/op-003 共享 build.js，deps.yaml 声明与事实不符 | pending | high | true |
| REV-002 | op-004 遗漏 init.ts 中 AGENTS.md 模板加载与语言选择联动 | pending | high | true |
| REV-003 | op-001 validateAgentDefinitions 多语言适配描述过于简略 | pending | medium | false |
| REV-004 | op-001 REV-013 修复中 loadTemplate 空值检查应在 B64 解码前 | pending | low | false |
| REV-005 | op-006 应显式标注 update.ts 中 B64 直解→loadTemplate 替换点 | pending | low | false |

### 统计
- 总计：5 条
- 阻塞：2 条 | 非阻塞：3 条
- pending：5 | fixing：0 | resolved：0 | closed：0

---

## v4.4-stage-01（i18n 基建 + CLI 国际化）

| REV | 标题 | 状态 | 优先级 | blocking |
|-----|------|------|--------|----------|
| REV-001 | buildMap 语言字段选取逻辑语义错误 | pending | high | true |
| REV-002 | project.ts 大量中文硬编码未 i18n 化 | pending | high | true |
| REV-003 | knowledge.ts 表头中文字符串未 i18n 化 | pending | medium | true |
| REV-004 | flow.ts repair/migrate 中中文硬编码字符串比较 | pending | medium | true |
| REV-005 | FlowManager.getPhaseLabels() 和 addStage() 硬编码中文 | pending | medium | false |
| REV-006 | init.ts ensureGlobalConfig 中硬编码中英文字符串 | pending | medium | false |
| REV-007 | VALID_LANGS 常量重复定义 | pending | low | false |
| REV-008 | lazyGetGlobalConfig 不必要的复杂度 | pending | low | false |
| REV-009 | flow overview Unicode box 对齐在英文模式下破坏 | pending | low | false |
| REV-010 | flow overview retry 后缀判断使用字符串比较 hack | pending | low | false |
| REV-011 | 错误消息中全角/半角冒号使用不一致 | pending | low | false |
| REV-012 | global-config.test.ts 直接操作用户 home 目录 | pending | low | false |

### 统计
- 总计：12 条
- 阻塞：4 条 | 非阻塞：8 条
- pending：12 | fixing：0 | resolved：0 | closed：0

---

## v4.1-stage-03（flow.json 多阶段状态机）

| REV | 标题 | 状态 | 优先级 | blocking |
|-----|------|------|--------|----------|
| REV-001 | migrate() dry-run 修改内存状态 | pending | medium | true |
| REV-002 | flow advance --stage 未用 requiredOption | pending | low | false |

### 统计
- 总计：2 条
- 阻塞：1 条 | 非阻塞：1 条
- pending：2 | fixing：0 | resolved：0 | closed：0
