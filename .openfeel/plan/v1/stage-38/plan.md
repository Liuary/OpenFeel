# Plan — stage-38: 控制区标记 + 增量更新

> **版本**：v1.1.0-stage-38
> **创建日期**：2026-09-25
> **Planner**：独立 Planner（推理模型）
> **规模判定**：架构级（跨模块——update 部署管线新增控制区维度、新增 `managed-region`/`update-infos` 模块、feel.md/core.md 框架约束联动、测试）
> **定位**：v1.1 改造第四阶段（v1.1 大计划 P1）。**D3 全量落地**——用控制区标记替换/演进 stage-32 以来的「hash 四态」更新机制，实现「更新只覆盖受管区、区外用户内容零破坏」，并落地 `~/.openfeel/update_infos.md` 记录与「会话启动检查修复」约束。
> **来源**：`.openfeel/plan/v1/v1.1/plan.md`（stage-38 章节 + D3）+ 本计划调研复核（update.ts `writeWithMergeDetection`、opencode-config.ts、global-paths.ts、feel.md `冲突检测` 节、core-instructions `会话启动自检` 节）。

---

## 一、知识库参考

| 条目 | 路径 | 相关性 |
|------|------|--------|
| update 增量部署哈希追踪 + 冲突标记三态模式 | kb/patterns.md #update 增量部署哈希追踪 + 冲突标记三态模式 | **直接命中**。本阶段要替换/演进的现有 hash 四态机制 |
| 全局/项目双 state 路由模式 | kb/patterns.md #全局/项目双 state 路由模式 | **高度相关**。追加/冲突记录按 isAbsolute 分流的基础 |
| 全局部署架构 | kb/architecture.md #全局部署架构（`opencode:generated` 生成物标记说明） | **直接命中**。`openfeel:generated` 与 `openfeel:begin/end` 的区分依据 |
| 跨平台行尾归一化模式 | kb/patterns.md #跨平台行尾归一化模式 | 必须遵循。标记识别与 hash 比对须归一化 CRLF |
| 向后兼容可选配置字段模式 | kb/patterns.md #向后兼容的可选配置字段模式 | 必须遵循。JSONC/frontmatter 合并须保留用户字段 |
| JSONC 深度合并（opencode-config） | kb/patterns.md #（stage-37 op-001 深度合并条目） | 复用。`parseJsonc`/`deepMergeJsonc` 是本阶段 frontmatter/JSONC 策略的基础 |
| 原子写 / 建议性文件锁模式 | kb/patterns.md #原子写模式 / #建议性文件锁模式 | 必须遵循。update_infos.md 写入复用 stage-35 fs 工具 |

> ⚠️ 执行任务前，若知识库中有相关条目，务必参考。重复踩过的坑不可再犯。

---

## 二、背景与动机

stage-37 已把框架资产部署到全局 `~/.config/opencode/`，但增量更新仍沿用 stage-32 以来的「hash 四态」机制（`writeWithMergeDetection`）：文件级 hash 比对，一旦用户改动过受管文件，整文件拒绝覆盖（conflicts），框架更新被阻塞；不区分「框架内容」与「用户内容」。

这带来三类问题：

1. **更新粒度粗**：hash 是文件级的，用户给 `feel.md`/`AGENTS.md` 加一句项目自定义，就导致整个文件无法接受框架更新（conflicts 或降级覆盖）。
2. **冲突修复人工成本高**：`update_conflicts/` 的 Git 风格冲突文件需用户逐文件手工合并，多项目 × 多文件时不可接受。
3. **无「区外保留」能力**：无法安全地「只更新框架管的部分、保留用户加的部分」。

D3 决策用**控制区标记**解决：用成对标记（`openfeel:begin/end`）包裹受管内容，update 只覆盖区内，区外用户内容天然保留。本阶段实现标记工具 + 三态接入 + `update_infos.md` 记录 + 会话启动修复约束。

### 调研确认事实（本计划复核）

