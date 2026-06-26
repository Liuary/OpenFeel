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

/** 规范化版本号：去掉用户可能输入的前导 v */
function normalizeVersion(version: string): string {
  return version.replace(/^v/, '');
}

/**
 * 创建分期大纲
 * 在 .openfeel/roadmap/ 下创建 v{version}.md 骨架文件
 */
export function createRoadmap(projectPath: string, version: string): void {
  const ver = normalizeVersion(version);
  const roadmapDir = resolve(projectPath, '.openfeel', 'roadmap');

  if (!existsSync(roadmapDir)) {
    mkdirSync(roadmapDir, { recursive: true });
  }

  const filePath = join(roadmapDir, `v${ver}.md`);

  if (existsSync(filePath)) {
    console.log(`大纲已存在: v${ver}.md`);
    return;
  }

  const content = `# 分期大纲 v${ver}

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
  console.log(`已创建分期大纲: v${ver}.md`);
}

/**
 * 显示分期大纲内容
 * @param version 不传则列出所有大纲文件
 */
export function showRoadmap(projectPath: string, version?: string): string {
  const roadmapDir = resolve(projectPath, '.openfeel', 'roadmap');

  if (!existsSync(roadmapDir)) {
    return '暂无分期大纲（.openfeel/roadmap/ 目录不存在）';
  }

  if (version) {
    const ver = normalizeVersion(version);
    const filePath = join(roadmapDir, `v${ver}.md`);
    if (!existsSync(filePath)) {
      console.error(`错误：大纲文件不存在 — v${ver}.md`);
      process.exit(1);
    }
    return readFileSync(filePath, 'utf-8');
  }

  const files = readdirSync(roadmapDir).filter(
    (f) => f.startsWith('v') && f.endsWith('.md'),
  );

  if (files.length === 0) {
    return '暂无分期大纲文件';
  }

  return files.join('\n');
}