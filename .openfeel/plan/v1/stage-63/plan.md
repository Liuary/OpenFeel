# v1.1.4-stage-63 计划 — 配置默认值解析与阶段创建继承（问题 1/6）

- **阶段**：`v1.1.4-stage-63`
- **依赖**：无（与 stage-62 独立：本阶段只读写 status.md 的 `执行模式`/`自动推进` 与 config `defaults`，不涉 `status`/`phase` 语义）
- **优先级**：P1
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-03
- **定位**：① 新建阶段的 `执行模式`/`自动推进` 取 **`config.yaml` 默认值**（而非硬编码 `manual`/`disabled`）；② `config set/get` 接受 `defaults.X ≡ X`；③ `config set --sync-stages` 批量同步既有阶段。
- **范围**：`src/core/plan/stage.ts`（`ensureStageSkeleton`）、`src/core/config.ts`（解析助手/键归一）、`src/commands/{plan,config}.ts`、`src/core/templates-data/opencode/skills/openfeel-cli-usage/SKILL.md` + 构建传播、测试。
- **边界**：不改变「status.md 局部 > config 默认」的**有效值**优先序（`flow status`/`config effective` 不变）；`--sync-stages` 仅同步阶段级字段；不新增依赖；不 `npm publish`/`git push`；不改 `flow.json`；**不新增 i18n 键**。

## KB 检索（`openfeel-check-kb`）

- 已加载 `openfeel-check-kb`。**高度相关条目**：
  - `kb/architecture.md #config.yaml meta.version 语义`、`kb/patterns.md #配置级联` → 本阶段**不改**级联有效值优先序，仅新增「默认值读取」用于**骨架初始值**。
  - `kb/patterns.md #CLI 用法 skill（权威源文件 + build 双注入 + 自举 + 一致性校验）` → skill 更新须改**权威源** `templates-data/opencode/skills/openfeel-cli-usage/SKILL.md`，由 `npm run build` 传播；`openfeel-cli-usage` 快照版本**不改**（本阶段无版本语义变更）。
  - `kb/patterns.md #配置键白名单/枚举校验（schema 驱动 + 值类型归一 + 非法不写盘）` → `defaults.X` 归一须仍在 schema 白名单内，非法键仍拒绝。
  - `kb/troubleshooting.md #默认开启写真实用户目录的副作用防护` → 相关测试仍须 `OPENFEEL_LOG=0` + HOME 隔离。
- **无「阶段骨架初值应取 config 默认」条目** → 归档时补沉 patterns。

---

## 一、背景与实测证据（唯一事实基准）

| 事实 | 源码位置 | 结论 |
|------|----------|------|
| `ensureStageSkeleton` **硬编码** `执行模式: manual` / `自动推进: disabled` | `src/core/plan/stage.ts:138-145` | 问题 1 根因（**非**文档所称「取 effective 值」） |
| `addStage` 仅 `ensureStageSkeleton` + `registerStage` | `stage.ts:184-200` | 无显式初值参数 |
| `plan stage add` 选项仅 `--deps`/`--tasks` | `commands/plan.ts:24-29` | 无 `--auto-advance`/`--exec-mode` |
| `config set` 白名单 = `Object.keys(ConfigDefaultsSchema.shape)`（bare keys） | `commands/config.ts:225-230` | `defaults.execution_mode` 被拒（问题 6 确认） |
| 全仓无 `config set --sync-stages` | `rg` | 问题 1 建议②缺失 |
| `buildCascadeConfig` 已解析 config `defaults`（私有，绑定 current stage） | `flow-manager.ts:1866-1944` | 可作为解析参考，但**不可直接复用**（依赖 `this.data`/current stage） |

> 本仓 `.openfeel/config.yaml` 实测 `execution_mode: auto`、`auto_advance: enabled`、`test_enabled: true`；而 `plan stage add` 生成的 status.md 仍为 `manual`/`disabled`（stage-61 曾手工校正为 `enabled`）——**直接印证问题 1**。

---

## 二、目标语义

| 维度 | 改前 | 改后 |
|------|------|------|
| 新阶段 status.md 初值 | 硬编码 `manual`/`disabled` | 取 **`config.yaml.defaults`**（缺失回退 `DEFAULT_CONFIG`） |
| 显式覆盖 | 无 | `plan stage add --exec-mode/--auto-advance` 最高优先 |
| `config set/get` 键 | 仅 bare `X` | `defaults.X` ≡ `X`（归一后走同一白名单/校验） |
| 批量同步 | 无 | `config set <key> <v> --sync-stages` 写所有阶段 status.md 对应字段 |

