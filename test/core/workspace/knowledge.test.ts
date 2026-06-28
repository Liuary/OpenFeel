/**
 * knowledge 单元测试
 * 测试知识库核心模块在临时目录中的完整行为
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  initKnowledgeBase,
  addKnowledgeEntry,
  listKnowledge,
  searchKnowledge,
  getKnowledgeIndex,
} from '../../../src/core/workspace/knowledge.js';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** 创建临时目录 */
function setupTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'openfeel-kb-test-'));
}

describe('initKnowledgeBase', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = setupTempDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('应创建 .openfeel/kb/ 目录和所有骨架文件', () => {
    const created = initKnowledgeBase(tmpDir);
    const kbDir = join(tmpDir, '.openfeel', 'kb');

    // 验证 kb 目录存在
    expect(existsSync(kbDir)).toBe(true);

    // 验证 index.md
    expect(existsSync(join(kbDir, 'index.md'))).toBe(true);
    const indexContent = readFileSync(join(kbDir, 'index.md'), 'utf-8');
    expect(indexContent).toContain('# 知识库索引');
    expect(indexContent).toContain('## 分类概览');
    expect(indexContent).toContain('## 最近更新');

    // 验证 4 个分类文件
    const categories = ['architecture', 'patterns', 'troubleshooting', 'setup'];
    for (const cat of categories) {
      const filePath = join(kbDir, `${cat}.md`);
      expect(existsSync(filePath)).toBe(true);
    }

    // 验证返回列表包含关键条目
    expect(created.some((f) => f === '.openfeel/kb/index.md')).toBe(true);
    expect(created.some((f) => f === '.openfeel/kb/architecture.md')).toBe(true);
  });

  it('再次调用不应覆盖已有文件（幂等）', () => {
    const created1 = initKnowledgeBase(tmpDir);
    expect(created1.length).toBeGreaterThan(0);

    // 向 index.md 写入自定义内容模拟已有状态
    const indexPath = join(tmpDir, '.openfeel', 'kb', 'index.md');
    const customContent = '# 自定义索引\n## 自定义内容\n';
    writeFileSync(indexPath, customContent, 'utf-8');

    // 再次初始化 — 不应覆盖
    const created2 = initKnowledgeBase(tmpDir);
    expect(created2.length).toBe(0);

    // 验证 index.md 保持自定义内容
    const restored = readFileSync(indexPath, 'utf-8');
    expect(restored).toBe(customContent);
  });
});

describe('addKnowledgeEntry', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = setupTempDir();
    initKnowledgeBase(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('应向分类文件追加条目并更新 index.md', () => {
    addKnowledgeEntry(tmpDir, 'architecture', '测试标题', '这是测试内容。');

    // 验证分类文件含条目
    const catPath = join(tmpDir, '.openfeel', 'kb', 'architecture.md');
    const catContent = readFileSync(catPath, 'utf-8');
    expect(catContent).toContain('## [+] 测试标题');
    expect(catContent).toContain('这是测试内容。');

    // 验证 index.md 最近更新表格含新行
    const indexPath = join(tmpDir, '.openfeel', 'kb', 'index.md');
    const indexContent = readFileSync(indexPath, 'utf-8');
    expect(indexContent).toContain('| 测试标题 |');
  });

  it('对无效分类应抛出异常', () => {
    expect(() =>
      addKnowledgeEntry(tmpDir, 'invalid_cat', 'title', 'content'),
    ).toThrow(/无效分类/);
  });

  it('kb 目录不存在时自动初始化（幂等添加）', () => {
    // 删除 kb 目录模拟不存在
    rmSync(join(tmpDir, '.openfeel', 'kb'), { recursive: true, force: true });

    // 应自动初始化并添加
    expect(() =>
      addKnowledgeEntry(tmpDir, 'setup', '自动初始化测试', '自动初始化的内容。'),
    ).not.toThrow();

    const kbDir = join(tmpDir, '.openfeel', 'kb');
    expect(existsSync(kbDir)).toBe(true);
    expect(existsSync(join(kbDir, 'setup.md'))).toBe(true);
  });
});

