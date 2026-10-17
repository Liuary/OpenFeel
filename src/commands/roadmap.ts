/**
 * roadmap 命令组注册
 * openfeel roadmap create <version> | show [version]
 */
import { Command } from 'commander';
import { createRoadmap, showRoadmap, readRoadmapMilestones } from '../core/plan/roadmap.js';
import { t, getCliLang } from '../core/i18n.js';
import { withSchemaVersion, emitJson } from './shared/json-output.js';
import { failRefusal } from './shared/errors.js';

export function registerRoadmapCommand(program: Command): void {
  const roadmap = program
    .command('roadmap')
    .description('分期大纲管理');

  // roadmap create <version>
  roadmap
    .command('create')
    .description('创建分期大纲（版本号如 1.0、2.0）')
    .argument('<version>', '版本号')
    .action((version: string) => {
      const lang = getCliLang(process.cwd());
      try {
        createRoadmap(process.cwd(), version);
      } catch (err) {
        // 异常统一出口：错误模板 + 非 0 退出码，避免堆栈外泄（T41）
        console.error(t('common.errorTmpl', lang, { msg: err instanceof Error ? err.message : String(err) }));
        process.exitCode = 1;
      }
    });

  // roadmap show [version]
  roadmap
    .command('show')
    .description('显示分期大纲内容（不传版本则列出所有）')
    .argument('[version]', '版本号（可选）')
    .option('--json', t('help.roadmap.show.json', getCliLang(process.cwd())))
    .action((version: string | undefined, options: { json?: boolean }) => {
      const lang = getCliLang(process.cwd());

      // JSON 视图：仅里程碑结构（人类输出保持 roadmap 原文逐字不变）
      if (options.json) {
        try {
          const result = readRoadmapMilestones(process.cwd(), version);
          emitJson(withSchemaVersion(result));
        } catch (err) {
          // 版本不存在 → 预期拒绝（JSON envelope；无里程碑小节/占位文案由解析器回落 []）
          failRefusal({
            code: 'INVALID_ARGUMENT',
            message: t('common.errorTmpl', lang, { msg: err instanceof Error ? err.message : String(err) }),
            detail: { reason: 'roadmap-not-found', version: version ?? null },
          });
        }
        return;
      }

      try {
        const output = showRoadmap(process.cwd(), version);
        console.log(output);
      } catch (err) {
        // 异常统一出口（含 core 层 showRoadmap 抛错）：错误模板 + 非 0 退出码（T41）
        console.error(t('common.errorTmpl', lang, { msg: err instanceof Error ? err.message : String(err) }));
        process.exitCode = 1;
      }
    });
}