| 项 | 结论 | 证据 |
|----|------|------|
| 现有四态判定 | `writeWithMergeDetection`（update.ts L1229-1274）：不存在→created；存在+hash 匹配→updated；存在+hash 不匹配→conflicts；无 state 记录→updated（降级） | 源码 |
| 三态（D3） | 不存在→直接写；无标记→末尾追加+记录 update_infos.md；含标记→只覆盖区内 | v1.1 plan D3 |
| JSONC 深度合并基础 | `opencode-config.ts` 已导出 `parseJsonc` / `deepMergeJsonc` / `mergeGlobalOpencodeJsonc`（stage-37 op-001） | 源码 |
| update_infos.md 路径 | `global-paths.ts` 已导出 `getGlobalUpdateInfosPath()`（仅解析路径，读写属本阶段） | 源码 |
| generated 标记 | `.opencode/` 自举实例带 `<!-- openfeel:generated — ... -->` 单行信号（build.js 步骤 8 插入），作用于构建产物 | kb/architecture.md L375 |
| 会话启动检查前例 | feel.md「冲突检测」节（L319-337）已检测 update_state 冲突；core-instructions「会话启动自检」节（L9-36） | 模板 |
| fs 工具 | `atomic-write.ts`（`atomicWriteFileSync`）、`file-lock.ts`（`withFileLock`/`globalLockPath`）、`sequence.ts` 已就绪 | 源码 |

---

## 三、已确认决策（继承 v1.1 大计划 D3，不可推翻）

### D3：增量更新 + 控制区标记

- 用控制区标记包裹受管内容，更新只覆盖区内，区外用户内容保留
- 标记方案：
  - Markdown：`<!-- openfeel:begin -->` … `<!-- openfeel:end -->`
  - Markdown frontmatter：无标记，结构化字段合并
  - JSONC（opencode.jsonc）：无标记，解析 → 深度合并 → 序列化
  - 纯文本（`.gitignore`）：`# openfeel:begin` … `# openfeel:end`
- 部署三态：不存在 → 直接写入；存在且无标记 → 增量追加到末尾并记录 `~/.openfeel/update_infos.md`；存在且含标记 → 只覆盖区内
- 新增约束：会话启动时检查 `~/.openfeel/update_infos.md` 并修复相关冲突，完成后提醒用户重启会话

---

## 四、Planner 新增判断（超出 D3，供审查 / Schemer 确认）

| # | 判断 | 理由 | 状态 |
|---|------|------|------|
| **N1** | **三态只适用于「标记型文件」（Markdown 正文、`.gitignore`）；「结构化型文件」（frontmatter、JSONC）恒走合并，不进入三态**。frontmatter/JSONC 天然结构化，无「追加」概念，用户字段 passthrough 保留即可安全合并 | D3 已明确「frontmatter/JSONC 无标记」，即不参与 begin/end 三态；避免为无标记结构文件硬造「追加」语义 | 待确认 |
| **N2** | **「无标记 → 追加」的追加内容即「标记包裹的受管区」**（而非裸内容）。追加后文件即含标记，下次 update 走「含标记替换区内」，**避免无标记文件每次 update 无限重复追加** | 若追加裸内容，下次 update 仍判「无标记」→ 死循环追加；追加即建区是自洽解 | 待确认 |
| **N3** | **hash 机制降级为「无标记文件」的归属兜底，不再作为「含标记文件」的拒写依据**。含标记文件无条件只覆盖区内（区内属框架、区外属用户，标记即契约）；hash 仅用于区分「无标记存量文件是框架写的（可整文件 adopt）还是用户写的（只能追加）」 | 控制区比 hash 更精确（区间级 vs 文件级）；保留 hash 只为存量过渡（兼容性 §七） | 待确认 |
| **N4** | **`appended` 为新增结果分类**，`UpdateResult` 增加 `appended: string[]`（与 created/updated/skipped/conflicts 并列），命令层输出同步 | 「追加」语义不同于「冲突」（未拒绝，只是留待会话启动复核），独立分类可被 feel.md 会话启动检查精确消费 | 待确认 |
| **N5** | **会话启动修复规则落地 `feel.md`（主）+ 框架约束 core-instructions（辅）**：feel.md「冲突检测」节扩展（Feel 是 primary agent，启动自检属其职责，且有现成前例）；core-instructions「会话启动自检」节加一条引用性约束作强制兜底。双语 zh-CN + en 同步 | 对称 feel.md L319-337「冲突检测」与 core-instructions L9-36「会话启动自检」两个前例；Feel 承载具体修复动作，core 承载强制约束 | 待确认 |
| **N6** | **`generated` 与 `begin/end` 不冲突、不统一**：`generated` 是「整文件声明」（构建产物全量重写，无需区间），`begin/end` 是「区间包裹」（增量更新需保留区外内容）。两者作用于不同文件集合——`generated` 标记仓库 `.opencode/`（构建产物），`begin/end` 标记 update 部署目标（`~/.config/opencode/` 全局资产 + 项目 AGENTS.md/gitignore） | kb/architecture.md L375 已定性两者语法不冲突；避免过度设计统一为一种 | 待确认 |
| **N7** | **`update_infos.md` 存 `~/.openfeel/`（全局，跨项目）**，记录「被追加的受管文件」与「标记解析异常的文件」，格式为带状态勾选的 Markdown；写入走 `withFileLock(globalLockPath('update-infos'))` + 原子写（跨项目共享，须加锁） | 复用 stage-37 全局 state 的加锁范式；路径已由 `getGlobalUpdateInfosPath()` 提供 | 待确认 |

