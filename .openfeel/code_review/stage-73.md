# 代码审查摘要 — v1.1.6-stage-73

> 审查人：openfeel-reviewer（GLM，异种交叉审查）｜ 审查 2026-10-11 03:00 ｜ commits：`1fe29b0`（op-001 `claude-settings.ts` 严格 JSON 深合并 + 单测）/ `8b2fdeb`（op-002 setup/update 接线 `applyClaudeSettings` 备份/anomaly + i18n 774）/ `2b5c3e3`（op-003 卸载/回滚文档 Q6 + auto mode 实测 + 全门禁）
> 结论：**passed（无 blocking REV；REV-73-001 low 非阻塞 open 跟踪，REV-73-002/003 评估性 closed）** ｜ 详细报告：私域 `.openfeel/users/Liuary/code_review/REV-stage-73.md`

## 核心结论

- **代码审查（review_pending → review_passed）**：快速通道**失效**（新增行数约 422 行 > 200；产出文件 10 个 ≥ 5）→ 完整 5 维度审查，**9 项重点核验（R-10 高危优先）**：
  1. **严格 JSON 深合并 ✅（决定性实证）**：`claude-settings.ts` 直接 `JSON.parse`（无剥注释/regex），失败抛 `ClaudeSettingsParseError`，顶层非对象同抛；框架自有键原位覆盖、`permissions` 深合并保留用户子键、其余键浅拷贝逐字保留；幂等实证 `merge(merge(x))===merge(x)` 字节相等 + 隔离 HOME CLI `Get-FileHash` 两次相等；**与 jsonc 实现隔离**（`rg` 零复用 opencode-config/managed-region）。
  2. **用户键保留 ✅**：单测 + 集成测断言 `env`/`model`/`modelPicker`/`theme`/`apiKeyHelper`/`permissions.{allow,deny}` 深等于原值 + `agent==='feel'` + `defaultMode==='auto'` + 保序；CLI 实证逐字保留。
  3. **默认零触 ✅（隔离 HOME 实证）**：默认 `setup`（无 `--tools`）后隔离 HOME `~/.claude` **不存在**；集成测 T6.5 同断言。
  4. **注入断言 ✅**：`--tools claude` 后 `agent`/`defaultMode` 到位（T6.1/T6.8 + CLI 实测）。
  5. **备份/异常路径 ✅**：写前备份在 `global-claude-settings` 锁**之外**（对齐 jsonc 口径）；`BackupError` → 跳过 + `anomaly(backup_failed)` + warn；严格 JSON 失败 → **不写盘** + `anomaly(parse_failed)` + skipped；`CLAUDE_CONFIG_DIR` 越界双实证（写回 + 备份落 `global-external/`）。
  6. **单实现 + conflicts 排除 ✅**：`applyClaudeSettings` 唯一定义、setup/update 对称调用（无双实现漂移）；`getIncomingContent` **无 settings 分支**（不入 conflicts）。
  7. **i18n ✅**：6 新键（setup/update 域各 3）双表成对；`lint i18n` 实测 **774**（768+6，与登记期间相符）。
  8. **测试真实性 ✅（隔离纪律）**：T6.1~T6.8 全为具体字节级/结构断言；`vi.mock('node:os')` + `CLAUDE_CONFIG_DIR` 隔离内清理，**不触真实 `~/.claude/`**。
  9. **op-001 模块头注释评估 → 无需修正（REV-73-003 closed）**：头注释「不复用 opencode-config/managed-region」为设计意图说明而非复用声明（`rg` import 零命中），矛盾源于 op-001.md 自身措辞未排除注释，executor 留痕处理得当。
- **五维度结论**：正确性 ✅ / 规范性 ✅ / 安全性 ✅ / 完整性 ✅ / 一致性 ✅（校验风格、命名对称、错误处理、返回模式四处内部一致）。
- **内部模式一致性（settings 路径 vs jsonc 路径）**：校验风格/命名/日志约定一致；**解析失败路径有意分歧**（jsonc 回写原文静默 vs settings 不写盘 + anomaly，方案 T6.4 裁定，非漂移）。

## REV 登记

