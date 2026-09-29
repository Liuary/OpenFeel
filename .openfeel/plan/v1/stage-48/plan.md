# v1.1.2-stage-48 — 事件加固 + 遗留问题修复

> **版本**：v1.1.2（**继续，不新建版本**；`package.json` 已为 `1.1.2`） | **创建日期**：2026-09-29 | **Planner**：独立 openfeel-planner
> **定位**：v1.1.2 主线（41→…→43）已归档完成。本阶段针对**三大过程事件**（审查官工具幻觉 / `npm test` 静默覆写真实环境 / 裸跑命中全局旧版）做**机制加固**，并清理 **13 项已盘点遗留**，为 stage-49 整仓全量审查提供稳定基线。

---

## 一、背景与动机

| 事件 | 事实 | 后果 |
|------|------|------|
| **A 审查官工具幻觉** | 两轮 openfeel-reviewer 会话自认工具调用异常（输出重放、路径漂移、虚构内容），结论不可信；Feel 冻结推进，改命令行独立取证 + 全新会话重做；REV 文件已加「可信度声明」 | 审查结论可信度缺乏机制保障；无纪律约束「异常即中止」「可疑结论不得继承」 |
| **B `npm test` 静默覆写真实环境** | `init.test.ts`（stage-42 op-005）、`identity.test.ts`（stage-43 op-004）已修；**`flow.test.ts`/`plan.test.ts` 仍未 mock `node:os`**（仅 `spyOn(process,'cwd')` + tmpDir），经 `initProject` → `ensureGlobalConfig()`（`src/core/init.ts:249-251` → `:83-96`）在**全局 `~/.openfeel/config.json` 不存在的机器（CI/新开发者）**会写真实全局文件（本机因文件已存在未触发，**条件写，待干净环境实测**） | 违反「不得触碰真实 `~/.openfeel/`」硬纪律；CI 无环境守卫 |
| **C 裸跑命中全局旧版** | 全局 `openfeel@1.1.1`（`AppData\Roaming\npm`）vs 本仓 `node bin/openfeel.js`=1.1.2；本仓**无** `node_modules/.bin/openfeel`（包自身不建 bin 链接）→ `npx openfeel` 不可靠 | 文档/指引「执行型」命令口径不一致，易以旧版结论误导 |

### 遗留问题编号清单（13 项 → op 分派，**完整可核查**）

> 依据 REV-48-001 要求补全：13 项一一对应 op，含验收要点。原计划仅可见 9 项（#9~#12 未点名），此处全部编号闭合。

| # | 内容 | 类型 | 归属 op | 验收要点 |
|:--:|------|------|:--:|----------|
| **#1** | `cli/BUG-003`：`flow phases --json` help 文案缺 `advanceAccepted` | i18n | op-004 ① | `node bin/openfeel.js flow phases --json --help` 文案含 `advanceAccepted`；zh/en 对称 |
| **#2** | `REV-44` REV-001 状态行 `pending` → 应 `closed`（验收已 closed） | 状态 | op-004 ③（H11 提请） | **已闭环**：审查官 2026-09-29 plan_review 收尾同步为 `closed`（实测 `:58`）→ op-004 **不再提请**（REV-48-008） |
| **#3** | `REV-44` REV-002 同上 | 状态 | op-004 ③（H11 提请） | **已闭环**：同上（实测 `:89`）→ op-004 **不再提请** |
| **#4** | `REV-44` REV-003：补验收记录 + 状态同步；并精化 `templates-data/agents-md/{zh-CN,en}.md:115` 与 `AGENTS.md:122` 的「框架默认 allow」措辞（补「opencode 平台默认 `ask`」限定） | 文档/状态 | op-004 ②（措辞）+ ③（提请） | 措辞含平台默认 `ask` 限定，双语 + build 一致；REV-44 REV-003（实测 `:212` `pending`）处理记录追加提请行 |
| **#5** | `REV-46` REV-007 状态行 `pending` → 应 `closed` | 状态 | op-004 ③（H11 提请） | **已闭环**：审查官 2026-09-29 收尾同步为 `closed`（实测 `:280`）→ op-004 **不再提请** |
| **#6** | `REV-46` REV-011 状态 `resolved` 但验收记录为空 | 状态 | op-004 ③（H11 提请） | 实测 `:515` `resolved`、验收记录仍空 → 提请补验收记录或说明 |
| **#7** | `profile.yaml` 嵌套未知字段被 Zod 剥离（子 Schema 无 `.passthrough()`） | 代码 | op-005 ① | 隔离 HOME 下 `user.custom_ext`/`preferences.custom_pref` 往返后仍在 |
| **#8** | `profile.yaml` 非法 YAML 被 `ensureProfileDefaults` 用默认值整体覆写（无备份） | 代码 | op-005 ② | 非法 YAML → 不被整体覆写 + 产出提示/异常记录 |
| **#9** | 事件 C：**文档/skill 执行口径统一**（执行型 → `node bin/openfeel.js`） | 文档 | **op-003 ①** | 全仓扫描（见 op-003 验收）后剩余命中均为查询型且已加注旧版风险 |
| **#10** | 事件 C：**CI 版本门禁**（`node bin/openfeel.js --version` vs `package.json.version`） | 环境 | **op-003 ③** | 两个 job（`build-and-test` + `publish`）各含一处断言 |
| **#11** | `test/commands/{flow,plan}.test.ts` 补 `vi.mock('node:os')` | 测试 | **op-002 ①** | 干净 HOME 实测不触碰真实全局文件 |
| **#12** | CI 真实环境 hash 守卫（`~/.openfeel/`、`~/.config/opencode/`、`~/.config/openfeel/`） | 环境 | **op-002 ②** | CI 新增守卫 step；存在性 + 文件清单 + 逐文件 hash 三层 |
| **#13** | 真实 `~/.openfeel/config.json` 的 455 条死映射（**键为绝对路径**） | 环境 | **op-006** | 删除数恰为 455、删后 `projects` 键数 0、JSON 合法、备份存在 |

