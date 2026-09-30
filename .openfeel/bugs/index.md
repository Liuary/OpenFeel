# Bug 归档索引（公共域）

> 汇总各模块 Bug 归档结论（按模块组织）。私域 Bug 条目关闭后，核心结论归入本目录对应模块文件。
> 详细登记、复现步骤与验收记录见私域 `.openfeel/users/{username}/bugs/{module}/`。

## 统计

| 状态 | 数量 |
|------|:--:|
| open | 1 |
| fixed | 0 |
| closed | 10 |
| **合计** | **11** |

> **v1.1.2-stage-43 收口（2026-09-29，commit `cbc606f`）**：`config/BUG-004`（medium，测试隔离缺口）经 openfeel-feel-tester **外部独立进程比对**验收**关闭**——`identity.test.ts`（11/11）与全量 `npm test`（41 文件 / 694 用例）前后真实 `~/.openfeel/config.json` 的 **mtime + SHA-256 均不变**；修复＝N4 单点 `vi.mock('node:os')` + 删除 `savedConfig` 伪隔离 + 新增只读隔离守护用例。**新登记 `cli/BUG-003`**（low，非阻塞）：`flow phases --json` 的 `--help` 文案只列 `{ phases, transitions }`，实际输出含 `advanceAccepted`（`cli/BUG-001` 修复的收尾遗漏）——**裁定归下一版本或由用户决定**，v1.1.2 不修。至此 v1.1.2 遗留缺陷清零（仅 1 条 low 非阻塞顺延）。
>
> **v1.1.2-stage-47 集中清理收口（2026-09-29，commit `2fb38fa`）**：6 个 `resolved` Bug 经 openfeel-feel-tester 隔离端到端验收**全部通过并关闭**（每条的根因 / 修法 / **防再犯** 三要素已写入对应模块文件）；`config/BUG-001` 复核维持 closed。验收中新登记 `config/BUG-004`（medium，测试隔离缺口，非阻塞，**归档官裁定归属 `v1.1.2-stage-43`**——发布前清零点，含 455 条历史死映射评估）。
>
> 本批共性防再犯（跨模块）：① **写策略按资产归属二分**（用户配置不覆盖 / 框架资产备份后覆盖，见 `config/BUG-002`）；② **文案变更收尾必做关键句全仓 `rg`**（见 `templates/BUG-002`，与 `templates/BUG-001` 同模式重复发生；`cli/BUG-003` 为同类「新增输出字段未同步 help 文案」变体）；③ **测试禁止直写真实全局目录**（保存/恢复≠隔离，见 `config/BUG-004`）；④ **验收/门禁命令用 `node bin/openfeel.js`**（PATH 全局旧版会给出错误口径）。
>
> **v1.1.2-stage-48 事件加固收口（2026-09-29，commits `afe93dd`~`b3b9b58`）**：① `cli/BUG-003`（low，`flow phases --json` help 缺 `advanceAccepted`，遗留 #1；即上方 stage-43 收口注中「顺延下一版本」者）经 op-004 修复（i18n 真源 + `flow.ts` fallback 双处）并由测试官验收**关闭**；② **新登记 `templates/BUG-003`**（low，非阻塞，open）——部署到用户全局环境的 skill 模板被改为 `node bin/openfeel.js`，用户项目无本仓 `bin/` 故不可执行，与 agent / agents-md「保留裸 `openfeel`」裁定口径相反；**建议与 `REV-v1.1.2-stage-48` REV-009 合并移交 `v1.1.2-stage-49`（U4/U6/U7）**。本阶段三大过程事件（审查官幻觉 / `npm test` 覆写真实环境 / 裸跑命中全局旧版）已机制加固，其防再犯条目见 `kb/patterns.md`（干净机器验证法 / 环境哈希守卫 / REV 可信度声明）、`kb/troubleshooting.md`（真实环境一次性数据清理规范）；`profile.yaml` 健壮性（非法 YAML 不覆盖）与 455 条死映射清理（455→0）为遗留 #7/#8/#13 落地点，均非 Bug 单（未开单）。
>
> **v1.1.2-stage-49 收口（2026-09-30，commits `3f023e3`/`1a8546a`）**：**本轮无新 Bug 登记**——整仓全量审查的 4 条 blocking（dry-run 写盘 / 悬空依赖 / postinstall 失效+engines / VERSION 死导出）以 **REV** 形式登记（见 `code_review/v1.1.2-stage-49.md`）并经 `op-010`/`op-011` 修复闭环，未开 Bug 单。`templates/BUG-003`（low）经 **U4-REV-001** 合并处置：范围由 29 行/2 skill **扩至 34 行/5 skill**，**裁定归后续补丁阶段**（状态维持 `open`）。统计维持 **10 条（open 1 / closed 9）**。
>
> **v1.1.2-stage-50 收口（2026-09-30，commits `feae65e`~`def6a33`）**：① **`templates/BUG-003`（low）关闭**——5 个部署型 skill 模板「用户环境主口径 `openfeel <cmd>` + 本仓自举加注」双口径落地（`node bin/openfeel.js` 计数各 = 1 仅加注行），3 个原无加注 skill（health/model-check/recover）补齐，`npm run build` 幂等；满足与 `U4-001` 的关闭条件（op-006 T53）。② **新登记 `cli/BUG-004`**（low，open，非阻塞）——en 模式下 `--help` 的 Arguments 描述仍为中文（T38 只落地 `walkCmd` 遍历机制，23 处 `.argument()` 仅 `stage.create` 补键）；**建议归 `v1.1.2-stage-51`**（该阶段大量触及 CLI/i18n，与 REV-004 下版本 `view add` 移除一并收口）。统计 **11 条（open 1 / closed 10）**。

