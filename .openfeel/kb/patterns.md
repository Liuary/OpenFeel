# 代码模式

> 使用 [+] / [-] 标记管理启用/禁用状态。只能标记禁用不能删除。

## [+] Phase Zod enum 硬化模式 (2026-06-27)

将动态 `string` 类型的 Phase 字段硬化为 Zod enum，在数据入口处即拒绝非法值：

```typescript
// 之前：动态 string，任意值均可写入
phase: z.string()

// 之后：Zod enum，非法值在 parse 阶段即报错
phase: z.enum(['plan_pending', 'plan_doing', ...])
```

**配套机制：**
- `fuzzyCorrectPhase(input: string): PipelinePhase` — 模糊修正用户输入为合法 Phase（去除首尾下划线、后缀匹配、别名映射）
- `validate()` 返回 `ValidationResult` 分离 errors 和 warnings，`valid` 仅基于 errors
- `extraCorrections` 映射表需严格审核语义正确性（如 `exec_pending` 不应映射为 `exec_running`）

## [+] ValidationResult errors/warnings 分离模式 (2026-06-27)

验证结果应区分"硬错误"和"自动修正的警告"：

```typescript
interface ValidationResult {
  valid: boolean;       // 仅基于 errors（不含 warnings）
  errors: string[];     // 无法自动修正的硬错误
  warnings: string[];   // 已自动修正的警告（不影响 valid）
}
```

**反模式：** `validate()` 在执行自动修正后仍将 WARN 计入 errors，导致 `valid=false` 而调用方需二次调用 validate() 才得到 true。

## [+] autoFixReview 前置条件校验模式 (2026-06-27)

任何绕过常规流程的快捷方法必须自行校验前置条件：

```typescript
addAutoFixReview(opId: string, fixedBy: string) {
  // 1. 前置条件校验
  if (this.data.pipeline.phase !== 'review_failed') {
    throw new Error('自动修正仅允许在 review_failed 状态下调用');
  }
  // 2. 参数格式校验
  if (!opId.includes('.')) {
    throw new Error('opId 格式无效，需包含 stage.op 形式');
  }
  // 3. 使用正规路径而非直接赋值（确保 checkpoints 更新）
  this.advancePhase(opId, 'exec_running');
}
```

**反模式：**
- 直接赋值 `pipeline.phase = 'exec_running'` 绕过 `advancePhase()`（checkpoints 不更新）
- 不校验 opId 格式（不含 `.` 时产生空 stage 引用）

## [+] dry-run 逻辑真值处理模式 (2026-06-27)

dry-run 方法必须在所有分支正确返回 `fixed` 布尔值：

```typescript
repair(dryRun: boolean): { fixed: boolean } {
  // 分支 1：文件不存在
  if (!exists) {
    if (dryRun) return { fixed: false };  // dry-run 不能报告"已修复"
    this.createDefault(); return { fixed: true };
  }
  // 分支 2：.bak 损坏
  if (bakCorrupted) return { fixed: false };
  // 分支 3：无 .bak（一切正常）
  if (!hasBak) return { fixed: false };
}
```

**反模式：** dry-run 时跳过操作却仍返回 `fixed: true`（误报）；正常状态返回 `fixed: false` 时命令层 `exit(1)`（正常当错误）。

## [+] 文档路径绝对路径规范 (2026-06-28)

v3.2 最终确定的文档写入路径规范：
- 所有写入路径使用**绝对路径形式**：`项目根目录下的 docs/phase-{N}/`
- 知识库写入路径：`architecture.md` / `patterns.md` / `troubleshooting.md` / `setup.md`
- 项目分析报告：`docs/phase-{N}/`
- 禁止写入知识库的内容：行为约束（→ AGENTS.md）、操作流程（→ Instructions）、工作区维护规则（→ dev_core.md）

## [+] Schemer op 级依赖声明 (2026-06-28)

