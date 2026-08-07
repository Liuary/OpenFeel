/**
 * config 单元测试
 * 测试 readConfig 和 writeDefaultConfig 的 YAML 解析行为
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readConfig, writeDefaultConfig, readProfile, writeProfile, ensureProfileDefaults, getConfigValue, setConfigValue, type Profile } from '../../src/core/config.js';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// mock homedir：隔离 profile 读写，避免污染真实用户主目录
const mockHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

/** 构造测试用 Profile */
function makeTestProfile(): Profile {
  return {
    user: { name: 'TestUser', lang: 'zh-CN' },
    preferences: { auto_advance: 'enabled', review_mode: 'full', communication: 'concise', confirm_threshold: 'medium' },
    history: { last_project: '/tmp/proj-a', recent_projects: ['/tmp/proj-a'] },
  };
}

describe('readConfig', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-config-test-'));
    // 创建 .openfeel 目录
    mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('应正确解析 config.yaml 所有字段', () => {
    const content = `# 测试配置
execution_mode: auto
auto_advance: enabled
test_enabled: true
merge_mode: auto
`;
    writeFileSync(join(tmpDir, '.openfeel', 'config.yaml'), content, 'utf-8');
    const config = readConfig(tmpDir);
    expect(config.execution_mode).toBe('auto');
    expect(config.auto_advance).toBe('enabled');
    expect(config.test_enabled).toBe(true);
    expect(config.merge_mode).toBe('auto');
  });

  it('应对不存在的文件返回空对象', () => {
    const config = readConfig(tmpDir);
    expect(config).toEqual({});
  });

  it('应忽略注释行（以 # 开头）', () => {
    const content = `# 这是一行注释
execution_mode: manual
# 这也是一行注释
auto_advance: disabled
`;
    writeFileSync(join(tmpDir, '.openfeel', 'config.yaml'), content, 'utf-8');
    const config = readConfig(tmpDir);
    // 注释不影响解析结果
    expect(config.execution_mode).toBe('manual');
    expect(config.auto_advance).toBe('disabled');
  });

  it('应忽略空行', () => {
    const content = `

execution_mode: manual

auto_advance: disabled

`;
    writeFileSync(join(tmpDir, '.openfeel', 'config.yaml'), content, 'utf-8');
    const config = readConfig(tmpDir);
    expect(config.execution_mode).toBe('manual');
    expect(config.auto_advance).toBe('disabled');
  });

  it('defaults: 块标记在 Zod Schema 中被规范化为空对象', () => {
    const content = `defaults:
execution_mode: manual
`;
    writeFileSync(join(tmpDir, '.openfeel', 'config.yaml'), content, 'utf-8');
    const config = readConfig(tmpDir);
    // yaml.parse() 将 "defaults:" 空块解析为 null，Zod Schema 规范化为 {}
    expect(config.execution_mode).toBe('manual');
    // Zod Schema 为 defaults 提供了默认值 {}，但 null 被预处理转为了 {} 且 normalizeConfig 提升后 defaults 内有字段
    expect(config.defaults).toBeDefined();
  });

  it('test_enabled 应正确解析 true/false 布尔值', () => {
    // 测试 true
    const contentTrue = 'test_enabled: true\n';
    writeFileSync(join(tmpDir, '.openfeel', 'config.yaml'), contentTrue, 'utf-8');
    expect(readConfig(tmpDir).test_enabled).toBe(true);

    // 测试 false
    const contentFalse = 'test_enabled: false\n';
    writeFileSync(join(tmpDir, '.openfeel', 'config.yaml'), contentFalse, 'utf-8');
    expect(readConfig(tmpDir).test_enabled).toBe(false);
  });

  it('应正确解析 meta.version（嵌套格式）', () => {
    const content = `meta:
  version: "1.0"
execution_mode: manual
`;
    writeFileSync(join(tmpDir, '.openfeel', 'config.yaml'), content, 'utf-8');
    const config = readConfig(tmpDir);
    expect(config.meta).toBeDefined();
    expect(config.meta!.version).toBe('1.0');
  });

  it('defaults: 空块（null）应规范化为空对象而不报错', () => {
    const content = `defaults:
execution_mode: manual
`;
    writeFileSync(join(tmpDir, '.openfeel', 'config.yaml'), content, 'utf-8');
    const config = readConfig(tmpDir);
    expect(config.defaults).toBeDefined();
    expect(config.execution_mode).toBe('manual');
  });

  it('meta: null 应规范化为空对象而不报错', () => {
    const content = `meta:
execution_mode: manual
`;
    writeFileSync(join(tmpDir, '.openfeel', 'config.yaml'), content, 'utf-8');
    const config = readConfig(tmpDir);
    expect(config.meta).toEqual({});
  });

  it('models: null 应被删除并走 optional 逻辑', () => {
    const content = `models:
execution_mode: manual
`;
    writeFileSync(join(tmpDir, '.openfeel', 'config.yaml'), content, 'utf-8');
    const config = readConfig(tmpDir);
    expect(config.models).toBeUndefined();
  });

  it('损坏的 YAML 应抛出解析错误（不静默吞错）', () => {
    const content = 'execution_mode: [unclosed\n';
    writeFileSync(join(tmpDir, '.openfeel', 'config.yaml'), content, 'utf-8');
    expect(() => readConfig(tmpDir)).toThrow();
  });
});

