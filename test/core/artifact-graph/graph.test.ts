/**
 * ArtifactGraph 单元测试
 * 验证拓扑排序、循环依赖检测、就绪判断、阻塞状态等功能
 */
import { describe, it, expect } from 'vitest';
import { ArtifactGraph } from '../../../src/core/artifact-graph/graph.js';
import { SchemaSchema } from '../../../src/core/schema.js';
import type { Schema } from '../../../src/core/schema.js';

/** 构造标准测试 Schema（5 个 artifact，含无依赖的 e） */
function makeTestSchema(): Schema {
  return {
    name: 'test',
    version: '1.0',
    artifacts: [
      { id: 'a', description: 'Artifact A', generates: 'a.txt', dependsOn: [] },
      { id: 'b', description: 'Artifact B', generates: 'b.txt', dependsOn: ['a'] },
      { id: 'c', description: 'Artifact C', generates: 'c.txt', dependsOn: ['a'] },
      { id: 'd', description: 'Artifact D', generates: 'd.txt', dependsOn: ['b', 'c'] },
      { id: 'e', description: 'Artifact E', generates: 'e.txt', dependsOn: [] },
    ],
  };
}

describe('ArtifactGraph', () => {
  it('应正确进行拓扑排序', () => {
    const graph = new ArtifactGraph(makeTestSchema());
    const order = graph.getBuildOrder();
    // a 和 e 应在最前面（无依赖），b 和 c 应在 a 之后，d 应在最后
    expect(order).toBeDefined();
    expect(order.length).toBe(5);

    const idx = (id: string) => order.indexOf(id);
    expect(idx('a')).toBeGreaterThanOrEqual(0);
    expect(idx('e')).toBeGreaterThanOrEqual(0);
    // a 在 b、c 之前
    expect(idx('a')).toBeLessThan(idx('b'));
    expect(idx('a')).toBeLessThan(idx('c'));
    // b、c 在 d 之前
    expect(idx('b')).toBeLessThan(idx('d'));
    expect(idx('c')).toBeLessThan(idx('d'));
  });

  it('应检测循环依赖并抛出异常', () => {
    const schema: Schema = {
      name: 'cycle',
      version: '1.0',
      artifacts: [
        { id: 'x', generates: 'x.txt', dependsOn: ['y'] },
        { id: 'y', generates: 'y.txt', dependsOn: ['x'] },
      ],
    };
    const graph = new ArtifactGraph(schema);
    expect(() => graph.getBuildOrder()).toThrow('循环依赖');
  });

  it('应返回已就绪的 artifact（getNextArtifacts）', () => {
    const graph = new ArtifactGraph(makeTestSchema());
    const completed = new Set<string>(['a', 'e']);
    const next = graph.getNextArtifacts(completed);
    // b 和 c 依赖 a（已满足），e 无依赖但已完成所以不在 next 中
    expect(next).toContain('b');
    expect(next).toContain('c');
    // d 依赖 b 和 c（尚未完成），不应出现
    expect(next).not.toContain('d');
    // a 和 e 已完成，不应出现
    expect(next).not.toContain('a');
    expect(next).not.toContain('e');
  });

  it('应正确判断 isComplete', () => {
    const graph = new ArtifactGraph(makeTestSchema());
    expect(graph.isComplete(new Set())).toBe(false);
    expect(graph.isComplete(new Set(['a', 'b', 'c', 'd', 'e']))).toBe(true);
    expect(graph.isComplete(new Set(['a', 'b', 'c', 'e']))).toBe(false);
  });

  it('应返回阻塞状态（getBlocked）', () => {
    const graph = new ArtifactGraph(makeTestSchema());
    const completed = new Set<string>(['a']);
    const blocked = graph.getBlocked(completed);

    expect(blocked.total).toBe(5);
    expect(blocked.done).toBe(1);
    // e 无依赖，应该就绪
    expect(blocked.ready).toContain('e');
    // b 和 c 依赖 a（已满足），也应就绪
    expect(blocked.ready).toContain('b');
    expect(blocked.ready).toContain('c');
    // d 依赖 b 和 c（未满足），应被阻塞
    const blockedIds = blocked.blocked.map((b) => b.artifactId);
    expect(blockedIds).toContain('d');
    // 确认 d 的 missingDeps 是 b 和 c
    const dBlocked = blocked.blocked.find((b) => b.artifactId === 'd');
    expect(dBlocked).toBeDefined();
    expect(dBlocked!.missingDeps).toContain('b');
    expect(dBlocked!.missingDeps).toContain('c');
  });

  it('空 Schema 不应报错', () => {
    const schema: Schema = { name: 'empty', version: '1.0', artifacts: [] };
    const graph = new ArtifactGraph(schema);
    expect(graph.getBuildOrder()).toEqual([]);
    expect(graph.isComplete(new Set())).toBe(true);
  });

  it('should handle requires with hard/soft types', () => {
    // 测试 requires 字段（type='hard' 和 type='soft'）
    const schema: Schema = {
      name: 'require-test',
      version: '1.0',
      artifacts: [
        { id: 'base', generates: 'base.txt', dependsOn: [] },
        {
          id: 'hard-dep',
          generates: 'hard.txt',
          requires: [{ artifact: 'base', type: 'hard' }],
          dependsOn: [],
        },
        {
          id: 'soft-dep',
          generates: 'soft.txt',
          requires: [{ artifact: 'base', type: 'soft' }],
          dependsOn: [],
        },
      ],
    };
    const graph = new ArtifactGraph(schema);
    const order = graph.getBuildOrder();

    // hard-dep 必须在 base 之后
    expect(order.indexOf('base')).toBeLessThan(order.indexOf('hard-dep'));
    // soft-dep 无 hard 依赖，可以在 base 之前执行（拓扑排序不强制顺序）
    // 但拓扑排序保证 soft-dep 入度为 0，可以和 base 并列

    // getNextArtifacts: 在 base 未完成时，hard-dep 不应就绪
    const next = graph.getNextArtifacts(new Set());
    expect(next).toContain('base');
    expect(next).toContain('soft-dep'); // soft 依赖不阻塞
    expect(next).not.toContain('hard-dep'); // hard 依赖阻塞
  });

  it('dependsOn 应视为 hard 依赖', () => {
    const schema: Schema = {
      name: 'depends-on-test',
      version: '1.0',
      artifacts: [
        { id: 'first', generates: 'first.txt', dependsOn: [] },
        { id: 'second', generates: 'second.txt', dependsOn: ['first'] },
      ],
    };
    const graph = new ArtifactGraph(schema);
    // second 依赖 first，first 未完成时 second 不应就绪
    const next = graph.getNextArtifacts(new Set());
    expect(next).toEqual(['first']);

    // first 完成后 second 应就绪
    const next2 = graph.getNextArtifacts(new Set(['first']));
    expect(next2).toEqual(['second']);
  });

  it('不存在的依赖应抛出异常', () => {
    const schema: Schema = {
      name: 'bad-dep',
      version: '1.0',
      artifacts: [
        { id: 'a', generates: 'a.txt', dependsOn: ['nonexistent'] },
      ],
    };
    expect(() => new ArtifactGraph(schema)).toThrow('不存在的 artifact');
  });

  it('不应接受重复的 artifact ID', () => {
    // 验证 Schema 层拒绝重复 ID
    const result = SchemaSchema.safeParse({
      name: 'duplicate-test',
      version: '1.0',
      artifacts: [
        { id: 'a', generates: 'a.txt', dependsOn: [] },
        { id: 'a', generates: 'a2.txt', dependsOn: [] },  // 重复 ID
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes('重复'))).toBe(true);
    }
  });
});
