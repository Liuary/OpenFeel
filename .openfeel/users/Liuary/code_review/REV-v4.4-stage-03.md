# 代码审查 — v4.4-stage-03

- **审查阶段**：v4.4-stage-03（配置优化 + Agent 提示词完善）
- **审查人**：Reviewer (GLM-5.1)
- **审查时间**：2026-07-15
- **审查范围**：HEAD~3..HEAD（3 commits: op-001/op-002/op-003）
- **涉及文件**：10 个源码文件，+253/-9 行

## 审查前提判定

| 条件 | 阈值 | 实际 | 是否满足 |
|------|------|------|----------|
| 代码量 | < 200 行 | 253 行 (+) | ❌ |
| Executor 自测 | 全部通过 | 291/291 ✅ | ✅ |
| 测试覆盖率 | ≥ 80% | 无新增测试 | ❌ |
| 产出文件 | < 5 个 | 10 个 | ❌ |

**结论**：不满足快速通道条件（代码量 > 200、无新增测试、产出文件 ≥ 5），执行完整 5 维度审查。

---

## 逐维度审查

### 1. 正确性

#### op-001: config 命令

- ✅ `get lang` / `set lang <lang>` / `list projects` 三个子命令功能正确
- ✅ `set lang` 对非法语言值（非 `zh-CN`/`en`）做了校验，`process.exit(1)` 退出
- ✅ `recordProjectLang()` 幂等性正确：已存在且语言一致则跳过写入
- ⚠️ **REV-001**: `config get lang` 子命令的 `.description()` 使用 `t('config.get.lang', getCliLang(process.cwd()))`，但 `t()` 的第二个参数是 `lang`，该值用于模板插值，会导致 description 被 `{lang}` 占位符替换为当前语言值，使帮助文本语义混乱。其他两个子命令的 description 未使用 `t()`，风格也不一致。

#### op-002: AGENTS.md 语言同步

- ✅ 首次部署（`!agentsDirHasContent && !agentsMdExists`）正确使用全局默认语言部署 AGENTS.md
- ✅ 已有项目 + `--lang` 参数时，`getLang(projectPath)` 从 `.openfeel/.info.json` 读取项目语言，与 `--lang` 对比
- ✅ 语言冲突时三种路径（force/interactive/非交互）分支正确
- ✅ `AgentsMdLangConflictError` 自定义错误类设计合理，命令层正确捕获
- ⚠️ **REV-002**: 情况 2 的分支条件 `agentsMdExists && options?.lang` 存在逻辑缺口：当 `agentsDirHasContent=true` 但 `agentsMdExists=false` 且 `options?.lang` 有值时，不会进入任何 AGENTS.md 处理分支（既不创建也不跳过），AGENTS.md 被静默忽略。应补充"已有 agents 目录但 AGENTS.md 被手动删除 + --lang 指定"的情况。
- ⚠️ **REV-003**: `recordProjectLang(projectPath, lang)` 始终记录 `lang` 参数（即 `getCliLang(targetPath)` 的三级回退结果），而非 `options?.lang` 或实际部署语言。当用户使用 `--lang en` 在中文项目上 update（加 force 覆盖）时，`recordProjectLang` 仍记录 `zh-CN`，与实际部署的 AGENTS.md 语言不一致。
- ⚠️ **REV-004**: 命令层 `update.ts` 中 `AgentsMdLangConflictError` 的 `process.exit(0)` 阻止了后续正常的框架内容更新。用户只看到冲突警告但不会得到其他文件的更新结果。

#### op-003: executor.md 模板

- ✅ 中英文模板结构完全对称：4 个必填字段一一对应
- ✅ 新增章节位置在「注意事项/Notes」之前，不破坏原有结构
- ✅ JSON 示例和表格内容一致

### 2. 规范性

- ✅ 文件头部中文注释齐全
- ✅ 公共方法有 JSDoc 注释
- ✅ 使用早返回模式
- ✅ 条件体有大括号
- ✅ `const` 优先
- ⚠️ **REV-005**: `config.ts` 中 `set lang` 的 `.description()` 使用硬编码中文 `'修改全局默认语言 (zh-CN 或 en)'`，未使用 `t()` 国际化，与同文件其他子命令的风格不一致。
- ⚠️ **REV-006**: `update.ts` 中非交互模式的 `console.warn` 使用硬编码英文字符串（第 1289 行），未走 `t()` 国际化体系，与同模块其他错误消息的处理方式不一致。