> 覆盖核对：op-002=#11/#12；op-003=#9/#10；op-004=#1/#2/#3/#4/#5/#6；op-005=#7/#8；op-006=#13；op-007=回归。**13/13 有归属**。

---

## 二、关键裁定

| # | 裁定 | 依据 |
|---|------|------|
| **H1** | 审查纪律**写入 reviewer agent 模板**（双语）而非仅写入 manual：纪律须在审查官每次会话自动加载 | 模板随 `openfeel setup` 部署并常驻 agent prompt；manual 需按需查阅，约束力弱 |
| **H2** | 事件 A 纪律四条：①**工具异常即中止并如实报告**（不得臆造/续写结论）；②**可疑历史结论不得继承**，须独立取证；③**关键事实以命令行（`rg`/`Get-Content`）取证为准**，与 read/glob 冲突时以命令行为准；④每条结论**可第三方复现**（命令 + 版本 + 环境三要素） | 直接对应两轮幻觉的具体形态；可操作、可验收 |
| **H3** | REV「可信度声明」规范**落入 manual（新增 `manual/core/code-review.md` 节或既有 `manual/core/` 文档）+ kb**，原则：**保留原文不删**、仅追加声明与独立复核记录 | 审计链不可篡改（与「不回改历史归档」一致） |
| **H4** | Feel 侧「审查会话健康探测」**建议纳入**：Feel 在唤起审查官的首轮要求其执行一次最小工具自检（`rg --version` + `Get-Content` 读一已知文件并回报内容），异常即判定会话不可用并重开会话。落点：`feel.md` 模板（双语）+ manual | 以极低成本拦截「坏会话继续产出结论」；比事后加可信度声明更前置 |
| **H5** | 事件 B：**两测试补 `vi.mock('node:os')`**（与其余 16 个已隔离文件同构）+ **CI 环境守卫**（`~/.openfeel/`、`~/.config/opencode/`、`~/.config/openfeel/` 运行前后存在性 + 内容 hash 断言）+ kb/patterns 沉淀反例 | 隔离是**硬要求**；CI 守卫防回归 |
| **H6** | `ensureGlobalConfig` **不新增** `NODE_ENV==='test'` 类守卫（**仅评估，结论：不做**） | 生产代码引入测试环境分支属反模式；且 `isFirstUse()` 已存在，正确修法在测试侧 mock（H5）。若评估发现 mock 无法覆盖，再另立 |
| **H7** | 事件 C：**执行型指引统一为 `node bin/openfeel.js <cmd>`**；**查询型/面向使用者**参考保留 `openfeel` 但加注「可能命中全局旧版，本仓请用 `node bin/openfeel.js`」 | 消除口径分歧；不阻断使用者的正常安装用法 |
| **H8** | CI 版本门禁：`node bin/openfeel.js --version` 与 `package.json.version` 一致性断言；**并纳入 `lint i18n`**（低成本高价值质量门禁） | 防「代码-版本号漂移」；lint i18n 已是既有命令 |
| **H9** | `bin/openfeel.js` 全局旧版告警：**判定为可选增强，本阶段不做**（结论见 §六 R5） | 每次 CLI 启动做全局探测 = 额外 IO + 跨平台不确定性；文档口径（H7）+ CI 门禁（H8）已覆盖主要风险 |
| **H10** | 遗留 #13（455 条死映射）：**执行清理**（用户已裁定）——脚本化 + 备份 + **隔离副本先行验证** + 执行 + 复核 | 455 键全为测试前缀、0 条真实键；`rg` 确认 src 不读取该前缀 |
| **H11** | REV 状态行滞后（#2/#3/#5/#6）：**由本阶段统一提请审查官同步**（planner **不自行改状态**）；本阶段仅在 REV 处理记录登记「提请关闭」 | 状态流转属审查官/验收方职责 |
| **H12** | 「**可疑会话产出的处置**」制度化（REV-48-005）：判定可疑的会话，其已写出的 REV 条目/验收记录**自动降级为「待复核」**，不得被后续会话或 Feel 直接引用推进；新会话须独立复核后方可据此推进。落点：`manual/core/code-review.md` 新节 + `feel.md` 健康探测末尾一句 | 现状仅事后追加「可信度声明」（REV-44~46 已有 4+ 处实践），属补救；该语义需上溯为**前置规则** |

