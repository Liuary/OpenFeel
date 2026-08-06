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

## [+] CLI 国际化封装模式：t() + 键命名规范 + 模板插值 (2026-07-14)

CLI 命令输出国际化采用三层封装：

**1. 键命名规范：**
- 格式：`{domain}.{module}.{name}`（全部小写，`.`分隔层级）
- domain：12 个功能域（common/flow/init/update/project/stage/plan/knowledge/archive/roadmap/view/instructions）
- 动态字符串：key 末尾加 `Tmpl` 后缀区分（如 `flow.advance.okTmpl`），值中使用 `{var}` 占位符

**2. t() 查表函数：**
```typescript
// 静态字符串
t('flow.status.title', lang)                // → "OpenFeel 流水线状态" / "OpenFeel Pipeline Status"

// 动态模板（含变量插值）
t('flow.advance.okTmpl', lang, { stage, to }) // → "已推进: stage-01 → done"
```

**3. 字符串映射表按语言文件分离：**
```typescript
// zh-CN.ts — 中文条目
export const flow: I18nDomain = {
  'status.title': { key: 'flow.status.title', zh: 'OpenFeel 流水线状态', en: '' },
  // ...
};

// en.ts — 英文条目（键结构完全对称，仅 en 字段有值）
export const flow: I18nDomain = {
  'status.title': { key: 'flow.status.title', zh: '', en: 'OpenFeel Pipeline Status' },
  // ...
};
```

**关键约束：**
- 两语言文件的 `Object.keys()` 必须完全一致（新增 key 须双语言同步）
- t() 缺失 key 时回退 `zh-CN` 而非抛错，确保向后兼容
- 封装前应从现有代码 grep 所有 `console.log/error` 含中文的调用点，建立完整清单后逐条替换

**参见：** v4.4-stage-01 op-001/op-002/op-005、kb/architecture.md #i18n 基础设施

## [+] 语言配置三级回退链：用户级 → 项目级 → 默认值 (2026-07-14)

`getCliLang()` 实现语言偏好的三级优先级解析链：

```typescript
function getCliLang(projectPath: string): 'zh-CN' | 'en' {
  // 1. 用户级全局偏好（~/.openfeel/config.json 的 lang 字段）
  const globalConfig = getGlobalConfig();
  if (globalConfig.lang) return globalConfig.lang;

  // 2. 项目级偏好（.info.json 的 lang 字段）
  const projectLang = getLang();  // 从 .info.json 读取
  if (projectLang) return projectLang;

  // 3. 默认回退
  return 'zh-CN';
}
```

**与已有「向后兼容可选配置字段模式」的关系：**
- 两层模式互补——本条目解决"多来源优先级合并"，已有条目解决"单来源字段缺失的回退"
- 两者均使用 `??` 运算符（非 `||`），确保空字符串也触发回退
- 写入侧遵循已有原则：仅在有明确用户意图时才写入新字段，不强制覆盖已有值

**参见：** v4.4-stage-01 op-003/op-004、kb/patterns.md #向后兼容的可选配置字段模式

## [+] REV 闭环双路兜底 + --force 不可绕过模式 (2026-07-14)

与已有的 REV blocking 标记模式（数据结构层——为审查条目增加 `blocking` 字段）互补，本模式实现**执行层强制校验**：

```
命令层（flow.ts advance 命令）   ← 双路兜底 A：提前校验 + 丰富 CLI 错误输出
        │
        ▼
核心层（flow-manager.ts）       ← 双路兜底 B：last resort，直接 throw Error
```

**实现要点：**

```typescript
// flow.ts — 命令层兜底（含 --force 处理）
if (options.to === 'done' && options.stage) {
  const blockingOpen = allReviews.filter(r => r.blocking !== false && r.status === 'open');
  if (blockingOpen.length > 0) {
    // --force 仅降级日志级别（warn vs error），仍拒绝推进
    if (options.force) console.warn('--force 已指定，但 REV 安全检查不可绕过');
    console.error(`错误：${blockingOpen.length} 个阻塞 REV 未解决`);
    process.exit(1);
  }
}

// flow-manager.ts — 核心层兜底（无 --force 概念，直接 throw）
if (targetPhase === 'done') {
  const blockingOpen = stageReviews.filter(r => r.blocking !== false && r.status === 'open');
  if (blockingOpen.length > 0) throw new Error(`无法推进到 done：${blockingOpen.length} 个阻塞 REV`);
}
```

