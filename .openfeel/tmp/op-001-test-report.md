# 自测报告 — op-001（配置面四键与 auto_advance 默认翻转，T1 + T6）

- **执行时间**：2026-10-11 17:00
- **执行 Agent**：openfeel-executor
- **重试次数**：1（首次 F6 红点：schema 逐键默认与 DEFAULT_CONFIG 分叉，修正 schema 默认后绿）

## 执行摘要
全部 7 项 T1 改动 + T6 自举完成，自测 10/10 通过（tsc 0 / 三测试文件 86 通过 / flow-manager 264 通过 / build 成功 / config set 单行增量 / bogus 拒绝 / get=full / i18n 774 / version 1.1.6）。

## 实施步骤完成情况
- [x] T1-1 类型与值域：`WORKFLOW_MODES` + `WorkflowMode`（config.ts，ConfigDefaultsSchema 之前）
- [x] T1-2 `ConfigDefaultsSchema` 增第 4 键 `workflow_mode`（default `fast`）
- [x] T1-3 `DEFAULT_CONFIG`：`auto_advance` 翻转 `enabled` + 增 `workflow_mode: 'fast'`
- [x] T1-4 `Config` 接口：嵌套 defaults 与扁平兼容字段各增 `workflow_mode?`
- [x] T1-5 `ResolvedConfigDefaults` + `resolveConfigDefaults()` 四键化（键数组扩四键，不做级联）
- [x] T1-6 `STAGE_FIELD_BY_CONFIG_KEY` 追加 `workflow_mode: '工作流模式'`
- [x] T1-7 `CONFIG_TEMPLATE_{ZH,EN}` defaults 节增 `workflow_mode` 行（注释按方案）
- [x] T6 自举：`npm run build` 后 `node bin/openfeel.js config set defaults.workflow_mode full`（单行增量）
- [x] 测试翻转点 F1~F11 逐点更新 + T7.5/T7.6 新增

## 自测清单验证
| 检查项 | 结果 | 备注 |
|--------|:--:|------|
| `npx tsc --noEmit` | ✅ | exit 0 |
| `vitest run config/init/plan-stage` | ✅ | 3 files / 86 tests passed |
| `vitest run flow-manager.test.ts` | ✅ | 264 passed（F10/F11 翻转点） |
| `npm run build` | ✅ | 成功；`git status --porcelain src/` 仅 `M src/core/config.ts`（无意外生成物） |
| `config set defaults.workflow_mode full` | ✅ | `git diff .openfeel/config.yaml` 仅 +1 行，注释逐字保留 |
| `config set defaults.workflow_mode bogus` | ✅ | 输出「仅支持：full, fast」，exit 1，未写盘 |
| `config get defaults.workflow_mode` | ✅ | `full` |
| `lint i18n` | ✅ | 774（本 op 不新增键） |
| 全仓 `auto_advance` 残留复核 | ✅ | 除 D3（`DEFAULT_PROFILE` / `ProfilePreferencesSchema` 有意 disabled）外无默认假设残留 |
| `--version` | ✅ | 1.1.6 |

## 产出文件
- `src/core/config.ts`
- `test/core/config.test.ts`、`test/core/init.test.ts`、`test/core/plan/stage.test.ts`、`test/core/flow-manager.test.ts`
- `.openfeel/config.yaml`（单行增量）

## 前置校验结果
- 方案完整性：通过（6 项必填字段齐备 ×4 op）
- Phase 合法性：通过（pipeline.phase=active，stage v1.1.7-stage-74 phase=exec_running，current.op=op-001）
- 流转合法性：通过（`openfeel flow health --quick` exit 0）

## 偏差记录
- **[偏差-1] `ConfigDefaultsSchema.auto_advance` 逐键默认 `disabled → enabled`（计划未列改动点）**：方案 F6（`defaults 块缺失（仅 meta）→ 全默认`）显式期望 `auto_advance: 'enabled'`，但 `resolveConfigDefaults` 缺失键路径经 `ConfigDefaultsSchema.shape[key].safeParse(undefined)` 取的是 **schema 逐键默认**（原 `disabled`），非 `DEFAULT_CONFIG` → F6 首跑红。为使 schema 逐键默认与 `DEFAULT_CONFIG` 同键值一致（单一权威，避免同一默认两个来源分叉），将 `auto_advance` schema 默认同步为 `enabled`（1 字符 + 注释）。语义影响面：`resolveConfigDefaults` 缺失键路径、`readConfig` 对「有 defaults 块但未声明 auto_advance」的规范化默认值 —— 均随新默认一致化。可行性由全量门禁（op-004）验证。**提请 openfeel-reviewer 复核**。
- 跳步违规：无。
