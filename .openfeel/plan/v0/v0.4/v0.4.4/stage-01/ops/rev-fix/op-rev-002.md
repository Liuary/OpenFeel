# op-rev-002：project.ts 中文硬编码 i18n 化

- **阶段**：v4.4-stage-01（审查修复）
- **REV 引用**：对应 REV-002（`REV-v4.4-stage-01.md`）
- **前置**：无
- **负责 Agent**：Executor
- **最多重试**：3

## 目标

将 `src/commands/project.ts` 的 `outputProjectOverview()` 函数中约 30 处中文硬编码字符串全部替换为 `t()` 查表调用，并在 `src/core/i18n-data/zh-CN.ts` 和 `en.ts` 的 `project` 域中补充缺失的 i18n key。

## 实施步骤

### 步骤 1：在 `zh-CN.ts` 的 `project` 域中新增 key

在 `src/core/i18n-data/zh-CN.ts` 的 `project` 对象中，于现有条目之后追加以下新增条目：

- [ ] [FIX] **目录结构描述模板**（9 条，`en` 字段留空 `''`）：

```typescript
// 目录结构 — 描述模板（带 {n} 变量插值）
'dir.cliTmpl':          { key: 'project.dir.cliTmpl',          zh: '— CLI 入口程序（{n} 个文件）',   en: '' },
'dir.commandsTmpl':     { key: 'project.dir.commandsTmpl',     zh: '— CLI 命令模块（{n} 个）',       en: '' },
'dir.coreTmpl':         { key: 'project.dir.coreTmpl',         zh: '— 核心逻辑（{n} 个文件）',       en: '' },
'dir.utilsTmpl':        { key: 'project.dir.utilsTmpl',        zh: '— 工具函数（{n} 个文件）',       en: '' },
'dir.agentsTmpl':       { key: 'project.dir.agentsTmpl',       zh: '— Agent 定义（{n} 个）',         en: '' },
'dir.skillsTmpl':       { key: 'project.dir.skillsTmpl',       zh: '— 技能定义（{n} 个）',           en: '' },
'dir.kbTmpl':           { key: 'project.dir.kbTmpl',           zh: '— 项目知识库（{n} 个文件）',     en: '' },
'dir.planTmpl':         { key: 'project.dir.planTmpl',         zh: '— 工作计划（{n} 个版本）',       en: '' },
'dir.codeReviewTmpl':   { key: 'project.dir.codeReviewTmpl',   zh: '— 代码审查记录（{n} 个文件）',   en: '' },
```

- [ ] [FIX] **Bug 追踪标签**（2 条）：

```typescript
'dir.bugs':             { key: 'project.dir.bugs',             zh: '— Bug 追踪',                      en: '' },
'dir.bugsNotInit':      { key: 'project.dir.bugsNotInit',      zh: '（未初始化）',                     en: '' },
```

- [ ] [FIX] **统计信息标签**（5 条）：

```typescript
'stats.tsSource':       { key: 'project.stats.tsSource',       zh: 'TS 源文件',       en: '' },
'stats.agentDefs':      { key: 'project.stats.agentDefs',      zh: 'Agent 定义',      en: '' },
'stats.cliModules':     { key: 'project.stats.cliModules',     zh: 'CLI 命令模块',    en: '' },
'stats.kbEntries':      { key: 'project.stats.kbEntries',      zh: 'KB 条目',         en: '' },
'stats.planVersions':   { key: 'project.stats.planVersions',   zh: '计划版本',        en: '' },
```

- [ ] [FIX] **入口路径标签**（3 条）：

```typescript
'entry.cli':            { key: 'project.entry.cli',            zh: 'CLI 入口',        en: '' },
'entry.pkg':            { key: 'project.entry.pkg',            zh: '包入口',          en: '' },
'entry.build':          { key: 'project.entry.build',          zh: '构建产物',        en: '' },
```

- [ ] [FIX] **技术栈标签**（7 条）：

```typescript
'tech.runtime':         { key: 'project.tech.runtime',         zh: '运行时',    en: '' },
'tech.language':        { key: 'project.tech.language',        zh: '语言',      en: '' },
'tech.cliFramework':    { key: 'project.tech.cliFramework',    zh: 'CLI 框架',  en: '' },
'tech.validation':      { key: 'project.tech.validation',      zh: '校验',      en: '' },
'tech.config':          { key: 'project.tech.config',          zh: '配置',      en: '' },
'tech.fileMatch':       { key: 'project.tech.fileMatch',       zh: '文件匹配',  en: '' },
'tech.test':            { key: 'project.tech.test',            zh: '测试',      en: '' },
```

### 步骤 2：在 `en.ts` 的 `project` 域中新增对应的英文翻译

在 `src/core/i18n-data/en.ts` 的 `project` 对象中追加相同的 key 结构，`zh` 字段留空 `''`，`en` 字段填入英文翻译。以下是 26 条 key 对应的翻译：

