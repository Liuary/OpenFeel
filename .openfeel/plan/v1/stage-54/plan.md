# v1.1.2-stage-54 计划 — 收尾：遗留缺陷清理（发布前清账）

- **阶段**：`v1.1.2-stage-54`
- **依赖**：当前 `deps` 为空（**建议 Feel 落点** `hard: v1.1.2-stage-53`——本阶段建立在 stage-53 的 `current/dev_last` 新格式与工作区数据之上）；**stage-55 依赖本阶段**
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-01
- **上下文**：用户指令「**先收尾**，然后清掉项目级别的约束和 Agent，之后发布」→ 本阶段 = **收尾（清掉已登记的遗留缺陷）**，为 stage-55（清项目级约束/Agent）与 `npm publish` 做准备
- **范围约束**：不改无关源码、不创建 op 文件、不改 `flow.json`；测试隔离硬要求（见 §四.3）
- **KB 检索**：已加载 `openfeel-check-kb`。相关：`kb/patterns.md`「模板源收敛与 build 双注入」「孤儿检测与安全清理」「幂等写入」；`kb/troubleshooting.md`「kb-dedup CRLF 失效」（本阶段复核确认为已修）。知识库暂无「空模板检测」「i18n 硬编码收敛」专条（本阶段将沉淀）

---

## 一、实测验证总表（E 编号）

> 方法：逐条读**原始登记记录**（`bugs/**` + `code_review/REV-*.md` + 归档报告），再在**当前代码/数据**上实测。基线门禁已独立复跑：`npm run build` **幂等**（重跑零 diff）、`npm test` **59 文件 / 979 用例全绿**、`lint i18n` **724 键 exit 0**、`lint kb` **0 过期（265 引用）exit 0**（2026-10-01 实测）。

| E | 标题 | 优先级 | 实测结论 | 归属 |
|---|------|:--:|:--:|:--:|
| **E1** | `cli/BUG-005` 空模板检测**纯子串匹配**误报（publish 误拒 + health/ops list 误报） | medium | **仍存在** | op-001 |
| **E2** | `cli/BUG-006` en 模式 blocking REV 拒绝文案**硬编码中文**（`flow.ts:742-743`） | low | **仍存在** | op-002 |
| **E3** | `cli/BUG-003` `flow phases --json` 的 **help 文案与 JSON 键漂移**（缺 `transitionsDiff`） | low | **部分存在（复发）** | op-002 |
| **E4** | `templates/BUG-003` 部署型 skill `node bin/openfeel.js` 口径 | low | **已解决** | 仅登记 |
| **E5** | `templates/BUG-004` `current.md` 统计陈旧 | low | **已解决**（另发现 `bugs/index.md` 统计陈旧） | op-003 |
| **E6** | `REV-*` 全仓 pending 扫描与归属 | — | **分层统计（REV-54-001 修正）**：总 267 / pending 132 / closed 112 / resolved 23；**清账层（v1.1.2 内）42** / 历史层 88 | op-003 |
| **E7** | stage-52 observations 三项 | — | (a) 复发→并入 E3；(b)(c) **已解决** | op-003 |
| **E8** | 已知登记**不修**项 8 条 | — | **登记状态确认**（不修） | op-003 |
| **E9** | `kb-dedup` 与**其它解析路径** CRLF 复核 | — | **已解决**（4 处路径实测安全） | 仅登记 |
| **E10** | 「状态写盘合并」（`setStatusField` 下沉合并） | — | **已登记不修**（并入 E8#5） | 仅登记 |
| **E11** | stage-49 op-001~009 状态陈旧（`pending`） | — | **仍存在**（工作区状态数据，非代码缺陷） | 待裁定 |
| **E12** | 门禁基线变化：`lint i18n` 724 → **726** | — | 由 E2 新增 2 键触发 | op-002 |

**统计**：**仍存在 2**（E1/E2）+ **部分存在 1**（E3）+ **已解决 5**（E4/E5/E7b/E7c/E9）+ **登记类 4**（E6/E8/E10/E11）+ **门禁类 1**（E12）。**需修 = 3 条（E1/E2/E3）**。

---

## 二、E 逐条明细

### E1 — `cli/BUG-005`：空模板检测子串误报（medium，**仍存在**）

**证据（原始登记）**：`bugs/cli/BUG-005_空模板检测子串误报（op正文引用标记导致publish误拒+health误报）.md:38`（根因三处子串匹配）、`:36-37`（误拒/误报实录）。

**代码位点**：
- `src/core/flow-manager.ts:3751` `EMPTY_TEMPLATE_MARKER = '- [ ] 待补充'`
- `src/core/flow-manager.ts:3754-3756` `isTemplateEmpty()` = `content.includes(marker)` ← **根因**
- `src/core/flow-manager.ts:3764-3772` `detectFillState()`（`empty` 复用 `isTemplateEmpty`；`partial` 已用整行正则 `/(?:^|\n)\s*-\s*\[ \]/`）
- `src/core/flow-manager.ts:3262-3268` `healthCheck` 空模板 warn（已跳过 `draft`）
- `src/core/plan/scheme.ts:455` `publishScheme` **再次** `content.includes(EMPTY_TEMPLATE_MARKER)`（重复判断，未复用 `isTemplateEmpty`）
- `src/commands/flow.ts:937`（`ops list` 调 `detectFillState`）、`:938-959`（输出 + `warning` 字段）

