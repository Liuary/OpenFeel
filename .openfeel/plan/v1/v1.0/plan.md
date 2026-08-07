# OpenFeel v1.0 — 正式版发布计划

> 创建于 2026-08-07 | 基于全系列 v0.5.11 归档后的发布就绪工作

## 定位

**功能冻结 + 稳定发布**。不做大功能变更，聚焦稳定性打磨和发布就绪。
v0 全系列 25 阶段全部归档（304 测试全通过，构建零错误），v1.0 是将已有成果交付为正式可用版本。

## 阶段概览

| 阶段 | 名称 | 工作项 | 优先级 | 依赖 |
|------|------|--------|:--:|------|
| [stage-01](#stage-01-质量加固) | 质量加固 | 2 项 | P0 | 无 |
| [stage-02](#stage-02-发布工程) | 发布工程 | 3 项 | P0 | hard: stage-01 |
| [stage-03](#stage-03-文档完善) | 文档完善 | 1 项 | P1 | hard: stage-01, soft: stage-02 |

### 依赖图

```
stage-01（质量加固）── hard ──→ stage-02（发布工程）
       │
       ├── hard ──→ stage-03（文档完善）
       │
stage-02 ── soft ──→ stage-03（CHANGELOG 需版本定型，但可与 stage-02 并行启动）
```

---

## stage-01：质量加固

> **硬性前置**：确保代码库质量达标后再进入发布流程。

### 任务清单

| op | 任务 | 涉及文件 | 预估工作量 |
|----|------|------|:--:|
| op-001 | **质量门禁全量检查**：运行 `openfeel lint i18n` 和 `openfeel lint kb` 全量检查，修复所有问题。确保 422 键三向对称、kb 引用无过期。 | `src/commands/lint*.ts`, kb 引用关联文件 | 中 |
| op-002 | **测试覆盖率 + 边缘用例**：运行 `vitest run --coverage` 生成覆盖率报告，分析关键路径缺口（flow-manager、pipeline、config、cli），补充边缘用例至覆盖率 ≥ 85%。 | `test/*.test.ts`（20 文件），`vitest.config.ts` | 中 |

### 涉及文件预估

- `src/commands/lint-i18n.ts` — 可能修复 lint 检出问题
- `src/commands/lint-kb.ts` — 可能修复 kb 过期引用
- `test/` 目录下新增/扩展测试文件（1~3 个）
- `.openfeel/kb/` 下过期引用文件（按 lint 输出修复）

### 完成标准

- `openfeel lint i18n` 零错误零警告
- `openfeel lint kb` 零过期引用
- `vitest run --coverage` 所有测试通过，行覆盖率 ≥ 85%

---

## stage-02：发布工程

> **硬性前置**：stage-01 质量门禁全部通过。

### 任务清单

| op | 任务 | 涉及文件 | 预估工作量 |
|----|------|------|:--:|
| op-003 | **版本号统一**：将 `flow.json` 中 25 个 stageId 从 `v0.x.x` 体系重映射为 `v1.0.0` 体系（如 `v0.5.11-stage-01` → `v1.0.0-stage-01`），同步更新 `plan/index.md`、`plan/plan_log.md`、`kb/index.md`、`dev/current.md` 中所有版本引用。`package.json` 已为 `1.0.0`，`config.yaml` meta.version 已为 `1.0.0`，无需修改。 | `flow.json`（25 组 stageId + `pipeline.current.stage` + log 中 stageName），`plan/index.md`，`plan/plan_log.md`，`kb/index.md`，`dev/current.md` | 大 |
| op-004 | **npm 发布准备**：修复 `package.json` 占位符 URL（需用户提供实际 GitHub 仓库地址），运行 `npm pack --dry-run` 验证产物完整性（dist/ + bin/ + schemas/），确认 `files` 字段无遗漏。 | `package.json` | 小 |
| op-005 | **CI/CD 集成**：创建 `.github/workflows/ci.yml`，配置 GitHub Actions 工作流：`npm ci` → `npm run build` → `npm test` → `npm run lint`（若 lint 脚本存在）。使用 Node.js 22.x + 20.x 双版本矩阵。 | `.github/workflows/ci.yml`（新建） | 中 |

### 涉及文件预估

- `flow.json` — 全部 stageId/stageName 重映射（约 100+ 处）
- `.openfeel/plan/index.md` — 追加 v1.0 系列（+ 版本号修正）
- `.openfeel/plan/plan_log.md` — 追加计划创建日志
- `.openfeel/kb/index.md` — 版本号引用更新
- `.openfeel/dev/current.md` — 当前进度更新
- `package.json` — repository.url、bugs.url 修复
- `.github/workflows/ci.yml` — 新建
- `.gitignore` — 确认未忽略 `.github/` 目录

### 完成标准

- `flow.json` 中所有 stage 和 log 引用统一为 v1.0.0 体系
- `npm pack --dry-run` 无遗漏，产物列表与 `files` 字段一致
- GitHub Actions CI workflow 可正常运行（push/PR 触发，双版本矩阵全部通过）

### 风险点

- **op-004 需要用户输入**：`package.json` 的 `repository.url` 和 `bugs.url` 是占位符，需用户提供实际 GitHub 仓库地址后才能修复。若用户暂未创建 GitHub 仓库，此项标记为阻塞，仍可继续其他工作。

---

## stage-03：文档完善

> **硬性前置**：stage-01（质量达标）。**软性前置**：stage-02（CHANGELOG 需版本体系定型，但版本号是"如何引用"的问题，核心内容可先行编写）。

### 任务清单

| op | 任务 | 涉及文件 | 预估工作量 |
|----|------|------|:--:|
| op-006 | **CHANGELOG.md + 用户入门指南**：从 `kb/index.md`（150 条归档记录）和 `plan/plan_log.md`（30 条变更日志）提取 v0.1 ~ v0.5 全系列版本历史，编写 `CHANGELOG.md`（按 Keep a Changelog 规范）。编写 `docs/GETTING_STARTED.md` 入门指南，覆盖安装、初始化、基本工作流。 | `CHANGELOG.md`（新建），`docs/GETTING_STARTED.md`（新建） | 中 |

### 涉及文件预估

- `CHANGELOG.md` — 项目根目录，新建
- `docs/GETTING_STARTED.md` — 新建

### 完成标准

- `CHANGELOG.md` 覆盖 v0.1.0 ~ v1.0.0 全版本（格式：版本号、日期、Added/Changed/Fixed 分类）
- `docs/GETTING_STARTED.md` 包含：环境要求、安装步骤、初始化项目、启动第一个工作流

---

## 里程碑与交付物

| 里程碑 | 阶段 | 交付物 |
|------|:--:|------|
| M1: 质量达标 | stage-01 done | lint 零错误 + coverage ≥ 85% |
| M2: 发布就绪 | stage-02 done | 版本统一 + npm pack 验证 + CI 就绪 |
| M3: 文档齐全 | stage-03 done | CHANGELOG.md + GETTING_STARTED.md |
| **v1.0.0 发布** | 全部 done | `npm publish` 就绪 |

---

## 变更汇总

| 类别 | 预估数量 | 说明 |
|------|:--:|------|
| 新建文件 | 3~4 | `.github/workflows/ci.yml`，`CHANGELOG.md`，`docs/GETTING_STARTED.md`，可能新增测试文件 |
| 修改文件 | 8~12 | `flow.json`，`package.json`，`plan/` 索引，`kb/` 引用，`dev/current.md`，lint 关联源码 |
| 无变更 | — | `src/` 核心逻辑、`dist/` 构建产物、`config.yaml` |

> 知识库中暂无与 v1.0 发布流程直接相关的记录。本计划为新版首次制定。