Schemer 产出操作方案（op-NNN）时，自动生成 `deps.yaml` 声明各 op 的依赖关系，供 Feel 并行调度使用。依赖类型：
- `hard`: 前置 op 必须完成
- `soft`: 弱依赖，警告但可启动
- `mutual_exclusion`: 互斥，串行执行

## [+] 知识库搜索增强模式 (2026-06-28)

`search-kb` 技能支持 `--limit` 和 `--offset` 参数控制返回结果数量，支持正文匹配（非仅标题索引），提升大知识库场景下的检索效率。

## [+] op 文件命名规范：仅编号，中文标题入内部 (2026-07-02)

Schemer 产出操作方案文件时，文件名格式应为 `op-NNN.md`（仅编号），中文标题写入文件内部的 `#` 行。避免 `op-NNN_中文标题.md` 导致 Feel 调度时路径拼接断链。

**配套约束**：
- deps.yaml 中 key 使用短名 `op-NNN`，Feel 据此直接拼接路径
- 若命名已有历史包袱，deps.yaml 增加 `file` 字段声明实际文件名作为桥接

## [+] Executor 强制第一步读取方案文件 (2026-07-02)

在 Executor Agent prompt 中硬化"收到任务后第一条操作必须是 `read` 方案文件完整内容"。避免 Executor 走捷径（看到部署参考路径就直接复制，跳过方案步骤）。

**之前问题**：Feel 调度时将方案内容嵌入 prompt，Executor 直接凭 prompt 推断执行，未实际读取文件。

## [+] deps.yaml 应声明实际文件名 (2026-07-02)

当 op 文件名与 key 不一致时（如历史遗留的 `op-NNN_中文.md`），deps.yaml 应增加 `file` 字段声明实际文件名。Feel 调度前应 glob 校验文件存在性，失败时输出实际文件列表。

## [+] KB 检索注入 Agent 模式 (2026-07-05)

在 planner/schemer/executor 三者中统一注入 KB 检索步骤，采用同位置、同结构、对称内容的模式：

- **位置**：均在「会话启动」节末尾（程序性步骤的最后位置）
- **触发条件**：本地决策需要参考项目已有模式/架构时
- **实现方式**：`load skill check-kb` → 输入 ""（自动按上下文推断分类）
- **兜底**：若 check-kb 未找到相关条目，继续执行而非阻塞

```markdown
### KB 检索
收到任务后，若任务涉及代码编写或架构决策，应首先 `load skill check-kb` 检索相关经验。
```

此模式确保三个上游 Agent 在决策前都能访问知识库，同时不阻塞流水线推进。

## [+] Executor 前置校验三步模式 (2026-07-05)

Executor 在执行 op 任务前必须完成三步前置校验，不完整时拒绝执行：

```
步骤 1: op 方案完整性校验
  1. 根据 op-id 读取对应方案文件
  2. 校验方案包含：标题(#)、目标、执行步骤、（可选）验收条件
  3. 不完整 → 输出缺失项，标记为阻塞 → Feel 介入

步骤 2: Phase 合法性校验
  1. 读取 .openfeel/flow.json → 确认 pipeline.phase 在允许执行范围内
  2. phase 非法 → 输出当前状态 + 允许值，拒绝执行

步骤 3: 操作合法性校验（双路兜底）
  3a. CLI 优先：openfeel flow health --quick
  3b. 手动兜底：读取 FlowManager 内置 transitions 表比对
```

**反模式**：Executor 在无方案文件时自行推断执行步骤（见"强制第一步读方案"条目）。

## [+] REV blocking 标记模式 (2026-07-05)

审查条目（REV）引入 `blocking` 字段区分阻塞性与非阻塞性问题：

```markdown
## REV-{NO}: {标题}
- **状态**：pending | fixing | resolved | closed
- **优先级**：high | medium | low
- **阻塞**：true | false   ← 新增字段
- **提出人**：Reviewer
```