**实测（本阶段复现）**：

| 检查 | 实测 | 判定 |
|------|------|------|
| `node bin/openfeel.js flow health` | `⚠️ 空模板: 1 个操作方案模板未填充：v1.1.2-stage-52.op-005` | **误报**（op-005 已 `done`、文件 17112 字节完整） |
| `node bin/openfeel.js flow ops list` | `v1.1.2-stage-52.op-005 [done] (empty)` + `⚠️ op-005 模板未填充（存在「- [ ] 待补充」）` | **误报** |
| op-005.md 内容 | 含 9 处「待补充」，其中 `:25`/`:32` 为**行内引用**（`:32` 形如 ``     - `empty`：仍含 `- [ ] 待补充`； ``） | 触发源 |
| **修复方案预验证** | 严格整行正则 `/(?:^|\n)[ \t]*-\s*\[\s*\]\s*待补充[ \t]*(?=\r?\n|$)/` 对 op-005.md 实测 = **false** | **修复有效** |
| 模板骨架形态 | `src/core/plan/scheme.ts:34-57` `generateSchemeTemplate` 把标记以**独占行（列 0）**插入 | 整行匹配仍可检出真实空模板 |

**修法**（裁定 A1）：
1. `flow-manager.ts:3754-3756`：`isTemplateEmpty` 改**整行锚定**判定（CRLF 容错）：`/(?:^|\n)[ \t]*-\s*\[\s*\]\s*待补充[ \t]*(?=\r?\n|$)/`。
2. `flow-manager.ts:3764-3772`：`detectFillState` 的 `empty` 分支自动复用；**复核** `partial` 分支是否需同步收紧（避免行内引用 `- [ ]` 被判 `partial`）。
3. `scheme.ts:455`：改为调用 `isTemplateEmpty(content)`（消除重复子串判断，保住「单一来源」不变式）。
4. 注释同步：`flow-manager.ts:3748-3750`「单一来源」说明补「整行锚定」语义。

**验收要点**：① 行内/表格/行内代码引用标记 → `filled`（`ops list` 无 warning、`health` 无告警）；② 真实**独占行** → `empty`（`publish` exit 1）；③ **仓库自身 `flow health` 空模板告警归零**（实测复核）；④ `publish` 对「行内引用」fixture **成功**、对「独占行」fixture **exit 1**；⑤ 已知边界（**代码围栏内独占行**仍判 `empty`）在计划与代码注释中显式记录，不作为缺陷。

**归属 op-001**。

#### E1-补（REV-54-002）：`readOpTemplate` 的 opId 形式与 `(filled)` 兜底语义 —— **连带评估，判为「登记边界」**

**REV 原文诉求**：`ops list` 的 `(filled)` 存在**第二根因**（`readOpTemplate` 文件名匹配对短名不命中 → null → 「无文件视为 filled」），与 `health` 的检测来源分叉；要求 op-001 连带评估。

**实测复核（本阶段，对 REV 述因的部分更正）**：

| 检查 | 位点 | 实测结果 |
|------|------|----------|
| `readOpTemplate` 实现 | `src/core/flow-manager.ts:794-813` | 匹配 `f === \`${opId}.md\` \|\| f.startsWith(\`${opId}_\`)`（`:804`） |
| `flow.json` 的 `stage.ops` 键形式 | `.openfeel/flow.json`（stage-52 实测） | **短名**（`op-002`/`op-005`…） |
| `readOpTemplate('v1.1.2-stage-52','op-005')` | node 直调 `dist` 实测 | **HIT**（非 null） |
| `readOpTemplate('v1.1.2-stage-52','v1.1.2-stage-52.op-005')` | 同上 | **null**（全名不命中） |
| `healthCheck` 路径 | `flow-manager.ts:3261-3266` | 遍历 `Object.entries(stage.ops)` → **同样传短 opId** |
| `ops list` 路径 | `flow.ts:934-937` | 遍历同一 `opsMap` → **同样传短 opId** |

**结论（更正 REV 述因，但采纳其诉求）**：
- **「两者来源分叉」在现行数据下不成立**：`health` 与 `ops list` **同源**（同一 `opsMap` 短 opId → 同一 `readOpTemplate`）→ 正常键下**双双 HIT**。
- **真实残留缺口只有一处**：`content === null` 的**语义分歧** —— `health` 视为「跳过、不报」（`flow-manager.ts:3266`），`ops list` 视为 **`filled`（`flow.ts:937`，静默乐观）**。null 触发条件 = op 文件缺失 / 命名不含前缀 / 目录不可读。
- **对全名键的隐患**：若未来 `stage.ops` 以**全名键**注册（历史/异常数据），两侧会**同时**读不到 → 均静默 → **同向漏检**（非分叉）。

