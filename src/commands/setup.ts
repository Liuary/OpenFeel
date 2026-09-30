/**
 * setup 命令注册
 * openfeel setup [--lang <lang>] — 纯全局部署（全局 AGENTS.md + agent + skill + 平台适配器配置（opencode.jsonc）），不建项目 .openfeel/
 */
import { Command } from 'commander';
import { setupGlobalFramework } from '../core/setup.js';
import { t, getCliLang } from '../core/i18n.js';

export function registerSetupCommand(program: Command): void {
  program
    .command('setup')
    .description('部署全局 OpenFeel 框架配置（全局 AGENTS.md + agent + skill + 平台适配器配置：opencode.jsonc），不建立项目 .openfeel/')
    .option('--lang <lang>', 'Agent 提示词语言（zh-CN 或 en），默认 zh-CN')
    .action((options: { lang?: string }) => {
      const lang = getCliLang(process.cwd());
      const deployLang = (options?.lang === 'en' || options?.lang === 'zh-CN') ? options.lang : 'zh-CN';
      const r = setupGlobalFramework(deployLang);
      if (r.created.length) { console.log(t('setup.created', lang)); for (const f of r.created) console.log(`  + ${f}`); }
      if (r.updated.length) { console.log(t('setup.updated', lang)); for (const f of r.updated) console.log(`  ~ ${f}`); }
      if (r.appended.length) { console.log(t('setup.appended', lang)); for (const f of r.appended) console.log(`  ⚠ ${f}`); }
      // 跳过项（内容一致未写入）：对齐 init/update 口径，复用既有 i18n 键（T24）
      if (r.skipped.length) { console.log(t('update.skipped', lang)); for (const f of r.skipped) console.log(`  - ${f}`); }
      console.log(t('setup.complete', lang));
      console.log(lang === 'en' ? 'Restart the harness (opencode) to load the new global configuration.' : '请重启当前 harness（opencode）以加载新的全局配置。');
    });
}
