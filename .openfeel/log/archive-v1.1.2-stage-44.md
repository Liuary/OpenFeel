# 归档摘要 — v1.1.2-stage-44

- **归档时间**：2026-09-28T19:53:52.531Z
- **阶段名称**：v1.1.2-stage-44
- **阶段状态**：archiving
- **依赖阶段**：无

## 操作产出

| ID | 标题 | 状态 | 尝试次数 |
|----|------|------|----------|
| op-001 | 权限语义实测前置（external_directory 键与覆盖合并语义） | done | 1/3 |
| op-002 | agent 模板 permission 补 external_directory 并修正 utility write→edit | done | 1/3 |
| op-003 | build 重生成与单一源一致性校验 | done | 1/3 |
| op-004 | 文档化权限覆盖语义与项目级收紧入口（含 REV-001 三点补强） | done | 1/3 |
| op-005 | 权限断言测试（9×2 补键、双语键集、生成段一致） | done | 1/3 |

## 审查记录

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| (无) | - | - | - |

## 审查与知识沉淀（归档官补记）

### REV 汇总（v1.1.2-stage-44）

| REV | 阶段 | 优先级 | blocking | 状态 |
|-----|------|:--:|:--:|:--:|
| REV-001 | 计划 | low | false | closed |
| REV-002 | 计划 | low | false | closed |
| REV-003 | 代码 | low | false | closed（归档阶段处置，本次已落实） |

- **REV-001**：op-003 文档化三点补强（镜像告警 / O4 精确化 / allow 值形式确证）→ 方案层全部落实（含场景 B 的 B1 单值 / B2 对象实测对比），closed。
- **REV-002**：[跨阶段] `stage-43/plan.md` 第二节依赖文本未同步 stage-45（soft）→ 归属 stage-43 计划文本，未越界修改，行动项转 Feel，closed。
- **REV-003（low，非阻塞，明确移交归档阶段）**：① 需求文档 §二.2（及 §二.1 过度概括）与 1.18.33 实测不符，原文无勘误；② 「框架默认 allow」措辞有歧义（平台默认实为 `ask`）；③ executor 报告「502 键」与实测不一致 → **本次归档全部处置**：docs/07 追加「勘误与实测补充」节；`manual/core/permission.md` 与 findings 已精确表述补键为行为变更（交付物复核通过，无需再改）；executor 报告键数已更正为「529 键（仓库源码 CLI）」。

### 知识沉淀

| 分类 | 新增条目 |
|------|----------|
| architecture | opencode agent permission 合并求值语义：findLast + 按键深合并 + 平台默认 ask |
| patterns | 隔离 HOME 实测 opencode 行为的方法：双设 HOME/USERPROFILE + debug paths 断言 + 零污染核对 |
| troubleshooting | 需求/文档记载的根因判断须实测复核（opencode 权限「顶层 permission 不生效」误判） |

manual 同步：`core/permission.md`（op-004 新建，82 行：键集 + 合并语义 + 收紧入口 + O4/O5 + 变更历史）+ `manual/index.md`（模块树 + 维护规则行，op-004 已登记）。本次归档**复核确认无缺漏，未追加修改**（`manual/index.md` 的维护规则行「9 agent 白名单键集、合并/优先级语义、项目级收紧入口或受管区边界变更」已覆盖本阶段变更面）。

### Bug

本阶段 **0 条**（测试官验收零阻塞；REV-003 属文档勘误，按审查条目流转，未另开 Bug）。

### 需求文档勘误（本阶段专属）

`docs/phase-5/07-openfeel-permission-issue.md` 已**追加**「勘误与实测补充（opencode 1.18.33）」节（**不改写原文**）：记录 5 条实测结论、§二.2 被推翻、§五镜像方案失效、未复现成因的诚实记录，以及实测版本与不确定性（未覆盖其它版本）。
