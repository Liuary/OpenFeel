# v1.1.2-stage-55

> 清掉项目级约束与 Agent（发布前收口）

## 目标

按用户指令「先收尾 → **清掉项目级别的约束和 Agent** → 发布」：删除仓库自身的项目级部署资产（根 `AGENTS.md`、根 `opencode.jsonc`、`.opencode/{agents,skills,ADAPTER.md}`），**并删除 `build.js` 自举步骤（防复活）**；把独有内容（**模块手册**）迁入全局约束模板；**先刷新全局部署、后删除**，确保 agent/skill/约束持续可用。

## 依赖

- `hard: v1.1.2-stage-54`（已登记）
- **后续**：`npm publish`（用户决定，不在本阶段）

## 关键事实（实测基线）

| 事实 | 数据 |
|------|------|
| 根 `AGENTS.md` | **162 行**；`1-123` 框架级（与模板重复）、`125-137` 版本管理、**`139-141` 模块手册（全局模板无，独有）**、`143-162` 项目流程工具；**非 build 产物** |
| `.opencode/agents(9)/skills(17)/ADAPTER.md` | 均为 `build.js` **步骤 8**（`:1056-1099`，调用 `:1121-1122`）产物 → **不改 build 会复活** |
| `git ls-files .opencode` | **27**（9+17+1，全部受管文件） |
| 唯一依赖仓库根 `.opencode` 的测试 | `test/core/opencode-instance.test.ts`（7 it；其余测试用 tmp/fixture） |
| 全局现状 | `AGENTS.md` **442** 行（缺模块手册）｜skills **16**（缺 `openfeel-cli-usage`）｜agents 9｜jsonc 有 `default_agent` + 2 处模型 |
| 根 jsonc 独有 | `instructions: ["AGENTS.md"]`（随删除失效）、`permission: "allow"`（全局无对应；agent `.md` 同键优先） |
| 保留 | `.opencode/{node_modules,package.json,package-lock.json,.gitignore}` = **opencode 运行时目录** |
| 冲突 | `kb/architecture.md:398` N1「仓库自身 `.opencode/` 不清理」→ **supersede** |

## 工作项与执行顺序（全串行，含安全门）

```
F2 模板迁入「模块手册」（zh/en）+ npm run build      → [门 A]
F1 备份全局 → `openfeel setup` → 判据 5 条           → [门 B]
F3 删除 5 项项目级资产                                → [门 C]
F4 删 build 步骤 8 + 测试翻转 + .gitattributes        → [门 D]
F5 引用同步（docs/manual/kb）· F6 supersede（N1）     → [门 E]
F7 静态验证 + 五门禁 + 新会话验证指引
```

> **顺序微调**：F2 前置到 F1 之前（否则刷完还要再刷一次）；**不变量**：**刷新全局严格早于删除**（用户裁定）。任一门失败即停止（此时尚未删除，零回滚成本）。

## 全局刷新命令裁定

**`node bin/openfeel.js setup`**（`src/core/setup.ts:29-110`，纯全局、幂等、走 `deployGlobalAsset` 带写前备份）——**不用 `update`**（`update.ts:1572+` 会额外处理**项目侧** `opencode.jsonc`，与即将删除的项目资产交叠）。
**判据**：全局 skills **17** ｜ `AGENTS.md` 含「模块手册」｜ agents **9** ｜ jsonc 保留 `default_agent` + 模型 ｜ **备份快照存在**。

## op 划分（4 op，全串行）

| op | 主题 | 覆盖 |
|----|------|------|
| op-001 | 模板迁移（模块手册 → 全局模板，双语 + build） | F2 |
| op-002 | **刷新全局部署**（备份 + setup + 判据） | F1 |
| op-003 | 删除 + 防复活 + 测试翻转 | F3 / F4 |
| op-004 | 引用同步 + supersede + 验证与门禁 | F5 / F6 / F7 |

**硬约束**：`op-002` 必须早于 `op-003`。

## 门禁

`npm run build`（幂等 + **不复活**）→ `npm test`（基线 59 文件 / 979 用例，**扣除被删测试文件后按实测记录**）→ `tsc` 0 → `lint i18n` **726 键** → `lint kb` **0 过期**

## 翻转清单

- **强制删除**：`test/core/opencode-instance.test.ts`（整文件 7 it）→ 其中 **CRLF**、**`external_directory`**、**reviewer 纪律节** 三组断言**迁移到模板源**
- **保持不翻转**：`templates.test.ts`（T54/T55/通用 skill 检查）、`update.test.ts`（对象为 tmp 项目）、`migrate.test.ts`、`global-paths.test.ts`、`model-config.test.ts`
- **新增**：①「仓库无项目级受管资产」防回归断言；②`build.js` 不含 `regenerateOpencodeInstance` 静态断言；③模板含「模块手册」节

## 风险与回滚

R-1 全局刷新失败/降级 → 备份先行 + `setup` 写前备份 + **门 B 未过不进 F3** ｜ R-2 误删 → 全部受 git 跟踪，`git checkout <sha> -- <paths>` 恢复 ｜ R-3 build 复活 → **F4 消除** + 门 D 实证 ｜ R-4 丢 `permission: "allow"` → agent `.md` 同键优先，F7 新会话验证（异常则改全局 jsonc）｜ R-5 全局约束未自动加载 → v1.1.1 已实测自动加载，F7 为权威判据 ｜ R-6 `lint kb` 历史引用过期 → **只读不改写**（去反引号/加注记）｜ R-7 覆盖缺口 → 三组断言迁移留痕 ｜ R-8 误删 `.opencode/node_modules` → F3 明确保留 + 验收 ｜ R-9 误伤未跟踪文件 → 仅用 `git rm`

## 裁定

| # | 议题 | 状态 |
|---|------|------|
| A1 | 顺序微调（F2 先于 F1；刷新严格早于删除） | planner 建议 + 待确认 |
| A2 | 根 `AGENTS.md` 版本管理节**不迁移**（信息已在 package.json/CHANGELOG/roadmap） | planner 建议 + 待确认 |
| A3 | 全局刷新用 **`setup`**（非 `update`） | planner 建议 + 待确认 |
| A4 | `GETTING_STARTED.md:127` **删除死链行** | planner 建议 + 待确认 |
| A5 | 删 `opencode-instance.test.ts` + **迁移 3 组断言** + 新增防回归断言 | planner 建议 + 待确认 |
| A6 | `.opencode/` 运行时 4 项**保留** | 由用户删除范围推定 |
| A7 | kb 历史条目**只读不改写**（追加 supersede） | planner 建议 + 待确认 |
| A8 | 本阶段**不含** `npm publish` | **已由用户指令确定** |
