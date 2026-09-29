// 收尾脚本：更新 code_review/index.md（状态行 + 统计重算 + REV-49-004 新行）与 log.md（追加摘要）
const fs = require('fs');

// ── index.md ──
const pi = '.openfeel/users/Liuary/code_review/index.md';
let idx = fs.readFileSync(pi, 'utf8');

// 1) stage-48 表 7 行与 stage-49 表 3 行 pending→closed（按文件列锚定，避免误伤 stage-44 的 REV-003）
idx = idx.replace(/\| pending \| (true \| \[REV-v1\.1\.2-stage-48\.md\]|false \| \[REV-v1\.1\.2-stage-48\.md\])/g, '| closed | $1');
idx = idx.replace(/\| pending \| (true \| \[REV-v1\.1\.2-stage-49\.md\]|false \| \[REV-v1\.1\.2-stage-49\.md\])/g, '| closed | $1');
// 2) stage-44 REV-001/002 行 closed（REV-003 保持 pending，按行内容区分：REV-001 含「三点补强」、REV-002 含「依赖描述未同步」）
idx = idx.replace(/(\| REV-001 \| op-003 文档化内容的三点补强[^\n]*?)\| pending \|/, '$1| closed |');
idx = idx.replace(/(\| REV-002 \| \[跨阶段\] stage-43[^\n]*?)\| pending \|/, '$1| closed |');

// 3) stage-49 表追加 REV-004 行（插在 stage-49 节最后一行 REV-003 之后）
const r3anchor = '| REV-003 | 缺单单元深度预算';
const r3pos = idx.indexOf(r3anchor);
if (r3pos < 0) throw new Error('REV-49-003 row not found');
const r3lineEnd = idx.indexOf('\n', r3pos) + 1;
const rev4row = '| REV-004 | 修订残留：覆盖矩阵 4 文件漏网 / R7 op 编号 / overview 7→8 未同步 | low | pending | false | [REV-v1.1.2-stage-49.md](REV-v1.1.2-stage-49.md) |\n';
idx = idx.slice(0, r3lineEnd) + rev4row + idx.slice(r3lineEnd);

// 4) 统计重算（按表行实际状态计数）
const counts = { pending: 0, fixing: 0, resolved: 0, closed: 0 };
for (const m of idx.matchAll(/\| (pending|fixing|resolved|closed) \| (?:true|false) \| \[/g)) counts[m[1]]++;
idx = idx.replace(/\| pending \| \d+ \|.*/, '| pending | ' + counts.pending + ' |');
idx = idx.replace(/\| fixing \| \d+ \|.*/, '| fixing | ' + counts.fixing + ' |');
idx = idx.replace(/\| resolved \| \d+ \|.*/, '| resolved | ' + counts.resolved + ' |');
idx = idx.replace(/\| closed \| \d+ \|.*/, '| closed | ' + counts.closed + ' |');
fs.writeFileSync(pi, idx, 'utf8');
console.log('index.md stats:', JSON.stringify(counts));

// ── log.md ──
const pl = '.openfeel/users/Liuary/code_review/log.md';
let lg = fs.readFileSync(pl, 'utf8');
const anchor = '|------|------|------|';
const p = lg.indexOf(anchor);
if (p < 0) throw new Error('log.md anchor not found');
const ins = lg.indexOf('\n', p) + 1;
const rows =
  '| 2026-09-29 21:50 | REV-v1.1.2-stage-48.md | 验收：7 条 REV 全部 closed（planner 修订逐项落实：13 项编号清单 / 末段匹配实测 0 vs 455 / 基线 694 / 双 job 断言 / H12 / 全仓扫描 / parseError 定案）→ plan_review 通过 |\n' +
  '| 2026-09-29 21:50 | REV-v1.1.2-stage-49.md | 验收：REV-001~003 closed（U8 九条必查项 + 覆盖矩阵 + op-009 登记 + 分层两轮）；新登记 REV-004（low：矩阵 4 文件漏网 / R7 编号 / overview 7→8）→ plan_review 通过 |\n' +
  '| 2026-09-29 21:50 | REV-v1.1.2-stage-44.md | 状态行收尾：REV-001/002 滞后状态行同步 closed（既有验收记录独立复核属实）；REV-003 保持 pending（措辞项已纳入 stage-48 op-004 ②，待修复后关闭） |\n' +
  '| 2026-09-29 21:50 | REV-v1.1.2-stage-46.md | 状态行收尾：REV-007 滞后状态行同步 closed（既有验收记录独立复核属实） |\n';
lg = lg.slice(0, ins) + rows + lg.slice(ins);
fs.writeFileSync(pl, lg, 'utf8');
console.log('log.md updated: 4 rows appended');
