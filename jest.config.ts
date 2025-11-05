import type { Config } from 'jest';

const config: Config = {
  // 测试环境
  testEnvironment: 'jsdom',
  
  // 测试文件匹配模式（排除 types.test.ts，它使用 vitest）
  testMatch: ['**/tests/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/tests/types.test.ts'],
  
  // 模块文件扩展名
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  
  // TypeScript 转换配置
  preset: 'ts-jest',
  
  // 转换配置
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        target: 'ES2020',
        module: 'ESNext',
        lib: ['ES2020', 'DOM', 'DOM.Iterable'],
        esModuleInterop: true,
        skipLibCheck: true,
      },
    }],
  },
  
  // 测试前运行的文件
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  
  // 覆盖率配置
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/sdk-example.ts',
  ],
  
  // 覆盖率阈值
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  
  // 覆盖率报告格式
  coverageReporters: ['text', 'json', 'html'],
  
  // 测试超时时间
  testTimeout: 10000,
  
  // 清除 mock
  clearMocks: true,
  
  // 恢复 mock
  restoreMocks: true,
};

export default config;