**裁定（A9，登记为已知边界，不引入新状态值）**：
1. 现行数据短名命中，缺陷**不可复现**（无实际观测到的错误输出）；
2. 让 `ops list` 区分「无法检测」，须扩展 `detectFillState` 返回域（现为 `'empty'|'partial'|'filled'`）与 `--json` 契约（B1 已发布口径）→ **成本大于收益**（违反全局约束 2「避免过度设计」）；
3. **以回归断言替代**：op-001 新增断言「`ops list` 经**短 opId** 读到模板并检出 `empty`」（锁定 `readOpTemplate` 短名路径不被未来改动破坏）；**若后续出现全名键数据**再评估，登记于 `manual/cli/commands.md` 的 `ops list` 节；
4. 代码注释同步：`src/commands/flow.ts:935-937` 注释补「`null`（文件缺失/命名不匹配）视为 `filled` —— 已知边界，见 stage-54 E1-补」。

**归属 op-001**（连带评估 + 注释登记 + 断言；**不改 `detectFillState` 契约**）。

---

### E2 — `cli/BUG-006`：en 模式 blocking REV 拒绝文案硬编码中文（low，**仍存在**）

**证据**：`bugs/cli/BUG-006_en模式REV阻塞拒绝文案硬编码中文（flow.ts 742-743）.md:36`（根因 + 来源 commit `98fd2dd`）、`:31-33`（实测输出）。

**代码位点**：`src/commands/flow.ts:736-746`（`--to done` 拒绝分支）；**硬编码中文行 = `:742` / `:743`**（`console.error('错误：blocking REV 未解决前禁止推进到 done。')`、`console.error('请先解决上述 REV 或通过 flow review resolve 标记为非阻塞。')`）。同分支上一行 `:740` **已是 i18n**（`t('flow.advance.forceRevRefused', lang)`）→ 同域不一致。

**实测**：`rg "console\.(warn|error|log)\('[^']*[一-龥]" src/` 命中 `flow.ts:742`、`:743`（另有 `project.ts:101`、`init.ts:48/110`、`update.ts:93` 的 `console.log` 中文——见裁定 A4）。

**修法**：新增 2 个 i18n 键（命名见裁定 A4），`flow.ts:742-743` 改走 `t(...)`；zh 保原意、en 对称。

**验收要点**：① en fixture（`blocking:true,status:'open'` REV + `--to done`）输出 **CJK 零命中**；② zh 语义不变；③ `lint i18n` **726 键 exit 0**（E12）。

**归属 op-002**。

---

### E3 — `cli/BUG-003`：`flow phases --json` help 文案与 JSON 键漂移（low，**部分存在/复发**）

**证据**：`bugs/cli/BUG-003_flow-phases-help文案缺advanceAccepted与实际JSON输出不一致.md`（**该 bug 已标 closed**）；复发依据 = stage-52 observation（`.openfeel/code_review/v1.1.2-stage-52.md:118`「`flow phases --json` 实际含 `transitionsDiff` 第 4 键（stage-50 T19 新增），plan 表述陈旧」）。

**实测**：
- 实际 JSON 键 = **5 个**：`schemaVersion, phases, transitions, advanceAccepted, transitionsDiff`（产出位点 `src/commands/flow.ts:405`；差异计算 `:399`；人类可读补充 `:423-426`）。
- i18n help 文案 = **4 键**：`src/core/i18n-data/zh-CN.ts:595`、`src/core/i18n-data/en.ts:565` 均为 `{ phases, transitions, advanceAccepted, schemaVersion }` → **缺 `transitionsDiff`**。
- 对照（stage-52 已同步，均含 `transitionsDiff`）：`docs/commands.md:91`、`.openfeel/manual/cli/commands.md:65,100`、`.openfeel/manual/core/flow-manager.md:73`、`.openfeel/kb/patterns.md:2922` → **仅 i18n help 文案未同步**。

**修法**：`zh-CN.ts:595` / `en.ts:565` 文案补 `transitionsDiff`；`test/core/i18n.test.ts:111-119` 断言补 `transitionsDiff`（zh/en 各一条）。

**验收要点**：`t('help.flow.phases.json', lang)` 同时含 `advanceAccepted` 与 `transitionsDiff`（zh/en）；键集合与实测 JSON 键一致。

**归属 op-002**。

---

### E4 — `templates/BUG-003`：部署型 skill `node bin` 口径（low，**已解决 → 仅登记**）

**实测**：`rg -c "node bin/openfeel\.js" src/core/templates-data/opencode/skills/**` → `openfeel-cli-usage/SKILL.md` = **1**、`openfeel-wizard/SKILL.md` = **1**（登记时为 26 / 3）；且这 2 处均为**顶部双态声明**（`cli-usage/SKILL.md:16`、`wizard/SKILL.md:24`：本仓自举用 `node bin/openfeel.js <cmd>`，安装后用 `openfeel <cmd>`），正文命令为**裸 `openfeel`** → 即 bug 建议的「期望 B」已落地。

**验证方式（可直接复跑）**：
```powershell
rg -c "node bin/openfeel\.js" src/core/templates-data/opencode/skills/**   # 期望：cli-usage=1、wizard=1
```
**处置**：**仅登记**（不修）；**提请 openfeel-feel-tester 关闭** `templates/BUG-003`（状态仍为 `open`）。

---

### E5 — `templates/BUG-004`：`current.md` 统计陈旧（low，**已解决**）

