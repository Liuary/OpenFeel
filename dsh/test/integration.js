/**
 * OpenFeel × DSH 适配器 — 真实注册表集成验证
 *
 * 本测试**不模拟** DSH：它用宿主 asar 里提取出的**真实** `cordis` 与
 * `@deepseek-ai/dsh-tools` 构造一个真实注册表，然后把适配器的 `apply()`
 * 挂上去，断言 13 个工具真的注册成功、并且能被 `schemas()` 投影出来。
 *
 * 为什么必须有这一层：适配器直接调用 `ctx.tools.register()`，而该调用的
 * 校验逻辑（`assertSupportedJsonSchema`）与模型侧投影都发生在真实实现里。
 * 只有跑真实实现，才能证明「插件能加载」而不是「我以为能加载」。
 *
 * 依赖：宿主 asar 提取出的 DSH 运行时包。
 * 用法：node test/integration.js [<@deepseek-ai 目录>]
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** 默认的 DSH 包目录（宿主 asar 提取位置）。 */
const DEFAULT_DSH_MODULES = join(process.env.TEMP ?? '/tmp', 'dsh-asar', 'dsh', 'node_modules', '@deepseek-ai');

const EXPECTED_TOOLS = [
  'feel_status',
  'feel_next',
  'feel_flow',
  'feel_stage',
  'feel_op',
  'feel_req',
  'feel_checkpoint',
  'feel_archive',
  'feel_kb',
  'feel_verify',
  'feel_review',
  'feel_plan',
  'feel_model',
];

/**
 * @param {unknown} condition
 * @param {string} message
 */
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/**
 * 从模块命名空间里找 cordis 的 Context 构造器。
 * @param {any} cordis
 * @returns {any}
 */
function pickContext(cordis) {
  const candidates = [cordis.Context, cordis.default?.Context, cordis.default];
  for (const candidate of candidates) {
    if (typeof candidate === 'function') return candidate;
  }
  throw new Error(`未能从 cordis 模块找到 Context（导出: ${Object.keys(cordis).join(', ')}）`);
}