---

## 三、前置依赖与上下游衔接

- **前置依赖**：`v1.1.2-stage-43`（已完成）——本阶段修改的 skill 权威源（`openfeel-cli-usage`、`openfeel-wizard`）由其创建；版本号已收口为 `1.1.2`（本阶段**不做版本号变更**）。
- **下游**：`v1.1.2-stage-49`（整仓全量审查）——本阶段提供稳定基线（隔离纪律落地、CI 守卫、文档口径统一），避免审查阶段被环境噪声干扰。
- **顺序**：`… → 43 → 48 → 49`。

---

## 四、op 级任务清单

| op | 主题 | 具体改动点（文件:行号 → 改动） / 验收要点 |
|----|------|------------------------------------------|
| op-001 | 事件 A：审查纪律 + 可信度规范 + 健康探测 | ① `src/core/templates-data/opencode/agents/{zh-CN,en}/openfeel-reviewer.md`：新增「工具调用异常与独立取证」节（H2 四条：异常即中止如实报告 / 可疑历史结论不得继承 / 命令行取证优先于 read·glob / 结论须第三方可复现）；② `src/core/templates-data/opencode/agents/{zh-CN,en}/feel.md`：新增「审查会话健康探测」纪律（H4：首轮最小工具自检 → 异常即重开会话）+ **一句可疑产出处置指引**（REV-48-005）；③ REV 可信度规范（H3）：新增 `.openfeel/manual/core/code-review.md`（或既有 manual 文档补节），须含 —— ①可信度声明写法；②「**可疑会话产出的处置**」新节（REV-48-005）：判定可疑的会话，其已写出的 REV 条目/验收记录**自动降级为「待复核」**，不得被后续会话或 Feel 直接引用推进；新会话须**独立复核关键结论后方可据此推进**；③保留原文不删原则；并补 `.openfeel/kb/patterns.md` 条目「REV 可信度声明与独立复核」；④ `npm run build` 重生成 `template-loader.ts` 生成段与 `.opencode/agents/` 自举。**验收**：`rg -n "工具调用异常|独立取证|第三方可复现" src/core/templates-data/opencode/agents/{zh-CN,en}/openfeel-reviewer.md` 双语命中；`feel.md` 双语含健康探测 + 可疑产出指引；manual 含「可疑会话产出的处置」节；build 一致性校验通过且幂等；manual/kb 条目存在 |
| op-002 | 事件 B：测试隔离补齐 + CI 环境守卫 + kb 沉淀 | ① `test/commands/flow.test.ts:12` 与 `test/commands/plan.test.ts:12`：加 `vi.mock('node:os', async (importOriginal) => ({ ...await importOriginal(), homedir: () => mockHome.dir }))`（同构 `test/core/setup.test.ts:11-14`），`beforeEach` 建 mock HOME；② `.github/workflows/ci.yml`：`npm test` **前后**各做一次环境快照（`~/.openfeel/`、`~/.config/opencode/`、`~/.config/openfeel/` 的存在性 + 递归文件 hash），比对不变则通过，否则失败（新增 step）；③ `.openfeel/kb/patterns.md`：沉淀「凡触达全局路径的测试必须 `vi.mock('node:os')`，**禁止保存/恢复伪隔离**」反例（补既有「测试 cwd 隔离模式」条目邻近）；④ H6 结论记录（`ensureGlobalConfig` 不加测试分支）。**验收**：干净 HOME（`HOME`/`USERPROFILE` 指向临时目录）下运行两文件，真实全局文件不被创建/改动（**待干净环境实测**）；CI 新增守卫 step 本地可用脚本模拟并通过；kb 条目存在 |
| op-003 | 事件 C：执行口径统一 + CI 版本门禁 | ① 「执行型」指引统一为 `node bin/openfeel.js <cmd>`：`src/core/templates-data/opencode/skills/openfeel-cli-usage/SKILL.md`、`openfeel-wizard/SKILL.md`、仓库根 `AGENTS.md`「项目流程工具」速查段（`:154-166`）、`.openfeel/manual/cli/*.md`——**清单不闭合，验收以全仓扫描为准**（REV-48-006）：`rg -n "\bopenfeel (flow|stage|plan|config|knowledge|lint|init|setup|update|migrate)\b"` 全仓扫描，逐条确认剩余命中均为**查询型**且已加注旧版风险（kb 历史条目与归档除外）；② `npm run build` 重生成 skill 生成段与 `.opencode/skills/` 自举（根 `AGENTS.md` 无受管区、手工维护，不涉 build）；③ `.github/workflows/ci.yml` 版本一致性断言 **两个 job 各一处**（REV-48-004）：`build-and-test`（`npm run build` 后）+ `publish`（**`npm run build` 之后、`npm publish` 之前**）——断言 `node bin/openfeel.js --version` 输出 === `package.json.version`；并增 `node bin/openfeel.js lint i18n` step（H8）；④ H9 结论记录（不做 bin 全局旧版告警）。**验收**：扫描命令输出经逐条处置（无遗漏执行型裸 `openfeel`）；ci.yml 的 `build-and-test` 与 `publish` 两 job 均含版本断言 + `lint i18n` step；build 幂等 |
| op-004 | 遗留批：i18n 文案 + 权限措辞 + REV 状态提请 | ① `cli/BUG-003`：`flow phases --json` help 文案补 `advanceAccepted` 说明——**真正文案源** `src/core/i18n-data/zh-CN.ts:481` + `en.ts:456`（键 `help.flow.phases.json`；经 `src/cli/index.ts:62-131` 注入），`src/commands/flow.ts:336` 为 fallback，同步更新；② 遗留 #4 措辞精化：`src/core/templates-data/agents-md/{zh-CN,en}.md:115`（「框架默认 `allow`」）与仓库根 `AGENTS.md:122` 补「**opencode 平台默认 `ask`**」限定（对照 `.openfeel/manual/core/permission.md:34` 精确表述），双语同步 + `npm run build`；③ **REV 状态提请（H11，不改状态）**：`REV-v1.1.2-stage-44.md:58/:88/:210`（REV-001/002/003 状态行 `pending` vs 验收/归属已定）、`REV-v1.1.2-stage-46.md:280`（REV-007）、`REV-v1.1.2-stage-46.md:514`（REV-011 `resolved` 但验收记录为空）——在各 REV 处理记录追加「提请审查官同步状态」行并给出依据。**验收**：`node bin/openfeel.js flow phases --help`（或 `--json --help`）文案含 `advanceAccepted`；zh/en 对称；agents-md/AGENTS.md 措辞含平台默认 `ask` 限定且 build 后一致；5 处 REV 处理记录已追加提请行（状态未改） |
| op-005 | 遗留：`profile.yaml` 健壮性 | ① **#7 嵌套未知字段保全**：`src/core/config.ts:57-68`（`ProfileUserSchema`/`ProfilePreferencesSchema`）、`:71-74`（`ProfileHistorySchema`）补 `.passthrough()`（顶层已 `.passthrough()` `:77-81`）——使 `user.*`/`preferences.*`/`history.*` 自定义键在 `readProfile`→`writeProfile` 往返中不被剥离；② **#8 非法 YAML 不覆盖（REV-48-007 定案）**：`src/core/config.ts:181-206`（`readProfile` 异常回 `DEFAULT_PROFILE`）+ `:233-267`（`ensureProfileDefaults` 写回）——**定案采用「解析失败 → 不写回（或仅在可安全重建时写）+ `console.warn` 提示 + 返回 `parseError` 标记供调用方决策」**：<br>· **不引入** `config.ts → update-infos.ts` 依赖边（`ensureProfileDefaults` 触发于 Feel 会话流程而非 `update` 命令，写全局 `~/.openfeel/update_infos.md` 语义不恰当）；<br>· `readProfile` 返回值增加 `parseError?: string`（可选字段，不破坏现有签名）；`ensureProfileDefaults`/`writeProfile` 调用方见 `parseError` 即**跳过写回**并 `console.warn`（含文件路径与错误原因）；<br>· 理由：非法 YAML 属用户可修复态，**覆盖才是不可逆伤害**；`console.warn` 保证「失败响亮」，`parseError` 供上层（如 `config effective`）降级展示；避免新增跨模块依赖与全局状态写入。<br>**验收**：隔离 HOME 下 profile 含 `user.custom_ext`/`preferences.custom_pref` → 经 `ensureProfileDefaults` 往返后仍在；profile 为非法 YAML → 文件字节不变 + stderr 含告警；`npm test` 相关用例更新 |
| op-006 | 遗留：455 条死映射清理（#13） | **键形态实测（REV-48-002）**：`projects` 下 455 条键为**绝对路径**，形如 `C:\Users\Liuary\AppData\Local\Temp\openfeel-update-test-iFoJSv`——测试前缀是**路径末段**，**不是键首**。故：① 新增一次性脚本 `.openfeel/tmp/clean-dead-lang-mappings.mjs`（**不纳入 src、不纳入 npm files**），**匹配表达式为末段匹配**（禁用 `startsWith('openfeel-update-test-')`，实测 0 命中）：<br>`const isDeadTestKey = (k) => k.split(/[\\/]/).pop().startsWith('openfeel-update-test-');`（收紧变体：额外要求父目录 === `os.tmpdir()` 或位于系统临时目录下）；只删命中键、保留其余全部键，写出前 `JSON.stringify` 校验；② **隔离副本先行**：复制真实文件到临时目录试跑 → **断言删除数 === 455**（与实测前计数比对）+ 其余键与顶层结构（`lang`/`projects`）不变 + JSON 合法（**仅「无真实键被删」不足以证明成功——须显式断言删除计数，否则 0 命中会假性通过**）；③ **备份**：执行前复制为 `config.json.bak.{ts}`；④ 执行后复核：`projects` **剩余键数 === 0** + JSON 合法 + `node bin/openfeel.js config list-projects` 可读；⑤ 记录清理前后计数（455 → 0）与备份路径。**四步（隔离副本验证 → 备份 → 执行 → JSON 合法性 + 剩余键复核）不可省**。**验收**：真实 `~/.openfeel/config.json` 中测试前缀键清零（455 → 0）、无真实键被删、文件合法可读、备份存在；过程记录入私域日志 |
| op-007 | 测试与全量回归 | ① 新增/调整测试：`flow.test.ts`/`plan.test.ts` 隔离断言、`config.test.ts`（profile 嵌套 passthrough / 非法 YAML 不覆盖）、i18n 文案、模板纪律文案断言（若适用）；② **全程隔离 HOME/临时目录**（`vi.mock('node:os')` / env），不触碰真实 `~/.openfeel/`、`~/.config/opencode/`、`~/.config/openfeel/` 与仓库 `.openfeel/config.yaml`；③ `npm run build && npm test` 全绿（基线：**41 文件 / 694 用例**（REV-48-003 更正，原写 693），本阶段新增后 ≥ 该数）；④ `openfeel lint i18n` + `openfeel lint kb` 零错误（均以 `node bin/openfeel.js` 执行）。**验收**：全绿 + 双 lint 零错误 + 环境哈希前后一致 |

