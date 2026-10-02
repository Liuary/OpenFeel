/**
 * 输出编码自适应单测（stage-58 op-001 / E-1 + C-1）
 * 覆盖 resolveTargetEncoding 全分支、normalizeEncoding、
 * installOutputEncoding 字节/回调/Buffer 直通/utf8 不包装/幂等，及「无 VITEST 守卫」静态断言。
 * 隔离：install 用例全部注入 fake stream，不触碰真实流；动态 import + resetModules 隔离模块级 installed 状态。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import iconv from 'iconv-lite';
import {
  normalizeEncoding,
  resolveTargetEncoding,
} from '../../src/cli/output-encoding.js';

const REPO_ROOT = process.cwd();
const SRC_PATH = join(REPO_ROOT, 'src', 'cli', 'output-encoding.ts');
const BIN_PATH = join(REPO_ROOT, 'bin', 'openfeel.js');
/** 依赖构建产物 dist/cli/output-encoding.js（缺则显式 skip，门禁须核对 0 skipped） */
const HAS_DIST_ENCODING = existsSync(join(REPO_ROOT, 'dist', 'cli', 'output-encoding.js'));
/** GBK 编码的「流水线」字节 */
const GBK_LIUSHUIXIAN = Buffer.from('c1f7cbaecfdf', 'hex');
/** 严格 UTF-8 解码器（非法字节抛错） */
const FATAL_UTF8 = new TextDecoder('utf-8', { fatal: true });

/** fake 输出流：记录 write 调用的原始参数 */
interface FakeStream {
  write: (...args: unknown[]) => boolean;
  isTTY: boolean;
  chunks: unknown[][];
}

/** 构造记录型 fake 输出流 */
function makeFakeStream(isTTY = false): FakeStream {
  const chunks: unknown[][] = [];
  return {
    chunks,
    isTTY,
    write: (...args: unknown[]): boolean => {
      chunks.push(args);
      return true;
    },
  };
}

/** resetModules 后动态导入全新模块实例（隔离模块级 installed 状态） */
async function freshModule() {
  vi.resetModules();
  return import('../../src/cli/output-encoding.js');
}

afterEach(() => {
  delete process.env.OPENFEEL_ENCODING;
});

describe('resolveTargetEncoding（E-1 全分支）', () => {
  const base = { argv: [] as string[], env: {} as NodeJS.ProcessEnv, platform: 'linux' as NodeJS.Platform, isTTY: false };

  it('① --json 优先于一切（含 --encoding/env）', () => {
    expect(
      resolveTargetEncoding({
        argv: ['--json', '--encoding', 'gbk'],
        env: { OPENFEEL_ENCODING: 'gbk' },
        platform: 'win32',
        isTTY: false,
      }),
    ).toBe('utf8');
  });

  it('② 显式 --encoding（空格形式）优先于 env', () => {
    expect(
      resolveTargetEncoding({ ...base, argv: ['--encoding', 'gbk'], env: { OPENFEEL_ENCODING: 'big5' } }),
    ).toBe('gbk');
  });

  it('② 显式 --encoding= 形式', () => {
    expect(resolveTargetEncoding({ ...base, argv: ['--encoding=big5'] })).toBe('big5');
  });

  it('③ 环境变量 OPENFEEL_ENCODING（含别名 gb2312→gbk）', () => {
    expect(resolveTargetEncoding({ ...base, env: { OPENFEEL_ENCODING: 'gb2312' } })).toBe('gbk');
  });

  it('④ 非 win32 → utf8（即便非 TTY）', () => {
    expect(resolveTargetEncoding({ ...base, platform: 'linux', isTTY: false })).toBe('utf8');
    expect(resolveTargetEncoding({ ...base, platform: 'darwin', isTTY: false })).toBe('utf8');
  });

  it('④ win32 + TTY → utf8（控制台 API 直通）', () => {
    expect(
      resolveTargetEncoding({ ...base, platform: 'win32', isTTY: true }),
    ).toBe('utf8');
  });

  it('⑤ win32 非 TTY 无显式（argv 空/env 空/无 --json）→ utf8（回归）', () => {
    expect(
      resolveTargetEncoding({ platform: 'win32', isTTY: false, argv: [], env: {} }),
    ).toBe('utf8');
  });

  it('--encoding auto 视为未知 → 继续回退（win32 非 TTY → utf8；非 win32 → utf8）', () => {
    expect(
      resolveTargetEncoding({ ...base, argv: ['--encoding', 'auto'], platform: 'win32', isTTY: false }),
    ).toBe('utf8');
    expect(resolveTargetEncoding({ ...base, argv: ['--encoding', 'auto'] })).toBe('utf8');
  });

  it('未知 --encoding 值不崩溃 → 回退（env 仍生效）', () => {
    expect(
      resolveTargetEncoding({ ...base, argv: ['--encoding', 'bogus'], env: { OPENFEEL_ENCODING: 'gbk' } }),
    ).toBe('gbk');
  });
});

