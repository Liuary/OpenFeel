// 一次性收尾脚本：同步 REV-44 REV-001/002 与 REV-46 REV-007 滞后状态行（验收记录已 closed，仅状态行 pending）
const fs = require('fs');

function syncStatusLine(file, lineNo, expectPrefix, verdictRowAfterLine) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const idx = lineNo - 1;
  if (!lines[idx].startsWith(expectPrefix)) {
    throw new Error(file + ':' + lineNo + ' content drift: ' + lines[idx]);
  }
  lines[idx] = lines[idx].replace('pending', 'closed');
  // 验收表追加同步记录行
  if (verdictRowAfterLine) {
    const vIdx = verdictRowAfterLine - 1;
    if (!lines[vIdx].startsWith('| 2026-09-29')) {
      throw new Error(file + ':' + verdictRowAfterLine + ' not a verdict row: ' + lines[vIdx]);
    }
    lines.splice(vIdx + 1, 0,
      '| 2026-09-29 21:50 | openfeel-reviewer（本轮收尾会话） | 通过，closed | 状态行同步：既有验收「通过，closed」结论经本轮独立复核属实（处理记录闭环完整），滞后状态行由审查官补同步 |');
  }
  fs.writeFileSync(file, lines.join('\n'), 'utf8');
  console.log('synced ' + file + ' line ' + lineNo);
}

const p44 = '.openfeel/users/Liuary/code_review/REV-v1.1.2-stage-44.md';
// REV-001（:58）已在上次运行同步；本次仅执行剩余两步
// 上次插入 1 行验收记录 → REV-002 段行号 +1
syncStatusLine(p44, 89, '- **状态**：pending', 111);  // REV-002
// REV-003（:210）保持 pending——措辞项已纳入 stage-48 op-004 ②，待修复后随验收关闭

const p46 = '.openfeel/users/Liuary/code_review/REV-v1.1.2-stage-46.md';
syncStatusLine(p46, 280, '- **状态**：pending', 303); // REV-007

// 校验：REV-44 剩余 pending 应仅 :210（行号 +2 因两次插入）= 212
const check = fs.readFileSync(p44, 'utf8').split(/\r?\n/);
const pendings = [];
for (const [i, s] of check.entries()) if (s.startsWith('- **状态**：pending')) pendings.push(i + 1);
console.log('REV-44 remaining pending state lines:', pendings.join(',') || '(none)');