---

## 五、影响文件清单

| op | 新增 | 修改 |
|----|------|------|
| op-001 | `.openfeel/manual/core/code-review.md`（或既有 manual 补节） | `src/core/templates-data/opencode/agents/{zh-CN,en}/{openfeel-reviewer,feel}.md`、`src/core/template-loader.ts`（生成段）、`.opencode/agents/*`（自举）、`.openfeel/kb/patterns.md` |
| op-002 | CI 守卫脚本（可选，内联 step 即可） | `test/commands/flow.test.ts`、`test/commands/plan.test.ts`、`.github/workflows/ci.yml`、`.openfeel/kb/patterns.md` |
| op-003 | — | `src/core/templates-data/opencode/skills/{openfeel-cli-usage,openfeel-wizard}/SKILL.md`、`AGENTS.md`、`.openfeel/manual/cli/*.md`、`src/core/update.ts`（`SKILL_DEFINITIONS` 生成段）、`src/core/template-loader.ts`（生成段）、`.opencode/skills/*`（自举）、`.github/workflows/ci.yml` |
| op-004 | — | `src/core/i18n-data/{zh-CN,en}.ts`、`src/commands/flow.ts`（fallback 文案）、`src/core/templates-data/agents-md/{zh-CN,en}.md`、`AGENTS.md`、`src/core/template-loader.ts`（生成段）、`REV-v1.1.2-stage-44.md`、`REV-v1.1.2-stage-46.md`（处理记录追加，**不改状态**） |
| op-005 | — | `src/core/config.ts`（三个子 Schema `.passthrough()` + `readProfile`/`ensureProfileDefaults` 失败不覆盖） |
| op-006 | `.openfeel/tmp/clean-dead-lang-mappings.mjs`（一次性脚本） | 真实 `~/.openfeel/config.json`（**用户环境**，经备份后执行） |
| op-007 | 新增测试用例 | `test/commands/{flow,plan}.test.ts`、`test/core/config.test.ts`、`test/core/i18n.test.ts`、`test/core/template-loader.test.ts` |

