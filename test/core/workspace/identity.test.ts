/**
 * identity 单元测试
 * 测试 ensureInfoJson 和 getLang 的语言配置读写逻辑
 */
import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

// N4 单点隔离（BUG-004）：homedir → 临时目录；禁用「保存/恢复」伪隔离
// （global-paths.ts 为唯一 homedir 消费点，一处 mock 隔离全部全局路径）
const mockHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

import { tmpdir } from 'node:os';   // tmpdir 仍为真实值（mock 展开 actual）
import { ensureInfoJson, getLang, recordProjectLang, getGlobalConfig } from '../../../src/core/workspace/identity.js';

describe('getLang', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-identity-test-'));
    mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('无 .info.json 时返回 zh-CN', () => {
    const lang = getLang(tmpDir);
    expect(lang).toBe('zh-CN');
  });

  it('.info.json 中有 lang=en 时返回 en', () => {
    const infoPath = join(tmpDir, '.openfeel', '.info.json');
    writeFileSync(infoPath, JSON.stringify({ user: 'test', lang: 'en' }), 'utf-8');
    const lang = getLang(tmpDir);
    expect(lang).toBe('en');
  });

  it('.info.json 中 lang=fr（非法值）时回退返回 zh-CN', () => {
    const infoPath = join(tmpDir, '.openfeel', '.info.json');
    writeFileSync(infoPath, JSON.stringify({ user: 'test', lang: 'fr' }), 'utf-8');
    const lang = getLang(tmpDir);
    expect(lang).toBe('zh-CN');
  });

  it('.info.json 中无 lang 字段时返回 zh-CN', () => {
    const infoPath = join(tmpDir, '.openfeel', '.info.json');
    writeFileSync(infoPath, JSON.stringify({ user: 'test' }), 'utf-8');
    const lang = getLang(tmpDir);
    expect(lang).toBe('zh-CN');
  });
});

describe('ensureInfoJson', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-identity-test-'));
    mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('.info.json 不存在时创建文件含 lang: zh-CN 和 user', () => {
    ensureInfoJson(tmpDir);
    const infoPath = join(tmpDir, '.openfeel', '.info.json');
    expect(existsSync(infoPath)).toBe(true);
    const info = JSON.parse(readFileSync(infoPath, 'utf-8'));
    expect(info.lang).toBe('zh-CN');
    expect(info.user).toBeTruthy();
  });

  it('.info.json 存在但无 lang 时补充写入 zh-CN，不覆盖 user', () => {
    const infoPath = join(tmpDir, '.openfeel', '.info.json');
    writeFileSync(infoPath, JSON.stringify({ user: 'test-user' }), 'utf-8');

    ensureInfoJson(tmpDir);

    const info = JSON.parse(readFileSync(infoPath, 'utf-8'));
    expect(info.lang).toBe('zh-CN');
    expect(info.user).toBe('test-user');
  });

  it('.info.json 已有 lang=en 时保留不变', () => {
    const infoPath = join(tmpDir, '.openfeel', '.info.json');
    writeFileSync(infoPath, JSON.stringify({ user: 'test', lang: 'en' }), 'utf-8');

    ensureInfoJson(tmpDir);

    const info = JSON.parse(readFileSync(infoPath, 'utf-8'));
    expect(info.lang).toBe('en');
    expect(info.user).toBe('test');
  });
});

