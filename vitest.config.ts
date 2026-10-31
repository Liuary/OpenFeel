// vitest 测试框架配置 — OpenFeel
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // 使用 node 环境（非浏览器）
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // preflight 默认关闭：防止开发机 / CI 导出 OPENFEEL_PREFLIGHT=strict 时既有命令测试集体失败。
    // 新用例一律用 vi.stubEnv('OPENFEEL_PREFLIGHT', '<mode>') 显式覆盖（v1.5.6-stage-114）。
    env: { OPENFEEL_PREFLIGHT: 'off' },
    // 覆盖率：仅报告（R6 已裁定不阻断）——不设置覆盖率门槛，永不因覆盖率失败
    coverage: {
      provider: 'v8',
      reporter: ['text'],
    },
  },
  // 配置模块解析：让 Vite 能正确解析 .ts 源文件
  resolve: {
    extensions: ['.ts', '.js', '.mjs', '.json'],
  },
});
