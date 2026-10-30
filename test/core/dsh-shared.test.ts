/**
 * DSH 适配器序列化单测（v1.3.3 P1-2）
 *
 * 回归反馈 P1-2：`flow status` 的 `stages[].deps` 曾渲染成 `[循环引用]`——
 * 根因是 `stringifySafe` 用全局 WeakSet 把**重复引用**（DAG，如 focus.deps 与 stages[i].deps
 * 指向同一数组）误判为真环。这里锁定「祖先栈判环」语义：重复引用正常复制，真环仍标记。
 */
import { describe, it, expect } from 'vitest';
import { stringifySafe } from '../../dsh/lib/tools/shared.js';

describe('DSH stringifySafe（v1.3.3 P1-2）', () => {
  it('重复引用正常复制，不写 [循环引用]', () => {
    const shared = ['a', 'b'];
    const output = stringifySafe({ focus: { deps: shared }, stages: [{ deps: shared }] });
    expect(output).not.toContain('循环引用');
    expect(JSON.parse(output)).toEqual({
      focus: { deps: ['a', 'b'] },
      stages: [{ deps: ['a', 'b'] }],
    });
  });

  it('真环（自引用）仍写 [循环引用]', () => {
    const node: Record<string, unknown> = { name: 'x' };
    node.self = node;
    const output = stringifySafe({ node });
    expect(output).toContain('[循环引用]');
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it('BigInt / 函数 / undefined 安全（永不抛错）', () => {
    const output = stringifySafe({ n: BigInt(1), f: () => 1, u: undefined });
    expect(output).toContain('"n": "1"');
    expect(output).not.toContain('function');
  });

  it('Date 等自带 toJSON 的对象保留 JSON 语义', () => {
    const output = stringifySafe({ at: new Date('2026-10-30T00:00:00.000Z') });
    expect(JSON.parse(output)).toEqual({ at: '2026-10-30T00:00:00.000Z' });
  });
});
