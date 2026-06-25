// vitest 测试框架配置 — OpenFeel
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // 使用 node 环境（非浏览器）
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
