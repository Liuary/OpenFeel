/**
 * instruction-loader 单元测试
 * 验证 XML 格式输出、JSON 格式输出、依赖状态标注、XML 转义等功能
 */
import { describe, it, expect } from 'vitest';
import {
  generateInstructions,
  generateInstructionsJson,
} from '../../../src/core/artifact-graph/instruction-loader.js';
import type { Schema } from '../../../src/core/schema.js';

/** 构造标准测试 Schema（模拟 spec-driven） */
function makeTestSchema(): Schema {
  return {
    name: 'spec-driven',
    version: '1.0',
    artifacts: [
      {
        id: 'proposal',
        description: '项目提案文档',
        generates: 'docs/proposal.md',
        template: 'proposal.md',
        dependsOn: [],
        instruction: '创建项目提案文档，描述项目目标、范围和初步技术方案',
      },
      {
        id: 'specs',
        description: '功能规范文档',
        generates: 'docs/specs/**/*.md',
        template: 'plan.md',
        dependsOn: ['proposal'],
        instruction: '根据提案撰写详细功能规范',
      },
      {
        id: 'design',
        description: '技术设计文档',
        generates: 'docs/design.md',
        template: 'design.md',
        dependsOn: ['specs'],
        instruction: '根据规范制定技术设计方案',
      },
      {
        id: 'tasks',
        description: '任务分解',
        generates: 'docs/tasks.md',
        template: 'tasks.md',
        dependsOn: ['design'],
        instruction: '将设计方案分解为可执行的开发任务',
      },
      {
        id: 'implementation',
        description: '代码实现',
        generates: 'src/**/*.ts',
        dependsOn: ['tasks'],
        instruction: '按照任务列表进行代码实现',
      },
      {
        id: 'review',
        description: '代码审查',
        generates: 'docs/review.md',
        dependsOn: ['implementation'],
        instruction: '对实现代码进行审查，输出审查报告',
      },
      {
        id: 'archive',
        description: '项目归档',
        generates: 'docs/archive.md',
        dependsOn: ['review'],
        instruction: '归档项目文档和最终产出',
      },
    ],
  };
}

/** 构造含 requires 和特殊字符的 Schema */
function makeRichSchema(): Schema {
  return {
    name: 'rich-test',
    version: '1.0',
    artifacts: [
      {
        id: 'base',
        description: '基础模块 & 核心库',
        generates: 'src/base.ts',
        dependsOn: [],
        instruction: '实现基础模块，包含 <utility> 函数',
      },
      {
        id: 'middle',
        description: '中间件模块',
        generates: 'src/middle.ts',
        requires: [{ artifact: 'base', type: 'hard' }],
        dependsOn: [],
        instruction: '基于 "base" 模块实现中间件',
      },
      {
        id: 'soft-dep',
        description: '软依赖模块',
        generates: 'src/soft.ts',
        requires: [{ artifact: 'base', type: 'soft' }],
        dependsOn: [],
        // 无 instruction 字段，应使用 fallback
      },
    ],
  };
}

/** 构造只有单个无依赖 artifact 的 Schema */
function makeSoloSchema(): Schema {
  return {
    name: 'solo',
    version: '1.0',
    artifacts: [
      {
        id: 'solo-artifact',
        description: '独立模块',
        generates: 'out/solo.txt',
        dependsOn: [],
        instruction: '实现独立模块',
      },
    ],
  };
}

// ─── XML 格式测试 ────────────────────────────────────────────────

