/**
 * 分期大纲管理
 * 负责 .openfeel/roadmap/ 下的版本大纲文件创建与读取
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

/** 分期大纲 */
export interface Roadmap {
  version: string;
  /** 相对路径 .openfeel/roadmap/v{version}.md */
  path: string;
}

/**
 * 创建分期大纲
 * 在 .openfeel/roadmap/ 下创建 v{version}.md 骨架文件
 * 骨架包含 # 分期大纲 v{version} / ## 目标 / ## 阶段划分 / ## 里程碑 等标题
 */
export function createRoadmap(projectPath: string, version: string): void {
  const roadmapDir = resolve(projectPath, '.openfeel', 'roadmap');

  // 确保目录存在
  if (!existsSync(roadmapDir)) {
    mkdirSync(roadmapDir, { recursive: true });
  }

  const filePath = join(roadmapDir, `v${version}.md`);

  // 若文件已存在则提示
  if (existsSync(filePath)) {
    console.log(`大纲已存在: v${version}.md`);
    return;
  }

  // 生成骨架内容
  const content = `# 分期大纲 v${version}

## 目标

> 待补充 — 描述本版本的总体目标

## 阶段划分

> 待补充 — 列出各阶段（stage-01, stage-02, ...）及简要说明

## 里程碑

> 待补充 — 关键里程碑和预期完成时间

## 备注

> 待补充
`;

  writeFileSync(filePath, content, 'utf-8');
  console.log(`已创建分期大纲: v${version}.md`);
}

/**
 * 显示分期大纲内容
 * @param version 不传则列出所有大纲文件
 * @returns 大纲内容文本
 */
export function showRoadmap(projectPath: string, version?: string): string {
  const roadmapDir = resolve(projectPath, '.openfeel', 'roadmap');

  // 目录不存在时返回提示
  if (!existsSync(roadmapDir)) {
    return '暂无分期大纲（.openfeel/roadmap/ 目录不存在）';
  }

  // 若指定 version，直接读取并返回文件内容
  if (version) {
    const filePath = join(roadmapDir, `v${version}.md`);
    if (!existsSync(filePath)) {
      console.error(`错误：大纲文件不存在 — v${version}.md`);
      process.exit(1);
    }
    return readFileSync(filePath, 'utf-8');
  }

  // 列出所有 v*.md 文件
  const files = readdirSync(roadmapDir).filter(
    (f) => f.startsWith('v') && f.endsWith('.md'),
  );

  if (files.length === 0) {
    return '暂无分期大纲文件';
  }

  // 每行一个文件名（不带路径前缀）
  return files.join('\n');
}
