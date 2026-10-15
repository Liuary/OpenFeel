/**
 * managed-region 单元测试
 * 覆盖四策略原语：detectFileType 分派、parseRegion 四态、
 * wrapRegion/replaceRegion 区外保留与幂等、frontmatter 拆分/合并/序列化。
 * 纯函数测试，不依赖 homedir。
 */
import { describe, it, expect } from 'vitest';
import {
  detectFileType,
  normalize,
  parseRegion,
  hasRegion,
  extractRegion,
  wrapRegion,
  replaceRegion,
  splitFrontmatter,
  mergeFrontmatter,
  serializeFrontmatter,
} from '../../src/core/managed-region.js';

const MD_BEGIN = '<!-- openfeel:begin -->';
const MD_END = '<!-- openfeel:end -->';
const GI_BEGIN = '# openfeel:begin';
const GI_END = '# openfeel:end';

describe('detectFileType', () => {
  it('.gitignore → gitignore（含各类路径分隔符）', () => {
    expect(detectFileType('.gitignore')).toBe('gitignore');
    expect(detectFileType('project/.gitignore')).toBe('gitignore');
    expect(detectFileType('C:\\proj\\.gitignore')).toBe('gitignore');
  });

  it('opencode.jsonc → jsonc', () => {
    expect(detectFileType('opencode.jsonc')).toBe('jsonc');
    expect(detectFileType('~/.config/opencode/opencode.jsonc')).toBe('jsonc');
  });

  it('feel.md / AGENTS.md → markdown', () => {
    expect(detectFileType('feel.md')).toBe('markdown');
    expect(detectFileType('AGENTS.md')).toBe('markdown');
    expect(detectFileType('a/b/c/SKILL.md')).toBe('markdown');
  });

  it('.txt → null（无法识别）', () => {
    expect(detectFileType('notes.txt')).toBeNull();
    expect(detectFileType('noext')).toBeNull();
  });
});

describe('parseRegion / hasRegion / extractRegion', () => {
  it('无标记正文 → none / false / null', () => {
    const text = '# 标题\n\n普通内容\n';
    expect(parseRegion(text, 'markdown').status).toBe('none');
    expect(hasRegion(text, 'markdown')).toBe(false);
    expect(extractRegion(text, 'markdown')).toBeNull();
  });

  it('单对完整标记 → ok / true / 提取区内正文（trim）', () => {
    const text = `前文\n${MD_BEGIN}\n  内容 A  \n内容 B\n${MD_END}\n后文\n`;
    expect(parseRegion(text, 'markdown').status).toBe('ok');
    expect(hasRegion(text, 'markdown')).toBe(true);
    expect(extractRegion(text, 'markdown')).toBe('内容 A  \n内容 B');
  });

  it('begin 无 end → malformed', () => {
    expect(parseRegion(`${MD_BEGIN}\n内容\n`, 'markdown').status).toBe('malformed');
  });

  it('end 无 begin → malformed', () => {
    expect(parseRegion(`内容\n${MD_END}\n`, 'markdown').status).toBe('malformed');
  });

  it('两对 begin/end → malformed（REV-908）', () => {
    const text = `${MD_BEGIN}\na\n${MD_END}\n${MD_BEGIN}\nb\n${MD_END}\n`;
    expect(parseRegion(text, 'markdown').status).toBe('malformed');
  });

  it('end 在 begin 之前 → malformed', () => {
    const text = `${MD_END}\n内容\n${MD_BEGIN}\n`;
    expect(parseRegion(text, 'markdown').status).toBe('malformed');
  });

  it('不误匹配 openfeel:generated 单行信号（N6）', () => {
    const text = '<!-- openfeel:generated — 本文件由 npm run build 生成，请勿手工编辑 -->\n# 内容\n';
    expect(parseRegion(text, 'markdown').status).toBe('none');
  });

  it('CRLF 文件与 LF 文件解析结果一致（行尾归一化）', () => {
    const lf = `前\n${MD_BEGIN}\n内容\n${MD_END}\n后\n`;
    const crlf = lf.replace(/\n/g, '\r\n');
    expect(parseRegion(crlf, 'markdown').status).toBe('ok');
    expect(extractRegion(crlf, 'markdown')).toBe(extractRegion(lf, 'markdown'));
  });

  it('gitignore 类型使用 # 标记 token', () => {
    const text = `node_modules\n${GI_BEGIN}\ndist\n${GI_END}\n`;
    expect(parseRegion(text, 'gitignore').status).toBe('ok');
    expect(extractRegion(text, 'gitignore')).toBe('dist');
    // markdown 标记不匹配 gitignore token
    expect(parseRegion(text, 'markdown').status).toBe('none');
  });
});