describe('normalizeEncoding（E-1 别名）', () => {
  it('别名归一', () => {
    expect(normalizeEncoding('utf-8')).toBe('utf8');
    expect(normalizeEncoding('UTF8')).toBe('utf8');
    expect(normalizeEncoding('gb2312')).toBe('gbk');
    expect(normalizeEncoding('GBK')).toBe('gbk');
    expect(normalizeEncoding('shift_jis')).toBe('cp932');
  });

  it('auto/空/未知/undefined → null', () => {
    expect(normalizeEncoding('auto')).toBeNull();
    expect(normalizeEncoding('')).toBeNull();
    expect(normalizeEncoding('bogus')).toBeNull();
    expect(normalizeEncoding(undefined)).toBeNull();
  });
});

describe('installOutputEncoding（E-1 字节/回调/直通/幂等）', () => {
  it('字符串 chunk → GBK 字节（中文⚠ → d6d0cec43f，⚠ 降 ?）', async () => {
    process.env.OPENFEEL_ENCODING = 'gbk';
    const mod = await freshModule();
    const fake = makeFakeStream();
    const fakeErr = makeFakeStream();
    mod.installOutputEncoding({ stdout: fake as never, stderr: fakeErr as never });

    fake.write('中文⚠');
    const buf = fake.chunks[0]?.[0];
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect((buf as Buffer).toString('hex')).toBe('d6d0cec43f');
    // 与 iconv-lite 直接编码一致（判别力：包装未生效则收到 string）
    expect(buf).toEqual(iconv.encode('中文⚠', 'gbk'));
  });

  it('write(str, cb) 保留回调', async () => {
    process.env.OPENFEEL_ENCODING = 'gbk';
    const mod = await freshModule();
    const fake = makeFakeStream();
    mod.installOutputEncoding({ stdout: fake as never, stderr: makeFakeStream() as never });

    const cb = () => undefined;
    fake.write('中文', cb);
    expect(fake.chunks[0]?.[1]).toBe(cb);
  });

  it('write(str, enc, cb) 丢弃 encoding 保留 cb', async () => {
    process.env.OPENFEEL_ENCODING = 'gbk';
    const mod = await freshModule();
    const fake = makeFakeStream();
    mod.installOutputEncoding({ stdout: fake as never, stderr: makeFakeStream() as never });

    const cb = () => undefined;
    fake.write('中文', 'latin1', cb);
    const [buf, callback] = fake.chunks[0] ?? [];
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect((buf as Buffer).toString('hex')).toBe('d6d0cec4');
    expect(callback).toBe(cb);
  });

  it('Buffer chunk 直通（逐字节不改写）', async () => {
    process.env.OPENFEEL_ENCODING = 'gbk';
    const mod = await freshModule();
    const fake = makeFakeStream();
    mod.installOutputEncoding({ stdout: fake as never, stderr: makeFakeStream() as never });

    const raw = Buffer.from([0xd6, 0xd0, 0xce, 0xc4]);
    fake.write(raw);
    expect(fake.chunks[0]?.[0]).toBe(raw);
  });

  it('env=utf8 时不包装（stream.write 恒等）', async () => {
    process.env.OPENFEEL_ENCODING = 'utf8';
    const mod = await freshModule();
    const fake = makeFakeStream();
    const before = fake.write;
    mod.installOutputEncoding({ stdout: fake as never, stderr: makeFakeStream() as never });

    expect(fake.write).toBe(before);
    fake.write('中文');
    expect(fake.chunks[0]?.[0]).toBe('中文');
  });

  it('幂等：二次 install 不重复包装（不同流不被接管）', async () => {
    process.env.OPENFEEL_ENCODING = 'gbk';
    const mod = await freshModule();
    const first = makeFakeStream();
    mod.installOutputEncoding({ stdout: first as never, stderr: makeFakeStream() as never });

    const second = makeFakeStream();
    mod.installOutputEncoding({ stdout: second as never, stderr: makeFakeStream() as never });

    // 第二次的流未被包装 → 收到原始 string
    second.write('中文');
    expect(second.chunks[0]?.[0]).toBe('中文');
    // 第一次的流已包装 → 收到 Buffer
    first.write('中文');
    expect(Buffer.isBuffer(first.chunks[0]?.[0])).toBe(true);
  });
});

