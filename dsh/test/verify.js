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

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { normalizeConfig, apply } from '../lib/index.js';
import { FeelCli } from '../lib/adapters/cli.js';
import { planNextStep, readSnapshot } from '../lib/adapters/dashboard.js';
import { tokenize } from '../lib/surface/command.js';
import { renderFeelPrompt } from '../lib/surface/prompt.js';
import { computeWorkflowGate, headlineWarning, workflowGateTitle } from '../lib/adapters/workflow-gate.js';
import { resolveFeelMode } from '../lib/adapters/feel-mode.js';
import { createTools, guardWarnings } from '../lib/tools/index.js';
import { buildGuardSection, computeGuardStale, readGuardState, writeGuardState } from '../lib/adapters/guard-state.js';
import { buildObservability } from '../lib/adapters/observability.js';
import { appendDispatch, closeDispatch, dispatchLedgerPath, dispatchSummary, pruneDispatches, readDispatches } from '../lib/adapters/dispatch-ledger.js';
import {
  REMINDER_CONTEXT_NAME,
  deriveNextAction,
  nextActionLine,
  noteToolCall,
  reminderText,
  resetReminderState,
  toWireNext,
} from '../lib/adapters/next-action.js';
import { assertRealGuardUntouched, installIsolatedGuardEnv, snapshotRealGuardState } from './guard-isolation.js';
// v1.7.0 / REQ-065 A65.1：需求正文字段口径与 CLI 测试**共用同一份导出**
// （`test/fixtures/requirement-input.js`，纯 ESM、零依赖；不是注释声明，也不是各拼一份常量）。
import { makeFilledBodyInput, makeFilledRequirement } from '../../test/fixtures/requirement-input.js';

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
  /** @type {Array<(execution: any) => string | undefined>} */
  const guards = [];
  /** @type {Array<() => void>} */
  const effects = [];
  /** @type {string[]} */
  const logs = [];

  // 提示段在装配期没有 cwd 入参（AssembleContext = { scope?, signal? }），
  // 只能经 agents.currentInitiator() 反查会话。这里给一个最小替身。
  const agent = { session: { header: { cwd } } };
  const services = new Map([['agents', { currentInitiator: () => agent }]]);

  const ctx = {
    /** @param {string} name */
    get: (name) => services.get(name),
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
      /** @param {(execution: any) => string | undefined} guard */
      guard: (guard) => {
        guards.push(guard);
        return () => {
          const index = guards.indexOf(guard);
          if (index >= 0) guards.splice(index, 1);
        };
      },
    },
    /** @param {() => (() => void) | void} effect */
    effect: (effect) => {
      const dispose = effect();
      const cleanup = () => {
        if (typeof dispose === 'function') dispose();
      };
      effects.push(cleanup);
      return cleanup;
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

  return { ctx, tools, commands, sections, guards, effects, logs, cwd, services };
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
  // v1.5.12 / stage-127 §3-B：先把 guard 状态与宿主 marker 指到临时目录，绝不可改写真实状态。
  const iso = installIsolatedGuardEnv();
  const realGuardBefore = snapshotRealGuardState();
  const keep = process.argv.includes('--keep');

  process.stdout.write('\nOpenFeel × DSH 适配器 — 验证\n');
  process.stdout.write('='.repeat(60) + '\n\n');

  // 1) 模块面
  process.stdout.write('[1] 模块导出与工具注册\n');
  const workspace = mockContext(SOURCE_PROJECT);
  apply(workspace.ctx, {});
  assert(workspace.guards.length === 1, `应注册 1 个写入门禁，实际 ${workspace.guards.length}`);

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

  await check('注册了 15 个工具', () => {
    assert(workspace.tools.size === 15, `期望 15，实际 ${workspace.tools.size}: ${[...workspace.tools.keys()].join(',')}`);
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
  await check('提示段正文包含 Feel 纪律（v1.6.0 精简版）', () => {
    const text = workspace.sections[0].text();
    assertString(text, '提示段为空');
    for (const marker of ['<feel_mode>', '调度者', 'feel_dispatch', 'REQ_BODY_GATE', '≤10 行', 'feel_status']) {
      assert(text.includes(marker), `提示段缺少标记「${marker}」`);
    }
  });
  await check('提示段已移除版本号 / shell 档位 / 退出码（v1.6.0 / A10）', () => {
    for (const language of ['zh-CN', 'en']) {
      const text = renderFeelPrompt({ language, detected: true, projectRoot: SOURCE_PROJECT });
      assert(!/v\d+\.\d+\.\d+/.test(text), `${language} 提示段仍含版本号`);
      assert(!text.includes('Git Bash'), `${language} 提示段仍含 shell 档位`);
      assert(!text.includes('退出码'), `${language} 提示段仍含退出码口径`);
    }
  });
  await check('A10：提示段 ≤1200 字符 / ≤25 行（中英 × enabled/disabled）', () => {
    for (const language of ['zh-CN', 'en']) {
      for (const value of ['enabled', 'disabled']) {
        // A10 命令口径（未传 detected）：渲染后总数含 Free Mode 附录
        const plain = renderFeelPrompt({ language, feelMode: { value } });
        assert(plain.length <= 1200, `${language}/${value} 提示段 ${plain.length} 字符 > 1200`);
        assert(plain.split('\n').length <= 25, `${language}/${value} 提示段 ${plain.split('\n').length} 行 > 25`);
        // 已初始化口径（带 projectRoot）：路径不得把预算顶破
        const detected = renderFeelPrompt({ language, detected: true, projectRoot: SOURCE_PROJECT, feelMode: { value } });
        assert(detected.length <= 1200, `${language}/${value} detected 态 ${detected.length} 字符 > 1200`);
        assert(detected.split('\n').length <= 25, `${language}/${value} detected 态 ${detected.split('\n').length} 行 > 25`);
      }
    }
  });
  await check('启动自检发现 CLI 版本', () => {
    const joined = workspace.logs.join('\n');
    assert(/OpenFeel CLI \d+\.\d+\.\d+/.test(joined), `未记录版本，实际日志: ${joined}`);
  });

  // v1.5.17：feel_mode 镜像解析 + 自由模式提示词
  await check('resolveFeelMode 镜像矩阵（项目 > 全局 > builtin；只认显式声明）', () => {
    const root = mkdtempSync(join(tmpdir(), 'feel-mode-matrix-'));
    const home = join(root, 'home');
    const project = join(root, 'project');
    mkdirSync(join(project, '.openfeel'), { recursive: true });
    mkdirSync(join(home, '.config', 'openfeel'), { recursive: true });
    const projectConfig = join(project, '.openfeel', 'config.yaml');
    const profile = join(home, '.config', 'openfeel', 'profile.yaml');

    // ① 无声明 → builtin（v1.5.18：builtin 默认宽松 disabled）
    assert(resolveFeelMode(project, { homeDir: home }).source === 'builtin', '无声明应 builtin');
    assert(resolveFeelMode(project, { homeDir: home }).value === 'disabled', 'v1.5.18 无声明应 disabled');

    // ② 仅项目 disabled → config.yaml
    writeFileSync(projectConfig, 'defaults:\n  execution_mode: auto\n  feel_mode: disabled # 关\n', 'utf-8');
    assert(JSON.stringify(resolveFeelMode(project, { homeDir: home })) === JSON.stringify({ value: 'disabled', source: 'config.yaml' }), '项目层');

    // ③ 项目 enabled 覆盖全局 disabled
    writeFileSync(projectConfig, 'defaults:\n  feel_mode: enabled\n', 'utf-8');
    writeFileSync(profile, 'preferences:\n  auto_advance: enabled\n  feel_mode: disabled\n', 'utf-8');
    assert(JSON.stringify(resolveFeelMode(project, { homeDir: home })) === JSON.stringify({ value: 'enabled', source: 'config.yaml' }), '项目覆盖全局');

    // ④ 仅全局 → profile.yaml
    writeFileSync(projectConfig, 'defaults:\n  execution_mode: auto\n', 'utf-8');
    assert(JSON.stringify(resolveFeelMode(project, { homeDir: home })) === JSON.stringify({ value: 'disabled', source: 'profile.yaml' }), '全局层');

    // ⑤ 非法项目值 → 回落全局
    writeFileSync(projectConfig, 'defaults:\n  feel_mode: maybe\n', 'utf-8');
    assert(resolveFeelMode(project, { homeDir: home }).source === 'profile.yaml', '非法项目值应回落 profile');

    // ⑥ profile 未显式声明 → 不得误判为 profile（DEFAULT_PROFILE 不注入）
    writeFileSync(profile, 'preferences:\n  auto_advance: enabled\n', 'utf-8');
    assert(resolveFeelMode(project, { homeDir: home }).source === 'builtin', '未显式声明不得算 profile');

    // ⑦ 更深嵌套不算 direct child（与 CLI yaml.parse 取值语义一致：defaults.nested.feel_mode ≠ defaults.feel_mode）
    writeFileSync(projectConfig, 'defaults:\n  nested:\n    feel_mode: disabled\n', 'utf-8');
    assert(resolveFeelMode(project, { homeDir: home }).source === 'builtin', '深层嵌套不得被识别为 direct child');

    // ⑧ flow 内联 map（CLI 能读到；镜像不得分叉）
    writeFileSync(projectConfig, 'defaults: { feel_mode: disabled }\n', 'utf-8');
    assert(
      JSON.stringify(resolveFeelMode(project, { homeDir: home })) === JSON.stringify({ value: 'disabled', source: 'config.yaml' }),
      'flow 内联 map 应被识别',
    );

    rmSync(root, { recursive: true, force: true });
  });

  await check('renderFeelPrompt：disabled 中/英含自由模式节且保留硬门；enabled 逐字不变', () => {
    const enabledZh = renderFeelPrompt({ language: 'zh-CN', detected: true, projectRoot: SOURCE_PROJECT });
    assert(!enabledZh.includes('自由模式'), 'enabled 不应出现自由模式节');
    assert(enabledZh.includes('Feel Mode（流程模式）已启用'), 'enabled zh 应以 Feel Mode（流程模式）称呼');
    // v1.5.17 回归锁定（字节级）：enabled 路径不得多出空行（曾出现 `\n\n\n##`）
    assert(enabledZh.includes('（已初始化 `.openfeel/`）。\n\n## 你的角色：调度者'), 'enabled zh 标题前应恰为一个空行');
    assert(!enabledZh.includes('\n\n\n'), 'enabled zh 不得出现连续三换行');
    const disabledZh = renderFeelPrompt({
      language: 'zh-CN', detected: true, projectRoot: SOURCE_PROJECT, feelMode: { value: 'disabled', source: 'config.yaml' },
    });
    assert(disabledZh.includes('Free Mode（自由模式）'), 'disabled zh 缺少 Free Mode（自由模式）字样');
    assert(disabledZh.includes('\n\n## Free Mode（feel_mode=disabled）'), 'disabled zh Free Mode 节前应恰为空行');
    assert(disabledZh.includes('不变。\n\n## 你的角色：调度者'), 'disabled zh 自由模式节后应恰为空行');
    for (const marker of ['可直接干活', '写入门禁仍生效', '`done` 门', '归档判据', 'flow.json']) {
      assert(disabledZh.includes(marker), `disabled zh 缺少标记「${marker}」`);
    }
    const disabledEn = renderFeelPrompt({
      language: 'en', detected: true, projectRoot: SOURCE_PROJECT, feelMode: { value: 'disabled', source: 'builtin' },
    });
    assert(disabledEn.includes('Free Mode'), 'disabled en 缺少 Free Mode 节');
    assert(disabledEn.includes('\n\n## Free Mode ('), 'disabled en 自由模式节前应恰为空行');
    for (const marker of ['optional', 'guard stays', 'unchanged']) {
      assert(disabledEn.includes(marker), `disabled en 缺少标记「${marker}」`);
    }
    const enabledEn = renderFeelPrompt({ language: 'en', detected: true, projectRoot: SOURCE_PROJECT, feelMode: { value: 'enabled', source: 'builtin' } });
    assert(!enabledEn.includes('Free mode'), 'enabled en 不应出现 Free mode');
    assert(enabledEn.includes('Feel Mode is active'), 'enabled en 应以 Feel Mode 称呼');
    assert(enabledEn.includes('`.openfeel/`).\n\n## Your role'), 'enabled en 标题前应恰为一个空行');
    assert(!enabledEn.includes('\n\n\n'), 'enabled en 不得出现连续三换行');
  });
  await check('nextAction：dispatch / command / idle 三态（v1.6.0 / A10）', () => {
    // ① 无开启阶段 → command（开阶段；不催任何执行）
    const noStage = deriveNextAction({ focus: { stage: '', phase: '' }, workflowGate: { required: true, reason: 'no-active-stage' } });
    assert(noStage.kind === 'command' && noStage.tool === 'feel_stage', `无阶段应为 command/feel_stage，实际 ${noStage.kind}/${noStage.tool}`);
    // ② exec_running 且本相位无派发记录 → dispatch（subagent + feel_dispatch）
    const needDispatch = deriveNextAction({
      focus: { stage: 's1', phase: 'exec_running', phaseLabel: '执行中', responsibleAgent: 'openfeel-executor', legalNextPhases: [] },
      recovery: { requirement: 'REQ-060' },
      dispatch: { sincePhase: 0, missingRoles: ['planner', 'executor', 'reviewer'] },
    });
    assert(needDispatch.kind === 'dispatch', `无派发记录应为 dispatch，实际 ${needDispatch.kind}`);
    assert(needDispatch.tool === 'subagent', 'dispatch.tool 应为 subagent');
    assert(needDispatch.goal.includes('REQ-060') && needDispatch.goal.includes('s1'), `dispatch.goal 应含真实阶段/需求：${needDispatch.goal}`);
    assert(needDispatch.prompt.includes('goal：') && needDispatch.prompt.includes('returnFormat：'), 'dispatch.prompt 应为四段式');
    assert(!/[<>]/.test(needDispatch.goal), `dispatch.goal 不得含尖括号占位：${needDispatch.goal}`);
    // ③ exec_running 已派发 → idle（阶段是版本容器，不催推进）
    const idleAtExec = deriveNextAction({
      focus: { stage: 's1', phase: 'exec_running', legalNextPhases: ['review_pending'] },
      dispatch: { sincePhase: 2, missingRoles: ['planner'] },
    });
    assert(idleAtExec.kind === 'idle', `已派发的 exec_running 应为 idle，实际 ${idleAtExec.kind}`);
    // ④ 非 exec 相位有合法下一相位 → command/feel_flow
    const advance = deriveNextAction({
      focus: { stage: 's1', phase: 'review_pending', legalNextPhases: ['review_passed'], responsibleAgent: 'openfeel-reviewer' },
      dispatch: { sincePhase: 1, missingRoles: [] },
    });
    assert(advance.kind === 'command' && advance.tool === 'feel_flow', `有下一相位应为 command/feel_flow，实际 ${advance.kind}/${advance.tool}`);
    assert(advance.args.to === 'review_passed', 'command.args.to 应为合法下一相位');
    // wire 投影：idle → null；dispatch → 只带一句话 goal
    assert(toWireNext(idleAtExec) === null, 'idle 的 wire next 应为 null');
    assert(toWireNext(needDispatch).arguments.goal === needDispatch.goal, 'dispatch 的 wire next 只带 goal');
    assert(typeof nextActionLine(needDispatch) === 'string' && nextActionLine(needDispatch).includes('subagent'), 'nextActionLine 应为动作型字符串');
    assert(nextActionLine(idleAtExec) === null, 'idle 的 nextAction 字符串应为 null');
  });

  await check('每步提醒：systemPrompt.context + post-execute 观察者（v1.6.0 / T10 降级 1）', async () => {
    resetReminderState();
    const reminderMock = mockContext(SOURCE_PROJECT);
    /** @type {any[]} */
    const contexts = [];
    /** @type {Array<{ event: string, handler: Function }>} */
    const listeners = [];
    reminderMock.ctx.systemPrompt.context = (context) => {
      contexts.push(context);
      return () => {};
    };
    reminderMock.ctx.on = (event, handler) => {
      listeners.push({ event, handler });
      return () => {};
    };
    apply(reminderMock.ctx, {});
    assert(contexts.length === 1, `应注册 1 个动态上下文，实际 ${contexts.length}`);
    assert(contexts[0].name === REMINDER_CONTEXT_NAME, `上下文名应为 ${REMINDER_CONTEXT_NAME}`);
    assert(reminderText() === '', '初始不应注入提醒（零 token）');
    const observer = listeners.find((entry) => entry.event === 'tools/post-execute');
    assert(observer !== undefined, '缺 tools/post-execute 观察者');
    const post = async (toolName) => observer.handler({ name: toolName, arguments: {} }, {}, async () => ({ kind: 'accept' }));
    await post('read');
    assert(reminderText() === '', '只读工具不应触发提醒');
    await post('write');
    const line = contexts[0].text();
    assert(line.includes('下一步'), `写类工具后应注入一行提醒，实际「${line}」`);
    await post('read');
    assert(reminderText() === '', '写类工具之后的读调用应复位（避免每轮重复注入）');
    // 每 5 步兜底：连续读第 4、5 次时第 5 步触发
    resetReminderState();
    for (let index = 0; index < 4; index += 1) await post('read');
    assert(reminderText() === '', '第 4 步不应触发（每 5 步一次）');
    await post('read');
    assert(reminderText().includes('下一步'), '第 5 步应触发兜底提醒');
    // 观察者必须放行下游决定（不 veto、不改结果）
    const passthrough = await observer.handler({ name: 'read', arguments: {} }, {}, async () => ({ kind: 'accept', value: 1 }));
    assert(passthrough.kind === 'accept' && passthrough.value === 1, 'post-execute 观察者必须原样透传下游决定');
    resetReminderState();
  });


  await check('dashboard 不再导出 PHASE_AGENT 本地镜像', async () => {
    const dashboard = await import('../lib/adapters/dashboard.js');
    assert(!Object.hasOwn(dashboard, 'PHASE_AGENT'), 'PHASE_AGENT 应从 dashboard.js 移除（改由 flow next 权威输出）');
  });

  // 2) 只读工具（打真实项目，只读安全）
  process.stdout.write('\n[2] 只读工具 — 真实项目快照\n');
  const realExec = execFor(SOURCE_PROJECT);
  const fixtureStage = ok(await workspace.tools.get('feel_stage').execute({ action: 'list' }, realExec)).stages[0]?.id;
  assertString(fixtureStage, '需要至少一个阶段用于适配器验证');
  const status = workspace.tools.get('feel_status');

  let snapshot;
  await check('feel_status 返回完整快照', async () => {
    // v1.5.7：默认 compact；本组断言完整形态 → 显式 detail=full。
    const result = await status.execute({ detail: 'full' }, realExec);
    const data = ok(result);
    snapshot = data;
    assert(snapshot.pipeline !== undefined, '缺少 pipeline');
    assert(snapshot.focus !== undefined, '缺少 focus');
    assert(snapshot.mode !== undefined, '缺少 mode');
    assert(Array.isArray(snapshot.stages), 'stages 应为数组');
    assert(snapshot.stages.length > 0, 'stages 不应为空');
    assertString(result.summary, 'summary 为空');
    // v1.6.0 / T10（A10）：动作型 next 三态之一
    assert(
      snapshot.nextAction !== null
        && ['dispatch', 'command', 'idle'].includes(snapshot.nextAction.kind),
      `feel_status.nextAction.kind 应为 dispatch/command/idle，实际 ${JSON.stringify(snapshot.nextAction)}`,
    );
    assert(typeof snapshot.nextAction.reason === 'string' && snapshot.nextAction.reason !== '', 'nextAction.reason 应为非空说明');
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
    // v1.6.0 / T10：动作型 next（与 feel_status 同一纯函数，台账来自本地 jsonl）
    assert(
      data.nextAction !== null && ['dispatch', 'command', 'idle'].includes(data.nextAction.kind),
      `feel_next.nextAction.kind 应为 dispatch/command/idle，实际 ${JSON.stringify(data.nextAction)}`,
    );
  });

  await check('feel_next/feel_status 暴露 statusSync（v1.5.0，默认 30 分钟）', async () => {
    const next = ok(await workspace.tools.get('feel_next').execute({}, realExec));
    assert(next.statusSync && typeof next.statusSync === 'object', 'feel_next 缺 statusSync');
    assert(typeof next.statusSync.due === 'boolean', 'statusSync.due 应为布尔');
    assert(next.statusSync.intervalMinutes === 30, `间隔应为 30，实际 ${next.statusSync.intervalMinutes}`);
    const status = ok(await workspace.tools.get('feel_status').execute({}, realExec));
    assert(status.statusSync && typeof status.statusSync.due === 'boolean', 'feel_status 缺 statusSync');
  });

  await check('feel_status/feel_next 暴露会话登记 sessions（v1.5.8 / REQ-029）', async () => {
    // 会话登记写 `.openfeel/dev/sessions.json`（运行时状态，已在 .gitignore 忽略）。
    const status = ok(await workspace.tools.get('feel_status').execute({}, realExec));
    assert(Array.isArray(status.sessions), 'feel_status.sessions 应为数组');
    assert(status.sessions.length > 0, 'feel_status.sessions 应含当前会话条目');
    for (const entry of status.sessions) {
      assert(entry !== null && typeof entry === 'object', 'sessions 元素应为对象');
      assertString(entry.id, 'sessions[].id');
      assertString(entry.cwd, 'sessions[].cwd');
      assertString(entry.lastSeen, 'sessions[].lastSeen');
      assert(
        Number.isFinite(Date.parse(entry.lastSeen)),
        `sessions[].lastSeen 应为可解析时间：${entry.lastSeen}`,
      );
      assert(entry.stage === null || typeof entry.stage === 'string', 'sessions[].stage 应为 string|null');
    }
    // 本会话条目必须是最近一次心跳（先登记后读取）
    const newest = [...status.sessions].sort((a, b) => Date.parse(b.lastSeen) - Date.parse(a.lastSeen))[0];
    assert(newest !== undefined, 'sessions 排序后不应为空');
    assert(
      Math.abs(Date.now() - Date.parse(newest.lastSeen)) <= 60_000,
      `最近一条会话心跳应 ≤ 60s，实际 ${newest.lastSeen}`,
    );

    const next = ok(await workspace.tools.get('feel_next').execute({}, realExec));
    assert(Array.isArray(next.sessions), 'feel_next.sessions 应为数组');
    assert(next.sessions.length > 0, 'feel_next.sessions 应含当前会话条目');
  });

  await check('feel_status/feel_next 暴露 guard 段（v1.5.11 D-126-04）', async () => {
    const status = ok(await workspace.tools.get('feel_status').execute({}, realExec));
    assert(status.guard && typeof status.guard === 'object', 'feel_status 缺 guard 段（compact 档也要带）');
    assert(status.guard.registered === true, `guard.registered 应为 true，实际 ${status.guard.registered}`);
    assert(status.guard.registered === true && typeof status.guard.shellGate === 'string', 'guard.shellGate 应可见');
    assertString(status.guard.cwd, 'guard.cwd');
    assert(
      status.guard.cwdSource === 'agent-session',
      `guard.cwdSource 应为 agent-session，实际 ${status.guard.cwdSource}`,
    );
    assert(status.guard.degraded === false, 'agent-session 来源不应 degraded');
    // stale 依赖「当前进程」判 pid：只有确认 state 由本进程写时才断言不 stale
    // （全局 guard-state 是跨进程共享文件，并发跑别的测试脚本可能把它改写）。
    assert(typeof status.guard.stale === 'boolean', 'guard.stale 应为布尔');
    assertString(status.guard.hostStartedAt, 'guard.hostStartedAt');
    assertString(status.guard.loaded_hash, 'guard.loaded_hash');
    // 跨进程/并发：他进程写的 state 必须被 HMAC/stale 判为不可信（v1.5.11 P1-6 设计）。
    // 真实 DSH 宿主同时在跑时本测试会读到宿主的 state（pid 不同）→ 期望 stale=true。
    if (status.guard.pid === process.pid) {
      assert(status.guard.stale === false, '同进程注册不应 stale');
    } else {
      assert(
        status.guard.stale === true,
        `非同进程 state 应 stale（本进程 ${process.pid}，state ${status.guard.pid}）`,
      );
    }

    const next = ok(await workspace.tools.get('feel_next').execute({}, realExec));
    assert(next.guard && next.guard.registered === true, 'feel_next 缺 guard 段');
    if (next.guard.pid === process.pid) {
      assert(next.guard.stale === false, 'feel_next 同进程不应 stale');
    }
  });

  await check('workflowGate：guard 不可信三种注入 → required（v1.5.11 D-126-04）', () => {
    const base = { focus: { phase: 'exec_running' } };
    const cases = [
      [{ registered: false }, 'guard-inactive'],
      [{ registered: true, cwd: null, cwdSource: 'unresolved' }, 'guard-cwd-unresolved'],
      [{ registered: true, cwd: '/x/project', cwdSource: 'agent-session', stale: true }, 'guard-stale'],
    ];
    for (const [guard, reason] of cases) {
      const gate = computeWorkflowGate({ ...base, guard });
      assert(gate.required === true, `${reason} 应 required`);
      assert(gate.reason === reason, `reason 应为 ${reason}，实际 ${gate.reason}`);
      assert(Array.isArray(gate.actions) && gate.actions.length > 0, `${reason} 应给修复动作`);
    }
    // 无 guard 字段 → 行为完全不变（零回归）
    assert(computeWorkflowGate({ focus: { phase: 'exec_running' } }).required === false, '无 guard 字段不应 required');
    assert(computeWorkflowGate({ focus: { phase: '' } }).reason === 'no-active-stage', '无 guard 字段仍按阶段判定');
  });

  // v1.5.17：feel_mode=disabled（软关闭）
  await check('workflowGate：feel_mode=disabled → 不催建阶段，但 guard-* 优先且自带文案为空', () => {
    const disabledFeel = { value: 'disabled', source: 'config.yaml' };
    const openStage = { focus: { phase: 'exec_running' } };
    const noStage = { focus: { phase: '' } };

    // 有开启阶段：与既有行为一致（不 required，无 reason）
    const withStage = computeWorkflowGate({ ...openStage, feelMode: disabledFeel });
    assert(withStage.required === false && withStage.reason === null, 'disabled + 开启阶段应保持不 required');

    // 无开启阶段：reason 换为 feel-mode-off，且 message/actions 为空（不得产出标题）
    const off = computeWorkflowGate({ ...noStage, feelMode: disabledFeel });
    assert(off.required === false, 'disabled 时不应 required');
    assert(off.reason === 'feel-mode-off', `reason 应为 feel-mode-off，实际 ${off.reason}`);
    assert(off.message === '' && off.actions.length === 0, 'feel-mode-off 应零文案零动作');
    assert(headlineWarning({ workflowGate: off }) === '', 'feel-mode-off 不得产出门禁标题');
    assert(workflowGateTitle(off) === '', 'workflowGateTitle(feel-mode-off) 应为空串');

    // guard-* 优先级不变：disabled 不得吞掉写入门禁失活告警
    const guardFirst = computeWorkflowGate({ ...noStage, feelMode: disabledFeel, guard: { registered: false } });
    assert(guardFirst.required === true && guardFirst.reason === 'guard-inactive', 'guard-inactive 应优先于 feel-mode-off');

    // enabled / 缺失 → 旧行为逐字不变
    for (const feelMode of [undefined, { value: 'enabled', source: 'builtin' }]) {
      const legacy = computeWorkflowGate({ ...noStage, feelMode });
      assert(legacy.required === true && legacy.reason === 'no-active-stage', 'enabled/缺失 应保持 no-active-stage');
    }
  });

  // v1.5.12 / stage-127 §3-E：标题误报修复（`guard-*` 不得再说「无活跃阶段」）
  await check('workflowGateTitle：四个 reason 各自成句，guard-* 与 gate.message 同源（stage-127 E）', () => {
    const cases = [
      [{ registered: false }, 'guard-inactive'],
      [{ registered: true, cwd: null, cwdSource: 'unresolved' }, 'guard-cwd-unresolved'],
      [{ registered: true, cwd: '/x/project', cwdSource: 'agent-session', stale: true }, 'guard-stale'],
    ];
    for (const [guard, reason] of cases) {
      const gate = computeWorkflowGate({ focus: { phase: 'exec_running' }, guard });
      assert(gate.reason === reason, `sanity：reason 应为 ${reason}，实际 ${gate.reason}`);
      const title = workflowGateTitle(gate);
      assertString(title, `${reason} 标题`);
      assert(!title.includes('无活跃阶段'), `${reason} 标题不得出现「无活跃阶段」（实际：${title}）`);
      assert(title === gate.message, `${reason} 标题应与 gate.message 逐字一致（单源，不另写一套）`);
      const headline = headlineWarning({ workflowGate: gate });
      assert(headline === `⚠ ${gate.message}`, `${reason} headline 应为「⚠ + message」，实际：${headline}`);
    }
    // 真无活跃阶段 + guard 正常 → 唯一允许出现「无活跃阶段」的 reason
    const noStage = computeWorkflowGate({
      focus: { phase: '' },
      guard: { registered: true, cwd: '/x/project', cwdSource: 'agent-session', stale: false },
    });
    assert(noStage.reason === 'no-active-stage', `sanity：应判 no-active-stage，实际 ${noStage.reason}`);
    const noStageHeadline = headlineWarning({ workflowGate: noStage });
    assert(
      noStageHeadline.includes('无活跃阶段'),
      `真无活跃阶段时 headline 应含「无活跃阶段」（实际：${noStageHeadline}）`,
    );
    // 有活跃阶段（门禁无需）→ 空串，不得凭空加标题
    assert(
      headlineWarning({ workflowGate: computeWorkflowGate({ focus: { phase: 'exec_running' } }) }) === '',
      '有活跃阶段时不应有门禁标题',
    );
    assert(headlineWarning(null) === '' && headlineWarning({}) === '', '空快照不得出标题');
  });

  await check('feel_status / feel_next：guard-stale 时两处标题都按门禁原因给出（副本 + 自愈关闭）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'feel-verify-gate-title-'));
    const project = join(root, 'project');
    const savedSelfHeal = process.env.OPENFEEL_GUARD_SELF_HEAL;
    try {
      cpSync(join(SOURCE_PROJECT, '.openfeel'), join(project, '.openfeel'), { recursive: true });
      // 关掉自动自愈：否则「重启后首次 feel_* 即修」会把假 stale 在展示前修掉（stage-127 §3-F）
      process.env.OPENFEEL_GUARD_SELF_HEAL = 'off';
      // 假 state：pid 是别的进程 → stale（reason 由 buildGuardSection 权威给出）
      writeGuardState(project, {
        registered: true,
        enforce: 'always',
        shellGate: 'default(1/2=deny,4=warn)',
        cwd: project,
        cwdSource: 'agent-session',
        degraded: false,
        pid: process.pid + 1,
      });
      const statusResult = await workspace.tools.get('feel_status').execute({ project }, execFor(project));
      const status = ok(statusResult);
      assert(status.guard?.stale === true, 'sanity：假 state（异 pid）应被判 stale');
      assert(
        status.workflowGate?.reason === 'guard-stale',
        `workflowGate.reason 应为 guard-stale，实际 ${status.workflowGate?.reason}`,
      );
      assert(
        !statusResult.summary.includes('无活跃阶段'),
        `guard-stale 时 feel_status.summary 不得含「无活跃阶段」（实际：${statusResult.summary}）`,
      );
      assert(
        statusResult.summary.includes('门禁来自旧进程/旧适配器'),
        `feel_status.summary 应给出 guard-stale 原因文案（实际：${statusResult.summary}）`,
      );
      assert(
        !statusResult.summary.includes('⚠ 写入门禁未生效'),
        '门禁标题已覆盖 stale，不得再堆 guardWarnings 同一句（skipGateCovered）',
      );

      const nextResult = await workspace.tools.get('feel_next').execute({ project }, execFor(project));
      const next = ok(nextResult);
      assert(next.workflowGate?.reason === 'guard-stale', `feel_next guard-stale 丢失：${next.workflowGate?.reason}`);
      assert(
        !nextResult.summary.includes('无活跃阶段'),
        `guard-stale 时 feel_next.summary 不得含「无活跃阶段」（实际：${nextResult.summary}）`,
      );
      assert(
        nextResult.summary.includes('门禁来自旧进程/旧适配器'),
        `feel_next.summary 应给出 guard-stale 原因文案（实际：${nextResult.summary}）`,
      );

      // ③ 两处同源：句首的「⚠ …。」逐字相同（同一 helper 的输出）
      const headOf = (summary, label) => {
        const matched = String(summary).match(/^⚠ [^。]*。/);
        assert(matched !== null, `${label}.summary 应以「⚠ …。」开头（实际：${String(summary).slice(0, 80)}）`);
        return matched[0];
      };
      const statusHead = headOf(statusResult.summary, 'feel_status');
      const nextHead = headOf(nextResult.summary, 'feel_next');
      assert(statusHead === nextHead, `两处标题必须同源：status=${statusHead} / next=${nextHead}`);
      assert(
        statusResult.summary.startsWith(`⚠ ${status.workflowGate.message}`)
        && nextResult.summary.startsWith(`⚠ ${next.workflowGate.message}`),
        '两处 summary 都应逐字以「⚠ workflowGate.message」开头',
      );
    } finally {
      if (savedSelfHeal === undefined) delete process.env.OPENFEEL_GUARD_SELF_HEAL;
      else process.env.OPENFEEL_GUARD_SELF_HEAL = savedSelfHeal;
      rmSync(root, { recursive: true, force: true });
    }
  });

  await check('feel_status：真无活跃阶段 + guard 正常时仍显示「无活跃阶段」（全新 init 项目，显式 enabled）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'feel-verify-nostage-'));
    const project = join(root, 'project');
    const cleanHome = join(root, 'home');
    const savedEnv = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME };
    try {
      mkdirSync(project, { recursive: true });
      mkdirSync(cleanHome, { recursive: true });
      // v1.5.18：隔离 HOME，避免宿主机全局 preferences.feel_mode 影响「默认 builtin」断言
      process.env.USERPROFILE = cleanHome;
      process.env.HOME = cleanHome;
      const env = { ...process.env, USERPROFILE: cleanHome, HOME: cleanHome };
      const init = spawnSync(
        process.execPath,
        [join(SOURCE_PROJECT, 'bin', 'openfeel.js'), 'init', '--project', project],
        { cwd: SOURCE_PROJECT, encoding: 'utf8', timeout: 60_000, env },
      );
      assert(init.status === 0, `openfeel init 失败（exit ${init.status}）：${init.stderr ?? ''}`);
      // v1.5.18：全新项目（干净 HOME、无项目声明）默认 feel_mode=disabled（开箱宽松）→ 门禁应为 feel-mode-off。
      const relaxed = ok(await workspace.tools.get('feel_status').execute({ project }, execFor(project)));
      assert(
        relaxed.feelMode?.value === 'disabled' && relaxed.feelMode?.source === 'builtin',
        `干净 HOME 下全新项目默认应为 disabled/builtin（实际 ${JSON.stringify(relaxed.feelMode)}）`,
      );
      assert(
        relaxed.workflowGate?.reason === 'feel-mode-off' && relaxed.workflowGate?.required === false,
        `默认宽松时门禁应为 feel-mode-off（实际 ${relaxed.workflowGate?.reason}）`,
      );
      // 显式钉死严格后，才回到「没开阶段」这条唯一可提示项。
      const pinned = spawnSync(
        process.execPath,
        [join(SOURCE_PROJECT, 'bin', 'openfeel.js'), 'config', 'set', 'feel_mode', 'enabled', '--project', project],
        { cwd: SOURCE_PROJECT, encoding: 'utf8', timeout: 60_000, env },
      );
      assert(pinned.status === 0, `显式 pin enabled 失败（exit ${pinned.status}）：${pinned.stderr ?? ''}`);
      // 健康 state（同进程、已签名）→ guard 正常，门禁只剩「没开阶段」一条
      writeGuardState(project, {
        registered: true,
        enforce: 'always',
        shellGate: 'default(1/2=deny,4=warn)',
        cwd: project,
        cwdSource: 'agent-session',
        degraded: false,
        pid: process.pid,
      });
      const result = await workspace.tools.get('feel_status').execute({ project }, execFor(project));
      const data = ok(result);
      assert(data.guard?.stale === false, `健康 state 不应 stale（实际 stale=${data.guard?.stale}）`);
      assert(
        data.feelMode?.value === 'enabled' && data.feelMode?.source === 'config.yaml',
        `pin 后 feelMode 应为 enabled/config.yaml（实际 ${JSON.stringify(data.feelMode)}）`,
      );
      assert(
        data.workflowGate?.reason === 'no-active-stage',
        `显式 enabled 的全新项目应判 no-active-stage，实际 ${data.workflowGate?.reason}`,
      );
      assert(
        result.summary.includes('无活跃阶段'),
        `真无活跃阶段时 summary 仍须含「无活跃阶段」（实际：${result.summary}）`,
      );
    } finally {
      if (savedEnv.USERPROFILE === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = savedEnv.USERPROFILE;
      if (savedEnv.HOME === undefined) delete process.env.HOME;
      else process.env.HOME = savedEnv.HOME;
      rmSync(root, { recursive: true, force: true });
    }
  });

  await check('feel_status / feel_next 标题同源：门禁文案只在 workflow-gate.js（无本地分叉）', () => {
    const toolsSource = readFileSync(new URL('../lib/tools/index.js', import.meta.url), 'utf-8');
    assert(
      !toolsSource.includes('无活跃阶段'),
      'tools/index.js 不得再硬编码「无活跃阶段」（应统一走 headlineWarning）',
    );
    const between = (start, end) => {
      const a = toolsSource.indexOf(start);
      const b = toolsSource.indexOf(end);
      assert(a >= 0 && b > a, `定位失败：${start} … ${end}`);
      return toolsSource.slice(a, b);
    };
    assert(
      between("name: 'feel_status'", "name: 'feel_next'").includes('headlineWarning('),
      'feel_status 未走 headlineWarning（两处会再次分叉）',
    );
    assert(
      between("name: 'feel_next'", "name: 'feel_flow'").includes('headlineWarning('),
      'feel_next 未走 headlineWarning（两处会再次分叉）',
    );
    const gateSource = readFileSync(new URL('../lib/adapters/workflow-gate.js', import.meta.url), 'utf-8');
    assert(gateSource.includes('export function headlineWarning'), 'workflow-gate.js 应导出 headlineWarning');
    assert(gateSource.includes('export function workflowGateTitle'), 'workflow-gate.js 应导出 workflowGateTitle');
  });

  await check('guardWarnings：hmacWarn 一行提示 + skipGateCovered 不重复堆两句（stage-127 E）', () => {
    const healthy = {
      registered: true,
      cwd: '/x/project',
      cwdSource: 'agent-session',
      stale: false,
      degraded: false,
    };
    assert(guardWarnings(healthy) === '', '健康 guard 不应有告警');
    const hmac = guardWarnings({ ...healthy, hmacWarn: true });
    assert(
      hmac.includes('签名失配') && hmac.includes('仅提示'),
      `hmacWarn 应出一行「签名失配（仅提示，不影响判定）」：${hmac}`,
    );
    assert(
      guardWarnings({ ...healthy, hmacWarn: true }, { skipGateCovered: true }).includes('签名失配'),
      'hmacWarn 不在门禁覆盖范围内，skipGateCovered 不得吞掉它',
    );
    assert(
      guardWarnings({ ...healthy, registered: false }, { skipGateCovered: true }) === '',
      'guard-inactive 已由门禁标题覆盖，不得重复',
    );
    assert(
      guardWarnings({ ...healthy, stale: true }, { skipGateCovered: true }) === '',
      'guard-stale 已由门禁标题覆盖，不得重复',
    );
    const degraded = guardWarnings(
      { registered: true, cwd: '/x', cwdSource: 'process', degraded: true, stale: false },
      { skipGateCovered: true },
    );
    assert(degraded.includes('降级来源'), `skipGateCovered 不得吞掉 degraded（实际：${degraded}）`);
  });

  await check('guard-state：假 state + 假 host-marker 注入 → stale 可见（副本，不写真实项目）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'feel-verify-guard-'));
    try {
      const startedAt = new Date(Date.now() - 60_000).toISOString();
      writeGuardState(dir, {
        registered: true,
        enforce: 'always',
        shellGate: 'default(1/2=deny,4=warn)',
        cwd: dir,
        cwdSource: 'agent-session',
        degraded: false,
        hostStartedAt: startedAt,
        loaded_hash: 'hash-a',
        pid: process.pid,
      });
      const state = readGuardState(dir);
      assert(state !== null && state.source === 'workspace', 'guard-state 应落工作区');
      const marker = { loaded_hash: 'hash-a', started_at: new Date(Date.now() - 120_000).toISOString() };
      const fresh = buildGuardSection({ root: dir, hostMarker: marker });
      assert(fresh.registered === true && fresh.stale === false, '同哈希/同 pid 不应 stale');
      assert(fresh.cwdSource === 'agent-session', 'agent-session 不应降级');
      // 假 marker：loaded_hash 不符 → «适配器已更新但宿主没重启»
      const hashStale = buildGuardSection({ root: dir, hostMarker: { ...marker, loaded_hash: 'hash-b' } });
      assert(hashStale.stale === true, 'loaded_hash 不符应 stale');
      // 假 state：pid 不符 → «状态来自旧进程»
      assert(computeGuardStale(state, marker, process.pid + 1) === true, 'pid 不符应 stale');
      // 假 marker：started_at 更晚 → hostStartedAt 仅诊断字段，不再判 stale（v1.5.12 / D2）
      const bootStale = buildGuardSection({ root: dir, hostMarker: { ...marker, started_at: new Date().toISOString() } });
      assert(bootStale.stale === false, 'hostStartedAt 早于宿主启动仅为诊断，不得 stale');
      // 假 state：fail-closed 判定（lastDecision + cwd:null）→ 给出 live 也不得粉饰
      writeGuardState(dir, {
        registered: true,
        cwd: null,
        cwdSource: 'unresolved',
        degraded: true,
        lastDecision: {
          at: new Date().toISOString(),
          tool: 'write',
          decision: 'deny',
          reason: 'cwd-unresolved',
          paths: [],
          cwd: null,
          cwdSource: 'unresolved',
        },
      });
      const failClosed = buildGuardSection({
        root: dir,
        hostMarker: marker,
        live: { cwd: 'C:/elsewhere', source: 'process', degraded: true },
      });
      assert(failClosed.cwd === null && failClosed.cwdSource === 'unresolved', 'fail-closed 状态不得被 live 解析粉饰');
      assert(
        computeWorkflowGate({ focus: { phase: 'exec_running' }, guard: failClosed }).reason === 'guard-cwd-unresolved',
        'fail-closed 必须让 workflowGate 报警',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  await check('提示段含「子 agent 干活 / 禁手改状态」（v1.6.0）', () => {
    const text = workspace.sections[0].text();
    assert(text.includes('由子 agent 完成'), 'zh 提示段缺「由子 agent 完成」');
    assert(text.includes('禁手改'), 'zh 提示段缺禁手改');
  });

  await check('workflowGate：无活跃阶段 required（v1.5.2）', () => {
    const none = computeWorkflowGate({ focus: { phase: '' } });
    assert(none.required === true, '无活跃阶段应 required');
    assert(none.actions.some((a) => a.includes('feel_stage')), 'actions 应含建阶段');
    const active = computeWorkflowGate({ focus: { phase: 'exec_running' } });
    assert(active.required === false, '有活跃阶段不应 required');
    // v1.5.8：仅剩 done 阶段 = 无开启阶段（需求导向下应提示开新阶段）
    const doneOnly = computeWorkflowGate({ focus: { phase: 'done' } });
    assert(doneOnly.required === true, '仅剩 done 阶段应视为无开启阶段');
  });

  await check('提示段含三个可判定检查点（v1.6.0 / REQ-060）', () => {
    const text = workspace.sections[0].text();
    assert(text.includes('三个检查点'), 'zh 提示段缺检查点节');
    assert(text.includes('REQ_PLAN_GATE') && text.includes('STAGE_PLAN_GATE'), 'zh 提示段缺计划门拒绝形态');
    assert(text.includes('planner') && text.includes('executor') && text.includes('reviewer'), 'zh 提示段缺 planner/executor/reviewer 分工');
  });

  await check('feel_next 返回 dispatch 契约 + feel_status 返回 recovery（v1.5.3）', async () => {
    const next = ok(await workspace.tools.get('feel_next').execute({}, realExec));
    assert(next.dispatch && typeof next.dispatch === 'object', 'feel_next 缺 dispatch');
    for (const key of ['goal', 'context', 'boundaries', 'returnFormat', 'budget']) {
      assert(next.dispatch[key] !== undefined, `dispatch 缺 ${key}`);
    }
    assert(Array.isArray(next.dispatch.boundaries.neverRead), 'boundaries.neverRead 应为数组');
    // v1.6.0 / T9 step2（A7）：goal / boundaries.write 用真实调度上下文填充，不得残留占位句
    assert(!next.dispatch.goal.includes('一句话目标'), 'dispatch.goal 不得残留占位文案');
    assert(!/[<>]/.test(next.dispatch.goal), `dispatch.goal 不得含尖括号占位：${next.dispatch.goal}`);
    assert(
      Array.isArray(next.dispatch.boundaries.write) && next.dispatch.boundaries.write.length > 0,
      'boundaries.write 应列出真实写面（数组非空）',
    );
    assert(next.dispatch.returnFormat.includes('≤10 行'), 'returnFormat 应限制 10 行');
    const status = ok(await workspace.tools.get('feel_status').execute({ detail: 'full' }, realExec));
    assert(status.recovery && typeof status.recovery === 'object', 'feel_status 缺 recovery');
    assert('lastTransition' in status.recovery, 'recovery 缺 lastTransition');
    assert('handoff' in status.recovery, 'recovery 缺 handoff');
    assert('nextAction' in status.recovery, 'recovery 缺 nextAction');
  });

  await check('feel_dispatch：台账写行 / 去重 / 唯一 ID / feel_status.dispatch（v1.6.0 / REQ-057）', async () => {
    // 台账写在临时项目里：绝不污染真实仓库的 .openfeel/dev/。
    const dir = mkdtempSync(join(tmpdir(), 'feel-dispatch-'));
    mkdirSync(join(dir, '.openfeel'), { recursive: true });
    writeFileSync(
      join(dir, '.openfeel', 'flow.json'),
      `${JSON.stringify({ schemaVersion: 1, stages: {}, requirements: [] }, null, 2)}\n`,
      'utf-8',
    );
    const dispatchExec = execFor(dir);
    const tool = workspace.tools.get('feel_dispatch');
    assert(tool !== undefined, '缺少 feel_dispatch 工具');

    const base = {
      action: 'record',
      target_agent: 'executor-b-t9a',
      role: 'executor',
      goal: 'T9 step1：派发台账 + feel_dispatch + guard',
      task_id: 'T9',
      files: ['dsh/lib/adapters/dispatch-ledger.js'],
      stage: 'v1.6.0-stage-132',
      phase: 'exec_running',
      project: dir,
    };

    const first = ok(await tool.execute(base, dispatchExec), 'feel_dispatch record');
    assert(/^d-\d{4,}$/.test(first.dispatchId), `dispatchId 应为 d-NNNN，实际 ${first.dispatchId}`);
    assert(first.duplicate === false, '首次记录不应判定为重复');

    const ledger = join(dir, '.openfeel', 'dev', 'dispatch.jsonl');
    assert(existsSync(ledger), `台账未生成：${ledger}`);
    const lines = readFileSync(ledger, 'utf-8').trim().split('\n');
    assert(lines.length === 1, `应写 1 行，实际 ${lines.length}`);
    const row = JSON.parse(lines[0]);
    for (const key of [
      'dispatchId', 'ts', 'leadSessionId', 'origin', 'stage', 'phase',
      'targetAgent', 'role', 'taskId', 'goal', 'files', 'returnFormat', 'dispatchDepth',
    ]) {
      assert(key in row, `台账行缺字段 ${key}`);
    }
    assert(row.stage === 'v1.6.0-stage-132' && row.phase === 'exec_running', 'stage/phase 应原样落账');
    assert(Array.isArray(row.files) && row.files[0] === 'dsh/lib/adapters/dispatch-ledger.js', 'files[] 应落账');

    // 5 分钟内同 leadSessionId+taskId+goal → 去重（返回既有 dispatchId，不追加第二行）
    const again = ok(await tool.execute(base, dispatchExec), 'feel_dispatch 去重');
    assert(again.duplicate === true, '同 task 5 分钟内应判定为重复');
    assert(again.dispatchId === first.dispatchId, '重复派发应返回既有 dispatchId');
    assert(readFileSync(ledger, 'utf-8').trim().split('\n').length === 1, '去重不得追加第二行');

    // 不同 task → 新 dispatchId
    const second = ok(
      await tool.execute({ ...base, task_id: 'T10', goal: 'T10：提示词重写' }, dispatchExec),
      'feel_dispatch 第二条',
    );
    assert(second.dispatchId !== first.dispatchId, '不同任务 dispatchId 应唯一');

    const listed = ok(await tool.execute({ action: 'list', project: dir }, dispatchExec), 'feel_dispatch list');
    assert(listed.total === 2, `list.total 应为 2，实际 ${listed.total}`);
    assert(listed.records.length === 2, `list.records 应为 2 条，实际 ${listed.records.length}`);

    // feel_status.dispatch 形状（真实项目只读，不写台账）
    const status = ok(await workspace.tools.get('feel_status').execute({}, realExec));
    assert(status.dispatch && typeof status.dispatch === 'object', 'feel_status 缺 dispatch 段');
    assert(status.dispatch.required === true, 'dispatch.required 应恒为 true（提示级）');
    assert(typeof status.dispatch.total === 'number', 'dispatch.total 应为数字');
    assert(typeof status.dispatch.sincePhase === 'number', 'dispatch.sincePhase 应为数字');
    assert(Array.isArray(status.dispatch.missingRoles), 'dispatch.missingRoles 应为数组');
    // v1.6.0 / T9 step2（A7）：records 至少是数组（真实项目可能还没有派发记录）
    assert(Array.isArray(status.dispatch.records), 'dispatch.records 应为数组');
    const allowedRoles = ['planner', 'executor', 'reviewer', 'tester', 'archiver'];
    for (const role of status.dispatch.missingRoles) {
      assert(allowedRoles.includes(role), `missingRoles 含非法角色 ${role}`);
    }
    rmSync(dir, { recursive: true, force: true });
  });

  await check('dispatch-ledger：5 分钟去重窗口 / 200 行上限 / 24h 清理（v1.6.0 / REQ-057）', () => {
    const t0 = Date.parse('2026-11-24T00:00:00.000Z');
    const dir = mkdtempSync(join(tmpdir(), 'feel-dispatch-ledger-'));
    mkdirSync(join(dir, '.openfeel'), { recursive: true });
    const base = { leadSessionId: 's', targetAgent: 'a', role: 'executor', taskId: 'T9', goal: 'g', files: [] };

    // 窗口内 → 去重；窗口外（>5 分钟）→ 新 dispatchId
    const first = appendDispatch(dir, base, { now: t0 });
    const within = appendDispatch(dir, base, { now: t0 + 4 * 60_000 });
    const outside = appendDispatch(dir, base, { now: t0 + 6 * 60_000 });
    assert(within.duplicate === true && within.dispatchId === first.dispatchId, '5 分钟内应去重');
    assert(outside.duplicate === false && outside.dispatchId !== first.dispatchId, '超过 5 分钟应追加新行');

    // 200 行上限：205 条不同 goal → 只留最近 200 行
    for (let index = 0; index < 205; index += 1) {
      appendDispatch(dir, { ...base, goal: `prune-${index}` }, { now: t0 + 10 * 60_000 + index });
    }
    assert(readDispatches(dir).length === 200, `上限应为 200 行，实际 ${readDispatches(dir).length}`);

    // v1.6.0 / T9 step2（A7）：feel_status.dispatch 的数据源形状（required / records）
    const summary = dispatchSummary(dir);
    assert(summary.required === true, 'dispatchSummary.required 应恒为 true（提示级，不做硬拦）');
    assert(summary.total === 200, `summary.total 应为 200，实际 ${summary.total}`);
    assert(summary.records.length === 5, `records 应只暴露最近 5 条，实际 ${summary.records.length}`);
    assert(
      summary.records.every((record) => typeof record.dispatchId === 'string' && /^d-\d{4,}$/.test(record.dispatchId)),
      'records 每条应有唯一 dispatchId',
    );

    // 24h 清理：把所有行的时间推到 25 小时前 → 全部移除
    const pruned = pruneDispatches(dir, { now: t0 + 25 * 60 * 60_000 });
    assert(pruned.kept === 0 && pruned.removed === 200, `24h 清理应移除全部，实际 kept=${pruned.kept}`);
    assert(readDispatches(dir).length === 0, '清理后应为空');
    assert(existsSync(dispatchLedgerPath(dir)), '清理后文件仍应存在（空文件）');
    rmSync(dir, { recursive: true, force: true });
  });

  await check('提示段含派发契约要点（v1.5.3 → v1.6.0：≤10 行 + 台账）（v1.6.0）', () => {
    const text = workspace.sections[0].text();
    assert(text.includes('≤10 行'), 'zh 提示段缺返回行数限制');
    assert(text.includes('feel_dispatch'), 'zh 提示段缺派发台账记账动作');
  });

  // ── v1.7.0 / REQ-066 A66.1—A66.3：派发闭环 + 派发视图 + 遵守率出口 ──

  await check('A66.1 台账：closeDispatch 原地补写 closing 四键 / 幂等 / 未知 id（v1.7.0 / REQ-066）', () => {
    const t0 = Date.parse('2026-11-25T00:00:00.000Z');
    const dir = mkdtempSync(join(tmpdir(), 'feel-dispatch-close-'));
    mkdirSync(join(dir, '.openfeel'), { recursive: true });
    const base = { leadSessionId: 's', role: 'executor', stage: 'st', phase: 'p', files: [] };
    const first = appendDispatch(dir, { ...base, taskId: 'T1', goal: 'g1' }, { now: t0 });
    appendDispatch(dir, { ...base, role: 'reviewer', taskId: 'T2', goal: 'g2' }, { now: t0 + 1000 });
    const ledger = dispatchLedgerPath(dir);
    const beforeLines = readFileSync(ledger, 'utf-8').trim().split('\n');
    assert(beforeLines.length === 2, `前置应为 2 行，实际 ${beforeLines.length}`);
    const firstRowBefore = JSON.parse(beforeLines[0]);

    // ① 正常闭合：durationMs 缺省 = now − ts；closing 恰 4 键（status/artifacts/durationMs/summary），
    //    closedAt 落行顶层（A66.1 的「closing 恰 4 键」与「closedAt」不冲突）
    const closed = closeDispatch(dir, first.dispatchId, {
      status: 'done', artifacts: ['a.js', 'b.md'], summary: '完成',
    }, { now: t0 + 90_000 });
    assert(closed.ok === true && closed.changed === true, `首次闭合应 changed:true，实际 ${JSON.stringify(closed)}`);
    assert(typeof closed.closedAt === 'string' && closed.closedAt.includes('T'), 'closedAt 应为 ISO 字符串');

    const afterLines = readFileSync(ledger, 'utf-8').trim().split('\n');
    assert(afterLines.length === beforeLines.length, '行数不变');
    assert(afterLines[1] === beforeLines[1], '未命中的行必须字节不变');
    const closedRow = JSON.parse(afterLines[0]);
    assert(closedRow.ts === firstRowBefore.ts, 'ts 不得二次改写');
    assert(JSON.stringify(Object.keys(closedRow.closing)) === JSON.stringify(['status', 'artifacts', 'durationMs', 'summary']),
      `closing 应恰 4 键且键序固定，实际 ${JSON.stringify(Object.keys(closedRow.closing))}`);
    assert(closedRow.closing.status === 'done', 'closing.status 应为 done');
    assert(JSON.stringify(closedRow.closing.artifacts) === JSON.stringify(['a.js', 'b.md']), 'artifacts[] 应落账');
    assert(closedRow.closing.durationMs === 90_000, `durationMs 应为 90000，实际 ${closedRow.closing.durationMs}`);
    assert(closedRow.closing.summary === '完成', 'summary 应落账');
    assert(closedRow.closedAt === closed.closedAt, 'closedAt 应与返回值一致');

    // ② 幂等：相同内容重复闭合 → changed:false，整份文件字节不变（ts/closing/closedAt 不二次改写）
    const bytesBefore = readFileSync(ledger, 'utf-8');
    const repeat = closeDispatch(dir, first.dispatchId, {
      status: 'done', artifacts: ['a.js', 'b.md'], summary: '完成',
    }, { now: t0 + 999_999 });
    assert(repeat.ok === true && repeat.changed === false, `重复闭合应 changed:false，实际 ${JSON.stringify(repeat)}`);
    assert(repeat.closedAt === closed.closedAt, '重复闭合的 closedAt 应沿用既有值');
    assert(readFileSync(ledger, 'utf-8') === bytesBefore, '幂等重复不应改写文件');

    // ③ 未知 id → not_found 且零写盘
    const missing = closeDispatch(dir, 'd-9999', { status: 'done' }, { now: t0 });
    assert(missing.ok === false && missing.code === 'not_found', `未知 id 应 not_found，实际 ${JSON.stringify(missing)}`);
    assert(readFileSync(ledger, 'utf-8') === bytesBefore, '未知 id 应零写盘');

    // ④ status 非法 → invalid_closing 且零写盘
    const invalid = closeDispatch(dir, first.dispatchId, { status: 'bogus' }, { now: t0 });
    assert(invalid.ok === false && invalid.code === 'invalid_closing', `非法 status 应 invalid_closing，实际 ${JSON.stringify(invalid)}`);
    assert(readFileSync(ledger, 'utf-8') === bytesBefore, '非法 status 应零写盘');
    rmSync(dir, { recursive: true, force: true });
  });

  await check('A66.2 dispatchSummary：open[] / closedRatio / missingRoles 依 closing（v1.7.0 / REQ-066）', () => {
    const t0 = Date.parse('2026-11-25T00:00:00.000Z');
    const dir = mkdtempSync(join(tmpdir(), 'feel-dispatch-summary-'));
    mkdirSync(join(dir, '.openfeel'), { recursive: true });
    const base = { leadSessionId: 's', stage: 'st', phase: 'p', files: [] };
    const planner = appendDispatch(dir, { ...base, role: 'planner', taskId: 'T1', goal: 'g1' }, { now: t0 });
    const executor = appendDispatch(dir, { ...base, role: 'executor', taskId: 'T2', goal: 'g2' }, { now: t0 + 1000 });
    appendDispatch(dir, { ...base, role: 'reviewer', taskId: 'T3', goal: 'g3' }, { now: t0 + 2000 });
    // 跨相位：同一 stage 的早期相位派发（未闭环）在 open[] 里保留
    appendDispatch(dir, { ...base, role: 'tester', taskId: 'T4', goal: 'g4', phase: 'p-early' }, { now: t0 + 3000 });

    // 未闭环：open[] = 本 stage 全部 4 条（跨相位）；closedRatio = 0；missingRoles = 全五角色
    const before = dispatchSummary(dir, { stage: 'st', phase: 'p' });
    assert(before.open.length === 4, `未闭环 open 应 4 条（stage 范围），实际 ${before.open.length}`);
    assert(before.sincePhase === 3, `sincePhase 应只数本相位 3 条，实际 ${before.sincePhase}`);
    assert(before.closedRatio === 0, `closedRatio 应为 0，实际 ${before.closedRatio}`);
    assert(before.missingRoles.length === 5, `missingRoles 应为五种角色，实际 ${JSON.stringify(before.missingRoles)}`);
    assert(before.open.every((row) => row.closing === null), 'open[] 的 closing 应为 null');

    // planner 已 done → 从 open[] 与 missingRoles 双双消失
    closeDispatch(dir, planner.dispatchId, { status: 'done', summary: 'ok' }, { now: t0 + 5000 });
    const afterDone = dispatchSummary(dir, { stage: 'st', phase: 'p' });
    assert(afterDone.open.length === 3, `done 后 open 应 3 条，实际 ${afterDone.open.length}`);
    assert(afterDone.open.every((row) => row.dispatchId !== planner.dispatchId), '已 done 的派发不应在 open[]');
    assert(Math.abs(afterDone.closedRatio - 1 / 4) < 1e-9, `closedRatio 应为 1/4，实际 ${afterDone.closedRatio}`);
    assert(!afterDone.missingRoles.includes('planner'), 'planner 已 done，不应在 missingRoles');
    assert(afterDone.missingRoles.includes('executor'), 'executor 未 done，应在 missingRoles');

    // failed 仍算未完成：executor failed → 仍在 open[] / missingRoles，closedRatio 不变
    closeDispatch(dir, executor.dispatchId, { status: 'failed', summary: 'boom' }, { now: t0 + 6000 });
    const afterFailed = dispatchSummary(dir, { stage: 'st', phase: 'p' });
    assert(afterFailed.open.length === 3, `failed 仍算未完成，open 应 3 条，实际 ${afterFailed.open.length}`);
    assert(afterFailed.missingRoles.includes('executor'), 'failed 的 executor 仍应在 missingRoles');
    assert(Math.abs(afterFailed.closedRatio - 1 / 4) < 1e-9, 'failed 不改变 closedRatio（只认 done）');

    // records[] 透出 closing / closedAt（A66.2 的 records 证据面）
    const doneRow = afterFailed.records.find((row) => row.dispatchId === planner.dispatchId);
    assert(doneRow !== undefined, 'records 应含已 done 的 planner');
    assert(doneRow.closing.status === 'done', 'records[].closing.status 应透出 done');
    assert(typeof doneRow.closedAt === 'string' && doneRow.closedAt.includes('T'), 'records[].closedAt 应透出');

    // 空台账 → closedRatio null（不是 0，也不是 NaN）
    const emptyDir = mkdtempSync(join(tmpdir(), 'feel-dispatch-empty-'));
    mkdirSync(join(emptyDir, '.openfeel'), { recursive: true });
    const empty = dispatchSummary(emptyDir);
    assert(empty.closedRatio === null, `空台账 closedRatio 应为 null，实际 ${empty.closedRatio}`);
    assert(empty.open.length === 0, '空台账 open 应为 []');
    assert(empty.required === true && empty.total === 0 && empty.sincePhase === 0, '既有四键应保留');
    rmSync(dir, { recursive: true, force: true });
    rmSync(emptyDir, { recursive: true, force: true });
  });

  await check('A66.1/A66.2 feel_dispatch finish + feel_status.dispatch 新形状（v1.7.0 / REQ-066）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'feel-dispatch-finish-tool-'));
    mkdirSync(join(dir, '.openfeel'), { recursive: true });
    writeFileSync(
      join(dir, '.openfeel', 'flow.json'),
      `${JSON.stringify({
        schemaVersion: 1,
        pipeline: { current: { stage: '', op: '' } },
        stages: {},
        requirements: [],
        reviews: [],
        log: [],
      }, null, 2)}\n`,
      'utf-8',
    );
    const exec = execFor(dir);
    const tool = workspace.tools.get('feel_dispatch');
    const base = {
      action: 'record', target_agent: 'executor-a', role: 'executor',
      goal: 'A66：finish 闭环', task_id: 'A66-1', stage: 'v1.7.0-stage-133', phase: 'exec_running', project: dir,
    };
    const recorded = ok(await tool.execute(base, exec), 'feel_dispatch record');
    const finished = ok(await tool.execute({
      action: 'finish', dispatch_id: recorded.dispatchId, status: 'done',
      artifacts: ['dsh/lib/adapters/dispatch-ledger.js'], summary: '完成', project: dir,
    }, exec), 'feel_dispatch finish');
    assert(finished.ok === true && finished.dispatchId === recorded.dispatchId, 'finish 应返回 ok/dispatchId');
    assert(typeof finished.closedAt === 'string' && finished.closedAt.includes('T'), 'finish 应返回 closedAt');

    // 幂等：重复 finish（相同内容）→ changed:false
    const repeated = ok(await tool.execute({
      action: 'finish', dispatch_id: recorded.dispatchId, status: 'done',
      artifacts: ['dsh/lib/adapters/dispatch-ledger.js'], summary: '完成', project: dir,
    }, exec), 'feel_dispatch finish 幂等');
    assert(repeated.ok === true && repeated.changed === false, `重复 finish 应 changed:false，实际 ${JSON.stringify(repeated)}`);

    // 未知 id → 拒绝（FEEL_DISPATCH_NOT_FOUND），零写盘
    const ledgerBytes = readFileSync(join(dir, '.openfeel', 'dev', 'dispatch.jsonl'), 'utf-8');
    let rejected;
    try {
      await tool.execute({ action: 'finish', dispatch_id: 'd-9999', status: 'done', project: dir }, exec);
    } catch (error) {
      rejected = error;
    }
    assert(rejected !== undefined, '未知 dispatchId 应被拒绝');
    assert(rejected.code === 'FEEL_DISPATCH_NOT_FOUND', `错误码应 FEEL_DISPATCH_NOT_FOUND，实际 ${rejected.code}`);
    assert(readFileSync(join(dir, '.openfeel', 'dev', 'dispatch.jsonl'), 'utf-8') === ledgerBytes, '未知 id 零写盘');

    // feel_status.dispatch 消费新形状（open / closedRatio / records[].closing 都要在）
    const status = ok(await workspace.tools.get('feel_status').execute({ project: dir }, exec), 'feel_status');
    assert(Array.isArray(status.dispatch.open), 'feel_status.dispatch.open 应为数组');
    assert(status.dispatch.open.length === 0, `已完成派发不应在 open[]，实际 ${status.dispatch.open.length}`);
    assert(status.dispatch.closedRatio === 1, `closedRatio 应为 1，实际 ${status.dispatch.closedRatio}`);
    assert(status.dispatch.records.length === 1, 'records 应含 1 条');
    assert(status.dispatch.records[0].closing.status === 'done', 'records[].closing 应透出');
    assert(typeof status.dispatch.records[0].closedAt === 'string', 'records[].closedAt 应透出');
    assert(!status.dispatch.missingRoles.includes('executor'), 'executor 已 done，不应在 missingRoles');
    rmSync(dir, { recursive: true, force: true });
  });

  // A66.3 的出口是「CLI `lint adherence --json`」：适配器验证跑在**已安装 CLI** 上，
  // 版本可能落后于仓库；这里用仓库源码入口（bin/openfeel.js，需先 npm run build）做能力探测 +
  // 真实调用，缺命令时按「跳过并说明」处理（与 REQ-027/REQ-030 同一纪律）。
  const sourceCli = new FeelCli({
    command: process.execPath,
    commandPrefix: [join(SOURCE_PROJECT, 'bin', 'openfeel.js')],
    cwd: SOURCE_PROJECT,
  });
  const sourceTools = new Map(createTools({ cli: sourceCli }).map((tool) => [tool.name, tool]));
  let hasAdherence = false;
  try {
    const probe = await sourceCli.run(['lint', '--help'], { cwd: SOURCE_PROJECT });
    hasAdherence = probe.code === 0 && probe.stdout.includes('adherence');
  } catch {
    hasAdherence = false;
  }

  await check('A66.3 feel_verify action=adherence：四键 + 每项 {value, definition}；空样本 null 不抛错（v1.7.0 / REQ-066）', async () => {
    const verify = workspace.tools.get('feel_verify');
    assert(verify !== undefined, '缺少 feel_verify 工具');
    assert(
      verify.parameters.properties.action.enum.includes('adherence'),
      'feel_verify.action 缺枚举值 adherence（出口约定：不新增工具 / 不新增 CLI 子命令）',
    );
    if (!hasAdherence) {
      process.stdout.write('    (skip: 仓库 dist 未包含 lint adherence —— 先 npm run build 再跑本验证)\n');
      return;
    }

    const sourceVerify = sourceTools.get('feel_verify');
    assert(sourceVerify !== undefined, '源码工具集缺 feel_verify');
    const data = ok(await sourceVerify.execute({ action: 'adherence' }, execFor(SOURCE_PROJECT)), 'feel_verify adherence');
    const keys = ['main_write_ratio', 'subagent_per_req', 'sync_gap', 'violation_rate'];
    for (const key of keys) {
      const metric = data[key];
      assert(metric !== null && typeof metric === 'object', `adherence 缺 ${key}`);
      assert('value' in metric, `${key} 缺 value`);
      assert(metric.value === null || typeof metric.value === 'number', `${key}.value 应为 number|null`);
      assertString(metric.definition, `${key}.definition 应为非空字符串`);
      assert(metric.definition.includes('分子'), `${key}.definition 应复述分子`);
      assert(metric.definition.includes('分母'), `${key}.definition 应复述分母`);
    }

    // 空样本（合法项目 + 无台账 / 无 guard audit / 无 .sync.json / 无需求）→ value 全 null，且不抛错
    const emptyDir = mkdtempSync(join(tmpdir(), 'feel-adherence-empty-'));
    mkdirSync(join(emptyDir, '.openfeel'), { recursive: true });
    writeFileSync(
      join(emptyDir, '.openfeel', 'flow.json'),
      `${JSON.stringify({
        schemaVersion: 1,
        pipeline: { current: { stage: '', op: '' } },
        stages: {},
        requirements: [],
        reviews: [],
        log: [],
      }, null, 2)}\n`,
      'utf-8',
    );
    const empty = ok(
      await sourceVerify.execute({ action: 'adherence', project: emptyDir }, execFor(emptyDir)),
      'feel_verify adherence 空样本',
    );
    for (const key of keys) {
      assert(empty[key].value === null, `${key}.value 空样本应为 null，实际 ${JSON.stringify(empty[key].value)}`);
    }
    rmSync(emptyDir, { recursive: true, force: true });
  });

  await check('快照 revision / stale / snapshotAt（v1.5.4）', async () => {
    const status = ok(await workspace.tools.get('feel_status').execute({}, realExec));
    assert(status.revision === null || typeof status.revision === 'number', 'revision 应为 number/null');
    assert(typeof status.snapshotAt === 'string' && status.snapshotAt.includes('T'), 'snapshotAt 应为 ISO');
    assert(typeof status.stale === 'boolean', 'stale 应为布尔');
    const next = ok(await workspace.tools.get('feel_next').execute({}, realExec));
    assert(next.revision === null || typeof next.revision === 'number', 'feel_next revision');
    assert(typeof next.stale === 'boolean', 'feel_next stale');
    assert('lastError' in next.recovery, 'recovery 缺 lastError');
    assert(typeof next.recovery.resumeCount === 'number', 'recovery 缺 resumeCount');
  });

  await check('plan_pending 超过 10 分钟 → 闸门滥用提示（v1.5.4）', () => {
    const old = new Date(Date.now() - 11 * 60_000).toISOString();
    const plan = planNextStep({
      focus: { stage: 's1', phase: 'plan_pending', legalNextPhases: ['plan_review'], responsibleAgent: 'planner' },
      mode: { current: 'fast', activeStageMode: 'fast' },
      recovery: { lastTransition: { time: old } },
      statusSync: { due: false },
    });
    assert(plan.adapterHints.some((hint) => hint.includes('plan_pending')), `缺少空转提示: ${plan.adapterHints.join('|')}`);
  });

  await check('preflight 字段（v1.5.5）', async () => {
    const status = ok(await workspace.tools.get('feel_status').execute({}, realExec));
    assert(status.preflight && typeof status.preflight.ok === 'boolean', 'feel_status 缺 preflight');
    const next = ok(await workspace.tools.get('feel_next').execute({}, realExec));
    assert(next.preflight && typeof next.preflight.ok === 'boolean', 'feel_next 缺 preflight');
  });

  await check('observability 组合摘要（v1.5.6）', async () => {
    /** 精确键集（INV-7；6 键含 schemaVersion，排序比对以消除口径歧义） */
    const OBS_KEYS = ['schemaVersion', 'stale', 'preflightAgeMs', 'preflightOk', 'statusSync', 'summary'].sort();

    /** 校验形状（INV-7 / INV-13） */
    const assertShape = (obs, label) => {
      assert(obs !== null && typeof obs === 'object', `${label} 缺 observability 对象`);
      const keys = Object.keys(obs);
      assert(
        JSON.stringify([...keys].sort()) === JSON.stringify(OBS_KEYS),
        `${label} observability 键集应恰为 ${OBS_KEYS.join(',')}（实际 ${keys.join(',')}）`,
      );
      assert(keys.length === 6, `${label} observability 应为 6 键，实际 ${keys.length}`);
      assert(obs.schemaVersion === 1, `${label} observability.schemaVersion 应为 1`);
      assert(typeof obs.stale === 'boolean', `${label} observability.stale 应为布尔`);
      assert(
        obs.preflightAgeMs === null || typeof obs.preflightAgeMs === 'number',
        `${label} observability.preflightAgeMs 应为 number|null`,
      );
      assert(typeof obs.preflightOk === 'boolean', `${label} observability.preflightOk 应为布尔`);
      assert(
        obs.statusSync === null
          || (typeof obs.statusSync === 'object'
            && typeof obs.statusSync.due === 'boolean'
            && 'lastSync' in obs.statusSync
            && typeof obs.statusSync.intervalMinutes === 'number'),
        `${label} observability.statusSync 应为 null 或三键对象`,
      );
      if (obs.statusSync !== null) {
        assert(
          JSON.stringify(Object.keys(obs.statusSync).sort()) === JSON.stringify(['due', 'intervalMinutes', 'lastSync']),
          `${label} observability.statusSync 应恰为三键`,
        );
      }
      assertString(obs.summary, `${label} observability.summary 为空`);
      // 反向：不得嵌套 preflight 对象（只允许两个标量副本）
      assert(obs.preflight === undefined, `${label} observability 不得嵌套 preflight`);
    };

    const status = ok(await workspace.tools.get('feel_status').execute({ detail: 'full' }, realExec));
    assertShape(status.observability, 'feel_status');
    // 既有键仍在（INV-13）
    for (const key of ['stale', 'preflight', 'statusSync', 'recovery']) {
      assert(key in status, `feel_status 既有键 ${key} 丢失`);
    }

    const next = ok(await workspace.tools.get('feel_next').execute({}, realExec));
    assertShape(next.observability, 'feel_next');
    for (const key of ['stale', 'preflight', 'statusSync', 'recovery', 'dispatch']) {
      assert(key in next, `feel_next 既有键 ${key} 丢失`);
    }
  });

  await check('observability 复制不重算（v1.5.6）', async () => {
    // INV-8：两个标量必须与顶层 preflight 同源同值；statusSync 三键全等
    const status = ok(await workspace.tools.get('feel_status').execute({ detail: 'full' }, realExec));
    assert(
      status.observability.preflightAgeMs === status.preflight.ageMs,
      `feel_status preflightAgeMs 应复制 ageMs（obs=${status.observability.preflightAgeMs} top=${status.preflight.ageMs}）`,
    );
    assert(
      status.observability.preflightOk === status.preflight.ok,
      'feel_status preflightOk 应复制 preflight.ok（禁止重算）',
    );
    assert(
      JSON.stringify(status.observability.statusSync) === JSON.stringify(status.statusSync),
      'feel_status observability.statusSync 应与顶层 statusSync 全等（三键原样）',
    );

    const next = ok(await workspace.tools.get('feel_next').execute({}, realExec));
    assert(
      next.observability.preflightAgeMs === next.preflight.ageMs,
      'feel_next preflightAgeMs 应复制 ageMs',
    );
    assert(next.observability.preflightOk === next.preflight.ok, 'feel_next preflightOk 应复制 preflight.ok');
    assert(
      JSON.stringify(next.observability.statusSync) === JSON.stringify(next.statusSync),
      'feel_next observability.statusSync 应与顶层 statusSync 全等',
    );
  });

  await check('observability preflight 在 snapshot 之前读取（REV-022）', async () => {
    // INV-12：在**副本**里放一份 8 小时前的账本。若读取发生在 readSnapshot 之后，
    // `flow status --json` / `flow next --json` 会把账本刷成「现在」⇒ age≈0 ⇒ 本断言必失败。
    // 绝不写原项目（纪律：所有写操作只打副本）。
    const root = mkdtempSync(join(tmpdir(), 'feel-observability-'));
    const project = join(root, 'project');
    try {
      cpSync(join(SOURCE_PROJECT, '.openfeel'), join(project, '.openfeel'), { recursive: true });
      const oldAt = new Date(Date.now() - 8 * 3_600_000).toISOString();
      writeFileSync(
        join(project, '.openfeel', 'dev', '.preflight.json'),
        `${JSON.stringify({ at: oldAt, stage: null, phase: null, revision: null }, null, 2)}\n`,
      );
      const status = ok(await workspace.tools.get('feel_status').execute({ project, detail: 'full' }, execFor(project)));
      assertString(status.observability?.summary, '副本 feel_status 缺 observability.summary');
      assert(
        typeof status.observability.preflightAgeMs === 'number' && status.observability.preflightAgeMs >= 7 * 3_600_000,
        `读取次序错误（REV-022）：preflightAgeMs=${status.observability.preflightAgeMs}，应 ≥ 7h（在 readSnapshot 之后读会被刷成 ≈0）`,
      );
      assert(status.observability.preflightOk === false, '8 小时前的账本必须判为已过期（preflightOk=false）');
      assert(
        status.preflight.at === oldAt,
        `顶层 preflight.at 应保留旧账本时间（实际 ${status.preflight.at}）`,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  await check('observability 纯函数降级（缺失数据不抛，v1.5.6）', () => {
    const empty = buildObservability({});
    assert(empty !== null && typeof empty === 'object', 'buildObservability({}) 应返回对象');
    assert(empty.preflightAgeMs === null, 'preflightAgeMs 应为 null');
    assert(empty.preflightOk === false, 'preflightOk 应为 false');
    assert(empty.statusSync === null, 'statusSync 应为 null');
    assert(empty.stale === false, 'stale 缺失应降为 false');
    assertString(empty.summary, 'summary 不应为空');
    assert(empty.summary.includes('无记录'), `summary 应写明无记录：${empty.summary}`);

    // 脏入参不抛，且不臆断
    const dirty = buildObservability({ preflight: { ok: 'yes', ageMs: 'nope' }, statusSync: { due: 'x' }, stale: 'yes' });
    assert(dirty.preflightAgeMs === null, '非法 ageMs 应降级为 null');
    assert(dirty.preflightOk === false, '非法 ok 应降级为 false');
    assert(dirty.statusSync === null, '非法 statusSync 应降级为 null');
    assert(dirty.stale === false, '非法 stale 应降级为 false');

    // REV-024：`readPreflightInfo` 对「at 不可解析」返回 at 非空 + ageMs:null ——
    // 必须单独一档，**不得**与「从未读过状态」合并（否则同一 payload 里 at 有值、summary 说没调用过）。
    const unparsable = buildObservability({
      preflight: { ok: false, at: 'garbage', ageMs: null },
      statusSync: { due: false, lastSync: null, intervalMinutes: 30 },
      stale: false,
    });
    assert(unparsable.preflightAgeMs === null, '不可解析时 preflightAgeMs 应为 null');
    assert(unparsable.preflightOk === false, '不可解析时 preflightOk 应为 false');
    assert(
      unparsable.summary.includes('时间戳不可解析'),
      `at 不可解析应单独一档（实际：${unparsable.summary}）`,
    );
    assert(
      unparsable.summary.includes('garbage'),
      `不可解析摘要应保留原始 at（实际：${unparsable.summary}）`,
    );
    assert(
      unparsable.summary.includes('未调用过') === false,
      `at 非空时不得声称「未调用过」（实际：${unparsable.summary}）`,
    );
    // at 为 null 时仍走「无记录」
    const neverRead = buildObservability({ preflight: { ok: false, at: null, ageMs: null } });
    assert(neverRead.summary.includes('无记录'), `at:null 应为无记录（实际：${neverRead.summary}）`);

    // 复制而非重算：ok=true 配一个远超 10 分钟的年龄，preflightOk 仍必须为 true
    const copied = buildObservability({ preflight: { ok: true, ageMs: 8 * 3_600_000 }, statusSync: { due: false, lastSync: '2026-01-01T00:00:00.000Z', intervalMinutes: 30 } });
    assert(copied.preflightOk === true, 'preflightOk 必须复制 preflight.ok，不得按年龄重算');
    assert(copied.preflightAgeMs === 8 * 3_600_000, 'preflightAgeMs 应原样复制');
    assert(copied.statusSync.intervalMinutes === 30, 'statusSync 三键应原样保留');
    assert(copied.summary.includes('已过期') === false, 'summary 的过期判定跟随复制的 ok');

    // summary 四态（§3.1 降级表）：无记录 / 有效 / 已过期 / 状态同步不可用（+ stale 两种口吻）
    const fresh = buildObservability({
      preflight: { ok: true, ageMs: 90_000 },
      statusSync: { due: false, lastSync: '2026-01-01T00:00:00.000Z', intervalMinutes: 30 },
      stale: false,
    });
    assert(fresh.summary.includes('前（有效）'), `fresh 摘要错误：${fresh.summary}`);
    assert(fresh.summary.includes('快照=权威'), `stale=false 摘要错误：${fresh.summary}`);
    const expired = buildObservability({
      preflight: { ok: false, ageMs: 8 * 3_600_000 },
      statusSync: { due: true, lastSync: null, intervalMinutes: 30 },
      stale: true,
    });
    assert(expired.summary.includes('前（已过期）'), `expired 摘要错误：${expired.summary}`);
    assert(expired.summary.includes('状态记录已到期'), `due 摘要错误：${expired.summary}`);
    assert(expired.summary.includes('快照为降级'), `stale=true 摘要错误：${expired.summary}`);
    const noSync = buildObservability({ preflight: { ok: true, ageMs: 1_000 }, statusSync: null, stale: false });
    assert(noSync.statusSync === null, 'statusSync=null 应原样保持 null');
    assert(noSync.summary.includes('状态同步: 不可用'), `sync 缺失摘要错误：${noSync.summary}`);
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

  await check('feel_req action=board 返回 8 组固定顺序（v1.7.0 / REQ-063 新增 review_pending）', async () => {
    const result = await workspace.tools.get('feel_req').execute({ action: 'board' }, realExec);
    const data = ok(result);
    // OpenFeel 契约：groups 是**对象**，键的声明顺序即 REQ_STATUSES（done 在 blocked 之前）。
    assert(typeof data.groups === 'object' && data.groups !== null, 'groups 应为对象');
    assert(!Array.isArray(data.groups), 'groups 不应是数组');
    const keys = Object.keys(data.groups);
    assert(keys.length === 8, `应为 8 组，实际 ${keys.length}`);
    assert(
      keys.join(',') === 'draft,scheduled,in_progress,review_pending,done,blocked,cancelled,rejected',
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

  await check('feel_op action=retry 返回重试状态（JSON，v1.2.4 出口）', async () => {
    // 从真实 op 列表里取一个合法 op id，避免用假 id 触发 INVALID_ARGUMENT。
    const listResult = await workspace.tools.get('feel_op').execute({ action: 'list' }, realExec);
    const listed = ok(listResult);
    const ops = Array.isArray(listed?.ops) ? listed.ops : [];
    if (ops.length === 0) {
      process.stdout.write('    (no active ops; retry assertion skipped)\n');
      return;
    }
    const op = ops[0];
    const opId = `${op.stage}.${op.opId}`;
    const result = await workspace.tools.get('feel_op').execute({ action: 'retry', op: opId }, realExec);
    const data = ok(result);
    assert(data.schemaVersion === 1, 'schemaVersion 应为 1');
    assert(data.op === opId, `op 应回显 ${opId}，实际 ${data.op}`);
    assert(typeof data.attempts === 'number', 'attempts 应为数字');
    assert(typeof data.maxAttempts === 'number', 'maxAttempts 应为数字');
    assert(typeof data.exhausted === 'boolean', 'exhausted 应为布尔');
    assertString(data.state, 'state 为空');
  });

  await check('feel_checkpoint action=list 带 stage 位置参数（v1.3.0 pushPositional）', async () => {
    const result = await workspace.tools
      .get('feel_checkpoint')
      .execute({ action: 'list', stage: fixtureStage }, realExec);
    const data = ok(result);
    assert(data.stage === fixtureStage, `stage 应回显，实际 ${JSON.stringify(data.stage)}`);
    assert(Array.isArray(data.checkpoints), 'checkpoints 应为数组');
  });

  await check('feel_review action=list 返回条目（JSON）', async () => {
    const result = await workspace.tools.get('feel_review').execute({ action: 'list' }, realExec);
    const data = ok(result);
    assert(data.schemaVersion === 1, 'schemaVersion 应为 1');
    assert(typeof data === 'object' && data !== null, '结果应为对象');
  });

  await check('feel_stage action=list 返回阶段（JSON，v1.2.4 出口）', async () => {
    const result = await workspace.tools.get('feel_stage').execute({ action: 'list' }, realExec);
    const data = ok(result);
    assert(data.schemaVersion === 1, 'schemaVersion 应为 1');
    assert(Array.isArray(data.stages), 'stages 应为数组');
    assert(typeof data.count === 'number', 'count 应为数字');
    assert(data.stages.length === data.count, `stages 长度应等于 count（${data.stages.length} vs ${data.count}）`);
    const first = data.stages[0];
    assert(first !== undefined, '应至少有一个阶段');
    for (const key of ['id', 'phase', 'status']) {
      assert(first[key] !== undefined, `阶段对象缺字段 ${key}`);
    }
  });

  await check('feel_stage action=status 返回阶段状态（JSON）', async () => {
    const result = await workspace.tools.get('feel_stage').execute({ action: 'status' }, realExec);
    const data = ok(result);
    assert(data.schemaVersion === 1, 'schemaVersion 应为 1');
  });

  await check('feel_plan action=stage_list 返回阶段（JSON，v1.2.4 出口）', async () => {
    const result = await workspace.tools.get('feel_plan').execute({ action: 'stage_list' }, realExec);
    const data = ok(result);
    assert(data.schemaVersion === 1, 'schemaVersion 应为 1');
    assert(Array.isArray(data.stages), 'stages 应为数组');
  });

  await check('feel_plan action=scheme_list 带 stage 位置参数（v1.3.0 pushPositional）', async () => {
    const result = await workspace.tools
      .get('feel_plan')
      .execute({ action: 'scheme_list', stage: fixtureStage }, realExec);
    const data = ok(result);
    assert(data.stage === fixtureStage, `stage 应回显，实际 ${JSON.stringify(data.stage)}`);
    assert(Array.isArray(data.schemes), 'schemes 应为数组');
  });

  await check('feel_plan action=roadmap_show 带 version 位置参数（v1.3.0 pushPositional）', async () => {
    const result = await workspace.tools
      .get('feel_plan')
      .execute({ action: 'roadmap_show', version: '1.2.4' }, realExec);
    const data = ok(result);
    assert(data.version === '1.2.4', `version 应为 1.2.4，实际 ${JSON.stringify(data.version)}`);
    assert(Array.isArray(data.milestones) && data.milestones.length > 0, 'milestones 不应为空');
  });

  await check('feel_verify action=config_effective 带 key 位置参数（v1.3.0 pushPositional）', async () => {
    const result = await workspace.tools
      .get('feel_verify')
      .execute({ action: 'config_effective', key: 'workflow_mode' }, realExec);
    const data = ok(result);
    assert(data.key === 'workflow_mode', `key 应回显 workflow_mode，实际 ${JSON.stringify(data.key)}`);
    assertString(String(data.value), 'value 为空');
    assertString(data.source, 'source 为空');
  });

  await check('feel_model action=list 返回模型（JSON，v1.2.4 出口）', async () => {
    const result = await workspace.tools.get('feel_model').execute({ action: 'list' }, realExec);
    const data = ok(result);
    assert(data.schemaVersion === 1, 'schemaVersion 应为 1');
    assert(Array.isArray(data.agents), 'agents 应为数组');
    assert(data.agents.length > 0, 'agents 不应为空');
    // scope 为 null 表示「未指定层级 → 展示生效值」，不是缺失。
    assert(data.scope === null || typeof data.scope === 'string', `scope 应为 null 或字符串，实际 ${JSON.stringify(data.scope)}`);
    for (const item of data.agents) {
      assert(typeof item.agent === 'string' && item.agent !== '', '每个 agent 应有非空 agent 字段');
      assert(Object.hasOwn(item, 'model'), '每个 agent 应带 model 字段（可为 null）');
    }
  });

  await check('feel_model action=get 返回单 agent（JSON，v1.2.4 出口）', async () => {
    const result = await workspace.tools
      .get('feel_model')
      .execute({ action: 'get', agent: 'openfeel-executor' }, realExec);
    const data = ok(result);
    assert(data.schemaVersion === 1, 'schemaVersion 应为 1');
    assert(data.agent === 'openfeel-executor', `agent 应为 openfeel-executor，实际 ${data.agent}`);
    // 模型配置是环境相关项：未命中任何层级时 model/provider/source 均可能为 null（契约允许）。
    assert(data.model === null || typeof data.model === 'string', `model 应为 string|null，实际 ${JSON.stringify(data.model)}`);
    assert(data.provider === null || typeof data.provider === 'string', `provider 应为 string|null，实际 ${JSON.stringify(data.provider)}`);
    assert(data.source === null || typeof data.source === 'string', `source 应为 string|null，实际 ${JSON.stringify(data.source)}`);
    assert(result.summary.includes('openfeel-executor'), 'summary 应包含 agent 名');
  });

  await check('feel_model action=get 未配置 agent 时 model 为 null', async () => {
    const result = await workspace.tools.get('feel_model').execute({ action: 'get', agent: 'feel' }, realExec);
    const data = ok(result);
    assert(data.model === null, `未配置 agent 的 model 应为 null，实际 ${JSON.stringify(data.model)}`);
    assert(result.summary.includes('未配置'), 'summary 应说明未配置');
  });

  await check('feel_plan action=roadmap_show 空态语义（JSON，v1.2.4 出口）', async () => {
    const result = await workspace.tools.get('feel_plan').execute({ action: 'roadmap_show' }, realExec);
    const data = ok(result);
    assert(data.schemaVersion === 1, 'schemaVersion 应为 1');
    assert(data.version === null, '未传版本时 version 应为 null（不自动发现）');
    assert(Array.isArray(data.milestones) && data.milestones.length === 0, '空态 milestones 应为 []');
    assert(result.summary.includes('不自动发现'), 'summary 应提示需显式传版本');
  });

  await check('feel_verify action=lint 返回结构化结果（JSON，v1.2.4 出口）', async () => {
    const result = await workspace.tools.get('feel_verify').execute({ action: 'lint', target: 'kb' }, realExec);
    const data = ok(result);
    assert(data.schemaVersion === 1, 'schemaVersion 应为 1');
    assert(data.target === 'kb', `target 应为 kb，实际 ${data.target}`);
    assert(typeof data.ok === 'boolean', 'ok 应为布尔');
    assert(Array.isArray(data.issues), 'issues 应为数组');
  });

  await check('feel_verify action=config_get 无 key 走 --all（JSON，v1.2.4 出口）', async () => {
    const result = await workspace.tools.get('feel_verify').execute({ action: 'config_get' }, realExec);
    const data = ok(result);
    assert(data.schemaVersion === 1, 'schemaVersion 应为 1');
    assert(data.scope === 'project', `scope 应为 project，实际 ${data.scope}`);
    assert(data.defaults !== null && typeof data.defaults === 'object', 'defaults 应为对象');
  });

  await check('feel_verify action=config_get 有 key 保持原行为', async () => {
    const result = await workspace.tools
      .get('feel_verify')
      .execute({ action: 'config_get', key: 'defaults.workflow_mode' }, realExec);
    const data = ok(result);
    assert(data.key === 'defaults.workflow_mode', `key 应回显，实际 ${data.key}`);
    assertString(String(data.value), 'value 为空');
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
  // v1.5.5：适配器写命令 strict，先对副本调用一次 feel_status 记录 preflight（真实工作流同样先读状态）。
  await workspace.tools.get('feel_status').execute({ project: tempProject }, tempExec);
  const modeBefore = readFileSync(join(tempProject, '.openfeel', 'flow.json'), 'utf8').match(/"revision":\s*(\d+)/)?.[1];

  // 写操作测试必须先于任何「原项目未被修改」断言，且只能打副本。
  await check('feel_op action=create 位置参数无空参（v1.3.0 pushPositional，副本）', async () => {
    const result = await workspace.tools
      .get('feel_op')
      .execute({ action: 'create', stage: fixtureStage, title: 'verify create' }, tempExec);
    ok(result);
    const listed = ok(await workspace.tools.get('feel_op').execute({ action: 'list' }, tempExec));
    const ops = Array.isArray(listed?.ops) ? listed.ops : [];
    assert(
      ops.some((op) => op.stage === fixtureStage && op.title === 'verify create'),
      'verify create 应已创建（否则说明空位置参数导致 create 失败）',
    );
  });

  // v1.3.4：review_add 必须能挂阶段级 REV（fast 无 op 场景）
  await check('feel_flow review_add 透传 --stage（v1.3.4）', async () => {
    const result = await workspace.tools.get('feel_flow').execute(
      { action: 'review_add', stage: fixtureStage, title: 'verify stage-level REV' },
      tempExec,
    );
    const data = ok(result);
    assert(/REV-\d+/.test(String(data.output)), `review_add --stage 应返回 REV，实际: ${data.output}`);
    assert(String(data.output).includes(fixtureStage), '输出应包含阶段 ID');
  });

  await check('feel_flow review_add 缺 op/stage → FEEL_BAD_USAGE', async () => {
    /** @type {any} */
    let error;
    try {
      await workspace.tools.get('feel_flow').execute({ action: 'review_add', title: 'x' }, tempExec);
    } catch (caught) {
      error = caught;
    }
    assert(error !== undefined, '缺 op/stage 应抛错');
    assert(error.code === 'FEEL_BAD_USAGE', `code 应为 FEEL_BAD_USAGE，实际 ${error.code}`);
  });

  await check('feel_flow review_add 旧 --op 路径零回归', async () => {
    // 使用副本中真实存在的 op（feel_op create 已建 op-001）
    const result = await workspace.tools.get('feel_flow').execute(
      { action: 'review_add', op: `${fixtureStage}.op-001`, title: 'verify op-level REV' },
      tempExec,
    );
    const data = ok(result);
    assert(/REV-\d+/.test(String(data.output)), `review_add --op 应返回 REV，实际: ${data.output}`);
  });

  await check('feel_req action=add 创建需求（add 即写正文：summary / goal / acceptance）', async () => {
    // v1.6.0-stage-132 / T13：正文门（REQ_BODY）要求 `## 摘要` 与 `## 目标与验收`
    // **都**写实；`add` 的 summary / goal / acceptance 在 CLI 侧先于状态流转落盘，
    // 这是「一步开单」不再被空壳正文拦下的唯一通道。
    // v1.7.0 / REQ-065 A65.1：三字段改由共享夹具工厂提供（口径单点在 test/fixtures/requirement-input.js）。
    const bodyInput = makeFilledBodyInput();
    const result = await workspace.tools.get('feel_req').execute(
      {
        action: 'add',
        title: '适配器验证需求',
        target_version: 'v9.9.9',
        ...bodyInput,
      },
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

  await check('需求状态流转 draft→scheduled（add 写入的正文过 REQ_BODY 门）', async () => {
    const list = await workspace.tools.get('feel_req').execute({ action: 'list' }, tempExec);
    const listed = ok(list, 'req list');
    const target = listed.requirements.find((/** @type {any} */ item) => item.title === '适配器验证需求');
    assert(target !== undefined, '未找到测试需求');
    // 正文写实证据：summary / goal / acceptance 已由 `req add` 落盘（不再需要二次补写）
    const bodyPath = join(tempProject, '.openfeel', 'requirements', `${target.id}.md`);
    assert(existsSync(bodyPath), `需求正文文件应已生成：${bodyPath}`);
    const body = readFileSync(bodyPath, 'utf-8');
    const bodyInput = makeFilledBodyInput();
    assert(body.includes(bodyInput.summary), '`## 摘要` 应包含 add 传入的 summary');
    assert(/###\s*目标/.test(body) && /###\s*验收/.test(body), '`## 目标与验收` 应含 goal / acceptance 两个子节');
    assert(/- A1/.test(body), '`## 目标与验收` 应含 `- ` 判据行');
    // 共享夹具与落盘正文同构：同一份三字段拼出的整份正文，章节标题与判据行一致
    const fixtureBody = makeFilledRequirement(target.id, '适配器验证需求');
    for (const heading of ['## 摘要', '## 目标与验收']) {
      assert(
        fixtureBody.includes(heading) && body.includes(heading),
        `夹具与落盘正文都应含 ${heading}（两栈同一份口径）`,
      );
    }
    assert(fixtureBody.includes(bodyInput.summary) && body.includes(bodyInput.summary), '两栈使用同一份 summary 常量');
    // v1.6.0 / REQ-061：正文写实后，draft→scheduled 必须放行（此前空壳正文在这里被拒）
    await workspace.tools.get('feel_req').execute({ action: 'advance', id: target.id, to: 'scheduled' }, tempExec);
    const after = await workspace.tools.get('feel_req').execute({ action: 'show', id: target.id }, tempExec);
    const shown = ok(after, 'req show');
    assert(shown.requirement.status === 'scheduled', `应为 scheduled，实际 ${shown.requirement.status}`);
  });

  await check('feel_req action=add 缺 summary 时 start 被 REQ_BODY 拦（负例，零落库）', async () => {
    // 同一份夹具口径：goal / acceptance 取自共享工厂，只**故意**缺 summary
    const { goal, acceptance } = makeFilledBodyInput();
    /** @type {any} */
    let error;
    try {
      await workspace.tools.get('feel_req').execute(
        {
          action: 'add',
          title: '缺摘要的需求',
          target_version: 'v9.9.9',
          goal,
          acceptance,
          start: true,
        },
        tempExec,
      );
    } catch (caught) {
      error = caught;
    }
    assert(error !== undefined, '缺 summary 的 add start=true 应被正文门拒绝');
    assert(/正文|摘要|REQ_BODY/.test(String(error.message)), `拒绝原因应点明正文门，实际：${error.message}`);
    const listed = ok(await workspace.tools.get('feel_req').execute({ action: 'list' }, tempExec), 'req list');
    assert(
      !listed.requirements.some((/** @type {any} */ item) => item.title === '缺摘要的需求'),
      '被正文门拒绝的需求不应落库',
    );
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

  await check('feel_dev：status 只读 / sync 写 AUTO 块并返回 wrote[]（v1.6.0 / REQ-059）', async () => {
    const tool = workspace.tools.get('feel_dev');
    assert(tool !== undefined, '缺少 feel_dev 工具');
    const syncFile = join(tempProject, '.openfeel', 'dev', '.sync.json');
    const metaBefore = existsSync(syncFile) ? readFileSync(syncFile, 'utf-8') : null;

    // status：只读（不得改写 .sync.json），返回与 CLI 同源的 lastSync / due
    const status = ok(await tool.execute({ action: 'status', project: tempProject }, tempExec), 'feel_dev status');
    assert(status.ok === true, 'status.ok 应为 true');
    assert('lastSync' in status, 'status 应含 lastSync');
    assert(typeof status.due === 'boolean', 'status.due 应为 boolean');
    assert(status.changed === false, 'status.changed 应为 false（只读）');
    assert(Array.isArray(status.wrote) && status.wrote.length === 0, 'status.wrote 应为空数组（只读）');
    const metaAfter = existsSync(syncFile) ? readFileSync(syncFile, 'utf-8') : null;
    assert(metaAfter === metaBefore, 'status 不得改写 .sync.json（只读）');

    // sync：清掉用户目录，保证 AUTO 块状态必变（状态未变时 CLI 会跳过重写）
    rmSync(join(tempProject, '.openfeel', 'users'), { recursive: true, force: true });
    const synced = ok(await tool.execute({ action: 'sync', project: tempProject }, tempExec), 'feel_dev sync');
    assert(synced.ok === true, 'sync.ok 应为 true');
    assert(synced.due === false, 'sync 后 due 应为 false');
    assertString(synced.lastSync, 'sync 应返回 lastSync');
    assert(synced.changed === true, '用户目录被清空后 sync 应判定 changed=true');
    assert(Array.isArray(synced.wrote) && synced.wrote.length >= 1, 'sync.wrote 至少 1 个文件');
    assert(synced.wrote.some((path) => path.endsWith('dev_last.md')), `wrote 应含 dev_last.md，实际 ${synced.wrote.join(',')}`);
    for (const path of synced.wrote) {
      assert(!path.endsWith('.sync.json'), '.sync.json 是元数据，不应出现在 wrote[]');
      assert(existsSync(join(tempProject, ...path.split('/'))), `wrote 里的路径应真实存在：${path}`);
    }
    const meta = JSON.parse(readFileSync(syncFile, 'utf-8'));
    assert(meta.last_sync === synced.lastSync, '.sync.json 与返回值应同源');
  });

  await check('feel_req action=body：argv 映射与参数守卫（v1.6.0 / REQ-055；v1.7.0 A64.4 走临时文件）', async () => {
    /** @type {string[][]} */
    const calls = [];
    /** @type {Array<{ path: string, content: string }>} */
    const capturedFiles = [];
    const doc = { schemaVersion: 1, id: 'REQ-001', section: '摘要', path: '.openfeel/requirements/REQ-001.md', lines: 12, created: false };
    const fakeCli = {
      cwd: tempProject,
      async write(argv) {
        calls.push([...argv]);
        // 临时文件在 CLI 调用期间必须存在且逐字包含输入正文（A64.4 的取证点）；
        // 显式 `--file draft.md` 是相对路径（可能不存在），读不到时跳过取证。
        const fileIndex = argv.indexOf('--file');
        if (fileIndex >= 0) {
          try {
            capturedFiles.push({ path: argv[fileIndex + 1], content: readFileSync(argv[fileIndex + 1], 'utf-8') });
          } catch {
            // 非临时文件路径（相对路径）→ 不取证
          }
        }
        return { ok: true, text: JSON.stringify(doc) };
      },
      async json(argv) {
        calls.push([...argv]);
        return {};
      },
      async text(argv) {
        calls.push([...argv]);
        return { text: '' };
      },
    };
    const bodyTool = createTools({ cli: fakeCli }).find((tool) => tool.name === 'feel_req');
    assert(bodyTool !== undefined, '缺少 feel_req 工具');
    const run = (args) => bodyTool.execute({ ...args, project: tempProject }, tempExec);

    const data = ok(await run({ action: 'body', id: 'REQ-001', section: '摘要', text: '正文' }), 'feel_req body --text');
    assert(calls.length === 1, `应只调用一次 CLI，实际 ${calls.length}`);
    assert(!calls[0].includes('--text'), `多行安全通道：argv 不得出现 --text，实际 ${calls[0].join(' ')}`);
    const fileFlag = calls[0].indexOf('--file');
    assert(fileFlag >= 0, `--text 应改走 --file，实际 ${calls[0].join(' ')}`);
    const tempBodyFile = calls[0][fileFlag + 1];
    assert(tempBodyFile.endsWith('.md') && tempBodyFile !== 'draft.md', `临时文件路径异常：${tempBodyFile}`);
    assert(
      capturedFiles.length === 1 && capturedFiles[0].content === '正文',
      `临时文件应逐字包含输入正文，实际 ${JSON.stringify(capturedFiles)}`,
    );
    assert(!existsSync(tempBodyFile), `临时文件应在调用结束后清理：${tempBodyFile}`);
    assert(data.ok === true && data.id === 'REQ-001' && data.section === '摘要', 'body 返回应回填 id/section');
    assert(data.path === doc.path && data.lines === 12 && data.created === false, 'body 返回应透传 CLI 出口');

    calls.length = 0;
    capturedFiles.length = 0;
    ok(await run({ action: 'body', id: 'REQ-001', section: '目标与验收', file: 'draft.md', append: true }), 'feel_req body --file --append');
    assert(
      calls[0].join(' ') === 'req body REQ-001 --section 目标与验收 --json --file draft.md --append',
      `--file/--append 映射不符：${calls[0].join(' ')}`,
    );
    assert(capturedFiles.length === 0, '显式 --file 不应写临时文件');

    calls.length = 0;
    ok(await run({ action: 'body', id: 'REQ-001', section: '摘要', text: 'x', replace: true }), 'feel_req body --replace');
    assert(calls[0].includes('--replace'), 'replace=true 应透传 --replace');

    // 参数守卫：在发起 CLI 之前就拒绝（零 argv）
    const before = calls.length;
    /** @type {any} */
    let missingSection;
    try {
      await run({ action: 'body', id: 'REQ-001', text: 'x' });
    } catch (caught) {
      missingSection = caught;
    }
    assert(missingSection !== undefined, '缺 section 应抛错');
    assert(/需要参数/.test(String(missingSection.message)), `缺 section 的报错应点明参数，实际 ${missingSection.message}`);
    for (const [label, args] of [
      ['缺 text/file', { action: 'body', id: 'REQ-001', section: '摘要' }],
      ['text+file 互斥', { action: 'body', id: 'REQ-001', section: '摘要', text: 'x', file: 'draft.md' }],
      ['append+replace 互斥', { action: 'body', id: 'REQ-001', section: '摘要', text: 'x', append: true, replace: true }],
    ]) {
      /** @type {any} */
      let error;
      try {
        await run(args);
      } catch (caught) {
        error = caught;
      }
      assert(error !== undefined, `${label} 应抛错`);
      assert(error.code === 'FEEL_BAD_USAGE', `${label} 的 code 应为 FEEL_BAD_USAGE，实际 ${error.code}`);
    }
    assert(calls.length === before, '参数守卫失败时不得调用 CLI');
  });

  await check('feel_req action=add：正文小节参数映射（summary/problem/goal/acceptance/plan，v1.6.0 / T13）', async () => {
    /** @type {string[][]} */
    const calls = [];
    const fakeCli = {
      cwd: tempProject,
      async write(argv) {
        calls.push([...argv]);
        return { ok: true, text: '需求已创建' };
      },
      async json(argv) {
        calls.push([...argv]);
        return {};
      },
      async text(argv) {
        calls.push([...argv]);
        return { text: '' };
      },
    };
    const addTool = createTools({ cli: fakeCli }).find((tool) => tool.name === 'feel_req');
    assert(addTool !== undefined, '缺少 feel_req 工具');
    const run = (args) => addTool.execute({ ...args, project: tempProject }, tempExec);

    ok(await run({
      action: 'add',
      title: '映射标题',
      summary: '摘要正文',
      problem: '问题正文',
      goal: '目标正文',
      acceptance: '- A1 判据',
      plan: '规划正文',
    }), 'feel_req add 正文小节');
    assert(calls.length === 1, `应只调用一次 CLI，实际 ${calls.length}`);
    assert(
      calls[0].join(' ') === 'req add 映射标题 --summary 摘要正文 --problem 问题正文 --goal 目标正文 --acceptance - A1 判据 --plan 规划正文',
      `正文小节映射不符：${calls[0].join(' ')}`,
    );

    // 字段缺省时不传（不得出现空 flag）
    calls.length = 0;
    ok(await run({ action: 'add', title: '裸标题' }), 'feel_req add 裸标题');
    assert(calls[0].length === 3, `缺省字段不应产生 argv，实际 ${calls[0].join(' ')}`);
    for (const flag of ['--summary', '--problem', '--goal', '--acceptance', '--plan']) {
      assert(!calls[0].includes(flag), `缺省时不应透传 ${flag}`);
    }
  });

  await check('feel_req action=body：真实 CLI 写入正文小节（v1.6.0 / REQ-055）', async () => {
    // 适配器只做 argv 映射；端到端写入依赖 T2 的 `req body`。
    // 已安装 CLI 若尚未升级（op-006 R1：`npm run build` + `npm i -g .` 由 T13 统一），
    // 这里显式打印跳过原因——绝不把「CLI 不具备该子命令」伪装成通过。
    const reqTool = workspace.tools.get('feel_req');
    const listed = ok(await reqTool.execute({ action: 'list' }, tempExec), 'req list');
    const target = listed.requirements.find((/** @type {any} */ item) => item.title === '适配器验证需求');
    assert(target !== undefined, '未找到测试需求');
    const marker = `适配器正文写入验证 ${new Date().toISOString()}`;
    let result;
    try {
      result = await reqTool.execute(
        { action: 'body', id: target.id, section: '摘要', text: marker, project: tempProject },
        tempExec,
      );
    } catch (error) {
      if (/unknown command|未知.*(命令|子命令)/i.test(String(error?.message ?? ''))) {
        process.stdout.write('    (skip: 已安装 CLI 不含 req body —— 升级 CLI 后自动生效)\n');
        return;
      }
      throw error;
    }
    const data = ok(result, 'feel_req body');
    assertString(data.path, 'body 应返回 path');
    assert(typeof data.lines === 'number' && data.lines > 0, 'body 应返回 lines');
    assert(data.created === false, '既有 ## 摘要 不应被判为新建');
    const file = join(tempProject, ...String(data.path).split('/'));
    assert(existsSync(file), `正文文件应存在：${file}`);
    const markdown = readFileSync(file, 'utf-8');
    assert(markdown.includes(marker), '正文文件应包含本次写入内容');
    assert(markdown.includes('## 摘要'), '正文文件应保留 ## 摘要 小节');
  });

  await check('A64.4 feel_req action=body：多行 / ### 子标题 / CRLF 经临时文件原样落盘（v1.7.0 / REQ-064）', async () => {
    // ① 适配器契约（不依赖已安装 CLI）：多行正文必须原样进临时文件，再以 --file 交给 CLI
    const multiLine = '\n第一行：多行正文保真\n\n### 子标题\n\n- 列表项 A\n1. 列表项 B\n\n---\n\n第三段（下一行以 CRLF 结尾）\r\n第四段\n';
    /** @type {string[][]} */
    const calls = [];
    /** @type {string | null} */
    let captured = null;
    const fakeCli = {
      cwd: tempProject,
      async write(argv) {
        calls.push([...argv]);
        const fileIndex = argv.indexOf('--file');
        if (fileIndex >= 0) captured = readFileSync(argv[fileIndex + 1], 'utf-8');
        return {
          ok: true,
          text: JSON.stringify({
            schemaVersion: 1,
            id: 'REQ-001',
            section: '摘要',
            path: '.openfeel/requirements/REQ-001.md',
            lines: multiLine.split(/\r?\n/).length,
            created: false,
          }),
        };
      },
      async json() { return {}; },
      async text() { return { text: '' }; },
    };
    const tool = createTools({ cli: fakeCli }).find((entry) => entry.name === 'feel_req');
    assert(tool !== undefined, '缺少 feel_req 工具');
    const result = ok(await tool.execute({ action: 'body', id: 'REQ-001', section: '摘要', text: multiLine, project: tempProject }, tempExec), '多行 body');
    assert(calls.length === 1 && !calls[0].includes('--text'), `多行正文不得经 argv --text：${calls[0].join(' ')}`);
    assert(captured === multiLine, `临时文件字节应与输入逐字相等，实际 ${JSON.stringify(captured)}`);
    assert(result.lines === multiLine.split(/\r?\n/).length, 'lines 应与 body.split(/\\r?\\n/).length 一致');
    const tempPath = calls[0][calls[0].indexOf('--file') + 1];
    assert(!existsSync(tempPath), `临时文件应清理：${tempPath}`);

    // ② 端到端（依赖已安装 CLI 含 --from / 多行修复；未升级则显式 skip，不伪装通过）
    const help = spawnSync('openfeel', ['req', 'body', '--help'], { encoding: 'utf-8', shell: true });
    if (!/--from/.test(String(help.stdout ?? ''))) {
      process.stdout.write('    (skip: 已安装 CLI 未含 req body --from / 多行修复 —— 升级 CLI 后自动生效)\n');
      return;
    }
    const reqTool = workspace.tools.get('feel_req');
    const listed = ok(await reqTool.execute({ action: 'list' }, tempExec), 'req list');
    const target = listed.requirements.find((/** @type {any} */ item) => item.title === '适配器验证需求');
    assert(target !== undefined, '未找到测试需求');
    const marker = `多行保真验证 ${new Date().toISOString()}`;
    const expected = `\n${marker}\n\n### 子标题\n\n- 列表项 A\n1. 列表项 B\n\n---\n`;
    const written = ok(await reqTool.execute(
      { action: 'body', id: target.id, section: '问题', text: expected, project: tempProject },
      tempExec,
    ), '多行 body E2E');
    const file = join(tempProject, ...String(written.path).split('/'));
    const markdown = readFileSync(file, 'utf-8');
    assert(markdown.includes(expected), '正文文件应逐字包含多行输入（含 ### / 列表 / --- / 首行空行）');
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

  // 出口 #33（archive <stage> --json）是**写命令**：只允许打在副本上。
  // v1.2.4 起 CLI 拒绝覆盖已存在的归档文件（ARCHIVE_EXISTS，零写盘）。
  // fixture 用当前活跃阶段（动态取 feel_stage list 首项；版本归档后仍可用）。
  // ★ REV-019：夹具**无条件**写入（不再 `if (!existsSync)` 守卫）——测试自己控制输入，
  //   不依赖「项目里恰好存在一个 >100 行的归档」这种脆弱前提。首阶段刚归档时其真实
  //   archive md 可能只有几十行（0 op / 少量 REV，短是合法的），守卫会让合成夹具被跳过。
  const archivedStage = fixtureStage;
  const archiveMdPath = join(tempProject, '.openfeel', 'log', `archive-${archivedStage}.md`);
  const flowJsonPath = join(tempProject, '.openfeel', 'flow.json');
  const syntheticArchiveMd = `# synthetic archive fixture — ${archivedStage}\n\n`
    + Array.from({ length: 120 }, (_, i) => `- synthetic line ${i + 1}`).join('\n')
    + '\n';
  writeFileSync(archiveMdPath, syntheticArchiveMd, 'utf8');

  await check('A1: 归档文件已存在时拒绝覆盖且零写盘（副本）', async () => {
    const mdBefore = readFileSync(archiveMdPath, 'utf8');
    assert(mdBefore === syntheticArchiveMd, '前置：拒绝覆盖用例的输入应是合成夹具');
    const revBefore = readFileSync(flowJsonPath, 'utf8').match(/"revision":\s*(\d+)/)?.[1];
    let rejected;
    try {
      await workspace.tools.get('feel_archive').execute({ action: 'stage_summary', stage: archivedStage }, tempExec);
    } catch (error) {
      rejected = error;
    }
    assert(rejected !== undefined, '应拒绝覆盖已存在的归档');
    assert(rejected.code === 'ARCHIVE_EXISTS', `code 应为 ARCHIVE_EXISTS，实际 ${rejected.code}`);
    assert(rejected.kind === 'refusal', `kind 应为 refusal，实际 ${rejected.kind}`);
    assert(rejected.message.includes('force=true'), '拒绝消息应指引 force=true');
    // 双重零写盘：md 内容逐字等价（「拒绝覆盖」的不变式是**内容不变**，不是行数）+ revision 不变
    const mdAfter = readFileSync(archiveMdPath, 'utf8');
    assert(mdAfter === mdBefore, `归档 md 内容被改动（${mdBefore.length} → ${mdAfter.length} 字节）`);
    const revAfter = readFileSync(flowJsonPath, 'utf8').match(/"revision":\s*(\d+)/)?.[1];
    assert(revAfter === revBefore, `revision 被改动：${revBefore} → ${revAfter}`);
  });

  await check('A1: force=true 显式覆盖并返回 #33 六键文档（副本）', async () => {
    const mdBeforeForce = readFileSync(archiveMdPath, 'utf8');
    const result = await workspace.tools
      .get('feel_archive')
      .execute({ action: 'stage_summary', stage: archivedStage, force: true }, tempExec);
    const data = ok(result, 'stage_summary force');
    assert(data.schemaVersion === 1, 'schemaVersion 应为 1');
    assert(data.stage === archivedStage, `stage 应为 ${archivedStage}，实际 ${data.stage}`);
    assert(typeof data.opsCount === 'number', 'opsCount 应为数字');
    assert(typeof data.reviewsCount === 'number', 'reviewsCount 应为数字');
    assert(Array.isArray(data.knowledgeExtracts), 'knowledgeExtracts 应为数组');
    assertString(data.archivePath, 'archivePath 为空');
    assert(result.summary.includes('覆盖重写'), 'force 成功时 summary 应标明覆盖重写');
    // 覆盖确实生效：md 内容**已改变**（与「零写盘」用例的内容不变互为逆变式）
    const mdAfterForce = readFileSync(archiveMdPath, 'utf8');
    assert(mdAfterForce !== mdBeforeForce, 'force 覆盖后 md 内容应改变');
    assert(mdBeforeForce === syntheticArchiveMd, '前置：force 覆盖前的内容应是合成夹具');
  });

  await check('原项目归档摘要未被触碰', () => {
    // 用一份确定存在且 >100 行的原项目历史摘要做只读校验（与 fixture 阶段解耦）。
    const originalPath = join(SOURCE_PROJECT, '.openfeel', 'log', 'archive-v1.2.0-stage-78.md');
    assert(existsSync(originalPath), '原项目归档摘要缺失');
    const original = readFileSync(originalPath, 'utf8');
    const lineCount = original.split('\n').length;
    assert(lineCount > 100, `原项目归档摘要疑似被覆盖：仅 ${lineCount} 行`);
  });

  // ── v1.5.8 / REQ-027：review / verify 新 action（副本） ──
  // 能力探测：适配器验证跑在**已安装的 openfeel CLI** 上（版本与仓库 dist 各自独立）。
  // 旧版 CLI 没有这些命令时按「跳过并说明」处理，避免把「未安装新版」误报成适配器缺陷。
  const tempCli = new FeelCli({ command: 'openfeel', cwd: tempProject });
  let hasReq027 = false;
  try {
    // 注意：unknown 子命令 + --help 仍会退出 0（commander 在父级处理 --help），
    // 故必须**读父级 help 的输出**判定子命令是否注册。
    const probe = await tempCli.run(['req', '--help'], { cwd: tempProject });
    hasReq027 = probe.code === 0
      && probe.stdout.includes('review <id>')
      && probe.stdout.includes('verify <id>');
  } catch {
    hasReq027 = false;
  }

  await check('feel_req action=review / verify 记录审查与验证（REQ-027，副本）', async () => {
    if (!hasReq027) {
      process.stdout.write('    (skip: 目标 openfeel CLI 未包含 REQ-027 命令，重装新版后覆盖)\n');
      return;
    }
    const listed = ok(await workspace.tools.get('feel_req').execute({ action: 'list' }, tempExec), 'req list');
    const target = listed.requirements.find((/** @type {any} */ item) => item.title === '适配器验证需求');
    assert(target !== undefined, '未找到适配器验证需求');

    const reviewResult = await workspace.tools.get('feel_req').execute(
      { action: 'review', id: target.id, result: 'pass', by: 'feel-reviewer', note: 'LGTM', independent: true },
      tempExec,
    );
    const reviewData = ok(reviewResult, 'req review');
    assert(reviewData.result === 'pass', `review result 应回显 pass，实际 ${reviewData.result}`);
    assert(reviewResult.summary.includes('审查'), `summary 应含「审查」：${reviewResult.summary}`);

    const verifyResult = await workspace.tools.get('feel_req').execute(
      { action: 'verify', id: target.id, result: 'pass', kind: 'test', by: 'feel-tester', note: 'vitest 全绿', evidence: 'npx vitest run' },
      tempExec,
    );
    const verifyData = ok(verifyResult, 'req verify');
    assert(verifyData.kind === 'test', `verify kind 应回显 test，实际 ${verifyData.kind}`);

    const shown = ok(await workspace.tools.get('feel_req').execute({ action: 'show', id: target.id }, tempExec), 'req show');
    assert(shown.requirement.review?.result === 'pass', 'review 未落库');
    assert(shown.requirement.review?.independent === true, 'independent 未落库');
    assert(shown.requirement.verification?.kind === 'test', 'verification.kind 未落库');
    assert(shown.requirement.verification?.evidence === 'npx vitest run', 'evidence 未落库');
  });

  await check('feel_req action=review 缺 result → FEEL_BAD_USAGE', async () => {
    if (!hasReq027) {
      process.stdout.write('    (skip: 目标 openfeel CLI 未包含 REQ-027 命令)\n');
      return;
    }
    const listed = ok(await workspace.tools.get('feel_req').execute({ action: 'list' }, tempExec), 'req list');
    const target = listed.requirements.find((/** @type {any} */ item) => item.title === '适配器验证需求');
    assert(target !== undefined, '未找到适配器验证需求');
    /** @type {any} */
    let error;
    try {
      await workspace.tools.get('feel_req').execute(
        { action: 'review', id: target.id, by: 'r', note: 'n' },
        tempExec,
      );
    } catch (caught) {
      error = caught;
    }
    assert(error !== undefined, '缺 result 应抛错');
    assert(error.code === 'FEEL_BAD_USAGE', `code 应为 FEEL_BAD_USAGE，实际 ${error.code}`);
  });

  await check('feel_stage action=verify：非 archiving 相位拒绝、archiving 相位写入（REQ-027，副本）', async () => {
    if (!hasReq027) {
      process.stdout.write('    (skip: 目标 openfeel CLI 未包含 REQ-027 命令)\n');
      return;
    }
    // 非 archiving → 拒绝（fixture 阶段当前相位不是 archiving）
    /** @type {any} */
    let rejected;
    try {
      await workspace.tools.get('feel_stage').execute(
        { action: 'verify', stage: fixtureStage, result: 'pass', kind: 'test', by: 't', note: 'n' },
        tempExec,
      );
    } catch (caught) {
      rejected = caught;
    }
    assert(rejected !== undefined, '非 archiving 相位应拒绝');
    assert(rejected.kind === 'refusal', `kind 应为 refusal，实际 ${rejected.kind}`);
    assert(rejected.message.includes('archiving'), `拒绝文案应提示 archiving：${rejected.message}`);

    // 副本内直接把该阶段置为 archiving，再验证成功路径（只写副本）
    const flowPath = join(tempProject, '.openfeel', 'flow.json');
    const flow = JSON.parse(readFileSync(flowPath, 'utf8'));
    assert(flow.stages[fixtureStage] !== undefined, `副本中缺少阶段键 ${fixtureStage}`);
    flow.stages[fixtureStage].phase = 'archiving';
    writeFileSync(flowPath, `${JSON.stringify(flow, null, 2)}\n`, 'utf8');

    const result = await workspace.tools.get('feel_stage').execute(
      { action: 'verify', stage: fixtureStage, result: 'pass', kind: 'test', by: 'feel-tester', note: 'vitest 全绿', evidence: 'npx vitest run' },
      tempExec,
    );
    ok(result, 'stage verify');
    const after = JSON.parse(readFileSync(flowPath, 'utf8'));
    assert(after.stages[fixtureStage].verification?.result === 'pass', '阶段 verification 未落库');
    assert(after.stages[fixtureStage].verification?.kind === 'test', '阶段 verification.kind 未落库');
    assert(
      (after.log ?? []).some((/** @type {any} */ entry) => entry.action === 'stage_verification'),
      '缺少 stage_verification 审计',
    );
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

  // ── 项目解析：与 CLI 对齐，**不向上回溯** ─────────────────────────
  // 依据：`openfeel flow status --json` 在深层子目录返回空态（祖先有 ~/.openfeel
  // 也不命中）⇒ CLI 只认 cwd。若适配器自行回溯，会把全局家目录误判成项目。

  await check('不回溯：深层子目录不被判定为 OpenFeel 项目', async () => {
    const { resolveWorkspace } = await import('../lib/adapters/workspace.js');
    const deep = join(tmpdir(), 'feel-verify-deep', 'a', 'b');
    // 该深路径的祖先含 ~/.openfeel（全局家），但不得因此被判为项目。
    const resolved = resolveWorkspace({ agent: { session: { header: { cwd: deep } } } });
    assert(resolved.initialized === false, `深层子目录不应被判为项目，实际 initialized=${resolved.initialized}`);
    assert(resolved.projectRoot === resolve(deep), `projectRoot 应等于会话 cwd，实际 ${resolved.projectRoot}`);
  });

  await check('全局家目录 ~/.openfeel 不被判定为项目', async () => {
    const { resolveWorkspace, isGlobalHomeLike } = await import('../lib/adapters/workspace.js');
    const home = process.env.USERPROFILE ?? process.env.HOME;
    assert(home !== undefined, '无法取得用户主目录');
    const resolved = resolveWorkspace({ agent: { session: { header: { cwd: home } } } });
    assert(resolved.initialized === false, `主目录不应被判为项目，实际 initialized=${resolved.initialized}`);
    // 主目录的 .openfeel 若存在，应被识别为「全局家目录形态」而非项目。
    if (isGlobalHomeLike(home)) {
      assert(resolved.initialized === false, '全局家目录形态必须判为非项目');
    }
  });

  await check('会话 cwd 恰为项目时判定为项目', async () => {
    const { resolveWorkspace, isProjectWorkspace } = await import('../lib/adapters/workspace.js');
    const resolved = resolveWorkspace({ agent: { session: { header: { cwd: SOURCE_PROJECT } } } });
    assert(resolved.initialized === true, 'OpenFeel 项目目录应判定为项目');
    assert(resolved.projectRoot === resolve(SOURCE_PROJECT), `projectRoot 应为项目根，实际 ${resolved.projectRoot}`);
    assert(isProjectWorkspace(SOURCE_PROJECT) === true, 'isProjectWorkspace 应返回 true');
  });

  await check('显式 project 指向全局家目录时给出专用诊断', async () => {
    const status = workspace.tools.get('feel_status');
    const home = process.env.USERPROFILE ?? process.env.HOME;
    let rejected;
    try {
      await status.execute({ action: 'status', project: home }, execFor(SOURCE_PROJECT));
    } catch (error) {
      rejected = error;
    }
    assert(rejected !== undefined, '指向全局家目录应被拒绝');
    assert(rejected.kind === 'usage', `应为 usage，实际 ${rejected.kind}`);
    assert(
      rejected.message.includes('全局配置目录') || rejected.message.includes('flow.json'),
      `诊断应说明全局目录/缺 flow.json：${rejected.message}`,
    );
  });

  // ── 提示段注入条件 ─────────────────────────────────────────────
  await check('提示段：项目内返回完整 Feel 纪律', () => {
    const text = workspace.sections[0].text();
    assert(typeof text === 'string' && text.includes('<feel_mode>'), '项目内应注入 feel_mode');
    assert(text.includes(SOURCE_PROJECT), `提示应包含项目根，实际未包含`);
  });

  await check('提示段：非项目目录注入 bootstrap（不注入完整 Feel 纪律）', async () => {
    const { apply: applyAdapter } = await import('../lib/index.js');
    const nonProject = mockContext(join(tmpdir(), 'feel-verify-deep', 'a', 'b'));
    applyAdapter(nonProject.ctx, {});
    const text = nonProject.sections[0].text();
    assert(text.includes('OpenFeel 未初始化'), `非项目目录应注入 bootstrap，实际: ${String(text).slice(0, 160)}`);
    assert(!text.includes('Feel 模式已启用'), `非项目目录不应注入完整 Feel 纪律，实际: ${String(text).slice(0, 160)}`);
  });

  await check('提示段：activation=off 不注入', async () => {
    const { apply: applyAdapter } = await import('../lib/index.js');
    const off = mockContext(join(tmpdir(), 'feel-verify-deep', 'a', 'b'));
    applyAdapter(off.ctx, { activation: 'off' });
    assert(off.sections.length === 0, `activation=off 不应注册提示段，实际 ${off.sections.length}`);
  });

  await check('提示段：activation=always + 非项目注入完整纪律（detected:false）', async () => {
    const { apply: applyAdapter } = await import('../lib/index.js');
    const always = mockContext(join(tmpdir(), 'feel-verify-always', 'a'));
    applyAdapter(always.ctx, { activation: 'always' });
    const text = always.sections[0].text();
    assert(text.includes('Feel 模式未初始化'), `应显示未初始化，实际: ${String(text).slice(0, 100)}`);
    assert(text.includes('尚未检测到'), '应说明未检测到 .openfeel');
    assert(!text.includes('Feel 模式已启用'), '未初始化不应误报已启用');
  });

  await check('提示段：autoPrompt=false 不注入但 guard 仍注册', async () => {
    const { apply: applyAdapter } = await import('../lib/index.js');
    const noPrompt = mockContext(join(tmpdir(), 'feel-verify-noprompt', 'a'));
    applyAdapter(noPrompt.ctx, { autoPrompt: false });
    assert(noPrompt.sections.length === 0, `autoPrompt=false 不应注册提示段，实际 ${noPrompt.sections.length}`);
    assert(noPrompt.guards.length === 1, `autoPrompt=false 仍应注册 guard，实际 ${noPrompt.guards.length}`);
  });

  await check('写入门禁：重复 apply 释放旧 guard 后不累积', async () => {
    const { apply: applyAdapter } = await import('../lib/index.js');
    const repeat = mockContext(SOURCE_PROJECT);
    repeat.ctx.tools.register = () => () => {};
    repeat.ctx.commands.register = () => () => {};
    repeat.ctx.systemPrompt.section = () => () => {};
    applyAdapter(repeat.ctx, { enforce: 'always' });
    assert(repeat.guards.length === 1, `首次 apply 应有 1 个 guard，实际 ${repeat.guards.length}`);
    // 未释放时再次 apply 会注册第二个（Cordis 的 HMR dispose 负责回收）。
    applyAdapter(repeat.ctx, { enforce: 'always' });
    assert(repeat.guards.length === 2, `未释放时两次 apply 应有 2 个 guard，实际 ${repeat.guards.length}`);
    while (repeat.effects.length > 0) repeat.effects.pop()();
    assert(repeat.guards.length === 0, `释放后应清空 guard，实际 ${repeat.guards.length}`);
    applyAdapter(repeat.ctx, { enforce: 'always' });
    assert(repeat.guards.length === 1, `释放后再次 apply 不应累积，实际 ${repeat.guards.length}`);
  });

  await check('写入门禁：无 ctx.effect 时走 ctx.on(dispose) 兜底', async () => {
    const { apply: applyAdapter } = await import('../lib/index.js');
    const noEffect = mockContext(SOURCE_PROJECT);
    delete noEffect.ctx.effect;
    /** @type {Array<() => void>} */
    const disposers = [];
    noEffect.ctx.on = (event, handler) => {
      if (event === 'dispose') disposers.push(handler);
      return () => {};
    };
    applyAdapter(noEffect.ctx, { enforce: 'always' });
    assert(noEffect.guards.length === 1, `应注册 1 个 guard，实际 ${noEffect.guards.length}`);
    assert(disposers.length === 1, `应注册 1 个 dispose 回调，实际 ${disposers.length}`);
    disposers[0]();
    assert(noEffect.guards.length === 0, `dispose 后应清空 guard，实际 ${noEffect.guards.length}`);
  });

  await check('写入门禁：ctx.tools.guard 缺失时降级不崩', async () => {
    const { apply: applyAdapter } = await import('../lib/index.js');
    const noGuard = mockContext(SOURCE_PROJECT);
    delete noGuard.ctx.tools.guard;
    applyAdapter(noGuard.ctx, { enforce: 'always' });
    assert(noGuard.logs.some((line) => line.includes('不支持 ctx.tools.guard')), '应记录降级警告');
  });

  await check('提示段：拿不到会话 Agent 时返回空串', async () => {
    const { apply: applyAdapter } = await import('../lib/index.js');
    const noAgent = mockContext(SOURCE_PROJECT);
    noAgent.services.delete('agents'); // 模拟 agents 服务未挂载
    applyAdapter(noAgent.ctx, {});
    const text = noAgent.sections[0].text();
    assert(text === '', `拿不到会话时不应注入，实际: ${String(text).slice(0, 120)}`);
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

  // ── v1.5.8 / REQ-030：发布门 / 顺延 / 需求随版本归档（副本） ──
  // 能力探测同 REQ-027：验证跑在已安装 CLI 上，旧版无新子命令时跳过并说明。
  let hasReq030 = false;
  try {
    const probe = await tempCli.run(['req', '--help'], { cwd: tempProject });
    hasReq030 = probe.code === 0
      && probe.stdout.includes('release-check')
      && probe.stdout.includes('rollover');
  } catch {
    hasReq030 = false;
  }

  await check('feel_req action=release-check 只读返回 done/unfinished（REQ-030，副本）', async () => {
    if (!hasReq030) {
      process.stdout.write('    (skip: 目标 openfeel CLI 未包含 REQ-030 命令，重装新版后覆盖)\n');
      return;
    }
    const before = readFileSync(join(tempProject, '.openfeel', 'flow.json'), 'utf8');
    const result = await workspace.tools.get('feel_req').execute(
      { action: 'release-check', version: 'v9.9.9' },
      tempExec,
    );
    const data = ok(result, 'req release-check');
    assert(data.version === 'v9.9.9', `version 应回显 v9.9.9，实际 ${data.version}`);
    assert(Array.isArray(data.done), 'done 应为数组');
    assert(Array.isArray(data.unfinished), 'unfinished 应为数组');
    assert(data.unfinished.length >= 1, `未完成需求应 >=1，实际 ${JSON.stringify(data.unfinished)}`);
    assert(typeof data.counts?.unfinished === 'number', 'counts.unfinished 应为 number');
    assert(result.summary.includes('未完成'), `summary 应提示未完成需求：${result.summary}`);
    // 只读：flow.json 逐字节不变
    assert(readFileSync(join(tempProject, '.openfeel', 'flow.json'), 'utf8') === before, 'release-check 不应写盘');
  });

  await check('feel_req action=rollover --all 改 target_version + carried_from（REQ-030，副本）', async () => {
    if (!hasReq030) {
      process.stdout.write('    (skip: 目标 openfeel CLI 未包含 REQ-030 命令)\n');
      return;
    }
    const listed = ok(await workspace.tools.get('feel_req').execute({ action: 'list' }, tempExec), 'req list');
    const target = listed.requirements.find((/** @type {any} */ item) => item.title === '适配器验证需求');
    assert(target !== undefined, '未找到适配器验证需求');
    ok(await workspace.tools.get('feel_req').execute(
      { action: 'rollover', from: 'v9.9.9', to: 'v9.9.10', all: true },
      tempExec,
    ), 'req rollover');
    const shown = ok(await workspace.tools.get('feel_req').execute({ action: 'show', id: target.id }, tempExec), 'req show');
    assert(shown.requirement.target_version === 'v9.9.10', `target_version 应为 v9.9.10，实际 ${shown.requirement.target_version}`);
    assert(
      Array.isArray(shown.requirement.carried_from) && shown.requirement.carried_from.includes('v9.9.9'),
      `carried_from 应记录 v9.9.9：${JSON.stringify(shown.requirement.carried_from)}`,
    );
  });

  await check('feel_req action=rollover --id 与 --all 互斥 → FEEL_BAD_USAGE（REQ-030）', async () => {
    if (!hasReq030) {
      process.stdout.write('    (skip: 目标 openfeel CLI 未包含 REQ-030 命令)\n');
      return;
    }
    /** @type {any} */
    let error;
    try {
      await workspace.tools.get('feel_req').execute(
        { action: 'rollover', from: 'v9.9.10', to: 'v9.9.11', id: 'REQ-001', all: true },
        tempExec,
      );
    } catch (caught) {
      error = caught;
    }
    assert(error !== undefined, '--id 与 --all 同用应抛错');
    assert(error.code === 'FEEL_BAD_USAGE', `code 应为 FEEL_BAD_USAGE，实际 ${error.code}`);
  });

  await check('feel_req action=list include_archived / show 已归档回退（REQ-030，副本）', async () => {
    if (!hasReq030) {
      process.stdout.write('    (skip: 目标 openfeel CLI 未包含 REQ-030 命令)\n');
      return;
    }
    // 直接写一份归档文件（副本）：含一条终态需求 REQ-900
    const archiveDir = join(tempProject, '.openfeel', 'flow-archive');
    mkdirSync(archiveDir, { recursive: true });
    const archivedReq = {
      id: 'REQ-900',
      title: '已归档需求',
      status: 'done',
      target_version: 'v9.9.8',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-02T00:00:00.000Z',
    };
    writeFileSync(join(archiveDir, 'v9.9.8.json'), `${JSON.stringify({
      schemaVersion: 1,
      version: 'v9.9.8',
      archived_at: '2026-01-02T00:00:00.000Z',
      stages: {},
      reviews: [],
      log: [],
      requirements: [archivedReq],
      counts: { stages: 0, reviews: 0, log: 0, requirements: 1 },
    }, null, 2)}\n`, 'utf8');

    const listed = ok(await workspace.tools.get('feel_req').execute(
      { action: 'list', include_archived: true },
      tempExec,
    ), 'req list --include-archived');
    const found = listed.requirements.find((/** @type {any} */ item) => item.id === 'REQ-900');
    assert(found !== undefined, 'list include_archived 应包含 REQ-900');
    assert(found.archived === true, '归档需求应标记 archived:true');

    const shown = ok(await workspace.tools.get('feel_req').execute({ action: 'show', id: 'REQ-900' }, tempExec), 'req show 已归档');
    assert(shown.archived === true, 'show 已归档需求应标记 archived:true');
    assert(shown.requirement.id === 'REQ-900', 'show 应回退读取归档文件');
  });

  await check('feel_archive create 发布软门：未完成需求缺省拒绝 / allow_unfinished 放行（REQ-030，副本）', async () => {
    if (!hasReq030) {
      process.stdout.write('    (skip: 目标 openfeel CLI 未包含 REQ-030 命令)\n');
      return;
    }
    // 副本内造一个「阶段全 done + 一条未完成需求」的版本 v9.9.7
    const flowPath = join(tempProject, '.openfeel', 'flow.json');
    const flow = JSON.parse(readFileSync(flowPath, 'utf8'));
    flow.stages['v9.9.7-stage-01'] = {
      name: 's', phase: 'done', status: 'done', deps: [], ops: {},
    };
    flow.requirements = Array.isArray(flow.requirements) ? flow.requirements : [];
    flow.requirements.push({
      id: 'REQ-901', title: '未完成需求', status: 'in_progress', target_version: 'v9.9.7',
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    });
    writeFileSync(flowPath, `${JSON.stringify(flow, null, 2)}\n`, 'utf8');

    // 缺省：拒绝（零写盘）
    const before = readFileSync(flowPath, 'utf8');
    /** @type {any} */
    let rejected;
    try {
      await workspace.tools.get('feel_archive').execute({ action: 'create', version: 'v9.9.7', dry_run: true }, tempExec);
    } catch (caught) {
      rejected = caught;
    }
    assert(rejected !== undefined, '存在未完成需求应拒绝');
    assert(rejected.kind === 'refusal', `kind 应为 refusal，实际 ${rejected.kind}`);
    assert(readFileSync(flowPath, 'utf8') === before, '拒绝应零写盘');
    assert(!existsSync(join(tempProject, '.openfeel', 'flow-archive', 'v9.9.7.json')), '拒绝不应写归档文件');

    // allow_unfinished=true：dry-run 放行（零写盘）
    const allowed = ok(await workspace.tools.get('feel_archive').execute(
      { action: 'create', version: 'v9.9.7', dry_run: true, allow_unfinished: true },
      tempExec,
    ), 'feel_archive create --allow-unfinished');
    assert(allowed.dryRun === true, 'dryRun 应为 true');
    assert(allowed.requirements === 0, `未完成需求不应随版本归档，requirements 应为 0，实际 ${allowed.requirements}`);
  });

  // v1.5.12 / stage-127 §3-B（V4）：真实 guard 状态未被本测试改写。
  await check('guard 测试隔离：真实 marker 与全局目录未被改写（V4）', () => {
    const verdict = assertRealGuardUntouched(realGuardBefore, iso);
    assert(verdict === 'PASS' || verdict === 'skip: host-active', `未知判定：${verdict}`);
    if (verdict !== 'PASS') process.stdout.write(`    (${verdict})\n`);
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