**规则**：
- `blocking: true` → 阻塞流水线推进（`review_failed`），必须修复后才可再审
- `blocking: false` → 不阻塞流水线（可推进到下一阶段），标记为 low 优先级跟踪
- 快速通道（代码量 < 200 行 + 自测全通过）命中时，REV 默认 `blocking: false`

**数据结构**（`pipeline-schema.ts`）：
```typescript
review: z.object({
  id: z.string(),
  blocking: z.boolean().default(true),  // 新增
  // ... 其他字段
})
```

## [+] CLI 原子管理模式：Agent 不直接 edit 数据文件 (2026-07-05)

统一原则：Agent 通过 CLI 命令原子操作管理数据文件，不直接使用 `edit`/`write` 工具修改：

| 数据文件 | CLI 命令 | 禁止操作 |
|----------|----------|----------|
| `flow.json` | `openfeel flow advance/repair/status` | 直接 `edit` flow.json |
| `status.md` | `openfeel stage status/set/task` | 直接 `edit` status.md |
| `kb/*.md` | Archiver 通过 `kb-dedup.ts` 去重后写入 | 随意追加重复条目 |

**理由**：
- `edit` 工具对字符串匹配极其严格（空格/换行/编码），手动构造 `oldString` 频繁失败
- CLI 命令内置校验逻辑（phase 合法性、transitions 表等），避免数据不一致
- 与 flow.json 管理方式保持一致

## [+] 审查五维度体系 (2026-07-05)

Reviewer 审查报告统一使用五维度框架：

| 维度 | 检查内容 | 典型 REV 示例 |
|------|----------|------|
| 正确性 | 逻辑是否正确，是否与方案目标一致 | flow.json 路径错误、CLI 命令不存在 |
| 规范性 | 是否符合编码规范和 Agent 约束 | 废弃 Agent 引用残留、命名不一致 |
| 安全性 | 是否存在注入/越权/泄露风险 | 路径注入、未校验的用户输入 |
| 完整性 | 方案声明的产出是否全部到位 | pipeline.yaml 缺失、deps.yaml 遗漏 |
| 一致性 | 内部模式是否一致，与外部架构是否兼容 | 同批 Agent CLI 约束风格不统一、外部引用陈旧 |

其中「一致性」维度在 v4-stage-03 细化为两个子维度：
- **外部一致性**：产出与项目架构、全局约束的一致性
- **内部模式一致性**：同批次变更中各文件间的风格和结构一致性

## [+] 跨平台构建管线中的行尾归一化模式 (2026-07-12)

构建管线中若涉及 Base64 编解码往返（读取 UTF-8 文本 → Base64 编码 → 注入 TS 常量 → 解码比对），必须在编码前对文本执行行尾归一化：

```typescript
// 读取文件后、Base64 编码前务必归一化
let content = readFileSync(filePath, 'utf-8');
content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n'); // CRLF → LF
const b64 = Buffer.from(content, 'utf-8').toString('base64');
```

**不归一化的后果**：
- Windows 上 `readFileSync` 返回 CRLF，经 Base64 编码后与 Linux/macOS 上的 LF 编码结果不同
- 构建产物不可跨平台复现（同样的源文件在不同 OS 上产生不同的 B64 字符串）
- 一致性校验（如 `validateCoreInstruction()` 解码后比对）在跨平台时必然失败

**连带应用**：任何涉及"从文件读取 → 编码/序列化 → 存储 → 解码 → 比对"的管线都应归一化：
- 模板提取后与源文件的一致性 diff 应 `replace(/\r\n/g, '\n')` 后再对比
- 测试验收中模板源与部署目标对比时同理，避免因行尾符差异误报不一致
- 参见 v4.3-stage-01 REV-003（B64 往返时 CRLF 未归一化）和 dev_last.md（验收 diff 误报）

## [+] 统一门控 + 整节替换模式 (2026-07-12)