**不变量**：`status.md` 局部覆盖仍优先于 config 默认（`config effective` / `flow status` 级联口径**不变**）；本阶段只影响**新建阶段骨架初值**与**显式批量同步**。

---

## 三、变更点清单（编号 T）

### T1 — 新增共享「默认值解析」助手（`src/core/config.ts`）

- 新增 `resolveConfigDefaults(projectPath): { execution_mode; auto_advance; test_enabled?; merge_mode }`：读 `.openfeel/config.yaml` 的 `defaults` 块，逐键经 `ConfigDefaultsSchema` 校验，缺失/非法回退 `DEFAULT_CONFIG`。
- **不读取 status.md、不做 effective 合并**（区别于 `buildCascadeConfig`）。
- 键归一助手 `normalizeConfigKey(key)`：`defaults.` 前缀剥离（`defaults.execution_mode → execution_mode`），供 `config set/get` 与助手共用（单一来源）。

### T2 — `ensureStageSkeleton` 初值取 config 默认（`plan/stage.ts`）

- status.md 骨架的 `- **执行模式**：` 与 `- **自动推进**：` 值改为来自 `resolveConfigDefaults(projectPath)`（`execution_mode`/`auto_advance`）。
- `addStage`/`ensureStageSkeleton` 增加可选 `overrides?: { executionMode?; autoAdvance? }` 形参，显式值优先于 config 默认。
- 幂等性不变：仅在 status.md **不存在**时写；已存在不覆盖。

### T3 — `plan stage add` 显式选项（`commands/plan.ts`）

- 新增 `--exec-mode <manual|auto>`、`--auto-advance <enabled|disabled>`；值域校验（非法 → exit 1 不建阶段，复用既有校验文案）。
- 透传至 `addStage` 的 `overrides`；写入 overview/status 与注册语义不变。

### T4 — `config set/get` 键名等价（`commands/config.ts`）

- `set`/`get`（项目模式）入口先 `normalizeConfigKey`，再走既有 `ConfigDefaultsSchema` 白名单与 `getConfigFieldLegalValues` 校验（`defaults.` 与 bare 等价）。
- `--global` 模式不变（profile 键域不同，不受影响）。
- `config --help`/错误文案回显**支持键清单**（现有 `config.set.invalidKey` 已列 `allowedKeys`；补 `defaults.` 等价说明，复用既有键，不新增 i18n 键）。

### T5 — `config set --sync-stages` 批量同步（`commands/config.ts`）

- 新增 `--sync-stages`（仅项目模式）：对**所有已注册阶段**（`flow.json.stages`）的 status.md，将目标键对应字段写为该值：
  - `auto_advance` → `自动推进`；`execution_mode` → `执行模式`；其它受管键（`merge_mode`/`test_enabled` 若仍存在）无阶段字段则跳过并报告。
- 复用 `flow-manager` 的定向写（`writeStatusField` 同语义）与按阶段锁；同值 no-op；失败逐条报告。
- 输出：同步 N 个 / 跳过 M 个（字段缺失）。

### T6 — 测试面

| # | 用例 | 断言 |
|:-:|------|------|
| T6.1 | config `defaults.auto_advance=enabled` 下 `plan stage add` | 新 status.md `自动推进: enabled`（非 disabled） |
| T6.2 | `plan stage add --auto-advance disabled` | 覆盖 config 默认 |
| T6.3 | config 缺失该键 | 回退 `DEFAULT_CONFIG`（`disabled`） |
| T6.4 | `config set defaults.execution_mode auto` | 成功；等价于 `config set execution_mode auto` |
| T6.5 | `config get defaults.execution_mode` | 返回 config 默认值 |
| T6.6 | `config set test_enabled true`（stage-62 移除后） | 报无效键 exit 1（跨阶段回归） |
| T6.7 | `config set auto_advance enabled --sync-stages` | 所有已注册阶段 status.md「自动推进」= enabled；同值 no-op |
| T6.8 | 非法 `--exec-mode bogus` | exit 1 且不建阶段 |

### T7 — 文档 + skill + 构建传播

| # | 文件 | 改动 |
|:-:|------|------|
| T7.1 | `templates-data/opencode/skills/openfeel-cli-usage/SKILL.md`（权威源） | `config set/get` 描述改为「`defaults.X` 与 `X` 等价；支持键清单见 `--help`」；新增 `config set --sync-stages`；`plan stage add --auto-advance/--exec-mode` |
| T7.2 | `.openfeel/manual/cli/commands.md`、`docs/commands.md`、`manual/core/config.md` | 同步命令面与键等价说明 |
| T7.3 | `npm run build` | 从权威源传播至 `template-loader.ts`/`update.ts` 生成段；`.opencode/**` 不复活 |

