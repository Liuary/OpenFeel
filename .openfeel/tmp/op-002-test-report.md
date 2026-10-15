# 自测报告 — op-002

- **执行时间**：2026-10-15 13:42
- **执行 Agent**：openfeel-executor
- **重试次数**：第 **1** 次

## 执行摘要

在部署路径落**用户主权键 `model` 键级保护**（`mergeFrontmatter` 可选参 + 白名单常量单源 + `update.ts` 调用点传参）；
`--scope default` 与三态其余路径逐字不动；同批限定化「勿手改」契约文本并成文「用户主权键 + 复现路径」；
以**隔离四场景 + 本仓实测二分**证明 —— 全部 10 项自测清单通过，**核心验收（本仓 GLM 保留）通过**。

## 前置校验结果

- 方案完整性：**通过**（6 项必填节齐备）
- Phase 合法性：**通过**（`stages["v1.2.1-stage-94"].phase` = `exec_running`）
- 流转合法性：**通过**（`openfeel flow health --quick` 退出码 0）

## 实施步骤完成情况

- [x] **2.0 前置核验**：op-001 已完成（`git status --porcelain src/` ⊆ op-001 produces）；`update/managed-region` 基线全绿；reviewer `model` 值在位（快照留痕）
- [x] **2.1 语义契约成文** → `.openfeel/tmp/stage-94-nondestructive-contract.md`（判定流程 + 边界 4 条 + 调用点区分）
- [x] **2.2 实现（单点化 + (a) 形态）**：`managed-region.ts` 加 `USER_SOVEREIGN_KEYS` + 第三参；`update.ts:2393` 传白名单；`model-config.ts:218` **未改**
- [x] **2.3 单测三类**：新增 12 处（见 `assertion-diff.md` op-002 段）；保留面逐字未动
- [x] **2.4 契约文本限定化 + 复现路径成文**：`agents-md:111` zh/en + `cli-usage:188`；`model-config`/`agent-model-check` 两 skill Claude 节
- [x] **2.5 隔离实测四场景** → `.openfeel/tmp/stage-94-deploy-nondestructive-e2e.md`（4/4 ✅）
- [x] **2.6 本仓实测** → `.openfeel/tmp/stage-94-repo-persistence.md`（① GLM 保留 ✅ ② explorer 创建 ✅ ③ settings 逐字 ✅ ④ CLAUDE.md ✅ ⑤ state ✅；opencode 延伸同步 ✅）
- [x] **2.7 build + 断言复核 + 边界自证**：build ×2 幂等；目标 6 文件全绿；tsc 0；i18n 944；kb 0；调用方零改动

## 自测清单验证

| # | 检查项 | 结果 | 备注 |
|:-:|--------|:--:|------|
| 1 | 第三参默认不传 = 现行为（`:167/:178` 逐字通过）；部署调用点传 `['model']`；`model-config.ts:218` 未改 | ✅ | 默认参路径 6 例新增断言 + 原 2 例逐字通过；静态断言锁定 `model-config.ts` 零命中白名单 |
| 2 | 四场景新语义单测全绿（改值保留 ×2 harness / 删行补写 / 正文并行）；`--scope default` 覆盖语义回归断言绿（R-94-2） | ✅ | `update.test.ts` 5 新增例 + `model-config.test.ts` R-94-2 例全绿 |
| 3 | 阴性：白名单外键（`description`）篡改仍被覆盖；白名单**恰为** `model` 单键（R-94-3） | ✅ | `update.test.ts` 阴性例 + `managed-region.test.ts` 对照组（显式传 `['model','description']` 才保护） |
| 4 | 三态其余路径（`created`/`appended`/`malformed`）与 `conflicts` 恒空断言逐字未动 | ✅ | `update.test.ts:705-728` 等保留面零改动且全绿 |
| 5 | 隔离实测四场景三要素齐 + 前后对照；本仓实测 ① GLM 保留 ② explorer 创建 ③ settings 逐字 + 注入键 ④ CLAUDE.md ⑤ state | ✅ | 见 e2e / repo-persistence 两记录；①②③④⑤ 逐项实测通过 |
| 6 | GLM 三要素登记在位；异常即停路径与备份还原命令已写入报告 | ✅ | repo-persistence §五/§六；本次**未触发** |
| 7 | 「勿手改」两处限定化；zh/en 对称；cli-usage 未新增 `node bin/openfeel.js` 字样 | ✅ | `templates.test.ts` 全绿；实测该串计数 = **1** |
| 8 | 两 skill 的「用户主权键 + 配置位置 + 校验路径」在位；与 op-001 同段落无冲突 | ✅ | `model-config` Claude 节扩写（op-001 仅改 `:94` 档位行，无重叠）；`agent-model-check` Claude 节新增校验路径节 |
| 9 | `git status --porcelain src/core/setup.ts src/core/init.ts src/core/claude-settings.ts` 为空；零 i18n 新键（944）；build ×2 幂等；`--porcelain src/` ⊆ produces | ✅ | 三文件 porcelain 空；944；build ×2；差异面 = 8 文件 ⊆ produces |
| 10 | 零「待后续验证」类模糊项；未实测项含显式标注 | ✅ | 无未实测项（隔离 + 本仓双侧实测）；「生效验证法」为**复现步骤说明**，非待验证项 |

