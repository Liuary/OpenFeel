/**
 * setup 命令注册
 * openfeel setup [--lang <lang>] — 纯全局部署（全局 AGENTS.md + agent + skill + 平台适配器配置（opencode.jsonc）），不建项目 .openfeel/
 */
import { Command } from 'commander';
import { setupGlobalFramework } from '../core/setup.js';
import { parseToolList, supportedTools } from '../core/update.js';
import { checkGlobalDeployment } from '../core/deployment-check.js';
import { DshProfileError, dshErrorToCli } from '../core/dsh-profile.js';
import { t, getCliLang } from '../core/i18n.js';
import { failCli } from './shared/errors.js';

/** DSH 内部错误码 → 本地化文案（命令层单点） */
function dshErrorMessage(err: DshProfileError, lang: string): string {
  const detail = err.detail;
  const text = (value: unknown): string => (value === undefined || value === null ? '' : String(value));
  switch (err.code) {
    case 'DSH_HOME_NOT_FOUND':
      return t('setup.dshHomeMissingTmpl', lang, { dir: text(detail.dir) });
    case 'DSH_PROFILE_NOT_FOUND':
      return t('setup.dshProfileMissingTmpl', lang, { dir: text(detail.dir) });
    case 'DSH_PROFILE_UNKNOWN':
      return t('setup.dshProfileUnknownTmpl', lang, {
        name: text(detail.name),
        profiles: Array.isArray(detail.available) ? detail.available.join(', ') : '',
      });
    case 'DSH_PROFILE_INVALID_JSON':
      return t('setup.dshProfileInvalidJsonTmpl', lang, { path: text(detail.path), err: text(detail.err) });
    case 'DSH_PROFILE_NOT_DSH':
      return t('setup.dshProfileNotDshTmpl', lang, { path: text(detail.path) });
    case 'DSH_PROFILE_INVALID_SHAPE':
      return t('setup.dshProfileInvalidShapeTmpl', lang, {
        field: text(detail.field),
        path: text(detail.path),
      });
    case 'DSH_ADAPTER_MISSING':
      return t('setup.dshAdapterMissingTmpl', lang, { path: text(detail.path) });
    case 'DSH_PNPM_MISSING':
      return t('setup.dshPnpmMissingTmpl', lang, { path: text(detail.path ?? detail.command) });
    case 'DSH_BACKUP_FAILED':
      return t('setup.dshBackupFailedTmpl', lang, { path: text(detail.path), err: text(detail.err) });
    case 'DSH_PNPM_INSTALL_FAILED':
      return t('setup.dshPnpmFailedTmpl', lang, { path: text(detail.path), err: text(detail.err) });
    default:
      return err.message;
  }
}