**实测**：`bugs/templates/BUG-004_current统计行沿用执行中快照测试用例数陈旧.md:2` = `status: closed`；`:64-70` 关闭记录（归档官就地修正：`942 → 949`、kb `182 → 187`、stage-53 记录措辞「执行中」→「归档完成」）。

**另发现（工作区数据陈旧）**：`bugs/index.md:10/13/14/21/22` 仍为 `open 4 / closed 12 / 合计 16 / medium 1 / low 3`，而**逐文件 frontmatter 实测** = **`open 3 / closed 13`**（open = `templates/BUG-003`、`cli/BUG-005`、`cli/BUG-006`）→ **索引统计需修正**（归属 op-003）。

**验证方式**：
```powershell
Get-ChildItem .openfeel/users/Liuary/bugs -Recurse -Filter "BUG-*.md" | ForEach-Object { (Select-String -Path $_.FullName -Pattern '^status:\s*(\w+)').Matches.Groups[1].Value } | Group-Object | Select-Object Name,Count
```
**处置**：E5 本体**仅登记**；索引统计修正入 op-003。

---

### E6 — `REV-*` 全仓 pending 扫描（**REV-54-001 已修正：分层统计**）

**扫描方式（可复现，须兼容混合编号）**：

```powershell
node -e "
const fs=require('fs'),path=require('path');
const dir='.openfeel/users/Liuary/code_review';
const files=fs.readdirSync(dir).filter(f=>f.startsWith('REV-')&&f.endsWith('.md'));
const rows=[];
for(const f of files){
  const txt=fs.readFileSync(path.join(dir,f),'utf8');
  // 兼容 REV-001 / REV-U2-001 / REV-U3-009（注记） 等混合编号（标题后接 : 或（）
  const idx=[...txt.matchAll(/^##\s+(REV-[^\s:：（(]+).*\$/gm)];
  idx.forEach((m,i)=>{
    const body=txt.slice(m.index, i+1<idx.length?idx[i+1].index:txt.length);
    const sm=body.match(/^-\s*\*\*状态\*\*\s*[:：]\s*([^\n|]*)/m);
    rows.push({f,id:m[1],st:sm?sm[1].trim().replace(/[（(].*\$/,'').trim():'MISSING'});
  });
}
const c={}; rows.forEach(r=>c[r.st]=(c[r.st]||0)+1);
console.log('files',files.length,'TOTAL',rows.length,JSON.stringify(c));
for(const n of ['stage-48','stage-49-U2','stage-49-U3','stage-49-U4','stage-49-U8','stage-52','stage-54'])
  console.log(' ',n, rows.filter(r=>r.f.includes(n)&&r.st==='pending').length);
console.log('历史 pending', rows.filter(r=>r.st==='pending'&&!/REV-v1\.1\.2-stage-/.test(r.f)).length);
"
```

**实测结果（2026-10-01，74 个 REV 文件）**：

| 指标 | 实测值 |
|------|--------|
| REV 条目总数 | **267** |
| 状态分布 | `pending` **132** / `closed` **112** / `resolved` **23** |
| **v1.1.2 内 pending**（含本阶段自身） | **44** |
| **v1.1.2 内 pending（清账口径，排除本阶段 `stage-54` 自身的 2 条）** | **42** |
| 历史 pending（非 v1.1.2） | **88** |

**计数口径（必须写明，避免再次偏差）**：
1. **标题正则须兼容混合编号**：stage-49 单元报告使用 `REV-U2-001` / `REV-U3-009（注记）` / `REV-U8-012` 形式，**非纯数字**；`^## (REV-\d+):` 会**漏计 35+ 条**（REV-54-001 根因）。
2. **状态行**须同时接受全角/半角冒号 `- **状态**：/` `- **状态**:`；无该行的条目（如 `REV-U3-009（注记）`、`REV-U3-010（文档建议）`）计入总数、**不计入 pending**。
3. **分层口径**：① **清账层** = v1.1.2 内 pending（42，本阶段核实对象）；② **历史层** = 非 v1.1.2（88，仅登记）；③ **本阶段自身**（stage-54 的 REV-001/002，随修订关闭）。
4. **时点差异**：扫描值随 REV 状态变更漂移（如 stage-52 四条、本阶段两条）→ 该数字**在 op-003 执行时须重新跑脚本取实时值**，不得沿用计划快照。

**清账层（v1.1.2 内 pending 42 条）归属与建议处置**：

| 文件 | 条目数 | 建议处置 |
|------|:--:|----------|
| `REV-v1.1.2-stage-48.md` | 1（REV-009） | 原文注明「转 stage-49 U4/U6 参考」→ 核实承接结论后提请关闭 |
| `REV-v1.1.2-stage-49-U2.md` | 12（REV-001~012） | **逐条实测核实**（多数已由同阶段 op-010/op-011 修复；如 REV-008 `VERSION='0.1.0'` 死导出已删、REV-001 dry-run 写盘已修）→ 附证据后提请 tester 关闭 |
| `REV-v1.1.2-stage-49-U3.md` | 9（REV-U3-001~008、**U3-011**；U3-009/010 为注记/文档建议无状态行） | 逐条核实（配置/画像面）→ 提请关闭或明确登记 |
| `REV-v1.1.2-stage-49-U4.md` | 4 | 逐条核实（模板/agent/skill 面）→ 提请关闭或明确登记 |
| `REV-v1.1.2-stage-49-U8.md` | 12（REV-U8-001~012） | 逐条核实（部署/更新链路）→ 提请关闭或明确登记 |
| `REV-v1.1.2-stage-52.md` | 4（REV-005/006/007/008） | **REV-005/006/007 实测已落地**（`flow.ts:635` `normalizeStageId(options.stage)`、`:750` `stageArg` 起点显示、`:1215-1216` retry 前缀归一化 + 双键回退；`flow-manager.ts:717-725` `parseOpId` 出口收口覆盖 `getOp`/`advancePhase`/`recordAttempt`/`hasTransition`；对应 op-012/013/014）→ **建议关闭**；REV-008 = `deps.yaml` 时序表述澄清（low，无代码影响）→ 建议关闭 |