### 交 Schemer 评估的议题

- **D38-1**：`appended` 文件在 `update_state.json` 的 hash 如何记录？本计划**默认**：追加后记录 `status: clean` + 新 hash（追加即建区，后续走区内替换，无需特殊状态）；但保留「新增 `status: 'appended'` 枚举」的备选，供 Schemer 判断是否需在下次 update 前识别「尚未复核」的文件。
- **D38-2**：Markdown 文件「frontmatter 结构化合并 + 正文 begin/end 包裹」是否在同一次 update 内联合执行（agent/skill 文件既有 frontmatter 又有正文）？本计划**默认是**（见 §五 op-001 策略矩阵），但具体字段合并顺序（frontmatter 先合并、正文后替换区内）由 Schemer 在方案中定稿。
- **D38-3**：标记解析失败（begin 无 end、end 无 begin、嵌套异常）时的降级策略：**默认**「降级为追加受管区 + 写 update_infos.md 标记异常条目」，不整文件覆盖（防误删用户内容）。

### Schemer 细化待办（REV 带入方案阶段，标注不阻塞）

> 以下审查问题属**方案粒度细化**，本计划标注为「Schemer 细化待办」，不阻塞计划通过；op 级方案（ops/op-*.md）须逐条落实。

| # | 待办 | 落点 op |
|---|------|---------|
| REV-901 | 含标记文件 skip 判定：提取现有区内内容与 incoming 比对，**相同则 skip**（避免无变化仍写） | op-002（三态接入） |
| REV-902 | core-instructions 只加**提示性约束**（引导用户/Feel 检查），**不自行修复**；修复动作仅 feel.md 承载 | op-003（任务 2 措辞） |
| REV-904 | frontmatter 合并粒度：建议 **agent 级**（或明确字段白名单）；并界定「无标记追加场景」下 frontmatter 的处理 | op-001（frontmatter 策略） |
| REV-907 | 会话启动修复测试边界：`resolveUpdateInfo` 函数单测 + 模板静态断言，**不做行为级 E2E** | op-004（测试） |
| REV-908 | 多个 begin/end 标记对处理策略：**>1 对视为异常**，降级为追加 + 写 update_infos.md | op-001（标记解析） |
| REV-909 | 追加对 agent 文件的内容重复副作用提示；`appended` 条目「人工确认」语义明确 | op-002 + op-003 |
| REV-911 | `update_state.json` 损坏/丢失时全量追加风险：测试覆盖 + 命令层警告 | op-002 + op-004 |

---

## 五、工作阶段（op 级）

### 概览

| op | 主题 | 变更目标 | 文件数 |
|----|------|----------|:--:|
| op-001 | 控制区标记工具 | NEW `managed-region.ts`（4 策略：markdown/gitignore/frontmatter/jsonc） | ~2 |
| op-002 | 部署三态接入 | NEW `update-infos.ts` + 重构 `update.ts`（三态 + appended + 追加记录） | ~3 |
| op-003 | 会话启动修复规则 | feel.md + core-instructions（zh/en）新增「检查 update_infos.md 并修复」约束 | ~4 |
| op-004 | 测试 | 标记/三态/update_infos 生命周期/启动修复 单元测试 + 回归 | ~5 |