**安全原则：**
- `--force` 可跳过 phase 非法校验和阶段跳跃，但**不可绕过 REV 阻塞检查**
- 流水线安全不应存在后门——若确有 low 优先级 REV 故意不修，应先通过 `flow review resolve` 或修改 REV 的 `blocking` 标记
- 两路校验逻辑需保持同步，命令层提供更丰富的错误输出，核心层作为最后防线

**参见：** v4.4-stage-02 op-002、kb/patterns.md #REV blocking 标记模式、kb/patterns.md #Executor 前置校验三步模式

## [+] 流水线节点触发日志骨架自动创建模式 (2026-07-14)

在流水线推进到关键 phase 时，自动在私域日志目录创建带日期前缀的空骨架文件，将"日志强制落档"从 Agent 自律升级为流水线基础设施：

```typescript
// flow-manager.ts — advanceStagePhase 中关键节点触发
if (targetPhase === 'exec_running' || targetPhase === 'review_pending' || targetPhase === 'test_pending') {
  this.logSkeleton.createSkeleton(stageName, targetPhase);
}
```

**骨架文件格式：**
- 路径：`.openfeel/users/{username}/log/{yyyy}/{MM}/{dd}/{date}-001-template.md`
- 内容：含模板提示的 Markdown 骨架（标题、操作摘要占位、关键文件占位）
- Agent 只需填充内容，无需手动创建文件和目录

**优势：**
- 消除"日志全空"的常见问题——骨架已创建，Agent 仅需填充
- 与公域日志降噪协同：私域记录过程（骨架→填充），公域仅记录里程碑
- 不影响已有 Agent prompt（文件已存在，Agent 按原有流程读写即可）

**参见：** v4.4-stage-02 op-004、kb/architecture.md #公域日志批量聚合策略

## [+] i18n 域扩展与 config 命令组模式 (2026-07-15)

当在已有 i18n 基础设施的项目中新增 CLI 命令组时，遵循「域扩展 + Commander 子命令 + 原子操作」三层模式：

**1. i18n 域扩展：**
- 新增功能域（如 `config`），在 `zh-CN.ts` 和 `en.ts` 中对称添加 `I18nDomain` 导出
- 每个域内键名遵循 `{domain}.{module}.{name}` 命名规范
- 在 `i18n.ts` 的 `zhDomains` 和 `enDomains` 数组中追加新域

**2. Commander 子命令组：**
```typescript
const configCmd = program.command('config');
configCmd
  .command('get-lang')                    // get 操作：读取并显示
  .action(() => { ... });
configCmd
  .command('set-lang <lang>')             // set 操作：校验 + 写入 + 回显
  .action((lang) => { ... });
configCmd
  .command('list-projects')               // list 操作：遍历 KV 表并格式化输出
  .action(() => { ... });
```

**3. 原子操作原则：**
- 全局配置读写通过 `identity.ts` 的工具函数（`getGlobalConfig()` / `setGlobalConfig()`）暴露
- 命令层不直接 `readFile` / `writeFile` JSON 文件，避免格式错误和数据不一致
- 与已有 CLI 原子管理模式互补——本条目聚焦命令组结构，已有条目覆盖全局原则

**参见：** v4.4-stage-03 op-001、kb/patterns.md #CLI 原子管理模式、kb/patterns.md #CLI 国际化封装模式

## [+] Agent 提示词中的产出最小模板约束模式 (2026-07-15)

在 Agent 提示词模板中嵌入产出物最小模板要求，从 prompt 层面约束 AI Agent 的输出质量，确保跨 Agent/跨语言产出同质化：

**1. 独立章节嵌入：**
在 Agent prompt（如 `executor.md`）中以独立 `## 模板要求` 章节明确最小字段约束，不与核心逻辑混杂。

**2. 结构化约束表述：**
- 用表格列出必填字段、要求、说明（三列结构）
- 提供完整的 JSON 示例作为参考模板
- 明确 Agent 可扩展但不可遗漏的原则

**3. 中英文对称同步：**
- 两语言模板文件的字段要求完全一致（仅描述语言不同）
- 新增语言时零代码变更（遵循构建脚本多语言循环生成模式）

**示例（package.json 最小模板）：**
```json
{ "name": "project-name", "version": "1.0.0", "type": "module", "scripts": { "test": "vitest run" } }
```

**适用场景：**
- 任何希望 Agent 自动生成的配置文件（package.json、tsconfig.json、.env 模板等）
- 跨语言项目需确保中英 Agent 产出一致时
- 新项目初始化模板标准化