## 模块索引

### cli

| 编号 | 标题 | 优先级 | 状态 | 来源阶段 |
|------|------|:--:|:--:|----------|
| [BUG-001](cli.md) | `flow phases` 自描述 phase 与 `advance` 接受集合不一致（自定义 `pipeline.yaml` 下的第二信源） | low | **closed** | v1.1.2-stage-41 |
| [BUG-002](cli.md) | 阶段目录冲突错误未走 i18n 键（en 下为中文）+ `common.stageDirConflictTmpl` 死键 | low | **closed** | v1.1.2-stage-41 |
| [BUG-003](cli.md) | `flow phases --json` 的 `--help` 文案只列 `{ phases, transitions }`，实际输出含 `advanceAccepted`（`cli/BUG-001` 收尾遗漏） | low | **closed** | v1.1.2-stage-48 |
| [BUG-004](cli.md) | en 模式下 `--help` 的 Arguments 描述仍为中文（T38 只落地遍历机制，23 处 `.argument()` 仅 1 处补键） | low | **open**（非阻塞；**建议归 `v1.1.2-stage-51`**） | v1.1.2-stage-50 |

### config

| 编号 | 标题 | 优先级 | 状态 | 来源阶段 |
|------|------|:--:|:--:|----------|
| [BUG-001](config.md) | `config set lang` 参数解析异常（Commander 参数吞噬） | high | **closed** | v0.4.4（遗留） |
| [BUG-002](config.md) | `openfeel init` 无条件覆盖已存在的 `config.yaml`（数据丢失；stage-46 缓解 → **stage-47 语义修复**） | high | **closed** | v1.1.2-stage-42 |
| [BUG-003](config.md) | `config effective` 无 `profile.yaml` 时 `auto_advance` 来源标为 `profile.yaml` 而非 `builtin` | medium | **closed** | v1.1.2-stage-42 |
| [BUG-004](config.md) | `test/core/workspace/identity.test.ts` 直写真实 `~/.openfeel/config.json`（测试隔离缺口，非阻塞） | medium | **closed**（stage-43 N4 隔离修复验收通过） | v1.1.2-stage-47 |

### archive

| 编号 | 标题 | 优先级 | 状态 | 来源阶段 |
|------|------|:--:|:--:|----------|
| [BUG-001](archive.md) | `openfeel archive` 对缺 `deps` 字段的存量阶段抛 TypeError（预存量缺陷） | low | **closed** | v1.1.2-stage-41 |

### templates

| 编号 | 标题 | 优先级 | 状态 | 来源阶段 |
|------|------|:--:|:--:|----------|
| [BUG-002](templates.md) | 全局约束模板 `agents-md` 权限部署路径行未泛化（双源不同步） | medium | **closed** | v1.1.2-stage-45 |
| [BUG-003](templates.md) | 部署到用户全局环境的 skill 模板被改为 `node bin/openfeel.js`，用户项目不可执行（与 agent / agents-md 保留裸 `openfeel` 的口径相反） | low | **closed**（stage-50 op-006 T53 双口径 + build 幂等验收通过） | v1.1.2-stage-48 |

> 注：templates 模块早期 `BUG-001`（事务官标识列未加前缀）已于 `v1.1.2-stage-41` 关闭、未纳入本目录（详见私域 `.openfeel/users/Liuary/bugs/templates/`）；`kb/BUG-001`（`lint kb` 过期引用）已于 stage-42 关闭，同见私域。