---

## 六、风险与注意事项

| # | 风险 | 缓解 |
|---|------|------|
| R1 | 测试隔离缺口在**本机未触发**（全局文件已存在），修复效果需干净环境验证 | op-002 验收显式要求「干净 HOME（env 重定向）实测」；CI 守卫为长期防线 |
| R2 | CI 环境守卫在 ubuntu runner 上 `~/.config/opencode/` 可能本就不存在 | 守卫按「存在性 + 存在时 hash」比对，**不存在→不存在**亦视为通过；避免误报 |
| R3 | 修改 skill 权威源后忘记 `npm run build` → 生成段/自举不一致 | op-001/op-003 均显式 build；build 内置单源一致性校验兜底 |
| R4 | profile 子 Schema 加 `.passthrough()` 可能让非法键流入后续逻辑 | 仅影响序列化往返（保全），不改变读取语义（`normalizeConfig`/默认值合并不变）；补单测 |
| R5 | **H9 `bin/openfeel.js` 全局旧版告警：判定不做** | 理由：① 每次 CLI 启动做全局探测 = 额外 IO + 跨平台/权限不确定性（`AppData`/`~/.npm`/pnpm/yarn 路径各异）；② 告警易误报（多版本管理器、容器）；③ 主要风险已由文档口径统一（H7）+ CI 版本门禁（H8）覆盖。**待裁定**：若审查认为必要，可作为可选增强另立 |
| R6 | **H6 `ensureGlobalConfig` 加测试分支：判定不做** | 理由：生产代码分支化测试环境属反模式；正确修法在测试侧 mock（H5）。 |
| R7 | op-006 操作用户真实环境 | 三步保护：隔离副本验证 → 备份 → 执行后复核；脚本只删测试前缀键；失败即回滚备份 |
| R8 | op-004 改 `AGENTS.md`/`agents-md:115` 措辞触发 build → 生成段行号再次漂移 | 本阶段不做版本号变更，行号漂移风险有限；op-004 只改文本，不涉版本载体 |
| R9 | 事件 A 纪律加入模板后 agent 行为变化（审查官可能「中止」更多） | 纪律是**防幻觉**而非降标准；中止后由 Feel 重开会话，属预期行为 |
| R10 | 修改 `feel.md` 若与既有节冲突 | 新增独立节，避免改动现有编号结构 |