describe('recordProjectLang', () => {
  let tmpDir: string;
  let globalConfigPath: string;

  beforeEach(() => {
    // 隔离：mock HOME 下建立 .openfeel/，全局配置写入 mock HOME（不触碰真实 ~/.openfeel）
    mockHome.dir = mkdtempSync(join(tmpdir(), 'openfeel-identity-home-'));
    mkdirSync(join(mockHome.dir, '.openfeel'), { recursive: true });
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-identity-record-'));
    globalConfigPath = join(mockHome.dir, '.openfeel', 'config.json');   // 指向 mock HOME
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    rmSync(mockHome.dir, { recursive: true, force: true });
    mockHome.dir = '';
  });

  it('应记录项目语言到全局配置', () => {
    recordProjectLang(tmpDir, 'en');
    const config = getGlobalConfig();
    expect(config.projects[tmpDir]).toBe('en');
  });

  it('语言相同时应跳过写入（幂等性）', () => {
    recordProjectLang(tmpDir, 'en');
    const config1 = JSON.parse(readFileSync(globalConfigPath, 'utf-8'));
    const mtime1 = JSON.stringify(config1);

    recordProjectLang(tmpDir, 'en');
    const config2 = JSON.parse(readFileSync(globalConfigPath, 'utf-8'));
    const mtime2 = JSON.stringify(config2);

    expect(mtime2).toBe(mtime1);
  });

  it('语言不同时应更新映射', () => {
    recordProjectLang(tmpDir, 'en');
    recordProjectLang(tmpDir, 'zh-CN');
    const config = getGlobalConfig();
    expect(config.projects[tmpDir]).toBe('zh-CN');
  });
});

describe('全局配置鲁棒性（stage-50 op-003 T31）', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-identity-t31-'));
    mockHome.dir = mkdtempSync(join(tmpdir(), 'openfeel-identity-home-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    rmSync(mockHome.dir, { recursive: true, force: true });
    mockHome.dir = '';
  });

  it('projects 非对象时不抛 TypeError，返回空映射', () => {
    mkdirSync(join(mockHome.dir, '.openfeel'), { recursive: true });
    writeFileSync(join(mockHome.dir, '.openfeel', 'config.json'), JSON.stringify({ lang: 'zh-CN', projects: 'corrupt' }), 'utf-8');
    const cfg = getGlobalConfig();
    expect(cfg.projects).toEqual({});
  });

  it('recordProjectLang 写入前规范化路径（同项目不产生多条目）', () => {
    recordProjectLang(join(tmpDir, '.'), 'en');
    const cfg = getGlobalConfig();
    expect(cfg.projects[resolve(tmpDir)]).toBe('en');
  });
});

/**
 * 隔离守护（BUG-004）
 *
 * 通过 `vi.importActual('node:os')` 取真实 homedir（绕过本文件 mock），
 * 断言本文件运行前后真实 `~/.openfeel/config.json` 的 mtime 与内容 SHA-256 均不变——只读不写。
 * 基线用**根级 `beforeAll`** 记录，确保先于本文件全部用例（describe 内 beforeAll 会晚于前置用例）。
 *
 * 局限声明：本守护覆盖「本文件」运行前后；vitest 多文件并行时其它文件不在本守卫范围
 * （各自 N4 隔离已覆盖，见 setup.test.ts / update.test.ts）。
 */
let realConfigPath = '';
let beforeMtime = 0;
let beforeHash = '';

beforeAll(async () => {
  // 取真实 os 模块（绕过本文件 mock），仅读不写
  const actualOs = await vi.importActual<typeof import('node:os')>('node:os');
  realConfigPath = join(actualOs.homedir(), '.openfeel', 'config.json');
  if (existsSync(realConfigPath)) {
    beforeMtime = statSync(realConfigPath).mtimeMs;
    beforeHash = createHash('sha256').update(readFileSync(realConfigPath)).digest('hex');
  }
});

describe('隔离守护（BUG-004：本文件不得触碰真实 ~/.openfeel）', () => {
  it('真实 ~/.openfeel/config.json 的 mtime 与内容 SHA-256 未被改写', () => {
    // 运行前不存在 → 只要未新建即为通过（不写不建）
    if (!existsSync(realConfigPath)) {
      return;
    }
    expect(statSync(realConfigPath).mtimeMs).toBe(beforeMtime);   // mtime 未被改写
    expect(createHash('sha256').update(readFileSync(realConfigPath)).digest('hex')).toBe(beforeHash);
  });
});
