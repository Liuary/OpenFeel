# 代码审查摘要 — v1.1.6-stage-71

> 审查人：openfeel-reviewer（GLM，异种交叉审查）｜ 审查 2026-10-11 02:20 ｜ commits：`e753217`（op-001 global-paths 5 Claude 路径函数 + D-CFG）/ `7287355`（op-002 supportedTools 正式化 + R-5 守卫 + update `--tools`）/ `62fcb43`（op-003 setup/update 双分支 + getIncomingContent + 重启提醒 + i18n 768）/ `cdd0953`（op-004 集成测试 E/F + 全门禁）
> 结论：**passed（无 blocking REV；REV-71-001/002 low 非阻塞 open 跟踪）** ｜ 详细报告：私域 `.openfeel/users/Liuary/code_review/REV-stage-71.md`

## 核心结论

- **代码审查（review_pending → review_passed）**：快速通道**失效**（新增行数约 667 行 > 200；产出文件 13 个 ≥ 5）→ 完整 5 维度审查，**8 项重点核验（R-5 高危优先）**：
  1. **R-5 守卫 ✅（决定性实证）**：`commands/update.ts` 由 `supportedTools.map(t=>t.id)` 改为 `filter(t=>t.enabled).map(t=>t.id)`（原 `map` 消失）；`core/update.ts` claude 转正式条目 `enabled:false`。隔离 HOME 实测默认 `setup` / `update <path>` 后 `~/.claude` **不存在**（单测双层 + CLI 端到端）。
  2. **默认行为逐字回归 ✅**：无参 `setup` 尾行与改前硬编码**逐字一致**（`setup.restartHarnessTmpl` 在 harness='opencode' 时渲染等价）；`setup --check --json` 契约未变；opencode 段步骤仅缩进 +2（语句逐字未改）；既有 setup/update 测试全绿。
  3. **claude 分支 ✅（隔离 HOME 端到端）**：`setup --tools claude` → `~/.claude` 根仅 `{agents(9), skills(17), CLAUDE.md}`，**无 settings.json**；CLAUDE.md 受管区三态（用户无标记 → appended 逐字保留；含标记 → 仅区内替换；malformed → skipped 不写盘 + anomaly）；`updateProject(['claude'])` → 27 created；双 harness 二次 setup skipped=**54**（计划 53 系 8-agent 旧蓝图估算，偏差已在 op-003 登记，裁定合理）。
  4. **`--tools` 命令面 ✅**：非法值 stderr 报错 + **exit 1**（fail-fast 前置，零写盘）；`parseToolList` 逗号分隔 + 保序去重；setup/update 复用同一校验。
  5. **global-paths ✅**：5 函数齐备；`CLAUDE_CONFIG_DIR` **函数体内读 env** + `.trim()`，空/空白回落 `~/.claude`（无模块级常量）；三态单测 + env 恢复；重定向实证部署落 custom-claude。
  6. **D-CFG ✅**：`computeBackupRel` HOME 内原样（零回归）；HOME 外 → `global-external/<sha8>/<规范化尾段>` 不再抛错；**project 分支越界仍抛 `BackupError`**；sha8 仅 `[0-9a-f]`（无盘符冒号）、尾段清洗保留字符。
  7. **i18n ✅**：7 新键 + 6 修订键 zh-CN/en **双表成对**，修订键去 `（opencode）` 硬编码；`lint i18n` = **768**（与登记 761+7 相符）。
  8. **测试真实性 ✅（隔离纪律）**：涉及 claude 路径的测试均有 `vi.mock('node:os')` + `CLAUDE_CONFIG_DIR` 清理，**不触真实 `~/.claude`**；断言具体非占位（`toHaveLength(9/17/27/54)` / `startsWith(userContent)` 逐字 / `not.toContain('TAMPER')` / `toBe(malformed)` 字节级）。
- **五维度结论**：正确性 ✅ / 规范性 ✅（中文注释齐备、无过度设计、早返回与大括号风格合规）/ 安全性 ✅（`--tools` 白名单 + sha8 无冒号 + 测试不触真实 HOME）/ 完整性 ✅（4 op 产出与声明一致、gate/selftest 报告数字与独立复跑一致）/ 一致性 ✅（校验风格、命名对称、错误处理、getIncomingContent 分支模式四处内部一致）。

## REV 登记

