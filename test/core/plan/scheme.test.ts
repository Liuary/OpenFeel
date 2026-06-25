/**
 * scheme 单元测试
 * 测试 createScheme、getScheme 和 listSchemes 在临时目录中的行为
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createScheme, getScheme, listSchemes } from '../../../src/core/plan/scheme.js';
import { addStage } from '../../../src/core/plan/stage.js';
import { FlowManager } from '../../../src/core/flow-manager.js';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('scheme', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-scheme-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('createScheme', () => {
    it('应在 stage-01 下创建 op-001_{title}.md 文件', () => {
      // 先创建阶段
      addStage(tmpDir, 'stage-01');

      const opId = createScheme(tmpDir, 'stage-01', '实现登录功能');

      expect(opId).toBe('op-001');

      const filePath = join(tmpDir, '.openfeel', 'stages', 'stage-01', 'ops', 'op-001_实现登录功能.md');
      expect(existsSync(filePath)).toBe(true);
    });

    it('应返回正确的 opId', () => {
      addStage(tmpDir, 'stage-01');

      const opId = createScheme(tmpDir, 'stage-01', '测试方案');
      expect(opId).toBe('op-001');
    });

    it('生成的模板应包含必填字段', () => {
      addStage(tmpDir, 'stage-01');

      createScheme(tmpDir, 'stage-01', '配置数据库');

      const filePath = join(tmpDir, '.openfeel', 'stages', 'stage-01', 'ops', 'op-001_配置数据库.md');
      const content = readFileSync(filePath, 'utf-8');

      expect(content).toContain('# op-001：配置数据库');
      expect(content).toContain('## 目标');
      expect(content).toContain('## 实施步骤');
      expect(content).toContain('## 产出文件');
      expect(content).toContain('## 自测清单');
      expect(content).toContain('## 修正记录');
      // 验证表格分隔线格式
      expect(content).toContain('| 次数 | 时间 | 问题 | 修正内容 |');
    });

    it('多次创建时 opId 递增', () => {
      addStage(tmpDir, 'stage-01');

      const opId1 = createScheme(tmpDir, 'stage-01', '方案一');
      const opId2 = createScheme(tmpDir, 'stage-01', '方案二');
      const opId3 = createScheme(tmpDir, 'stage-01', '方案三');

      expect(opId1).toBe('op-001');
      expect(opId2).toBe('op-002');
      expect(opId3).toBe('op-003');
    });

    it('阶段目录不存在时自动创建', () => {
      // 不预先创建阶段目录，直接 createScheme
      const opId = createScheme(tmpDir, 'stage-auto', '自动创建');

      expect(opId).toBe('op-001');

      const filePath = join(tmpDir, '.openfeel', 'stages', 'stage-auto', 'ops', 'op-001_自动创建.md');
      expect(existsSync(filePath)).toBe(true);
    });

    it('标题含空格时文件名使用下划线', () => {
      addStage(tmpDir, 'stage-01');

      createScheme(tmpDir, 'stage-01', '实现 登录 功能');

      const opsDir = join(tmpDir, '.openfeel', 'stages', 'stage-01', 'ops');
      // 文件名中空格应替换为下划线
      const filePath = join(opsDir, 'op-001_实现_登录_功能.md');
      expect(existsSync(filePath)).toBe(true);
    });

    it('应同步到 flow.json（若 flow.json 存在且包含该阶段）', () => {
      // 先创建 .openfeel/ 目录并初始化 flow.json
      const openfeelDir = join(tmpDir, '.openfeel');
      mkdirSync(openfeelDir, { recursive: true });

      // 使用 FlowManager 初始化 flow.json
      FlowManager.initFlow(tmpDir);

      // 手动添加 stage 到 flow.json
      const flowMgr = new FlowManager(tmpDir);
      const flowData = flowMgr.getData();
      if (flowData) {
        flowData.stages['stage-01'] = {
          name: 'stage-01',
          status: 'planned',
          deps: [],
          ops: {},
        };
        flowMgr.save();
      }

      // 创建阶段目录
      addStage(tmpDir, 'stage-01');

      // 创建方案
      const opId = createScheme(tmpDir, 'stage-01', '同步测试');

      expect(opId).toBe('op-001');

      // 重新加载 flow.json 验证同步结果
      const verifyMgr = new FlowManager(tmpDir);
      const verifyData = verifyMgr.getData();
      expect(verifyData).not.toBeNull();

      if (verifyData) {
        const stage = verifyData.stages['stage-01'];
        expect(stage).toBeDefined();
        expect(stage.ops['op-001']).toBeDefined();
        expect(stage.ops['op-001'].title).toBe('同步测试');
        expect(stage.ops['op-001'].state).toBe('pending');
      }
    });

    it('flow.json 不存在时同步不应报错', () => {
      addStage(tmpDir, 'stage-01');

      // flow.json 不存在时 createScheme 不应抛出异常
      expect(() => {
        createScheme(tmpDir, 'stage-01', '无 flow');
      }).not.toThrow();
    });
  });

  describe('getScheme', () => {
    it('应通过完整 opId 查找方案', () => {
      addStage(tmpDir, 'stage-01');
      createScheme(tmpDir, 'stage-01', '查找测试');

      const scheme = getScheme(tmpDir, 'stage-01.op-001');
      expect(scheme).not.toBeNull();
      expect(scheme!.opId).toBe('op-001');
      expect(scheme!.stage).toBe('stage-01');
      expect(scheme!.title).toContain('查找测试');
      expect(scheme!.content).toContain('# op-001');
    });

    it('应通过简短 opId 查找方案', () => {
      addStage(tmpDir, 'stage-01');
      createScheme(tmpDir, 'stage-01', '简短查找');

      const scheme = getScheme(tmpDir, 'op-001');
      expect(scheme).not.toBeNull();
      expect(scheme!.opId).toBe('op-001');
      expect(scheme!.stage).toBe('stage-01');
    });

    it('不存在的方案应返回 null', () => {
      addStage(tmpDir, 'stage-01');

      const scheme = getScheme(tmpDir, 'op-999');
      expect(scheme).toBeNull();
    });

    it('完整 opId 格式不匹配时应返回 null', () => {
      addStage(tmpDir, 'stage-01');

      const scheme = getScheme(tmpDir, 'stage-99.op-001');
      expect(scheme).toBeNull();
    });
  });

  describe('listSchemes', () => {
    it('应列出指定阶段的所有方案', () => {
      addStage(tmpDir, 'stage-01');
      createScheme(tmpDir, 'stage-01', '方案A');
      createScheme(tmpDir, 'stage-01', '方案B');

      const schemes = listSchemes(tmpDir, 'stage-01');
      expect(schemes).toHaveLength(2);

      const opIds = schemes.map((s) => s.opId);
      expect(opIds).toContain('op-001');
      expect(opIds).toContain('op-002');
    });

    it('不传阶段名时应列出所有阶段的方案', () => {
      addStage(tmpDir, 'stage-01');
      addStage(tmpDir, 'stage-02');

      createScheme(tmpDir, 'stage-01', '方案1');
      createScheme(tmpDir, 'stage-02', '方案2');

      const schemes = listSchemes(tmpDir);
      expect(schemes).toHaveLength(2);

      // 验证阶段区分
      const stage1Schemes = schemes.filter((s) => s.stage === 'stage-01');
      const stage2Schemes = schemes.filter((s) => s.stage === 'stage-02');
      expect(stage1Schemes).toHaveLength(1);
      expect(stage2Schemes).toHaveLength(1);
    });

    it('无方案时应返回空数组', () => {
      addStage(tmpDir, 'stage-01');

      const schemes = listSchemes(tmpDir, 'stage-01');
      expect(schemes).toEqual([]);
    });

    it('stages 目录不存在时应返回空数组', () => {
      const schemes = listSchemes(tmpDir);
      expect(schemes).toEqual([]);
    });
  });
});