**参见：** v4.4-stage-03 op-003、kb/patterns.md #构建脚本多语言循环生成模式

## [+] 新增 Agent 全链路更新清单模式 (2026-08-07)

在 OpenFeel 9 Agent 体系中新增 Agent 时，需按以下清单逐项更新，确保全链路一致。遗漏任一项将导致构建失败、测试失败或知识库检索断裂。

### 必须更新的文件清单

| 序号 | 文件 | 操作 | 说明 |
|:--:|------|:--:|------|
| 1 | `src/core/templates-data/agents/{lang}/new-agent.md` | **新建** | 中英双语源模板（zh-CN + en），结构对称 |
| 2 | `.opencode/agents/new-agent.md` | **新建** | 部署定义，内容与 zh-CN 模板同步 |
| 3 | `AGENTS.md` | **修改** | 标题计数 + 总览表格 + 调度列表（三处同步） |
| 4 | `.opencode/instructions/core.md` | **修改** | 路径自校验范围 + Feel 调度列表（两处补充） |
| 5 | `.opencode/skills/model-check/SKILL.md` | **修改** | 角色映射回退表新增条目 |
| 6 | `.openfeel/kb/architecture.md` | **修改** | 新增架构决策条目 |
| 7 | `.openfeel/kb/index.md` | **修改** | Agent 计数 + 分类概览条目数 + 摘要表 |
| 8 | `test/core/template-loader.test.ts` | **修改** | Agent 计数断言更新 |
| 9 | `test/core/update.test.ts` | **修改** | Agent 计数断言 + skipped 计数更新 |

### 无需修改的文件

| 文件 | 原因 |
|------|------|
| `build.js` | 构建脚本自动遍历 `templates-data/agents/{lang}/` 下所有 .md 文件，新增 Agent 零代码变更 |
| `src/core/template-loader.ts` | 由 `npm run build` 自动生成，不手动编辑 |
| `src/core/update.ts` | 由 `npm run build` 自动注入 Skill 定义 |

### Agent 模板规范要点

1. **Frontmatter 五字段齐全**：description / mode / model / color / permission（全部必填）
2. **权限声明顺序**：统一使用 `bash → read → glob → grep`（bash-first 惯例），与现有 8 个 Agent 保持一致
3. **颜色选型**：从现有 9 色中选未被占用的色值，语义与 Agent 角色关联
4. **正文结构**：核心职责（3-4 项）/ 调起方式 / 输出规范 / 能力边界（能做 + 不做）/ 模型选择 / 注意事项
5. **部署同步**：`.opencode/agents/` 下的部署定义内容须与 `zh-CN` 源模板**逐字符一致**

### 构建验证流程

```
新增模板文件 → npm run build（模板注入 + 一致性校验） → npm test（断言更新 + 无回归）
```

**注意**：Agent 计数变更必然导致 `template-loader.test.ts` 和 `update.test.ts` 中的硬编码断言过期（测试失败数 = 受影响的断言数），属预期变更而非回归——更新断言后应恢复全量通过。

### 实战验证

v4.6-stage-01 新增 Vision Agent 时严格按此清单执行，一次性通过构建（`npm run build` 退出码 0）、模板一致性校验（18/18 一致）、测试（更新断言后 298/298 全通过）。3 条 REV 全部通过 op-009 修复闭环（权限顺序 + bash 用途说明 + 摘要表补全）。

**参见：** v4.6-stage-01（Vision Agent 全链路落地）、kb/architecture.md #8→9 Agent 体系扩展：Vision 视觉官

## [+] YAML Document API 增量修改模式 (2026-08-07)

当需要程序化修改 YAML 配置文件时，若文件包含注释或精细结构需保留，应使用 `yaml` 库的 Document API 做增量修改，而非 `parse()` → 修改对象 → `stringify()` 的全量重建：

```typescript
import { parseDocument } from 'yaml';

// 1. 读取原始 YAML（文件不存在时创建空文档）
const doc = existsSync(configPath)
  ? parseDocument(readFileSync(configPath, 'utf-8'))
  : parseDocument('');

// 2. 原地修改：setIn 在路径不存在时自动创建中间节点
doc.setIn(['defaults', key], value);

// 3. 序列化写回（注释与原始结构完整保留）
writeFileSync(configPath, doc.toString(), 'utf-8');
```

