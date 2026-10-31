/**
 * OpenFeel × DSH 适配器 — DSH 契约一致性验证
 *
 * 用 **DSH 真实的** `assertSupportedJsonSchema` 校验适配器产出的工具定义。
 *
 * 为什么必须单独测：本插件直接调用 `ctx.tools.register()`（不经 `defineTool`），
 * 注册表既不编译也不校验 `parameters`，而 `output.schema` 只按**裸 JSON Schema**
 * 校验。因此两道约束都必须在交给注册表前满足，否则插件**加载即失败**：
 *
 * 1. `parameters` 与 `output.schema` 都必须落在 `assertSupportedJsonSchema`
 *    接受的子集内（无属性级 `required`、`type` 只能是具体类型）。
 * 2. 任何节点都必须有具体 `type`（或 `oneOf`）——无类型节点会被 provider
 *    桥接层转成 `type: null`，API 随后拒绝整个工具。
 *
 * 依赖：DSH 运行时包（从宿主 asar 提取）。缺失时跳过并说明。
 *
 * 用法：node test/contract.js [<@deepseek-ai 目录>]
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { FeelCli } from '../lib/adapters/cli.js';
import { compactStatusSnapshot, createTools } from '../lib/tools/index.js';

/** 默认的 DSH 包目录（宿主 asar 提取位置）。 */
const DEFAULT_DSH_MODULES = join(process.env.TEMP ?? '/tmp', 'dsh-asar', 'dsh', 'node_modules', '@deepseek-ai');

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
 * 递归收集「既无 type 也无 oneOf」的 schema 节点。
 *
 * 这类节点正是线上报错 `got 'type: null'` 的来源。
 *
 * @param {any} node
 * @param {string} path
 * @returns {string[]}
 */
function collectTypeless(node, path) {
  /** @type {string[]} */
  const out = [];
  if (typeof node !== 'object' || node === null) return out;
  if (!Object.hasOwn(node, 'type') && !Object.hasOwn(node, 'oneOf')) out.push(path);
  if (Object.hasOwn(node, 'properties') && typeof node.properties === 'object' && node.properties !== null) {
    for (const [key, child] of Object.entries(node.properties)) {
      out.push(...collectTypeless(child, `${path}.properties.${key}`));
    }
  }
  if (Object.hasOwn(node, 'items')) out.push(...collectTypeless(node.items, `${path}.items`));
  if (Array.isArray(node.oneOf)) {
    node.oneOf.forEach((child, index) => out.push(...collectTypeless(child, `${path}.oneOf[${index}]`)));
  }
  return out;
}

