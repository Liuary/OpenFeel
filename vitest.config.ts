// vitest 测试框架配置 — OpenFeel
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // 使用 node 环境（非浏览器）
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
  // 配置模块解析：让 Vite 能正确解析 .ts 源文件
  resolve: {
    extensions: ['.ts', '.js', '.mjs', '.json'],
  },
});