### 依赖图

```
op-001（managed-region.ts 标记工具）
   │ hard
   ▼
op-002（update-infos.ts + 三态接入 update.ts）
   │ hard
   ▼
op-003（feel.md + core-instructions 会话启动修复规则）
   │ hard
   ▼
op-004（测试：标记/三态/生命周期/启动修复 + 回归）
```

- op-001 先导（标记工具，无依赖）。
- op-002 hard 依赖 op-001（update.ts 用 managed-region 分派 + update-infos 写追加记录）。
- op-003 hard 依赖 op-002（feel.md/core 引用的 `update_infos.md` 读写逻辑与格式由 op-002 定稿）。
- op-004 hard 依赖 op-001/002/003（断言三态、生命周期、启动修复全链路）。
- 无并行批次：四者冲突域顺次依赖（managed-region → update-infos → 模板 → 测试）。

---

### op-001：控制区标记工具 `managed-region.ts`

> **目标**：按文件类型识别/包裹/替换受管区，作为 op-002 三态接入的底层工具。
> **前置依赖**：无
> **规模**：~2 文件
> **含 N1/N2/N6/D38-2**

| # | 任务 | 描述 | 涉及文件 |
|---|------|------|----------|
| 1 | 新建标记工具模块 | NEW `src/core/managed-region.ts`：导出 `detectFileType(path)`、`wrapRegion(content, type)`、`replaceRegion(existing, content, type)`、`hasRegion(existing, type)`、`extractRegion(existing, type)`。四种策略分派 | NEW `src/core/managed-region.ts` |
| 2 | Markdown 策略 | `<!-- openfeel:begin -->` … `<!-- openfeel:end -->`：识别/包裹/替换区内（含 CRLF 归一，见 kb 行尾归一化模式） | 同上 |
| 3 | 纯文本策略 | `.gitignore`：`# openfeel:begin` … `# openfeel:end` | 同上 |
| 4 | frontmatter 策略 | 无标记，结构化字段合并：解析 YAML frontmatter → 框架字段覆盖 + 用户字段 passthrough → 序列化。**复用/借鉴 opencode-config.ts 的 merge 思路**（不重复造轮子，抽取或 import） | 同上 |
| 5 | JSONC 策略 | 无标记，深度合并：**直接复用 `opencode-config.ts` 的 `parseJsonc`/`deepMergeJsonc`** | 同上 |
| 6 | 单元测试 | 断言四策略的识别/包裹/替换/合并行为；含「begin 无 end」「end 无 begin」异常用例 | NEW `test/core/managed-region.test.ts` |

> **验证**：`managed-region.test.ts` 全绿；标记精确匹配（不误匹配 `openfeel:generated` 单行信号，N6）。
> **注意**：本 op 只产出工具 + 测试，不接入 update 主流程（op-002 接入）。

**策略矩阵（本 op 的核心契约）：**

| 文件类型 | 判定依据 | 策略 | 三态适用 |
|---------|---------|------|---------|
| Markdown 正文（agent/skill/AGENTS.md/core.md） | `.md` 扩展名 | `<!-- openfeel:begin/end -->` 包裹/替换 | 适用 |
| Markdown frontmatter | `.md` + 含 YAML frontmatter | 结构化字段合并（无标记） | 不适用（恒合并） |
| JSONC（opencode.jsonc） | `.jsonc` | 解析 → deepMerge → 序列化（无标记） | 不适用（恒合并） |
| 纯文本（.gitignore） | `.gitignore` | `# openfeel:begin/end` | 适用 |

> 说明：agent/skill 文件既有 frontmatter 又有正文，本 op 提供「frontmatter 合并」+「正文区内替换」两个原语，op-002 组合使用（D38-2）。

---

### op-002：部署三态接入 + `update_infos.md` 读写

> **目标**：`writeWithMergeDetection` 演进为「控制区优先 + hash 兜底」的三态（+appended 四分类）；新增 `update-infos.ts` 读写模块并落地追加记录。
> **前置依赖**：op-001（hard）
> **规模**：~3 文件
> **含 N2/N3/N4/N7/D38-1/D38-3**

