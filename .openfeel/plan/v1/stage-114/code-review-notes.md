# v1.5.6-stage-114 代码审查报告（openfeel-reviewer 独立审查）

> 审查对象：`git diff`（21 改 + 3 新增）对照 `plan.md`（742 行 / 36 门位）与 `review-notes.md`（REV-001~009）
> 结论：**需修订**（high 1 / medium 3 / low 5 / blocking 1）
> Feel 自验基线：86 文件 / 2106 用例全绿；tsc 0；build ×2 幂等；lint i18n 1048；lint kb 649；dsh verify 96/96；eslint 32 errors 全在 HEAD 既有行（新增行 0）。

## high + blocking

1. **[high][blocking] `flow repair --dry-run --backup` 在 dry-run 下仍写 `.bak`**（`src/commands/flow.ts:1863-1872`）
   - dry-run 时 1863 的条件式门被跳过，但 1869-1872 的 `--backup` 仍无条件 `copyFileSync(flow.json → flow.json.bak)`。
   - 临时项目实测：strict + 删账本 + `flow repair --dry-run --backup` → exit 0、生成 `.bak`、账本不存在（无门写盘）。
   - 更严重：若 flow.json 已损坏，会用损坏内容覆盖原本可用的 `.bak`。
   - REV-001「dry-run 零写盘」前提被推翻，而 `CHANGELOG.md:29` / `SKILL.md:79` 声称零写盘。
   - **修法**：dry-run 下跳过 `--backup`（保持零写盘），或把 `options.backup` 并入门条件；补用例 `strict + 无账本 + repair --dry-run --backup` 断言 `.bak` 未创建/未被覆盖。

## medium

2. **[medium] 文档计数错**（`docs/commands.md:122`、`docs/VERSIONS.md:46`）：称「写命令中只有 3 个注册 `--json`」，但 `flow health` 也注册了 `--json`（`flow.ts:2388`），`flow health --fix --json` 在 strict 下实测输出 `INVALID_ARGUMENT` envelope → 应为 **4 个**；且 36−3=33 个门位而非 31。另「全部状态写命令」与排除面（chore / dev sync / 顶层 `archive <stage>`）不一致，须补排除清单。

3. **[medium] `plan scheme publish` / `rename` 门前预检漏「模板文件可读」**（`plan.ts:324` / `:368`）：`publishScheme` 在 op 文件缺失时同样返回 `not-found`（`core/plan/scheme.ts:740-743`）、`renameScheme` 返回 `file-missing`（`scheme.ts:822-824`）。实测：已注册但无 ops 文件 + strict 无账本 → 报 preflight 而非「未找到」，REV-009「非法目标先报」未完全落地。
   **修法**：预检补 `mgr.readOpTemplate(...) !== null` 或 `hasOpTemplateOnDisk`，并补序位用例。

4. **[medium] `isRemovableOp = isOpRegistered || hasOpTemplateOnDisk` 扩大遮蔽面**（`plan.ts:241-243`、`:463-468`）：`removeScheme` 只认注册键（`scheme.ts:558-561` 返回 op-not-found），文件存在但未注册的 op 在 strict 下会报 preflight 而非「未找到」。
   **修法**：预检仅用 `isOpRegistered`（file-only 目标直接 not-found）。

## low

5. 缺 3 条序位断言（`flow stage reset --to bogus`、`flow archive bogus`、`flow review remove REV-999`），行为已正确但无测试锁定。
6. `SKILL.md:15` 仍声明「v1.5.5 快照」，`test/core/templates.test.ts:521` 仍断言 v1.5.5，与新增 v1.5.6 段矛盾 → bump 到 v1.5.6 并同步测试 + `npm run build`。
7. `flow stage reset` 门后置路径中 `resetStagePhase` → `getSessionId` → `writeProjectSession` 可能写 `.openfeel/tmp/session.json`（仅当 `CLAUDE_CODE_SESSION_ID` 存在）→ 登记为「读命令副作用白名单」或在拒绝路径避免。
8. `test/commands/flow.test.ts:4874-4881` 的 `health --fix` 用例只断言 flow.json 字节，fixture 无 status.md → 零写盘断言不成立；应造 status 与 phase 不一致的 fixture 并断言 status.md sha256。
9. `test/cli/preflight-cli.test.ts:19,46` 的 `describe.skipIf(!HAS_DIST)`：`npm run build` 在 vitest 之后的环境会整体跳过 6 条真实证据 → beforeAll 断言 dist 存在或 CI 固定顺序。

## 已核对通过（不列为问题）

REV-001 的 10 处条件式写法、REV-002（门 1863 < `.bak` 1869）——**但被第 1 条推翻为 dry-run 场景例外**、REV-003（门 2098 < restore 2102）、REV-004（门 406 < setConfigValue 409）、REV-006（双门各自可达）、REV-007、REV-008（三键无 hint）、REV-009 主要预检；豁免面仅 2 处；36 门位与首个写点对撞无倒挂（除第 1 条）；helper 无硬编码退出码/无未用 import；JSON 键集零变更；`flow advance` 人类输出零回归；生成物与 templates-data 源一致。