### 3. 安全性

- ✅ `setGlobalConfig` 写入前 `mkdirSync` 确保目录存在
- ✅ `recordProjectLang` 的 `try-catch` 不泄露文件系统信息
- ✅ `getGlobalConfig` 对缺失字段有默认值回退
- ✅ `config set lang` 严格白名单校验，不接受任意字符串
- ✅ 无注入风险

### 4. 完整性

- ✅ 6 个 i18n 键（中英文）对称添加
- ✅ i18n.ts 中 zhDomains/enDomains 均追加 config 域
- ✅ cli/index.ts 注册 config 命令
- ⚠️ **REV-007**: 无新增单元测试。3 个 op 涉及新命令、新函数、新错误类，但无对应测试覆盖。`recordProjectLang()`、`AgentsMdLangConflictError`、`config` 命令组的 get/set/list 均无测试。这是审查中最重要的完整性缺失。

### 5. 一致性（内部模式一致性）

**同类实体**：3 个 config 子命令（get lang / set lang / list projects）——触发内部模式一致性检查。

| 检查项 | 结果 |
|--------|------|
| 校验风格 | ⚠️ `set lang` 手动 if 校验，`get lang`/`list projects` 无校验——校验风格一致（仅 set 需要校验，合理） |
| 命名规范 | ✅ 一致使用 `cliLang`/`lang`/`projLang` |
| 错误处理 | ⚠️ `set lang` 用 `console.error + process.exit(1)`，`list projects` 用 `console.log + return`——输出函数混用 `error`/`log`，但语义正确 |
| 返回模式 | ✅ 均为 void action，通过 console 输出 |
| 日志约定 | ✅ 一致使用 `console.log/error`，无日志框架——与项目现有 CLI 命令一致 |

**同类实体**：update.ts 中 3 个 AGENTS.md 处理分支——触发检查。

| 检查项 | 结果 |
|--------|------|
| 校验风格 | ✅ 一致使用 if-else 分支 |
| 命名规范 | ✅ 一致 |
| 错误处理 | ⚠️ 三条路径的"错误处理"不一致：force→覆盖（正常），interactive→throw，非交互→console.warn 硬编码英文 |
| 返回模式 | ✅ 一致 push 到 created/updated/skipped |
| 日志约定 | ⚠️ 非交互分支用 `console.warn` 硬编码，interactive 分支用 `throw` 传递到命令层用 `t()` |

---

## REV 条目汇总

### REV-001: config get lang 的 description 误用 t() 模板插值

- **状态**：pending
- **优先级**：medium
- **blocking**：false
- **描述**：`config get lang` 子命令的 `.description(t('config.get.lang', getCliLang(process.cwd())))` 会将 `{lang}` 占位符替换为实际语言值，导致帮助文本语义混乱。且与同文件其他子命令（`set lang` 用硬编码中文字符串、`list projects` 用硬编码中文）风格不一致。建议统一使用 `t()` 但不传插值参数，或统一使用纯字符串。

### REV-002: agentsDirHasContent=true 且 agentsMdExists=false + --lang 时的逻辑缺口

- **状态**：closed
- **优先级**：high
- **blocking**：true
- **描述**：当 `agentsDirHasContent=true`（已有 agents/ 目录有内容）但 `agentsMdExists=false`（AGENTS.md 被手动删除）且 `options?.lang` 有值时，不满足情况 1（`!agentsDirHasContent` 为 false）、不满足情况 2（`agentsMdExists` 为 false）、不满足情况 3（`agentsMdExists` 为 false），AGENTS.md 既不创建也不跳过，被静默忽略。应补充此边界情况的处理逻辑。

### REV-003: recordProjectLang 记录的语言可能与实际部署语言不一致

