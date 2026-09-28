# v1.1.2-stage-43 自测报告 — CLI 文档 skill 化与版本收口

- **执行时间**：2026-09-29
- **执行 Agent**：openfeel-executor
- **阶段**：v1.1.2-stage-43（phase = exec_running）
- **范围**：op-001 ~ op-005 全部实现与自测（串行执行）

---

## 一、执行摘要

5 个 op 全部完成并自测通过：① 新增 `openfeel-cli-usage` skill（skill 总数 16→17，经 build 双注入 + 自举）；② `docs/commands.md` 新增 `## config` 节 + `AGENTS.md` 命令清单补 4 条 + wizard 交叉引用；③ `config/BUG-004` 修复（N4 单点 mock + 删除伪隔离 + 只读隔离守护用例，状态 `resolved`）；④ 版本 **1.1.2** 全链路收口（A1~A8 + B 生成段 + C 传播 + CHANGELOG）；⑤ §3.1 清单复核收口与 REV-44/43/46 闭环登记。全量回归 **41 文件 / 694 用例全绿**（基线 693 + 隔离守护 1）；`tsc --noEmit` 退出 0；`lint i18n` 零错误；`lint kb` 0 过期引用（195 引用）；真实 `~/.openfeel/` 执行前后 mtime+hash 不变；仓库 `.openfeel/config.yaml` 三值恒 `auto/enabled/true`。

---

## 二、前置校验结果

| 校验项 | 结果 | 说明 |
|--------|:--:|------|
| 方案完整性 | 通过 | `deps.yaml` + op-001~005 齐备；各 op 含「目标/实施步骤/产出文件/自测清单/阶段/最多重试」（op 采用「变更目标/精确改动点」变体，等效有效） |
| Phase 合法性 | 通过 | `openfeel flow current`：phase=`exec_running`、current=`v1.1.2-stage-43.op-001`、retry=0 |
| 流转合法性 | 通过 | `openfeel flow health --quick` → 🎉 健康检查通过（方式：CLI 快检；phase 合法） |

---

## 三、各 op 实施与自测

### op-001 新增 `openfeel-cli-usage` skill
- **产出**：`src/core/templates-data/opencode/skills/openfeel-cli-usage/SKILL.md`（新建，扁平单文件/中文单语，frontmatter `name`/`description` 含触发词「CLI 命令/参数/phase/stageId/命名」）。
- **内容覆盖**：`## 说明`（含「以 `openfeel <cmd> --help` 实时输出为准」快照总声明 + wizard 边界互引）、`## 命令速查`（含本版本 4 项新命令）、`## phase 枚举与转移表`（15 phase + 转移表）、`## stageId 命名与目录映射`、`## 典型场景`、`## 权限模型要点`、`## 与 openfeel-wizard 的区别`。
- **build**：`npm run build` → 步骤 4/6 注入 `SKILL_DEFINITIONS`/`OPENCODE_SKILL_DEFINITIONS`（各 17），步骤 8 自举 `.opencode/skills/openfeel-cli-usage/SKILL.md`（含生成标记）；未改 `build.js`。
- **计数同步**：翻转清单 14 处（`opencode-instance:49/53/57/59`、`template-loader:104/106`、`setup:3/52/62/85-86`、`update:142/146-163（expectedSkills 追加）/260/268-270`）+ 全仓扫描另发现并同步 4 处非历史写死计数（`src/core/setup.ts:3/:52`、`manual/core/init.md:67`、`manual/core/setup.md:7`）。
- **自测**：`listOpencodeSkillNames().length === 17` 且含新 skill；`rg openfeel-cli-usage` 命中权威源/双注入/自举；4 个相关测试文件 82 用例全绿。

### op-002 文档与交叉引用同步
- **产出**：`docs/commands.md` 新增 `## config — 配置管理`（含 `effective`、来源优先级、未知 key 行为；置于 `## archive` 与 `## knowledge` 之间）；`AGENTS.md` 命令清单补 4 条 + 指向 `openfeel-cli-usage` skill 一行；`openfeel-wizard/SKILL.md` 加交叉引用（build 传播并入 op-003）。
- **复核项**：`docs/commands.md` flow/plan 节、`manual/cli/commands.md`、`manual/core/plan-path.md` 已含新命令/API，无改动。
- **自测**：`rg` 命中 docs config 节与 4 条命令；wizard 自举 `.opencode/skills/openfeel-wizard/SKILL.md` 含 `openfeel-cli-usage`（op-003 build 后复核）。