- [ ] [FIX] 目录结构描述模板（9 条）：

| key | en 值 |
|-----|-------|
| `project.dir.cliTmpl` | `'— CLI Entry ({n} file(s))'` |
| `project.dir.commandsTmpl` | `'— CLI Commands ({n})'` |
| `project.dir.coreTmpl` | `'— Core Logic ({n} file(s))'` |
| `project.dir.utilsTmpl` | `'— Utilities ({n} file(s))'` |
| `project.dir.agentsTmpl` | `'— Agent Definitions ({n})'` |
| `project.dir.skillsTmpl` | `'— Skill Definitions ({n})'` |
| `project.dir.kbTmpl` | `'— Knowledge Base ({n} file(s))'` |
| `project.dir.planTmpl` | `'— Work Plans ({n} version(s))'` |
| `project.dir.codeReviewTmpl` | `'— Code Reviews ({n} file(s))'` |

- [ ] [FIX] Bug 追踪标签（2 条）：

| key | en 值 |
|-----|-------|
| `project.dir.bugs` | `'— Bug Tracking'` |
| `project.dir.bugsNotInit` | `' (not initialized)'` |

- [ ] [FIX] 统计信息标签（5 条）：

| key | en 值 |
|-----|-------|
| `project.stats.tsSource` | `'TS Source Files'` |
| `project.stats.agentDefs` | `'Agent Definitions'` |
| `project.stats.cliModules` | `'CLI Command Modules'` |
| `project.stats.kbEntries` | `'KB Entries'` |
| `project.stats.planVersions` | `'Plan Versions'` |

- [ ] [FIX] 入口路径标签（3 条）：

| key | en 值 |
|-----|-------|
| `project.entry.cli` | `'CLI Entry'` |
| `project.entry.pkg` | `'Package Entry'` |
| `project.entry.build` | `'Build Output'` |

- [ ] [FIX] 技术栈标签（7 条）：

| key | en 值 |
|-----|-------|
| `project.tech.runtime` | `'Runtime'` |
| `project.tech.language` | `'Language'` |
| `project.tech.cliFramework` | `'CLI Framework'` |
| `project.tech.validation` | `'Validation'` |
| `project.tech.config` | `'Config'` |
| `project.tech.fileMatch` | `'File Matching'` |
| `project.tech.test` | `'Testing'` |

### 步骤 3：替换 `project.ts` 中硬编码字符串

在 `src/commands/project.ts` 的 `outputProjectOverview()` 函数中逐处替换。以下按 `outputProjectOverview` 函数的行号标注（以当前文件为准），**注意执行时以实际字符串内容匹配为准**：

#### 3.1 目录结构节（src/）

- [ ] [FIX] 第 90 行：`` `    ├─ cli/          — CLI 入口程序（${srcCliFiles} 个文件）` ``
  → `` `    ├─ cli/          ${t('project.dir.cliTmpl', lang, { n: String(srcCliFiles) })}` ``

- [ ] [FIX] 第 91 行：`` `    ├─ commands/     — CLI 命令模块（${srcCommandsFiles} 个）` ``
  → `` `    ├─ commands/     ${t('project.dir.commandsTmpl', lang, { n: String(srcCommandsFiles) })}` ``

- [ ] [FIX] 第 92 行：`` `    ├─ core/         — 核心逻辑（${srcCoreFiles} 个文件）` ``
  → `` `    ├─ core/         ${t('project.dir.coreTmpl', lang, { n: String(srcCoreFiles) })}` ``

- [ ] [FIX] 第 93 行：`` `    └─ utils/        — 工具函数（${srcUtilsFiles} 个文件）` ``
  → `` `    └─ utils/        ${t('project.dir.utilsTmpl', lang, { n: String(srcUtilsFiles) })}` ``

#### 3.2 目录结构节（.opencode/）

- [ ] [FIX] 第 102 行：`` `    ├─ agents/       — Agent 定义（${agentFiles} 个）` ``
  → `` `    ├─ agents/       ${t('project.dir.agentsTmpl', lang, { n: String(agentFiles) })}` ``

- [ ] [FIX] 第 104 行：`` `    └─ skills/       — 技能定义（${skillDirs} 个）` ``
  → `` `    └─ skills/       ${t('project.dir.skillsTmpl', lang, { n: String(skillDirs) })}` ``

#### 3.3 目录结构节（.openfeel/）

- [ ] [FIX] 第 115 行：`` `    ├─ kb/           — 项目知识库（${kbFiles} 个文件）` ``
  → `` `    ├─ kb/           ${t('project.dir.kbTmpl', lang, { n: String(kbFiles) })}` ``

- [ ] [FIX] 第 116 行：`` `    ├─ plan/         — 工作计划（${planDirEntries} 个版本）` ``
  → `` `    ├─ plan/         ${t('project.dir.planTmpl', lang, { n: String(planDirEntries) })}` ``

