/**
 * instructions 命令 — 为指定 artifact 生成结构化 XML/JSON 指令
 * 用法: openfeel instructions <artifactId> --change <name> [--json]
 */
import { Command } from 'commander';
import { resolveSchema } from '../core/artifact-graph/resolver.js';
import { t, getCliLang } from '../core/i18n.js';
import {
  generateInstructions,
  generateInstructionsJson,
} from '../core/artifact-graph/instruction-loader.js';

export function registerInstructionsCommand(program: Command): void {
  program
    .command('instructions')
    .description('为指定 artifact 生成结构化指令（XML 或 JSON）')
    .argument('<artifactId>', '目标 artifact ID（如 proposal、implementation）')
    .requiredOption('--change <name>', '变更名称（如 feat-login）')
    .option('--json', '输出 JSON 格式而非 XML')
    .option('--schema <name>', 'Schema 名称（默认 spec-driven）', 'spec-driven')
    .action(async (artifactId: string, options: Record<string, string | boolean>) => {
      const lang = getCliLang(process.cwd());
      const changeName = options.change as string;
      const schemaName = options.schema as string;
      const useJson = options.json === true;
      const projectPath = process.cwd();

      try {
        // 加载 Schema
        const schema = await resolveSchema(schemaName, projectPath);

        if (useJson) {
          const result = await generateInstructionsJson(
            schema,
            changeName,
            artifactId,
            projectPath,
          );
          console.log(JSON.stringify(result, null, 2));
        } else {
          const xml = await generateInstructions(
            schema,
            changeName,
            artifactId,
            projectPath,
          );
          console.log(xml);
        }
      } catch (err) {
        console.error(t('common.errorTmpl', lang, { msg: (err as Error).message }));
        process.exit(1);
      }
    });
}
