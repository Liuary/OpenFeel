import { findSimilarEntries, shouldUpdate } from '../../src/utils/kb-dedup.ts';

// 条目1：版本号重映射边界判定
const entry1 = `项目级版本号重映射（如 v5.X → v0.X.Y 体系）时，需区分目录名与版本号引用：plan/v5/ 系列子目录名作为组织单位保留原名；flow.json stageId、索引文本、plan.md 标题、kb/index.md 条目中的版本号引用则需统一重映射。以 v0.5.11-stage-01 为例，plan/v5/ 系列目录名保持不变，但 flow.json 中 25 个 stageId、plan_index.md 中所有版本号文本、各 plan.md 标题均从 vX.X 重映射为 v0.X.X。`;

// 条目3：kb 条目与规则升级同步时点
const entry3 = `规则升级在 exec 阶段由 Executor 实施，但 kb/ 知识库条目同步更新在归档阶段由 Archiver 执行。两个阶段存在时间差，审查时需识别待归档同步的 kb 条目，避免将尚未同步的 kb 条目误判为执行缺陷。Archiver 归档时应遵循审查建议更新对应 kb 条目。见于 v0.5.11-stage-01 审查 REV-002。`;

console.log("=== 条目1: 版本号重映射边界判定 ===");
const r1 = findSimilarEntries(entry1, 'patterns');
console.log(JSON.stringify(r1.map(r => ({ title: r.entry.title, sim: r.similarity.toFixed(3), update: shouldUpdate(r.similarity) })), null, 2));

console.log("\n=== 条目3: kb 条目与规则升级同步时点 ===");
const r3 = findSimilarEntries(entry3, 'patterns');
console.log(JSON.stringify(r3.map(r => ({ title: r.entry.title, sim: r.similarity.toFixed(3), update: shouldUpdate(r.similarity) })), null, 2));