export function registerSetupCommand(program: Command): void {
  program
    .command('setup')
    .description('部署全局 OpenFeel 框架配置（全局 AGENTS.md + agent + skill + 平台适配器配置：opencode.jsonc），不建立项目 .openfeel/')
    .option('--lang <lang>', 'Agent 提示词语言（zh-CN 或 en），默认 zh-CN')
    .option('--check', t('help.setup.check', getCliLang(process.cwd())))
    .option('--json', t('help.setup.json', getCliLang(process.cwd())))
    .option('--tools <list>', t('help.setup.tools', getCliLang(process.cwd())))
    .option('--dsh-profile <name>', t('help.setup.dshProfile', getCliLang(process.cwd())))
    .action((options: { lang?: string; check?: boolean; json?: boolean; tools?: string; dshProfile?: string }) => {
      const lang = getCliLang(process.cwd());
      // stage-67：--check 前置只读短路——不执行任何部署、零写盘（D-E / R-3）
      if (options?.check === true) {
        const result = checkGlobalDeployment();
        if (options.json === true) {
          // 纯 JSON 单文档；对齐既有 --json 约定（数值 schemaVersion）
          console.log(JSON.stringify({
            schemaVersion: 1,
            status: result.status,
            cliVersion: result.cliVersion,
            deployedVersion: result.deployedVersion,
          }, null, 2));
        } else if (result.status === 'ok') {
          console.log(t('setup.checkOkTmpl', lang, { deployed: result.deployedVersion ?? '?', cli: result.cliVersion }));
        } else if (result.status === 'mismatch') {
          console.log(t('setup.checkMismatchTmpl', lang, { deployed: result.deployedVersion ?? '?', cli: result.cliVersion }));
        } else if (result.status === 'restart-required') {
          // v1.3.4：文件已新、宿主未重启——不再指引重跑 setup（消除死循环）
          console.log(t('setup.checkRestartRequiredTmpl', lang, {
            deployed: result.deployedVersion ?? '?',
            loadedAt: result.adapter?.startedAt ?? '?',
          }));
        } else if (result.status === 'missing') {
          console.log(t('setup.checkMissingTmpl', lang));
        } else {
          // unknown：显式命令下可报告（区别于被动静默）
          console.log(t('setup.checkUnknownTmpl', lang));
        }
        // 一致 → 0；不一致/缺失/不可判定 → 1（门禁可拦截）
        process.exitCode = result.status === 'ok' ? 0 : 1;
        return;
      }
      const deployLang = (options?.lang === 'en' || options?.lang === 'zh-CN') ? options.lang : 'zh-CN';
      // --tools 解析（默认仅 opencode；非法值报错退出 1）
      let tools: string[] = ['opencode'];
      if (options?.tools !== undefined) {
        const parsed = parseToolList(String(options.tools));
        if (parsed.invalid.length > 0) {
          const message = t('update.toolsInvalidTmpl', lang, {
            tools: parsed.invalid.join(', '),
            valid: supportedTools.map((x) => x.id).join(', '),
          });
          // 非 JSON 文案逐字不变；JSON 模式 → INVALID_ARGUMENT envelope + exit 1
          failCli({
            code: 'INVALID_ARGUMENT',
            message,
            detail: { invalid: parsed.invalid, valid: supportedTools.map((x) => x.id) },
            stderrLines: [message],
          });
          return;
        }
        tools = parsed.tools;
      }
      let r: ReturnType<typeof setupGlobalFramework>;
      try {
        r = setupGlobalFramework(deployLang, tools, { dshProfile: options?.dshProfile });
      } catch (err) {
        if (err instanceof DshProfileError) {
          const mapped = dshErrorToCli(err);
          const message = dshErrorMessage(err, lang);
          failCli({
            code: mapped.code,
            message,
            detail: mapped.detail,
            stderrLines: [message],
          });
          return;
        }
        throw err;
      }
      if (r.created.length) { console.log(t('setup.created', lang)); for (const f of r.created) console.log(`  + ${f}`); }
      if (r.updated.length) { console.log(t('setup.updated', lang)); for (const f of r.updated) console.log(`  ~ ${f}`); }
      if (r.appended.length) { console.log(t('setup.appended', lang)); for (const f of r.appended) console.log(`  ⚠ ${f}`); }
      // 跳过项（内容一致未写入）：对齐 init/update 口径，复用既有 i18n 键（T24）
      if (r.skipped.length) { console.log(t('update.skipped', lang)); for (const f of r.skipped) console.log(`  - ${f}`); }
      if (r.dsh !== undefined) {
        const dsh = r.dsh;
        console.log(t('setup.dshProfilesTmpl', lang, { home: dsh.home, count: String(dsh.profiles.length) }));
        if (dsh.profiles.length > 1 && options?.dshProfile === undefined && process.stdout.isTTY) {
          console.log(t('setup.dshMultiProfileHint', lang, {
            profiles: dsh.profiles.map((profile) => profile.name).join(', '),
          }));
        }
        for (const profile of dsh.profiles) {
          const key = profile.action === 'updated'
            ? 'setup.dshProfileUpdatedTmpl'
            : 'setup.dshProfileSkippedTmpl';
          console.log(t(key, lang, {
            name: profile.name,
            path: profile.path,
            adapter: dsh.adapterDir,
          }));
          if (profile.install === 'installed') {
            console.log(t('setup.dshInstallOkTmpl', lang, { path: profile.path }));
          } else {
            console.log(t('setup.dshInstallSkipTmpl', lang));
          }
        }
        console.log(t('setup.dshRestartHint', lang));
      }
      console.log(t('setup.complete', lang));
      // 重启提醒（按 harness 组合；仅 opencode 时文案与既有逐字一致）
      const harnesses: string[] = [];
      if (tools.includes('opencode')) harnesses.push('opencode');
      if (tools.includes('claude')) harnesses.push('Claude Code');
      if (tools.includes('dsh')) harnesses.push('DSH');
      const harness = harnesses.length > 0 ? harnesses.join(' / ') : 'opencode';
      console.log(t('setup.restartHarnessTmpl', lang, { harness }));
      if (tools.includes('claude')) {
        console.log(t('update.claudeReloadHintTmpl', lang));
      }
    });
}