describe('wrapRegion / replaceRegion', () => {
  it('wrapRegion markdown 输出格式正确（正文 trim + 末尾换行）', () => {
    expect(wrapRegion('  正文  ', 'markdown')).toBe(`${MD_BEGIN}\n正文\n${MD_END}\n`);
  });

  it('wrapRegion gitignore 输出格式正确', () => {
    expect(wrapRegion('dist\n', 'gitignore')).toBe(`${GI_BEGIN}\ndist\n${GI_END}\n`);
  });

  it('replaceRegion 区外逐字符保留、区内替换', () => {
    const existing = `# 用户头部\n\n用户自定义段落\n${MD_BEGIN}\n旧框架内容\n${MD_END}\n\n用户尾部\n`;
    const out = replaceRegion(existing, '新框架内容', 'markdown');
    expect(out.startsWith('# 用户头部\n\n用户自定义段落\n')).toBe(true);
    expect(out).toContain(`${MD_BEGIN}\n新框架内容\n${MD_END}`);
    expect(out.endsWith('\n\n用户尾部\n')).toBe(true);
  });

  it('replaceRegion round-trip 幂等（extractRegion 结果回写 = 归一化原文）', () => {
    const existing = `前文\n${MD_BEGIN}\n内容 A\n内容 B\n${MD_END}\n后文\n`;
    const out = replaceRegion(existing, extractRegion(existing, 'markdown') ?? '', 'markdown');
    expect(out).toBe(normalize(existing));
  });

  it('replaceRegion 无区外前后缀时 round-trip 幂等', () => {
    const existing = `${MD_BEGIN}\n仅区内\n${MD_END}\n`;
    const out = replaceRegion(existing, extractRegion(existing, 'markdown') ?? '', 'markdown');
    expect(out).toBe(normalize(existing));
  });

  it('replaceRegion 对 none 输入抛错（REV-1007 防误用）', () => {
    expect(() => replaceRegion('无标记正文\n', 'x', 'markdown')).toThrow();
  });

  it('replaceRegion 对 malformed 输入抛错（REV-1007 防误用）', () => {
    const malformed = `${MD_BEGIN}\na\n${MD_END}\n${MD_BEGIN}\nb\n${MD_END}\n`;
    expect(() => replaceRegion(malformed, 'x', 'markdown')).toThrow();
  });
});

