/**
 * StorageAdapter 单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
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
          payload: { url: '/api/test', timestamp: Date.now() },
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
          payload: { url: '/api/test', timestamp: Date.now() },
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
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
      setItemSpy.mockImplementation(() => {
        const error = new DOMException('QuotaExceededError', 'QuotaExceededError');
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
          payload: { url: '/api/test', timestamp: Date.now() },
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
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
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
          payload: { url: '/api/test2', timestamp: Date.now() },
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
        payload: { url: `/api/test${i}`, timestamp: Date.now() },
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
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
      setItemSpy.mockImplementation(() => {
        throw new Error('Access denied');
      });

      const adapter = new StorageAdapter('test2', false);
      expect(adapter.getStorageMode()).toBe('memory');

      setItemSpy.mockRestore();
    });
  });
});