### op-003 版本 1.1.2 收口与全量回归
- **A 必改（8 项 → 1.1.2）**：`package.json:3`、`.openfeel/config.yaml:7`（精准单行替换，未整文件重写；改后 `config get` 可读且三值不变）、`src/core/config.ts:308/:365`、`agents-md/{zh-CN,en}.md:141`、`AGENTS.md:145`（修正既有 v1.1.0 漂移）、`package-lock.json:3/:9`（**手工同步 root 两行**，未 `npm install`；依赖自身版本未动）。
- **B 生成段**：`npm run build` 后 `template-loader.ts:2833`(en)/`:3286`(zh) 含 `v1.1.2`；文件内无残留 `v1.1.1`。
- **C 传播**：隔离 HOME（`$env:TEMP\opencode-home-iso`）下 `openfeel setup --lang zh-CN` → 隔离全局 `AGENTS.md:142` 含「当前 v1.1.2」且 `skills/openfeel-cli-usage/SKILL.md` 存在；未触碰真实 `~/.config/opencode/`。
- **CHANGELOG**：追加 `## [1.1.2] - 2026-09-29`（Added/Changed/Fixed），历史条目未动。
- **D/E**：`build.js`/`init.ts`/`migrate.ts`/`global-paths.ts`/`opencode-config.ts`/`i18n-data` 未改（历史注释与依赖版本保留）；`README*`/`docs/**` 无版本号载体，未改。
- **门禁（双口径实测）**：`tsc --noEmit`=0；`npm run build` 一致；`npm test` = **41 文件 / 694 用例全绿**；`lint i18n` → `✅ 531 键一致`（详情见「偏差记录」第 1 条）；`lint kb` → 0 过期引用。

### op-004 config/BUG-004 测试隔离修复与隔离守护
- **产出**：`test/core/workspace/identity.test.ts`（顶部 `vi.mock('node:os')` hoisted + 删除 `savedConfig` 保存/恢复逻辑 + `recordProjectLang` 改写为 mock HOME + 新增隔离守护用例：根级 `beforeAll` 用 `vi.importActual('node:os')` 记录真实 `~/.openfeel/config.json` 的 `mtimeMs`/SHA-256，`it` 断言前后不变，只读）；`.openfeel/manual/core/global-paths.md` 新增「历史残留：死映射的安全清理」节（含「不自动清理、不新增 CLI」裁定 + 四步安全步骤）。
- **自测**：`rg "savedConfig"` 零命中；`rg "homedir"` 仅 mock 工厂 + 守护 `importActual`；`npx vitest run identity.test.ts` = 11 用例全绿；外部核验单文件与全量 `npm test` 前后真实 `~/.openfeel/config.json` 的 **mtime 与 SHA-256 均不变**（ticks 级）。
- **BUG 状态**：`config/BUG-004` → `resolved`（待测试官验收）；`bugs/index.md`、`bugs/log.md` 同步。

### op-005 §3.1 清单复核收口与文本残留闭环
- **产出**：`stage-43/plan.md` §二 依赖按实盘更新（hard 41/47、soft 42/44/45/46 **均 satisfied** + 最终顺序 `41→42→44→45→46→47→43`）+ §八 修订记录；版本级 `v1.1.2/plan.md:169` stage-43 依赖列同步（消除陈旧表述）；`REV-v1.1.2-stage-43.md`（REV-003 处理记录）、`REV-v1.1.2-stage-46.md`（REV-007 归属备注）、`REV-v1.1.2-stage-44.md`（REV-001/002/003 处理记录，REV-002 落地 + REV-001/003 归归档官）追加（**均未改状态**）。
- **自测**：`v1.1.2/plan.md:24` 确认为 §3.1 引用式；`rg "三处同步|四处一致|四处同步" .openfeel/plan` 仅剩对照说明/修订记录（计划明确不改）；REV-44 三项仍 `pending`、REV-43 REV-003 仍 `resolved`（状态未被本阶段改动）；`lint kb` 0 过期引用。

---

## 四、产出文件