| 条目 | 优先级 | 状态 | 说明 |
|------|--------|------|------|
| REV-73-001 | low（非阻塞） | open | `claudeSettingsMergedTmpl` 在 `created`（原文件不存在）路径下统一打印「原文件已备份」失实——首次部署无备份产生，文案与事实不符；建议模板去措辞或按动作拆两键（i18n 文案层微调，不涉逻辑）。 |
| REV-73-002 | low（非阻塞） | closed | 已知行为留痕确认：① 幂等重跑仍备份（备份先于幂等判定，无条件备份口径，与 jsonc 一致）；② 用户 `permissions` 非对象时整键替换为 `{defaultMode:'auto'}`（原值仅可经备份还原，D-SET2 边界定稿）。 |
| REV-73-003 | low（非阻塞） | closed | op-001 模块头注释提及 opencode-config/managed-region（executor 自登记）评估：注释为「不复用」设计意图说明，**代码无需改动**（rg import 零命中）。 |

> REV-73-001 **low 非阻塞 open**，**不阻塞归档与流水线推进**（建议并入后续阶段顺手修复）。

## 门禁复核（独立实跑，2026-10-11 03:00）

| 门禁 | 结果 | 判定 |
|------|------|:--:|
| `npm run build` ×2 + `git status --porcelain src/ templates-data/` | 输出空（build 幂等、生成段无漂移） | ✅ |
| `npm test` | **67 文件 / 1206 用例全绿，0 failed / 0 skipped** | ✅ |
| `npx tsc --noEmit` | exit 0 | ✅ |
| `node bin/openfeel.js lint i18n` | **774 键一致** | ✅ |
| `node bin/openfeel.js lint kb` | 过期引用 0（380 引用） | ✅ |
| `node bin/openfeel.js --version` | 1.1.5（本阶段不改版本） | ✅ |
| 隔离 HOME 默认 `setup` | `.claude` 不存在（零触） | ✅ |
| 隔离 HOME `setup --tools claude` ×2 | 注入到位 + 用户键保留 + hash 幂等 | ✅ |
| `setup --check --json` | `{cliVersion,deployedVersion,schemaVersion,status}` 契约未变 | ✅ |
| `setup --help` / `rg uninstall src/commands/` | 无新增顶层命令、无 `uninstall` | ✅ |

> 复现三要素：opencode（模型 `zhipuai/glm-5.3-flash`）+ 仓库 commit `2b5c3e3` + 隔离 HOME（`%TEMP%\of-rev-home*`，真实 `~/.claude` 全程未触碰）。

## 经验与建议

- **格式决定解析器**：`settings.json` 为**严格 JSON**（无注释/无标记），须用 `JSON.parse` 直接校验，**不得复用** jsonc 的剥注释/regex/passthrough 逻辑（会误纳含注释文件并引入无关特例）；深合并需独立实现。
- **第三方高频占用文件的写策略 = 读-深合并-写回**：保留用户键 + 仅注入框架自有键 + 备份保护使覆盖可人工还原；解析失败宁 `skipped` 不 churn（避免破坏用户文件）。
- **单实现防漂移**：setup/update 共用 `applyClaudeSettings(state, command, lang)`，`command` 收窄 `'setup'|'update'` 决定 i18n 域前缀，备份/anomaly/lock/hash 语义集中一处。
- **环境依赖能力用「尽力注入 + 文档兜底」**：auto mode 受支持模型约束（本机经 cc-switch 中转可能回落 manual）→ `defaultMode` 照常注入，不阻断门禁，文档说明手动回滚路径。

## 归档收口（openfeel-archiver，2026-10-11）

- **REV**：REV-73-001 **low 非阻塞 open**（审查结论 passed，不阻塞归档）；REV-73-002/003 **closed**。
- **Bug**：**0 新增**（验收 7/7 通过、0 Bug）。
- **KB**：**3 条**（patterns 2 + troubleshooting 1）——严格 JSON 深合并独立实现（vs jsonc + 用户键保留/幂等） / 用户高频占用文件读-深合并-写回写策略 / auto mode 模型支持约束与尽力注入回落；去重最高 3.2% ≪ 80%，均按新增处理。
- **manual**：新增 `manual/core/claude-settings.md`（模块树 + 维护表）+ `index.md` 模块树；`core/setup.md` / `core/update.md` 补 settings 接线（不再「不写 settings.json」）；`core/backup.md` 补 settings 备份接入。
- **ADR**：`dev/decisions.md` 新增 **ADR-008**（settings 注入反转蓝本 §四）+ **ADR-009**（D-SET 冲突策略：框架自有键覆盖 + 备份保护）。
- **未直写 `flow.json`**（阶段状态变更经 Feel + CLI 原子操作）；**未 push / 未 `npm publish`**。