> **事实更正（对 REV-54-001 的说明）**：审查官 §二 记「stage-52 四条现已 closed」——**实测该文件 `REV-v1.1.2-stage-52.md` 的 REV-005/006/007/008 状态行仍为 `pending`**（`rg "状态\*\*：\s*(pending|closed)"` 直读确认；修复已落地但**状态未收口**）。故本条计入清账层，恰好印证「计划层数字须以脚本实测为准」。

**历史层 pending 88 条**（`REV-stage-03/05/08/35/36`、`REV-v3-*`、`REV-v4.*-*`、`REV-v0.5.11-stage-01`、`REV-plan-stage-29`、`REV-v1.0.0-stage-01/30/33` 等）→ **仅登记**（跨版本历史归档阶段，见裁定 A5），本阶段**不清理**。

**处置**：op-003 产出**核实清单**（条目 → 实测证据 → 建议状态），覆盖清账层 **42 条全量**（不得少于）；**由 openfeel-feel-tester 关闭**，planner/executor **不擅自改状态**。

> **无法精确归类时的兜底层**：若个别条目因格式异常无法归类，op-003 须在清单中以「**无法判定**」单列并附原始行摘录，**不得静默丢弃**（分层统计：清账层 / 历史层 / 无法判定）。

---

### E7 — stage-52 observations 三项（**2 已解决 + 1 复发**）

| 项 | 出处 | 实测结论 |
|----|------|----------|
| (a) `phases --json` 实际含 `transitionsDiff`（plan 表述陈旧） | `.openfeel/code_review/v1.1.2-stage-52.md:118` | **复发**：JSON 含 5 键而 i18n help 文案缺 → **并入 E3** |
| (b) PowerShell 直接管道捕获 `--json` 的 gb2312 建议入 manual | 同上 `:116` | **已解决**：`.openfeel/manual/cli/commands.md:106` 已载（重定向到文件 / `JSON.parse` / pwsh 7 UTF-8） |
| (c) stage-52 `status.md` 漂移 | 同上 `:118` | **已解决**：`flow health` 实测「跨文件一致：一致 (31/31 stages)」 |

---

### E8 — 已知登记**不修**项（8 条，**仅确认登记状态**）

| # | 项 | 登记出处 |
|---|----|----------|
| 1 | `lint --warn-only` 逃生阀（**不加**） | `code_review/v1.1.2-stage-51.md:54`③、`-52.md:36,114` |
| 2 | coverage 阈值收紧（**暂不设**，仅报告） | 同上④ / 同上 |
| 3 | 历史日志布局不迁移（**备查**） | 同上⑥ / 同上 |
| 4 | `flow health` 文件孤儿治理入口（**仅报告**；仓库实测 62 条文件孤儿） | 同上⑦、`-52.md:115` |
| 5 | `setStatusField` 下沉合并（= E10） | `users/Liuary/log/archive-v1.1.2-stage-52-report-2026-10-01.md:59` |
| 6 | N-1 `addStage` 短名建键（兼容回退保留） | `REV-v1.1.2-stage-52.md:331` |
| 7 | N-2 显示形态 | 同上 |
| 8 | public API 防御性归一化 | 同上 |

**验收要点**：8 条均可在上述出处检索到「登记/裁定不修」表述（`rg` 复核），本阶段**不改动**对应代码。

---

### E9 — `kb-dedup` 相关**其它解析路径** CRLF 复核（**已解决**）

| 路径 | 位点 | 实测结论 |
|------|------|----------|
| `parseKbFile`（去重 / `knowledge dedup`） | `src/utils/kb-dedup.ts:53-56` | **已修**（`replace(/\r\n?/g, '\n')`；注释载明 patterns 2→105 / troubleshooting 0→31） |
| kb 条目解析（知识库读取） | `src/core/workspace/knowledge.ts:286` | **CRLF 安全**：`gm` 正则对 CRLF 文本实测命中 **2/2** |
| kb 表格解析 | `src/core/workspace/knowledge.ts:166`、`:343` | **安全**（`.map(trim)` 后再判定） |
| `lint kb` 引用扫描 | `src/commands/lint.ts:129-130`（`split('\n')` 未归一化） | **本仓实证通过**：kb 文件为 CRLF 而 `lint kb` = **0 过期 / 265 引用 / exit 0** |

