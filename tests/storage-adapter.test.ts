/**
 * StorageAdapter 单元测试
 */

import { StorageAdapter } from '../src/storage-adapter';
import type { QueueItem } from '../src/types';

describe('StorageAdapter', () => {
  let adapter: StorageAdapter;
  const storageKey = 'test_queue';

  beforeEach(() => {
    adapter = new StorageAdapter(storageKey, false);
  });

  describe('基础功能', () => {
    it('应该正确初始化', () => {
      expect(adapter).toBeDefined();
      expect(adapter.getStorageMode()).toBe('localStorage');
    });

    it('应该从空 localStorage 加载空数组', () => {
      const data = adapter.load();
      expect(data).toEqual([]);
    });

    it('应该正确保存和加载数据', () => {
      const mockData: QueueItem[] = [
        {
          id: '1',
          payload: {
            url: '/api/test',
            timestamp: Date.now(),
            priority: 'normal',
          },
          priority: 'normal',
          retryCount: 0,
          lastRetryTime: 0,
          createdAt: Date.now(),
        },
      ];

      const saved = adapter.save(mockData);
      expect(saved).toBe(true);

      const loaded = adapter.load();
      expect(loaded).toEqual(mockData);
    });

    it('应该正确清空存储', () => {
      const mockData: QueueItem[] = [
        {
          id: '1',
          payload: {
            url: '/api/test',
            timestamp: Date.now(),
            priority: 'normal',
          },
          priority: 'normal',
          retryCount: 0,
          lastRetryTime: 0,
          createdAt: Date.now(),
        },
      ];

      adapter.save(mockData);
      adapter.clear();

      const loaded = adapter.load();
      expect(loaded).toEqual([]);
    });
  });

  describe('自动降级', () => {
    it('当 localStorage 不可用时应该降级到内存模式', () => {
      // Mock localStorage 为 null
      const originalLocalStorage = window.localStorage;
      Object.defineProperty(window, 'localStorage', {
        value: null,
        writable: true,
      });

      const memoryAdapter = new StorageAdapter('test', false);
      expect(memoryAdapter.getStorageMode()).toBe('memory');
      expect(memoryAdapter.isUsingMemoryFallback()).toBe(true);

      // 恢复
      Object.defineProperty(window, 'localStorage', {
        value: originalLocalStorage,
        writable: true,
      });
    });

    it('当 localStorage.setItem 抛出错误时应该降级', () => {
      // Mock setItem 抛出 QuotaExceededError
      const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');
      setItemSpy.mockImplementation(() => {
        const error = new DOMException(
          'QuotaExceededError',
          'QuotaExceededError'
        );
        throw error;
      });

      // 创建新的 adapter，这样它会在 mock 后检测
      const newAdapter = new StorageAdapter('test_new', false);

      // 此时应该已经降级到内存模式
      expect(newAdapter.getStorageMode()).toBe('memory');
      expect(newAdapter.isUsingMemoryFallback()).toBe(true);

      // 恢复 mock
      setItemSpy.mockRestore();

      // 内存模式下 save 应该返回 true
      const mockData: QueueItem[] = [
        {
          id: '1',
          payload: {
            url: '/api/test',
            timestamp: Date.now(),
            priority: 'normal',
          },
          priority: 'normal',
          retryCount: 0,
          lastRetryTime: 0,
          createdAt: Date.now(),
        },
      ];

      const saved = newAdapter.save(mockData);
      expect(saved).toBe(true);
    });

    it('内存模式下 save 应该直接返回 true', () => {
      // 先触发降级到内存模式
      const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');
      setItemSpy.mockImplementation(() => {
        throw new Error('Storage unavailable');
      });

      const memoryAdapter = new StorageAdapter('test_memory', false);
      expect(memoryAdapter.isUsingMemoryFallback()).toBe(true);

      setItemSpy.mockRestore();

      // 内存模式保存应该直接返回 true
      const saved = memoryAdapter.save([
        {
          id: '2',
          payload: {
            url: '/api/test2',
            timestamp: Date.now(),
            priority: 'normal',
          },
          priority: 'normal',
          retryCount: 0,
          lastRetryTime: 0,
          createdAt: Date.now(),
        },
      ]);
      expect(saved).toBe(true);
    });
  });

  describe('数据完整性', () => {
    it('应该正确处理损坏的 JSON 数据', () => {
      localStorage.setItem(storageKey, 'invalid json');
      const loaded = adapter.load();
      expect(loaded).toEqual([]);
    });

    it('应该正确处理非数组数据', () => {
      localStorage.setItem(storageKey, JSON.stringify({ foo: 'bar' }));
      const loaded = adapter.load();
      expect(loaded).toEqual([]);
    });

    it('应该处理大量数据', () => {
      const largeData: QueueItem[] = Array.from({ length: 1000 }, (_, i) => ({
        id: `item_${i}`,
        payload: {
          url: `/api/test${i}`,
          timestamp: Date.now(),
          priority: 'normal' as const,
        },
        priority: 'normal' as const,
        retryCount: 0,
        lastRetryTime: 0,
        createdAt: Date.now(),
      }));

      const saved = adapter.save(largeData);
      expect(saved).toBe(true);

      const loaded = adapter.load();
      expect(loaded.length).toBe(1000);
      expect(loaded[0].id).toBe('item_0');
      expect(loaded[999].id).toBe('item_999');
    });
  });

  describe('isLocalStorageAvailable', () => {
    it('应该正确检测 localStorage 可用性', () => {
      const adapter = new StorageAdapter('test', false);
      expect(adapter.getStorageMode()).toBe('localStorage');
    });

    it('当 setItem 抛出错误时应该降级到内存模式', () => {
      const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');
      setItemSpy.mockImplementation(() => {
        throw new Error('Access denied');
      });

      const adapter = new StorageAdapter('test2', false);
      expect(adapter.getStorageMode()).toBe('memory');

      setItemSpy.mockRestore();
    });

    it('当 window 未定义时应该降级到内存模式', () => {
      // 保存原始值
      const originalWindow =
        typeof window !== 'undefined' ? window : (global as any).window;
      const originalLocalStorage =
        typeof window !== 'undefined' ? window?.localStorage : undefined;

      // 在 jsdom 环境中，需要同时删除 global.window 和 window
      // 并设置 window.localStorage 为 undefined
      // @ts-ignore
      if (typeof window !== 'undefined') {
        delete (window as any).localStorage;
      }
      // @ts-ignore
      delete (global as any).window;

      // 重新定义 window 但去掉 localStorage
      (global as any).window = {};

      const adapter = new StorageAdapter('test_no_window', false);
      expect(adapter.getStorageMode()).toBe('memory');

      // 恢复
      (global as any).window = originalWindow;
      if (originalWindow && originalLocalStorage) {
        originalWindow.localStorage = originalLocalStorage;
      }
    });
  });

  describe('运行时降级', () => {
    it('load 时检测到 localStorage 不可用应该降级', () => {
      const adapter = new StorageAdapter(storageKey, false);
      expect(adapter.getStorageMode()).toBe('localStorage');

      // 模拟在 load 时 localStorage.getItem 抛出错误（JSON 解析错误等情况）
      // 注意：load 方法中 getItem 抛出错误会被 catch 捕获并降级
      const originalGetItem = Storage.prototype.getItem;
      const getItemSpy = jest.spyOn(Storage.prototype, 'getItem');

      getItemSpy.mockImplementation(function (
        this: Storage,
        key: string | null
      ) {
        // 如果是我们的存储 key，抛出错误
        if (key === storageKey) {
          throw new Error('localStorage unavailable');
        }
        // 对于其他 key，正常执行
        return originalGetItem.call(this, key as string);
      });

      const data = adapter.load();
      expect(data).toEqual([]);
      // 应该降级到内存模式
      expect(adapter.getStorageMode()).toBe('memory');

      // 恢复
      getItemSpy.mockRestore();
    });

    it('save 时遇到 QuotaExceededError 应该降级并清空存储', () => {
      const adapter = new StorageAdapter(storageKey, false);
      expect(adapter.getStorageMode()).toBe('localStorage');

      // Mock localStorage.setItem 抛出 QuotaExceededError
      // 注意：save 方法会先调用 isLocalStorageAvailable()，它使用测试 key '__storage_test__'
      // 然后才调用 setItem 保存实际数据，所以需要区分这两个调用
      const originalSetItem = Storage.prototype.setItem;
      const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');

      setItemSpy.mockImplementation(function (
        this: Storage,
        key: string,
        value: string
      ) {
        // 如果是测试 key，正常执行（让 isLocalStorageAvailable 通过）
        if (key === '__storage_test__') {
          return originalSetItem.call(this, key, value);
        }
        // 如果是实际存储 key，抛出 QuotaExceededError
        if (key === storageKey) {
          // DOMException constructor sets the name property automatically
          const error = new DOMException(
            'QuotaExceededError',
            'QuotaExceededError'
          );
          throw error;
        }
        // 其他情况正常执行（如 removeItem 可能调用）
        return originalSetItem.call(this, key, value);
      });

      const mockData: QueueItem[] = [
        {
          id: '1',
          payload: {
            url: '/api/test',
            timestamp: Date.now(),
            priority: 'normal',
          },
          priority: 'normal',
          retryCount: 0,
          lastRetryTime: 0,
          createdAt: Date.now(),
        },
      ];

      const saved = adapter.save(mockData);
      expect(saved).toBe(false);
      // 应该降级到内存模式
      expect(adapter.getStorageMode()).toBe('memory');

      // 恢复
      setItemSpy.mockRestore();
    });

    it('save 时遇到其他错误应该降级', () => {
      // 先创建一个正常的 adapter
      const adapter = new StorageAdapter(storageKey, false);
      expect(adapter.getStorageMode()).toBe('localStorage');

      // Mock localStorage.setItem 抛出错误
      // 注意：save 方法会先调用 isLocalStorageAvailable()，它使用测试 key '__storage_test__'
      // 然后才调用 setItem 保存实际数据，所以需要区分这两个调用
      const originalSetItem = Storage.prototype.setItem;
      const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');

      setItemSpy.mockImplementation(function (
        this: Storage,
        key: string,
        value: string
      ) {
        // 如果是测试 key，正常执行（让 isLocalStorageAvailable 通过）
        if (key === '__storage_test__') {
          return originalSetItem.call(this, key, value);
        }
        // 如果是实际存储 key，抛出错误
        if (key === storageKey) {
          throw new Error('Other storage error');
        }
        // 其他情况正常执行
        return originalSetItem.call(this, key, value);
      });

      const mockData: QueueItem[] = [
        {
          id: '1',
          payload: {
            url: '/api/test',
            timestamp: Date.now(),
            priority: 'normal',
          },
          priority: 'normal',
          retryCount: 0,
          lastRetryTime: 0,
          createdAt: Date.now(),
        },
      ];

      const saved = adapter.save(mockData);
      expect(saved).toBe(false);
      // 应该降级到内存模式
      expect(adapter.getStorageMode()).toBe('memory');

      // 恢复
      setItemSpy.mockRestore();
    });

    it('save 时 localStorage 不可用应该返回 false', () => {
      const adapter = new StorageAdapter(storageKey, false);

      // 模拟 localStorage 在运行时变为不可用
      const originalLocalStorage = window.localStorage;
      Object.defineProperty(window, 'localStorage', {
        value: null,
        writable: true,
        configurable: true,
      });

      const mockData: QueueItem[] = [
        {
          id: '1',
          payload: {
            url: '/api/test',
            timestamp: Date.now(),
            priority: 'normal',
          },
          priority: 'normal',
          retryCount: 0,
          lastRetryTime: 0,
          createdAt: Date.now(),
        },
      ];

      const saved = adapter.save(mockData);
      expect(saved).toBe(false);

      // 恢复
      Object.defineProperty(window, 'localStorage', {
        value: originalLocalStorage,
        writable: true,
        configurable: true,
      });
    });

    it('clear 时遇到错误应该不抛出异常', () => {
      const adapter = new StorageAdapter(storageKey, false);

      const removeItemSpy = jest.spyOn(Storage.prototype, 'removeItem');
      removeItemSpy.mockImplementation(() => {
        throw new Error('Remove failed');
      });

      expect(() => adapter.clear()).not.toThrow();

      removeItemSpy.mockRestore();
    });

    it('clear 时 localStorage 不可用应该不抛出异常', () => {
      const adapter = new StorageAdapter(storageKey, false);

      const originalLocalStorage = window.localStorage;
      Object.defineProperty(window, 'localStorage', {
        value: null,
        writable: true,
        configurable: true,
      });

      expect(() => adapter.clear()).not.toThrow();

      // 恢复
      Object.defineProperty(window, 'localStorage', {
        value: originalLocalStorage,
        writable: true,
        configurable: true,
      });
    });
  });

  describe('debug 模式', () => {
    it('debug 模式下应该输出日志', () => {
      const consoleSpy = jest
        .spyOn(console, 'log')
        .mockImplementation(() => {});

      // 触发降级以产生日志
      const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');
      setItemSpy.mockImplementation(() => {
        throw new Error('Storage error');
      });

      new StorageAdapter('test_debug', true);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
      setItemSpy.mockRestore();
    });

    it('非 debug 模式下不应该输出日志', () => {
      const consoleSpy = jest
        .spyOn(console, 'log')
        .mockImplementation(() => {});

      const adapter = new StorageAdapter('test_no_debug', false);
      adapter.save([]);
      adapter.load();

      // 不应该有日志输出
      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('边界情况', () => {
    it('应该正确处理空数组', () => {
      const saved = adapter.save([]);
      expect(saved).toBe(true);

      const loaded = adapter.load();
      expect(loaded).toEqual([]);
    });

    it('应该正确处理 null 值', () => {
      localStorage.setItem(storageKey, 'null');
      const loaded = adapter.load();
      expect(loaded).toEqual([]);
    });

    it('load 时遇到 JSON 解析错误应该降级并清空', () => {
      localStorage.setItem(storageKey, 'invalid json');

      const adapter = new StorageAdapter(storageKey, false);
      const loaded = adapter.load();

      expect(loaded).toEqual([]);
      expect(adapter.getStorageMode()).toBe('memory');
    });

    it('load 时遇到非数组数据应该返回空数组', () => {
      localStorage.setItem(storageKey, JSON.stringify({ not: 'array' }));

      const adapter = new StorageAdapter(storageKey, false);
      const loaded = adapter.load();

      expect(loaded).toEqual([]);
    });

    it('内存模式下 load 应该返回空数组', () => {
      const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');
      setItemSpy.mockImplementation(() => {
        throw new Error('Storage unavailable');
      });

      const memoryAdapter = new StorageAdapter('test_memory_load', false);
      const loaded = memoryAdapter.load();

      expect(loaded).toEqual([]);
      expect(memoryAdapter.getStorageMode()).toBe('memory');

      setItemSpy.mockRestore();
    });
  });
});