**关键要点：**
- `parseDocument()` 解析为内部 Document 节点树，保留注释、空行、原始引号风格
- `doc.setIn(path, value)` 支持深层嵌套路径（如 `['defaults', 'auto_advance']`），中间节点不存在时自动创建
- `doc.toString()` 将修改后的节点树序列化回 YAML 字符串，注释和结构完整保留
- **配合 Zod 校验**：在 `setIn` 前通过 `ConfigDefaultsSchema.shape[key].parse(value)` 做局部校验，确保写入值与 Schema 一致

**对比 `parse() → stringify()` 方案的劣势：**
- 后者会丢弃所有注释（如 `# 执行模式说明...`）
- 后者会丢失键的顺序和空行格式
- 后者需手动拼接注释和结构，代码冗长且容易与原始格式不一致

**适用场景：**
- 程序化读写带有大量注释的 YAML 配置文件（如 `config.yaml`、`pipeline.yaml`）
- 需要保持 Git diff 干净——仅修改的键值对出现在 diff 中，相邻注释和空行不受影响
- 与 CLI 原子管理模式互补：本条目聚焦 YAML 写入技术方案，CLI 原子管理覆盖"Agent 不直接 edit 数据文件"的原则

**参见：** v4.6-stage-02 op-001（config.ts setConfigValue）、kb/patterns.md #CLI 原子管理模式

## [+] 过度设计审查子维度扩展模式 (2026-08-07)

在已有的 Reviewer 审查五维度体系基础上，为特定父维度新增细化子维度，实现更精确的审查覆盖：

```markdown
| 规范性 | — | 是否符合项目编码规范（AGENTS.md） |
| | 过度设计 | 是否存在无复用需求的抽象层、设计模式包装或过度工程化（参见 AGENTS.md 第 2 条） |
```

**模式要点：**

1. **父子关系**：子维度是父维度的细化——「过度设计」天然归属于「规范性」（因为 AGENTS.md 的反过度设计规则本身就是编码规范的一部分），以独立子维度列出可确保不被遗漏
2. **中英双语同步**：子维度变更须在 `zh-CN/reviewer.md` 和 `en/reviewer.md` 中同步修改，内容语言各自独立但结构一致
3. **模板管线自动传播**：Reviewer 模板变更由 `build.js` 自动注入 `template-loader.ts`，无需手动更新构建脚本（参见 kb/architecture.md #多语言模板数据管线）
4. **引用溯源**：子维度描述中引用触发规则的具体位置（如 `AGENTS.md 第 2 条`），确保审查者能快速定位约束原文

**与「审查五维度体系」的关系：**
- 已有条目定义了五维度框架和「一致性」的两个子维度（外部/内部模式）
- 本条目展示的是向「规范性」维度新增子维度的扩展模式——子维度扩展不限于特定父维度
- 新增子维度的时机：当项目编码规范中某条规则的违反检测需要显式提醒（而非隐含在通用检查中），即可独立为子维度

**参见：** v4.6-stage-02 op-006（Reviewer 过度设计审查维度）、kb/patterns.md #审查五维度体系、kb/patterns.md #多语言模板数据管线

## [+] 全局跨项目用户画像 YAML 配置模式 (2026-08-07)

当需要跨项目共享用户偏好（语言、自动化设置、审查模式等）时，采用 `~/.config/{tool}/profile.yaml` 约定路径（类比 Git `~/.gitconfig`），结合 Zod Schema 校验 + 安全默认值 + 深度合并策略实现读写：

```typescript
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';

// 路径约定：遵循 XDG ~/.config/ 约定，不依赖任何平台机制
function getProfilePath(): string {
  return join(homedir(), '.config', 'openfeel', 'profile.yaml');
}

// 读取：文件不存在 → 返回完整默认值；文件存在 → Zod 校验 + 缺失字段回填
export function readProfile(): Profile {
  const profilePath = getProfilePath();
  if (!existsSync(profilePath)) return deepClone(DEFAULT_PROFILE);
  const raw = parseYaml(readFileSync(profilePath, 'utf-8'));
  const parsed = ProfileSchema.parse(raw) as Profile;
  return {
    user: { ...DEFAULT_PROFILE.user, ...(parsed.user ?? {}) },
    preferences: { ...DEFAULT_PROFILE.preferences, ...(parsed.preferences ?? {}) },
    history: { ...DEFAULT_PROFILE.history, ...(parsed.history ?? {}) },
  };
}

// 写入：自动创建 ~/.config/openfeel/ 父目录，全量 YAML 序列化
export function writeProfile(profile: Profile): void {
  const profilePath = getProfilePath();
  mkdirSync(dirname(profilePath), { recursive: true });
  writeFileSync(profilePath, stringifyYaml(profile), 'utf-8');
}
```

