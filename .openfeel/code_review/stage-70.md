# 代码审查摘要 — v1.1.6-stage-70

> 审查人：openfeel-reviewer（GLM，异种交叉审查）｜ 审查 2026-10-11 01:27（复审 01:37）｜ commits：`77c5450`（op-001 4 重写 + 纠错）/ `27f3314`（op-002 3 轻改 + Feel 归一）/ `e7af5a9`（op-003 断言 + build 传播）/ `37d0e8a`（op-004 REV-70-001/003 修复）
> 结论：**passed（通过；REV-70-001 blocking 修复 closed；REV-70-002/004 low 非阻塞 open）** ｜ 详细报告：私域 `.openfeel/users/Liuary/code_review/REV-stage-70.md`

## 核心结论

- **代码审查（review_pending → review_failed → review_passed）**：快速通道**失效**（新增行数约 493 行 > 200；产出文件 8 个 ≥ 5）→ 完整 5 维度审查，**8 项重点核验**：
  1. **opencode 小节零回归** ✅：`git show <sha>^:<file>` vs `HEAD:<file>` node 字节级比对 —— `agent-model-check`（auth.json / opencode.jsonc / 重启三块降级 `####` 后逐字一致）；`model-config`（配置位置 / 优先级链 / 多模态逐字，多模态 2 行 Feel 措辞为 T1.5 授权改动）；`model-check`（平台表 opencode/kilo 行、agents 扫描句、报告标签保留，错误行 `claude/claude.json` 删除）；`cli-usage`（升级流程 + 权限模型两节逐字，快照声明原样）。
  2. **双平台并存** ✅：`rg -c "^### opencode 适配器$"` / `"^### Claude Code 适配器$"` → agent-model-check 1/1、model-check 1/1、model-config 3/3、cli-usage 2/2，成对同构。
  3. **纠错** ✅：`rg "claude/claude.json" src/core/templates-data/skills` → **0 命中**（EXIT=1）；含 `~/.claude/CLAUDE.md` + 「本期由 stage-73 注入 settings.json」。
  4. **Claude 小节事实正确性** ⚠️ → REV-70-001/003：agent-model-check（无 auth.json、`/model`/settings/env/网关）、model-config（项目 `.claude/agents` > 用户 `~/.claude/agents`、frontmatter `model` 优先 `inherit`）、cli-usage（`/reload-skills` 已确证真实命令、`CLAUDE.md` 下次会话生效、权限模型）**准确**；**`openfeel setup --tools claude` 为事实错误**（当前 v1.1.5 无 `--tools`）→ REV-70-001（blocking）。
  5. **轻改 3 个** ✅：tool-usage 映射表 **10 键齐备**；workspace「全局规则文件（opencode 适配器：`~/.config/opencode/AGENTS.md`；Claude Code 适配器：`~/.claude/CLAUDE.md`）」；check-kb `skill("openfeel-check-kb")`（opencode）/ `Skill` 工具（Claude）分平台。
  6. **Feel 措辞** ✅（偏差登记合理）：实测 **5 skill / 12 处**（op-001 7 + op-002 5）；计划 T3 示例 5 skill 实测 **0 处 Feel**，executor「不新增到无 Feel 的 skill」裁定正确 → REV-70-004（口径建议）。
  7. **测试真实性** ✅（T4.4 保护力弱 → REV-70-002 low）：T4.1/T4.2/T4.3 真实 `toContain`/`not.toContain`；`npx vitest run test/core/templates.test.ts` → **14 passed**；无跳步、无删除既有用例（diff 仅追加 43 行）。
  8. **生成段 + 幂等** ✅：生成段 diff（update.ts / template-loader.ts）与 skill 源一致（转义形态），无手改痕迹；`npm run build` ×2 后 `git status --porcelain src/ templates-data/` **零输出**；单源一致性校验通过。
- **内部模式一致性**：4 重写 skill 均「能力名 `##` + 双 `### 适配器` 分节」（标题字面一致，无 h2/h4 变体混用）；新增 Claude 小节均「无 X / 由 Claude 侧决定 / stage-73 注入」三段式；**未来功能标注**：settings.json 注入三处齐备，唯 `--tools` 漏标（REV-70-001 单点失守）。

## REV 登记