- **新增**：`src/core/templates-data/opencode/skills/openfeel-cli-usage/SKILL.md`、`.opencode/skills/openfeel-cli-usage/SKILL.md`（构建产物）
- **修改（源码/生成段）**：`src/core/update.ts`、`src/core/template-loader.ts`、`src/core/config.ts`、`src/core/setup.ts`（注释计数）
- **修改（文档/模板）**：`docs/commands.md`、`AGENTS.md`、`CHANGELOG.md`、`package.json`、`package-lock.json`、`.openfeel/config.yaml`、`src/core/templates-data/agents-md/{zh-CN,en}.md`、`src/core/templates-data/opencode/skills/openfeel-wizard/SKILL.md`、`.openfeel/manual/core/{global-paths,init,setup}.md`
- **修改（测试）**：`test/core/workspace/identity.test.ts`、`test/core/{opencode-instance,template-loader,setup,update}.test.ts`
- **修改（工作区记录）**：`stage-43/plan.md`、`v1.1.2/plan.md`、`REV-v1.1.2-stage-{43,44,46}.md`、`bugs/config/BUG-004_*.md`、`bugs/index.md`、`bugs/log.md`

---

## 五、门禁与隔离核验（原始输出摘要）

| 门禁 | 结果 |
|------|------|
| `npx tsc --noEmit` | 退出 0 |
| `npm run build` | 通过（双注入 17 skill / 单源一致性 3/3 + 3/3） |
| `npm test` | **41 文件 / 694 用例全绿** |
| `openfeel lint i18n` | `✅ 531 键一致`（零错误） |
| `openfeel lint kb` | `✅ 未发现过期引用（共检查 195 个引用）` |
| 真实 `~/.openfeel/config.json` | 全量测试前后 **mtime + SHA-256 均不变** |
| 真实 `~/.config/opencode/` | 未触碰（setup 传播在隔离 HOME 下执行） |
| 仓库 `.openfeel/config.yaml` | 三值恒 `auto`/`enabled`/`true` |

---

## 六、偏差记录

1. **门禁键数（事实性偏差，需上报）**：任务转达的 `REV-006`（low, pending）要求按「双口径：`lint i18n` 输出 502 = 双侧非空键数；数据文件总键数 531」表述。**实测与代码路径复核为 `lint i18n` 输出 `✅ 531 键一致`，数据文件亦 531，两者一致**——`src/commands/lint.ts:14-15,63-83` 分别取 `zh-CN.ts` 的 `zh` 字段与 `en.ts` 的 `en` 字段（两文件各填本侧，`en.ts` 全 531 条 `zh: ''`、`zh-CN.ts` 526 条 `en: ''` 为**对侧空**且不被读取），故 `consistentCount = 531`；**REV-006 所述 502 未复现**。已在 `ops/op-003.md` 修正记录与 `REV-v1.1.2-stage-44.md` 备注中如实记录并建议复审；本报告门禁按**实测**标注（531/531）。
2. **超范围（指令要求）**：任务要求「`rg` 全仓扫描写死 skill 数量的位置…逐一同步」——除审查官确认的 14 处测试断言外，另同步 4 处非历史写死计数（`src/core/setup.ts:3/:52` 注释、`manual/core/init.md:67`、`manual/core/setup.md:7`）；`CHANGELOG.md` 与 `manual/core/setup.md:59`「变更历史」属历史事实，**未改**。
3. **方案片段适配（非偏差，等价实现）**：op-004 隔离守护方案的 describe 片段无 `it` 用例，vitest 报 `No test found in suite`；且 describe 内 `beforeAll` 会晚于前置用例执行。改为**根级 `beforeAll` 记录基线 + 守护 `describe` 内 `it` 断言**，使守卫真正覆盖整文件运行前后（语义与方案目标一致）。
4. **行号漂移修正**：op-004 方案写 `beforeAll/afterAll`；因 vitest 用例结构约束改用 `it`（见上）。op-003 方案 A5/A6/B 行号与实盘一致，无漂移。
5. **无跳步**：全程按「读方案 → 前置校验 → 探索 → 编码 → 自测」执行，无跳步违规。

---

## 七、遗留 / 交接

- **REV-44 REV-001/003 → 归档官**（archiving 交接项）：REV-001（权限文档化核对/关闭）、REV-003（`docs/phase-5/07` 归档勘误）。
- **`REV-v1.1.2-stage-44` REV-001/002/003** 状态保持 `pending`（由验收方裁定）；`REV-v1.1.2-stage-46` REV-007 状态行滞后归 openfeel-reviewer 复审时同步。
- **`REV-006`**：本报告已如实记录 502 未复现的证据，建议审查官复审。
- **`config/BUG-004`**：`resolved`，待 openfeel-feel-tester 验收。