async function main() {
  const dshModules = process.argv[2] ?? DEFAULT_DSH_MODULES;
  const cordisEntry = join(dshModules, 'cordis', 'lib', 'index.js');
  const toolsEntry = join(dshModules, 'dsh-tools', 'lib', 'index.js');

  process.stdout.write('\nOpenFeel × DSH — 真实注册表集成验证\n');
  process.stdout.write('='.repeat(60) + '\n\n');

  if (!existsSync(cordisEntry) || !existsSync(toolsEntry)) {
    process.stdout.write(`跳过：未找到 DSH 运行时包。\n  需要 ${cordisEntry}\n  需要 ${toolsEntry}\n`);
    return;
  }

  const cordis = await import(pathToFileURL(cordisEntry).href);
  const dshTools = await import(pathToFileURL(toolsEntry).href);
  const Context = pickContext(cordis);
  const { ToolRuntime } = dshTools;

  process.stdout.write(`cordis: ${cordisEntry}\ndsh-tools: ${toolsEntry}\n\n`);

  // ── 1. 构造真实上下文与真实工具注册表 ──────────────────────────
  /** @type {any} */
  let ctx;
  await (async () => {
    ctx = new Context();

    // ToolRuntime 声明 inject: ['systemPrompt']；缺少该服务时注册表会一直挂起。
    // 这里提供一个**最小可用的 systemPrompt 服务**（只满足服务契约，不参与被测逻辑）。
    const systemPromptService = {
      section: () => () => {},
      getSectionOrder: () => 40,
      getContextOrder: () => 40,
      context: () => () => {},
      tools: () => () => {},
      variable: () => () => {},
      suppressRuntimeContext: () => () => {},
      assemble: async () => ({ sections: [], contexts: [], tools: [], variables: {} }),
    };
    ctx.plugin({
      name: 'system-prompt-stub',
      apply(c) {
        c.provide('systemPrompt');
        c.systemPrompt = systemPromptService;
      },
    });

    // dsh-tools 的默认导出即插件行；以插件方式挂载，服务名 = tools。
    const plugin = dshTools.default ?? ToolRuntime;
    assert(plugin !== undefined, 'dsh-tools 既无默认导出可作插件');
    // Cordis 的 plugin() 返回 Fiber（thenable）：等待其就绪，服务才会发布。
    await ctx.plugin(plugin, { mode: 'native' });
  })();

  // 服务发布是异步的；有界轮询，避免依赖具体时序。
  /** @returns {any} */
  const findTools = () => {
    for (const key of ['tools']) {
      const fromProp = /** @type {any} */ (ctx)[key];
      if (fromProp !== undefined) return fromProp;
      const fromGet = typeof ctx.get === 'function' ? ctx.get(key) : undefined;
      if (fromGet !== undefined) return fromGet;
    }
    const registry = /** @type {any} */ (ctx).reflect?.get?.('tools');
    return registry;
  };

  let toolsService;
  for (let attempt = 0; attempt < 40; attempt++) {
    toolsService = findTools();
    if (toolsService !== undefined) break;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }

  if (toolsService === undefined) {
    process.stdout.write('跳过：真实上下文中未能取得 tools 服务（插件未激活）。\n');
    process.stdout.write(`上下文中可用键（前 20）：${Object.keys(ctx).slice(0, 20).join(', ')}\n`);
    return;
  }
  process.stdout.write(`✓ 真实 tools 注册表就绪（${typeof toolsService.register} 可注册）\n\n`);

  // ── 2. 捕获 commands / systemPrompt 落点（用轻量替身，逻辑无关） ──
  /** @type {any[]} */
  const commands = [];
  /** @type {any[]} */
  const sections = [];
  const serviceStub = {
    commands: {
      register: (definition) => {
        commands.push(definition);
        return () => {};
      },
    },
    systemPrompt: {
      section: (section) => {
        sections.push(section);
        return () => {};
      },
      getSectionOrder: () => 40,
    },
  };

  // ── 3. 挂载适配器 ───────────────────────────────────────────────
  const { apply } = await import('../lib/index.js');
  /** @type {any[]} */
  const logs = [];

  // 提示段在装配期经 `agents.currentInitiator()` 反查会话 cwd（AssembleContext 不含 cwd）。
  // 这里提供替身，模拟「当前会话工作区 = OpenFeel 项目」。
  const sessionAgent = {
    session: { header: { cwd: process.env.FEEL_TEST_PROJECT ?? 'C:\\Users\\Liuary\\Dev\\Mine\\AI\\OpenFeel' } },
  };
  const services = new Map([['agents', { currentInitiator: () => sessionAgent }]]);

  const mountCtx = {
    /** @param {string} name */
    get: (name) => services.get(name),
    tools: toolsService,
    commands: serviceStub.commands,
    systemPrompt: serviceStub.systemPrompt,
    logger: () => ({
      info: (/** @type {string} */ message) => logs.push(`INFO ${message}`),
      warn: (/** @type {string} */ message) => logs.push(`WARN ${message}`),
      error: (/** @type {string} */ message) => logs.push(`ERROR ${message}`),
      debug: () => {},
    }),
  };

  let applied = false;
  let applyError;
  try {
    apply(mountCtx, { command: 'openfeel', autoPrompt: true, log: false });
    applied = true;
  } catch (error) {
    applyError = error;
  }

  process.stdout.write('[1] apply() 挂载\n');
  if (!applied) {
    process.stdout.write(`  ✗ apply() 抛出：${applyError instanceof Error ? applyError.stack : applyError}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write('  ✓ apply() 未抛错\n');

  // ── 4. 断言真实注册表里的工具 ───────────────────────────────────
  process.stdout.write('\n[2] 真实注册表投影\n');
  let schemas;
  try {
    schemas = toolsService.schemas();
  } catch (error) {
    process.stdout.write(`  ✗ schemas() 抛出：${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
    return;
  }

  const feelSchemas = schemas.filter((/** @type {any} */ schema) => String(schema.name).startsWith('feel_'));
  process.stdout.write(`  已注册 feel_* 工具：${feelSchemas.length} 个\n`);

  let failed = 0;
  const missing = EXPECTED_TOOLS.filter((name) => !feelSchemas.some((s) => s.name === name));
  if (missing.length > 0) {
    process.stdout.write(`  ✗ 缺少工具：${missing.join(', ')}\n`);
    failed += 1;
  } else {
    process.stdout.write('  ✓ 13 个工具全部注册\n');
  }

  // 每个投影出来的 schema 必须可被 provider 安全序列化：无 type:null
  /** @param {any} node @param {string} path @returns {string[]} */
  const typeless = (node, path) => {
    /** @type {string[]} */
    const out = [];
    if (typeof node !== 'object' || node === null) return out;
    if (!Object.hasOwn(node, 'type') && !Object.hasOwn(node, 'oneOf')) out.push(path);
    if (node.properties && typeof node.properties === 'object') {
      for (const [key, child] of Object.entries(node.properties)) out.push(...typeless(child, `${path}.${key}`));
    }
    if (node.items) out.push(...typeless(node.items, `${path}[]`));
    return out;
  };

  /** @type {string[]} */
  const offenders = [];
  for (const schema of feelSchemas) {
    offenders.push(...typeless(schema.parameters, `${schema.name}.parameters`));
  }
  if (offenders.length > 0) {
    process.stdout.write(`  ✗ 存在无 type 节点（会变 type:null）：${offenders.slice(0, 5).join(', ')}\n`);
    failed += 1;
  } else {
    process.stdout.write('  ✓ 投影的 parameters 全部含具体 type\n');
  }

  // ── 5. 描述与必填 ──────────────────────────────────────────────
  process.stdout.write('\n[3] 模型可见性\n');
  const noRequired = feelSchemas.filter((/** @type {any} */ s) => !Array.isArray(s.parameters?.required) || s.parameters.required.length === 0);
  if (noRequired.length > 0) {
    process.stdout.write(`  ✗ 缺少必填参数：${noRequired.map((s) => s.name).join(', ')}\n`);
    failed += 1;
  } else {
    process.stdout.write('  ✓ 每个工具都有必填参数\n');
  }
  const noDesc = feelSchemas.filter((/** @type {any} */ s) => typeof s.description !== 'string' || s.description.trim() === '');
  if (noDesc.length > 0) {
    process.stdout.write(`  ✗ 缺少描述：${noDesc.map((s) => s.name).join(', ')}\n`);
    failed += 1;
  } else {
    process.stdout.write('  ✓ 每个工具都有描述\n');
  }

  // ── 6. 命令与提示段落 ─────────────────────────────────────────
  process.stdout.write('\n[4] 命令与提示落点\n');
  if (commands.length === 1 && commands[0].name === 'feel') {
    process.stdout.write('  ✓ /feel 命令已注册\n');
  } else {
    process.stdout.write(`  ✗ /feel 命令异常（${commands.length} 个）\n`);
    failed += 1;
  }
  if (sections.length === 1 && sections[0].name === 'feel-mode') {
    const text = sections[0].text();
    if (typeof text === 'string' && text.includes('<feel_mode>')) {
      process.stdout.write('  ✓ feel-mode 提示段落已注册且可渲染\n');
    } else {
      process.stdout.write('  ✗ 提示段落正文异常\n');
      failed += 1;
    }
  } else {
    process.stdout.write(`  ✗ 提示段落异常（${sections.length} 个）\n`);
    failed += 1;
  }

  // ── 7. 一次真实的参数校验（走真实校验器） ─────────────────────
  process.stdout.write('\n[5] 真实参数校验\n');
  const { validateJsonSchemaValue } = dshTools;
  const statusSchema = feelSchemas.find((/** @type {any} */ s) => s.name === 'feel_status');
  const violations = validateJsonSchemaValue(statusSchema.parameters, { action: 'status' }, '');
  if (violations.length === 0) {
    process.stdout.write('  ✓ feel_status({action:"status"}) 通过真实校验\n');
  } else {
    process.stdout.write(`  ✗ 合法参数被拒：${violations.join('; ')}\n`);
    failed += 1;
  }
  const badViolations = validateJsonSchemaValue(statusSchema.parameters, {}, '');
  if (badViolations.length > 0) {
    process.stdout.write('  ✓ 空参数被真实校验拒绝\n');
  } else {
    process.stdout.write('  ✗ 空参数未被拒绝\n');
    failed += 1;
  }

  process.stdout.write('\n' + '='.repeat(60) + '\n');
  if (failed > 0) {
    process.stdout.write(`失败 ${failed} 项\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write('全部通过：适配器在真实 DSH 注册表上成功挂载。\n');
  }
}

main().catch((error) => {
  console.error('\n集成验证崩溃：', error);
  process.exitCode = 1;
});
