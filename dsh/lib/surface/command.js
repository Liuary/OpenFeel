/**
 * OpenFeel × DSH 适配器 — `/feel` 人类命令
 *
 * 面向**人**的命令面：直接转发到 OpenFeel CLI 并把输出回显到会话。
 * 与工具面的区别：工具面给 agent 用结构化 JSON；命令面给人用 OpenFeel
 * 原生的可读输出（看板、健康报告、阶段状态）。
 *
 * 门禁不在适配器里判：写操作一律交给 CLI，拒绝原因原样回显。
 */

import { FeelError } from '../adapters/cli.js';
import { resolveWorkspace } from '../adapters/workspace.js';

/** 命令用法（帮助文本）。 */
export const FEEL_USAGE = [
  'Feel 模式（OpenFeel × DSH）— 用法：',
  '',
  '  /feel                      查看帮助',
  '  /feel status               流水线状态摘要',
  '  /feel next                 下一步该谁做',
  '  /feel overview             全状态可视化',
  '  /feel board                需求看板（7 状态）',
  '  /feel recover              跨会话上下文恢复',
  '  /feel health [--fix]       健康检查（可回写 status.md 状态字段）',
  '  /feel stage [<id>]         阶段状态（省略 id 列出全部）',
  '  /feel req <id>             需求详情',
  '  /feel advance <stage> <to> 推进相位（受转移表 / done 门 / REV 阻塞约束）',
  '  /feel claim <REQ-NNN>      认领需求',
  '  /feel archive list         已归档版本',
  '  /feel kb <query>           检索知识库',
  '  /feel config               查看有效配置',
  '',
  '所有能力同样以工具形式提供给 agent（feel_status / feel_flow / feel_req / ...）。',
].join('\n');

/**
 * 简单分词（支持双引号包裹的参数）。
 * @param {string} input
 * @returns {string[]}
 */
export function tokenize(input) {
  /** @type {string[]} */
  const tokens = [];
  let current = '';
  let quote = null;
  for (const ch of input) {
    if (quote !== null) {
      if (ch === quote) {
        quote = null;
        continue;
      }
      current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current !== '') {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }
  if (current !== '') tokens.push(current);
  return tokens;
}

/**
 * 创建 `/feel` 命令的处理器。
 *
 * @param {object} context
 * @param {import('../adapters/cli.js').FeelCli} context.cli
 * @returns {(invocation: { agent: object, rawInput: string }) => Promise<{ kind: 'success'|'error', text: string }>}
 */
export function createFeelCommandHandler(context) {
  const { cli } = context;

  return async function handleFeelCommand(invocation) {
    const tokens = tokenize(invocation.rawInput ?? '');
    const sub = (tokens[0] ?? '').toLowerCase();
    const rest = tokens.slice(1);

    if (sub === '' || sub === 'help') {
      return { kind: 'success', text: FEEL_USAGE };
    }

    /** @param {object} execLike */
    const workspaceOf = (execLike) => {
      const resolved = resolveWorkspace(execLike, { fallback: cli.cwd });
      if (!resolved.initialized) {
        throw new FeelError(
          `当前工作区 ${resolved.projectRoot} 不是 OpenFeel 项目（缺少 .openfeel/）。请先执行 \`openfeel init\`。`,
          { kind: 'refusal', code: 'FEEL_NOT_INITIALIZED' },
        );
      }
      return resolved.projectRoot;
    };

    const execLike = { agent: invocation.agent };
    let cwd;
    try {
      cwd = workspaceOf(execLike);
    } catch (error) {
      return { kind: 'error', text: messageOf(error) };
    }

    /** @param {string[]} args */
    const runText = async (args) => {
      const result = await cli.run(args, { cwd });
      if (result.code !== 0) throw cli.errorFromResult(result, args);
      return result.stdout;
    };

    try {
      switch (sub) {
        case 'status':
          return { kind: 'success', text: await runText(['flow', 'status']) };
        case 'overview':
          return { kind: 'success', text: await runText(['flow', 'overview']) };
        case 'board':
          return { kind: 'success', text: await runText(['req', 'board']) };
        case 'recover':
          return { kind: 'success', text: await runText(['flow', 'recover']) };
        case 'next': {
          const next = await runText(['req', 'next']);
          const flow = await cli.run(['flow', 'current'], { cwd });
          const parts = [flow.stdout, '', '可接取需求：', next];
          return { kind: 'success', text: parts.filter((part) => part.trim() !== '').join('\n') };
        }
        case 'health': {
          const argv = ['flow', 'health', ...rest];
          return { kind: 'success', text: await runText(argv) };
        }
        case 'stage': {
          const argv = rest.length === 0 ? ['stage', 'status'] : ['stage', 'status', rest[0]];
          return { kind: 'success', text: await runText(argv) };
        }
        case 'req': {
          const id = rest[0];
          if (id === undefined) return { kind: 'error', text: '用法：/feel req <REQ-NNN>\n\n' + FEEL_USAGE };
          return { kind: 'success', text: await runText(['req', 'show', id]) };
        }
        case 'claim': {
          const id = rest[0];
          if (id === undefined) return { kind: 'error', text: '用法：/feel claim <REQ-NNN>' };
          return { kind: 'success', text: await runText(['req', 'claim', id]) };
        }
        case 'advance': {
          const [stage, to] = rest;
          if (stage === undefined || to === undefined) {
            return { kind: 'error', text: '用法：/feel advance <stage> <phase>\n\n合法相位见 /feel status 或 openfeel flow phases。' };
          }
          return { kind: 'success', text: await runText(['flow', 'advance', '--stage', stage, '--to', to]) };
        }
        case 'archive': {
          const argv = rest[0] === 'list' ? ['flow', 'archive', 'list'] : ['flow', 'archive', 'list'];
          return { kind: 'success', text: await runText(argv) };
        }
        case 'kb': {
          const query = rest.join(' ').trim();
          if (query === '') return { kind: 'error', text: '用法：/feel kb <关键词>' };
          return { kind: 'success', text: await runText(['knowledge', 'search', query]) };
        }
        case 'config':
          return { kind: 'success', text: await runText(['config', 'effective']) };
        default:
          return { kind: 'error', text: `未知子命令「${sub}」。\n\n${FEEL_USAGE}` };
      }
    } catch (error) {
      return { kind: 'error', text: messageOf(error) };
    }
  };
}

/**
 * 取错误消息。
 * @param {unknown} error
 * @returns {string}
 */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}
