/**
 * dev 命令（v1.5.0）— 状态记录瘦身
 *
 * - `openfeel dev sync`：立即写一次简要状态块（CLI 维护 AUTO 块 + `.sync.json`）
 * - `openfeel dev status`：只读显示是否到期（默认 30 分钟）
 *
 * 无 `--json`（零 JSON 契约变更）；读写均不触碰 dev_last 的手写内容。
 */
import { Command } from 'commander';
import { getDevStatus, syncDevStatus } from '../core/dev-status.js';
import { FlowManager } from '../core/flow-manager.js';
import { t, getCliLang } from '../core/i18n.js';

export function registerDevCommand(program: Command): void {
  const dev = program
    .command('dev')
    .description('开发状态记录（v1.5.0：仅 Feel 维护；CLI 负责简要状态块）');

  dev
    .command('sync')
    .description('立即写入简要状态块（dev_last AUTO 块 + .sync.json）')
    .action(() => {
      const projectPath = process.cwd();
      const lang = getCliLang(projectPath);
      if (!new FlowManager(projectPath).isLoaded()) {
        console.error(t('common.errorNoInit', lang));
        process.exit(1);
        return;
      }
      const result = syncDevStatus(projectPath, {});
      console.log(t('flow.dev.syncedTmpl', lang, {
        file: result.file,
        syncAt: result.syncedAt,
        interval: String(result.status.intervalMinutes),
      }));
    });

  dev
    .command('status')
    .description('查看状态同步状态（只读）')
    .action(() => {
      const projectPath = process.cwd();
      const lang = getCliLang(projectPath);
      if (!new FlowManager(projectPath).isLoaded()) {
        console.error(t('common.errorNoInit', lang));
        process.exit(1);
        return;
      }
      const status = getDevStatus(projectPath);
      const stage = status.stage === null ? t('common.none', lang) : `${status.stage} / ${status.phase ?? '?'}`;
      console.log(t('flow.dev.statusStageTmpl', lang, { stage }));
      console.log(t('flow.dev.statusLastSyncTmpl', lang, {
        lastSync: status.lastSync ?? t('common.none', lang),
        interval: String(status.intervalMinutes),
      }));
      console.log(t(status.due ? 'flow.dev.statusDueTmpl' : 'flow.dev.statusOkTmpl', lang, { interval: String(status.intervalMinutes) }));
    });
}
