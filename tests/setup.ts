/**
 * Jest 测试环境设置
 */

// 使文件成为模块（TypeScript isolatedModules 要求）
export {};

// 保存原始的 console
const originalConsole = { ...console };

// 全局 beforeEach，在每个测试前运行
beforeEach(() => {
  // 清空 localStorage（如果可用）
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.clear();
  }
  
  // Mock fetch API（每次测试前重新创建，清除之前的调用记录）
  global.fetch = jest.fn() as jest.Mock;
  
  // 确保 mock 的调用记录被清除
  if (global.fetch && typeof (global.fetch as jest.Mock).mockClear === 'function') {
    (global.fetch as jest.Mock).mockClear();
  }
});

// 全局 afterEach
afterEach(() => {
  // 恢复 console
  global.console = originalConsole;
  
  // jest 会自动恢复 mock
});
