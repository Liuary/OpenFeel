// 一次性验收脚本：将 REV-v1.1.2-stage-48/49 条目状态 pending→closed 并追加验收记录
const fs = require('fs');

function closeEntry(content, id, verdictLine) {
  // 定位条目段
  const start = content.indexOf('## ' + id + ':');
  if (start < 0) throw new Error('section not found: ' + id);
  let end = content.indexOf('\n## ', start + 1);
  if (end < 0) end = content.length;
  let seg = content.slice(start, end);
  // 状态行替换（段内首个 pending）
  const stateMarker = '- **状态**：pending';
  const si = seg.indexOf(stateMarker);
  if (si < 0) throw new Error('state line not found in ' + id);
  seg = seg.slice(0, si) + '- **状态**：closed' + seg.slice(si + stateMarker.length);
  // 验收表追加行
  const tblHead = '| 时间 | 验收人 | 结论 | 备注 |\n|------|--------|------|------|\n';
  const ti = seg.indexOf(tblHead);
  if (ti < 0) throw new Error('verdict table not found in ' + id);
  const insertAt = ti + tblHead.length;
  seg = seg.slice(0, insertAt) + verdictLine + '\n' + seg.slice(insertAt);
  return content.slice(0, start) + seg + content.slice(end);
}

// ── stage-48：7 条全部 closed ──
const p48 = '.openfeel/users/Liuary/code_review/REV-v1.1.2-stage-48.md';
let s48 = fs.readFileSync(p48, 'utf8');
const v48 = {
  'REV-001': '| 2026-09-29 21:50 | openfeel-reviewer（验收会话） | 通过，closed | 修订版 §一新增「遗留问题编号清单」13 项全点名（#9=执行口径统一→op-003①、#10=CI 版本门禁→op-003③、#11=测试补 mock→op-002①、#12=CI hash 守卫→op-002②）；覆盖核对「13/13 有归属」与 op 清单逐项一致；§八.4 已改引用该表 |',
  'REV-002': '| 2026-09-29 21:50 | openfeel-reviewer（验收会话） | 通过，closed | op-006 已改末段匹配并禁用字面前缀（含原因）；只读实测真实 config.json：startsWith 0 命中 vs 末段匹配 455 命中、0 遗漏；断言删除数===455 + projects 剩余===0 + 四步保护不可省——方案与真实键形态吻合 |',
  'REV-003': '| 2026-09-29 21:50 | openfeel-reviewer（验收会话） | 通过，closed | op-007 ③ 与 §八.5 基线均已更正为 41 文件 / 694 用例（与 roadmap 收官摘要及本轮 npm test 实测一致） |',
  'REV-004': '| 2026-09-29 21:50 | openfeel-reviewer（验收会话） | 通过，closed | op-003 ③ 明确两个 job 各一处断言（build-and-test：npm run build 后；publish：npm run build 之后、npm publish 之前） |',
  'REV-005': '| 2026-09-29 21:50 | openfeel-reviewer（验收会话） | 通过，closed | 新增 H12 裁定；op-001 ②（feel.md 健康探测末尾一句）+ ③（manual「可疑会话产出的处置」新节）落点明确；§八.6 完成标准同步 |',
  'REV-006': '| 2026-09-29 21:50 | openfeel-reviewer（验收会话） | 通过，closed | op-003 ① 改全仓扫描式口径并给出 rg 扫描命令（kb 历史条目与归档除外）；补「根 AGENTS.md 无受管区、手工维护，不涉 build」说明 |',
  'REV-007': '| 2026-09-29 21:50 | openfeel-reviewer（验收会话） | 通过，closed | op-005 ② 定案 parseError + 跳过写回 + console.warn，不引入 config.ts→update-infos.ts 依赖边；与 writeProfile 既有 2 个调用点（config.ts:261 内部、commands/config.ts:197）核实无冲突。实现注意（不阻塞）：顶层 ProfileSchema.passthrough() 会把 parseError 透传进 validated（commands/config.ts:196），序列化前应 strip 该字段，否则 config set 显式写回场景会将 parseError 键写入 profile.yaml（写出即合法修复态，无功能危害） |',
};
for (const [id, line] of Object.entries(v48)) s48 = closeEntry(s48, id, line);
fs.writeFileSync(p48, s48, 'utf8');
console.log('stage-48 REV: 7 entries -> closed');

