/**
 * op-003 自测脚本：验证 kb-dedup 模块的各项功能。
 * 直接调用函数并输出通过/失败结果。
 */
import { findSimilarEntries, shouldUpdate, mergeEntry } from '../../src/utils/kb-dedup.js';

let passed = 0;
let failed = 0;

/** 测试辅助：断言并输出结果 */
function assert(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ ${label} ${detail ? `(${detail})` : ''}`);
    failed++;
  }
}

// ---- 自测 3: Jaccard = 1.0（完全相同文本）----
{
  const results1 = findSimilarEntries(
    'Phase Zod enum 硬化模式：将动态 string 类型的 Phase 字段硬化为 Zod enum',
    'patterns'
  );
  // patterns.md 中包含此条目的类似内容
  console.log('自测2: 已知相似条目可检索到');
  assert('至少找到一个相似条目', results1.length > 0);
  if (results1.length > 0) {
    console.log(`  最高相似度: ${results1[0].similarity.toFixed(4)}, 匹配条目: "${results1[0].entry.title}"`);
  }
}

// ---- 自测4: shouldUpdate 0.81 → true ----
{
  console.log('\n自测4: shouldUpdate 阈值判断');
  assert('相似度 0.81 → true', shouldUpdate(0.81) === true);
  assert('相似度 0.79 → false', shouldUpdate(0.79) === false);
  assert('相似度 0.80 → false（不大于 0.8）', shouldUpdate(0.80) === false);
  assert('相似度 0.0 → false', shouldUpdate(0.0) === false);
  assert('相似度 1.0 → true', shouldUpdate(1.0) === true);
}

// ---- 自测5: mergeEntry 保留 [+] 标记和日期 ----
{
  console.log('\n自测5: mergeEntry 保留原标记和日期');
  const existing = {
    title: '测试条目',
    date: '2026-01-01',
    status: '+' as const,
    content: '原始正文内容',
    rawLine: '## [+] 测试条目 (2026-01-01)',
  };
  const merged = mergeEntry(existing, '新增的合并内容');
  assert('保留原始日期', merged.date === '2026-01-01');
  assert('保留 [+] 标记', merged.status === '+');
  assert('保留 rawLine', merged.rawLine === '## [+] 测试条目 (2026-01-01)');
  assert('原内容保留', merged.content.includes('原始正文内容'));
  assert('新内容已追加', merged.content.includes('新增的合并内容'));
  assert('包含更新于标记', merged.content.includes('更新于'));
  console.log(`  合并后内容:\n${merged.content}`);
}

// ---- 自测6: 完全相同内容不产生无意义追加 ----
{
  console.log('\n自测6: 内容一致时不追加');
  const existing = {
    title: '测试',
    date: '2026-01-01',
    status: '+' as const,
    content: '相同的正文',
    rawLine: '## [+] 测试 (2026-01-01)',
  };
  const merged = mergeEntry(existing, '相同的正文');
  assert('内容不变', merged.content === '相同的正文');
}

// ---- 自测：边界条件 ----
{
  console.log('\n自测: 边界条件');
  // 不存在的分类
  const results = findSimilarEntries('test content', 'nonexistent');
  assert('不存在的分类返回空数组', results.length === 0);

  // 空内容检索
  const resultsEmpty = findSimilarEntries('', 'patterns');
  // 空内容可能匹配不到
  console.log(`  空内容在 patterns 中匹配数: ${resultsEmpty.length}`);
}

// ---- 自测: 完全不同内容的相似度 ----
{
  console.log('\n自测3: 完全不同文本相似度接近 0');
  // 用明显不同的内容检索
  const results = findSimilarEntries(
    'abcdefg hijklmn opqrst uvwxyz 1234567890',
    'patterns'
  );
  const maxSim = results.length > 0 ? Math.max(...results.map(r => r.similarity)) : 0;
  assert('完全不同文本最高相似度 < 0.3', maxSim < 0.3, `实际=${maxSim.toFixed(4)}`);
}

// ---- 结果汇总 ----
console.log(`\n${'='.repeat(40)}`);
console.log(`通过: ${passed}, 失败: ${failed}`);
if (failed > 0) {
  console.log('❌ 存在失败项，需修复');
  process.exit(1);
} else {
  console.log('✅ 全部自测通过');
}
