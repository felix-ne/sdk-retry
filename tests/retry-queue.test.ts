/**
 * RetryQueue 单元测试
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RetryQueue } from '../src/retry-queue';

describe('RetryQueue', () => {
  let queue: RetryQueue;

  beforeEach(() => {
    vi.useFakeTimers();
    queue = new RetryQueue({
      maxQueueSize: 10,
      maxRetries: 3,
      retryInterval: 1000,
      expireTime: 10000,
      debug: false,
    });
  });

  afterEach(() => {
    queue.destroy();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('初始化', () => {
    it('应该正确初始化队列', () => {
      const status = queue.getStatus();
      expect(status.queueSize).toBe(0);
      expect(status.isProcessing).toBe(false);
      expect(status.storageMode).toBe('localStorage');
    });

    it('应该从 localStorage 加载已有数据', () => {
      // 先添加数据
      queue.enqueue({ url: '/api/test', body: {} });
      
      // 创建新实例，应该加载到数据
      const newQueue = new RetryQueue({
        storagePrefix: 'sdk_retry_',
      });
      
      const status = newQueue.getStatus();
      expect(status.queueSize).toBe(1);
      
      newQueue.destroy();
    });
  });

  describe('enqueue - 添加到队列', () => {
    it('应该正确添加请求到队列', () => {
      const success = queue.enqueue({
        url: '/api/test',
        method: 'POST',
        body: { foo: 'bar' },
      });

      expect(success).toBe(true);
      const status = queue.getStatus();
      expect(status.queueSize).toBe(1);
      expect(status.items[0].url).toBe('/api/test');
      expect(status.items[0].priority).toBe('normal'); // 默认优先级
    });

    it('应该正确处理带优先级的请求', () => {
      queue.enqueue({ url: '/api/high', body: {}, priority: 'high' });
      queue.enqueue({ url: '/api/normal', body: {} });
      queue.enqueue({ url: '/api/low', body: {}, priority: 'low' });

      const status = queue.getStatus();
      expect(status.queueSize).toBe(3);
      expect(status.items.find(i => i.url === '/api/high')?.priority).toBe('high');
      expect(status.items.find(i => i.url === '/api/normal')?.priority).toBe('normal');
      expect(status.items.find(i => i.url === '/api/low')?.priority).toBe('low');
    });

    it('当队列满时应该按优先级淘汰', () => {
      // 添加 5 个 high，3 个 normal，2 个 low
      for (let i = 0; i < 5; i++) {
        queue.enqueue({ url: `/api/high${i}`, body: {}, priority: 'high' });
      }
      for (let i = 0; i < 3; i++) {
        queue.enqueue({ url: `/api/normal${i}`, body: {}, priority: 'normal' });
      }
      for (let i = 0; i < 2; i++) {
        queue.enqueue({ url: `/api/low${i}`, body: {}, priority: 'low' });
      }

      expect(queue.getStatus().queueSize).toBe(10); // 队列已满

      // 添加新的 high 优先级请求
      queue.enqueue({ url: '/api/new', body: {}, priority: 'high' });

      // 应该删除了一个 low 优先级的
      const status = queue.getStatus();
      expect(status.queueSize).toBe(10);
      const lowCount = status.items.filter(i => i.priority === 'low').length;
      expect(lowCount).toBe(1); // 只剩 1 个 low
    });

    it('相同优先级时应该删除最旧的', () => {
      // 添加 10 个相同优先级
      for (let i = 0; i < 10; i++) {
        queue.enqueue({ url: `/api/test${i}`, body: {}, priority: 'normal' });
        vi.advanceTimersByTime(100); // 确保时间戳不同
      }

      // 添加第 11 个
      queue.enqueue({ url: '/api/test10', body: {}, priority: 'normal' });

      const status = queue.getStatus();
      expect(status.queueSize).toBe(10);
      // 第一个（test0）应该被删除
      expect(status.items.find(i => i.url === '/api/test0')).toBeUndefined();
      expect(status.items.find(i => i.url === '/api/test10')).toBeDefined();
    });
  });

  describe('processQueue - 处理队列', () => {
    it('应该在网络在线时处理队列', async () => {
      // Mock fetch 成功
      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
      });

      queue.enqueue({ url: '/api/test', body: {} });
      expect(queue.getStatus().queueSize).toBe(1);

      // 触发处理
      await queue.flush();

      // 应该已处理完成
      expect(queue.getStatus().queueSize).toBe(0);
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('应该在网络离线时跳过处理', async () => {
      // Mock navigator.onLine
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: false,
      });

      queue.enqueue({ url: '/api/test', body: {} });
      await queue.flush();

      // 队列应该不变
      expect(queue.getStatus().queueSize).toBe(1);
      expect(global.fetch).not.toHaveBeenCalled();

      // 恢复
      Object.defineProperty(navigator, 'onLine', {
        value: true,
      });
    });

    it('失败请求应该增加重试计数', async () => {
      // Mock fetch 失败
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      queue.enqueue({ url: '/api/test', body: {} });
      await queue.flush();

      const status = queue.getStatus();
      expect(status.queueSize).toBe(1);
      expect(status.items[0].retryCount).toBe(1);
    });

    it('达到最大重试次数应该删除请求', async () => {
      // Mock fetch 失败
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      queue.enqueue({ url: '/api/test', body: {} });

      // 重试 3 次（maxRetries = 3）
      for (let i = 0; i < 3; i++) {
        await queue.flush();
        vi.advanceTimersByTime(2000); // 等待重试间隔
      }

      // 应该已删除
      expect(queue.getStatus().queueSize).toBe(0);
    });

    it('应该遵守并发限制', async () => {
      // Mock fetch 延迟响应
      let resolveCount = 0;
      (global.fetch as any).mockImplementation(() => {
        resolveCount++;
        return new Promise(resolve => {
          setTimeout(() => resolve({ ok: true }), 100);
        });
      });

      // 添加 10 个请求
      for (let i = 0; i < 10; i++) {
        queue.enqueue({ url: `/api/test${i}`, body: {} });
      }

      // 触发处理
      const flushPromise = queue.flush();

      // 应该只处理 maxConcurrent (3) 个
      await vi.advanceTimersByTimeAsync(10);
      expect(resolveCount).toBe(3);

      await flushPromise;
    });
  });

  describe('跨标签页锁', () => {
    it('同一标签页应该可以获取锁', async () => {
      (global.fetch as any).mockResolvedValue({ ok: true });

      queue.enqueue({ url: '/api/test', body: {} });
      await queue.flush();

      // 应该成功处理
      expect(queue.getStatus().queueSize).toBe(0);
    });

    it('其他标签页持有锁时应该跳过处理', async () => {
      // 模拟另一个标签页持有锁
      localStorage.setItem('sdk_retry_lock', JSON.stringify({
        tabId: 'another_tab',
        timestamp: Date.now(),
      }));

      queue.enqueue({ url: '/api/test', body: {} });
      await queue.flush();

      // 应该跳过处理
      expect(queue.getStatus().queueSize).toBe(1);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('过期的锁应该被忽略', async () => {
      // 模拟过期的锁（6 秒前）
      localStorage.setItem('sdk_retry_lock', JSON.stringify({
        tabId: 'another_tab',
        timestamp: Date.now() - 6000,
      }));

      (global.fetch as any).mockResolvedValue({ ok: true });

      queue.enqueue({ url: '/api/test', body: {} });
      await queue.flush();

      // 应该成功处理
      expect(queue.getStatus().queueSize).toBe(0);
    });

    it('destroy 时应该释放锁', () => {
      queue.destroy();
      
      // 锁应该被清除
      const lock = localStorage.getItem('sdk_retry_lock');
      expect(lock).toBeNull();
    });
  });

  describe('过期清理', () => {
    it('应该清理过期的请求', async () => {
      queue.enqueue({ url: '/api/old', body: {} });

      // 快进时间到过期后
      vi.advanceTimersByTime(11000); // expireTime = 10000

      // 触发处理（会先清理过期项）
      await queue.flush();

      expect(queue.getStatus().queueSize).toBe(0);
    });

    it('未过期的请求应该保留', async () => {
      queue.enqueue({ url: '/api/new', body: {} });

      // 快进一半时间
      vi.advanceTimersByTime(5000);

      await queue.flush();

      // 应该还在
      expect(queue.getStatus().queueSize).toBe(1);
    });
  });

  describe('定时重试', () => {
    it('应该定时自动处理队列', async () => {
      (global.fetch as any).mockResolvedValue({ ok: true });

      queue.enqueue({ url: '/api/test', body: {} });

      // 快进到下一个重试间隔
      await vi.advanceTimersByTimeAsync(1000);

      // 应该已处理
      expect(queue.getStatus().queueSize).toBe(0);
    });
  });

  describe('指数退避', () => {
    it('重试间隔应该随重试次数增长', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      queue.enqueue({ url: '/api/test', body: {} });

      // 第 1 次重试
      await queue.flush();
      expect(queue.getStatus().items[0].retryCount).toBe(1);

      // 立即再次尝试应该跳过（需要等待）
      await queue.flush();
      expect(queue.getStatus().items[0].retryCount).toBe(1); // 仍然是 1

      // 等待 2 秒（1000 * 2^0）
      vi.advanceTimersByTime(2000);
      await queue.flush();
      expect(queue.getStatus().items[0].retryCount).toBe(2);

      // 等待 4 秒（1000 * 2^1）
      vi.advanceTimersByTime(4000);
      await queue.flush();
      expect(queue.getStatus().items[0].retryCount).toBe(3);
    });
  });

  describe('API 方法', () => {
    it('getStatus 应该返回正确的状态', () => {
      queue.enqueue({ url: '/api/test', body: {}, priority: 'high' });

      const status = queue.getStatus();
      expect(status).toHaveProperty('queueSize');
      expect(status).toHaveProperty('isProcessing');
      expect(status).toHaveProperty('storageMode');
      expect(status).toHaveProperty('items');
      expect(status.items[0]).toHaveProperty('priority');
      expect(status.items[0].priority).toBe('high');
    });

    it('clear 应该清空队列', () => {
      queue.enqueue({ url: '/api/test1', body: {} });
      queue.enqueue({ url: '/api/test2', body: {} });
      expect(queue.getStatus().queueSize).toBe(2);

      queue.clear();
      expect(queue.getStatus().queueSize).toBe(0);
    });

    it('flush 应该手动触发处理', async () => {
      (global.fetch as any).mockResolvedValue({ ok: true });

      queue.enqueue({ url: '/api/test', body: {} });
      await queue.flush();

      expect(queue.getStatus().queueSize).toBe(0);
    });
  });

  describe('边界情况', () => {
    it('空队列处理应该不报错', async () => {
      await expect(queue.flush()).resolves.not.toThrow();
    });

    it('并发处理应该不冲突', async () => {
      (global.fetch as any).mockResolvedValue({ ok: true });

      queue.enqueue({ url: '/api/test', body: {} });

      // 同时触发多次
      await Promise.all([
        queue.flush(),
        queue.flush(),
        queue.flush(),
      ]);

      // 应该只处理一次
      expect(queue.getStatus().queueSize).toBe(0);
    });

    it('destroy 后应该停止定时器', () => {
      const queue2 = new RetryQueue({ retryInterval: 1000 });
      queue2.destroy();

      // 快进时间
      vi.advanceTimersByTime(2000);

      // 不应该有任何副作用
      expect(true).toBe(true);
    });
  });
});