describe('generateInstructions (XML)', () => {
  const projectPath = process.cwd();

  it('应输出有效 XML 格式（声明 + 根元素闭合）', async () => {
    const schema = makeTestSchema();
    const completed = new Set<string>(['proposal', 'specs', 'design', 'tasks']);
    const xml = await generateInstructions(
      schema, 'feat-demo', 'implementation', projectPath, completed,
    );

    // 检查 XML 声明
    expect(xml.startsWith('<?xml')).toBe(true);
    // 检查根元素开始
    expect(xml).toContain('<artifact ');
    // 检查根元素闭合
    expect(xml).toContain('</artifact>');
  });

  it('应包含所有必备标签', async () => {
    const schema = makeTestSchema();
    const completed = new Set<string>(['proposal', 'specs', 'design', 'tasks']);
    const xml = await generateInstructions(
      schema, 'feat-demo', 'implementation', projectPath, completed,
    );

    // 必备标签检查
    expect(xml).toContain('<task>');
    expect(xml).toContain('</task>');
    expect(xml).toContain('<project_context>');
    expect(xml).toContain('</project_context>');
    expect(xml).toContain('<rules>');
    expect(xml).toContain('</rules>');
    expect(xml).toContain('<dependencies>');
    expect(xml).toContain('</dependencies>');
    expect(xml).toContain('<output>');
    expect(xml).toContain('</output>');
    expect(xml).toContain('<instruction>');
    expect(xml).toContain('</instruction>');
    expect(xml).toContain('<template>');
    expect(xml).toContain('</template>');
    expect(xml).toContain('<unlocks>');
    expect(xml).toContain('</unlocks>');
  });

  it('应正确标注依赖状态（done / pending）', async () => {
    const schema = makeTestSchema();
    // tasks 已完成，所以 implementation 的唯一 hard 依赖为 done
    const completed = new Set<string>(['proposal', 'specs', 'design', 'tasks']);
    const xml = await generateInstructions(
      schema, 'feat-demo', 'implementation', projectPath, completed,
    );

    // 检查 tasks 依赖的状态为 done
    expect(xml).toContain('status="done"');
    // 不应出现 pending 的 hard 依赖
    expect(xml).not.toMatch(/<dependency id="tasks".*status="pending"/);
  });

  it('依赖未完成时应标注为 pending', async () => {
    const schema = makeTestSchema();
    // tasks 未完成
    const completed = new Set<string>(['proposal', 'specs', 'design']);
    const xml = await generateInstructions(
      schema, 'feat-demo', 'implementation', projectPath, completed,
    );

    // tasks 依赖应为 pending
    expect(xml).toContain('status="pending"');
    expect(xml).toMatch(/<dependency id="tasks".*status="pending"/);
  });

  it('无依赖 artifact 的 dependencies 块应为空', async () => {
    const schema = makeTestSchema();
    const completed = new Set<string>();
    const xml = await generateInstructions(
      schema, 'feat-demo', 'proposal', projectPath, completed,
    );

    // proposal 无依赖
    expect(xml).toContain('<dependencies></dependencies>');
  });

  it('应对 XML 特殊字符进行转义', async () => {
    const schema = makeRichSchema();
    const completed = new Set<string>(['base']);

    // 1) middle 的 XML：base 的 description 含 &（②依赖描述块中会出现 &amp;），
    //    middle 的 instruction 含 "base"（③会转义为 &quot;base&quot;）
    const xmlMiddle = await generateInstructions(
      schema, 'feat-escape', 'middle', projectPath, completed,
    );
    expect(xmlMiddle).toContain('&amp;');          // base.description: 基础模块 & 核心库
    expect(xmlMiddle).toContain('&quot;base&quot;'); // middle.instruction: 基于 "base" 模块

    // 2) base 的 XML：base 的 instruction 含 <utility>（会转义为 &lt;utility&gt;）
    const xmlBase = await generateInstructions(
      schema, 'feat-escape', 'base', projectPath, new Set(),
    );
    expect(xmlBase).toContain('&lt;utility&gt;');   // base.instruction: 包含 <utility> 函数
  });

  it('应包含默认规则', async () => {
    const schema = makeTestSchema();
    const completed = new Set<string>();
    const xml = await generateInstructions(
      schema, 'feat-demo', 'proposal', projectPath, completed,
    );

    expect(xml).toContain('遵循 TypeScript 编码规范');
    expect(xml).toContain('产物生成到 generates 字段指定的路径');
    expect(xml).toContain('完成所有 hard 依赖后再开始当前 artifact');
  });

  it('artifact 不存在时应抛出异常', async () => {
    const schema = makeTestSchema();
    const completed = new Set<string>();

    await expect(
      generateInstructions(schema, 'feat-demo', 'nonexistent', projectPath, completed),
    ).rejects.toThrow('找不到 artifact');
  });

  it('artifact 的 id 和 change 属性应正确设置', async () => {
    const schema = makeTestSchema();
    const completed = new Set<string>();
    const xml = await generateInstructions(
      schema, 'my-feature', 'proposal', projectPath, completed,
    );

    expect(xml).toContain('id="proposal"');
    expect(xml).toContain('change="my-feature"');
    expect(xml).toContain('schema="spec-driven"');
  });

  it('instruction 为空时应生成 fallback 分步指导', async () => {
    // soft-dep 无 instruction 字段
    const schema = makeRichSchema();
    const completed = new Set<string>(['base']);
    const xml = await generateInstructions(
      schema, 'feat-fallback', 'soft-dep', projectPath, completed,
    );

    // fallback 指导应包含步骤编号
    expect(xml).toContain('1.');
    expect(xml).toContain('2.');
    expect(xml).toContain('src/soft.ts');
  });

  it('应生成 project_context 中的配置信息', async () => {
    const schema = makeTestSchema();
    const completed = new Set<string>();
    const xml = await generateInstructions(
      schema, 'feat-demo', 'proposal', projectPath, completed,
    );

    expect(xml).toContain('<project_context>');
    expect(xml).toContain('<tech_stack>TypeScript</tech_stack>');
    expect(xml).toContain('<workspace>.openfeel/ 工作区已初始化</workspace>');
    expect(xml).toContain('<project>OpenFeel</project>');
    expect(xml).toContain('<config>');
  });

  it('应生成 unlocks 信息', async () => {
    const schema = makeTestSchema();
    const completed = new Set<string>();
    const xml = await generateInstructions(
      schema, 'feat-demo', 'proposal', projectPath, completed,
    );

    // proposal 解锁 specs
    expect(xml).toContain('<unlocks>');
    expect(xml).toContain('specs');
  });
});