---

## 七、op 执行顺序与依赖

```
op-001（事件 A：模板纪律 + manual/kb）      op-002（事件 B：测试隔离 + CI 守卫）
op-003（事件 C：口径统一 + CI 门禁）        op-005（profile.yaml 健壮性）
      │                                          │
      └──────────────┬───────────────────────────┘
                     ▼
              op-004（遗留批：i18n + 措辞 + REV 状态提请）※ 依赖 op-001/003 的 build
                     │
                     ▼
              op-006（455 死映射清理；与代码改动无交集，可随时执行）※ 独立
                     │
                     ▼
              op-007（测试 + 全量回归）
```

**建议顺序**：op-001 / op-002 / op-003 / op-005（可并行，文件交集仅 `.github/workflows/ci.yml`：op-002 与 op-003 同改 → 二者**串行**）→ op-004 → op-006（独立，可并行）→ op-007。

- **并行/互斥**：op-002 与 op-003 **同改 `.github/workflows/ci.yml`** → 必须串行；op-004 依赖 op-001/op-003 的模板改动落地后再统一 build；op-006 与代码改动无交集。
- op-007 最后统一回归。

---

## 八、完成标准

1. 事件 A：reviewer/feel 模板双语含新纪律，manual/kb 含可信度规范；build 幂等且模板一致性校验通过。
2. 事件 B：`flow.test.ts`/`plan.test.ts` 已隔离；干净 HOME 实测不写真实全局；CI 环境守卫与 kb 反例落地；H6 结论记录。
3. 事件 C：执行型指引统一 `node bin/openfeel.js`；CI 含版本一致性 + `lint i18n`；H9 结论记录。
4. 遗留 13 项按 §一「遗留问题编号清单」逐项处置（**13/13 有归属**，#1~#13 ↔ op-002/003/004/005/006）：代码/文档项修复完毕，状态行由审查官同步（本阶段仅提请），455 死映射清零（**455 → 0**）且有备份。
5. `npm run build && npm test` 全绿（基线 **694** 用例）；`lint i18n` + `lint kb` 零错误；全程隔离 HOME。
6. 事件 A 的「可疑会话产出降级」规则（H12/REV-48-005）落入 manual + feel.md。

