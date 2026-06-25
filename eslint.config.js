// ESLint 配置 — OpenFeel TypeScript 项目
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // 全局忽略
    ignores: ['dist/', 'node_modules/', '.opencode/'],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      // 允许 any 类型用于快速原型
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
);
