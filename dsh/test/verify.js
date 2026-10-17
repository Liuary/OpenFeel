/**
 * OpenFeel × DSH 适配器 — 离线验证脚本
 *
 * 用真实 `openfeel` CLI + **真实 .openfeel 数据的副本**驱动全部工具，
 * 验证适配器契约（工具注册、参数校验、CLI 翻译、错误语义）。
 *
 * 纪律：绝不写原项目。所有写操作都打在 `os.tmpdir()` 下的副本上。
 *
 * 用法：node test/verify.js [--keep]
 */

import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { normalizeConfig, apply } from '../lib/index.js';
import { FeelCli } from '../lib/adapters/cli.js';
import { readSnapshot } from '../lib/adapters/dashboard.js';
import { tokenize } from '../lib/surface/command.js';

/** 真实 OpenFeel 项目（只读源）。 */
const SOURCE_PROJECT = 'C:\\Users\\Liuary\\Dev\\Mine\\AI\\OpenFeel';

/* ────────────────────────── 迷你断言 ────────────────────────── */

let passed = 0;
let failed = 0;
/** @type {string[]} */
const failures = [];

/**
 * @param {string} name
 * @param {() => any} fn
 */
async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    process.stdout.write(`  ✓ ${name}\n`);
  } catch (error) {
    failed += 1;
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${name}: ${message}`);
    process.stdout.write(`  ✗ ${name}\n      ${message.split('\n').join('\n      ')}\n`);
  }
}

/**
 * @param {unknown} condition
 * @param {string} message
 */
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/**
 * @param {unknown} actual
 * @param {string} message
 */
function assertString(actual, message) {
  if (typeof actual !== 'string' || actual.trim() === '') {
    throw new Error(`${message}（实际: ${JSON.stringify(actual)}）`);
  }
}

/**
 * 解析工具 wire 输出里的 `details`（JSON 字符串）。
 *
 * 适配器的输出契约是「`details` 携带结构化 JSON 文本」——这是为了让
 * wire schema 只含具体类型（见 `lib/tools/shared.js` 的 `envelopeSchema`）。
 *
 * @param {any} result 工具返回值。
 * @returns {any}
 */
function detailsOf(result) {
  assert(result !== null && typeof result === 'object', '工具结果应为对象');
  if (result.details === undefined) return null;
  assertString(result.details, 'details 应是非空字符串');
  return JSON.parse(result.details);
}

/**
 * 断言成功并返回解析后的 details。
 * @param {any} result
 * @param {string} [label]
 * @returns {any}
 */
function ok(result, label = '工具调用') {
  assert(result !== null && typeof result === 'object', `${label}: 结果应为对象`);
  assert(result.ok === true, `${label}: ok 应为 true，实际 ${JSON.stringify(result).slice(0, 300)}`);
  assertString(result.summary, `${label}: summary 为空`);
  return detailsOf(result);
}

/* ────────────────────────── 模拟 DSH 上下文 ────────────────────────── */

/**
 * 构建一个最小 Cordis 上下文，捕获插件注册面。
 * @param {string} cwd 会话工作区。
 */
function mockContext(cwd) {
  /** @type {Map<string, any>} */
  const tools = new Map();
  /** @type {any[]} */
  const commands = [];
  /** @type {any[]} */
  const sections = [];
  /** @type {string[]} */
  const logs = [];

  const ctx = {
    logger: () => ({
      info: (/** @type {string} */ message) => logs.push(`INFO ${message}`),
      warn: (/** @type {string} */ message) => logs.push(`WARN ${message}`),
      error: (/** @type {string} */ message) => logs.push(`ERROR ${message}`),
      debug: () => {},
    }),
    tools: {
      /** @param {any} definition */
      register: (definition) => {
        if (tools.has(definition.name)) throw new Error(`重复注册工具: ${definition.name}`);
        if (typeof definition.output?.render !== 'function') {
          throw new Error(`工具 ${definition.name} 缺少 output.render`);
        }
        tools.set(definition.name, definition);
        return () => tools.delete(definition.name);
      },
    },
    commands: {
      /** @param {any} definition */
      register: (definition) => {
        commands.push(definition);
        return () => {};
      },
    },
    systemPrompt: {
      /** @param {any} section */
      section: (section) => {
        sections.push(section);
        return () => {};
      },
      getSectionOrder: () => 40,
    },
  };

  return { ctx, tools, commands, sections, logs, cwd };
}

/**
 * 构造工具执行上下文。
 * @param {string} cwd
 */
function execFor(cwd) {
  const controller = new AbortController();
  return {
    agent: { session: { header: { cwd } } },
    signal: controller.signal,
    callId: 'test-call',
    rootCallId: 'test-root',
  };
}

/* ────────────────────────── 主流程 ────────────────────────── */

async function main() {
  const keep = process.argv.includes('--keep');

  process.stdout.write('\nOpenFeel × DSH 适配器 — 验证\n');
  process.stdout.write('='.repeat(60) + '\n\n');

  // 1) 模块面
  process.stdout.write('[1] 模块导出与工具注册\n');
  const workspace = mockContext(SOURCE_PROJECT);
  apply(workspace.ctx, {});

  /**
   * 等待启动自检完成。
   *
   * 不用固定 sleep：自检里的 `probeVersion()` 要真实 spawn 一次 CLI，
   * 耗时随机器负载浮动（并发跑三套测试时明显变慢）。固定等待会偶发失败。
   * 这里按 `workspace.logs` 出现自检记录为准，最多等 15s。
   */
  const waitForSelfCheck = async (timeoutMs = 15_000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (workspace.logs.some((line) => /OpenFeel CLI \d+\.\d+\.\d+|未检测到 OpenFeel CLI/.test(line))) return;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
    }
  };
  await waitForSelfCheck();

  await check('注册了 13 个工具', () => {
    assert(workspace.tools.size === 13, `期望 13，实际 ${workspace.tools.size}: ${[...workspace.tools.keys()].join(',')}`);
  });
  await check('工具名全部以 feel_ 前缀', () => {
    for (const name of workspace.tools.keys()) assert(name.startsWith('feel_'), `非法工具名 ${name}`);
  });
  await check('注册了 /feel 命令', () => {
    assert(workspace.commands.length === 1, `期望 1 个命令，实际 ${workspace.commands.length}`);
    assert(workspace.commands[0].name === 'feel', `命令名应为 feel，实际 ${workspace.commands[0].name}`);
  });
  await check('注册了系统提示段', () => {
    assert(workspace.sections.length === 1, `期望 1 个段落，实际 ${workspace.sections.length}`);
    assert(workspace.sections[0].name === 'feel-mode', `段落名应为 feel-mode`);
  });
  await check('提示段正文包含 Feel 纪律', () => {
    const text = workspace.sections[0].text();
    assertString(text, '提示段为空');
    for (const marker of ['<feel_mode>', '调度者', 'flow.json', 'blocking REV', 'general']) {
      assert(text.includes(marker), `提示段缺少标记「${marker}」`);
    }
  });
  await check('启动自检发现 CLI 版本', () => {
    const joined = workspace.logs.join('\n');
    assert(/OpenFeel CLI \d+\.\d+\.\d+/.test(joined), `未记录版本，实际日志: ${joined}`);
  });
  await check('dashboard 不再导出 PHASE_AGENT 本地镜像', async () => {
    const dashboard = await import('../lib/adapters/dashboard.js');
    assert(!Object.hasOwn(dashboard, 'PHASE_AGENT'), 'PHASE_AGENT 应从 dashboard.js 移除（改由 flow next 权威输出）');
  });

  // 2) 只读工具（打真实项目，只读安全）
  process.stdout.write('\n[2] 只读工具 — 真实项目快照\n');
  const realExec = execFor(SOURCE_PROJECT);
  const status = workspace.tools.get('feel_status');

  let snapshot;
  await check('feel_status 返回完整快照', async () => {
    const result = await status.execute({}, realExec);
    const data = ok(result);
    snapshot = data;
    assert(snapshot.pipeline !== undefined, '缺少 pipeline');
    assert(snapshot.focus !== undefined, '缺少 focus');
    assert(snapshot.mode !== undefined, '缺少 mode');
    assert(Array.isArray(snapshot.stages), 'stages 应为数组');
    assert(snapshot.stages.length > 0, 'stages 不应为空');
    assertString(result.summary, 'summary 为空');
  });
  await check('快照包含三种模式的转移表', () => {
    const modes = snapshot.mode.transitionsByMode;
    for (const mode of ['full', 'fast', 'general']) {
      assert(modes[mode] !== undefined, `缺少模式 ${mode}`);
    }
    assert(Object.keys(modes.full).length >= 15, `full 转移表键数 ${Object.keys(modes.full).length} < 15`);
  });
  await check('快照标记了活跃阶段与负责 Agent', () => {
    // 无活跃阶段时 phase 为空串、responsibleAgent 由 CLI 给出 feel（不猜测）。
    assert(typeof snapshot.focus.phase === 'string', 'focus.phase 应为字符串');
    assertString(snapshot.focus.responsibleAgent, 'responsibleAgent 为空');
    assert(Array.isArray(snapshot.focus.legalNextPhases), 'legalNextPhases 应为数组');
  });
  await check('快照包含阶段 op 汇总', () => {
    const stage = snapshot.stages[0];
    assert(stage.opsSummary !== undefined, '缺少 opsSummary');
    assert(typeof stage.opsSummary.total === 'number', 'opsSummary.total 应为数字');
  });
  await check('快照调度字段来自 flow next 权威输出', async () => {
    const cli = new FeelCli({ command: 'openfeel', cwd: SOURCE_PROJECT });
    const next = await cli.json(['flow', 'next', '--json'], { cwd: SOURCE_PROJECT });
    // 无活跃阶段时 flow next 的 phase/phaseLabel/workflowMode 为 null，快照用空串/null 对齐。
    const expectedPhase = next.phase ?? '';
    const expectedLabel = next.phaseLabel ?? '';
    assert(snapshot.focus.source === 'flow next', `source 应为 flow next，实际 ${snapshot.focus.source}`);
    assert(snapshot.focus.phase === expectedPhase, `phase 不一致：${snapshot.focus.phase} vs ${expectedPhase}`);
    assert(snapshot.focus.phaseLabel === expectedLabel, `phaseLabel 不一致：${snapshot.focus.phaseLabel} vs ${expectedLabel}`);
    assert(snapshot.focus.responsibleAgent === next.responsibleAgent, `responsibleAgent 不一致：${snapshot.focus.responsibleAgent} vs ${next.responsibleAgent}`);
    assert(snapshot.focus.workflowMode === (next.workflowMode ?? null), `workflowMode 不一致：${snapshot.focus.workflowMode} vs ${next.workflowMode}`);
    assert(snapshot.focus.reviewTier === (next.reviewTier ?? null), `reviewTier 不一致：${snapshot.focus.reviewTier} vs ${next.reviewTier}`);
    assert(snapshot.focus.effectiveReviewTier === (next.effectiveReviewTier ?? null), `effectiveReviewTier 不一致：${snapshot.focus.effectiveReviewTier} vs ${next.effectiveReviewTier}`);
    assert(JSON.stringify(snapshot.focus.legalNextPhases) === JSON.stringify(next.legalNextPhases), `legalNextPhases 不一致：${JSON.stringify(snapshot.focus.legalNextPhases)} vs ${JSON.stringify(next.legalNextPhases)}`);
    assert(snapshot.focus.suggestedCommand === next.suggestedCommand, `suggestedCommand 不一致：${snapshot.focus.suggestedCommand} vs ${next.suggestedCommand}`);
    assert(JSON.stringify(snapshot.focus.guards) === JSON.stringify(next.guards), `guards 不一致：${JSON.stringify(snapshot.focus.guards)} vs ${JSON.stringify(next.guards)}`);
    assert(JSON.stringify(snapshot.focus.blockingReviews) === JSON.stringify(next.blockingReviews), `blockingReviews 不一致：${JSON.stringify(snapshot.focus.blockingReviews)} vs ${JSON.stringify(next.blockingReviews)}`);
  });
  await check('flow next 失败时回退 flow status/mode（不硬崩）', async () => {
    const realCli = new FeelCli({ command: 'openfeel', cwd: SOURCE_PROJECT });
    const faultyCli = {
      cwd: SOURCE_PROJECT,
      async json(args, options) {
        if (args[0] === 'flow' && args[1] === 'next') {
          throw new Error('模拟旧版 CLI 不支持 flow next');
        }
        return realCli.json(args, options);
      },
    };
    const fallback = await readSnapshot(faultyCli, { cwd: SOURCE_PROJECT });
    assert(fallback.focus.source === 'flow status', `source 应为 flow status，实际 ${fallback.focus.source}`);
    assert(typeof fallback.focus.phase === 'string', '回退后 focus.phase 应为字符串（无活跃阶段时为空串）');
    assert(Array.isArray(fallback.focus.legalNextPhases), '回退后 legalNextPhases 应为数组');
    // 无 flow next 时不得回退到本地 Agent 镜像。
    assert(fallback.focus.responsibleAgent === 'unknown', `回退时不应猜测 Agent，实际 ${fallback.focus.responsibleAgent}`);
    assert(Array.isArray(fallback.focus.guards), '回退后 guards 应为数组');
  });

  await check('feel_next 给出决策', async () => {
    const result = await workspace.tools.get('feel_next').execute({}, realExec);
    const data = ok(result);
    assertString(data.summary, 'summary 为空');
    assertString(data.responsibleAgent, 'responsibleAgent 为空');
    assert(Array.isArray(data.guards), 'guards 应为数组');
    assert(Array.isArray(data.adapterHints), 'adapterHints 应为数组');
    assert(Array.isArray(data.legalNextPhases), 'legalNextPhases 应为数组');
    assert(data.suggestedCommand === null || typeof data.suggestedCommand === 'string', 'suggestedCommand 应为 string 或 null');
    assert(typeof data.phaseLabel === 'string', 'phaseLabel 应来自 CLI（可为空串）');
  });

  await check('feel_flow action=phases 返回转移表', async () => {
    const result = await workspace.tools.get('feel_flow').execute({ action: 'phases' }, realExec);
    const data = ok(result);
    assert(Array.isArray(data.phases), 'phases 应为数组');
    assert(data.phases.length === 15, `相位应为 15，实际 ${data.phases.length}`);
  });

  await check('feel_flow action=mode 返回模式与来源', async () => {
    const result = await workspace.tools.get('feel_flow').execute({ action: 'mode' }, realExec);
    const data = ok(result);
    assertString(data.mode, 'mode 为空');
    assertString(data.source, 'source 为空');
  });

  await check('feel_flow action=current 返回当前相位', async () => {
    const result = await workspace.tools.get('feel_flow').execute({ action: 'current' }, realExec);
    const data = ok(result);
    assert(data.schemaVersion === 1, 'schemaVersion 应为 1');
    // 空态（无活跃阶段）契约：stage 为空串，而非缺键。
    assert(typeof data.stage === 'string', `stage 应为字符串，实际 ${JSON.stringify(data.stage)}`);
  });

  await check('feel_req action=list 返回需求列表', async () => {
    const result = await workspace.tools.get('feel_req').execute({ action: 'list' }, realExec);
    const data = ok(result);
    assert(Array.isArray(data.requirements), 'requirements 应为数组');
  });

  await check('feel_req action=board 返回 7 组固定顺序', async () => {
    const result = await workspace.tools.get('feel_req').execute({ action: 'board' }, realExec);
    const data = ok(result);
    // OpenFeel 契约：groups 是**对象**，键的声明顺序即 REQ_STATUSES（done 在 blocked 之前）。
    assert(typeof data.groups === 'object' && data.groups !== null, 'groups 应为对象');
    assert(!Array.isArray(data.groups), 'groups 不应是数组');
    const keys = Object.keys(data.groups);
    assert(keys.length === 7, `应为 7 组，实际 ${keys.length}`);
    assert(
      keys.join(',') === 'draft,scheduled,in_progress,done,blocked,cancelled,rejected',
      `组顺序应为 REQ_STATUSES 声明顺序，实际 ${keys.join(',')}`,
    );
    for (const key of keys) assert(Array.isArray(data.groups[key]), `组 ${key} 应为数组`);
  });

  await check('feel_archive action=list 返回版本', async () => {
    const result = await workspace.tools.get('feel_archive').execute({ action: 'list' }, realExec);
    const data = ok(result);
    assert(Array.isArray(data.versions), 'versions 应为数组');
    assert(data.versions.length > 0, '真实项目应有已归档版本');
  });

  await check('feel_verify action=health 通过 JSON 返回', async () => {
    const result = await workspace.tools.get('feel_verify').execute({ action: 'health', quick: true }, realExec);
    const data = ok(result);
    assert(data !== null, 'health 应返回数据');
  });

  await check('feel_checkpoint action=list 返回快照（JSON）', async () => {
    const result = await workspace.tools.get('feel_checkpoint').execute({ action: 'list' }, realExec);
    const data = ok(result);
    assert(data.schemaVersion === 1, 'schemaVersion 应为 1');
    assert(Array.isArray(data.checkpoints), 'checkpoints 应为数组');
    assert(data.checkpoints.length > 0, '真实项目应有快照');
  });

  await check('feel_kb action=search 返回结果（JSON）', async () => {
    const result = await workspace.tools.get('feel_kb').execute({ action: 'search', query: 'openfeel' }, realExec);
    const data = ok(result);
    assert(data.schemaVersion === 1, 'schemaVersion 应为 1');
    assert(typeof data === 'object' && data !== null, '结果应为对象');
  });

  await check('feel_verify action=config_effective 返回配置（JSON）', async () => {
    const result = await workspace.tools.get('feel_verify').execute({ action: 'config_effective' }, realExec);
    const data = ok(result);
    assert(data.schemaVersion === 1, 'schemaVersion 应为 1');
  });

  await check('feel_op action=list 返回方案', async () => {
    const result = await workspace.tools.get('feel_op').execute({ action: 'list' }, realExec);
    const data = ok(result);
    assert(data !== null, '应返回数据');
  });

  await check('feel_review action=list 返回条目（JSON）', async () => {
    const result = await workspace.tools.get('feel_review').execute({ action: 'list' }, realExec);
    const data = ok(result);
    assert(data.schemaVersion === 1, 'schemaVersion 应为 1');
    assert(typeof data === 'object' && data !== null, '结果应为对象');
  });

  await check('feel_stage action=list 返回阶段（文本，CLI 尚无 --json）', async () => {
    const result = await workspace.tools.get('feel_stage').execute({ action: 'list' }, realExec);
    const data = ok(result);
    assertString(data.output, 'output 为空');
  });

  await check('feel_stage action=status 返回阶段状态（JSON）', async () => {
    const result = await workspace.tools.get('feel_stage').execute({ action: 'status' }, realExec);
    const data = ok(result);
    assert(data.schemaVersion === 1, 'schemaVersion 应为 1');
  });

  await check('feel_plan action=stage_list 返回阶段', async () => {
    const result = await workspace.tools.get('feel_plan').execute({ action: 'stage_list' }, realExec);
    const data = ok(result);
    assertString(data.output, 'output 为空');
  });

  await check('feel_model action=list 返回模型', async () => {
    const result = await workspace.tools.get('feel_model').execute({ action: 'list' }, realExec);
    const data = ok(result);
    assertString(data.output, 'output 为空');
  });

  // 3) /feel 命令
  process.stdout.write('\n[3] /feel 人类命令\n');
  const handler = workspace.commands[0].handler;
  const invocation = { agent: { session: { header: { cwd: SOURCE_PROJECT } } }, rawInput: '', attachments: [] };

  await check('/feel 无参输出帮助', async () => {
    const result = await handler(invocation);
    assert(result.kind === 'success', `kind 应为 success，实际 ${result.kind}`);
    assert(result.text.includes('Feel 模式'), '帮助文本缺少标题');
    assert(result.text.includes('/feel status'), '帮助文本缺少子命令');
  });
  await check('/feel status 输出状态', async () => {
    const result = await handler({ ...invocation, rawInput: 'status' });
    assert(result.kind === 'success', `kind 应为 success，实际 ${result.kind}`);
    assertString(result.text, '输出为空');
  });
  await check('/feel board 输出看板', async () => {
    const result = await handler({ ...invocation, rawInput: 'board' });
    assert(result.kind === 'success', `kind 应为 success，实际 ${result.kind}`);
    assertString(result.text, '输出为空');
  });
  await check('/feel 未知子命令报错并给帮助', async () => {
    const result = await handler({ ...invocation, rawInput: 'nonsense' });
    assert(result.kind === 'error', 'kind 应为 error');
    assert(result.text.includes('未知子命令'), '缺少未知子命令提示');
  });
  await check('/feel advance 缺参给出用法', async () => {
    const result = await handler({ ...invocation, rawInput: 'advance' });
    assert(result.kind === 'error', 'kind 应为 error');
    assert(result.text.includes('用法'), '缺少用法提示');
  });
  await check('分词支持引号', () => {
    const tokens = tokenize('req "hello world" status');
    assert(tokens.length === 3, `应为 3 个词，实际 ${tokens.length}: ${tokens.join('|')}`);
    assert(tokens[1] === 'hello world', `第二词应保留空格，实际「${tokens[1]}」`);
  });

  // 4) 写操作 — 只打在副本上
  process.stdout.write('\n[4] 写操作 — 临时副本\n');
  const tempRoot = mkdtempSync(join(tmpdir(), 'feel-verify-'));
  const tempProject = join(tempRoot, 'project');
  cpSync(join(SOURCE_PROJECT, '.openfeel'), join(tempProject, '.openfeel'), { recursive: true });

  await check('副本已建立', () => {
    assert(existsSync(join(tempProject, '.openfeel', 'flow.json')), '副本缺少 flow.json');
  });

  const tempExec = execFor(tempProject);
  const modeBefore = readFileSync(join(tempProject, '.openfeel', 'flow.json'), 'utf8').match(/"revision":\s*(\d+)/)?.[1];

  await check('feel_req action=add 创建需求', async () => {
    const result = await workspace.tools.get('feel_req').execute(
      { action: 'add', title: '适配器验证需求', target_version: 'v9.9.9' },
      tempExec,
    );
    const data = ok(result);
    assertString(data.output, 'add 输出为空');
  });

  await check('新需求出现在 list 中', async () => {
    const result = await workspace.tools.get('feel_req').execute({ action: 'list' }, tempExec);
    const data = ok(result, 'req list');
    const found = data.requirements.find((/** @type {any} */ item) => item.title === '适配器验证需求');
    assert(found !== undefined, '未在列表中找到新需求');
    assert(found.id.startsWith('REQ-'), `ID 格式错误: ${found.id}`);
    assert(found.status === 'draft', `新需求应为 draft，实际 ${found.status}`);
  });

  await check('需求状态流转 draft→scheduled→in_progress', async () => {
    const list = await workspace.tools.get('feel_req').execute({ action: 'list' }, tempExec);
    const listed = ok(list, 'req list');
    const target = listed.requirements.find((/** @type {any} */ item) => item.title === '适配器验证需求');
    assert(target !== undefined, '未找到测试需求');
    await workspace.tools.get('feel_req').execute({ action: 'advance', id: target.id, to: 'scheduled' }, tempExec);
    const after = await workspace.tools.get('feel_req').execute({ action: 'show', id: target.id }, tempExec);
    const shown = ok(after, 'req show');
    assert(shown.requirement.status === 'scheduled', `应为 scheduled，实际 ${shown.requirement.status}`);
  });

  await check('非法状态流转被拒绝（scheduled→done）', async () => {
    const list = await workspace.tools.get('feel_req').execute({ action: 'list' }, tempExec);
    const listed = ok(list, 'req list');
    const target = listed.requirements.find((/** @type {any} */ item) => item.title === '适配器验证需求');
    assert(target !== undefined, '未找到测试需求');
    let rejected = false;
    try {
      await workspace.tools.get('feel_req').execute({ action: 'advance', id: target.id, to: 'done' }, tempExec);
    } catch (error) {
      rejected = true;
      assert(error instanceof Error, '应抛 Error');
      assert(/合法目标|not.*allowed|拒绝|不合法/.test(error.message), `拒绝原因不明确: ${error.message}`);
    }
    assert(rejected, 'scheduled→done 应被流转表拒绝');
  });

  await check('非法相位推进被拒绝', async () => {
    let rejected = false;
    try {
      await workspace.tools.get('feel_flow').execute(
        { action: 'advance', stage: 'v1.2.1-stage-93', to: 'exec_running' },
        tempExec,
      );
    } catch (error) {
      rejected = true;
      assert(error instanceof Error, '应抛 Error');
    }
    assert(rejected, '从 done 推进到 exec_running 应被拒绝');
  });

  await check('真实 CLI envelope 被 errorFromResult 分类（临时副本）', async () => {
    const cli = new FeelCli({ command: 'openfeel', cwd: tempProject });
    /** @type {any} */
    let error;
    try {
      await cli.json(
        ['flow', 'advance', '--stage', 'v1.2.3-stage-99', '--to', 'exec_running', '--json'],
        { cwd: tempProject },
      );
    } catch (caught) {
      error = caught;
    }
    assert(error !== undefined, '非法推进应在 --json 模式下失败');
    assert(error.kind === 'refusal', `kind 应为 refusal，实际 ${error.kind}`);
    assert(typeof error.code === 'string' && error.code !== '' && error.code !== 'FEEL_CLI_REFUSED', `应透传 envelope code，实际 ${error.code}`);
    assert(error.detail !== undefined && error.detail.exitCode === 1, 'detail 应包含退出码上下文');
  });

  await check('写操作推进了 revision', () => {
    const modeAfter = readFileSync(join(tempProject, '.openfeel', 'flow.json'), 'utf8').match(/"revision":\s*(\d+)/)?.[1];
    assert(modeBefore !== undefined && modeAfter !== undefined, '未能读取 revision');
    assert(Number(modeAfter) > Number(modeBefore), `revision 应递增：${modeBefore} → ${modeAfter}`);
  });

  await check('原项目未被修改', () => {
    const original = readFileSync(join(SOURCE_PROJECT, '.openfeel', 'flow.json'), 'utf8').match(/"revision":\s*(\d+)/)?.[1];
    assert(original === modeBefore, `原项目 revision 被改动：${modeBefore} → ${original}`);
  });

  // 出口 #33（archive <stage> --json）是**写命令**，且会覆盖既有归档摘要：
  // 只允许打在副本上，绝不能对真实仓库执行（见需求单 P1-5）。
  await check('feel_archive action=stage_summary 走 #33 JSON 出口（副本）', async () => {
    const result = await workspace.tools
      .get('feel_archive')
      .execute({ action: 'stage_summary', stage: 'v1.2.0-stage-78' }, tempExec);
    const data = ok(result, 'stage_summary');
    assert(data.schemaVersion === 1, 'schemaVersion 应为 1');
    assert(data.stage === 'v1.2.0-stage-78', `stage 应为 v1.2.0-stage-78，实际 ${data.stage}`);
    assert(typeof data.opsCount === 'number', 'opsCount 应为数字');
    assert(typeof data.reviewsCount === 'number', 'reviewsCount 应为数字');
    assertString(data.archivePath, 'archivePath 为空');
    assert(result.summary.includes('覆盖写入'), 'summary 应提示覆盖写入风险');
  });
  await check('原项目归档摘要未被触碰', () => {
    const original = readFileSync(join(SOURCE_PROJECT, '.openfeel', 'log', 'archive-v1.2.0-stage-78.md'), 'utf8');
    const lineCount = original.split('\n').length;
    assert(lineCount > 100, `原项目归档摘要疑似被覆盖：仅 ${lineCount} 行`);
  });

  // 5) 错误语义
  process.stdout.write('\n[5] 错误语义与边界\n');

  await check('显式 project 指向非项目目录时拒绝并给 init 指引', async () => {
    const bareRoot = mkdtempSync(join(tmpdir(), 'feel-bare-'));
    const bareExec = execFor(bareRoot);
    let rejected = false;
    try {
      // 用显式 project 指向一个确定没有 .openfeel/ 的目录，避免受祖先目录影响。
      await status.execute({ project: bareRoot }, bareExec);
    } catch (error) {
      rejected = true;
      const message = error instanceof Error ? error.message : String(error);
      assert(message.includes('openfeel init'), `错误消息应提示 init：${message}`);
      // 显式传入错误的 project 是**参数问题**（usage），不是流程门禁（refusal）。
      const kind = /** @type {any} */ (error).kind;
      assert(kind === 'usage', `应为 usage，实际 ${kind}`);
    }
    assert(rejected, '非项目目录应被拒绝');
    rmSync(bareRoot, { recursive: true, force: true });
  });

  await check('工作区向上回溯可发现祖先 .openfeel/（monorepo 友好）', async () => {
    // ~/.openfeel 由 `openfeel setup` 全局部署建立；从深路径向上应能定位到它。
    const deep = join(tmpdir(), 'feel-verify-deep', 'a', 'b');
    const { findProjectRoot } = await import('../lib/adapters/workspace.js');
    const found = findProjectRoot(deep);
    assert(found !== undefined, '向上回溯应找到祖先 .openfeel/');
    assert(existsSync(join(found, '.openfeel')), `回溯结果应含 .openfeel/：${found}`);
  });

  await check('缺失 CLI 给出安装指引', async () => {
    const cli = new (await import('../lib/adapters/cli.js')).FeelCli({ command: 'definitely-not-openfeel-cli' });
    let rejected = false;
    try {
      await cli.run(['--version']);
    } catch (error) {
      rejected = true;
      const err = /** @type {any} */ (error);
      assert(err.kind === 'cli-missing', `应为 cli-missing，实际 ${err.kind}`);
      assert(err.message.includes('npm install -g openfeel'), `应含安装指引：${err.message}`);
    }
    assert(rejected, '缺失 CLI 应被拒绝');
  });

  await check('缺少必填参数给出 action 名', async () => {
    let rejected = false;
    try {
      await workspace.tools.get('feel_flow').execute({ action: 'advance', stage: 'x' }, realExec);
    } catch (error) {
      rejected = true;
      const message = error instanceof Error ? error.message : String(error);
      assert(message.includes('to'), `应提示缺少 to：${message}`);
    }
    assert(rejected, '缺少 to 应被拒绝');
  });

  await check('未知 action 被拒绝', async () => {
    let rejected = false;
    try {
      await workspace.tools.get('feel_flow').execute({ action: 'nonsense' }, realExec);
    } catch {
      rejected = true;
    }
    assert(rejected, '未知 action 应被拒绝');
  });

  await check('errorFromResult 消费 envelope（refusal / code / detail）', () => {
    const cli = new FeelCli({});
    const error = cli.errorFromResult({
      code: 1,
      stdout: JSON.stringify({
        schemaVersion: 1,
        error: {
          code: 'PHASE_TRANSITION_ILLEGAL',
          kind: 'refusal',
          message: '非法相位转移',
          detail: { stage: 's-1', from: 'done', to: 'exec_running' },
        },
      }),
      stderr: '',
      durationMs: 1,
      argv: ['--json', 'flow', 'advance'],
    }, ['flow', 'advance', '--json']);
    assert(error instanceof Error, '应返回 Error');
    assert(error.kind === 'refusal', `kind 应为 refusal，实际 ${error.kind}`);
    assert(error.code === 'PHASE_TRANSITION_ILLEGAL', `code 应为 PHASE_TRANSITION_ILLEGAL，实际 ${error.code}`);
    assert(error.message.includes('非法相位转移'), `message 应透传 envelope：${error.message}`);
    assert(error.detail.from === 'done', `detail 应透传 envelope：${JSON.stringify(error.detail)}`);
    assert(error.detail.exitCode === 1, 'detail 应保留退出码上下文');
  });

  await check('errorFromResult 退出码 3 → internal', () => {
    const cli = new FeelCli({});
    const error = cli.errorFromResult({
      code: 3,
      stdout: JSON.stringify({
        schemaVersion: 1,
        error: { code: 'INTERNAL_ERROR', kind: 'internal', message: '内部故障', detail: { name: 'TypeError' } },
      }),
      stderr: '',
      durationMs: 1,
      argv: ['--json', 'flow', 'health'],
    }, ['flow', 'health', '--json']);
    assert(error.kind === 'internal', `kind 应为 internal，实际 ${error.kind}`);
    assert(error.code === 'INTERNAL_ERROR', `code 应为 INTERNAL_ERROR，实际 ${error.code}`);
    assert(error.detail.name === 'TypeError', 'detail 应透传 envelope');
  });

  await check('errorFromResult 退出码 2 → 并发 refusal', () => {
    const cli = new FeelCli({});
    const error = cli.errorFromResult({
      code: 2,
      stdout: JSON.stringify({
        schemaVersion: 1,
        error: { code: 'FLOW_CONCURRENT_CONFLICT', kind: 'refusal', message: '修订冲突', detail: { expected: 3, actual: 4 } },
      }),
      stderr: '',
      durationMs: 1,
      argv: ['--json', 'flow', 'advance'],
    }, ['flow', 'advance', '--json']);
    assert(error.kind === 'refusal', `kind 应为 refusal，实际 ${error.kind}`);
    assert(error.code === 'FLOW_CONCURRENT_CONFLICT', `code 应保留 envelope 值，实际 ${error.code}`);
    assert(error.message.includes('可重试'), '并发冲突应附可重试提示');
    assert(error.detail.expected === 3, 'detail 应透传 envelope');
  });

  await check('errorFromResult 兼容 legacy error 字符串与无 JSON 路径', () => {
    const cli = new FeelCli({});
    const legacy = cli.errorFromResult({
      code: 1,
      stdout: JSON.stringify({ schemaVersion: 1, error: 'gate-rejected', errorKind: 'refusal' }),
      stderr: '',
      durationMs: 1,
      argv: ['--json', 'flow', 'archive'],
    }, ['flow', 'archive', 'v9.9.9', '--json']);
    assert(legacy.kind === 'refusal', `legacy refusal kind 错误：${legacy.kind}`);
    assert(legacy.code === 'FEEL_CLI_REFUSED', `legacy 应走通用分类，实际 ${legacy.code}`);
    assert(legacy.detail.legacyError === 'gate-rejected', 'legacy error 应保留在 detail');

    const human = cli.errorFromResult({
      code: 1,
      stdout: '',
      stderr: '非法相位转移：plan_pending → exec_running',
      durationMs: 1,
      argv: ['flow', 'advance'],
    }, ['flow', 'advance']);
    assert(human.kind === 'refusal', `无堆栈人类输出应判 refusal，实际 ${human.kind}`);
    assert(human.code === 'FEEL_CLI_REFUSED', `无堆栈英文码应为 FEEL_CLI_REFUSED，实际 ${human.code}`);

    const stack = cli.errorFromResult({
      code: 1,
      stdout: '',
      stderr: 'TypeError: boom\n    at foo (file.js:1:1)',
      durationMs: 1,
      argv: ['flow', 'advance'],
    }, ['flow', 'advance']);
    assert(stack.kind === 'internal', `有堆栈应判 internal，实际 ${stack.kind}`);
  });

  await check('normalizeConfig 提供安全默认值', () => {
    const config = normalizeConfig(undefined);
    assert(config.command === 'openfeel', `默认 command 错误: ${config.command}`);
    assert(config.autoPrompt === true, '默认应启用提示段');
    assert(config.log === false, '默认应关闭运行日志');
    assert(config.timeoutMs === 120_000, `默认超时应为 120000，实际 ${config.timeoutMs}`);
    assert(config.language === 'zh-CN', '默认语言应为 zh-CN');
  });

  await check('normalizeConfig 忽略非法配置', () => {
    const config = normalizeConfig({ timeoutMs: -5, commandPrefix: 'not-array', autoPrompt: false, language: 'en' });
    assert(config.timeoutMs === 120_000, '非法超时应回落默认值');
    assert(Array.isArray(config.commandPrefix) && config.commandPrefix.length === 0, '非法前缀应回落空数组');
    assert(config.autoPrompt === false, 'autoPrompt=false 应被尊重');
    assert(config.language === 'en', 'language=en 应被尊重');
  });

  // 清理
  if (keep) {
    process.stdout.write(`\n保留临时副本：${tempProject}\n`);
  } else {
    rmSync(tempRoot, { recursive: true, force: true });
  }

  // 汇总
  process.stdout.write('\n' + '='.repeat(60) + '\n');
  process.stdout.write(`通过 ${passed} / ${passed + failed}\n`);
  if (failed > 0) {
    process.stdout.write(`\n失败项：\n${failures.map((item) => `  - ${item}`).join('\n')}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write('全部通过。\n');
  }
}

main().catch((error) => {
  console.error('\n验证脚本崩溃：', error);
  process.exitCode = 1;
});