---

## 四、op 划分与执行顺序（**3 op**）

| op | 主题 | 覆盖 | 关键产出 | 依赖 |
|:--:|------|------|----------|------|
| **op-001** | 键归一 + 默认值解析助手 | T1+T4+T6.4/T6.5 | `config.ts`/`commands/config.ts`；测试 | — |
| **op-002** | 创建继承 + 显式选项 + 批量同步 | T2+T3+T5+T6 | `plan/stage.ts`/`commands/plan.ts`/`commands/config.ts`；测试 | hard: op-001 |
| **op-003** | 文档 + skill + 构建传播 + 门禁 | T7 | skill 权威源/manual/docs；`npm run build`；全门禁；阶段报告 | hard: op-002 |

**顺序：op-001 → op-002 → op-003。**

**边界声明**：不改有效值级联优先序；`--sync-stages` 仅阶段级字段；不新增依赖/i18n 键；不 `npm publish`/`git push`；不改 `flow.json`。

---

## 五、验收标准（阶段级）

1. **创建继承**：`defaults.auto_advance=enabled` 下 `plan stage add` 生成 `自动推进: enabled`；`defaults.execution_mode=auto` → `执行模式: auto`。
2. **显式覆盖**：`--auto-advance/--exec-mode` 优先于 config 默认。
3. **键等价**：`config set/get defaults.X` ≡ `X`，非法键仍拒绝、非法值不写盘。
4. **批量同步**：`--sync-stages` 对所有已注册阶段生效；同值 no-op；失败可观测。
5. **帮助**：`config --help`/错误文案回显支持键清单与 `defaults.` 等价。
6. **不变量**：`config effective`/`flow status` 级联口径不变（status.md 局部仍优先）。
7. **skill/docs**：`openfeel-cli-usage` 与 docs 与新命令面一致；`npm run build` 成功、`.opencode/**` 不复活。
8. **测试**：`npm test` 全绿 `0 skipped / 0 failed`。
9. **类型**：`tsc` = 0；**i18n**：`lint i18n` = 730；**KB**：`lint kb` = 0。

---

## 六、风险与回滚

| # | 风险 | 影响 | 缓解 / 回滚 |
|:-:|------|------|-------------|
| R-1 | 误用 effective 值致新阶段继承上一阶段 status.md | 中 | 助手**只读 config.yaml defaults**，不读 status.md；T6.3 断言回退 |
| R-2 | `--sync-stages` 批量覆盖用户有意设置的阶段级覆盖 | 中 | 显式命令（非默认）+ 同值 no-op + 输出明细；文档警示 |
| R-3 | 键归一破坏 `--global` profile 键域 | 低 | 仅项目模式归一；全局分支不变 + 回归 |
| R-4 | skill 改权威源后 build 未传播/生成段漂移 | 低 | 依 `kb #CLI 用法 skill` 模式；`npm run build` + 生成段 diff 校验 |
| R-5 | 与 stage-62 并行改动 `config.ts` 冲突 | 低 | 串行执行（62→63）；若同文件，schemer 协调顺序 |

**回滚**：`git revert <sha>`；无数据迁移。

---

## 七、边界（不做）

1. 不改有效值级联优先序（`status.md > config > profile > builtin`）。
2. 不把 `config set --sync-stages` 设为默认行为。
3. 不新增依赖、不新增 i18n 键、不动 CI workflow。
4. 不 `npm publish`、不 `git push`、不改 `flow.json`。
5. 不改 `openfeel-cli-usage` skill 快照版本标注（无版本语义变更）。
6. 不创建除本阶段外的 op。

---

## 八、裁定项（本阶段需明确）

| # | 议题 | **建议** | 依据 |
|:-:|------|----------|------|
| **D-config** | `--sync-stages` 适用键范围 | 仅 `auto_advance`（`自动推进`）与 `execution_mode`（`执行模式`）；其它受管键无阶段字段则跳过报告 | 问题 1 明确要求 auto_advance；最小命令面 |
| **D-prefix** | 归一实现位置 | `src/core/config.ts` 的 `normalizeConfigKey`（单一来源），`commands/config.ts` 调用 | 避免第二套解析 |

## 九、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-03 | openfeel-planner | 初稿：T1~T7；3 op；验收 9 条；裁定 D-config/D-prefix |