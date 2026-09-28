# 自测报告 — v1.1.2-stage-44.op-001

- **执行时间**：2026-09-29 03:00（本地）
- **执行 Agent**：openfeel-executor
- **重试次数**：第 1 次
- **类型**：调研/实测（无源码变更）

## 执行摘要

在隔离 HOME（`%TEMP%\opencode\stage44-op001`）下用真实 `opencode-ai@1.18.33` 完成 6 场景 A–F + 二进制取证 + `opencode run` 判别器，全部结论落定（无 DEGRADED/INCONCLUSIVE）；真实全局配置零污染。产出 `op-001-findings.md`。**发现 1 项与需求原文机制描述冲突**（顶层 `permission: "allow"` 实际**会**覆盖 `external_directory`），已上报 Feel 并获裁定。

## 实施步骤完成情况

- [x] 步骤 0 预检：`opencode --version`=1.18.33；`debug paths/config/agent` 均存在
- [x] 步骤 1 隔离 HOME + 隔离项目：`debug paths` 断言 `home`/`config` 均指向隔离目录（无 mismatch）
- [x] 步骤 2 场景 A：默认 `external_directory` = `ask`（ruleset + `opencode run` 双证）；未定义 agent → `Agent not found` exit 1
- [x] 步骤 3 场景 B：单值 `"allow"` 与对象 `{"*":"allow"}` **均被接受且等价**；单值实测生效
- [x] 步骤 4 场景 C：顶层 vs 内联 = **按键深合并**（同名键 md 优先），非整体覆盖
- [x] 步骤 5 场景 D：自动追加 allow **仅限 opencode 自身 tool-output 目录**（无全局 `*: allow`）
- [x] 步骤 6 场景 E：`write` **未识别**（tools.write 仍 true）；`edit` 为授权键
- [x] 步骤 7 场景 F：项目 jsonc `agent.<name>.permission` **不能覆盖 md 已声明键**（可补未声明键）；项目级 `.opencode/agent/<name>.md` 可覆盖全局同名 agent
- [x] 步骤 8 清理与回填：临时目录删除、env 清理、findings 写入、回填表完成
- [x] 附加取证：V1 `evaluate` = `findLast`（最后匹配者胜，`*` 通配匹配权限名）；`opencode run` 非 TTY 对 `ask` 自动拒绝（获判别器）

## 自测清单验证

| 检查项 | 结果 | 备注 |
|--------|:--:|------|
| `opencode --version` 已记录 | ✅ | 1.18.33 |
| `debug paths` 断言 home/config 指向隔离目录 | ✅ | 未触发 config dir mismatch |
| 场景 A：默认 `external_directory` 已记录 | ✅ | `ask` |
| 场景 B：单值/对象两形式结论已记录（REV-001-③） | ✅ | 均接受且等价；单值生效 |
| 场景 C：覆盖/合并结论已记录 | ✅ | 按键深合并，同名键 agent 优先 |
| 场景 D：自动追加 allow 是否生效已记录 | ✅ | 仅 tool-output，非全局 |
| 场景 E：`write` vs `edit` 识别结论已记录 | ✅ | `write` 无效 |
| 场景 F：项目 jsonc vs frontmatter 优先级已记录 | ✅ | 配置不能覆盖 md 已声明键 |
| findings 已写入 + 真实 `~/.config/opencode/` 未被写入 | ✅ | 文件数 3689 / mtime 前后一致 |
| 环境变量已清理；临时目录已删除 | ✅ | `stage44-op001`、`stage44-ext` 均删除 |

## 产出文件

- `.openfeel/plan/v1/stage-44/op-001-findings.md`（新增）

## 前置校验结果

- 方案完整性：通过（6 项必填字段齐备；无 `- **前置**` 但已含目标/步骤/产出/自测/阶段/最多重试）
- Phase 合法性：通过（`pipeline.phase=exec_running`；`current.op=op-001` 匹配）
- 流转合法性：通过（`openfeel flow health --quick` 健康检查通过）
- 方式：CLI 优先（`flow current` + `flow health --quick`）

## 偏差记录

1. **未偏离方案**（步骤 0–8 逐条执行）。
2. **超方案范围的附加取证（增补，非缩减）**：① 二进制反编译定位 `evaluate` 实现；② `opencode run` 作为 `ask` 判别器（方案仅列 `debug config/agent/run` 三者，`run` 本在列，但「非 TTY 自动拒绝」这一判别特性属新发现）；③ `--tool` 探针限制（ask 自动放行）作为方法论局限记录。以上均为**强化证据**，不改变方案产出形态。
3. **`--tool` 探针的 ask 自动放行**导致最初 `--tool` 版场景 (b) 判定一度失效，已改用 `opencode run` 重新取得决定性结论（未把未验证结论写成已验证）。
4. 未跳步、未越界（不涉源码/生成段）。