- [ ] [FIX] 第 117 行：`` `    ├─ code_review/  — 代码审查记录（${reviewFiles} 个文件）` ``
  → `` `    ├─ code_review/  ${t('project.dir.codeReviewTmpl', lang, { n: String(reviewFiles) })}` ``

- [ ] [FIX] 第 118 行：`` `    └─ bugs/         — Bug 追踪${bugDirExists ? '' : '（未初始化）'}` ``
  → `` `    └─ bugs/         ${t('project.dir.bugs', lang)}${bugDirExists ? '' : t('project.dir.bugsNotInit', lang)}` ``

#### 3.4 统计信息节（约 5 处）

- [ ] [FIX] 第 126 行：`` `   TS 源文件:   ${tsSourceFiles} 个` ``
  → `` `   ${t('project.stats.tsSource', lang)}:   ${tsSourceFiles}` `` （移除 ` 个` 后缀，统一用数字即可）

- [ ] [FIX] 第 127 行：`` `   Agent 定义:  ${agentDefs} 个` ``
  → `` `   ${t('project.stats.agentDefs', lang)}:  ${agentDefs}` ``

- [ ] [FIX] 第 128 行：`` `   CLI 命令模块: ${cliCommandModules} 个` ``
  → `` `   ${t('project.stats.cliModules', lang)}: ${cliCommandModules}` ``

- [ ] [FIX] 第 129 行：`` `   KB 条目:     ${kbEntries} 个` ``
  → `` `   ${t('project.stats.kbEntries', lang)}:  ${kbEntries}` ``

- [ ] [FIX] 第 130 行：`` `   计划版本:    ${planVersions} 个` ``
  → `` `   ${t('project.stats.planVersions', lang)}: ${planVersions}` ``

> 注意：上述统计项末尾的 ` 个` 后缀一并移除，保持与英文模式一致（英文模式无需此后缀）。

#### 3.5 入口路径节（3 处）

- [ ] [FIX] 第 136 行：`` `   CLI 入口:  src/cli/index.ts` ``
  → `` `   ${t('project.entry.cli', lang)}:  src/cli/index.ts` ``

- [ ] [FIX] 第 137 行：`` `   包入口:    src/index.ts` ``
  → `` `   ${t('project.entry.pkg', lang)}:    src/index.ts` ``

- [ ] [FIX] 第 138 行：`` `   构建产物:  dist/` ``
  → `` `   ${t('project.entry.build', lang)}:  dist/` ``

#### 3.6 技术栈节（7 处）

- [ ] [FIX] 第 164 行：`` `   运行时:    ${runtimeVer}` ``
  → `` `   ${t('project.tech.runtime', lang)}:    ${runtimeVer}` ``

- [ ] [FIX] 第 165 行：`` `   语言:      ${tsVer}` ``
  → `` `   ${t('project.tech.language', lang)}:      ${tsVer}` ``

- [ ] [FIX] 第 166 行：`` `   CLI 框架:  ${commanderVer}` ``
  → `` `   ${t('project.tech.cliFramework', lang)}:  ${commanderVer}` ``

- [ ] [FIX] 第 167 行：`` `   校验:      ${zodVer}` ``
  → `` `   ${t('project.tech.validation', lang)}:      ${zodVer}` ``

- [ ] [FIX] 第 168 行：`` `   配置:      YAML` ``
  → `` `   ${t('project.tech.config', lang)}:      YAML` ``

- [ ] [FIX] 第 169 行：`` `   文件匹配:  ${globVer}` ``
  → `` `   ${t('project.tech.fileMatch', lang)}:  ${globVer}` ``

- [ ] [FIX] 第 170 行：`` `   测试:      ${vitestVer}` ``
  → `` `   ${t('project.tech.test', lang)}:      ${vitestVer}` ``

### 步骤 4：自测验证

- [ ] 运行 `npm test`，确保 291 个测试全部通过
- [ ] 在 `zh-CN` 模式下手动运行 `openfeel project overview`（或 `npm start -- project overview`），验证输出中文内容无变化
- [ ] 在 `en` 模式下验证输出正确显示英文标签

## 产出文件

- `src/core/i18n-data/zh-CN.ts`（`project` 域新增 26 条 key）
- `src/core/i18n-data/en.ts`（`project` 域新增 26 条 key，含英文翻译）
- `src/commands/project.ts`（约 30 处硬编码替换为 `t()` 调用）

## 自测清单

- [ ] `npm test` 全量通过（291/291）
- [ ] `project overview` 中文输出与修复前一致（所有原有中文标签不变）
- [ ] `project overview` 英文输出所有标签为英文
- [ ] 统计信息节末尾无多余 ` 个` 后缀
- [ ] 入口路径节中 `src/` 不存在的回退消息仍正常显示（`project.overview.noSrc` key 不受影响）
- [ ] 所有新增 i18n key 在 `getStringMap()` 中正确加载（不存在 `[i18n] Missing key` 警告）
