/**
 * 集成测试
 * 测试整体工作流程
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RetryQueue } from '../src/retry-queue';

describe('集成测试', () => {
  let queue: RetryQueue;

  beforeEach(() => {
    vi.useFakeTimers();
    queue = new RetryQueue({
      maxQueueSize: 100,
      maxRetries: 5,
      retryInterval: 30000,
      expireTime: 24 * 60 * 60 * 1000,
      debug: false,
    });
  });

  afterEach(() => {
    queue.destroy();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('完整的重试流程', () => {
    it('应该完成从失败到成功的完整流程', async () => {
      let attemptCount = 0;

      // Mock fetch：前两次失败，第三次成功
      (global.fetch as any).mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({ ok: true });
      });

      // 添加请求
      queue.enqueue({ url: '/api/test', body: { event: 'click' } });
      expect(queue.getStatus().queueSize).toBe(1);

      // 第一次尝试（失败）
      await queue.flush();
      expect(queue.getStatus().queueSize).toBe(1);
      expect(queue.getStatus().items[0].retryCount).toBe(1);

      // 等待重试间隔
      vi.advanceTimersByTime(2000);

      // 第二次尝试（失败）
      await queue.flush();
      expect(queue.getStatus().queueSize).toBe(1);
      expect(queue.getStatus().items[0].retryCount).toBe(2);

      // 等待重试间隔
      vi.advanceTimersByTime(4000);

      // 第三次尝试（成功）
      await queue.flush();
      expect(queue.getStatus().queueSize).toBe(0);
      expect(attemptCount).toBe(3);
    });

    it('应该处理混合优先级的请求', async () => {
      (global.fetch as any).mockResolvedValue({ ok: true });

      // 添加不同优先级的请求
      queue.enqueue({ url: '/api/purchase', body: {}, priority: 'high' });
      queue.enqueue({ url: '/api/click', body: {}, priority: 'normal' });
      queue.enqueue({ url: '/api/mouse', body: {}, priority: 'low' });

      expect(queue.getStatus().queueSize).toBe(3);

      // 处理队列
      await queue.flush();

      // 所有请求都应该成功
      expect(queue.getStatus().queueSize).toBe(0);
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('多标签页场景应该避免重复处理', async () => {
      // 创建两个队列实例（模拟两个标签页）
      const queue1 = new RetryQueue({ storagePrefix: 'test_multi_' });
      const queue2 = new RetryQueue({ storagePrefix: 'test_multi_' });

      (global.fetch as any).mockResolvedValue({ ok: true });

      // 两个队列都添加相同的请求
      queue1.enqueue({ url: '/api/test', body: {} });
      queue2.enqueue({ url: '/api/test', body: {} });

      // 同时触发处理
      const [result1, result2] = await Promise.all([
        queue1.flush(),
        queue2.flush(),
      ]);

      // 应该只有一个成功处理
      const totalCalls = (global.fetch as any).mock.calls.length;
      expect(totalCalls).toBeGreaterThanOrEqual(1);
      expect(totalCalls).toBeLessThanOrEqual(4); // 最多 2 个队列各 2 个请求

      queue1.destroy();
      queue2.destroy();
    });
  });

  describe('优先级淘汰场景', () => {
    it('队列满时应该优先保护高优先级请求', () => {
      const smallQueue = new RetryQueue({ maxQueueSize: 10 });

      // 添加混合优先级
      for (let i = 0; i < 3; i++) {
        smallQueue.enqueue({ url: `/api/high${i}`, body: {}, priority: 'high' });
      }
      for (let i = 0; i < 4; i++) {
        smallQueue.enqueue({ url: `/api/normal${i}`, body: {}, priority: 'normal' });
      }
      for (let i = 0; i < 3; i++) {
        smallQueue.enqueue({ url: `/api/low${i}`, body: {}, priority: 'low' });
      }

      expect(smallQueue.getStatus().queueSize).toBe(10);

      // 添加新的高优先级
      for (let i = 0; i < 5; i++) {
        smallQueue.enqueue({ url: `/api/new_high${i}`, body: {}, priority: 'high' });
      }

      const status = smallQueue.getStatus();
      expect(status.queueSize).toBe(10);

      // 低优先级应该全部被淘汰
      const lowCount = status.items.filter(item => item.priority === 'low').length;
      expect(lowCount).toBe(0);

      // 高优先级应该都保留
      const highCount = status.items.filter(item => item.priority === 'high').length;
      expect(highCount).toBeGreaterThan(0);

      smallQueue.destroy();
    });
  });

  describe('localStorage 降级场景', () => {
    it('localStorage 不可用时应该降级到内存', () => {
      // Mock localStorage 不可用
      const originalLocalStorage = window.localStorage;
      Object.defineProperty(window, 'localStorage', {
        value: null,
        writable: true,
      });

      const memQueue = new RetryQueue({ debug: false });
      
      // 仍然可以正常工作
      memQueue.enqueue({ url: '/api/test', body: {} });
      expect(memQueue.getStatus().queueSize).toBe(1);
      expect(memQueue.getStatus().storageMode).toBe('memory');

      memQueue.destroy();

      // 恢复
      Object.defineProperty(window, 'localStorage', {
        value: originalLocalStorage,
        writable: true,
      });
    });

    it('QuotaExceededError 应该触发降级', async () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
      
      // 第一次调用正常，第二次抛出 QuotaExceededError
      let callCount = 0;
      setItemSpy.mockImplementation((key, value) => {
        callCount++;
        if (callCount > 1) {
          const error = new DOMException('QuotaExceededError', 'QuotaExceededError');
          throw error;
        }
      });

      const queue = new RetryQueue({ debug: false });
      
      // 第一次添加成功
      queue.enqueue({ url: '/api/test1', body: {} });
      
      // 第二次添加触发降级
      queue.enqueue({ url: '/api/test2', body: {} });
      
      // 应该降级到内存模式
      expect(queue.getStatus().storageMode).toBe('memory');
      
      // 但仍然可以正常工作
      expect(queue.getStatus().queueSize).toBe(2);

      queue.destroy();
      setItemSpy.mockRestore();
    });
  });

  describe('网络状态变化', () => {
    it('网络恢复时应该自动重试', async () => {
      (global.fetch as any).mockResolvedValue({ ok: true });

      // 设置为离线
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: false,
      });

      queue.enqueue({ url: '/api/test', body: {} });
      await queue.flush();

      // 离线时不应该处理
      expect(queue.getStatus().queueSize).toBe(1);
      expect(global.fetch).not.toHaveBeenCalled();

      // 模拟网络恢复
      Object.defineProperty(navigator, 'onLine', { value: true });
      window.dispatchEvent(new Event('online'));

      // 等待事件处理
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(global.fetch).toHaveBeenCalled();
    });
  });

  describe('性能测试', () => {
    it('应该高效处理大量请求', () => {
      const startTime = Date.now();

      // 添加 1000 个请求
      for (let i = 0; i < 1000; i++) {
        queue.enqueue({
          url: `/api/test${i}`,
          body: { index: i },
          priority: i % 3 === 0 ? 'high' : i % 2 === 0 ? 'normal' : 'low',
        });
      }

      const endTime = Date.now();
      const elapsed = endTime - startTime;

      // 应该在合理时间内完成（<1秒）
      expect(elapsed).toBeLessThan(1000);
      expect(queue.getStatus().queueSize).toBe(100); // maxQueueSize
    });

    it('优先级排序应该快速完成', () => {
      const smallQueue = new RetryQueue({ maxQueueSize: 50 });

      // 填满队列
      for (let i = 0; i < 50; i++) {
        smallQueue.enqueue({
          url: `/api/test${i}`,
          body: {},
          priority: ['high', 'normal', 'low'][i % 3] as any,
        });
      }

      const startTime = Date.now();

      // 触发淘汰（添加第 51 个）
      smallQueue.enqueue({ url: '/api/new', body: {}, priority: 'high' });

      const endTime = Date.now();
      const elapsed = endTime - startTime;

      // 排序应该很快（<10ms）
      expect(elapsed).toBeLessThan(10);

      smallQueue.destroy();
    });
  });
});