**关键要点：**

- **路径约定**：`homedir()/.config/{tool}/profile.yaml`，复用 XDG 用户配置目录约定，跨平台统一
- **Zod Schema 硬化**：Profile 由 `user`、`preferences`、`history` 三块组成，全部 optional + `.passthrough()` 允许扩展
- **深度合并默认值**：文件缺失字段不回退 null/undefined，而是逐节合并 `DEFAULT_PROFILE` 对应节的默认值——确保调用方总拿到完整可用对象
- **异常安全**：YAML 解析失败或 Zod 校验失败时静默返回完整默认值，不抛异常中断 Agent 启动流程
- **与 YAML Document API 互补**：profile.yaml 为新建文件无注释需保留 → 用 `stringify` 全量写入即可；config.yaml 有注释需保留 → 用 `parseDocument()+setIn()` 增量修改

**适用场景：**

- CLI 工具需要跨项目记住用户偏好（类比 `git config --global`）
- Agent 启动时需加载用户的全局设置（语言、自动化偏好、沟通风格等）
- 多个相关项目共享同一套用户画像

**参见：** v5.0-stage-01 op-001（config.ts）、kb/patterns.md #YAML Document API 增量修改模式、kb/patterns.md #向后兼容的可选配置字段模式

## [+] Agent 记忆生命周期三层模式 (2026-08-07)

在 Agent prompt 中设计持久记忆体系时，遵循三阶段生命周期模式，确保跨会话决策连续性：

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  记忆加载        │ →  │  决策追加        │ →  │  会话结束写入    │
│  (启动时)        │    │  (会话中)        │    │  (结束时)        │
├─────────────────┤    ├─────────────────┤    ├─────────────────┤
│ 1. 全局画像       │    │ 技术决策发生时     │    │ 1. 用户偏好回写   │
│ 2. 项目记忆       │    │ - [x] 格式追加    │    │ 2. 决策历史追加   │
│ 3. 合并偏好       │    │ 不覆盖已有条目     │    │ 3. 上下文快照更新 │
│ 4. 偏好回写       │    │ 四类决策判定标准   │    │ 4. 操作状态更新   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

**两层记忆架构：**

| 层级 | 存储位置 | 作用域 | 内容 |
|:--:|------|:--:|------|
| 全局画像 | `~/.config/openfeel/profile.yaml` | 跨项目共享 | 用户名、语言、自动化偏好、沟通风格、确认阈值、最近项目 |
| 项目记忆 | `.openfeel/users/{username}/dev_last.md` | 当前项目 | 上次操作状态、用户偏好快照、上下文快照、待续事项、关键决策、决策历史、经验暂存 |

**关键要点：**

- **加载顺序不可颠倒**：先全局画像（提供默认偏好）→ 再项目记忆（覆盖恢复上下文），项目级覆盖全局级
- **决策追加而非覆盖**：`- [x] {date}：{决策描述}` 格式累积追加，不覆盖既往条目。判定标准：新依赖引入 / 架构模式选择 / 用户偏好变更 / 流程调整决策
- **模板结构硬化为 prompt**：dev_last.md 7 节模板（上次操作状态 → 用户偏好 → 上下文快照 → 待续事项 → 关键决策 → 决策历史 → 经验暂存）在 core.md 中统一定义，Feel prompt 引用该模板
- **写入触发机制**：Feel prompt 中定义「会话结束写入」规则（4 步流程），Agent 不需自己判断何时写——prompt 级别强制执行

**适用场景：**

- 多 Agent 体系中需要跨会话保持决策连续性
- Agent prompt 需要定义「启动时加载什么」「会话中记录什么」「结束时写入什么」的三段式流程
- 记忆体系需支持渐进扩展（新增记忆节时遵循模板扩展模式，参见 core.md 模板更新规则）

**参见：** v5.0-stage-01 op-003（feel.md + core.md）、kb/patterns.md #新增 Agent 全链路更新清单模式

## [+] 流水线归档自动 git commit 模式 (2026-08-07)

当 `flow advance --to done` 推进阶段到完成时，在 `flow-manager.ts` 中自动执行 git 提交，将归档点纳入版本控制：