---

## 九、修订记录

| 时间 | 修订人 | 依据 | 修订内容 |
|------|--------|------|----------|
| 2026-09-29 | openfeel-planner | 用户需求「v1.1.2 追加 stage-48（事件加固 + 遗留修复）」 | 新建本阶段：H1~H11 裁定 + op-001~op-007（事件 A/B/C + 13 项遗留分派） |
| 2026-09-29 | openfeel-planner | REV-v1.1.2-stage-48 REV-001（blocking, high） | §一新增**「遗留问题编号清单（13 项 → op 分派）」表**（#1~#13 全部点名 + 归属 op + 验收要点），原 #9~#12 补齐为 op-003 ①/③、op-002 ①/②；§八.4 改引用该表 |
| 2026-09-29 | openfeel-planner | REV-v1.1.2-stage-48 REV-002（blocking, high） | op-006 重写：明确键为**绝对路径**、匹配式为**末段匹配** `k.split(/[\\/]/).pop().startsWith('openfeel-update-test-')`（禁用 `startsWith` 前缀）；断言**删除数 === 455** 与删后 `projects` 键数 === 0；强调四步保护不可省 |
| 2026-09-29 | openfeel-planner | REV-v1.1.2-stage-48 REV-003~007（low/medium） | ③ 基线 693 → **694**；④ CI 版本断言明确**两个 job 各一处**（`build-and-test` + `publish` build 后 publish 前）；⑤（新 H12）补「可疑会话产出的处置」规则（manual 新节 + feel.md 一句）；⑥ op-003 ① 改**全仓扫描式**口径并给出 `rg` 扫描命令；⑦ op-005 ② **定案**：`parseError` 标记 + 跳过写回 + `console.warn`，**不引入** `config.ts → update-infos.ts` 依赖边 |