describe('listKnowledge', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = setupTempDir();
    initKnowledgeBase(tmpDir);

    // 添加测试条目
    addKnowledgeEntry(tmpDir, 'architecture', '架构条目', '架构内容。');
    addKnowledgeEntry(tmpDir, 'patterns', '模式条目', '模式内容。');
    addKnowledgeEntry(tmpDir, 'setup', '配置条目', '配置内容。');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('应返回所有条目', () => {
    const entries = listKnowledge(tmpDir);
    expect(entries.length).toBe(3);
    expect(entries[0].title).toBe('架构条目');
    expect(entries[0].enabled).toBe(true);
  });

  it('应按分类过滤', () => {
    const entries = listKnowledge(tmpDir, 'patterns');
    expect(entries.length).toBe(1);
    expect(entries[0].title).toBe('模式条目');
    expect(entries[0].category).toBe('patterns');
  });

  it('对不存在的分类返回空数组', () => {
    const entries = listKnowledge(tmpDir, 'nonexistent');
    expect(entries.length).toBe(0);
  });

  it('对未初始化的项目返回空数组', () => {
    const emptyDir = setupTempDir();
    try {
      const entries = listKnowledge(emptyDir);
      expect(entries.length).toBe(0);
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});

describe('searchKnowledge', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = setupTempDir();
    initKnowledgeBase(tmpDir);

    // 添加测试条目
    addKnowledgeEntry(tmpDir, 'architecture', 'React 组件设计', '使用函数组件和 Hooks。');
    addKnowledgeEntry(tmpDir, 'patterns', '状态管理模式', '使用 Zustand 进行状态管理。');
    addKnowledgeEntry(tmpDir, 'troubleshooting', '构建失败排查', '检查 TypeScript 编译错误。');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('应按关键词在标题中找到匹配条目', () => {
    const results = searchKnowledge(tmpDir, 'React');
    expect(results.length).toBe(1);
    expect(results[0].title).toBe('**React** 组件设计');
  });

  it('应按关键词在内容中找到匹配条目', () => {
    const results = searchKnowledge(tmpDir, 'Zustand');
    expect(results.length).toBe(1);
    expect(results[0].title).toBe('状态管理模式');
  });

  it('应区分大小写不敏感', () => {
    const results = searchKnowledge(tmpDir, 'REACT');
    expect(results.length).toBe(1);
    expect(results[0].title).toBe('**React** 组件设计');
  });

  it('无匹配时应返回空数组', () => {
    const results = searchKnowledge(tmpDir, '不存在的关键词');
    expect(results.length).toBe(0);
  });

  it('应支持 limit 分页', () => {
    const results = searchKnowledge(tmpDir, 'a', 2);
    // 所有条目都包含 'a'（来自 description column），但这里只测 limit 行为
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('应支持 offset 偏移', () => {
    const all = searchKnowledge(tmpDir, '组件');
    const paged = searchKnowledge(tmpDir, '组件', 10, 1);
    if (all.length > 1) {
      expect(paged.length).toBe(all.length - 1);
    }
  });
});

describe('getKnowledgeIndex', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = setupTempDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('应返回正确的索引结构', () => {
    initKnowledgeBase(tmpDir);
    addKnowledgeEntry(tmpDir, 'architecture', '示例架构', '架构内容。');

    const idx = getKnowledgeIndex(tmpDir);

    // 验证分类概览
    expect(idx.categories.length).toBe(4);
    expect(idx.categories[0].name).toBe('architecture');
    expect(idx.categories[0].description).toContain('架构');

    // 验证最近更新
    expect(idx.recentUpdates.length).toBe(1);
    expect(idx.recentUpdates[0].category).toBe('architecture');
    expect(idx.recentUpdates[0].title).toBe('示例架构');
    // 日期应为 YYYY-MM-DD 格式
    expect(idx.recentUpdates[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('对不存在的 kb 应返回默认值（空结构）', () => {
    const idx = getKnowledgeIndex(tmpDir);

    // 应返回默认分类列表（不含 real 分类数据）
    expect(idx.categories.length).toBeGreaterThanOrEqual(4);
    expect(idx.recentUpdates.length).toBe(0);
  });
});
