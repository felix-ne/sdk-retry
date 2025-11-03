/**
 * SDK 请求重试队列
 * 功能：失败请求本地缓存 + 智能补发
 * 
 * 存储策略：localStorage（优先） → 内存（降级）
 * 淘汰策略：优先级（低→高） + 时间（旧→新）
 * 跨标签页：简单锁机制避免重复上报
 */

import { QueueItem, RequestPayload, RetryQueueOptions, QueueStatus, Priority } from './types';
import { StorageAdapter } from './storage-adapter';

/** 优先级权重（用于排序） */
const PRIORITY_WEIGHT: Record<Priority, number> = {
  low: 1,
  normal: 2,
  high: 3,
};

export class RetryQueue {
  private options: Required<RetryQueueOptions>;
  private queue: QueueItem[] = [];
  private storage: StorageAdapter;
  private isProcessing = false;
  private processingPromise: Promise<void> | null = null; // 跟踪当前处理的 promise
  private currentConcurrent = 0;
  private retryTimer?: number;
  private tabId: string; // 标签页唯一ID
  private lockKey: string; // 跨标签页锁的key

  constructor(options: RetryQueueOptions = {}) {
    this.options = {
      maxQueueSize: options.maxQueueSize ?? 100,
      maxRetries: options.maxRetries ?? 5,
      expireTime: options.expireTime ?? 24 * 60 * 60 * 1000, // 24小时
      retryInterval: options.retryInterval ?? 30 * 1000, // 30秒
      maxConcurrent: options.maxConcurrent ?? 3,
      storagePrefix: options.storagePrefix ?? 'sdk_retry_',
      debug: options.debug ?? false,
    };

    const storageKey = `${this.options.storagePrefix}queue`;
    this.storage = new StorageAdapter(storageKey, this.options.debug);
    
    // 生成当前标签页唯一ID
    this.tabId = this.generateId();
    this.lockKey = `${this.options.storagePrefix}lock`;
    
    this.init();
  }

  /**
   * 初始化
   */
  private init() {
    this.queue = this.storage.load();
    this.cleanExpiredItems();
    this.registerListeners();
    this.startRetryLoop();
    
    this.log('RetryQueue initialized', { 
      queueSize: this.queue.length,
      storageMode: this.storage.getStorageMode(),
    });
  }