**结论**：**无残留同类问题**（仅登记）。复核命令：
```powershell
node -e "const c='## [+] a (2026-01-01)\r\n## [-] b (2026-02-02)\r\n'; console.log([...c.matchAll(/^## (\[[+-]\]) (.+?) \((\d{4}-\d{2}-\d{2})\)$/gm)].length)"  # 期望 2
```

---

### E10 — 「状态写盘合并」= `setStatusField` 下沉合并（**已登记不修**，并入 E8#5）

**出处**：`users/Liuary/log/archive-v1.1.2-stage-52-report-2026-10-01.md:59`「`setStatusField` 下沉合并（op-003 登记）」→ `health --fix`「仅回写『状态』字段」逻辑存在重复实现点，建议下沉为单一函数；**已登记、本阶段不修**。

---

### E11 — stage-49 op-001~009 状态陈旧（**仍存在 → 待裁定**）

**实测**：`flow ops list` 输出 `v1.1.2-stage-49.op-001~009 [pending]`（审查单元 U1~U9），而对应工作早已由 op-010/op-011 收口 → **工作区状态数据陈旧**（非代码缺陷）。

**处置**：**仅登记** + 待裁定 **A6**（是否修正为 `done`）。**不得**由 executor 擅自改动 `flow.json`（阶段范围约束）。

---

### E12 — 门禁基线变化（E2 触发）

E2 新增 **2 个 i18n 键** → `lint i18n` 基线 **724 → 726**（已同步门禁，见 §四.1）；其余基线不变。

---

## 三、op 划分（3 op）

| op | 主题 | 覆盖 | 关键产出 | 依赖 |
|----|------|------|----------|------|
| **op-001** | 空模板检测收紧（含 E1-补） | E1 + E1-补 | `src/core/flow-manager.ts:3751-3772`（整行锚定 + 注释）、`src/core/plan/scheme.ts:455`（复用 `isTemplateEmpty`）、`src/commands/flow.ts:935-937`（`null→filled` 已知边界注释，**不改契约**）、新增回归断言（**5 条**） | — |
| **op-002** | en 泄漏收敛与文案一致 | E2 / E3 / E12 | `src/commands/flow.ts:742-743`（2 新 i18n 键）、`i18n-data/{zh-CN,en}.ts`（+2 键、help 文案补 `transitionsDiff`）、`test/core/i18n.test.ts` 断言 | op-001（同仓串行） |
| **op-003** | 登记收口 + 工作区数据一致性 + 全量门禁 | E4~E11 | `bugs/index.md` 统计修正（open 3 / closed 13）、**清算层 v1.1.2 内 42 条 pending REV 的核实清单**（分层统计：清账层 42 / 历史层 88 / 无法判定单列，附实时重跑脚本）、`E7~E11` 登记记录、全量 build/test/lint 复跑 | op-002 |

**执行顺序**：`op-001 → op-002 → op-003`（op-002 依赖 op-001 的代码状态；同仓串行可降低 review 成本与 i18n 文件冲突）。

**边界声明**：op-003 **不含** bug/REV **状态变更**（那是 tester 的职责）——它只产出**可核实的证据清单**，并修正**工作区索引统计**（`bugs/index.md`，属数据非源码）。

---

## 四、测试与门禁

### 四.1 门禁基线（阶段末）

| 步骤 | 命令 | 期望 |
|------|------|------|
| 1 | `npm run build` | 幂等（重跑零 diff） |
| 2 | `npm test` | **≥ 59 文件 / 979 用例** 全绿（新增断言后递增） |
| 3 | `node bin/openfeel.js lint i18n` | **726 键**（724 + E2 的 2 键）、exit 0 |
| 4 | `node bin/openfeel.js lint kb` | 0 过期（265 引用）、exit 0 |
| 5 | `npx tsc --noEmit` | 0 错误 |
| 6 | `node bin/openfeel.js flow health` | **空模板告警归零**（E1 实测复核） |

### 四.2 翻转清单

| 类别 | 项 | 判定 |
|------|----|------|
| **强制翻转** | — | **0 项** |
| 既有断言保持 | `test/commands/flow.test.ts:1209,1210`（fixture 写 `'# op-001：t\n\n- [ ] 待补充\n'` = **独占行**） | 不翻转（整行正则仍命中 `empty`）✓ |
| 既有断言保持 | `test/core/flow-manager.test.ts:2049,2051,2058,2059`（空模板 warn / draft 跳过） | 不翻转（独占行 fixture）✓ |
| 既有断言保持 | `test/commands/plan.test.ts:427-458`（`publish` 空模板 exit 1 / 填充后成功 / 非 draft 拒绝） | 不翻转（`createScheme` 生成模板为独占行）✓ |
| 既有断言保持 | `test/commands/flow.test.ts:1185,1199-1224`（`ops list` `(filled)` / `--json`） | 不翻转 ✓ |
| 既有断言保持 | `test/core/i18n.test.ts:111-119`（help 文案含 `advanceAccepted`） | 不翻转（E3 仅**追加**文案，原断言仍真）✓ |
| **建议新增断言** | ① `isTemplateEmpty`/`detectFillState`：行内引用 → `filled`；独占行 → `empty`（含 CRLF 变体） | op-001 |
| | ② `publishScheme`：行内引用 → `published:true`；独占行 → `{published:false, reason:'empty-template'}` | op-001 |
| | ③ `healthCheck`：行内引用 op → **无空模板 warn**（回归 BUG-005） | op-001 |
| | ④（E1-补）`readOpTemplate` **短 opId 命中**（`ops list` 路径锁定）：短名 fixture 下 `fill === 'empty'`；全名调用 → `null`（记录既有语义） | op-001 |
| | ⑤ en 模式 blocking REV 拒绝路径 **CJK 零命中** | op-002 |
| | ⑥ `t('help.flow.phases.json')` zh/en 均含 `transitionsDiff` | op-002 |
| | ⑥（工作区数据）`bugs/index.md` 统计与 frontmatter 实测一致 | op-003 |