当 UI 输出的多个条目共享同一存在性条件时，应采用"统一门控 + 整节替换"而非逐条标注：

```typescript
// ✅ 推荐：统一门控 + 整节替换
if (!srcExists) {
  lines.push('🚪 入口路径');
  lines.push('   （未检测到项目结构——缺少 src/ 目录）');
} else {
  lines.push('🚪 入口路径');
  lines.push(`   CLI 入口:  ${join('src', 'cli', 'index.ts')}`);
  lines.push(`   包入口:    ${join('src', 'index.ts')}`);
  lines.push('   构建产物:  dist/');
}

// ❌ 反模式：逐条标注（三条输出均为相同提示，冗余且降低可读性）
lines.push('🚪 入口路径');
lines.push(srcExists ? `   CLI 入口:  ...` : '   （未检测到）');
lines.push(srcExists ? `   包入口:    ...` : '   （未检测到）');
lines.push(srcExists ? '   构建产物:  dist/' : '   （未检测到）');
```

**优势**：
- 整节替换可附带更丰富的上下文提示（如具体缺少哪个目录），优于逐条重复的"未检测到"
- 代码更清晰——一个 `if/else` 覆盖整节，而非逐行 condition ? a : b 三元嵌套
- 实现时可在方案基础上适度增强提示文案的可诊断性（如 `——缺少 src/ 目录` 比 `未检测到项目结构` 更精确定位根因），这类正向偏差经审查确认后应予以保留

> 参见 v4.3-stage-02 REV-001（统一门控决策）、REV-005（正向偏差——增强版文案）

## [+] API 回退逻辑中的错误信息应报告实际状态 (2026-07-12)

当 API 实现语言/配置回退逻辑时，错误信息或日志应报告**实际使用的值**（而非用户传入的参数），避免误导调试：

```typescript
// ✅ 推荐：追踪实际使用的语言
export function loadAgentTemplate(lang: string, agentId: string): string {
  const actualLang = AGENT_TEMPLATES[lang] ? lang : 'zh-CN';
  const langData = AGENT_TEMPLATES[actualLang];
  const content = langData?.[agentId];
  if (content === undefined) {
    throw new Error(
      `Agent template not found: agentId=${agentId} (actual lang=${actualLang}, requested=${lang})`
    );
  }
  return content;
}

// ❌ 反模式：错误信息显示用户传入的 lang，但实际查找的是回退后的 zh-CN 数据
// 当 lang='fr' 回退到 zh-CN 时，错误信息显示 lang=fr 会误导调试者去检查 fr 数据
```

**连带检查**：回退逻辑中的死代码分支也需清理——`??` 运算符已保证回退值存在时，后续的 `if (!langData) return []` 永远不会执行，应在审查中移除。

> 参见 v4.3-stage-01 REV-006（方案审查）/ REV-011（代码审查——遗留项）

## [+] 构建脚本多语言循环生成模式 (2026-07-12)

当构建脚本需要为多个语言生成相同的模板常量时，应采用「语言数组 + 循环遍历 + 统一的模板生成函数」模式，而非为每种语言单独展开代码：

```javascript
// ✅ 推荐：语言数组 + 统一循环
const langs = ['zh-CN', 'en'];
let agentDefs = '';
for (const lang of langs) {
  const dir = path.join(__dirname, `src/core/templates-data/agents/${lang}`);
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
  agentDefs += `  ${lang}: {\n`;
  for (const file of files) {
    const agentId = file.replace('.md', '');
    const content = fs.readFileSync(path.join(dir, file), 'utf-8');
    agentDefs += `    ${agentId}: \`${content}\`,\n`;
  }
  agentDefs += `  },\n`;
}

