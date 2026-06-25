// 构建脚本 — 清理 dist/ 后执行 TypeScript 编译
import { rmSync } from 'node:fs';
import { execSync } from 'node:child_process';

// 清理旧的编译产物
rmSync('dist', { recursive: true, force: true });
console.log('✓ dist/ 已清理');

// 执行 TypeScript 编译
execSync('npx tsc', { stdio: 'inherit' });
console.log('✓ TypeScript 编译完成');