```typescript
private autoCommitOnDone(stageName: string): void {
  const lang = getCliLang(process.cwd());
  try {
    const msg = `chore: 阶段归档 ${stageName}`;
    execSync(`git add -A && git commit -m "${msg}"`, { stdio: 'pipe' });
    console.log(t('flow.advance.gitCommitOkTmpl', lang, { stage: stageName }));
  } catch {
    // 不在 git 仓库 / git 不可用 / 无变更时静默跳过，不阻塞 done 推进
    console.log(t('flow.advance.gitCommitSkipTmpl', lang, { stage: stageName }));
  }
}
```

**设计要点：**
- **触发时机**：`endStage()` 完成后、`advanceStagePhase` 返回前，仅在 `targetPhase === 'done'` 时触发
- **静默降级**：非 git 仓库、git 不可用或无变更时 catch 异常、输出跳过信息，不阻塞 done 推进——归档完成不应因版本控制问题而失败
- **i18n 覆盖**：成功提交和跳过场景均有对应 i18n 消息键（`gitCommitOkTmpl` / `gitCommitSkipTmpl`），zh-CN + en 双语
- **与归档流程解耦**：git 提交失败不影响阶段状态迁移——`done` 仍然正常写入 flow.json，确保流水线鲁棒性
- **Commit 格式**：`chore: 阶段归档 {stageName}`，便于 git log 中快速定位各阶段归档点

**参见：** v5.1-stage-01、kb/architecture.md #Feel 调度 + openfeel CLI 推进模型

## [+] Agent 提示词编号一致性审计模式 (2026-08-07)

当进行 Agent 提示词格式统一治理时，按以下流程审计和修复结构性问题：

**审计流程：**
1. 全量扫描 `templates-data/agents/{lang}/*.md` 所有 Agent 源模板
2. 检查结构性一致性问题：重复编号（如两个 `4.` 条目）、格式漂移、缩进不一致
3. 修复在**源模板层**（templates-data/）进行，传播路径：`build.js → template-loader.ts → .opencode/agents/`

**典型问题——feel.md 编号漂移：**
原 feel.md 中「决策权」和「自动推进决策纪律」形成两个 `4.` 编号——前者描述 Feel 核心能力，后者描述自动推进决策流程。修复为独立的顺序编号，确保结构清晰。此类问题源于多轮迭代中独立追加条目而未检查编号连续性。

**关键要点：**
- 修复在源模板层（templates-data/）而非构建产物或部署目录——确保修复不被后续构建覆盖
- 构建后校验：`npm run build` 自动传播修改，然后对比 `.opencode/agents/` 部署文件确认一致性
- 多语言同步：zh-CN 和 en 模板编号结构必须完全对应，修改一处须同步另一处

**参见：** v5.1-stage-01、kb/patterns.md #构建脚本多语言循环生成模式

## [+] AGENTS.md 模板四节同步机制 (2026-08-07)

AGENTS.md 源模板（`templates-data/agents-md/{lang}.md`）在基础行为约束之上，需保持四节附录结构完整。新增或修改内容时须在 zh-CN 和 en 两语言文件中同步更新。

**标准四节结构（模板附录）：**

| 节 | 内容 | 职责 |
|:--:|------|------|
| 跨 Agent 工具使用约束 | 统一工具规范（todowrite/question/task/skill）、使用优先级、各 Agent 职责边界、Feel 调度约束 | 定义所有 Agent 的工具使用准则，防止越界操作 |
| 9 Agent 体系总览 | 完整 Agent 表格（角色/驱动模型/调起方式）+ Planner/Archiver 写入约束 | 提供项目 Agent 全景视图，新成员快速了解体系 |
| 动态规则 | dev_core.md 的 `[+]` / `[-]` 标记管理机制 | 说明动态规则沉淀位置和启用/禁用机制 |
| 项目流程工具 | openfeel CLI 命令参考速查表（flow/stage/plan/knowledge 子命令） | 提供 CLI 能力菜单，降低查阅门槛 |

**同步机制：**
- `npm run build` 将 agents-md 模板注入 `template-loader.ts`（与其他 Agent 模板共用管线）
- `openfeel update` 读取 `loadTemplate(lang, 'agents-md')` 部署到项目根 `AGENTS.md`
- 两语言文件内容语言各自独立但结构（章节标题、表格列数、命令列表）完全对称——新增节或命令时须双语言同步修改
- 设计原则：AGENTS.md 仅保留项目级行为约束，流程规则由 CLI 工具动态注入（"提示词瘦身，流程入工具"）

**参见：** v5.1-stage-01、kb/architecture.md #多语言模板数据管线、kb/patterns.md #双语 CLI 交互模式