  /**
   * 注册浏览器事件监听
   */
  private registerListeners() {
    if (typeof window === 'undefined') {
      return;
    }

    // 网络恢复时立即重试
    window.addEventListener('online', () => {
      this.log('Network online, starting retry');
      this.processQueue();
    });

    // 页面卸载前保存
    window.addEventListener('beforeunload', () => {
      this.storage.save(this.queue);
    });

    // 页面隐藏时保存（适配移动端）
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.storage.save(this.queue);
      } else {
        // 页面重新可见时尝试上报
        this.processQueue();
      }
    });

    // Page Lifecycle API - 页面被冻结前保存（更可靠）
    // 在移动端浏览器中，freeze 比 beforeunload 更可靠
    document.addEventListener('freeze', () => {
      this.log('Page frozen, saving queue');
      this.storage.save(this.queue);
    }, { capture: true });

    // 页面恢复时重试
    document.addEventListener('resume', () => {
      this.log('Page resumed, processing queue');
      this.processQueue();
    }, { capture: true });
  }

  /**
   * 启动定时重试循环
   */
  private startRetryLoop() {
    if (typeof window === 'undefined') {
      return;
    }

    this.retryTimer = window.setInterval(() => {
      if (this.queue.length > 0) {
        this.processQueue();
      }
    }, this.options.retryInterval);
  }

  /**
   * 添加失败请求到队列
   */
  public enqueue(payload: Omit<RequestPayload, 'timestamp'>): boolean {
    // 检查队列是否已满
    if (this.queue.length >= this.options.maxQueueSize) {
      this.log('Queue is full, removing lowest priority item');
      this.removeLowestPriorityItem();
    }

    const priority = payload.priority ?? 'normal';

    const item: QueueItem = {
      id: this.generateId(),
      payload: {
        ...payload,
        timestamp: Date.now(),
        priority,
      },
      priority,
      retryCount: 0,
      lastRetryTime: 0,
      createdAt: Date.now(),
    };

    this.queue.push(item);
    this.storage.save(this.queue);
    this.log('Item enqueued', { 
      id: item.id, 
      priority: item.priority,
      queueSize: this.queue.length 
    });

    // 立即尝试处理（可能网络已恢复）
    this.processQueue();

    return true;
  }

  /**
   * 按优先级淘汰：先删除优先级最低的，再删除时间最旧的
   */
  private removeLowestPriorityItem() {
    if (this.queue.length === 0) {
      return;
    }

    // 按优先级（低→高）和时间（旧→新）排序
    this.queue.sort((a, b) => {
      const priorityDiff = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
      if (priorityDiff !== 0) {
        return priorityDiff; // 优先级低的排前面
      }
      return a.createdAt - b.createdAt; // 时间旧的排前面
    });

    // 移除第一个（优先级最低且最旧的）
    const removed = this.queue.shift();
    if (removed) {
      this.log('Removed lowest priority item', { 
        id: removed.id, 
        priority: removed.priority,
        age: Date.now() - removed.createdAt 
      });
    }
  }

  /**
   * 处理队列（尝试重新上报）
   */
  private async processQueue() {
    // 如果正在处理，等待当前处理完成
    if (this.isProcessing && this.processingPromise) {
      this.log('Already processing, waiting for completion');
      return this.processingPromise;
    }

    // 没有网络连接时跳过
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.log('Offline, skipping queue processing');
      return;
    }

    // 队列为空
    if (this.queue.length === 0) {
      this.log('Queue is empty, skipping');
      return;
    }

    // 尝试获取跨标签页锁
    if (!this.tryAcquireLock()) {
      this.log('Another tab is processing, skipping');
      return;
    }

    this.isProcessing = true;
    this.log('Processing queue', { queueSize: this.queue.length, tabId: this.tabId });

    // 创建并跟踪当前处理的 promise
    this.processingPromise = (async () => {
      try {
        // 清理过期项
        this.cleanExpiredItems();

      // 并发控制：一次最多处理 maxConcurrent 个
      const promises: Promise<void>[] = [];

      for (const item of this.queue) {
        if (this.currentConcurrent >= this.options.maxConcurrent) {
          break;
        }

        // 检查是否应该重试（避免过于频繁）
        // 新项目（lastRetryTime === 0）直接处理
        if (item.lastRetryTime > 0) {
          const timeSinceLastRetry = Date.now() - item.lastRetryTime;
          const minWaitTime = Math.min(
            this.options.retryInterval,
            1000 * Math.pow(2, item.retryCount) // 指数退避
          );

          if (timeSinceLastRetry < minWaitTime) {
            continue;
          }
        }

        this.currentConcurrent++;
        promises.push(this.retryItem(item));
      }

        await Promise.allSettled(promises);
        this.log('All promises settled', { queueSize: this.queue.length });
      } finally {
        this.isProcessing = false;
        this.currentConcurrent = 0;
        this.storage.save(this.queue); // 保存处理后的状态
        this.releaseLock(); // 释放锁
        this.processingPromise = null; // 清除 promise 跟踪
        this.log('processQueue completed', { queueSize: this.queue.length });
      }
    })();

    // 返回 processingPromise 以便 await
    return this.processingPromise;
  }

  /**
   * 尝试获取跨标签页锁（简单实现）
   */
  private tryAcquireLock(): boolean {
    if (typeof window === 'undefined' || !window.localStorage) {
      return true; // 非浏览器环境或内存模式，直接返回 true
    }

    try {
      const lock = localStorage.getItem(this.lockKey);
      const now = Date.now();

      if (lock) {
        const { tabId, timestamp } = JSON.parse(lock);
        
        // 锁超过 5 秒自动过期（防止标签页崩溃导致死锁）
        if (now - timestamp < 5000 && tabId !== this.tabId) {
          return false; // 其他标签页持有锁
        }
      }

      // 获取锁
      localStorage.setItem(this.lockKey, JSON.stringify({
        tabId: this.tabId,
        timestamp: now,
      }));
      return true;
    } catch {
      return true; // 出错时也返回 true，避免阻塞
    }
  }

  /**
   * 释放跨标签页锁
   */
  private releaseLock() {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }

    try {
      const lock = localStorage.getItem(this.lockKey);
      if (lock) {
        const { tabId } = JSON.parse(lock);
        // 只释放自己持有的锁
        if (tabId === this.tabId) {
          localStorage.removeItem(this.lockKey);
        }
      }
    } catch {
      // 忽略错误
    }
  }

  /**
   * 重试单个请求
   */
  private async retryItem(item: QueueItem): Promise<void> {
    this.log('Retrying item', { id: item.id, retryCount: item.retryCount });

    try {
      const { url, method = 'POST', headers, body } = item.payload;

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (response.ok) {
        // 成功：从队列中移除
        this.removeItem(item.id);
        this.log('Item retry succeeded', { id: item.id });
      } else {
        // 失败：增加重试计数
        this.incrementRetryCount(item.id);
        this.log('Item retry failed', { 
          id: item.id, 
          status: response.status,
          retryCount: item.retryCount + 1 
        });
      }
    } catch (error) {
      // 网络错误：增加重试计数
      this.incrementRetryCount(item.id);
      this.log('Item retry error', { id: item.id, error });
    } finally {
      this.currentConcurrent--;
    }
  }

  /**
   * 清理过期和超过重试次数的数据
   */
  private cleanExpiredItems() {
    const now = Date.now();
    const originalLength = this.queue.length;

    this.queue = this.queue.filter((item) => {
      // 过期检查
      if (now - item.createdAt > this.options.expireTime) {
        this.log('Item expired', { id: item.id });
        return false;
      }

      // 重试次数检查
      if (item.retryCount >= this.options.maxRetries) {
        this.log('Item exceeded max retries', { id: item.id, retryCount: item.retryCount });
        return false;
      }

      return true;
    });

    if (this.queue.length !== originalLength) {
      this.storage.save(this.queue);
      this.log('Cleaned expired items', { 
        removed: originalLength - this.queue.length,
        remaining: this.queue.length 
      });
    }
  }

  /**
   * 从队列中移除项
   */
  private removeItem(id: string) {
    const index = this.queue.findIndex((item) => item.id === id);
    if (index !== -1) {
      this.queue.splice(index, 1);
      // 立即保存，避免丢失状态
      this.storage.save(this.queue);
    }
  }

  /**
   * 增加重试计数
   */
  private incrementRetryCount(id: string) {
    const item = this.queue.find((item) => item.id === id);
    if (item) {
      item.retryCount++;
      item.lastRetryTime = Date.now();

      // 如果达到最大重试次数，标记为失败
      if (item.retryCount >= this.options.maxRetries) {
        this.removeItem(id);
        this.log('Item abandoned after max retries', { id, retryCount: item.retryCount });
      } else {
        // 立即保存，避免丢失重试计数
        this.storage.save(this.queue);
      }
    }
  }

  /**
   * 生成唯一ID
   */
  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 获取队列状态
   */
  public getStatus(): QueueStatus {
    return {
      queueSize: this.queue.length,
      isProcessing: this.isProcessing,
      currentConcurrent: this.currentConcurrent,
      storageMode: this.storage.getStorageMode(),
      items: this.queue.map((item) => ({
        id: item.id,
        url: item.payload.url,
        priority: item.priority,
        retryCount: item.retryCount,
        age: Date.now() - item.createdAt,
      })),
    };
  }

  /**
   * 手动触发队列处理
   */
  public flush() {
    return this.processQueue();
  }

  /**
   * 清空队列
   */
  public clear() {
    this.queue = [];
    this.storage.clear();
    this.log('Queue cleared');
  }

  /**
   * 销毁队列
   */
  public destroy() {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
    }
    this.releaseLock(); // 释放锁
    this.storage.save(this.queue);
    this.log('RetryQueue destroyed');
  }

  /**
   * 调试日志
   */
  private log(message: string, data?: any) {
    if (this.options.debug) {
      console.log(`[RetryQueue] ${message}`, data || '');
    }
  }
}