// ─── JSON 格式测试 ────────────────────────────────────────────────

describe('generateInstructionsJson', () => {
  const projectPath = process.cwd();

  it('应返回有效 JSON 结构', async () => {
    const schema = makeTestSchema();
    const completed = new Set<string>(['proposal', 'specs', 'design', 'tasks']);
    const result = await generateInstructionsJson(
      schema, 'feat-demo', 'implementation', projectPath, completed,
    );

    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
  });

  it('JSON 结构应与 XML 标签对应', async () => {
    const schema = makeTestSchema();
    const completed = new Set<string>(['proposal', 'specs', 'design', 'tasks']);
    const result = await generateInstructionsJson(
      schema, 'feat-demo', 'implementation', projectPath, completed,
    ) as Record<string, unknown>;

    // 顶层字段
    expect(result).toHaveProperty('artifact');
    expect(result).toHaveProperty('task');
    expect(result).toHaveProperty('project_context');
    expect(result).toHaveProperty('rules');
    expect(result).toHaveProperty('dependencies');
    expect(result).toHaveProperty('output');
    expect(result).toHaveProperty('instruction');
    expect(result).toHaveProperty('template');
    expect(result).toHaveProperty('unlocks');

    // artifact 子字段
    const artifact = result.artifact as Record<string, unknown>;
    expect(artifact.id).toBe('implementation');
    expect(artifact.change).toBe('feat-demo');
    expect(artifact.schema).toBe('spec-driven');

    // project_context 子字段
    const ctx = result.project_context as Record<string, unknown>;
    expect(ctx.tech_stack).toBe('TypeScript');
    expect(ctx.project).toBe('OpenFeel');
  });

  it('JSON 依赖状态应正确', async () => {
    const schema = makeTestSchema();
    const completed = new Set<string>(['proposal', 'specs', 'design', 'tasks']);
    const result = await generateInstructionsJson(
      schema, 'feat-demo', 'implementation', projectPath, completed,
    ) as Record<string, unknown>;

    const deps = result.dependencies as Array<Record<string, unknown>>;
    expect(deps).toHaveLength(1); // implementation 只依赖 tasks
    expect(deps[0].id).toBe('tasks');
    expect(deps[0].status).toBe('done');
  });

  it('JSON 无依赖 artifact 的 dependencies 应为空数组', async () => {
    const schema = makeTestSchema();
    const completed = new Set<string>();
    const result = await generateInstructionsJson(
      schema, 'feat-demo', 'proposal', projectPath, completed,
    ) as Record<string, unknown>;

    const deps = result.dependencies as Array<unknown>;
    expect(deps).toEqual([]);
  });

  it('JSON 中 artifact 不存在时应抛出异常', async () => {
    const schema = makeTestSchema();
    const completed = new Set<string>();

    await expect(
      generateInstructionsJson(schema, 'feat-demo', 'nonexistent', projectPath, completed),
    ).rejects.toThrow('找不到 artifact');
  });

  it('JSON 应包含默认规则', async () => {
    const schema = makeTestSchema();
    const completed = new Set<string>();
    const result = await generateInstructionsJson(
      schema, 'feat-demo', 'proposal', projectPath, completed,
    ) as Record<string, unknown>;

    const rules = result.rules as string[];
    expect(rules).toContain('遵循 TypeScript 编码规范');
    expect(rules).toContain('产物生成到 generates 字段指定的路径');
    expect(rules).toContain('完成所有 hard 依赖后再开始当前 artifact');
  });

  it('JSON 中 instruction 为空时应生成 fallback 指导', async () => {
    const schema = makeRichSchema();
    const completed = new Set<string>();
    const result = await generateInstructionsJson(
      schema, 'feat-fallback', 'soft-dep', projectPath, completed,
    ) as Record<string, unknown>;

    const instruction = result.instruction as string;
    expect(instruction).toContain('1.');
    expect(instruction).toContain('src/soft.ts');
  });

  it('JSON unlocks 应正确反映下游依赖', async () => {
    const schema = makeTestSchema();
    const completed = new Set<string>();
    const result = await generateInstructionsJson(
      schema, 'feat-demo', 'proposal', projectPath, completed,
    ) as Record<string, unknown>;

    const unlocks = result.unlocks as Array<Record<string, unknown>>;
    // proposal 解锁 specs
    expect(unlocks.some((u) => u.id === 'specs')).toBe(true);
  });
});

