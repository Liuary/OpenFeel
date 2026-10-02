/**
 * CLI 输出编码自适应模块（stage-58 op-001）
 *
 * 职责：在 CLI 进程入口（bin/openfeel.js）安装 stdout/stderr 写包装，把人类可读文本按目标编码转码。
 * win32 非 TTY 默认直通 UTF-8（对齐 Node 默认与管道/CI 消费者）；GBK 仅经显式
 * `--encoding gbk` / `OPENFEEL_ENCODING=gbk` 生效。
 *
 * 设计边界：
 * - **库侧默认 no-op**：未调用 installOutputEncoding 时不包装任何流（测试 import 零副作用）。
 * - **不设 VITEST/env 守卫**（REV-001 裁定方案 b）：安装仅由 bin 调用；in-process 测试从不安装；
 *   若设守卫会被 spawn 子进程继承（vitest 主进程会设置 VITEST 环境变量为真）→ E2E 恒绿。
 * - **--json 恒 UTF-8**：机器合同，resolve 第 1 步旁路，覆盖显式 --encoding / OPENFEEL_ENCODING / auto。
 * - **仅支持 UTF-8 字符串语义**（REV-003）：string 分支丢弃调用方 encoding；非默认 encoding 的
 *   直接 write（如 write(str, 'latin1', cb)）不受支持。当前全仓 process.stdout/stderr.write 直调为 0。
 * - 不可编码字符由 iconv-lite 降级为 '?'，**不额外告警**。
 */
import iconv from 'iconv-lite';

/** 目标编码（iconv-lite 支持的编码名） */
export type OutputEncoding = 'utf8' | 'gbk' | 'gb18030' | 'big5' | 'cp932' | 'cp949';

/** resolveTargetEncoding 的输入上下文（注入以便纯函数单测） */
export interface ResolveTargetEncodingContext {
  /** 命令行参数（不含 node 与脚本名），如 process.argv.slice(2) */
  argv: string[];
  /** 环境变量，如 process.env */
  env: NodeJS.ProcessEnv;
  /** 平台，如 process.platform */
  platform: NodeJS.Platform;
  /** 该输出流是否为 TTY */
  isTTY: boolean;
}

/** 安装选项（仅注入输出流，便于单测；不含 force——无 env 守卫可绕） */
export interface InstallOutputEncodingOptions {
  stdout?: NodeJS.WriteStream;
  stderr?: NodeJS.WriteStream;
}

/** 已安装标志（幂等） */
let installed = false;

/** 编码别名 → iconv 编码名（'auto'/空/未知返回 null → 调用方继续回退） */
const ENCODING_ALIASES: Record<string, OutputEncoding> = {
  utf8: 'utf8',
  'utf-8': 'utf8',
  gbk: 'gbk',
  gb2312: 'gbk',
  gb18030: 'gb18030',
  big5: 'big5',
  shift_jis: 'cp932',
  sjis: 'cp932',
  cp932: 'cp932',
  'euc-kr': 'cp949',
  cp949: 'cp949',
};

/** 归一化编码值：命中别名返回目标编码；'auto'/空/未知返回 null */
export function normalizeEncoding(value: string | undefined): OutputEncoding | null {
  if (typeof value !== 'string') {
    return null;
  }
  const v = value.trim().toLowerCase();
  return ENCODING_ALIASES[v] ?? null;
}

/** 从 argv 读取显式 --encoding（支持 `--encoding gbk` 与 `--encoding=gbk`） */
function readEncodingArg(argv: string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--encoding') {
      return argv[i + 1];
    }
    if (arg.startsWith('--encoding=')) {
      return arg.slice('--encoding='.length);
    }
  }
  return undefined;
}

/**
 * 解析目标输出编码（纯函数）。
 * 优先级：① --json→utf8（最高） ② 显式 --encoding ③ OPENFEEL_ENCODING ④ 非 win32/TTY→utf8
 * ⑤ win32 非 TTY→utf8。
 */
export function resolveTargetEncoding(ctx: ResolveTargetEncodingContext): OutputEncoding {
  const { argv, env, platform, isTTY } = ctx;
  // ① --json 恒 UTF-8（机器合同，覆盖一切显式/env/auto）
  if (argv.includes('--json')) {
    return 'utf8';
  }
  // ② 显式 --encoding
  const fromArg = normalizeEncoding(readEncodingArg(argv));
  if (fromArg) {
    return fromArg;
  }
  // ③ 环境变量
  const fromEnv = normalizeEncoding(env.OPENFEEL_ENCODING);
  if (fromEnv) {
    return fromEnv;
  }
  // ④ 非 win32 或 TTY：现代终端由 Node 控制台 API 直通，无需转码
  if (platform !== 'win32' || isTTY) {
    return 'utf8';
  }
  // ⑤ win32 非 TTY：直接 UTF-8（对齐 Node 默认与管道/CI 消费者；GBK 仅显式 ②/③）
  return 'utf8';
}

/** 包装单个输出流：仅字符串 chunk 转码，Buffer 直通，保留 callback/返回值 */
function wrapStream(stream: NodeJS.WriteStream): void {
  const target = resolveTargetEncoding({
    argv: process.argv.slice(2),
    env: process.env,
    platform: process.platform,
    isTTY: Boolean(stream.isTTY),
  });
  // target=utf8 不包装（零行为变更）
  if (target === 'utf8') {
    return;
  }

  const orig = stream.write.bind(stream);
  const wrapped = (chunk: unknown, encoding?: unknown, cb?: unknown): boolean => {
    if (typeof chunk === 'string') {
      // 仅支持 UTF-8 字符串语义：丢弃调用方 encoding（REV-003）；不可编码字符降 '?'，不告警
      const callback = typeof encoding === 'function' ? encoding : cb;
      const buf = iconv.encode(chunk, target);
      return (orig as (b: Buffer, c?: unknown) => boolean)(buf, callback);
    }
    // Buffer/二进制直通，保留原始签名
    return (orig as (...a: unknown[]) => boolean)(chunk, encoding, cb);
  };
  stream.write = wrapped as unknown as typeof stream.write;
}

/**
 * 安装输出编码包装（幂等）。仅由 bin/openfeel.js 调用。
 * 未调用时库/测试侧零副作用（不包装任何流）。
 */
export function installOutputEncoding(opts: InstallOutputEncodingOptions = {}): void {
  if (installed) {
    return;
  }
  wrapStream(opts.stdout ?? process.stdout);
  wrapStream(opts.stderr ?? process.stderr);
  installed = true;
}
