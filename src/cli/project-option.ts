/**
 * 全局 --project 项目锚定（v1.2.2-stage-95 op-003）
 *
 * 职责：
 *  - 预扫描 argv 中的 `--project <path>` / `--project=<path>`（复用 json-output 的 scanArgv，禁止第二套扫描）；
 *  - 路径校验（存在且为目录）与单点 `process.chdir` 注入；
 *  - 错误封装：缺失值 / 多值冲突 → INVALID_ARGUMENT（refusal/1）；路径问题 → PROJECT_NOT_FOUND（refusal/1）；
 *  - 供命令层单点解析项目根（`resolveProjectPathForCommand`），预扫描结果优先。
 *
 * 边界（REV-95-003 / D-95-12~16）：
 *  - **单进程单命令**：CLI 每次调用至多 chdir 一次，不承诺进程内多项目并发切换；
 *  - **--log-file**：由 bin 的 installRuntimeLog 在本函数 chdir 之前按原始 cwd 解析（本模块不解释日志路径）；
 *  - **help 语言**：bin 的 applyHelpI18n 在本函数之前按原始 cwd 求值；命令输出/错误文案由 chdir 后
 *    的 getCliLang(process.cwd()) 按目标项目解析；
 *  - **禁止二次 resolve**：预扫描已把 `--project` 解析为绝对路径，命令层不得对原始相对值再次拼接；
 *  - 命令层禁用 `options.project`（根/子同名 flag 实测被根选项吞掉），统一走 optsWithGlobals + 本模块单点。
 */
import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { getCliLang, t } from '../core/i18n.js';
import { failCli } from '../commands/shared/errors.js';
import { scanArgv } from '../commands/shared/json-output.js';

/** `--project` 预扫描结果 */
export interface ProjectArgResult {
  /** 全部 `--project` 原始取值（按出现顺序；路径解析归 applyProjectOption） */
  values: string[];
  /** 是否出现缺值形态（`--project` 末尾/后接选项，或 `--project=` 空值） */
  missingValue: boolean;
}

/** 进程级预扫描结果：成功 chdir 后的绝对项目根；null = 未指定 */
let resolvedProjectRoot: string | null = null;

/**
 * 提取全部 `--project` 值（含 `--project=`；缺失值置标志）。
 * @param argv 命令行参数（不含 node 与脚本路径）
 * @returns 原始取值列表与缺值标志
 */
export function extractProjectArgs(argv: string[]): ProjectArgResult {
  const scan = scanArgv(argv);
  return { values: scan.projectValues, missingValue: scan.projectMissingValue };
}

/**
 * 单值便捷入口：取最后一个出现值（无则 null）。
 * 注：多值冲突判定在 applyProjectOption 内完成，本函数仅用于单值场景。
 * @param argv 命令行参数
 * @returns 最后一个 `--project` 原始值；未出现返回 null
 */
export function extractProjectArg(argv: string[]): string | null {
  const { values } = extractProjectArgs(argv);
  return values.length > 0 ? values[values.length - 1] : null;
}

/**
 * 预扫描应用：校验并 chdir 到 `--project` 目标目录。
 * 成功 chdir 返回 true；失败输出错误后返回 false（JSON 模式不 exit，由调用方 return；
 * 非 JSON 模式 failCli 即时退出，测试 mock exit 时可继续返回 false）。
 * @param argv 命令行参数
 * @param originalCwd 原始 cwd（缺省 = process.cwd()；用于 chdir 前的路径/语言解析）
 * @returns 是否可继续执行
 */
export function applyProjectOption(argv: string[], originalCwd?: string): boolean {
  const cwd = originalCwd ?? process.cwd();
  // D-95-13：错误文案语言按原始 cwd 解析（目标路径可能不存在）
  const lang = getCliLang(cwd);
  const { values, missingValue } = extractProjectArgs(argv);

  // 缺值：`--project` 后无取值或取值为选项 token
  if (missingValue) {
    const message = t('common.projectMissingValueTmpl', lang);
    failCli({
      code: 'INVALID_ARGUMENT',
      message,
      detail: { option: '--project' },
      stderrLines: [message],
    });
    return false;
  }

  // 未指定：清空预扫描状态，回退 process.cwd()（既有行为逐字不变）
  if (values.length === 0) {
    resolvedProjectRoot = null;
    return true;
  }

  // 多值：解析后路径不一致属用法错误；一致则允许（D-95-12）
  const resolved = values.map((v) => resolve(cwd, v));
  if (new Set(resolved).size > 1) {
    const message = t('common.projectConflictTmpl', lang, { values: resolved.join(', ') });
    failCli({
      code: 'INVALID_ARGUMENT',
      message,
      detail: { option: '--project', values: resolved },
      stderrLines: [message],
    });
    return false;
  }

  const abs = resolved[0];
  // 目录校验：不存在 → not-found；存在但不是目录 → not-directory
  let reason: 'not-found' | 'not-directory' | null = null;
  try {
    if (!statSync(abs).isDirectory()) {
      reason = 'not-directory';
    }
  } catch {
    reason = 'not-found';
  }
  if (reason !== null) {
    const message = t('common.projectNotFoundTmpl', lang, { path: abs });
    failCli({
      code: 'PROJECT_NOT_FOUND',
      message,
      detail: { path: abs, reason },
      stderrLines: [message],
    });
    return false;
  }

  // 单点 chdir：失败（权限/竞态）同样归 PROJECT_NOT_FOUND
  try {
    process.chdir(abs);
  } catch {
    const message = t('common.projectNotFoundTmpl', lang, { path: abs });
    failCli({
      code: 'PROJECT_NOT_FOUND',
      message,
      detail: { path: abs, reason: 'chdir-failed' },
      stderrLines: [message],
    });
    return false;
  }

  resolvedProjectRoot = abs;
  return true;
}

/**
 * 命令层单点解析项目根路径。
 * 预扫描成功时返回绝对路径（禁止对原始相对值二次 resolve）；直接 parse（测试/库调用）无预扫描时
 * 回退 `resolve(process.cwd(), raw ?? '.')`，保持既有 `knowledge dedup --project X` 语义。
 * @param raw 命令层取得的原始 `--project` 值（可为 undefined）
 * @returns 绝对项目根路径
 */
export function resolveProjectPathForCommand(raw?: string): string {
  if (resolvedProjectRoot) {
    return resolvedProjectRoot;
  }
  return raw ? resolve(process.cwd(), raw) : process.cwd();
}

/** 测试隔离：清空预扫描结果（非生产路径） */
export function resetProjectRootForTest(): void {
  resolvedProjectRoot = null;
}