// ═══════════════════════════════════════
// Profile 读写（全局用户画像）
// ═══════════════════════════════════════

describe('readProfile & writeProfile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-profile-test-'));
    mockHome.dir = tmpDir;
  });

  afterEach(() => {
    mockHome.dir = '';
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('profile.yaml 不存在时应返回默认 Profile', () => {
    const profile = readProfile();
    expect(profile.user!.name).toBe('');
    expect(profile.user!.lang).toBe('zh-CN');
    expect(profile.preferences!.auto_advance).toBe('disabled');
    expect(profile.history!.recent_projects).toEqual([]);
  });

  it('应读取并合并 profile.yaml（缺失字段回填默认值）', () => {
    const profilePath = join(tmpDir, '.config', 'openfeel', 'profile.yaml');
    mkdirSync(join(tmpDir, '.config', 'openfeel'), { recursive: true });
    writeFileSync(profilePath, 'user:\n  name: Alice\npreferences:\n  auto_advance: enabled\n', 'utf-8');

    const profile = readProfile();
    expect(profile.user!.name).toBe('Alice');
    // 缺失字段回填默认值
    expect(profile.user!.lang).toBe('zh-CN');
    expect(profile.preferences!.auto_advance).toBe('enabled');
    expect(profile.preferences!.review_mode).toBe('full');
    expect(profile.history!.last_project).toBe('');
  });

  it('损坏的 profile.yaml 应回退默认值（保持可用性）', () => {
    const profilePath = join(tmpDir, '.config', 'openfeel', 'profile.yaml');
    mkdirSync(join(tmpDir, '.config', 'openfeel'), { recursive: true });
    writeFileSync(profilePath, '{{{{broken yaml', 'utf-8');

    const profile = readProfile();
    expect(profile.user!.name).toBe('');
    expect(profile.preferences!.communication).toBe('concise');
  });

  it('writeProfile 应写入并自动创建父目录', () => {
    writeProfile(makeTestProfile());

    const profilePath = join(tmpDir, '.config', 'openfeel', 'profile.yaml');
    expect(existsSync(profilePath)).toBe(true);
    const profile = readProfile();
    expect(profile.user!.name).toBe('TestUser');
    expect(profile.preferences!.auto_advance).toBe('enabled');
  });
});

// ═══════════════════════════════════════
// ensureProfileDefaults（自动填充）
// ═══════════════════════════════════════