describe('静态断言（REV-001 防回归）', () => {
  it('E-1：源码不含 process.env.VITEST 守卫', () => {
    const src = readFileSync(SRC_PATH, 'utf-8');
    expect(/process\.env\.VITEST/.test(src)).toBe(false);
  });
});

describe('C-1 冲突单测（--json 旁路权威）', () => {
  it('--json + --encoding gbk + env gbk + win32 非 TTY → utf8', () => {
    expect(
      resolveTargetEncoding({
        argv: ['--json', '--encoding', 'gbk'],
        env: { OPENFEEL_ENCODING: 'gbk' },
        platform: 'win32',
        isTTY: false,
      }),
    ).toBe('utf8');
  });
});

describe('E-2 spawn E2E（真实子进程，防恒绿）', () => {
  /**
   * 构造隔离 spawn 环境：HOME 隔离 + 关闭运行日志（避免写真实 ~/.openfeel）。
   * cwd=仓库根（与 plan E-2「临时目录」口径的偏差已声明；保证 flow.json 可用）。
   */
  function spawnEnv(home: string, encoding: string): NodeJS.ProcessEnv {
    return {
      ...process.env,
      USERPROFILE: home,
      HOME: home,
      XDG_CONFIG_HOME: home,
      OPENFEEL_LOG: '0',
      OPENFEEL_ENCODING: encoding,
    };
  }

  /** 运行 bin 子进程并以 Buffer 捕获 stdout */
  function runBin(home: string, args: string[], encoding: string) {
    return spawnSync(process.execPath, [BIN_PATH, ...args], {
      cwd: REPO_ROOT,
      timeout: 30000,
      env: spawnEnv(home, encoding),
    });
  }

  it.skipIf(!HAS_DIST_ENCODING)(
    'E-2① 正控：非 json flow phases + GBK → GBK 字节且非合法 UTF-8',
    () => {
      const home = mkdtempSync(join(tmpdir(), 'openfeel-enc-home-'));
      try {
        const r = runBin(home, ['flow', 'phases'], 'gbk');
        expect(r.status).toBe(0);
        const out = r.stdout as Buffer;
        expect(Buffer.isBuffer(out)).toBe(true);
        // 真实转码链运行 → 含 GBK「流水线」字节
        expect(out.includes(GBK_LIUSHUIXIAN)).toBe(true);
        // 非法 UTF-8（若被短路为 UTF-8 则 fatal 不抛 → 断言失败，不可恒绿）
        expect(() => FATAL_UTF8.decode(out)).toThrow();
      } finally {
        rmSync(home, { recursive: true, force: true });
      }
    },
    40000,
  );

  it.skipIf(!HAS_DIST_ENCODING)(
    'E-2② C-2 旁路回归：--json + GBK env → 合法 UTF-8 / JSON.parse / 5 键',
    () => {
      const home = mkdtempSync(join(tmpdir(), 'openfeel-enc-home-'));
      try {
        const r = runBin(home, ['flow', 'phases', '--json'], 'gbk');
        expect(r.status).toBe(0);
        const out = r.stdout as Buffer;
        const text = FATAL_UTF8.decode(out); // 合法 UTF-8 不抛
        const j = JSON.parse(text) as { schemaVersion: number };
        expect(j.schemaVersion).toBe(1);
        expect(Object.keys(j).length).toBe(5);
      } finally {
        rmSync(home, { recursive: true, force: true });
      }
    },
    40000,
  );

  it.skipIf(!HAS_DIST_ENCODING)(
    'E-2③ 基线：flow phases + utf8 env → 合法 UTF-8 含「流水线」',
    () => {
      const home = mkdtempSync(join(tmpdir(), 'openfeel-enc-home-'));
      try {
        const r = runBin(home, ['flow', 'phases'], 'utf8');
        expect(r.status).toBe(0);
        const out = r.stdout as Buffer;
        const text = FATAL_UTF8.decode(out);
        expect(text).toContain('流水线');
      } finally {
        rmSync(home, { recursive: true, force: true });
      }
    },
    40000,
  );
});