| # | 任务 | 描述 | 涉及文件 |
|---|------|------|----------|
| 1 | 新建 update_infos 读写模块 | NEW `src/core/update-infos.ts`：`loadUpdateInfos()`（读 `~/.openfeel/update_infos.md`，解析为条目列表，不存在返回空）、`appendUpdateInfo(kind, path, ts)`（加锁+原子写追加）、`resolveUpdateInfo(path)`（标记修复/清除条目）、`clearUpdateInfos()`。路径用 `getGlobalUpdateInfosPath()` | NEW `src/core/update-infos.ts` |
| 2 | 重构 writeWithMergeDetection | 改为 `writeManagedFile`（或 wrapper）：按 `detectFileType` 分派 → 标记型走三态 + appended；结构化型走合并（复用 op-001 原语 + opencode-config） | `src/core/update.ts` |
| 3 | 三态接入 | 不存在→写入（含标记包裹）→created；含标记→只替换区内→updated；无标记→hash 兜底（匹配→直接写带 begin/end 标记的新框架内容，等价 created 记为 updated；不匹配/无记录→追加受管区→appended + 写 update_infos.md）（REV-906 修订） | `src/core/update.ts` |
| 4 | UpdateResult 扩展 | 增加 `appended: string[]`；命令层输出新增「追加 N 个文件（待会话启动复核）」提示 | `src/core/update.ts` + 命令层 |
| 5 | 标记解析异常降级 | begin/end 异常（D38-3）→ 追加受管区 + 写 update_infos.md 异常条目，不整文件覆盖 | `src/core/update.ts` |

> **验证**：`openfeel update` 对四类文件走正确策略；无标记文件被追加并写入 update_infos.md；含标记文件只覆盖区内、区外内容不变；幂等（第二次 update 不再重复追加）。
> **注意**：本 op 只落「写入侧」；「读取侧修复」由 op-003 落地。hash 仍更新（D38-1 默认 clean），但不再作为含标记文件的拒写依据（N3）。

**三态 + hash 组合语义（本计划核心交付，精确表格）：**

| 文件存在？ | 含 begin/end 标记？ | hash 匹配 state？ | 动作 | 结果分类 |
|:--:|:--:|:--:|:--|:--:|
| ❌ | — | — | 写全文（frontmatter 结构化 + 正文标记包裹 / jsonc 合并 / gitignore 标记包裹） | `created` |
| ✅ | ✅ | — | 只替换区内（区外不动）；frontmatter 额外结构化合并 | `updated` |
| ✅ | ❌ | ✅（框架上次写、未改） | 存量过渡：直接写带 begin/end 标记的新框架内容（adopt，等价 created 记为 updated）（REV-906 修订） | `updated` |
| ✅ | ❌ | ❌ 或 无 state 记录 | 末尾追加「标记包裹的受管区」+ 写 `update_infos.md` | `appended` |

> **优先级**：控制区标记 > hash 兜底。含标记文件走「区内替换」无条件成立（标记即「区内归框架、区外归用户」的契约），hash 仅服务于「无标记存量文件」的归属判定（N3）。

---

### op-003：会话启动修复规则（feel.md + 框架约束）

> **目标**：落地「会话启动检查 `~/.openfeel/update_infos.md` 并修复、完成后提醒重启」约束。
> **前置依赖**：op-002（hard，update_infos 格式已定）
> **规模**：~4 文件
> **含 N5**

| # | 任务 | 描述 | 涉及文件 |
|---|------|------|----------|
| 1 | feel.md「冲突检测」节扩展 | 在现有「冲突检测」节（L319-337）后新增「update_infos 检查修复」小节：启动读 `~/.openfeel/update_infos.md` → 逐条检查目标文件是否已含标记 → 已含则 `resolveUpdateInfo` 清除条目；仍无则提示用户处理或尝试自动包裹 → 修复完成后提醒重启会话 | `src/core/templates-data/opencode/agents/zh-CN/feel.md`、`en/feel.md` |
| 2 | core-instructions「会话启动自检」节扩展 | 在「会话启动自检」节（L9-36）末尾加一条：检查 `~/.openfeel/update_infos.md`，若存在未修复条目则修复并提醒重启 | `src/core/templates-data/opencode/instructions/zh-CN.md`、`en.md` |
| 3 | 双语同步 | zh-CN + en 文案对称 | 上述 4 文件 |