describe('splitFrontmatter / mergeFrontmatter / serializeFrontmatter', () => {
  it('无 frontmatter 文件 → null', () => {
    expect(splitFrontmatter('# 标题\n\n正文\n')).toBeNull();
  });

  it('有 frontmatter → 正确拆出 { frontmatter, body }', () => {
    const content = `---\nname: demo\ndescription: 示例\n---\n\n# 正文\n`;
    const split = splitFrontmatter(content);
    expect(split).not.toBeNull();
    expect(split?.frontmatter).toEqual({ name: 'demo', description: '示例' });
    expect(split?.body).toBe('\n# 正文\n');
  });

  it('空 frontmatter（---\\n---\\n）→ 解析为空对象（REV-1005）', () => {
    const split = splitFrontmatter('---\n---\n正文\n');
    expect(split).not.toBeNull();
    expect(split?.frontmatter).toEqual({});
    expect(split?.body).toBe('正文\n');
  });

  it('YAML 语法错误 → null（降级不中断）', () => {
    expect(splitFrontmatter('---\nfoo: [unclosed\n---\n正文\n')).toBeNull();
  });

  it('mergeFrontmatter：incoming 覆盖同名字段、existing 独有字段保留', () => {
    const existing = { description: '旧', model: 'user/model', mode: 'primary' };
    const incoming = { description: '新', mode: 'subagent', color: '#fff' };
    expect(mergeFrontmatter(existing, incoming)).toEqual({
      description: '新',
      model: 'user/model',
      mode: 'subagent',
      color: '#fff',
    });
  });

  it('mergeFrontmatter：permission 嵌套对象整体覆盖（非深合并）', () => {
    const existing = { permission: { bash: 'deny', read: 'allow' } };
    const incoming = { permission: { bash: 'allow' } };
    expect(mergeFrontmatter(existing, incoming)).toEqual({ permission: { bash: 'allow' } });
  });

  it('mergeFrontmatter：preserveKeys 默认不传 = 现行为（第三参缺省零回归）', () => {
    const existing = { description: '旧', model: 'user/model' };
    const incoming = { description: '新', model: 'tpl/model' };
    // 不传第三参 → incoming 覆盖同名字段（与历史行为逐字一致）
    expect(mergeFrontmatter(existing, incoming)).toEqual({ description: '新', model: 'tpl/model' });
    // 显式传空数组 → 同上
    expect(mergeFrontmatter(existing, incoming, [])).toEqual({ description: '新', model: 'tpl/model' });
  });

  it('stage-94：preserveKeys 含 model 且 existing 有该键 → 保留用户值，其余键仍 incoming 覆盖', () => {
    const existing = { description: '旧', model: 'user/custom', extra: 'user-only' };
    const incoming = { description: '新', model: 'deepseek/deepseek-flash' };
    expect(mergeFrontmatter(existing, incoming, ['model'])).toEqual({
      description: '新',
      model: 'user/custom',
      extra: 'user-only',
    });
  });

  it('stage-94：preserveKeys 含 model 但 existing 无该键 → 取 incoming 模板值（「无则创建」）', () => {
    const existing = { description: '用户改过但无 model' };
    const incoming = { description: '模板描述', model: 'deepseek/deepseek-flash' };
    expect(mergeFrontmatter(existing, incoming, ['model'])).toEqual({
      description: '模板描述',
      model: 'deepseek/deepseek-flash',
    });
  });

  it('stage-94：白名单恰为 model 单键——同批传入的其它键不受保护（守护扩展口但不升维）', () => {
    const existing = { description: '用户描述', model: 'user/m' };
    const incoming = { description: '模板描述', model: 'tpl/m' };
    // 仅 model 入白名单 → description 仍被覆盖（R-94-3 阴性）
    expect(mergeFrontmatter(existing, incoming, ['model'])).toEqual({ description: '模板描述', model: 'user/m' });
    // 若把 description 也纳入 → 则被保护（证明白名单是「显式传入才生效」，非硬编码）
    expect(mergeFrontmatter(existing, incoming, ['model', 'description'])).toEqual({ description: '用户描述', model: 'user/m' });
  });

  it('stage-94：existing 的 model 为显式空值（null）→ 仍视为「存在」并保留（存在即保留口径）', () => {
    const existing = { model: null };
    const incoming = { model: 'deepseek/deepseek-flash' };
    expect(mergeFrontmatter(existing, incoming, ['model'])).toEqual({ model: null });
  });

  it('serializeFrontmatter 输出末尾换行正确（REV-1008）', () => {
    const out = serializeFrontmatter({ name: 'demo' });
    expect(out.startsWith('---\n')).toBe(true);
    expect(out.endsWith('\n---\n')).toBe(true);
  });

  it('serializeFrontmatter ↔ splitFrontmatter round-trip 字段一致', () => {
    const fm = { name: 'demo', mode: 'primary', color: '#8B5CF6', permission: { bash: 'allow' } };
    const serialized = serializeFrontmatter(fm);
    const split = splitFrontmatter(serialized);
    expect(split?.frontmatter).toEqual(fm);
  });
});
