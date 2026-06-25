/**
 * Schema 验证与加载 单元测试
 * 测试 SchemaSchema Zod 校验和 loadSchema 文件加载
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SchemaSchema, loadSchema } from '../../src/core/schema.js';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** 正确的 Schema 数据 */
const validSchemaData = {
  name: 'test-schema',
  version: '1.0',
  description: '测试用 Schema',
  artifacts: [
    {
      id: 'proposal',
      description: '需求提案文档',
      generates: 'proposal.md',
      requires: [{ artifact: 'research', type: 'hard' }],
    },
    {
      id: 'implementation',
      description: '代码实现',
      generates: 'src/**/*.ts',
      dependsOn: ['proposal'],
      metadata: { language: 'typescript' },
    },
  ],
};

describe('SchemaSchema.parse', () => {
  it('应验证正确的 Schema 数据', () => {
    const result = SchemaSchema.parse(validSchemaData);
    expect(result.name).toBe('test-schema');
    expect(result.version).toBe('1.0');
    expect(result.artifacts).toHaveLength(2);
    expect(result.artifacts[0].id).toBe('proposal');
    expect(result.artifacts[1].id).toBe('implementation');
  });

  it('应拒绝缺少 name 的数据', () => {
    const data = { ...validSchemaData };
    delete (data as Record<string, unknown>).name;
    expect(() => SchemaSchema.parse(data)).toThrow();
  });

  it('应拒绝重复的 artifact ID', () => {
    const data = {
      name: 'bad-schema',
      artifacts: [
        { id: 'dup', generates: 'file1.ts' },
        { id: 'dup', generates: 'file2.ts' },
      ],
    };
    expect(() => SchemaSchema.parse(data)).toThrow();
  });

  it('应正确应用默认值 — version 默认 "1.0"', () => {
    const data = {
      name: 'minimal',
      artifacts: [],
    };
    const result = SchemaSchema.parse(data);
    expect(result.version).toBe('1.0');
  });

  it('应正确应用默认值 — requires 默认 []（空数组）', () => {
    const data = {
      name: 'minimal',
      artifacts: [
        { id: 'doc', generates: 'doc.md' },
      ],
    };
    const result = SchemaSchema.parse(data);
    expect(result.artifacts[0].requires).toEqual([]);
  });

  it('应正确应用默认值 — dependsOn 默认 []（空数组）', () => {
    const data = {
      name: 'minimal',
      artifacts: [
        { id: 'doc', generates: 'doc.md' },
      ],
    };
    const result = SchemaSchema.parse(data);
    expect(result.artifacts[0].dependsOn).toEqual([]);
  });

  it('应正确应用默认值 — metadata 默认 {}（空对象）', () => {
    const data = {
      name: 'minimal',
      artifacts: [
        { id: 'doc', generates: 'doc.md' },
      ],
    };
    const result = SchemaSchema.parse(data);
    expect(result.artifacts[0].metadata).toEqual({});
  });

  it('Dependency type 只能是 "hard" 或 "soft"，默认 "hard"', () => {
    // 测试有效值
    const data = {
      name: 'dep-test',
      artifacts: [
        {
          id: 'main',
          generates: 'main.ts',
          requires: [
            { artifact: 'lib', type: 'soft' },
            { artifact: 'util' }, // 不写 type，默认为 hard
          ],
        },
      ],
    };
    const result = SchemaSchema.parse(data);
    expect(result.artifacts[0].requires[0].type).toBe('soft');
    expect(result.artifacts[0].requires[1].type).toBe('hard'); // 默认
  });

  it('应拒绝非法的 Dependency type', () => {
    const data = {
      name: 'bad-dep',
      artifacts: [
        {
          id: 'main',
          generates: 'main.ts',
          requires: [{ artifact: 'lib', type: 'invalid' }],
        },
      ],
    };
    expect(() => SchemaSchema.parse(data)).toThrow();
  });
});

describe('loadSchema', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-schema-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('应从临时 YAML 文件加载并验证', async () => {
    const yamlContent = `name: loaded-schema
version: '2.0'
description: 从文件加载的 Schema
artifacts:
  - id: config
    generates: config.json
    requires:
      - artifact: base
        type: hard
  - id: app
    generates: app.ts
    dependsOn:
      - config
`;
    const yamlPath = join(tmpDir, 'schema.yaml');
    writeFileSync(yamlPath, yamlContent, 'utf-8');

    const schema = await loadSchema(yamlPath);
    expect(schema.name).toBe('loaded-schema');
    expect(schema.version).toBe('2.0');
    expect(schema.description).toBe('从文件加载的 Schema');
    expect(schema.artifacts).toHaveLength(2);
    expect(schema.artifacts[0].id).toBe('config');
    expect(schema.artifacts[0].requires[0].artifact).toBe('base');
    expect(schema.artifacts[0].requires[0].type).toBe('hard');
    expect(schema.artifacts[1].id).toBe('app');
    expect(schema.artifacts[1].dependsOn).toEqual(['config']);
  });

  it('不存在的文件应抛出异常', async () => {
    await expect(loadSchema(join(tmpDir, 'nonexistent.yaml')))
      .rejects.toThrow();
  });
});