describe('ensureProfileDefaults', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-profile-fill-'));
    mockHome.dir = tmpDir;
  });

  afterEach(() => {
    mockHome.dir = '';
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('user.name 为空时应自动填充（优先读 .info.json）', () => {
    writeProfile({ user: {}, preferences: {}, history: {} });
    // 创建 .info.json 提供可控用户名（getUserName 优先读它）
    mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
    writeFileSync(join(tmpDir, '.openfeel', '.info.json'), JSON.stringify({ user: 'TestUser' }), 'utf-8');
    ensureProfileDefaults(tmpDir);

    const profile = readProfile();
    expect(profile.user!.name).toBe('TestUser');
  });

  it('应更新 last_project 并将项目追加到 recent_projects 头部', () => {
    writeProfile({ ...makeTestProfile(), history: { last_project: '/old', recent_projects: ['/old'] } });
    ensureProfileDefaults(tmpDir);

    const profile = readProfile();
    expect(profile.history!.last_project).toBe(tmpDir);
    expect(profile.history!.recent_projects[0]).toBe(tmpDir);
    expect(profile.history!.recent_projects).toContain('/old');
  });

  it('recent_projects 应去重且最多保留 5 个', () => {
    writeProfile({
      ...makeTestProfile(),
      history: { last_project: '/p5', recent_projects: ['/p5', '/p4', '/p3', '/p2', '/p1'] },
    });
    ensureProfileDefaults(tmpDir);

    const profile = readProfile();
    expect(profile.history!.recent_projects).toHaveLength(5);
    expect(profile.history!.recent_projects[0]).toBe(tmpDir);
    // 最旧的 /p1 被挤出
    expect(profile.history!.recent_projects).not.toContain('/p1');
  });

  it('无变更时不应触发写盘', () => {
    writeProfile({ ...makeTestProfile(), history: { last_project: tmpDir, recent_projects: [tmpDir] } });
    // 先记录 mtime
    const profilePath = join(tmpDir, '.config', 'openfeel', 'profile.yaml');
    const before = readFileSync(profilePath, 'utf-8');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    ensureProfileDefaults(tmpDir);
    const after = readFileSync(profilePath, 'utf-8');
    warnSpy.mockRestore();

    expect(after).toBe(before);
  });

  it('写盘失败时应静默降级（console.warn 且不抛出）', () => {
    // homedir 指向一个普通文件 → mkdirSync 抛 ENOTDIR → writeProfile 失败
    const blockerFile = join(tmpDir, 'not-a-dir');
    writeFileSync(blockerFile, 'file', 'utf-8');
    mockHome.dir = blockerFile;

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => ensureProfileDefaults(tmpDir)).not.toThrow();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// ═══════════════════════════════════════
// getConfigValue & setConfigValue
// ═══════════════════════════════════════

describe('getConfigValue & setConfigValue', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-config-value-'));
    mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('getConfigValue 应返回 defaults 中指定 key 的值', () => {
    writeFileSync(join(tmpDir, '.openfeel', 'config.yaml'), 'defaults:\n  auto_advance: enabled\n', 'utf-8');
    expect(getConfigValue(tmpDir, 'auto_advance')).toBe('enabled');
  });

  it('getConfigValue 对无 defaults 块应返回 null', () => {
    writeFileSync(join(tmpDir, '.openfeel', 'config.yaml'), 'execution_mode: manual\n', 'utf-8');
    expect(getConfigValue(tmpDir, 'auto_advance')).toBeNull();
  });

  it('getConfigValue 对不存在的 key 应返回 null', () => {
    writeFileSync(join(tmpDir, '.openfeel', 'config.yaml'), 'defaults:\n  auto_advance: enabled\n', 'utf-8');
    expect(getConfigValue(tmpDir, 'nonexistent_key')).toBeNull();
  });

  it('setConfigValue 应写入 defaults 并保留注释与结构', () => {
    const content = '# 工作流配置\ndefaults:\n  auto_advance: disabled\n';
    writeFileSync(join(tmpDir, '.openfeel', 'config.yaml'), content, 'utf-8');

    setConfigValue(tmpDir, 'auto_advance', 'enabled');

    const result = readFileSync(join(tmpDir, '.openfeel', 'config.yaml'), 'utf-8');
    expect(result).toContain('# 工作流配置');
    expect(result).toContain('auto_advance: enabled');
    expect(getConfigValue(tmpDir, 'auto_advance')).toBe('enabled');
  });

  it('setConfigValue 对未知 key 应抛出错误', () => {
    writeFileSync(join(tmpDir, '.openfeel', 'config.yaml'), 'defaults: {}\n', 'utf-8');
    expect(() => setConfigValue(tmpDir, 'unknown_key', 'x')).toThrow(/Unknown config key/);
  });

  it('setConfigValue 对非法枚举值应抛出错误', () => {
    writeFileSync(join(tmpDir, '.openfeel', 'config.yaml'), 'defaults: {}\n', 'utf-8');
    expect(() => setConfigValue(tmpDir, 'auto_advance', 'invalid-value')).toThrow();
  });

  it('setConfigValue 在 config.yaml 不存在时应创建文件', () => {
    setConfigValue(tmpDir, 'merge_mode', 'auto');
    expect(existsSync(join(tmpDir, '.openfeel', 'config.yaml'))).toBe(true);
    expect(getConfigValue(tmpDir, 'merge_mode')).toBe('auto');
  });
});

describe('writeDefaultConfig', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-config-write-test-'));
    mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('应写入正确的默认值', () => {
    writeDefaultConfig(tmpDir);
    const configPath = join(tmpDir, '.openfeel', 'config.yaml');
    expect(existsSync(configPath)).toBe(true);

    const content = readFileSync(configPath, 'utf-8');
    expect(content).toContain('execution_mode: manual');
    expect(content).toContain('auto_advance: disabled');
    expect(content).toContain('test_enabled: false');
    expect(content).toContain('merge_mode: manual');
  });

  it('readConfig 应能正确解析 writeDefaultConfig 写入的内容', () => {
    writeDefaultConfig(tmpDir);
    const config = readConfig(tmpDir);
    expect(config.execution_mode).toBe('manual');
    expect(config.auto_advance).toBe('disabled');
    expect(config.test_enabled).toBe(false);
    expect(config.merge_mode).toBe('manual');
  });
});
