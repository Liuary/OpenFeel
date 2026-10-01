/**
 * 输出编码自适应单测（stage-58 op-001 / E-1 + C-1）
 * 覆盖 resolveTargetEncoding 全分支、normalizeEncoding、codepageToIconv、
 * installOutputEncoding 字节/回调/Buffer 直通/utf8 不包装/幂等，及「无 VITEST 守卫」静态断言。
 * 隔离：install 用例全部注入 fake stream，不触碰真实流；动态 import + resetModules 隔离模块级 installed 状态。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import iconv from 'iconv-lite';
import {
  normalizeEncoding,
  codepageToIconv,
  resolveTargetEncoding,
} from '../../src/cli/output-encoding.js';

const REPO_ROOT = process.cwd();
const SRC_PATH = join(REPO_ROOT, 'src', 'cli', 'output-encoding.ts');

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

/** resetModules 后动态导入全新模块实例（隔离 installed / cachedCodepage） */
async function freshModule() {
  vi.resetModules();
  return import('../../src/cli/output-encoding.js');
}

afterEach(() => {
  delete process.env.OPENFEEL_ENCODING;
});

describe('resolveTargetEncoding（E-1 全分支）', () => {
  const base = { argv: [] as string[], env: {} as NodeJS.ProcessEnv, platform: 'linux' as NodeJS.Platform, isTTY: false };

  it('① --json 优先于一切（含 --encoding/env/codepage）', () => {
    expect(
      resolveTargetEncoding({
        argv: ['--json', '--encoding', 'gbk'],
        env: { OPENFEEL_ENCODING: 'gbk' },
        platform: 'win32',
        isTTY: false,
        codepage: 936,
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
      resolveTargetEncoding({ ...base, platform: 'win32', isTTY: true, codepage: 936 }),
    ).toBe('utf8');
  });

  it('⑤ win32 非 TTY → codepage 映射（936/950/54936/932/949/65001/未知）', () => {
    const at = (codepage: number | null) =>
      resolveTargetEncoding({ ...base, platform: 'win32', isTTY: false, codepage });
    expect(at(936)).toBe('gbk');
    expect(at(950)).toBe('big5');
    expect(at(54936)).toBe('gb18030');
    expect(at(932)).toBe('cp932');
    expect(at(949)).toBe('cp949');
    expect(at(65001)).toBe('utf8');
    expect(at(437)).toBe('utf8');
    expect(at(null)).toBe('utf8');
  });

  it('--encoding auto 视为未知 → 继续回退（win32 非 TTY 落到 codepage）', () => {
    expect(
      resolveTargetEncoding({
        ...base,
        argv: ['--encoding', 'auto'],
        platform: 'win32',
        isTTY: false,
        codepage: 936,
      }),
    ).toBe('gbk');
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

describe('codepageToIconv（E-1 映射）', () => {
  it('6 映射 + 未知 → utf8', () => {
    expect(codepageToIconv(936)).toBe('gbk');
    expect(codepageToIconv(54936)).toBe('gb18030');
    expect(codepageToIconv(950)).toBe('big5');
    expect(codepageToIconv(932)).toBe('cp932');
    expect(codepageToIconv(949)).toBe('cp949');
    expect(codepageToIconv(65001)).toBe('utf8');
    expect(codepageToIconv(12345)).toBe('utf8');
  });
});

describe('detectConsoleCodepage（E-1 探测）', () => {
  it.skipIf(process.platform !== 'win32')('实测不抛异常，返回 number 或 null', async () => {
    const mod = await freshModule();
    const cp = mod.detectConsoleCodepage();
    expect(cp === null || typeof cp === 'number').toBe(true);
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
  it('--json + --encoding gbk + env gbk + win32 非 TTY + cp936 → utf8', () => {
    expect(
      resolveTargetEncoding({
        argv: ['--json', '--encoding', 'gbk'],
        env: { OPENFEEL_ENCODING: 'gbk' },
        platform: 'win32',
        isTTY: false,
        codepage: 936,
      }),
    ).toBe('utf8');
  });
});
