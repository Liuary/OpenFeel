# 决策记录（ADR）

> 长期技术/架构决策（技术选型、架构方向、跨会话有效的设计取舍）以 ADR 轻量格式记录于此。
> 会话临时决策（流程调整、单次取舍）记录在 .openfeel/users/{username}/dev_last.md 的「决策历史」节，不写入本文件。
> 写入时机：Feel 做出长期技术/架构决策时，同步追加一条 ADR 记录。

## ADR 模板

### ADR-{NNN}：{决策标题}
- **日期**：{yyyy-mm-dd}
- **状态**：proposed / accepted / superseded / deprecated
- **决策**：{一句话描述采纳的决策内容}
- **理由**：{为什么这样决策，含备选方案及取舍分析}

## ADR 记录

### ADR-001：技术栈选型 TypeScript (Node.js ≥20)
- **日期**：2026-08-15
- **状态**：accepted
- **决策**：OpenFeel 采用 TypeScript（Node.js ≥20）实现，核心依赖 Commander / Zod / YAML / fast-glob。
- **理由**：CLI 工具需类型安全与丰富生态；Zod 提供运行时校验，YAML 兼顾可读性与工具链成熟度。

### ADR-002：仓库自身不再保留项目级部署资产（supersede N1）
- **日期**：2026-10-01
- **状态**：accepted（**supersede `kb/architecture.md` 的 N1 决策「仓库自身 `.opencode/` 不动」**）
- **决策**：OpenFeel **仓库自身**不再保留项目级部署资产——删除根 `AGENTS.md`、根 `opencode.jsonc`、`.opencode/{agents,skills,ADAPTER.md}`，并删除 `build.js` 步骤 8（自举重生成，防复活）；上述资产改由全局 `openfeel setup` 幂等部署（17 skill / 9 agent / 全局 `AGENTS.md`）。
- **上下文**：N1（2026-09-25）出于「项目精简仅指 init 新项目」的取舍，令仓库自身 `.opencode/` 作为构建产物/自举实例保留，并依赖 `build.js` 步骤 8 每次重生。
- **理由**：① 全局部署已完备（`setup` 幂等，含 `openfeel-cli-usage` skill 与全部纪律节）；② 消除「项目级与全局」双份资产漂移；③ 移除 `build.js` 步骤 8 以消除复活负担。备选（保留双份）被否，因漂移与维护成本高于收益。
- **后果 / 适用边界**：**缓解**——`.opencode/` 运行时目录（`node_modules`/`package.json`/`package-lock.json`/`.gitignore`）**保留**；项目级约束由全局 `AGENTS.md` 承载（重启会话生效）；各 agent `.md` 自带 `external_directory: "allow"` 不受根 `opencode.jsonc` 删除影响。**适用边界**：**目标项目**的 `.opencode/` 相关语义与 B 类保留清单**不受影响**（本决策仅针对 OpenFeel 仓库自身）。
- **回滚**：`git checkout <sha> -- AGENTS.md opencode.jsonc .opencode/` 恢复项目级资产 + `git revert` 恢复 `build.js` 步骤 8，随后 `npm run build` 复活受管实例；全局无需回滚（`setup` 向后兼容）。