// ─── 边界与特殊场景测试 ──────────────────────────────────────────

describe('instruction-loader 边界测试', () => {
  const projectPath = process.cwd();

  it('solo artifact（无依赖无下游）应正常输出', async () => {
    const schema = makeSoloSchema();
    const completed = new Set<string>();
    const xml = await generateInstructions(
      schema, 'feat-solo', 'solo-artifact', projectPath, completed,
    );

    expect(xml).toContain('<dependencies></dependencies>');
    expect(xml).toContain('id="solo-artifact"');
    expect(xml).toContain('<output>out/solo.txt</output>');
  });

  it('使用 requires type=soft 的依赖不应出现在 hard 依赖中', async () => {
    const schema = makeRichSchema();
    const completed = new Set<string>(['base']);
    const xml = await generateInstructions(
      schema, 'feat-soft', 'soft-dep', projectPath, completed,
    );

    // soft-dep 只有 soft 依赖（base），hard 依赖列表应为空
    expect(xml).toContain('<dependencies></dependencies>');
  });

  it('requires type=hard 依赖应正常出现在依赖列表中', async () => {
    const schema = makeRichSchema();
    const completed = new Set<string>(['base']);
    const xml = await generateInstructions(
      schema, 'feat-hard', 'middle', projectPath, completed,
    );

    // middle 有 hard 依赖 base
    expect(xml).toContain('<dependency id="base"');
    expect(xml).not.toContain('<dependencies></dependencies>');
  });
});