async function main() {
  const dshModules = process.argv[2] ?? DEFAULT_DSH_MODULES;
  const toolsEntry = join(dshModules, 'dsh-tools', 'lib', 'index.js');

  process.stdout.write('\nOpenFeel × DSH — 契约一致性验证\n');
  process.stdout.write('='.repeat(60) + '\n\n');

  if (!existsSync(toolsEntry)) {
    process.stdout.write(`跳过：未找到 DSH 运行时包（${toolsEntry}）。\n`);
    process.stdout.write('先提取宿主 asar，或把 @deepseek-ai 目录作为第一个参数传入。\n');
    return;
  }

  process.stdout.write(`DSH 运行时：${dshModules}\n\n`);

  const { assertSupportedJsonSchema, validateJsonSchemaValue } = await import(pathToFileURL(toolsEntry).href);
  assert(typeof assertSupportedJsonSchema === 'function', '未能从 dsh-tools 载入 assertSupportedJsonSchema');

  const cli = new FeelCli({});
  const tools = createTools({ cli });
  assert(tools.length > 0, '工具集为空');

  process.stdout.write('[1] 工具名与唯一性\n');
  await check('工具名唯一', () => {
    const names = new Set();
    for (const tool of tools) {
      assert(!names.has(tool.name), `重复工具名 ${tool.name}`);
      names.add(tool.name);
    }
  });
  await check('不占用 DSH 保留名 run_code', () => {
    for (const tool of tools) assert(tool.name !== 'run_code', '工具名不得为 run_code');
  });
  await check('工具名合法（小写 + 数字 + 下划线）', () => {
    for (const tool of tools) assert(/^[a-z][a-z0-9_]*$/.test(tool.name), `非法工具名 ${tool.name}`);
  });
  await check('工具数量符合设计（13）', () => {
    assert(tools.length === 13, `期望 13 个工具，实际 ${tools.length}`);
  });

  process.stdout.write('\n[2] parameters 落在 DSH 强制 schema 子集内\n');
  for (const tool of tools) {
    await check(`${tool.name} parameters 合法`, () => {
      assertSupportedJsonSchema(tool.parameters);
      assert(tool.parameters.type === 'object', `parameters 根类型应为 object，实际 ${tool.parameters.type}`);
    });
  }
  await check('parameters 不含无类型节点', () => {
    for (const tool of tools) {
      const offenders = collectTypeless(tool.parameters, 'parameters');
      assert(offenders.length === 0, `${tool.name} 存在无 type 的参数节点: ${offenders.join(', ')}`);
    }
  });
  await check('参数不带属性级 required（子集不允许）', () => {
    for (const tool of tools) {
      for (const [key, spec] of Object.entries(tool.parameters.properties ?? {})) {
        assert(!Object.hasOwn(spec, 'required'), `${tool.name}.${key} 仍带属性级 required`);
      }
    }
  });

  process.stdout.write('\n[3] output.schema 落在 DSH 强制 schema 子集内\n');
  for (const tool of tools) {
    await check(`${tool.name} output.schema 合法`, () => {
      assert(tool.output !== undefined, '缺少 output');
      assert(typeof tool.output.render === 'function', '缺少 output.render');
      assertSupportedJsonSchema(tool.output.schema);
    });
  }
  await check('output.schema 不含无类型节点（防 provider 转 type:null）', () => {
    for (const tool of tools) {
      const offenders = collectTypeless(tool.output.schema, 'schema');
      assert(
        offenders.length === 0,
        `${tool.name} 存在无 type 的节点（会被 provider 桥接为 type:null）: ${offenders.join(', ')}`,
      );
    }
  });

  process.stdout.write('\n[4] 参数契约自洽\n');
  await check('每个工具都有必填参数', () => {
    for (const tool of tools) {
      const required = tool.parameters.required ?? [];
      assert(required.length > 0, `${tool.name} 没有任何必填参数（模型无法判断调用契约）`);
    }
  });
  await check('required 只引用已声明属性', () => {
    for (const tool of tools) {
      const props = new Set(Object.keys(tool.parameters.properties ?? {}));
      for (const key of tool.parameters.required ?? []) {
        assert(props.has(key), `${tool.name}.required 指向未声明属性 ${key}`);
      }
    }
  });
  await check('枚举参数 enum 非空且去重', () => {
    for (const tool of tools) {
      for (const [key, spec] of Object.entries(tool.parameters.properties ?? {})) {
        if (spec.enum === undefined) continue;
        assert(Array.isArray(spec.enum), `${tool.name}.${key} enum 非数组`);
        assert(spec.enum.length > 0, `${tool.name}.${key} enum 为空`);
        assert(new Set(spec.enum).size === spec.enum.length, `${tool.name}.${key} enum 有重复值`);
      }
    }
  });
  await check('描述非空且不含占位', () => {
    for (const tool of tools) {
      assert(typeof tool.description === 'string' && tool.description.trim() !== '', `${tool.name} 缺少描述`);
      assert(!tool.description.includes('TODO'), `${tool.name} 描述含 TODO`);
      for (const [key, spec] of Object.entries(tool.parameters.properties ?? {})) {
        assert(typeof spec.description === 'string' && spec.description.trim() !== '', `${tool.name}.${key} 缺少描述`);
      }
    }
  });

  process.stdout.write('\n[5] 渲染函数可执行\n');
  await check('renderEnvelope 输出文本块（wire 形态）', () => {
    for (const tool of tools) {
      const blocks = tool.output.render({}, {
        ok: true,
        action: 'test',
        summary: '摘要',
        details: JSON.stringify({ a: 1 }),
        next: { tool: 'feel_status', arguments: '{}', why: '因为' },
      });
      assert(Array.isArray(blocks) && blocks.length === 1, `${tool.name} render 应返回单文本块`);
      assert(blocks[0].type === 'text', `${tool.name} render 块类型应为 text`);
      assert(blocks[0].text.includes('摘要'), `${tool.name} render 应含 summary`);
      assert(blocks[0].text.includes('下一步建议'), `${tool.name} render 应含下一步`);
      assert(blocks[0].text.includes('{"a":1}'), `${tool.name} render 应含 details 内容`);
    }
  });
  await check('renderEnvelope 处理失败与空 details', () => {
    for (const tool of tools) {
      const blocks = tool.output.render({}, { ok: false, action: 'x', summary: '失败' });
      assert(blocks[0].text.includes('FAIL'), `${tool.name} 应标记 FAIL`);
      assert(!blocks[0].text.includes('undefined'), `${tool.name} 不应打印 undefined`);
    }
  });

  process.stdout.write('\n[6] 参数校验器按契约接受/拒绝\n');
  await check('缺少必填参数被拒绝', () => {
    for (const tool of tools) {
      const required = tool.parameters.required ?? [];
      assert(required.length > 0, `${tool.name} 无必填参数`);
      const violations = validateJsonSchemaValue(tool.parameters, {}, '');
      assert(violations.length > 0, `${tool.name} 空参数应被拒绝（缺少 ${required.join('/')}）`);
    }
  });
  await check('提供必填参数后通过校验', () => {
    for (const tool of tools) {
      /** @type {Record<string, unknown>} */
      const valid = {};
      for (const key of tool.parameters.required ?? []) {
        const spec = tool.parameters.properties[key];
        if (spec.const !== undefined) valid[key] = spec.const;
        else if (Array.isArray(spec.enum)) valid[key] = spec.enum[0];
        else if (spec.type === 'string') valid[key] = 'x';
        else if (spec.type === 'boolean') valid[key] = true;
        else if (spec.type === 'integer') valid[key] = 1;
        else if (spec.type === 'array') valid[key] = ['x'];
        else valid[key] = 'x';
      }
      const violations = validateJsonSchemaValue(tool.parameters, valid, '');
      assert(violations.length === 0, `${tool.name} 合法参数被误拒：${violations.join('; ')}（输入 ${JSON.stringify(valid)}）`);
    }
  });
  await check('未知属性被拒绝（additionalProperties 行为正常）', () => {
    for (const tool of tools) {
      /** @type {Record<string, unknown>} */
      const valid = {};
      for (const key of tool.parameters.required ?? []) {
        const spec = tool.parameters.properties[key];
        if (spec.const !== undefined) valid[key] = spec.const;
        else if (Array.isArray(spec.enum)) valid[key] = spec.enum[0];
        else if (spec.type === 'string') valid[key] = 'x';
        else if (spec.type === 'boolean') valid[key] = true;
        else if (spec.type === 'integer') valid[key] = 1;
        else if (spec.type === 'array') valid[key] = ['x'];
        else valid[key] = 'x';
      }
      valid.__unknown__ = 1;
      const violations = validateJsonSchemaValue(tool.parameters, valid, '');
      // 不强制工具关闭 additionalProperties，但若关闭则必须真的拒绝。
      if (tool.parameters.additionalProperties === false) {
        assert(violations.length > 0, `${tool.name} 关闭了 additionalProperties 却接受未知属性`);
      }
    }
  });

  await check('feel_status 默认 compact：去转移表 / 交接全文 / 观测副本', () => {
    /** 代表真实快照形态的最小样本（含会被 compact 丢弃的三块冗余）。 */
    const sample = {
      schemaVersion: 1,
      project: { root: '/tmp/p', initialized: true },
      pipeline: { phase: 'active', currentStage: 'v1.0.0-stage-01', activeStageCount: 1, doneStageCount: 0, totalStages: 1 },
      focus: {
        stage: 'v1.0.0-stage-01', phase: 'exec_running', phaseLabel: '执行中', status: 'planned', deps: [],
        workflowMode: 'fast', reviewTier: 'lean', effectiveReviewTier: 'full',
        legalNextPhases: ['review_pending'], suggestedCommand: 'openfeel flow advance --stage v1.0.0-stage-01 --to review_pending',
        responsibleAgent: 'openfeel-executor', guards: [], blockingReviews: [],
      },
      mode: {
        current: 'fast', source: 'status.md', skippedPhases: ['scheme_pending'],
        transitionsByMode: { full: { plan_pending: ['plan_review'] }, fast: {}, general: {} },
      },
      stages: [],
      statusSync: { due: false, lastSync: 'x', intervalMinutes: 30 },
      workflowGate: { required: false },
      preflight: { ok: true, at: 'x', ageMs: 5, mode: 'warn' },
      recovery: {
        stage: null, phase: null, requirement: null, lastTransition: null, lastError: null,
        handoff: '## 公共交接区（大段全文）', hasDevLast: true, nextAction: null,
      },
      observability: { schemaVersion: 1, summary: 'x' },
      revision: 3,
      snapshotAt: 'x',
      stale: false,
    };
    const compact = compactStatusSnapshot(sample);
    assert(compact.mode.transitionsByMode === undefined, 'compact 不应含 mode.transitionsByMode');
    assert(compact.recovery.handoff === undefined, 'compact 不应含 recovery.handoff 全文');
    assert(compact.observability === undefined, 'compact 不应含 observability 副本');
    assert(compact.focus.legalNextPhases[0] === 'review_pending', 'compact 必须保留 legalNextPhases');
    assert(compact.mode.current === 'fast' && compact.mode.source === 'status.md', 'compact 必须保留 mode.current/source');
    assert(compact.recovery.hasDevLast === true, 'compact 必须保留 hasDevLast');
    assert(compact.preflight.ok === true, 'compact 必须保留 preflight');
    assert(compact.revision === 3 && compact.stale === false, 'compact 必须保留 revision/stale');
    assert(compact.requirements === undefined, 'compact 未请求需求时不应含 requirements');
  });

  await check('feel_status 暴露 detail=compact|full 开关', () => {
    const status = tools.find((tool) => tool.name === 'feel_status');
    assert(status, '缺少 feel_status 工具');
    const detail = status.parameters.properties.detail;
    assert(detail && detail.type === 'string' && Array.isArray(detail.enum), 'detail 参数 schema 缺失');
    assert(detail.enum.includes('compact') && detail.enum.includes('full'), 'detail 枚举应为 compact|full');
  });

  process.stdout.write('\n' + '='.repeat(60) + '\n');
  process.stdout.write(`通过 ${passed} / ${passed + failed}\n`);
  if (failed > 0) {
    process.stdout.write(`\n失败项：\n${failures.map((item) => `  - ${item}`).join('\n')}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write('全部通过：工具定义与 DSH 契约一致。\n');
  }
}

main().catch((error) => {
  console.error('\n契约验证崩溃：', error);
  process.exitCode = 1;
});