| 条目 | 优先级 | 状态 | 说明 |
|------|--------|------|------|
| REV-71-001 | low（非阻塞） | open | `parseToolList`（`core/update.ts:103-122`）的**保序去重**行为与**混合合法/非法值**场景（如 `opencode,foo` → 整批拒绝）缺直接单测，目前仅靠命令层用例间接覆盖；代码走查正确，属测试覆盖缺口而非功能缺陷。 |
| REV-71-002 | low（非阻塞） | open | `commands/setup.ts:50` 跨域复用 **update 域**的 `update.toolsInvalidTmpl` 键（op-003 方案 T4 明定的复用决策，避免重复键）；功能无碍、`lint i18n` 无告警。若未来 setup/update 的 `--tools` 错误文案需分叉措辞，须拆 `setup.toolsInvalidTmpl` 独立键。另备注非缺陷边界：`getClaudeConfigDir()` 对相对路径 env 值不做 resolve（与 Claude Code 官方语义一致，备份路径在 `backupFileBeforeWrite` 内部归一）。 |

> 两条 REV 均 **low 非阻塞 open**，**不阻塞归档与流水线推进**（建议并入后续阶段顺手修复）。

## 门禁复核（独立实跑，2026-10-11 02:20）

| 门禁 | 结果 | 判定 |
|------|------|:--:|
| `npm run build` ×2 + `git status --porcelain src/ templates-data/ test/` | 输出空（build 幂等、生成段无漂移） | ✅ |
| `npm test` | **66 文件 / 1189 用例全绿，0 failed / 0 skipped**（35.26s） | ✅ |
| `npx tsc --noEmit` | exit 0 | ✅ |
| `node bin/openfeel.js lint i18n` | **768 键一致** | ✅ |
| `node bin/openfeel.js lint kb` | 过期引用 0（368 引用 / 5 文件） | ✅ |
| `node bin/openfeel.js --version` | 1.1.5（本阶段不改版本） | ✅ |
| 隔离 HOME 默认 `setup` / `update <path>` | `~/.claude` 零变化（R-5 决定性） | ✅ |
| 无 `settings.json` / `claude-settings.ts` | `~/.claude/settings.json` 不存在；`rg claude-settings.ts` 0 命中 | ✅ |

> 复现三要素：opencode（模型 `zhipuai/glm-5.3-flash`）+ 仓库 commit `cdd0953` + 隔离 HOME（`%TEMP%\opencode\stage71-rev-home`，`USERPROFILE`/`HOME` 重定向，`CLAUDE_CONFIG_DIR` 置空）。

## 经验与建议

- **注册表 enabled 门控的默认安全**：多工具/多 harness 注册表须 **条目 `enabled` 标志 + 消费点 `filter(t=>t.enabled)` 双保险**——只加条目注释（`// { id:'claude', enabled:false }`）而消费点仍 `map(t=>t.id)` 会把预留工具静默带入默认路径（R-5 高危）。默认路径零触新工具目录须以**隔离 HOME 端到端实测**取证。
- **env 覆盖型路径函数的可测试性**：`CLAUDE_CONFIG_DIR` 必须在**函数体内**读 `process.env`（不得提为模块级常量），否则模块加载即固化，测试无法经 `vi.stubEnv`/`process.env` 注入；空/空白串回落默认；`afterEach` 还原原值防泄漏。
- **HOME 外备份 fallback 的唯一目录名口径**：越界判定不变、仅改处置（抛错 → `global-external/<sha8>/…`）；`sha8 = sha256(resolve(absPath)).slice(0,8)` 仅 `[0-9a-f]`，天然规避盘符冒号与保留字符；尾段清洗 `[<>:"|?*]` 并保留层级；project 分支越界仍抛错（零回归）。
- **重启提醒的 harness 组合参数化**：由硬编码 opencode 改按实际变更 harness 动态拼接，文案入 i18n 以 `{harness}` 占位——**仅 opencode 时渲染逐字与改前一致**（默认输出零回归），`isTTY` 守卫、非交互静默，claude 首次创建追加 `/reload-skills` 提示。

## 归档收口（openfeel-archiver，2026-10-11）

- **REV**：REV-71-001/002 **low 非阻塞 open**（审查结论 passed，不阻塞归档）。
- **Bug**：**0 新增**（验收 7/7 通过、0 Bug）。
- **KB**：**5 条**（architecture 1 + patterns 4）——多 harness 部署编排架构 / enabled 门控默认守卫 / env 路径函数可测试性 / D-CFG 备份 sha8 口径 / 重启提醒 harness 组合参数化；去重最高 4.3% ≪ 80%，均按新增处理。
- **manual**：补登 `--tools` 命令面（`core/setup.md` / `cli/setup.md` / `cli/commands.md`）、claude 路径 5 函数（`core/global-paths.md`）、D-CFG 备份 fallback（`core/backup.md`）、双分支与 supportedTools（`core/update.md`）。
- **plan/roadmap**：`plan/index.md` stage-71 行回填「已归档（M26）」；`v1.1.6/plan.md` 档期回填。
- **未直写 `flow.json`**（阶段状态变更经 Feel + CLI 原子操作）；**未 push / 未 `npm publish`**。
