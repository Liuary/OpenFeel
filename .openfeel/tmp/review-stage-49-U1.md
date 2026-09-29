# U1 审查单元报告 — v1.1.2-stage-49（核心流水线）

- **审查人**：openfeel-reviewer（GLM）｜**日期**：2026-09-29｜**环境**：node v24.18.1 / win32 / HEAD `20670b8`
- **完整报告（含逐条 REV 证据）**：`.openfeel/users/Liuary/code_review/REV-v1.1.2-stage-49-U1.md`
- **隔离实测脚本**：`.openfeel/tmp/u1-review-test.mjs`（fixture：`.openfeel/tmp/fixture/`）

## 覆盖文件清单（18/18，逐一出现）

`src/core/flow-manager.ts`（3111 行全量通读）、`src/core/pipeline-schema.ts`、`src/core/plan/path.ts`、`src/core/plan/stage.ts`、`src/core/plan/scheme.ts`、`src/core/plan/roadmap.ts`、`src/core/archive/merge.ts`、`src/core/view/entry.ts`、`src/core/metrics.ts`、`src/core/public-logger.ts`、`src/core/artifact-graph/{graph,index,instruction-loader,resolver,state,types}.ts`、`src/core/schema.ts`、`src/utils/kb-dedup.ts`

## 六维度结论速览

| 维度 | 结论 |
|------|------|
| 正确性 | advanceStagePhase 主链路、全量 done 判定（T7 通过）、REV 拦截（T5 通过）、乐观并发、S5 备份、deps 落点均正确；缺陷集中在 current.op 悬空（N1）、fuzzy 后缀匹配（N4）、存量缺 ops（N2） |
| 一致性 | transitions 三 API 数据源统一 ✓；op 分割 4 种写法并存（merge.ts indexOf 为唯一错误）；PIPELINE_PHASES 与默认配置字面量双信源（CLI 有 phases 显式差异检测、transitions 无）；守卫模式不齐 |
| 文档-实现 | 抽查 12 处：10 处一致；2 处不符（flow-manager.ts:1061 "--force 仅降级警告" 无此参数；instruction-loader "复用"实为复制）；manual 对照大体一致 |
| 边界与健壮性 | 缺 meta/revision/current 有守卫 ✓；缺 ops 双崩溃点（T3 复现，repair 可自救）；锁无嵌套死锁路径；removeStage 事务顺序 ✓ |
| 安全面 | REV 不可被 --force 绕过（CLI+core 双拦截）✓；restoreCheckpoint 防穿越 ✓；autoCommitOnDone shell 拼接为注入面（N20，利用链需 CLI 配合） |
| 过度设计 | artifact-graph 6 文件有真实消费方（instructions.ts），不判过度设计；死代码 3 处（flowInitialized / canAdvance / testEnabled 分支）+ 重复逻辑 2 处 |

## 发现统计

- **blocking=true：0 条**
- non-blocking / 建议：**17 条（N1~N18 + N20，无 N19 编号空缺）**
  - high：N1（current.op 悬空，实测复现）、N2（缺 ops TypeError，实测复现）
  - medium：N3（merge indexOf）、N4（fuzzy 后缀）、N5（yaml transitions 缺组合键）、N6（里程碑丢字段，实测复现）、N20（git 命令拼接）
  - low：N7~N18
- 观察项：O1~O5（序列化重复、NNN 无锁、git add -A 范围、manual "自愈" 声明、dist 同步）
- **待实测**：N18 的 `node_modules/openfeel/schemas/` 布局是否随 npm pack 发布——归 U7 的 pack 内容核对（原因：涉及 npm files 清单，超出 U1 只读审查范围）。

## 实测记录（命令 + 版本 + 环境）

```
node -v                       # v24.18.1
git log --oneline -1          # 20670b8 chore: 阶段归档 v1.1.2-stage-48
rg -n "仅降级警告" dist/core/flow-manager.js   # dist 与 src 同步性抽查
node .openfeel/tmp/u1-review-test.mjs          # 隔离 fixture 实测（HOME/USERPROFILE 重定向）
# T1 FAIL（复现悬空） T2 'ing'→plan_pending（复现过度修正）
# T3 FAIL（复现 TypeError） T4 FAIL（复现 paused 覆盖）
# T5 PASS（REV 拦截）   T6 FAIL（复现字段丢失） T7 PASS（全量 done）
rg -c "execution_mode: auto|auto_advance: enabled|test_enabled: true" .openfeel/config.yaml   # 前后均 =3
```

## U5/U8 交叉引用

- U5：flow-manager.test.ts 无「PIPELINE_PHASES ↔ 默认配置同步」「缺 ops 存量数据」断言，建议列入断言有效性核对。
- U8：fs/{atomic-write,file-lock,sequence}.ts 归 U8；本单元已交叉验证 atomic-write backup 语义与锁调用面（无嵌套死锁）。

## 覆盖度自评

18/18 文件全量通读（含 3111 行 flow-manager.ts 分段精读）；六维度均 ≥1 条独立取证，正确性/边界各 ≥3 条；实测 7 项（4 复现 + 2 通过 + 1 摘要复现）。局限：CLI 全入口校验核对交 U2、fs 实现深审交 U8、npm pack 交 U7、未跑全量 npm test（串行门控，以隔离实测替代）。全程未改源码；config.yaml 三值前后一致；未触碰真实全局目录。
