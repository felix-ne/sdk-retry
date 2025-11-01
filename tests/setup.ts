/**
 * Vitest 测试环境设置
 */

import { beforeEach, afterEach, vi } from 'vitest';

// 保存原始的 console
const originalConsole = { ...console };

// 全局 beforeEach，在每个测试前运行
beforeEach(() => {
  // 清空 localStorage
  localStorage.clear();
  
  // 清空所有 mock
  vi.clearAllMocks();
  
  // 恢复所有 spy（重要！）
  vi.restoreAllMocks();
  
  // 重置所有 timer
  vi.clearAllTimers();
  
  // Mock fetch API
  global.fetch = vi.fn();
});

// 全局 afterEach
afterEach(() => {
  // 恢复 console
  global.console = originalConsole;
  
  // 恢复所有 spy
  vi.restoreAllMocks();
});