### 四.3 测试隔离硬要求（**强制**）

- 新增/改动测试**必须** `vi.mock('node:os')`（homedir 指向 `mkdtempSync` 临时目录）——范式见 `test/commands/flow.test.ts:9-13` + `:42-45`（`mockHome.dir` + `initProject(tmpDir)`）；`node:child_process` mock 见 `:15-20`。
- **严禁**触碰真实 `~/.openfeel/`、`~/.config/opencode/`、`~/.config/openfeel/`、仓库 `.openfeel/config.yaml`；全局部署探针（如 `~/.config/opencode/AGENTS.md`）**只读**。
- 门禁复跑前后建议记录仓库 `.openfeel/config.yaml` 的 hash + mtime，确认零污染（沿用 stage-49~53 既有做法）。

---

## 五、风险

| # | 风险 | 缓解 | 级别 |
|---|------|------|------|
| R-1 | E1 收紧后**漏检真实空模板**（模板形态若含缩进/变体） | 严格正则已含 `[ \t]*` 前缀与 `[ \t]*` 尾容错；`generateSchemeTemplate` 实测为列 0 独占行；补「独占行 → empty」断言（含 CRLF 变体） | 中 |
| R-2 | E1 修复后**仓库 health 仍有其它误报** | 修复后必须复跑 `flow health` 并确认「空模板」节**零条目**；若有残留，逐条定位（不排除它 op 正文类似引用） | 中 |
| R-3 | E3 误改 JSON 契约（把 `transitionsDiff` 删掉） | **明确只改 i18n help 文案**，JSON 输出不动（属 stage-52 特性，manual/docs/kb 已同步） | 低 |
| R-4 | E2 新增键导致门禁数字变化未同步 | §四.1 已写明 724 → **726**；`lint i18n` 为键一致性校验（非键数校验），数字变化须在归档摘要同步 | 低 |
| R-5 | E6 误关闭/误判 pending REV | 仅产出**核实清单**，状态变更由 tester 执行；**清账层 42 条须全覆盖**（不得漏 U3/U4/U8 系列）；历史层 88 条**不清理**；无法归类者单列 | 中 |
| R-6 | op-003 修 `bugs/index.md` 时改动其它内容 | 仅改**统计表 5 个数字** + `templates/BUG-004` 行状态（如未同步）；`git diff` 复核为最小 diff | 低 |
| R-7 | 越界改 `flow.json`（E11） | 明确「不改 `flow.json`」；E11 仅登记 + 待裁定 | 低 |
| R-8 | 测试污染真实环境 | §四.3 硬要求；复跑前后 hash/mtime 比对 | 中 |
| R-9（REV-54-001） | **REV 计数口径漂移致清账遗漏**（正则不兼容混合编号 → 漏 35+ 条） | §三 E6 已固化**可复现脚本**（兼容 `REV-U3-009（注记）` 等）与**分层口径**（清账层/历史层/无法判定）；op-003 **执行时重跑脚本取实时值**，不得沿用计划快照 | 中 |
| R-10（REV-54-002） | `ops list` 的 `null→filled` 静默乐观被误当「已检测」 | 裁定 A9：**登记为已知边界**（注释 + manual）；以断言④锁定短 opId 路径；**不扩展** `detectFillState` 契约 | 低 |

---

## 六、裁定表