// ── stage-49：REV-001/002/003 closed + 新增 REV-004 ──
const p49 = '.openfeel/users/Liuary/code_review/REV-v1.1.2-stage-49.md';
let s49 = fs.readFileSync(p49, 'utf8');
const v49 = {
  'REV-001': '| 2026-09-29 21:50 | openfeel-reviewer（验收会话） | 通过，closed | U8「部署与更新链路」新增（9 条必查项）+ U5/U8 边界（横切 vs 纵切）+ 覆盖矩阵 + op 扩为 001~008 单元 + 009 汇总——部署链路归属诉求达成。独立核对 src 全 59 个 .ts：55 个已归属；残留 4 个小文件未点名（cli/repl.ts、src/index.ts、utils/kb-dedup.ts、utils/path.ts）与 §七 R7 op 编号残留不构成结构性审查盲区 → 转 REV-004 跟踪 |',
  'REV-002': '| 2026-09-29 21:50 | openfeel-reviewer（验收会话） | 通过，closed | §二新增「产出与登记」节：op-009 ③ 将 8 个单元 REV 路径登记 code_review/index.md（审计链一跳可达）+ 汇总索引含文件级跳转；R6/影响文件清单措辞已更正「项目公共临时目录」 |',
  'REV-003': '| 2026-09-29 21:50 | openfeel-reviewer（验收会话） | 通过，closed | §三「分层深度策略」先广度后深挖两轮 + §八顺序图两轮呈现（第一轮 op-001~008 并行 → 第二轮 op-009 对 blocking 补齐证据链）+ R2 缓解同步 |',
};
for (const [id, line] of Object.entries(v49)) s49 = closeEntry(s49, id, line);

// 追加 REV-004（新发现残留，pending）
const rev4 = [
  '---',
  '',
  '## REV-004: 修订残留三处——覆盖矩阵 4 文件漏网 / R7 op 编号 / overview 未同步',
  '- **状态**：pending',
  '- **优先级**：low',
  '- **提出人**：openfeel-reviewer（验收会话）',
  '- **提出时间**：2026-09-29 21:50',
  '- **blocking**：false',
  '',
  '### 问题描述',
  '',
  '修订版验收中独立核实的三处残留（均不阻塞）：',
  '',
  '1. **覆盖矩阵 4 文件未点名**：`Get-ChildItem src -Recurse -Filter *.ts` 实测共 59 个 .ts，矩阵归属 55 个，漏网：`src/cli/repl.ts`（2.6KB REPL 交互，建议归 U2）、`src/index.ts`（0.2KB 占位 `export {}`，建议归 U2 附带确认）、`src/utils/kb-dedup.ts`（6.3KB 归档去重，建议归 U1 与 archive/merge.ts 同链路）、`src/utils/path.ts`（1.3KB fileURLToPath 转换，建议归 U8 与 fs/** 同类基础设施）。矩阵「MECE 自检：每个 src/** 文件恰属一个单元」声明与事实不符，须补 4 行归属或更正自检措辞。',
  '2. **§七 R7 缓解列仍写「op-008 显式允许新增修复 op」**：汇总裁定 op 已改为 op-009（§四 op-009 ⑤ 正确），R7 编号残留可能误导执行者到 U8 审查单元找修复流转授权。',
  '3. **`stage-49/overview.md` 仍写「按 7 个领域分区」**：未随 U8 新增同步为 8 单元（rg "U8" 在 overview 零命中）。',
  '',
  '### 处理记录',
  '',
  '| 时间 | 操作者 | 说明 | Commit |',
  '|------|--------|------|--------|',
  '',
  '### 验收记录',
  '',
  '| 时间 | 验收人 | 结论 | 备注 |',
  '|------|--------|------|------|',
  '',
].join('\n');
s49 = s49.replace(/\n*$/, '\n\n') + rev4;
fs.writeFileSync(p49, s49, 'utf8');
console.log('stage-49 REV: 3 entries -> closed, REV-004 added (pending)');