- **状态**：closed
- **优先级**：high
- **blocking**：true
- **描述**：`recordProjectLang(projectPath, lang)` 始终使用 `updateProject` 的 `lang` 参数（即 `getCliLang()` 的三级回退结果），而非 `options?.lang`（用户通过 `--lang` 指定的实际部署语言）。当用户使用 `--lang en --force` 在中文项目上强制覆盖时，AGENTS.md 被部署为英文，但 `recordProjectLang` 记录的仍是中文。应根据实际部署语言而非回退语言来记录映射。

### REV-004: AgentsMdLangConflictError 导致 update 后续框架更新被中断

- **状态**：closed
- **优先级**：high
- **blocking**：true
- **描述**：`update.ts` 命令层捕获 `AgentsMdLangConflictError` 后执行 `process.exit(0)`，直接终止进程。此时 `updateProject()` 内 AGENTS.md 之后的框架内容更新（Agent 定义、Skill 定义、core.md 等）尚未执行，用户无法获得任何更新结果。建议将冲突作为警告输出后继续执行框架内容更新（跳过 AGENTS.md 但不中断流程），或将 `throw` 改为返回信号让命令层决定是否继续。

### REV-005: config set lang 的 description 未使用 t() 国际化

- **状态**：closed
- **优先级**：low
- **blocking**：false
- **描述**：`config set lang` 的 `.description('修改全局默认语言 (zh-CN 或 en)')` 使用硬编码中文，无论 CLI 当前语言设置如何始终显示中文。与 op-001 方案中要求使用 `t()` 国际化的设计意图不一致。

#### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|
| 2026-07-15 | Executor | closed | 已知限制，不影响功能，当前版本暂不修复 |

### REV-006: update.ts 非交互分支 console.warn 使用硬编码英文

- **状态**：closed
- **优先级**：low
- **blocking**：false
- **描述**：`update.ts` 第 1289 行非交互模式下的 `console.warn('[update] AGENTS.md language mismatch: ...')` 使用硬编码英文，未走 `t()` 国际化体系。同模块其他错误消息（如 `AgentsMdLangConflictError` 在命令层的处理）使用了 `t('update.langConflict', ...)`，风格不一致。

#### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|
| 2026-07-15 | Executor | closed | 已知限制，不影响功能，当前版本暂不修复 |

### REV-007: 无新增单元测试

- **状态**：closed
- **优先级**：high
- **blocking**：true
- **描述**：3 个 op 涉及新命令组（`config get/set/list`）、新函数（`recordProjectLang`）、新错误类（`AgentsMdLangConflictError`）、新的 AGENTS.md 语言同步逻辑（3 条分支），但未新增任何单元测试。现有 291 项测试全部是旧有功能测试，对本次变更的覆盖率为 0%。建议至少覆盖：(1) `recordProjectLang` 幂等性和语言更新；(2) `AgentsMdLangConflictError` 各分支（force/interactive/非交互）的行为；(3) `config` 命令组的基本功能。

---

## 审查结论（第二轮验收）

**4 个阻塞 REV（002/003/004/007）全部 closed，审查通过。2 条 low REV（005/006）后标记为 closed（已知限制）。**

| # | 严重性 | 摘要 | 二轮状态 |
|---|--------|------|----------|
| REV-001 | medium/non-blocking | config get lang description 误用 t() 模板插值 | pending（非阻塞） |
| REV-002 | high/blocking → closed | agentsDir 有内容但 AGENTS.md 不存在时的逻辑缺口 | ✅ 新增 2b 分支 |
| REV-003 | high/blocking → closed | recordProjectLang 记录语言与实际部署语言可能不一致 | ✅ options?.lang ?? lang |
| REV-004 | high/blocking → closed | 语言冲突导致 update 后续框架更新被中断 | ✅ warn+skip 替代 throw+exit |
| REV-005 | low/non-blocking → closed | config set lang description 未国际化 | 已知限制，关闭不修 |
| REV-006 | low/non-blocking → closed | 非交互分支 console.warn 硬编码英文 | 已知限制，关闭不修 |
| REV-007 | high/blocking → closed | 无新增单元测试 | ✅ 新增 7 个测试 298/298 |

**阶段状态建议**：`review_passed`，4 条阻塞 REV 全部 closed，可推进到下一阶段。