| # | 议题 | 建议结论 | 依据 | 状态 |
|---|------|----------|------|------|
| **A1** | E1 检测收紧粒度 | **整行锚定**（最小修复）；**代码围栏内独占行仍判 `empty`** 记为已知边界（不引入围栏解析，避免过度设计） | 需求：修 BUG-005；实测整行正则对 op-005 = false 且对模板 = true | planner 建议 + **待 Feel/用户确认** |
| **A2** | E3 处置方向 | **改 i18n help 文案**补 `transitionsDiff`（不动 JSON） | docs/manual/kb 均已含该键，唯 i18n 缺 | planner 建议 + **待 Feel/用户确认** |
| **A3** | E2 i18n 键命名 | `flow.advance.blockingRevRefused` / `flow.advance.blockingRevHint`（与既有 `flow.advance.forceRevRefused` 同族） | 同域命名一致性 | planner 建议 + **待 Feel/用户确认** |
| **A4** | 其它 `console.log` 中文（`project.ts:101`、`init.ts:48/110`、`update.ts:93`） | **本阶段不改**（`init.ts` 为语言菜单双语可保留；其余登记） | bug-006 建议「顺带评估」；最小范围原则 | planner 建议 + **待 Feel/用户确认** |
| **A5** | E6 历史层 pending（非 v1.1.2，实测 **88 条**） | **仅登记不清理**（历史归档阶段，跨版本不可考）；**清账层（v1.1.2 内 42 条）**核实后提请 tester 关闭 | 发布前清账聚焦**当前版本** | planner 建议 + **待 Feel/用户确认** |
| **A6** | E11 stage-49 op 状态陈旧 | **仅登记**（不改 `flow.json`）；如需修正由 Feel 在执行 `flow stage` 命令时统一处理 | 阶段范围约束 | **待 Feel/用户裁定** |
| **A7** | E5 索引统计修正范围 | 仅 `bugs/index.md` 统计行 + `templates/BUG-004` 状态行（如需） | 最小 diff | planner 建议 + **待 Feel/用户确认** |
| **A8** | 本阶段是否含 `npm publish` | **不含**（用户指令顺序：收尾 → 清项目级约束/Agent（stage-55）→ 发布） | 用户明确指令 | **已由用户指令确定** |
| **A9**（REV-54-002） | `ops list` 的 `null→filled` 兜底语义 | **维持现状 + 登记为已知边界**（不改 `detectFillState` 返回域 / `--json` 契约；补注释 + manual 登记 + 断言④锁定短 opId 路径） | 实测两者同源且短名 HIT；扩展契约成本 > 收益（全局约束 2） | planner 建议 + **待 Feel/用户确认** |

> **溯源说明**：A1~A5/A7 为 planner 建议并附依据，**待 Feel/用户确认**；A6 为**待 Feel/用户裁定**；A8 直接来自用户指令「先收尾，然后清掉项目级别的约束和 Agent，之后发布」。本计划**不虚构确认来源**。

---

## 七、验收标准（阶段级）

1. **E1 修复**：`flow-manager.ts:3754-3756` 为整行锚定；`scheme.ts:455` 复用 `isTemplateEmpty`；新增断言 ①②③ 全绿；`flow health` 空模板节**归零**。
2. **E2 修复**：`flow.ts:742-743` 无硬编码中文；en 拒绝对话输出 CJK 零命中；`lint i18n` **726 键 exit 0**。
3. **E3 修复**：`help.flow.phases.json` zh/en 均含 `transitionsDiff`；断言 ⑤ 全绿。
4. **登记类**：E4/E5/E7(b)(c)/E9/E10 均有「实测已解决」证据记录；E6 产出核实清单（**分层统计：清账层 42 / 历史层 88 / 无法判定单列**，附可复现脚本与实时值）；E8 8 条登记出处可检索；E11 登记并附裁定状态。
5. **工作区数据**：`bugs/index.md` 统计与 frontmatter 实测一致（`open 3 / closed 13`，E1/E2 修复后 Bug 状态由 tester 更新）。
6. **门禁**：`npm run build` 幂等；`npm test` ≥ 979 全绿；`tsc` 0；`lint i18n` 726；`lint kb` 0 过期。
7. **零污染**：仓库 `.openfeel/config.yaml` 与真实全局目录 hash/mtime 前后一致。
8. **无越界**：未改 `flow.json`；未创建 op 文件（由 schemer/executor 负责）；未改无关源码。

---

## 八、修订记录

| 时间 | 制定人 | 版本 | 说明 |
|------|--------|------|------|
| 2026-10-01 | openfeel-planner | v1 | 初稿：E1~E12 逐条实测（仍存在 2 / 部分存在 1 / 已解决 5 / 登记 4 / 门禁 1）、3 op 划分、翻转清单（强制 0 项）、裁定 A1~A8、门禁 726 键 |
| 2026-10-01 | openfeel-planner | v2 | **REV-v1.1.2-stage-54 修订**：**REV-001（medium, blocking）** —— E6 改为**分层统计**：总数 **267** / pending **132** / closed **112** / resolved **23**；**清账层（v1.1.2 内）42** / **历史层 88**；固化**可复现扫描脚本**（兼容 `REV-U2/U3/U4/U8` 混合编号——原 `^## (REV-\d+):` 漏 35+ 条为根因）；补计数口径 4 条（正则兼容 / 状态行冒号双形 / 分层定义 / **执行时重跑取实时值**）；清账层按 U2×12 / U3×9 / U4×4 / U8×12 / stage-48×1 / stage-52×4 逐列处置；**事实更正**：stage-52 REV-005~008 状态行实测仍为 `pending`（REV 述「已 closed」不实，修复已落地但状态未收口）；新增 **无法判定**兜底单列。同步 AE5、§七 完成标准 4、§四.2 断言编号、§五 新增 **R-9**。**REV-002（low）** —— 新增 **E1-补**：实测 `readOpTemplate`（`flow-manager.ts:794-813`）**短 opId HIT / 全名 null**，`health`（`:3261-3266`）与 `ops list`（`flow.ts:934-937`）**同源**（非分叉）；真实缺口 = `null` 语义分歧（health 跳过 / ops list 判 `filled`）；裁定 **A9 登记为已知边界**（不改 `detectFillState` 契约）+ 注释 + manual + **断言④**；op-001 范围与断言数（4→**5**）同步、§五 新增 **R-10** |

