/**
 * deploy-check-output.ts — 被动部署检测的运行期适配器（stage-67）
 *
 * 职责：组装进程上下文（argv/isTTY/env）→ 门控（shouldRunDeployCheck）→ 只读检测
 * （checkGlobalDeployment）→ 命中 mismatch/missing 时**仅向 stderr** 渲染提示。
 * 约束：异常全捕获**静默**（绝不影响主命令）；不改退出码；不写盘；**每进程一次**。
 *
 * 接入点：`cli/index.ts runCli()`（parse 前）与 `cli/repl.ts startRepl()`（welcome 后）。
 * 不得在 `cli/index.ts` 顶层注册 commander 钩子（会污染 test/** 的 parseAsync）。
 */
import { checkGlobalDeployment, shouldRunDeployCheck } from '../core/deployment-check.js';
import { t, getCliLang } from '../core/i18n.js';

/** 模块级「本进程是否已提示」标志（每进程一次；测试可经 options.warned 注入） */
const warned = { value: false };

/** 测试可注入的上下文覆盖（默认取真实进程上下文） */
export interface DeployCheckOutputOptions {
  /** 进程参数（不含 node/bin），默认 process.argv.slice(2) */
  argv?: string[];
  /** 是否 TTY，默认 Boolean(process.stdout.isTTY) */
  isTTY?: boolean;
  /** 环境变量，默认 process.env */
  env?: NodeJS.ProcessEnv;
  /** 语言覆盖，默认 getCliLang(process.cwd()) */
  lang?: string;
  /** 「已提示」标志覆盖，默认模块级 warned（每进程一次） */
  warned?: { value: boolean };
  /** 检测函数注入，默认 checkGlobalDeployment（便于单测不打桩 IO） */
  check?: typeof checkGlobalDeployment;
}

/**
 * 执行被动部署提示（幂等 per process）。
 * 命中 mismatch → `update.globalStaleWarnTmpl`；missing → `update.globalMissingWarnTmpl`；
 * ok/unknown → 静默；异常 → 静默。
 */
export function emitGlobalDeployCheck(options?: DeployCheckOutputOptions): void {
  try {
    const w = options?.warned ?? warned;
    const argv = options?.argv ?? process.argv.slice(2);
    const isTTY = options?.isTTY ?? Boolean(process.stdout.isTTY);
    const env = options?.env ?? process.env;
    // 门控为假 → 直接静默（保护 --json/--quiet/非 TTY/部署类命令）
    if (!shouldRunDeployCheck({ argv, isTTY, env, alreadyWarned: w.value })) {
      return;
    }
    const check = options?.check ?? checkGlobalDeployment;
    const result = check();
    // ok / unknown → 静默（unknown 避免 Schema 演进误报，R-4）
    if (result.status !== 'mismatch' && result.status !== 'missing') {
      return;
    }
    const lang = options?.lang ?? getCliLang(process.cwd());
    if (result.status === 'mismatch') {
      process.stderr.write(
        t('update.globalStaleWarnTmpl', lang, {
          deployed: result.deployedVersion ?? '?',
          cli: result.cliVersion,
        }) + '\n',
      );
    } else {
      process.stderr.write(t('update.globalMissingWarnTmpl', lang) + '\n');
    }
    // 命中提示后置位「每进程一次」
    w.value = true;
  } catch {
    // 检测/渲染异常 → 静默，绝不影响主命令（R-1）
  }
}