> **验证**：feel.md 与 core-instructions 均含「检查 update_infos.md 并修复、完成后提醒重启」约束；`npm run build` 重生成 template-loader.ts 注入无错误。
> **注意**：此规则是「Feel 启动自检」的扩展，修复动作在 Feel 职责内（读 + 检查 + 提醒），不引入新 Agent。

**检查逻辑与修复动作（精确）：**

1. 读 `~/.openfeel/update_infos.md`；不存在 → 静默跳过。
2. 遍历条目，对每个「追加/异常」文件：
   - 目标文件已含 begin/end 标记（用户已处理或后续 update 已修复）→ 调用 `resolveUpdateInfo` 清除该条目。
   - 目标文件仍无标记 → TTY 交互环境提示用户；非 TTY 静默跳过（对称 feel.md 现有冲突检测行为）。
3. 修复完成后，提醒用户重启会话（opencode 全局 agent/约束已变更，需重启加载）。
4. 全部条目清除后，`update_infos.md` 可清空（保留空骨架或删除）。

---

### op-004：测试

> **目标**：覆盖标记识别/替换、三态组合、update_infos 生命周期、启动修复规则的单元测试 + 全量回归。
> **前置依赖**：op-001/002/003（hard）
> **规模**：~5 文件
> **含 N1/N2/N3/N4**

| # | 任务 | 描述 | 涉及文件 |
|---|------|------|----------|
| 1 | 三态组合测试 | update.test 扩展：四类文件不存在→写、含标记→只替换区内（断言区外内容不变）、无标记+hash 匹配→adopt（直接写带标记新框架内容，REV-906）、无标记+hash 不匹配→追加+写 update_infos | `test/core/update.test.ts` |
| 2 | update_infos 生命周期测试 | append/load/resolve/clear；加锁并发写不损坏；条目勾选状态流转 | NEW `test/core/update-infos.test.ts` |
| 3 | 幂等断言 | 追加后二次 update 不再重复追加（N2 核心回归点） | `test/core/update.test.ts` |
| 4 | generated/begin 区分断言 | 标记识别不误匹配 `openfeel:generated` 单行信号 | `test/core/managed-region.test.ts` |
| 5 | 全量回归 | `npm run build && npm test` 全绿；`openfeel lint i18n` / `lint kb` 零错误 | — |

> **验证**：`npm test` 全绿（现有 ~470 + 新增）；「只追加不覆盖」与「区外保留」为核心断言；测试隔离 HOME（复用 stage-37 mock homedir 范式，不污染真实 `~/.openfeel/update_infos.md`）。

---

## 六、`update_infos.md` 格式与生命周期

### 格式

```markdown
# OpenFeel 增量更新记录

> 本文件记录 `openfeel update` 因目标文件无控制区标记而追加的受管内容，
> 供会话启动时检查并修复。修复完成后勾选对应条目。

## 追加（无标记 → 末尾追加受管区）
- [ ] `~/.config/opencode/agents/feel.md`（2026-09-25 10:00）
- [ ] `AGENTS.md (项目: /path/to/proj)`（2026-09-25 10:00）

## 异常（标记解析失败 → 已降级追加）
- [ ] `~/.config/opencode/skills/xxx/SKILL.md`（2026-09-25 10:00）
```

> ⚠️ **职责边界（REV-905 修订）**：`update_infos.md` 仅承载**标记型文件**的「追加」与「标记解析异常」两类条目。JSONC/frontmatter 等**结构化型文件恒深度合并不产生冲突，不写入 `update_infos.md`**（v1.1 大计划 L315 曾述「opencode.jsonc 冲突项记录到 update_infos.md」，已被本阶段取代，该行已同步修订）。

### 路径记录规则（REV-903 修订）

`update_infos.md` 存于全局 `~/.openfeel/`（跨项目共享），条目路径必须**自包含、无歧义**，规则如下：

| 资产类型 | 记录方式 | 示例 |
|----------|----------|------|
| 全局资产（`~/.config/opencode/` 下） | 绝对路径 | `~/.config/opencode/agents/feel.md` |
| 项目资产（`AGENTS.md`、`.gitignore`、`opencode.jsonc` 等） | 「项目根 + 相对路径」二元组 | `AGENTS.md (项目: /path/to/proj)` |