// ❌ 反模式：为每种语言单独展开（新增语言需新增代码块）
generateZhCnTemplates();
generateEnTemplates();
// 新增日语需要新增 generateJaTemplates() + 调用点 → 不可扩展
```

**关键要点：**
- 语言列表应作为可配置数组，新增语言仅需向数组追加，无需修改生成逻辑
- 每个语言目录的文件结构必须对称（同目录下同组 Agent 文件），确保循环遍历逻辑通用
- 构建脚本修改后应在自测中验证所有语言键均成功生成（检查 `AGENT_TEMPLATES` 对象的 `Object.keys()` 包含预期语言）
- npm 包仅分发编译产物（含内联模板常量的 .js），`.md` 源文件仅供构建时使用，`package.json` `files` 字段无需配置

> 参见 v4.3-stage-03 op-001（build.js 多语言扩展）、kb/architecture.md #多语言模板数据管线

## [+] 双语 CLI 交互模式：init 选择 → .info.json 持久化 → update 读取 (2026-07-12)

当 CLI 工具需要支持多语言部署时，采用「init 时交互选择 → .info.json 持久化 → update 时读取」的三段式模式：

```
openfeel init
  │
  ├─ 显示中英双语选择提示
  ├─ 用户选择 → 写入 .info.json 的 lang 字段
  ├─ 根据选择的语言加载对应 AGENTS.md 模板  ← 立即可用，不等 update
  └─ .info.json 持久化 lang 值

openfeel update
  │
  ├─ 从 .info.json 读取 lang 字段
  ├─ --lang 参数可覆盖（优先级：CLI 参数 > .info.json > 默认 zh-CN）
  └─ 按语言调用 loadAgentTemplate(lang, agentId) 部署对应语言模板
```

**设计要点：**
- init 时选择的语言应**立即**作用于 AGENTS.md 生成（而非仅持久化、留待 update 再生效），确保首次体验无缝
- update 命令的 `--lang` 参数作为可选覆盖手段，不影响已持久化的 `.info.json` 中的 `lang` 值
- 非交互环境（如 CI/CD）下 init 应自动选择默认语言并记录提示，不阻塞流程
- init 和 update 共享同一套模板加载器函数，确保内容一致性

> 参见 v4.3-stage-03 op-004（init 双语选择）、op-005（语言配置存储）、op-006（update --lang 参数）

## [+] 向后兼容的可选配置字段模式 (2026-07-12)

当需要在已有的 JSON 配置文件中新增可选字段时，应采用「只读访问器 + 默认值回退 + 不强制写入」三层保护，确保已有部署项目不受影响：

```typescript
// ✅ 推荐：只读访问器 + 默认值回退
export function getLang(): string {
  const info = readInfoJson();  // 读取 .info.json
  return info?.lang ?? 'zh-CN';  // 无字段 → 默认值，undefined 或 "" 均触发回退
}

// init 时写入新字段（仅在明确传入时）
export function ensureInfoJson(lang?: string): void {
  const info = readInfoJson() ?? { user: getGitUser() };
  if (lang) {
    info.lang = lang;  // 仅当明确传入时才写入，不强制覆盖
  }
  writeInfoJson(info);
}
```

**设计要点：**
- **读取侧**：使用 `??` 运算符提供默认值，`undefined` 或空字符串均触发回退，绝不抛出错误
- **写入侧**：仅在有明确用户意图时才写入新字段；update 命令不覆盖已有 lang 值
- **兼容性验证**：自测中应包含「旧 .info.json（无 lang 字段）→ getLang() 返回默认值且不报错」的用例
- **工具函数命名**：使用语义化的 getter（如 `getLang()`）而非直接 expose 原始字段，便于未来扩展（如增加缓存、环境变量覆盖）

**反模式：**
- `info.lang || 'zh-CN'` — 会将空字符串 `""` 视为 falsy 并回退，但空字符串可能是合法值
- 读取时对缺失字段抛出异常 — 破坏已有部署项目的向后兼容性
- update 命令用默认值强制覆写已有 lang 字段 — 用户已选择语言被重置

> 参见 v4.3-stage-03 op-005（identity.ts lang 字段 + getLang 函数）
