import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 使用 jsdom 环境模拟浏览器
    environment: 'jsdom',
    
    // 全局 API（如 describe, it, expect）无需导入
    globals: true,
    
    // 测试覆盖率配置
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/index.ts',
        'src/sdk-example.ts', // 示例文件不测
      ],
      // 覆盖率阈值
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
    
    // 测试超时时间
    testTimeout: 10000,
    
    // 钩子超时时间
    hookTimeout: 10000,
    
    // 在每个测试文件之前运行的设置文件
    setupFiles: ['./tests/setup.ts'],
  },
});