> **禁止**对项目资产只记相对路径：跨项目共享同一文件时会导致条目归属歧义（项目 A 的 `AGENTS.md` 条目被误判为项目 B 的）。此规则是 `update-infos.ts` 数据结构的设计前提——`appendUpdateInfo(path, ...)` 的 path 参数须携带项目根以生成二元组记录，`loadUpdateInfos()` 解析时据此还原绝对路径。

### 生命周期

| 时点 | 动作 |
|------|------|
| update 追加/异常 | `appendUpdateInfo` 追加条目（加锁 + 原子写） |
| 会话启动 | Feel 读 + 逐条检查：已含标记 → `resolveUpdateInfo` 勾选/清除 |
| 修复完成 | 提醒重启会话；全部条目清除后文件可清空 |
| 冲突如何标记 | 条目为「待复核」状态（`- [ ]`），复核后勾选 `- [x]` 或删除 |

> 与 `update_conflicts/`（Git 风格冲突文件）的边界：`update_conflicts/` 继续承载「含标记但需人工三路合并」的重冲突；`update_infos.md` 承载「无标记追加 + 标记异常」的轻记录。二者互补不重叠。

---

## 七、兼容性策略（存量无标记文件过渡）

| 存量对象 | 状态 | 首次 update 处理 | 后续 |
|----------|------|------------------|------|
| 全局 `~/.config/opencode/agents/*.md`（无标记，stage-37 部署） | hash 匹配（框架上次写） | 直接写带 begin/end 标记的新框架内容（adopt，等价 created 记为 updated）（REV-906 修订） | 走区内替换 |
| 同上 | hash 不匹配（用户改过） | 末尾追加受管区 + 写 update_infos.md（N2） | 会话启动复核 |
| 全局 `~/.config/opencode/opencode.jsonc` | 用户已自定义字段 | 恒深度合并（N1，不参与三态） | 恒合并 |
| 项目 `AGENTS.md` | 无标记，可能含用户项目约束 | 同上（标记型三态） | 同上 |
| 项目 `.gitignore` | 无标记 | 同上（纯文本 `# begin/end`） | 同上 |
| 项目 `opencode.jsonc` | 用户模型/语言覆盖 | 恒深度合并 | 恒合并 |

> **边界重申**：本阶段只落「新 update 路径的控制区标记」；`openfeel migrate` 命令、update_state 存量拆分重键仍属 stage-39。存量文件首次 update 的「直接写带 begin/end 标记的新框架内容」（adopt，等价 created 记为 updated，REV-906 修订）即过渡动作，无破坏（hash 匹配才 adopt，不匹配只追加）。

---

## 八、测试策略

| 验证点 | 方式 |
|--------|------|
| 标记识别/包裹/替换（4 策略） | `managed-region.test.ts`；异常标记（begin 无 end 等）用例 |
| 三态组合 | `update.test.ts`：不存在写 / 含标记替换区内（区外不变）/ 无标记+匹配 adopt / 无标记+不匹配 追加 |
| appended 分类 | `update.test.ts` 断言 `UpdateResult.appended` 非空且写入 update_infos.md |
| update_infos 生命周期 | `update-infos.test.ts`：append/load/resolve/clear + 加锁并发 |
| 幂等（不重复追加） | 追加后二次 update 断言不再追加（N2） |
| generated/begin 区分 | `managed-region.test.ts` 断言不误匹配 `openfeel:generated` |
| 会话启动修复 | feel.md/core 模板内容断言（静态）+ 修复逻辑抽测 |
| 隔离无污染 | 复用 stage-37 mock homedir 范式，不碰真实 `~/.openfeel/update_infos.md` |
| 全量回归 | `npm run build && npm test` + lint i18n/kb |

**现有测试同步重点**：`test/core/update.test.ts` 的 hash 四态断言（conflicts/updated 语义）须按「控制区优先 + hash 兜底」重算；「26 skipped」「冲突/合并用例」路径改全局 + 追加分类。

---

## 九、风险点与回滚

