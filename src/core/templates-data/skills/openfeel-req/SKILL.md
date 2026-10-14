---
name: openfeel-req
description: OpenFeel 需求流转用法参考：需求（requirement）四层模型与 7 状态生命周期、req 命令组 11 个子命令（add/list/show/claim/release/set/link/advance/board/next/split）与参数、认领协议、REQ-NNN 正文与人读副本语义（机读权威恒为 flow.json）、与计划（plan.md）的关系、与 workflow_mode 正交。当需要创建/查询/认领/关联/推进需求，或要理解 REQ-NNN 状态与阶段聚合关系时加载。
---

# OpenFeel 需求流转（openfeel req）用法参考

## 说明

- 定位：**查询型参考手册**（只读，不自执行）。回答「需求是什么、状态怎么流转、`req` 命令怎么用」。
- 提供版本：**v1.2.0 起提供**（`openfeel req` 命令组）；命令/参数细节以 `openfeel req --help`（本仓执行）实时输出为准（CLI 演进后本文档可能滞后）。
- 本仓自举：本仓（openfeel 源码仓库）开发/执行时请用 `node bin/openfeel.js req <cmd>`；安装后使用 `openfeel req <cmd>`。
- 相关 skill：`openfeel-cli-usage`（全量命令速查）；本 skill 只承载需求流转专项。

## 四层模型与需求定位

需求层位于**「版本 → 需求 REQ-NNN → 计划 stage → 方案 op」**四层模型的第二层：**需求 = 排期与调度层**（回答「做什么、何时做」）；**计划 = 对某项明确需求的具体实现**。需求不等于计划——接取需求后仍按既有规划阈值走流水线（`plan.md` 头部标注「关联需求：REQ-NNN」）。

## 需求生命周期（7 状态）

```
draft ─→ scheduled ─→ in_progress ─→ done
  │          │            │
  └──────────┴────────────┴──→ blocked / cancelled / rejected
```

| 状态 | 语义 |
|------|------|
| `draft` | 草稿（`req add` 新建初值） |
| `scheduled` | 已排期（可被 `req next` 推荐接取） |
| `in_progress` | 进行中（认领后推进；**内部进度由关联阶段的 15-phase 聚合**） |
| `done` | 完成（**全部关联阶段 done 时自动收口**——前置集限定 `scheduled` / `in_progress`；`req advance --to done` 亦须此门） |
| `blocked` | 阻塞（可回到 `scheduled` / `in_progress`） |
| `cancelled` | 已取消（终态） |
| `rejected` | 已拒绝（终态） |

- **投影方向单一**：需求状态是关联阶段 phase 的聚合投影（方向：阶段 phase → 需求状态）；不得由需求状态前推阶段 phase。
- 合法显式流转由引擎流转表判定（`req advance --to <status>` / `req set --status <status>`）；终态（`done` / `cancelled` / `rejected`）不可再流转。

## 子命令（11 个）

| 子命令 | 用途 | 关键参数 |
|--------|------|----------|
| `req add <title>` | 创建需求（ID 自动分配 REQ-NNN，max+1 不回收；正文骨架铺到 `.openfeel/requirements/REQ-NNN.md`） | `--target-version <version>`、`--priority <P0\|P1\|P2>` |
| `req list` | 列出需求（可按状态 / 版本 / 认领人过滤） | `--status <status>`、`--target-version <version>`、`--owner <owner>`、`--json` |
| `req show <id>` | 查看需求详情（关联阶段为原始只读枚举）（含父需求 / 子需求） | `--json` |
| `req claim <id>` | 认领需求（占用校验；已被他人认领则拒绝） | `--owner <owner>`（缺省 `.openfeel/.info.json` user → git config user.name） |
| `req release <id>` | 释放认领（未认领为 no-op 成功） | — |
| `req set <id>` | 更新需求字段（白名单；状态流转合法性由引擎判定） | `--status`、`--title`、`--target-version`、`--priority` |
| `req link` | 关联需求到阶段 / 解绑 | `--stage <stageId>`、`--requirement <id>`、`--unlink`（与 `--requirement` 二选一） |
| `req advance <id>` | 显式推进需求状态（合法目标由引擎流转表判定；done 须全部关联阶段 done） | `--to <status>` |
| `req board` | 需求看板（按状态分组；7 组固定顺序） | `--target-version <version>`、`--json` |
| `req next` | 推荐下一个可接取需求（`scheduled` 且未认领；按预估版本升序） | `--owner <owner>`（含该认领人已认领的 scheduled 需求）、`--limit <n>`（缺省 1；大于 1 时 `--json` 追加 `candidates`）、`--json` |
| `req split <id>` | 拆分需求为若干子需求（**拆分即发布**：子需求入 `scheduled` 候选池；父子仅溯源、不参与聚合） | `--into <title>`（可重复；至少一项）、`--json` |

> `--json` 输出为纯 JSON 单文档（含 `schemaVersion`，脚本消费口径）；命令细节以 `openfeel req <sub> --help` 为准。

## 认领协议

- **轻量原子**：`owner` + `claimed_at` 两字段；`req claim` 做**占用校验**（已被他人认领 → 拒绝，exit 非 0 零写盘）；**无 TTL / 无心跳**（单机场景足够）。
- 认领人缺省解析：`.openfeel/.info.json` 的 `user` → `git config user.name`。
- 释放：`req release <id>`（未认领为 no-op 成功）；终态需求不可认领。

## REQ-NNN 正文与权威源

- 正文文件：`.openfeel/requirements/REQ-NNN.md`（`openfeel req` 机械铺骨架，**人读副本**）。
- **机读权威恒为 `.openfeel/flow.json` 的 `requirements` 条目**；正文与 flow.json 不一致时**以 flow.json 为准**（正文内状态为创建时快照，不追写）。
- `stages[*].requirement_id` 记录需求↔阶段关联（单值可空；存量阶段缺省 = `null`）；关联关系以 flow.json 为准。

## 与计划（plan.md）的关系

- 需求 = 排期与调度层；**具体实现仍由计划承载**——阶段 `plan.md` 头部标注「关联需求：REQ-NNN」。
- 需求状态流转（认领 / 关联 / 推进）经 `openfeel req` CLI 执行；planner 只读不写（不直写 flow.json）。

## 与 workflow_mode 正交

需求层与工作流模式（`full` / `fast`）**正交**：需求可分别由 full / fast 阶段实现；两种模式下需求纪律一致，`workflow_mode` 不影响需求状态机与命令行为。

## 需求与版本解绑

- 需求**不绑版本**：`target_version` 为**可选**字段，且**不作任何门**（不影响创建 / 认领 / 关联 / 状态流转 / done 判定）。
- **版本号仅在发布时推进**：日常需求动作（拆分 / 接取 / 推进）不触动版本号；版本推进属发布动作。

## 并行接取

- 拆分 → 子需求各自独立（独立 ID / 正文 / 认领 / 阶段关联），可**并行接取**：占用校验按需求粒度（`req claim`），子需求之间互不阻塞。
- **接取制为默认调度**：需求由 feel 发布、Agent 接取（`req next` → `req claim`）。
