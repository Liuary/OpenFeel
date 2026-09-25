# 自测报告 — op-001

- **执行时间**：2026-09-25 22:35
- **执行 Agent**：openfeel-executor
- **重试次数**：第 1 次

## 执行摘要
全部 3 步完成，`tsc --noEmit` 通过；核心 API + `getAuthJsonPath` 就绪，前置实测推翻并修正了方案声称的解析优先级链（REV-1606）。

## 前置实测结果（op-001 步骤 0，必填）
方法：隔离 HOME（HOME/USERPROFILE/XDG_*）+ 临时项目，opencode 1.18.30 `opencode debug config` 解析 `agent.openfeel-executor.model`。

| 配置组合 | 解析结果 |
|---|---|
| 仅项目 `.opencode/agents/openfeel-executor.md` frontmatter `fm/value` | `fm/value` |
| 项目 md `fm/value` + 全局 jsonc `global/value` + 项目 jsonc `project/value` | **`fm/value`** |
| 仅全局 `~/.config/opencode/agents/` md `gm/value` + 全局 jsonc + 项目 jsonc | **`gm/value`** |
| 项目 md `fm/value` + 全局 md `gm/value` | **`fm/value`** |
| feel（md 无 model）+ 项目 jsonc `project/feel` | `project/feel`（jsonc 仅在 md 无 model 时补位） |

**结论**：opencode 官方配置源优先级为 `project config < .opencode 目录（agents 等）`，故
**agent markdown frontmatter（项目 > 全局）> opencode.jsonc agent.model（项目 > 全局）> 默认**。
即 **frontmatter 覆盖 jsonc**，与 plan.md §二及决策 5/6 相反。经用户裁定「授权按实测修正链实施」，
`getDefaultScopeValue` 改为 frontmatter 优先、`getAgentModel` 的 effective 改为 `default > project > global`。
（未硬编码错误链。）

## 实施步骤完成情况
- [x] 步骤 0：前置实测优先级链（见上，已固化结论）
- [x] 步骤 1：`global-paths.ts` 新增 `getAuthJsonPath()`
- [x] 步骤 2：新建 `src/core/model-config.ts`（set/get/list/validate/readAuthProviders + 三层级定位读写）
- [x] 步骤 3：编译自检 `npx tsc --noEmit` 通过

## 自测清单验证
| 检查项 | 结果 | 备注 |
|--------|:--:|------|
| `readAuthProviders` 三 provider / 缺文件 null / 解析失败 null | ✅ | 单测覆盖 |
| `validateModel` 合法 ok；格式非法/未知 provider 硬校验拒绝并附 providers | ✅ | 单测覆盖 |
| `validateModel` model-id 软校验（ok + warning，不硬 block） | ✅ | 单测覆盖 |
| `setAgentModel('default','executor',...)` 写双语 frontmatter，保留其他字段与正文 | ✅ | 单测覆盖 |
| `setAgentModel('default','openfeel-vision',...)` 改 3 处且不误伤 reviewer | ✅ | 正则结构化定位 |
| `setAgentModel('default','feel',...)` 抛错且无文件变更 | ✅ | 单测覆盖 |
| `setAgentModel('global',...)` 只改 model 键、保留同 agent 其他字段 | ✅ | 单测覆盖 |
| `setAgentModel('project',...)` 写项目 opencode.jsonc | ✅ | 单测覆盖 |
| `getAgentModel` effective 三 scope 完整（修正链 default > project > global） | ✅ | 单测覆盖（修正断言） |
| default 多源不一致 `inconsistent=true` 且 effective=frontmatter 值 | ✅ | REV-1606 修正（原方案取 opencode-config 值） |
| `listAgentModels()` 返回 9 条、byScope 完整 | ✅ | 单测覆盖 |
| agent 名归一化（executor → openfeel-executor 幂等） | ✅ | 单测覆盖 |
| default 测试用 tmp frameworkRoot 不污染仓库源 | ✅ | git status 确认 templates-data/opencode-config.ts 无改动 |
| `npx tsc --noEmit` 无错误 | ✅ | EXIT=0 |

## 产出文件
- `src/core/model-config.ts`（新增）
- `src/core/global-paths.ts`（修改：新增 `getAuthJsonPath()`）

## 前置校验结果
- 方案完整性：通过（目标/实施步骤/产出文件/自测清单/阶段/最多重试 齐全）
- Phase 合法性：通过（stage-40.phase=`exec_running`；pipeline.phase=`active` 为多阶段宏观态，`current.op` 为空为设计现状，属 phase 偏差但 Feel 已明确指示执行）
- 流转合法性：通过（`openfeel flow health --quick` EXIT=0，全绿）

## 偏差记录
1. **解析优先级链修正（REV-1606）**：实测为 frontmatter > jsonc，方案原文写 jsonc > frontmatter。经用户授权按实测链实现：`getDefaultScopeValue` value=`fm ?? occ`，`getAgentModel` effective=`default ?? project ?? global`，i18n `model.get.inconsistent` 文案同步改为「以 frontmatter 为准」。
2. **未 git commit**：任务显式要求「不要 git commit」，覆盖系统提示的逐 op 提交纪律。
3. 无跳步违规。