| # | 风险 | 影响 | 缓解 |
|---|------|:--:|------|
| 1 | **标记与用户内容冲突**（用户正文恰含 `<!-- openfeel:begin -->` 字样） | 中 | 精确成对匹配 + 异常降级（D38-3）；标记 token 含 `openfeel` 前缀，冲突概率低 |
| 2 | **generated 与 begin/end 混淆** | 中 | 精确单行 vs 成对匹配区分（N6）；`managed-region.test.ts` 专项断言 |
| 3 | **误删用户内容**（区内替换吞掉用户改的区内内容） | 高 | 「区内归框架」是 D3 契约；区外绝对不碰；无标记文件绝不整文件覆盖（只追加/adopt） |
| 4 | **无限重复追加**（追加裸内容导致下次仍判无标记） | 高 | 追加即建区（N2）；幂等回归断言兜底 |
| 5 | **存量无标记文件 adopt 误吞用户内容** | 高 | adopt 仅限 hash 匹配（框架上次写、未改）；不匹配一律追加 |
| 6 | **update_infos.md 跨项目并发写损坏** | 中 | 复用 stage-35 加锁 + 原子写（N7） |
| 7 | **会话启动修复规则双语不一致** | 低 | zh/en 对称 + lint i18n |

**回滚方案**：各 op 独立提交，按 op `git revert`；`update_infos.md` / `~/.config/opencode/` 部署出错从备份恢复；版本号本阶段不变（仍 1.0.9，stage-39 统一升 1.1.0）。

---

## 十、约束与设计决策

| # | 约束 | 处理 |
|---|------|------|
| 1 | 遵循 AGENTS.md 简洁原则 | 不引入新 npm 依赖；`managed-region.ts`/`update-infos.ts` 为薄模块，复用 opencode-config 的 parse/merge 与 fs 工具 |
| 2 | 中文注释、英文标识符 | 新增模块函数须中文注释说明职责 |
| 3 | 复用 stage-35/37 产出 | `atomicWriteFileSync`/`withFileLock`（update_infos 写）、`parseJsonc`/`deepMergeJsonc`（frontmatter/jsonc 合并）、`getGlobalUpdateInfosPath` |
| 4 | 不实施 stage-39~40 | migrate、update_state 拆分、模型接口均不在本阶段 |
| 5 | 不直写 flow.json | Planner 不操作；阶段推进由 Feel 执行 `openfeel flow` |
| 6 | generated 与 begin/end 不统一 | 保持两种标记（N6），不强行合并 |

---

## 十一、预期产出

| 产出 | 路径 |
|------|------|
| 计划文档 | `.openfeel/plan/v1/stage-38/plan.md`（本文件） |
| 依赖声明 | `.openfeel/plan/v1/stage-38/deps.yaml`（由 Schemer 细化） |
| 操作方案 | `.openfeel/plan/v1/stage-38/ops/op-{001..004}.md`（由 Schemer 细化） |
| 标记工具 | NEW `src/core/managed-region.ts` + `test/core/managed-region.test.ts` |
| update_infos 模块 | NEW `src/core/update-infos.ts` + `test/core/update-infos.test.ts` |
| 源码改造 | `src/core/update.ts`（三态 + appended + 追加记录） |
| 模板 | `templates-data/opencode/agents/{zh-CN,en}/feel.md`、`templates-data/opencode/instructions/{zh-CN,en}.md` |
| 测试 | `test/core/update.test.ts` 扩展 |

---

## 十二、待确认事项

1. **N1**：确认「三态仅适用标记型文件；frontmatter/JSONC 恒走合并不进入三态」。
2. **N2**：确认「无标记 → 追加」的追加内容为「标记包裹的受管区」（追加即建区，防无限追加）。
3. **N3**：确认 hash 机制降级为「无标记文件归属兜底」，不再作为含标记文件拒写依据。
4. **N4**：确认 `UpdateResult` 新增 `appended` 分类（而非并入 conflicts）。
5. **N5**：确认会话启动修复规则落地 feel.md（主）+ core-instructions（辅），双语同步。
6. **D38-1**：appended 文件 hash 记录采用 `clean`（默认）还是新增 `appended` 枚举。
7. **D38-3**：标记解析异常降级为「追加受管区 + 写异常条目」，不整文件覆盖，是否认可。

---

> 本计划引用知识库多条既有条目；改造完成后，须由 Archiver 将「控制区标记增量更新」「update_infos 会话启动修复」两条新经验沉淀至 kb/architecture.md 与 kb/patterns.md。
