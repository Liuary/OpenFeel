# v1.3.5-stage-106 计划 — 统一 shell 工具推荐（Windows：Git Bash → PowerShell 7）

- **阶段**：`v1.3.5-stage-106`（fast 补丁）
- **关联需求**：REQ-007
- **基线**：v1.3.4（HEAD `dfb29f8`，已发布）；tests 79/2009；dsh 42+86+46+10=184
- **目标**：把「Windows 优先 `bash`（Git Bash），其次 `pwsh`（PowerShell 7）；macOS/Linux 用 `bash`；默认不用 `cmd.exe`；同一任务保持同一 shell」写成**单一推荐**，同时落到两层载体：
  1. **DSH Feel 系统提示**（`dsh/lib/surface/prompt.js` zh/en）——影响当前 DSH 会话的 agent；
  2. **OpenFeel 全局约束模板**（`agents-md/{zh-CN,en}.md`、`claude/constraint/{zh-CN,en}.md`、`openfeel-tool-usage` skill）——影响 opencode / Claude Code / DSH 之外与之上的约束层。
- **不改**：任何 CLI 命令、相位机、写入门禁、审查/归档语义。

## 文案（唯一口径）

> Windows：优先 `bash`（Git Bash），其次 `pwsh`（PowerShell 7）；macOS / Linux 使用 `bash`；默认不用 `cmd.exe`；同一任务内保持同一 shell，路径与转义按该 shell 书写。

## 涉及文件

- `dsh/lib/surface/prompt.js`（zh/en 各新增 `## 命令执行 / ## Command Execution` 节）
- `src/core/templates-data/agents-md/{zh-CN,en}.md`（跨 Agent 工具使用约束 第 5 条）
- `src/core/templates-data/claude/constraint/{zh-CN,en}.md`（主会话约束 第 5 条）
- `src/core/templates-data/skills/openfeel-tool-usage/SKILL.md`（工具名映射表后加 Windows shell 选择注记）
- `dsh/README.md` / `dsh/ADAPTER.md`（说明提示段新增推荐）
- 测试：`dsh/test/verify.js`（zh/en 提示段断言）、`test/core/templates.test.ts`（模板第 5 条断言）
- 收口：版本载体 1.3.5 + CHANGELOG + VERSIONS + README + GETTING_STARTED + SKILL 快照/新节 + build

## 验收

- `renderFeelPrompt`（zh/en）含推荐文本；`dsh/test/verify.js` 断言通过
- 四份模板（agents-md / constraint × zh/en）含第 5 条；tool-usage skill 含注记
- `npm test` 0 failed / 0 skipped；`tsc` 0；`lint i18n` 一致；`lint kb` 0
- `npm run build` ×2 幂等；`--version` 1.3.5
- fast 流程归档 v1.3.5；push 后 CI publish 成功；本地 `npm i -g openfeel@latest` = 1.3.5
- **生效前提**：DSH 宿主完全重启（host module 不热加载）