| 条目 | 优先级 | 状态 | 说明 |
|------|--------|------|------|
| REV-70-001 | medium（**blocking**） | **closed** | `cli-usage` Claude 小节写入当前 CLI 不存在的 `openfeel setup --tools claude` 且未标注提供版本（v1.1.5 用户照做报 `unknown option '--tools'`；`--tools` 由 stage-71 实现）→ **op-004（`37d0e8a`）修复**：代码块后补 1 条标注 bullet「由 v1.1.6-stage-71 提供」，复审独立取证通过（标注措辞与实测一致 + 含报错文案与「以 `--help` 为准」收口 + opencode 小节零回归）。 |
| REV-70-003 | low（非阻塞） | **closed** | `model-config` Claude 小节「模型权威源为 cc-switch」与 `agent-model-check` 并列口径不一致 → **op-004（`37d0e8a`）** 改为「模型配置经 `/model`、`settings.json`/`env` 或网关（如 cc-switch）等途径确定」对齐，复审 `rg "模型权威源"` **0 命中**；生成段同步传播。 |
| REV-70-002 | low（非阻塞） | open | T4.4 映射表断言用**整文件短键 `toContain`**（`question`/`task`/`skill`/`read` 等在正文高频出现）→ 映射表缺行也可能假阴性；建议改**行级断言**（如 `toContain('| \`question\` | \`AskUserQuestion\` |')`，成本极低）。 |
| REV-70-004 | low（非阻塞） | open | Feel 残留计数口径三处不一致（方案字面「`\bFeel\b` → 0」与「首现 `主会话（Feel）`」自相矛盾；gate-report 记 5 vs 实测 6 行）→ 建议校验口径改「排除 `主会话（Feel）` 形态后计数 0」，并同步修正 gate-report。 |

> blocking REV（REV-70-001）已修复闭环；REV-70-002/004 **low 非阻塞 open** 跟踪，**不阻塞归档与流水线推进**（建议并入后续阶段顺手修复）。

## 门禁复核（独立实跑，2026-10-11 01:20~01:37）

| 门禁 | 结果 | 判定 |
|------|------|:--:|
| `npm run build` ×2 | 双双成功；两生成段 SHA256 一致；第二次后 `git status --porcelain src/ templates-data/` 零输出；一致性校验全过 | ✅ |
| `npm test` | **66 文件 / 1162 用例全绿，0 skipped / 0 failed** | ✅ |
| `npx tsc --noEmit` | EXIT=0 | ✅ |
| `node bin/openfeel.js lint i18n` | **761** 键一致（不新增键） | ✅ |
| `node bin/openfeel.js lint kb` | 未发现过期引用（363 引用，EXIT=0） | ✅ |
| `openfeel --version` | 1.1.5（未改版本） | ✅ |
| 受管树不复活 | `templates-data/opencode/skills`、`.opencode/skills`、`.opencode/agents`、根 `AGENTS.md`、根 `opencode.jsonc` 均不存在 | ✅ |

## 经验与建议

- **共享 skill 平台分节中立化**：同一份共享源供两 harness 消费时，正文以**能力名**叙述、平台差异以 `### opencode 适配器` / `### Claude Code 适配器` 两小节分列；**opencode 小节逐字保留**（仅标题层级可降级）。故「零回归」判定**不能采用文件级字节全等**（与「新增 Claude 小节」目标互斥），改用**平台关键串 `toContain` + 非标题行逐字比对**的子串断言法；纠错类（`claude/claude.json`）用**定向阴性断言**。
- **未来功能/未落地能力写入 skill 与文档须标注「提供版本」**：引用当前 CLI 尚不存在的命令/参数（`--tools`）时须标注提供阶段（与同节 `settings.json`「本期由 stage-73 注入」同构），否则用户照做报错（REV-70-001）。
- **中立化改写的「原文搬家 vs 探针式改写」判定**：逐句判定是**逐字迁移**还是**去平台路径 + 指向分节**；混用会导致关键串断言通过但部分原句被改写（字面偏差）——见新登记 `templates/BUG-006`。
- **断言保护力**：整文件短键 `toContain` 对高频词（`question`/`task`）近乎无保护力（假阴性），映射表类断言应上行级/表格行粒度（REV-70-002）。

## 归档收口（openfeel-archiver，2026-10-11）

- **REV**：REV-70-001（medium, **blocking**）/ REV-70-003（low）**closed**（op-004 `37d0e8a` 独立验收）；REV-70-002/004 low **非阻塞 open**（审查结论 passed）。
- **Bug**：新登记 `templates/BUG-006`（low, open）—— `openfeel-model-check` 平台适配小节 2 条平台专有句为**改写而非逐字迁移**（opencode 零回归字面偏差；T4.2 关键串断言仍全过）。核心结论归档至公域 `.openfeel/bugs/templates.md`（状态 open）。
- **KB**：**3 条**（patterns 2 + troubleshooting 1）——共享 skill 双平台分节中立化 / 未来功能须标注提供版本 / 平台分节「原文搬家 vs 探针式改写」陷阱；去重最高 2.5% ≪ 80%，均按新增处理。
- **manual / roadmap**：`manual/index.md` skill 体系行补 stage-70 中立化口径；`plan/index.md` stage-70 行回填「已归档」。
- **未推进 `flow.json` 至 done（由 Feel 执行）／未 push／未 `npm publish`／未直写 `flow.json`**。
