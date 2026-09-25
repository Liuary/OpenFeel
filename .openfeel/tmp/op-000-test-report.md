# 自测报告 — op-000

- **执行时间**：2026-09-25
- **执行 Agent**：openfeel-executor
- **重试次数**：1

## 执行摘要
隔离 HOME 下用真实 opencode CLI 1.18.30 完成 5 项实测，结论写入 op-000-findings.md，未降级。

## 实施步骤完成情况
- [x] 步骤 0：预检（`--version` / `debug --help` / `run --help` 均可执行）
- [x] 步骤 1：构造隔离 HOME + fixture（场景 A/B/C）
- [x] 步骤 2：实测解析（debug paths / debug config）
- [x] 步骤 3：实际加载验证（opencode run 指令型探针 + 反证）
- [x] 步骤 4：结论回填 + findings 记录

## 自测清单验证
| 检查项 | 结果 | 备注 |
|--------|:--:|------|
| 三命令可执行 | ✅ | opencode 1.18.30 |
| debug paths 隔离生效（home+config 指向临时目录） | ✅ | |
| config dir == .config/opencode（非 APPDATA） | ✅ | 无 mismatch |
| 场景 A instructions 拼接 | ✅ | 全局条目保留 + 项目追加 |
| 场景 A 同名去重为 1 | ✅ | |
| `~` 展开结论记录 | ✅ | 配置值不展开，加载层展开可用 |
| 场景 B AGENTS.md 自动加载 | ✅ | YES（marker 命中） |
| 场景 C experimental = {} 无报错 | ✅ | agent_manager_tool 静默丢弃 |
| 加载验证命中/反证 | ✅ | marker 命中；移除后消失 |
| findings 文件完整 | ✅ | 含 5 项结论 + 落点 |

## 产出文件
- `.openfeel/plan/v1/stage-37/op-000-findings.md`

## 前置校验结果
- 方案完整性：通过 / Phase 合法性：通过 / 流转合法性：通过

## 偏差记录
- 计划预判「`~` 不展开→必须绝对路径」，实测 `~` 加载层可展开；绝对路径方案保持（加固非推翻）。