### 门禁实测

```
npm test → Test Files 71 passed (71) / Tests 1707 passed (1707)   （起点 1695 → +12，全部为本段新增）
npx tsc --noEmit → exit 0
node bin/openfeel.js lint i18n → ✅ 944 键一致（零新键）
node bin/openfeel.js lint kb → ✅ 未发现过期引用（612 引用）
node bin/openfeel.js --version → 1.2.0（不改，归 93）
npm run build ×2 → 幂等
```

## 产出文件（实际）

- `src/core/managed-region.ts`（`USER_SOVEREIGN_KEYS` + `mergeFrontmatter` 第三参）
- `src/core/update.ts`（`:2393` 部署调用点传白名单）
- `src/core/template-loader.ts`（build 重生成，禁手改）
- `src/core/templates-data/agents-md/{zh-CN,en}.md`（`:111` 限定化）
- `src/core/templates-data/skills/openfeel-cli-usage/SKILL.md`（`:188` 限定化）
- `src/core/templates-data/skills/openfeel-model-config/SKILL.md`（Claude 节：用户主权键 + 复现路径）
- `src/core/templates-data/skills/openfeel-agent-model-check/SKILL.md`（Claude 节：校验路径 + 实测法 + 受部署保护）
- `test/core/update.test.ts` / `test/core/managed-region.test.ts`（新增 12 例）
- `test/core/model-config.test.ts`（R-94-2 回归例）
- `.openfeel/tmp/stage-94-nondestructive-contract.md` / `-deploy-nondestructive-e2e.md` / `-repo-persistence.md` / `-assertion-diff.md`（op-002 段）

## 偏差记录

| # | 偏差 | 类型 | 说明 |
|:-:|------|------|------|
| 1 | claude 侧部署保留测试落 `update.test.ts` 而非 `claude-adapter.test.ts` | 落点调整（已登记） | 后者无 `homedir()` mock；前者已有完整隔离基建，避免新增两套 mock；覆盖同一 `updateProject` 路径 |
| 2 | 新增 **12** 例（计划未给定额） | 范围**扩张**（良性，已登记） | 计划 §2.3 按「三类 × 场景」表述未计数；含 4 场景 ×2 harness + 阴性 + 静态 + R-94-2 回归 + 边界（`null` / 白名单显式传参对照） |
| 3 | `test/core/model-config.test.ts` 新增 1 例（计划标「条件性」） | 条件触发（已登记） | 条件 = 「`--scope default` 回归断言增强」——本 op 触发（R-94-2 专用断言） |
| 4 | **仓库根 `opencode.jsonc` 一度被重建** | 实测副作用（已修复，**无残留**） | opencode 侧本仓实测从仓库根运行 → 重建**项目级** `opencode.jsonc`（该资产 stage-92 `ebac4ea` 已删并有防回归断言）。已 `rm` 移除，`templates.test.ts` 复绿；未进入任何提交 |
| 5 | 首次 `update --tools claude` EPERM（`CLAUDE.md` rename） | 环境瞬时占用（非缺陷） | 两次复现于不同文件；`W_OK` + `rename` 探测全部通过 → 瞬时占用；重试后全量成功。EPERM 前 `created`/`updated` 均空，**无副作用**；GLM 值全程在位 |
| 6 | `HOME` 隔离在 Windows 无效 | 实测发现（已登记） | `global-paths.ts` 唯一来源 `os.homedir()` → Windows 取 `USERPROFILE`；首次 opencode 运行实际写真实 `~/.config/opencode`（内容一致、多为 skipped，无破坏）。后续改用 `USERPROFILE` 隔离 |
| 7 | 跳步违规 | **无** | 标准流程完整执行 |

## 结论

op-002 **完成**，自测清单 10/10 通过，**本仓 reviewer GLM 配置经部署保留（核心验收通过）**。
请**主会话**安排 openfeel-reviewer 审查（本 Agent 不推进 phase / 不自行推进状态）。
